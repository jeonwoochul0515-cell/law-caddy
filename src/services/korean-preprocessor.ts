/**
 * 한국어 법률 검색 쿼리 전처리 서비스
 *
 * 1. 조사(particles) 제거: "손해배상을" → "손해배상"
 * 2. 복합명사 분해: "손해배상청구소송" → "손해배상 청구 소송"
 * 3. 법률 동의어 확장: "원고" → "원고 청구인 신청인"
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
};

// 법률 동의어 사전
const LEGAL_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  "원고": ["청구인", "신청인"],
  "피고": ["피청구인", "피신청인"],
  "판결": ["선고", "결정"],
  "소송": ["재판", "심판"],
  "변호사": ["대리인", "소송대리인"],
  "증거": ["증빙", "소명자료"],
  "해고": ["면직", "파면"],
  "계약": ["약정", "합의"],
  "채권": ["청구권", "권리"],
  "채무": ["의무", "부담"],
};

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
 * @returns 전처리된 쿼리 (조사 제거 + 복합어 분해 + 동의어 확장)
 */
export function preprocessKoreanQuery(query: string): string {
  const tokens = query.split(/\s+/).filter(Boolean);
  const result: string[] = [];

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

    // 4. 동의어 확장
    for (const part of decomposed) {
      const synonyms = LEGAL_SYNONYMS[part];
      if (synonyms) result.push(...synonyms);
    }
  }

  // 중복 제거 + 2글자 이상만
  return [...new Set(result)]
    .filter((t) => t.length >= 2)
    .join(" ");
}

/**
 * 시맨틱 검색용 쿼리 전처리 (조사 제거만, 확장 없음)
 * 임베딩 모델에 불필요한 노이즈를 줄입니다.
 */
export function preprocessForSemantic(query: string): string {
  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens
    .map(removeParticles)
    .filter((t) => t.length >= 2)
    .join(" ");
}
