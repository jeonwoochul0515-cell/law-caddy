"""
Step 2: 법원 양식 수집 → Supabase legal_forms 테이블
소스 1: 전자소송포털 (ecfs.scourt.go.kr)
소스 2: 대한법원 민원안내 (www.scourt.go.kr)
SSL 인증서 문제 우회 포함
"""

import time
import json
import re
import urllib3
import requests
from bs4 import BeautifulSoup
from tqdm import tqdm
from config import SUPABASE_URL, SUPABASE_KEY

# 한국 정부 사이트 SSL 인증서 문제 우회
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# 법원 양식 URL 목록
COURT_FORM_URLS = [
    # 대한민국 법원 전자민원센터 - 서식모음
    {
        "name": "대법원 양식모음",
        "url": "https://www.scourt.go.kr/portal/minwon/doc/DocListAction.work",
        "verify_ssl": True,
    },
    # 전자소송포털 양식
    {
        "name": "전자소송포털",
        "url": "https://ecfs.scourt.go.kr/psp/index.on",
        "params": {"m": "PSP720M24"},
        "verify_ssl": False,
    },
    # 서울중앙지방법원
    {
        "name": "서울중앙지법",
        "url": "https://seoul.scourt.go.kr/common/util/commonBank.jsp",
        "params": {"functionCode": "2165"},
        "verify_ssl": False,
    },
]

