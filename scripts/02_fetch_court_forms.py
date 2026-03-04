"""
Step 2: 법원 전자소송 양식모음 수집 → Supabase legal_forms 테이블
출처: https://ecfs.scourt.go.kr/psp/index.on?m=PSP720M24
      https://help.scourt.go.kr/nm/minwon/doc/DocListAction.work
"""

import time
import json
import re
import requests
from bs4 import BeautifulSoup
from tqdm import tqdm
from config import SUPABASE_URL, SUPABASE_KEY

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "ko-KR,ko;q=0.9",
}

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# 법원 민원안내 양식모음 URL
MINWON_URL = "https://help.scourt.go.kr/nm/minwon/doc/DocListAction.work"

# 전자소송 양식모음 URL
ECFS_URL = "https://ecfs.scourt.go.kr/psp/index.on"

# 카테고리별 minGubun 값
ECFS_CATEGORIES = {
    "민사": "a",
    "가사": "b",
    "행정": "c",
    "신청": "d",
    "집행": "e",
    "비송": "f",
    "도산": "g",
}


def fetch_minwon_forms(page: int = 1, category: str = "") -> tuple[list[dict], int]:
    """법원 전자민원센터 양식 목록 조회"""
    params = {
        "pageIndex": page,
        "pageSize": 20,
        "topCode": category,
    }

    try:
        resp = requests.get(MINWON_URL, params=params, headers=HEADERS, timeout=30)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        print(f"  요청 실패: {e}")
        return [], 0

    forms = []
    rows = soup.select("table tbody tr")

    for row in rows:
        cols = row.select("td")
        if len(cols) < 2:
            continue

        link = row.select_one("a")
        if not link:
            continue

        title = link.get_text(strip=True)
        href = link.get("href", "")
        onclick = link.get("onclick", "")

        # 카테고리 추출
        cat_text = cols[0].get_text(strip=True) if len(cols) > 0 else ""

        forms.append({
            "title": title,
            "href": href,
            "onclick": onclick,
            "case_category": cat_text or "기타",
        })

    # 총 건수 추출
    total_count = 0
    count_text = soup.select_one(".total, .count, .result_count")
    if count_text:
        match = re.search(r"(\d+)", count_text.get_text())
        if match:
            total_count = int(match.group(1))

    total_pages = max(1, (total_count + 19) // 20)

    return forms, total_pages


def fetch_ecfs_forms() -> list[dict]:
    """전자소송포털 양식모음 수집"""
    all_forms = []

    for cat_name, cat_code in ECFS_CATEGORIES.items():
        print(f"  {cat_name} 양식 수집 중...")
        params = {
            "m": "PSP720M24",
            "minGubun": cat_code,
        }

        try:
            resp = requests.get(ECFS_URL, params=params, headers=HEADERS, timeout=30)
            resp.encoding = "utf-8"
            soup = BeautifulSoup(resp.text, "lxml")

            rows = soup.select("table tbody tr, .list_table tbody tr, ul.form_list li")
            for row in rows:
                link = row.select_one("a")
                if not link:
                    continue

                title = link.get_text(strip=True)
                if not title or len(title) < 2:
                    continue

                href = link.get("href", "")
                onclick = link.get("onclick", "")

                all_forms.append({
                    "title": title,
                    "case_category": cat_name,
                    "href": href,
                    "onclick": onclick,
                    "source": "전자소송포털",
                })

            time.sleep(0.5)
        except Exception as e:
            print(f"  {cat_name} 에러: {e}")

    return all_forms


def get_form_detail_minwon(href_or_onclick: str) -> str:
    """양식 상세 내용 조회"""
    url = ""
    if href_or_onclick.startswith("http"):
        url = href_or_onclick
    elif href_or_onclick.startswith("/"):
        url = "https://help.scourt.go.kr" + href_or_onclick
    else:
        return ""

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")

        # 본문 영역 추출
        for selector in [".view_cont", ".board_view", "#contents", ".content", "article"]:
            content = soup.select_one(selector)
            if content and len(content.get_text(strip=True)) > 30:
                # 스크립트/스타일 제거
                for tag in content.select("script, style"):
                    tag.decompose()
                return content.get_text("\n", strip=True)[:10000]

        return ""
    except Exception as e:
        return ""


def classify_form_type(title: str) -> str:
    """제목에서 문서 유형 추출"""
    types = {
        "소장": "소장", "답변서": "답변서", "준비서면": "준비서면",
        "내용증명": "내용증명", "고소장": "고소장", "지급명령": "지급명령신청서",
        "가압류": "가압류신청서", "가처분": "가처분신청서", "항소": "항소장",
        "상고": "상고장", "이의": "이의신청서", "조정": "조정신청서",
        "강제집행": "강제집행신청서", "회생": "회생신청서", "파산": "파산신청서",
        "위임장": "위임장", "진술서": "진술서", "신청서": "신청서",
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
            content = f.get("content", "")
            if not content or len(content) < 20:
                # 내용이 없으면 제목만이라도 저장
                content = f["title"]

            rows.append({
                "form_type": classify_form_type(f["title"]),
                "case_category": f.get("case_category", "기타"),
                "title": f["title"],
                "content": content,
                "source": f.get("source", "법원 전자민원센터"),
            })

        resp = requests.post(url, headers=SUPABASE_HEADERS, json=rows, timeout=30)
        if resp.status_code in (200, 201):
            success += len(rows)
        else:
            errors += len(rows)
            print(f"  업로드 에러: {resp.status_code} - {resp.text[:200]}")

    print(f"업로드 완료: 성공 {success}건, 실패 {errors}건")


def main():
    print("=" * 60)
    print("법원 양식모음 수집 시작")
    print("=" * 60)

    all_forms = []

    # 1. 전자소송포털 양식
    print("\n[1/3] 전자소송포털 양식 수집...")
    ecfs_forms = fetch_ecfs_forms()
    all_forms.extend(ecfs_forms)
    print(f"  전자소송포털: {len(ecfs_forms)}건")

    # 2. 법원 전자민원센터 양식
    print("\n[2/3] 전자민원센터 양식 수집...")
    page1, total_pages = fetch_minwon_forms(1)
    all_forms.extend(page1)
    print(f"  1페이지: {len(page1)}건, 총 {total_pages}페이지")

    for page in tqdm(range(2, min(total_pages + 1, 60)), desc="  목록 수집"):
        try:
            forms, _ = fetch_minwon_forms(page)
            all_forms.extend(forms)
            time.sleep(0.5)
        except Exception as e:
            print(f"  {page}페이지 에러: {e}")

    print(f"  전체 목록: {len(all_forms)}건")

    # 3. 상세 조회
    print("\n[3/3] 상세 내용 조회 중...")
    for form in tqdm(all_forms, desc="  상세 조회"):
        if form.get("href"):
            form["content"] = get_form_detail_minwon(form["href"])
            time.sleep(0.3)

    # 중복 제거
    seen = set()
    unique_forms = []
    for f in all_forms:
        if f["title"] not in seen:
            seen.add(f["title"])
            unique_forms.append(f)

    print(f"  중복 제거 후: {len(unique_forms)}건")

    # 업로드
    print("\n[4/4] Supabase 업로드 중...")
    upload_to_supabase(unique_forms)

    # 백업
    with open("court_forms_backup.json", "w", encoding="utf-8") as f:
        json.dump(unique_forms, f, ensure_ascii=False, indent=2)
    print(f"백업 파일: court_forms_backup.json")

    print("\n완료!")


if __name__ == "__main__":
    main()
