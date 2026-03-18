/**
 * 한국어 법률 검색 쿼리 전처리 서비스
 *
 * 1. 조사(particles) 제거: "손해배상을" → "손해배상"
 * 2. 복합명사 분해: "손해배상청구소송" → "손해배상 청구 소송"
 * 3. 법률 동의어 확장: "원고" → "원고 청구인 신청인" (도메인별 분리)
 * 4. N-gram 보조: 4글자 이상 → 2글자 서브토큰 추가
 */

// 한국어 조사 패턴 (긴 것부터 매칭하여 오분리 방지)
const PARTICLES: readonly string[] = [
  "에서는", "에서의", "으로서", "으로써", "에게서",
  "에의한", "에대한", "에관한", "에따른", "에따라",
  "에서", "에게", "까지", "부터", "마저", "조차",
  "으로", "에의", "은", "는", "이", "가", "을", "를",
  "에", "의", "로", "와", "과", "도", "만",
];

// 법률 복합명사 분해 사전
const COMPOUND_SPLITS: Readonly<Record<string, readonly string[]>> = {
  "손해배상청구": ["손해배상", "청구"],
  "부당이득반환": ["부당이득", "반환"],
  "채무불이행": ["채무", "불이행"],
  "불법행위": ["불법", "행위"],
  "소유권이전등기": ["소유권", "이전", "등기"],
  "근저당권설정": ["근저당권", "설정"],
  "부당해고구제": ["부당해고", "구제"],
  "재산분할청구": ["재산분할", "청구"],
  "위자료청구": ["위자료", "청구"],
  "임대차보증금": ["임대차", "보증금"],
  "지급명령신청": ["지급명령", "신청"],
  "가압류신청": ["가압류", "신청"],
  "가처분신청": ["가처분", "신청"],
  "명예훼손": ["명예", "훼손"],
  "업무방해": ["업무", "방해"],
  "사기횡령": ["사기", "횡령"],
  "강제집행": ["강제", "집행"],
  "소멸시효": ["소멸", "시효"],
  "제척기간": ["제척", "기간"],
  "부동산매매": ["부동산", "매매"],
  "전세권설정": ["전세권", "설정"],
  "임대차계약": ["임대차", "계약"],
  "근로계약해지": ["근로계약", "해지"],
  "산업재해보상": ["산업재해", "보상"],
  "개인정보침해": ["개인정보", "침해"],
  // 민사소송법
  "소송수계": ["소송", "수계"],
  "소송참가": ["소송", "참가"],
  "소송대리": ["소송", "대리"],
  "소송고지": ["소송", "고지"],
  "소송중단": ["소송", "중단"],
  "소송종료": ["소송", "종료"],
  "소송능력": ["소송", "능력"],
  "당사자적격": ["당사자", "적격"],
  "변론주의": ["변론", "주의"],
  "처분권주의": ["처분권", "주의"],
  "기판력": ["기판", "력"],
  "증거보전": ["증거", "보전"],
  "문서제출명령": ["문서", "제출", "명령"],
  "가집행선고": ["가집행", "선고"],
  "중복제소": ["중복", "제소"],
  "소의이익": ["소", "이익"],
  // 행정법
  "행정심판": ["행정", "심판"],
  "취소소송": ["취소", "소송"],
  "의무이행소송": ["의무", "이행", "소송"],
  "집행정지": ["집행", "정지"],
  "재량행위": ["재량", "행위"],
  "비례원칙": ["비례", "원칙"],
  "신뢰보호원칙": ["신뢰보호", "원칙"],
  "국가배상": ["국가", "배상"],
  "손실보상": ["손실", "보상"],
  "원고적격": ["원고", "적격"],
  "처분성": ["처분", "성"],
  "행정입법": ["행정", "입법"],
  "정보공개": ["정보", "공개"],
};

// ──────────────────────────────────────────────
// 도메인별 법률 동의어 사전
// ──────────────────────────────────────────────

/** 도메인별 동의어 구조 타입 */
export interface DomainSynonyms {
  universal: Record<string, string[]>;
  민사: Record<string, string[]>;
  형사: Record<string, string[]>;
  가사: Record<string, string[]>;
  행정: Record<string, string[]>;
  노동: Record<string, string[]>;
  부동산: Record<string, string[]>;
}