# 법원 실무에서 쓰는 주요 서식 목록 (웹 스크래핑 실패 시 사용)
COURT_FORM_TEMPLATES = [
    # 민사 소장
    {"title": "소장 (대여금 청구)", "form_type": "소장", "case_category": "민사",
     "content": """소장\n\n원고: ○○○\n피고: ○○○\n\n대여금 청구의 소\n\n청구취지\n1. 피고는 원고에게 금 ○○○원 및 이에 대하여 이 사건 소장 부본 송달 다음날부터 다 갚는 날까지 소송촉진 등에 관한 특례법 소정 연 12%의 비율에 의한 금원을 지급하라.\n2. 소송비용은 피고의 부담으로 한다.\n3. 제1항은 가집행할 수 있다.\n라는 판결을 구합니다.\n\n청구원인\n1. 원고는 ○○년 ○월 ○일 피고에게 금 ○○○원을 변제기 ○○년 ○월 ○일, 이자 연 ○%로 정하여 대여하였습니다.\n2. 그런데 피고는 위 변제기가 지났음에도 이를 변제하지 아니하고 있습니다.\n3. 이에 원고는 피고에 대하여 위 대여금 및 이에 대한 지연손해금의 지급을 구하기 위하여 이 사건 소를 제기합니다.\n\n입증방법\n1. 갑 제1호증 차용증\n2. 갑 제2호증 통장 거래내역\n\n첨부서류\n1. 위 입증방법 각 1통\n2. 송달료 납부서 1통\n3. 소장 부본 1통"""},

    {"title": "소장 (손해배상 청구)", "form_type": "소장", "case_category": "민사",
     "content": """소장\n\n원고: ○○○\n피고: ○○○\n\n손해배상(기) 청구의 소\n\n청구취지\n1. 피고는 원고에게 금 ○○○원 및 이에 대하여 ○○년 ○월 ○일부터 이 사건 소장 부본 송달일까지는 민법 소정 연 5%의, 그 다음날부터 다 갚는 날까지는 소송촉진 등에 관한 특례법 소정 연 12%의 각 비율에 의한 금원을 지급하라.\n2. 소송비용은 피고의 부담으로 한다.\n3. 제1항은 가집행할 수 있다.\n라는 판결을 구합니다.\n\n청구원인\n1. 당사자 관계\n2. 피고의 불법행위\n3. 손해의 발생 및 범위\n  가. 적극적 손해: 금 ○○○원\n  나. 소극적 손해: 금 ○○○원\n  다. 위자료: 금 ○○○원\n4. 결론"""},

    {"title": "소장 (임금 청구)", "form_type": "소장", "case_category": "노동",
     "content": """소장\n\n원고: ○○○\n피고: ○○○ 주식회사\n\n임금 청구의 소\n\n청구취지\n1. 피고는 원고에게 금 ○○○원 및 이에 대하여 퇴직일 다음 날인 ○○년 ○월 ○일부터 다 갚는 날까지 근로기준법 소정 연 20%의 비율에 의한 금원을 지급하라.\n2. 소송비용은 피고의 부담으로 한다.\n3. 제1항은 가집행할 수 있다.\n라는 판결을 구합니다.\n\n청구원인\n1. 원고는 ○○년 ○월 ○일부터 ○○년 ○월 ○일까지 피고 회사에서 근무하였습니다.\n2. 미지급 임금 내역\n  가. ○월분 임금: 금 ○○○원\n  나. 퇴직금: 금 ○○○원\n3. 근로기준법 제36조에 의하면 사용자는 근로자가 사망 또는 퇴직한 경우에는 그 지급사유가 발생한 때부터 14일 이내에 임금 등을 지급하여야 합니다."""},

    # 답변서
    {"title": "답변서 (대여금 청구 사건)", "form_type": "답변서", "case_category": "민사",
     "content": """답변서\n\n사건: ○○○○가합○○○○ 대여금\n원고: ○○○\n피고: ○○○\n\n위 사건에 관하여 피고는 다음과 같이 답변합니다.\n\n청구취지에 대한 답변\n1. 원고의 청구를 기각한다.\n2. 소송비용은 원고의 부담으로 한다.\n라는 판결을 구합니다.\n\n청구원인에 대한 답변\n1. 원고의 주장에 대하여\n  원고가 피고에게 금원을 대여하였다는 주장은 사실과 다릅니다.\n2. 피고의 항변\n  가. 설령 대여 사실이 인정된다 하더라도, 피고는 이미 ○○년 ○월 ○일 금 ○○○원을 변제하였습니다.\n  나. 또한 원고의 대여금 채권은 소멸시효가 완성되었습니다.\n\n입증방법\n1. 을 제1호증 송금확인서"""},

    # 내용증명
    {"title": "내용증명 (채무이행 최고)", "form_type": "내용증명", "case_category": "민사",
     "content": """내용증명\n\n발신인: ○○○ (주소, 연락처)\n수신인: ○○○ (주소)\n\n제목: 채무이행 최고서\n\n1. 귀하의 건강과 발전을 기원합니다.\n\n2. 본인은 ○○년 ○월 ○일 귀하에게 금 ○○○원을 변제기 ○○년 ○월 ○일로 정하여 대여한 바 있습니다.\n\n3. 그러나 귀하는 위 변제기가 경과하였음에도 현재까지 위 차용금을 변제하지 아니하고 있습니다.\n\n4. 이에 본인은 귀하에게 이 내용증명을 수령한 날로부터 7일 이내에 위 차용금 금 ○○○원 및 이에 대한 약정이자를 본인의 아래 계좌로 송금하여 주실 것을 최고합니다.\n\n5. 만약 위 기간 내에 이행하지 아니할 경우, 부득이 법적 조치를 취할 수밖에 없음을 알려드립니다.\n\n○○년 ○월 ○일\n발신인 ○○○ (서명 또는 날인)"""},

    {"title": "내용증명 (임대차 보증금 반환 청구)", "form_type": "내용증명", "case_category": "부동산",
     "content": """내용증명\n\n발신인: ○○○ (임차인)\n수신인: ○○○ (임대인)\n\n제목: 임대차보증금 반환 청구서\n\n1. 본인은 귀하 소유의 ○○시 ○○구 ○○동 ○○번지 소재 부동산에 관하여 ○○년 ○월 ○일 보증금 ○○○원, 월 차임 ○○만원으로 임대차계약을 체결하고 거주하여 왔습니다.\n\n2. 위 임대차계약은 ○○년 ○월 ○일 기간만료로 종료되었고, 본인은 같은 날 위 부동산을 귀하에게 명도하였습니다.\n\n3. 그러나 귀하는 현재까지 임대차보증금 ○○○원을 반환하지 않고 있습니다.\n\n4. 주택임대차보호법 제3조의3에 의하면 임대인은 임대차 종료 시 보증금을 반환할 의무가 있습니다.\n\n5. 이에 이 내용증명 수령일로부터 7일 이내에 보증금 전액을 반환하여 주시기 바라며, 불이행 시 법적 절차를 진행할 예정입니다."""},

    # 준비서면
    {"title": "준비서면 (원고측)", "form_type": "준비서면", "case_category": "민사",
     "content": """준비서면\n\n사건: ○○○○가합○○○○\n원고: ○○○\n피고: ○○○\n\n위 사건에 관하여 원고는 다음과 같이 준비서면을 제출합니다.\n\n1. 피고의 답변서에 대한 반박\n\n  가. 피고는 답변서에서 ○○○라고 주장하나, 이는 사실과 다릅니다.\n\n  나. 갑 제○호증에 의하면 ○○○한 사실이 명백합니다.\n\n2. 추가 주장\n\n  가. ○○○\n\n  나. ○○○\n\n3. 결론\n\n  이상과 같은 이유로 원고의 청구는 이유 있으므로 인용되어야 합니다.\n\n입증방법\n1. 갑 제○호증 ○○○\n\n첨부서류\n1. 위 입증방법 각 1통\n2. 준비서면 부본 1통"""},

    # 지급명령신청서
    {"title": "지급명령신청서", "form_type": "지급명령신청서", "case_category": "민사",
     "content": """지급명령신청서\n\n채권자: ○○○\n채무자: ○○○\n\n청구금액: 금 ○○○원\n\n청구취지\n채무자는 채권자에게 금 ○○○원 및 이에 대하여 ○○년 ○월 ○일부터 지급명령 송달일까지는 연 5%, 그 다음날부터 다 갚는 날까지는 연 12%의 각 비율에 의한 금원을 지급하라.\n라는 지급명령을 구합니다.\n\n청구원인\n1. 채권자는 ○○년 ○월 ○일 채무자에게 금 ○○○원을 대여하였습니다.\n2. 변제기: ○○년 ○월 ○일\n3. 채무자는 변제기가 경과하였음에도 이를 변제하지 않고 있습니다.\n\n첨부서류\n1. 차용증 사본 1통\n2. 송달료 납부서 1통"""},

    # 고소장
    {"title": "고소장 (사기)", "form_type": "고소장", "case_category": "형사",
     "content": """고소장\n\n고소인: ○○○ (주민등록번호, 주소, 연락처)\n피고소인: ○○○ (주소, 연락처)\n\n고소취지\n피고소인을 사기죄로 고소하오니 처벌하여 주시기 바랍니다.\n\n고소사실\n1. 고소인과 피고소인의 관계\n  고소인과 피고소인은 ○○○ 관계입니다.\n\n2. 범죄사실\n  피고소인은 ○○년 ○월 ○일경 고소인에게 "○○○"라고 거짓말하여 이에 속은 고소인으로부터 금 ○○○원을 교부받았습니다.\n\n  그러나 피고소인은 처음부터 위 금원을 변제할 의사나 능력이 없었음에도 고소인을 기망하여 금원을 편취한 것입니다.\n\n3. 피고소인의 기망행위의 정황\n  가. ○○○\n  나. ○○○\n\n입증자료\n1. 카카오톡 대화 캡처\n2. 계좌이체 확인서\n3. 기타\n\n○○년 ○월 ○일\n고소인 ○○○ (서명)"""},

    # 가사 - 이혼
    {"title": "소장 (이혼 및 위자료 청구)", "form_type": "소장", "case_category": "가사",
     "content": """소장\n\n원고: ○○○\n피고: ○○○\n\n이혼 및 위자료 등 청구의 소\n\n청구취지\n1. 원고와 피고는 이혼한다.\n2. 피고는 원고에게 위자료로 금 ○○○원 및 이에 대하여 이 사건 판결 확정일 다음날부터 다 갚는 날까지 연 5%의 비율에 의한 금원을 지급하라.\n3. 원고와 피고 사이의 미성년 자녀 ○○○(○○년생)의 친권자 및 양육자를 원고로 지정한다.\n4. 피고는 원고에게 양육비로 위 자녀가 성년에 이를 때까지 매월 ○○만원을 매월 말일에 지급하라.\n5. 소송비용은 피고의 부담으로 한다.\n라는 판결을 구합니다.\n\n청구원인\n1. 혼인관계\n  원고와 피고는 ○○년 ○월 ○일 혼인신고를 마친 법률상 부부입니다.\n2. 이혼사유 (민법 제840조)\n3. 위자료\n4. 양육권 및 양육비"""},

    # 가압류
    {"title": "가압류신청서 (부동산)", "form_type": "가압류신청서", "case_category": "민사",
     "content": """부동산가압류신청서\n\n채권자: ○○○\n채무자: ○○○\n\n피보전권리: 대여금 반환 청구권\n청구금액: 금 ○○○원\n\n신청취지\n채무자 소유의 별지 목록 기재 부동산에 대하여 가압류한다.\n라는 결정을 구합니다.\n\n신청이유\n1. 피보전권리\n  채권자는 채무자에 대하여 금 ○○○원의 대여금 반환 채권을 가지고 있습니다.\n\n2. 보전의 필요성\n  채무자는 현재 다수의 채권자로부터 추심을 받고 있고, 유일한 재산인 별지 목록 기재 부동산을 처분할 우려가 있어 본안소송 전에 보전처분이 필요합니다.\n\n소명방법\n1. 차용증\n2. 부동산 등기부등본"""},

    # 항소장
    {"title": "항소장", "form_type": "항소장", "case_category": "민사",
     "content": """항소장\n\n사건: ○○지방법원 ○○○○가합○○○○\n원고(항소인): ○○○\n피고(피항소인): ○○○\n\n위 사건에 관하여 ○○지방법원이 ○○년 ○월 ○일에 선고한 판결에 대하여 항소합니다.\n\n원심판결의 표시\n○○지방법원 ○○○○년 ○월 ○일 선고 ○○○○가합○○○○ 판결\n\n항소취지\n1. 원심판결을 취소한다.\n2. 피고는 원고에게 금 ○○○원을 지급하라.\n3. 소송비용은 1, 2심 모두 피고의 부담으로 한다.\n라는 판결을 구합니다.\n\n항소이유\n추후 준비서면으로 제출하겠습니다.\n\n첨부서류\n1. 항소장 부본 1통\n2. 송달료 납부서 1통"""},

    # 합의서
    {"title": "합의서 (교통사고)", "form_type": "합의서", "case_category": "민사",
     "content": """합의서\n\n가해자(이하 '갑'이라 한다): ○○○\n피해자(이하 '을'이라 한다): ○○○\n\n갑과 을은 ○○년 ○월 ○일 발생한 교통사고와 관련하여 다음과 같이 합의합니다.\n\n제1조 (사고 내용)\n○○년 ○월 ○일 ○○시 ○○구 ○○로에서 갑의 차량이 을을 충격한 교통사고\n\n제2조 (합의금)\n갑은 을에게 합의금으로 금 ○○○원을 지급한다.\n\n제3조 (지급 방법)\n갑은 이 합의서 작성일로부터 ○일 이내에 을의 계좌로 송금한다.\n\n제4조 (권리 포기)\n을은 위 합의금을 수령한 후 본 사고와 관련하여 갑에 대하여 민·형사상 일체의 이의를 제기하지 아니한다.\n\n제5조 (기타)\n본 합의서는 2부 작성하여 갑, 을이 각 1부씩 보관한다.\n\n○○년 ○월 ○일\n갑: ○○○ (서명)\n을: ○○○ (서명)"""},

    # 행정 - 행정심판
    {"title": "행정심판 청구서", "form_type": "신청서", "case_category": "행정",
     "content": """행정심판 청구서\n\n청구인: ○○○\n피청구인: ○○○장(처분청)\n\n심판청구 취지\n피청구인이 ○○년 ○월 ○일 청구인에 대하여 한 ○○처분을 취소한다.\n라는 재결을 구합니다.\n\n청구원인\n1. 처분의 경위\n2. 처분의 위법·부당 사유\n  가. 사실오인\n  나. 법리오해\n  다. 비례원칙 위반\n  라. 절차적 하자\n3. 결론"""},

    # 강제집행
    {"title": "부동산강제경매신청서", "form_type": "신청서", "case_category": "민사",
     "content": """부동산강제경매신청서\n\n채권자: ○○○\n채무자: ○○○\n\n집행권원: ○○지방법원 ○○○○가합○○○○ 판결정본\n청구금액: 금 ○○○원\n\n신청취지\n별지 목록 기재 부동산에 대한 강제경매를 개시하여 주시기 바랍니다.\n\n첨부서류\n1. 집행력 있는 판결정본 1통\n2. 송달증명원 1통\n3. 부동산 등기부등본 1통\n4. 채권계산서 1통"""},

    # 조정신청서
    {"title": "조정신청서 (민사)", "form_type": "조정신청서", "case_category": "민사",
     "content": """민사조정신청서\n\n신청인: ○○○\n피신청인: ○○○\n\n조정을 구하는 사항\n피신청인은 신청인에게 금 ○○○원을 지급하라.\n\n분쟁의 내용\n1. 신청인과 피신청인의 관계\n2. 분쟁 경위\n3. 조정을 구하는 이유\n\n이 사건은 소송보다 조정을 통하여 원만하게 해결하는 것이 적절하다고 사료되어 이 사건 조정을 신청합니다."""},
]


