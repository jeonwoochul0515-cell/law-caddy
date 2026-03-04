"""
Step 1: 대한법률구조공단 법률서식 수집 → Supabase legal_forms 테이블
출처: https://www.klac.or.kr/legalinfo/legalFrm.do
- 총 2,143건 서식 (HWP 파일)
- 폼 기반 페이지네이션 (POST)
- 서식 제목 + 구분(카테고리)를 수집하여 저장
"""

import time
import json
import re
import requests
from bs4 import BeautifulSoup
from tqdm import tqdm
from config import SUPABASE_URL, SUPABASE_KEY

BASE_URL = "https://www.klac.or.kr"
LIST_URL = f"{BASE_URL}/legalinfo/legalFrm.do"

# 바로보기 URL (synapDocView)
SYNAP_BASE = "https://support.klac.or.kr"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Referer": LIST_URL,
}

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# 법률구조공단 서식 카테고리 탭
TABS = [
    {"name": "전체", "code": ""},
    {"name": "민사", "code": "10"},
    {"name": "형사", "code": "20"},
    {"name": "가사", "code": "30"},
    {"name": "행정", "code": "40"},
    {"name": "노동", "code": "50"},
    {"name": "기타", "code": "60"},
]


def fetch_page(page: int = 1, tab_code: str = "") -> tuple[list[dict], int]:
    """페이지별 서식 목록 조회 (POST 방식)"""
    data = {
        "pageIndex": str(page),
        "searchCondition": "",
        "searchKeyword": "",
        "tabCode": tab_code,
    }

    try:
        resp = requests.post(LIST_URL, data=data, headers=HEADERS, timeout=30)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        print(f"  페이지 {page} 요청 실패: {e}")
        return [], 0

    forms = []

    # 테이블에서 서식 추출 - 여러 셀렉터 시도
    rows = soup.select("table tbody tr")
    if not rows:
        rows = soup.select("tr")

    for row in rows:
        cols = row.select("td")
        if len(cols) < 2:
            continue

        # 카테고리 (첫 번째 컬럼)
        category = cols[0].get_text(strip=True)

        # 서식 제목 (두 번째 컬럼)
        title_col = cols[1] if len(cols) > 1 else cols[0]
        title = title_col.get_text(strip=True)

        if not title or len(title) < 2:
            continue

        # 다운로드 링크 추출
        download_url = ""
        for a_tag in row.select("a"):
            href = a_tag.get("href", "")
            if "FileDown" in href or "fms" in href:
                if href.startswith("/"):
                    download_url = SYNAP_BASE + href
                else:
                    download_url = href
                break

        # synapDocView 바로보기 링크
        preview_url = ""
        for a_tag in row.select("a"):
            onclick = a_tag.get("onclick", "")
            if "synapDocView" in onclick:
                # synapDocView('id', 'url') 에서 URL 추출
                match = re.search(r"synapDocView\([^,]+,\s*'([^']+)'", onclick)
                if match:
                    preview_url = match.group(1)
                    if preview_url.startswith("/"):
                        preview_url = SYNAP_BASE + preview_url
                break

        forms.append({
            "title": title,
            "case_category": category if category else "기타",
            "form_type": classify_form_type(title),
            "download_url": download_url,
            "preview_url": preview_url,
            "source": "법률구조공단",
        })

    # 총 건수 추출
    total_count = 0
    for text in soup.stripped_strings:
        match = re.search(r"총\s*(\d[\d,]*)\s*건", text)
        if match:
            total_count = int(match.group(1).replace(",", ""))
            break

    if total_count == 0:
        # 페이지네이션에서 추정
        page_links = soup.select("a[onclick*='linkPage']")
        for link in page_links:
            match = re.search(r"(\d+)", link.get("onclick", ""))
            if match:
                total_count = max(total_count, int(match.group(1)) * 10)

    total_pages = max(1, (total_count + 9) // 10)

    return forms, total_pages


def fetch_preview_text(url: str) -> str:
    """synapDocView 바로보기에서 텍스트 추출"""
    if not url:
        return ""

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")

        # 문서 뷰어 본문 추출
        for selector in [".synap_doc_viewer", "#docViewer", ".viewer_content",
                         ".doc_content", "#content", "body"]:
            el = soup.select_one(selector)
            if el and len(el.get_text(strip=True)) > 30:
                for tag in el.select("script, style, nav, header, footer"):
                    tag.decompose()
                return el.get_text("\n", strip=True)[:10000]
        return ""
    except Exception:
        return ""


def classify_form_type(title: str) -> str:
    """제목에서 문서 유형 추출"""
    types = {
        "소장": "소장", "답변서": "답변서", "준비서면": "준비서면",
        "내용증명": "내용증명", "고소장": "고소장", "고발장": "고발장",
        "지급명령": "지급명령신청서", "가압류": "가압류신청서",
        "가처분": "가처분신청서", "합의서": "합의서", "계약서": "계약서",
        "위임장": "위임장", "진술서": "진술서", "탄원서": "탄원서",
        "항소": "항소장", "상고": "상고장", "이의신청": "이의신청서",
        "조정신청": "조정신청서", "반소장": "반소장",
        "지급명령신청": "지급명령신청서", "신청서": "신청서",
    }
    for keyword, form_type in types.items():
        if keyword in title:
            return form_type
    return "기타"


def upload_to_supabase(forms: list[dict]):
    """Supabase legal_forms 테이블에 업로드"""
    url = f"{SUPABASE_URL}/rest/v1/legal_forms"
    success = 0
    errors = 0

    for i in range(0, len(forms), 50):
        batch = forms[i:i+50]
        rows = []
        for f in batch:
            # 내용 구성: 제목 + 카테고리 + 미리보기 텍스트
            content = f.get("preview_text", "")
            if not content:
                content = f["title"]

            rows.append({
                "form_type": f["form_type"],
                "case_category": f["case_category"],
                "title": f["title"],
                "content": content,
                "source": "법률구조공단",
            })

        resp = requests.post(url, headers=SUPABASE_HEADERS, json=rows, timeout=30)
        if resp.status_code in (200, 201):
            success += len(rows)
        else:
            errors += len(rows)
            print(f"  업로드 에러: {resp.status_code} - {resp.text[:200]}")

    print(f"업로드 완료: 성공 {success}건, 실패 {errors}건")
    return success


def main():
    print("=" * 60)
    print("법률구조공단 법률서식 수집 시작")
    print("=" * 60)

    all_forms = []

    # 1단계: 전체 목록 수집
    print("\n[1/3] 서식 목록 수집 중...")

    # 먼저 1페이지로 총 건수 파악
    first_page, total_pages = fetch_page(1)

    if first_page:
        all_forms.extend(first_page)
        print(f"  1페이지: {len(first_page)}건, 예상 총 페이지: {total_pages}")
    else:
        # GET 방식 시도
        print("  POST 실패, GET 방식 시도...")
        try:
            resp = requests.get(LIST_URL, headers=HEADERS, timeout=30)
            resp.encoding = "utf-8"
            soup = BeautifulSoup(resp.text, "lxml")

            # 모든 a태그에서 서식 정보 추출
            for a_tag in soup.select("a"):
                title = a_tag.get_text(strip=True)
                href = a_tag.get("href", "")
                onclick = a_tag.get("onclick", "")

                # FileDown 링크가 있는 행의 서식
                if "FileDown" in href and title and len(title) > 3:
                    # 부모 tr에서 카테고리 추출
                    parent_tr = a_tag.find_parent("tr")
                    category = ""
                    if parent_tr:
                        first_td = parent_tr.select_one("td")
                        if first_td:
                            category = first_td.get_text(strip=True)

                    download_url = href
                    if href.startswith("/"):
                        download_url = SYNAP_BASE + href

                    all_forms.append({
                        "title": title,
                        "case_category": category or "기타",
                        "form_type": classify_form_type(title),
                        "download_url": download_url,
                        "source": "법률구조공단",
                    })

            # 텍스트에서 서식 제목 패턴 추출 (폴백)
            if not all_forms:
                text = soup.get_text()
                # "소장", "답변서" 등이 포함된 줄 추출
                for line in text.split("\n"):
                    line = line.strip()
                    if any(kw in line for kw in ["소장", "답변서", "준비서면", "고소장", "내용증명",
                                                  "신청서", "계약서", "합의서", "청구의 소"]):
                        if 5 < len(line) < 100:
                            all_forms.append({
                                "title": line,
                                "case_category": "기타",
                                "form_type": classify_form_type(line),
                                "source": "법률구조공단",
                            })

        except Exception as e:
            print(f"  GET 방식도 실패: {e}")

    if not all_forms:
        print("  서식 수집 실패. helplaw24 사이트 시도...")
        all_forms = fetch_from_helplaw24()

    if not first_page:
        pass
    else:
        # 나머지 페이지 수집
        for page in tqdm(range(2, total_pages + 1), desc="  목록 수집"):
            try:
                forms, _ = fetch_page(page)
                all_forms.extend(forms)
                time.sleep(0.3)
            except Exception as e:
                print(f"  {page}페이지 에러: {e}")

    # 중복 제거
    seen = set()
    unique = []
    for f in all_forms:
        if f["title"] not in seen:
            seen.add(f["title"])
            unique.append(f)
    all_forms = unique

    print(f"\n  총 {len(all_forms)}건 서식 수집")

    # 2단계: 바로보기 텍스트 추출 (가능한 경우)
    print("\n[2/3] 미리보기 텍스트 추출 중...")
    preview_count = 0
    for form in tqdm(all_forms, desc="  미리보기"):
        if form.get("preview_url"):
            text = fetch_preview_text(form["preview_url"])
            if text:
                form["preview_text"] = text
                preview_count += 1
            time.sleep(0.2)

    print(f"  미리보기 텍스트 추출: {preview_count}건")

    # 3단계: 업로드
    print("\n[3/3] Supabase 업로드 중...")
    count = upload_to_supabase(all_forms)

    # 백업
    backup_forms = [{k: v for k, v in f.items() if k != "preview_text"} for f in all_forms]
    with open("legal_forms_backup.json", "w", encoding="utf-8") as f:
        json.dump(backup_forms, f, ensure_ascii=False, indent=2)
    print(f"백업 파일: legal_forms_backup.json")

    print(f"\n완료! {count}건 업로드")


def fetch_from_helplaw24() -> list[dict]:
    """법률구조서비스 플랫폼에서 서식 수집 (폴백)"""
    url = "https://www.helplaw24.go.kr/statuteinfo/template/korea/list"
    forms = []

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")

        for a_tag in soup.select("a"):
            title = a_tag.get_text(strip=True)
            if title and len(title) > 3 and any(kw in title for kw in
                ["소장", "답변서", "준비서면", "고소장", "내용증명", "신청서",
                 "계약서", "합의서", "청구", "고발장", "탄원서", "진술서"]):
                forms.append({
                    "title": title,
                    "case_category": "기타",
                    "form_type": classify_form_type(title),
                    "source": "법률구조서비스플랫폼",
                })

        print(f"  helplaw24에서 {len(forms)}건 수집")
    except Exception as e:
        print(f"  helplaw24 실패: {e}")

    return forms


if __name__ == "__main__":
    main()
