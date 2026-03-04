"""
Step 1: 대한법률구조공단 법률서식 수집 → Supabase legal_forms 테이블
출처: https://www.klac.or.kr/legalinfo/legalFrm.do
"""

import time
import json
import requests
from bs4 import BeautifulSoup
from tqdm import tqdm
from config import SUPABASE_URL, SUPABASE_KEY

BASE_URL = "https://www.klac.or.kr"
LIST_URL = f"{BASE_URL}/legalinfo/legalFrm.do"

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

# 카테고리 매핑
CATEGORIES = {
    "민사": "민사",
    "형사": "형사",
    "가사": "가사",
    "행정": "행정",
    "노동": "노동",
    "채권": "채권·채무",
    "부동산": "부동산",
    "손해배상": "손해배상",
}


def classify_category(title: str) -> str:
    """서식 제목에서 카테고리 추정"""
    for keyword, category in CATEGORIES.items():
        if keyword in title:
            return category
    return "기타"


def get_form_list(page: int = 1) -> tuple[list[dict], int]:
    """서식 목록 페이지 조회"""
    params = {
        "pageIndex": page,
        "searchCondition": "",
        "searchKeyword": "",
    }
    resp = requests.get(LIST_URL, params=params, headers=HEADERS, timeout=30)
    resp.encoding = "utf-8"
    soup = BeautifulSoup(resp.text, "lxml")

    forms = []

    # 테이블 행에서 서식 목록 추출
    rows = soup.select("table tbody tr")
    for row in rows:
        cols = row.select("td")
        if len(cols) < 3:
            continue

        # 링크 찾기
        link_tag = row.select_one("a")
        if not link_tag:
            continue

        title = link_tag.get_text(strip=True)
        href = link_tag.get("href", "")

        # onclick에서 상세 ID 추출 시도
        onclick = link_tag.get("onclick", "")

        forms.append({
            "title": title,
            "href": href,
            "onclick": onclick,
            "category": classify_category(title),
        })

    # 총 페이지 수 추출
    total_pages = 1
    paging = soup.select(".pagination a, .paging a, .page_num a")
    for p in paging:
        try:
            num = int(p.get_text(strip=True))
            total_pages = max(total_pages, num)
        except ValueError:
            pass

    # 마지막 페이지 링크로 추정
    last_link = soup.select_one("a.last, a[title='마지막']")
    if last_link:
        onclick = last_link.get("onclick", "")
        import re
        match = re.search(r"(\d+)", onclick)
        if match:
            total_pages = max(total_pages, int(match.group(1)))

    return forms, total_pages


def get_form_detail(href: str) -> str:
    """서식 상세 페이지에서 본문 텍스트 추출"""
    if href.startswith("/"):
        url = BASE_URL + href
    elif href.startswith("http"):
        url = href
    else:
        return ""

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")

        # 본문 영역 추출 (여러 셀렉터 시도)
        content_selectors = [
            ".view_cont",
            ".board_view",
            ".content_view",
            ".view_content",
            "#contents",
            ".sub_content",
            "article",
        ]

        for selector in content_selectors:
            content = soup.select_one(selector)
            if content and len(content.get_text(strip=True)) > 50:
                return content.get_text("\n", strip=True)

        # 폴백: body에서 nav/header/footer 제거
        body = soup.find("body")
        if body:
            for tag in body.select("header, footer, nav, script, style"):
                tag.decompose()
            text = body.get_text("\n", strip=True)
            if len(text) > 100:
                return text[:10000]  # 최대 10000자

        return ""
    except Exception as e:
        print(f"  상세 조회 실패: {e}")
        return ""


def upload_to_supabase(forms: list[dict]):
    """Supabase legal_forms 테이블에 업로드"""
    url = f"{SUPABASE_URL}/rest/v1/legal_forms"

    success = 0
    errors = 0

    for i in range(0, len(forms), 50):
        batch = forms[i:i+50]
        rows = []
        for f in batch:
            if not f.get("content") or len(f["content"]) < 20:
                continue
            rows.append({
                "form_type": f.get("form_type", "기타"),
                "case_category": f.get("category", "기타"),
                "title": f["title"],
                "content": f["content"],
                "writing_guide": f.get("writing_guide"),
                "source": f.get("source", "법률구조공단"),
            })

        if not rows:
            continue

        resp = requests.post(url, headers=SUPABASE_HEADERS, json=rows, timeout=30)
        if resp.status_code in (200, 201):
            success += len(rows)
        else:
            errors += len(rows)
            print(f"  업로드 에러: {resp.status_code} - {resp.text[:200]}")

    print(f"업로드 완료: 성공 {success}건, 실패 {errors}건")


def classify_form_type(title: str) -> str:
    """서식 제목에서 문서 유형 추출"""
    types = {
        "소장": "소장",
        "답변서": "답변서",
        "준비서면": "준비서면",
        "내용증명": "내용증명",
        "고소장": "고소장",
        "고발장": "고발장",
        "지급명령": "지급명령신청서",
        "가압류": "가압류신청서",
        "가처분": "가처분신청서",
        "합의서": "합의서",
        "계약서": "계약서",
        "위임장": "위임장",
        "진술서": "진술서",
        "탄원서": "탄원서",
        "항소": "항소장",
        "상고": "상고장",
        "이의신청": "이의신청서",
        "조정": "조정신청서",
        "화해": "화해신청서",
    }
    for keyword, form_type in types.items():
        if keyword in title:
            return form_type
    return "기타"


def main():
    print("=" * 60)
    print("법률구조공단 법률서식 수집 시작")
    print("=" * 60)

    all_forms = []

    # 1단계: 목록 수집
    print("\n[1/3] 서식 목록 수집 중...")
    first_page, total_pages = get_form_list(1)
    all_forms.extend(first_page)
    print(f"  1페이지: {len(first_page)}건, 총 {total_pages}페이지 예상")

    for page in tqdm(range(2, total_pages + 1), desc="  목록 수집"):
        try:
            forms, _ = get_form_list(page)
            all_forms.extend(forms)
            time.sleep(0.5)
        except Exception as e:
            print(f"  {page}페이지 에러: {e}")

    print(f"  총 {len(all_forms)}건 목록 수집 완료")

    # 2단계: 상세 조회
    print("\n[2/3] 서식 상세 조회 중...")
    for form in tqdm(all_forms, desc="  상세 조회"):
        if form.get("href"):
            form["content"] = get_form_detail(form["href"])
            form["form_type"] = classify_form_type(form["title"])
            form["source"] = "법률구조공단"
            time.sleep(0.3)

    valid_forms = [f for f in all_forms if f.get("content") and len(f["content"]) > 20]
    print(f"  유효한 서식: {len(valid_forms)}건 / {len(all_forms)}건")

    # 3단계: 업로드
    print("\n[3/3] Supabase 업로드 중...")
    upload_to_supabase(valid_forms)

    # 결과 저장 (백업)
    with open("legal_forms_backup.json", "w", encoding="utf-8") as f:
        json.dump(valid_forms, f, ensure_ascii=False, indent=2)
    print(f"\n백업 파일: legal_forms_backup.json")

    print("\n완료!")


if __name__ == "__main__":
    main()
