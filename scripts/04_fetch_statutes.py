"""
Step 4: 법제처 API로 주요 법령 조문 수집 → Supabase statutes 테이블
출처: https://www.law.go.kr/DRF/lawSearch.do (법령 목록)
      https://www.law.go.kr/DRF/lawService.do (법령 본문)
JSON 포맷 사용 (XML 파싱 오류 방지)
TLS 호환성 이슈 해결: 커스텀 SSL 어댑터 사용
"""

import time
import json
import re
import ssl
import urllib3
import requests
from requests.adapters import HTTPAdapter
from tqdm import tqdm
from config import SUPABASE_URL, SUPABASE_KEY, LAW_API_OC

# SSL 경고 무시 (한국 정부 사이트)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class LegacySSLAdapter(HTTPAdapter):
    """한국 정부 사이트 TLS 호환성을 위한 커스텀 어댑터"""
    def init_poolmanager(self, *args, **kwargs):
        try:
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            # 낮은 보안 레벨 허용 (오래된 서버 호환)
            ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
            # TLS 1.0/1.1도 허용
            ctx.minimum_version = ssl.TLSVersion.TLSv1
        except Exception:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


# 세션 설정
SESSION = requests.Session()
SESSION.mount("https://", LegacySSLAdapter())
SESSION.mount("http://", HTTPAdapter(max_retries=3))


SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}

# 주요 법률 67개 (LAW-CADDY 실무 관련)
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


DEBUG = True  # 첫 번째 요청 디버그용

def _try_request(url: str, params: dict, timeout: int = 30) -> requests.Response | None:
    """HTTPS → HTTP 순으로 시도, 다양한 방법 시도"""
    global DEBUG

    # 방법 1: SESSION — HTTP 먼저 (HTTPS는 ConnectionReset 발생)
    for base in ["http://www.law.go.kr", "https://www.law.go.kr"]:
        full_url = url.replace("https://www.law.go.kr", base).replace("http://www.law.go.kr", base)
        try:
            resp = SESSION.get(full_url, params=params, headers=HEADERS,
                              timeout=timeout, allow_redirects=True)
            if DEBUG:
                print(f"  [DEBUG] {base} → status={resp.status_code}, len={len(resp.content)}")
                print(f"  [DEBUG] content-type: {resp.headers.get('content-type', '?')}")
                print(f"  [DEBUG] 응답 앞 300자: {resp.text[:300]}")
                DEBUG = False
            if resp.status_code == 200 and len(resp.content) > 50:
                return resp
        except Exception as e:
            if DEBUG:
                print(f"  [DEBUG] {base} 실패: {str(e)[:150]}")
            continue

    # 방법 2: requests 직접 (verify=False)
    try:
        resp = requests.get(url, params=params, headers=HEADERS,
                            timeout=timeout, verify=False, allow_redirects=True)
        if resp.status_code == 200 and len(resp.content) > 50:
            return resp
    except Exception:
        pass

    return None


def search_statute(name: str) -> dict | None:
    """법제처 API로 법령 검색 → MST번호 획득 (JSON 방식)"""
    url = "https://www.law.go.kr/DRF/lawSearch.do"
    params = {
        "OC": LAW_API_OC,
        "target": "law",
        "type": "JSON",
        "query": name,
        "display": 5,
        "page": 1,
    }

    try:
        resp = _try_request(url, params)
        if not resp:
            return None
        resp.encoding = "utf-8"

        # JSON 파싱
        data = resp.json()

        # 응답 구조: {"LawSearch": {"law": [...]}} 또는 {"LawSearch": {"law": {...}}}
        law_search = data.get("LawSearch", data)
        laws = law_search.get("law", [])

        # 단일 결과면 리스트로 변환
        if isinstance(laws, dict):
            laws = [laws]

        # 1순위: 정확히 일치하는 법률 (법령구분명이 "법률"인 것 우선)
        for law in laws:
            law_name = law.get("법령명한글", "")
            mst = str(law.get("법령일련번호", law.get("법령ID", "")))
            if law_name == name:
                return {"name": law_name, "mst": mst}

        # 2순위: 정확 일치 (구분 무관)
        for law in laws:
            law_name = law.get("법령명한글", "")
            abbr = law.get("법령약칭명", "")
            mst = str(law.get("법령일련번호", law.get("법령ID", "")))
            if law_name == name or abbr == name:
                return {"name": law_name, "mst": mst}

        # 3순위: 검색어가 법령명과 같은 길이거나 더 긴 경우만 (난민법 ≠ 민법 방지)
        for law in laws:
            law_name = law.get("법령명한글", "")
            mst = str(law.get("법령일련번호", law.get("법령ID", "")))
            if law_name and law_name in name:
                return {"name": law_name, "mst": mst}

        # 4순위: 첫 번째 법률 결과
        for law in laws:
            if law.get("법령구분명") == "법률":
                law_name = law.get("법령명한글", "")
                mst = str(law.get("법령일련번호", law.get("법령ID", "")))
                if mst:
                    return {"name": law_name, "mst": mst}

        return None
    except json.JSONDecodeError:
        # JSON 실패하면 텍스트에서 직접 추출 시도
        try:
            text = resp.text
            # 법령ID나 법령일련번호 패턴
            mst_match = re.search(r'"법령일련번호"\s*:\s*"?(\d+)"?', text)
            name_match = re.search(r'"법령명한글"\s*:\s*"([^"]+)"', text)
            if mst_match:
                return {
                    "name": name_match.group(1) if name_match else name,
                    "mst": mst_match.group(1),
                }
        except Exception:
            pass
        print(f"  '{name}' JSON 파싱 실패")
        return None
    except Exception as e:
        print(f"  '{name}' 검색 실패: {str(e)[:100]}")
        return None


