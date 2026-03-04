"""
Step 3: 찾기쉬운 생활법령정보 수집 → Supabase easy_law 테이블
출처: https://www.easylaw.go.kr
법제처 DRF API: http://www.law.go.kr/DRF/lawSearch.do?target=easylaw
"""

import time
import json
import re
import requests
from bs4 import BeautifulSoup
from tqdm import tqdm
from config import SUPABASE_URL, SUPABASE_KEY, LAW_API_OC

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

# 생활법령정보 주제 목록 (LAW-CADDY 관련 핵심 주제)
# easylaw.go.kr/CSP/CsmSortRetrieveLst.laf 에서 확인 가능
TOPICS = [
    # 민사/계약
    {"topic": "손해배상", "csmSeq": "618"},
    {"topic": "내용증명", "csmSeq": "1204"},
    {"topic": "민사소송", "csmSeq": "789"},
    {"topic": "소액사건재판", "csmSeq": "535"},
    {"topic": "민사조정", "csmSeq": "548"},
    {"topic": "민사집행", "csmSeq": "671"},
    {"topic": "지급명령", "csmSeq": "1206"},
    {"topic": "개인회생", "csmSeq": "632"},
    {"topic": "개인파산·면책", "csmSeq": "668"},
    # 부동산
    {"topic": "부동산매매", "csmSeq": "526"},
    {"topic": "부동산임대차", "csmSeq": "527"},
    {"topic": "주택임대차", "csmSeq": "558"},
    {"topic": "상가건물 임대차", "csmSeq": "559"},
    {"topic": "부동산등기", "csmSeq": "537"},
    {"topic": "재건축·재개발", "csmSeq": "682"},
    # 가사
    {"topic": "이혼", "csmSeq": "530"},
    {"topic": "양육비", "csmSeq": "1183"},
    {"topic": "상속", "csmSeq": "528"},
    {"topic": "유언", "csmSeq": "586"},
    {"topic": "가정폭력", "csmSeq": "629"},
    {"topic": "성폭력", "csmSeq": "638"},
    {"topic": "아동학대", "csmSeq": "1143"},
    {"topic": "입양", "csmSeq": "590"},
    # 형사
    {"topic": "고소·고발", "csmSeq": "680"},
    {"topic": "형사소송", "csmSeq": "790"},
    {"topic": "교통사고", "csmSeq": "684"},
    {"topic": "음주운전", "csmSeq": "545"},
    {"topic": "사기", "csmSeq": "1189"},
    {"topic": "명예훼손", "csmSeq": "1190"},
    {"topic": "폭행·상해", "csmSeq": "1191"},
    {"topic": "범죄피해자", "csmSeq": "544"},
    # 노동
    {"topic": "근로계약", "csmSeq": "556"},
    {"topic": "임금", "csmSeq": "564"},
    {"topic": "퇴직급여", "csmSeq": "561"},
    {"topic": "해고", "csmSeq": "563"},
    {"topic": "비정규직", "csmSeq": "658"},
    {"topic": "산업재해", "csmSeq": "539"},
    {"topic": "직장 내 성희롱", "csmSeq": "649"},
    {"topic": "직장 내 괴롭힘", "csmSeq": "1156"},
    # 소비자/금융
    {"topic": "소비자분쟁해결", "csmSeq": "536"},
    {"topic": "전자상거래", "csmSeq": "582"},
    {"topic": "대부업", "csmSeq": "647"},
    {"topic": "신용회복", "csmSeq": "670"},
    {"topic": "보증", "csmSeq": "665"},
    # 행정
    {"topic": "행정심판", "csmSeq": "577"},
    {"topic": "행정소송", "csmSeq": "791"},
    {"topic": "국가배상", "csmSeq": "619"},
    # 기타 실생활
    {"topic": "개인정보보호", "csmSeq": "1139"},
    {"topic": "저작권", "csmSeq": "646"},
    {"topic": "의료분쟁", "csmSeq": "1196"},
]

BASE_EASYLAW = "https://www.easylaw.go.kr"