/** 도메인별 법률 동의어 사전 (테스트용으로 export) */
export const DOMAIN_SYNONYMS: DomainSynonyms = {
  // 모든 분야 공통 (~25 그룹)
  universal: {
    "임대인": ["집주인", "건물주"],
    "임차인": ["세입자"],
    "매도인": ["판매자", "양도인"],
    "매수인": ["구매자", "양수인"],
    "차임": ["월세", "임대료"],
    "보증금": ["전세금", "임대보증금"],
    "변제": ["상환", "갚다"],
    "대여금": ["차용금", "빌린돈"],
    "소멸시효": ["시효"],
    "불법행위": ["위법행위"],
    "계약해제": ["계약취소", "계약해지"],
    "손해배상": ["배상"],
    "가처분": ["임시처분"],
    "가압류": ["임시압류"],
    "강제집행": ["집행"],
    "내용증명": ["통고서"],
    "합의": ["화해", "조정"],
    "증거": ["증빙", "입증자료"],
    "소송비용": ["재판비용"],
    "법률구조": ["법률지원"],
    "위임": ["대리", "수임"],
    "항소": ["불복", "상소"],
    "기각": ["각하"],
    "인용": ["승소"],
    "패소": ["기각"],
  },

  // 민사 전용 (~8 그룹)
  민사: {
    "원고": ["청구인", "소송당사자"],
    "피고": ["상대방"],
    "소장": ["소송서류"],
    "답변서": ["항변서"],
    "준비서면": ["변론서면"],
    "채권": ["청구권"],
    "채무": ["의무"],
    "부당이득": ["부당이득반환"],
  },

  // 형사 전용 (~6 그룹)
  형사: {
    "피의자": ["용의자", "혐의자"],
    "피해자": ["고소인"],
    "기소": ["공소제기"],
    "벌금": ["과태료", "범칙금"],
    "구속": ["체포", "구금"],
    "보석": ["석방"],
  },

  // 가사 전용 (~5 그룹)
  가사: {
    "이혼": ["혼인해소", "파경"],
    "위자료": ["정신적손해배상"],
    "양육권": ["친권", "양육자지정"],
    "재산분할": ["재산청산"],
    "면접교섭권": ["면접권"],
  },

  // 행정 전용
  행정: {
    "청구인": ["심판청구인"],
    "처분": ["행정처분", "행정행위"],
    "취소소송": ["항고소송"],
    "인허가": ["허가", "면허", "승인"],
    "재량행위": ["재량처분"],
    "기속행위": ["기속처분"],
    "원고적격": ["당사자적격"],
    "집행정지": ["효력정지"],
    "국가배상": ["공무원배상"],
    "손실보상": ["보상금"],
    "행정심판": ["행정불복"],
    "정보공개": ["문서공개"],
  },

  // 노동 전용 (~5 그룹)
  노동: {
    "해고": ["면직", "파면", "해직"],
    "퇴직금": ["퇴직급여"],
    "근로자": ["노동자", "직원", "종업원"],
    "사용자": ["사업주", "고용주"],
    "부당해고": ["부당면직"],
  },

  // 부동산 전용 (~4 그룹)
  부동산: {
    "등기": ["부동산등기"],
    "소유권이전": ["명의이전"],
    "근저당": ["저당권"],
    "전세권": ["전세"],
  },
};

/**
 * CaseType 문자열을 DomainSynonyms 키로 매핑합니다.
 * "채권·채무", "손해배상" 등 DOMAIN_SYNONYMS에 없는 CaseType은 가장 관련 높은 도메인으로 매핑합니다.
 */
function resolveDomainKey(caseType: string): keyof DomainSynonyms | null {
  const domainKeys: Array<keyof DomainSynonyms> = [
    "민사", "형사", "가사", "행정", "노동", "부동산",
  ];

  // 직접 매칭
  if (domainKeys.includes(caseType as keyof DomainSynonyms)) {
    return caseType as keyof DomainSynonyms;
  }

  // 관련 도메인 매핑 (CLAUDE.md의 CaseType 참고)
  const fallbackMap: Record<string, keyof DomainSynonyms> = {
    "채권·채무": "민사",
    "손해배상": "민사",
    "기타": "민사",
  };

  return fallbackMap[caseType] ?? null;
}

/**
 * 지정된 caseType에 해당하는 양방향 동의어 맵을 빌드합니다.
 * universal + 해당 도메인의 동의어만 포함합니다.
 * 양방향: "원고" → ["청구인"] 이면 "청구인" → ["원고"]도 자동 생성.
 */