DEBUG_ARTICLE = True  # 첫 번째 법령 본문 디버그

def fetch_statute_articles(mst: str, statute_name: str) -> list[dict]:
    """법제처 API로 법령 본문 조회 → 조문별 파싱 (JSON)"""
    global DEBUG_ARTICLE
    url = "http://www.law.go.kr/DRF/lawService.do"  # HTTP 직접 사용 (HTTPS 차단됨)
    params = {
        "OC": LAW_API_OC,
        "target": "law",
        "type": "JSON",
        "MST": mst,  # ID가 아닌 MST 파라미터 사용
    }

    try:
        resp = SESSION.get(url, params=params, headers=HEADERS,
                          timeout=60, allow_redirects=True)
        if resp.status_code != 200 or len(resp.content) < 100:
            print(f"  '{statute_name}' HTTP 응답 오류: {resp.status_code}")
            return []
        resp.encoding = "utf-8"

        if DEBUG_ARTICLE:
            print(f"  [DEBUG-ARTICLE] status={resp.status_code}, len={len(resp.content)}")
            # JSON 키 구조 출력
            try:
                data = resp.json()
                top_keys = list(data.keys())[:5]
                print(f"  [DEBUG-ARTICLE] 최상위 키: {top_keys}")
                for k in top_keys:
                    v = data[k]
                    if isinstance(v, dict):
                        sub_keys = list(v.keys())[:10]
                        print(f"  [DEBUG-ARTICLE] {k} 하위 키: {sub_keys}")
                        # 조문 관련 키 찾기
                        for sk in v:
                            if "조문" in sk:
                                sv = v[sk]
                                if isinstance(sv, list):
                                    print(f"  [DEBUG-ARTICLE] {sk}: list, len={len(sv)}, 첫 항목 키: {list(sv[0].keys())[:8] if sv and isinstance(sv[0], dict) else type(sv[0]) if sv else 'empty'}")
                                elif isinstance(sv, dict):
                                    print(f"  [DEBUG-ARTICLE] {sk}: dict, 키: {list(sv.keys())[:8]}")
            except Exception as e:
                print(f"  [DEBUG-ARTICLE] JSON 파싱 실패: {e}")
                print(f"  [DEBUG-ARTICLE] 앞 500자: {resp.text[:500]}")
            DEBUG_ARTICLE = False

        data = resp.json()

        articles = []

        # 조문 데이터 탐색 — 다양한 키 구조 대응
        law_data = data
        # 최상위에서 법령 데이터 찾기
        for top_key in data:
            if isinstance(data[top_key], dict):
                law_data = data[top_key]
                break

        # 조문 배열 찾기 (키 이름이 다를 수 있음)
        jo_list = []
        for key in law_data:
            if "조문" in key:
                jo_list = law_data[key]
                break

        if isinstance(jo_list, dict):
            jo_list = [jo_list]

            for jo in jo_list:
                if isinstance(jo, dict):
                    # 조문단위 안의 조문내용 추출
                    jo_unit = jo.get("조문단위", jo)
                    if isinstance(jo_unit, list):
                        for unit in jo_unit:
                            article = _parse_article(unit, statute_name, mst)
                            if article:
                                articles.append(article)
                    elif isinstance(jo_unit, dict):
                        article = _parse_article(jo_unit, statute_name, mst)
                        if article:
                            articles.append(article)
                    else:
                        article = _parse_article(jo, statute_name, mst)
                        if article:
                            articles.append(article)

        # 조문 파싱 실패 시, 전체 텍스트에서 추출
        if not articles:
            full_text = json.dumps(data, ensure_ascii=False)
            articles = _extract_from_text(full_text, statute_name, mst)

        return articles
    except json.JSONDecodeError:
        # JSON 실패시 텍스트에서 추출
        try:
            articles = _extract_from_text(resp.text, statute_name, mst)
            return articles
        except Exception:
            pass
        print(f"  '{statute_name}' 본문 JSON 파싱 실패")
        return []
    except Exception as e:
        print(f"  '{statute_name}' 본문 조회 실패: {str(e)[:100]}")
        return []