def fetch_topic_content(topic_name: str, csm_seq: str) -> list[dict]:
    """생활법령 주제의 세부 콘텐츠 수집"""
    contents = []

    # 주제 메인 페이지
    url = f"{BASE_EASYLAW}/CSP/CnpClsMain.laf?popMenu=ov&csmSeq={csm_seq}"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "lxml")

        # 소주제(챕터) 목록 추출
        chapters = soup.select("a.depth2, .lnb_list a, .snb a, .sub_menu a")
        chapter_links = []

        for ch in chapters:
            href = ch.get("href", "")
            ch_title = ch.get_text(strip=True)
            if href and ch_title and len(ch_title) > 1:
                if href.startswith("/"):
                    href = BASE_EASYLAW + href
                elif not href.startswith("http"):
                    continue
                chapter_links.append({"title": ch_title, "url": href})

        if not chapter_links:
            # 챕터가 없으면 메인 페이지 본문 추출
            main_content = extract_page_content(soup)
            if main_content and len(main_content) > 50:
                contents.append({
                    "topic": topic_name,
                    "title": topic_name,
                    "content": main_content,
                })
        else:
            # 각 챕터 페이지 조회
            for ch in chapter_links[:30]:  # 최대 30개 소주제
                try:
                    ch_resp = requests.get(ch["url"], headers=HEADERS, timeout=30)
                    ch_resp.encoding = "utf-8"
                    ch_soup = BeautifulSoup(ch_resp.text, "lxml")
                    ch_content = extract_page_content(ch_soup)

                    if ch_content and len(ch_content) > 50:
                        contents.append({
                            "topic": topic_name,
                            "title": f"{topic_name} - {ch['title']}",
                            "content": ch_content,
                        })
                    time.sleep(0.3)
                except Exception:
                    pass

    except Exception as e:
        print(f"  {topic_name} 수집 실패: {e}")

    return contents


def extract_page_content(soup: BeautifulSoup) -> str:
    """페이지에서 본문 텍스트 추출"""
    # 스크립트/스타일 제거
    for tag in soup.select("script, style, nav, header, footer"):
        tag.decompose()

    # 본문 영역 셀렉터
    selectors = [
        ".con_area",
        ".cont_area",
        ".content_area",
        "#conScroll",
        ".search_box",
        "#contents",
        ".sub_content",
    ]

    for sel in selectors:
        el = soup.select_one(sel)
        if el and len(el.get_text(strip=True)) > 50:
            text = el.get_text("\n", strip=True)
            # 불필요한 줄 제거
            lines = [line for line in text.split("\n") if line.strip()]
            return "\n".join(lines)[:15000]

    return ""


def extract_related_statutes(content: str) -> list[str]:
    """본문에서 관련 법조문 추출"""
    statutes = []
    # "민법 제750조", "형법 제307조" 등 패턴
    patterns = [
        r"(민법|형법|상법|민사소송법|형사소송법|근로기준법|주택임대차보호법|상가건물\s*임대차보호법|"
        r"가사소송법|행정소송법|국가배상법|소비자기본법|개인정보\s*보호법|저작권법|"
        r"도로교통법|산업재해보상보험법|고용보험법)\s*제\d+조(?:의\d+)?",
    ]
    for pattern in patterns:
        matches = re.findall(pattern, content)
        statutes.extend(matches)

    return list(set(statutes))[:20]


def upload_to_supabase(items: list[dict]):
    """Supabase easy_law 테이블에 업로드"""
    url = f"{SUPABASE_URL}/rest/v1/easy_law"
    success = 0
    errors = 0

    for i in range(0, len(items), 50):
        batch = items[i:i+50]
        rows = []
        for item in batch:
            rows.append({
                "topic": item["topic"],
                "title": item["title"],
                "content": item["content"],
                "related_statutes": extract_related_statutes(item["content"]),
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
    print("생활법령정보 수집 시작")
    print(f"대상: {len(TOPICS)}개 주제")
    print("=" * 60)

    all_contents = []

    for topic_info in tqdm(TOPICS, desc="주제 수집"):
        topic_name = topic_info["topic"]
        csm_seq = topic_info["csmSeq"]

        contents = fetch_topic_content(topic_name, csm_seq)
        all_contents.extend(contents)

        if contents:
            print(f"  {topic_name}: {len(contents)}건")

        time.sleep(0.5)

    print(f"\n총 {len(all_contents)}건 수집 완료")

    # 업로드
    if all_contents:
        print("\nSupabase 업로드 중...")
        upload_to_supabase(all_contents)

    # 백업
    with open("easy_law_backup.json", "w", encoding="utf-8") as f:
        json.dump(all_contents, f, ensure_ascii=False, indent=2)
    print(f"백업 파일: easy_law_backup.json")

    print("\n완료!")


if __name__ == "__main__":
    main()