function buildBidirectionalMap(caseType?: string): ReadonlyMap<string, readonly string[]> {
  const groups: Array<Record<string, string[]>> = [DOMAIN_SYNONYMS.universal];

  if (caseType) {
    const domainKey = resolveDomainKey(caseType);
    if (domainKey && domainKey !== "universal") {
      groups.push(DOMAIN_SYNONYMS[domainKey]);
    }
  }

  // 역방향 매핑을 포함한 완전한 동의어 맵 구축
  const result = new Map<string, Set<string>>();

  for (const dict of groups) {
    for (const [canonical, synonyms] of Object.entries(dict)) {
      // canonical과 synonyms를 하나의 그룹으로 묶음
      const allTerms = [canonical, ...synonyms];

      for (const term of allTerms) {
        if (!result.has(term)) {
          result.set(term, new Set<string>());
        }
        const termSet = result.get(term)!;
        for (const other of allTerms) {
          if (other !== term) {
            termSet.add(other);
          }
        }
      }
    }
  }

  // Set → readonly string[] 변환
  const finalMap = new Map<string, readonly string[]>();
  for (const [key, valueSet] of result) {
    finalMap.set(key, [...valueSet]);
  }

  return finalMap;
}

/**
 * 한국어 조사를 제거합니다.
 * 가장 긴 조사부터 매칭하여 오분리를 방지합니다.
 */
function removeParticles(token: string): string {
  if (token.length <= 2) return token; // 2글자 이하는 조사 제거 안함

  for (const particle of PARTICLES) {
    if (token.endsWith(particle) && token.length > particle.length + 1) {
      return token.slice(0, -particle.length);
    }
  }
  return token;
}

/**
 * 복합명사를 분해합니다.
 */
function decomposeCompounds(token: string): string[] {
  for (const [compound, parts] of Object.entries(COMPOUND_SPLITS)) {
    if (token === compound || token.includes(compound)) {
      const remaining = token.replace(compound, "");
      return [...parts, ...(remaining ? [remaining] : [])];
    }
  }
  return [token];
}

/**
 * 4글자 이상 한글 토큰에서 2글자 서브토큰을 추출합니다.
 */
function extractBigrams(token: string): string[] {
  if (!/^[가-힣]{4,}$/.test(token)) return [];

  const bigrams: string[] = [];
  for (let i = 0; i < token.length - 1; i++) {
    bigrams.push(token.slice(i, i + 2));
  }
  return bigrams;
}

/**
 * 한국어 법률 검색 쿼리를 전처리합니다.
 * FTS 키워드 매칭 정확도를 향상시킵니다.
 *
 * @param query - 원본 쿼리
 * @param caseType - 사건 유형 (도메인별 동의어 필터링에 사용)
 * @returns 전처리된 쿼리 (조사 제거 + 복합어 분해 + 도메인별 양방향 동의어 확장)
 */
export function preprocessKoreanQuery(query: string, caseType?: string): string {
  const tokens = query.split(/\s+/).filter(Boolean);
  const result: string[] = [];

  // 해당 도메인에 맞는 양방향 동의어 맵 빌드
  const synonymMap = buildBidirectionalMap(caseType);

  for (const rawToken of tokens) {
    // 1. 조사 제거
    const cleaned = removeParticles(rawToken);

    // 2. 복합명사 분해
    const decomposed = decomposeCompounds(cleaned);
    result.push(...decomposed);

    // 3. 2글자 서브토큰 추가 (4글자 이상만)
    for (const part of decomposed) {
      result.push(...extractBigrams(part));
    }

    // 4. 양방향 동의어 확장 (universal + 해당 도메인만)
    for (const part of decomposed) {
      const synonyms = synonymMap.get(part);
      if (synonyms) result.push(...synonyms);
    }
  }

  // 중복 제거 + 2글자 이상만
  return [...new Set(result)]
    .filter((t) => t.length >= 2)
    .join(" ");
}

/**
 * 시맨틱 검색용 쿼리 전처리 (조사 제거 + 도메인별 동의어 확장)
 * 임베딩 모델에 핵심 용어와 동의어를 제공하여 검색 재현율을 높입니다.
 *
 * @param query - 원본 쿼리
 * @param caseType - 사건 유형 (도메인별 동의어 필터링에 사용)
 */
export function preprocessForSemantic(query: string, caseType?: string): string {
  const tokens = query.split(/\s+/).filter(Boolean);
  const result: string[] = [];

  const synonymMap = buildBidirectionalMap(caseType);

  for (const rawToken of tokens) {
    const cleaned = removeParticles(rawToken);
    if (cleaned.length >= 2) {
      result.push(cleaned);

      // 동의어 확장 (시맨틱 검색에도 도메인별 동의어 추가)
      const synonyms = synonymMap.get(cleaned);
      if (synonyms) result.push(...synonyms);
    }
  }

  return [...new Set(result)].join(" ");
}