def _parse_article(jo_data: dict, statute_name: str, mst: str) -> dict | None:
    """단일 조문 딕셔너리에서 데이터 추출"""
    content = ""
    number = ""
    title = ""

    for key, val in jo_data.items():
        if "조문내용" in key and val:
            content = str(val).strip()
        elif "조문번호" in key and val:
            number = str(val).strip()
        elif "조문제목" in key and val:
            title = str(val).strip()
        elif "조문여부" in key:
            continue

    # 내용이 없으면 건너뜀
    if not content or len(content) < 5:
        return None

    # 조문번호 포맷
    if number and not number.startswith("제"):
        number = f"제{number}조"

    # 제목이 없으면 내용에서 추출
    if not title:
        title_match = re.search(r"[（(]([^)）]+)[)）]", content)
        title = title_match.group(1) if title_match else ""

    # 항 내용도 합치기
    sub_items = []
    for key, val in jo_data.items():
        if "항" in key and isinstance(val, (list, dict)):
            items = val if isinstance(val, list) else [val]
            for item in items:
                if isinstance(item, dict):
                    for k2, v2 in item.items():
                        if "항내용" in k2 and v2:
                            sub_items.append(str(v2).strip())

    if sub_items:
        content = content + "\n" + "\n".join(sub_items)

    return {
        "statute_name": statute_name,
        "statute_mst": mst,
        "article_number": number,
        "article_title": title,
        "article_content": content[:5000],
    }


def _extract_from_text(text: str, statute_name: str, mst: str) -> list[dict]:
    """텍스트에서 조문 패턴으로 추출 (폴백)"""
    articles = []

    # "조문내용" 값 추출
    content_pattern = r'"조문내용"\s*:\s*"([^"]{10,})"'
    matches = re.findall(content_pattern, text)

    for content in matches:
        content = content.replace("\\n", "\n").strip()

        num_match = re.search(r"제\d+조(?:의\d+)?", content)
        article_number = num_match.group(0) if num_match else ""

        title_match = re.search(r"[（(]([^)）]+)[)）]", content)
        article_title = title_match.group(1) if title_match else ""

        articles.append({
            "statute_name": statute_name,
            "statute_mst": mst,
            "article_number": article_number,
            "article_title": article_title,
            "article_content": content[:5000],
        })

    # 위 방법도 실패하면 "제N조" 패턴으로 분리
    if not articles:
        parts = re.split(r"(제\d+조(?:의\d+)?)", text)
        for i in range(1, len(parts) - 1, 2):
            article_number = parts[i]
            content = parts[i] + parts[i + 1][:2000] if i + 1 < len(parts) else parts[i]
            content = re.sub(r'[{}"\[\],]', '', content).strip()

            if len(content) > 20:
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
    print("법제처 API - 주요 법령 조문 수집 (JSON 방식)")
    print(f"대상: {len(KEY_STATUTES)}개 법률")
    print("=" * 60)

    all_articles = []
    not_found = []
    found_count = 0

    for statute_name in tqdm(KEY_STATUTES, desc="법령 수집"):
        # 1. MST번호 검색
        result = search_statute(statute_name)
        if not result:
            not_found.append(statute_name)
            print(f"  '{statute_name}' MST번호 못 찾음")
            time.sleep(1)
            continue

        found_count += 1

        # 2. 조문 수집
        articles = fetch_statute_articles(result["mst"], result["name"])
        all_articles.extend(articles)

        if articles:
            print(f"  {result['name']}: {len(articles)}개 조문")
        else:
            print(f"  {result['name']}: 조문 파싱 실패")

        time.sleep(1)

    print(f"\n검색 성공: {found_count}/{len(KEY_STATUTES)}개 법률")
    print(f"총 {len(all_articles)}개 조문 수집 완료")
    if not_found:
        print(f"미발견 법령 ({len(not_found)}개): {not_found[:10]}...")

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