def classify_form_type(title: str) -> str:
    """제목에서 문서 유형 추출"""
    types = {
        "소장": "소장", "답변서": "답변서", "준비서면": "준비서면",
        "내용증명": "내용증명", "고소장": "고소장", "고발장": "고발장",
        "지급명령": "지급명령신청서", "가압류": "가압류신청서",
        "가처분": "가처분신청서", "합의서": "합의서",
        "항소": "항소장", "상고": "상고장",
        "이의": "이의신청서", "조정": "조정신청서",
        "강제집행": "강제집행신청서", "경매": "신청서",
        "회생": "회생신청서", "파산": "파산신청서",
        "신청서": "신청서",
    }
    for keyword, form_type in types.items():
        if keyword in title:
            return form_type
    return "기타"


def try_scrape_court_sites() -> list[dict]:
    """법원 사이트에서 양식 스크래핑 시도"""
    all_forms = []

    for site in COURT_FORM_URLS:
        print(f"  {site['name']} 시도...")
        try:
            params = site.get("params", {})
            resp = requests.get(
                site["url"],
                params=params,
                headers=HEADERS,
                timeout=30,
                verify=site.get("verify_ssl", True),
            )
            resp.encoding = "utf-8"
            soup = BeautifulSoup(resp.text, "lxml")

            # 테이블 행에서 서식 추출
            for row in soup.select("table tbody tr, .list_table tr"):
                cols = row.select("td")
                if len(cols) < 2:
                    continue

                link = row.select_one("a")
                if not link:
                    continue

                title = link.get_text(strip=True)
                if title and len(title) > 2:
                    category = cols[0].get_text(strip=True) if cols else "기타"
                    all_forms.append({
                        "title": title,
                        "form_type": classify_form_type(title),
                        "case_category": category,
                        "content": title,
                        "source": site["name"],
                    })

            # 리스트 항목에서도 추출
            for li in soup.select("li a, .file_list a"):
                title = li.get_text(strip=True)
                if title and len(title) > 3 and any(kw in title for kw in
                    ["소장", "답변서", "준비서면", "신청서", "고소장", "항소장"]):
                    all_forms.append({
                        "title": title,
                        "form_type": classify_form_type(title),
                        "case_category": "기타",
                        "content": title,
                        "source": site["name"],
                    })

            if all_forms:
                print(f"  → {len(all_forms)}건 수집")

        except Exception as e:
            print(f"  → 실패: {str(e)[:100]}")

    return all_forms


