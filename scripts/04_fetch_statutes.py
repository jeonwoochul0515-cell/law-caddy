"""
Step 4: 법제처 API로 주요 법령 조문 수집 → Supabase statutes 테이블
출처: http://www.law.go.kr/DRF/lawSearch.do (법령 목록)
      http://www.law.go.kr/DRF/lawService.do (법령 본문)
"""

import time
import json
import re
import xml.etree.ElementTree as ET
import requests
from tqdm import tqdm
from config import SUPABASE_URL, SUPABASE_KEY, LAW_API_OC

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# 주요 법률 80개 (LAW-CADDY 실무 관련)
KEY_STATUTES = [
    # 기본법
    "민법", "형법", "상법", "민사소송법", "형사소송법",
    "행정소송법", "행정절차법", "헌법재판소법", "국가배상법", "법원조직법",
    # 채권·채무
    "이자제한법", "채무자 회생 및 파산에 관한 법률", "가등기담보 등에 관한 법률",
    "보증인 보호를 위한 특별법", "민사집행법", "공탁법", "어음법", "수표법",
    # 부동산
    "주택임대차보호법", "상가건물 임대차보호법", "부동산등기법",
    "집합건물의 소유 및 관리에 관한 법률", "공인중개사법",
    "부동산 실권리자명의 등기에 관한 법률", "건축법",
    # 가사
    "가사소송법", "가정폭력범죄의 처벌 등에 관한 특례법",
    "아동복지법", "아동학대범죄의 처벌 등에 관한 특례법",
    "성폭력범죄의 처벌 등에 관한 특례법", "가족관계의 등록 등에 관한 법률",
    # 노동
    "근로기준법", "근로자퇴직급여 보장법", "노동조합 및 노동관계조정법",
    "산업재해보상보험법", "고용보험법", "최저임금법",
    "기간제 및 단시간근로자 보호 등에 관한 법률",
    "남녀고용평등과 일·가정 양립 지원에 관한 법률",
    # 형사 특별법
    "특정범죄 가중처벌 등에 관한 법률",
    "특정경제범죄 가중처벌 등에 관한 법률",
    "정보통신망 이용촉진 및 정보보호 등에 관한 법률",
    "통신비밀보호법", "개인정보 보호법", "전자금융거래법",
    # 행정
    "행정심판법", "국세기본법", "소득세법", "부가가치세법",
    "지방세법", "도로교통법",
    # 손해배상
    "제조물 책임법", "자동차손해배상 보장법",
    "의료법", "소비자기본법",
    # 기업·상사
    "독점규제 및 공정거래에 관한 법률", "하도급거래 공정화에 관한 법률",
    "대리점거래의 공정화에 관한 법률",
    "전자상거래 등에서의 소비자보호에 관한 법률",
    # 기타
    "변호사법", "법률구조법", "민사조정법", "소액사건심판법",
    "중재법", "저작권법", "특허법", "상표법",
]


def search_statute(name: str) -> dict | None:
    """법제처 API로 법령 검색 → MST번호 획득"""
    url = "http://www.law.go.kr/DRF/lawSearch.do"
    params = {
        "OC": LAW_API_OC,
        "target": "law",
        "type": "XML",
        "query": name,
        "display": 5,
        "page": 1,
    }

    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.encoding = "utf-8"
        root = ET.fromstring(resp.content)

        # 첫 번째 결과에서 MST번호 추출
        for law in root.findall(".//law"):
            law_name = ""
            mst = ""

            for child in law:
                tag = child.tag
                if "법령명" in tag or "법령명약칭" in tag:
                    law_name = child.text or ""
                if "법령ID" in tag or "법령일련번호" in tag:
                    mst = child.text or ""

            # 정확한 이름 매칭 또는 포함 매칭
            if law_name and (name in law_name or law_name in name):
                return {"name": law_name, "mst": mst}

        # 정확한 매칭이 없으면 첫 번째 결과
        first = root.find(".//law")
        if first is not None:
            law_name = ""
            mst = ""
            for child in first:
                tag = child.tag
                if "법령명" in tag:
                    law_name = child.text or ""
                if "법령ID" in tag or "법령일련번호" in tag:
                    mst = child.text or ""
            if mst:
                return {"name": law_name, "mst": mst}

        return None
    except Exception as e:
        print(f"  '{name}' 검색 실패: {e}")
        return None