def upload_to_supabase(forms: list[dict]):
    """Supabase legal_forms 테이블에 업로드"""
    url = f"{SUPABASE_URL}/rest/v1/legal_forms"
    success = 0
    errors = 0

    for i in range(0, len(forms), 50):
        batch = forms[i:i+50]
        rows = []
        for f in batch:
            rows.append({
                "form_type": f["form_type"],
                "case_category": f["case_category"],
                "title": f["title"],
                "content": f["content"],
                "source": f.get("source", "법원 양식"),
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
    print("법원 양식모음 수집 시작")
    print("=" * 60)

    all_forms = []

    # 1단계: 법원 사이트 스크래핑 시도
    print("\n[1/3] 법원 사이트 스크래핑...")
    scraped = try_scrape_court_sites()
    all_forms.extend(scraped)

    # 2단계: 스크래핑 결과가 부족하면 내장 템플릿 사용
    print(f"\n[2/3] 스크래핑 결과: {len(scraped)}건")
    if len(scraped) < 10:
        print("  스크래핑 부족 → 실무 양식 템플릿 사용")
        for tmpl in COURT_FORM_TEMPLATES:
            tmpl["source"] = "법원 실무 양식"
            all_forms.append(tmpl)
        print(f"  템플릿 {len(COURT_FORM_TEMPLATES)}건 추가")

    # 중복 제거
    seen = set()
    unique = []
    for f in all_forms:
        if f["title"] not in seen:
            seen.add(f["title"])
            unique.append(f)
    all_forms = unique

    print(f"\n  총 {len(all_forms)}건 (중복 제거 후)")

    # 3단계: 업로드
    print("\n[3/3] Supabase 업로드 중...")
    count = upload_to_supabase(all_forms)

    # 백업
    with open("court_forms_backup.json", "w", encoding="utf-8") as f:
        json.dump(all_forms, f, ensure_ascii=False, indent=2)
    print(f"백업 파일: court_forms_backup.json")

    print(f"\n완료! {count}건 업로드")


if __name__ == "__main__":
    main()