def fetch_statute_articles(mst: str, statute_name: str) -> list[dict]:
    """법제처 API로 법령 본문 조회 → 조문별 파싱"""
    url = "http://www.law.go.kr/DRF/lawService.do"
    params = {
        "OC": LAW_API_OC,
        "target": "law",
        "type": "XML",
        "ID": mst,
    }

    try:
        resp = requests.get(url, params=params, timeout=60)
        resp.encoding = "utf-8"
        root = ET.fromstring(resp.content)

        articles = []

        # 조문 파싱 (여러 가능한 태그명)
        for article in root.iter():
            tag = article.tag

            # 조문번호와 내용 추출
            if "조문번호" in tag or "조번호" in tag:
                article_num = article.text or ""
            elif "조문" in tag and "조문내용" not in tag:
                continue

            # 조문내용 태그 찾기
            if "조문내용" in tag or "조문" == tag:
                content_text = article.text or ""
                if not content_text:
                    content_text = ET.tostring(article, encoding="unicode", method="text")

                if content_text and len(content_text.strip()) > 5:
                    # 조문번호 추출 (예: "제750조")
                    num_match = re.search(r"제\d+조(?:의\d+)?", content_text)
                    article_number = num_match.group(0) if num_match else ""

                    # 조문 제목 추출 (괄호 안)
                    title_match = re.search(r"[（(]([^)）]+)[)）]", content_text)
                    article_title = title_match.group(1) if title_match else ""

                    articles.append({
                        "statute_name": statute_name,
                        "statute_mst": mst,
                        "article_number": article_number,
                        "article_title": article_title,
                        "article_content": content_text.strip()[:5000],
                    })

        # 조문 파싱이 안 되면 전체 텍스트에서 추출
        if not articles:
            full_text = ET.tostring(root, encoding="unicode", method="text")
            # "제N조" 패턴으로 분리
            parts = re.split(r"(제\d+조(?:의\d+)?)", full_text)

            for i in range(1, len(parts) - 1, 2):
                article_number = parts[i]
                content = parts[i] + parts[i + 1] if i + 1 < len(parts) else parts[i]
                content = content.strip()

                if len(content) > 10:
                    title_match = re.search(r"[（(]([^)）]+)[)）]", content)
                    article_title = title_match.group(1) if title_match else ""

                    articles.append({
                        "statute_name": statute_name,
                        "statute_mst": mst,
                        "article_number": article_number,
                        "article_title": article_title,
                        "article_content": content[:5000],
                    })

        return articles
    except Exception as e:
        print(f"  '{statute_name}' 본문 조회 실패: {e}")
        return []


def upload_to_supabase(articles: list[dict]):
    """Supabase statutes 테이블에 업로드"""
    url = f"{SUPABASE_URL}/rest/v1/statutes"
    success = 0
    errors = 0

    for i in range(0, len(articles), 100):
        batch = articles[i:i+100]
        resp = requests.post(url, headers=SUPABASE_HEADERS, json=batch, timeout=30)
        if resp.status_code in (200, 201):
            success += len(batch)
        else:
            errors += len(batch)
            print(f"  업로드 에러: {resp.status_code} - {resp.text[:200]}")

    print(f"업로드 완료: 성공 {success}건, 실패 {errors}건")


def main():
    print("=" * 60)
    print("법제처 API - 주요 법령 조문 수집")
    print(f"대상: {len(KEY_STATUTES)}개 법률")
    print("=" * 60)

    all_articles = []
    not_found = []

    for statute_name in tqdm(KEY_STATUTES, desc="법령 수집"):
        # 1. MST번호 검색
        result = search_statute(statute_name)
        if not result:
            not_found.append(statute_name)
            print(f"  '{statute_name}' MST번호 못 찾음")
            time.sleep(0.5)
            continue

        # 2. 조문 수집
        articles = fetch_statute_articles(result["mst"], result["name"])
        all_articles.extend(articles)

        if articles:
            print(f"  {result['name']}: {len(articles)}개 조문")
        else:
            print(f"  {result['name']}: 조문 파싱 실패")

        time.sleep(0.5)

    print(f"\n총 {len(all_articles)}개 조문 수집 완료")
    if not_found:
        print(f"미발견 법령: {not_found}")

    # 업로드
    if all_articles:
        print("\nSupabase 업로드 중...")
        upload_to_supabase(all_articles)

    # 백업
    with open("statutes_backup.json", "w", encoding="utf-8") as f:
        json.dump(all_articles, f, ensure_ascii=False, indent=2)
    print(f"백업 파일: statutes_backup.json")

    print("\n완료!")


if __name__ == "__main__":
    main()
