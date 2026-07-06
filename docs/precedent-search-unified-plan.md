# 판례 검색 품질 개선 — 통합 실행 계획 (v3)

> 2개 리서치 문서 + 16개 에이전트 팀 테스트 결과를 통합한 최종 계획.  
> 목표: 실패 이력 6회를 끊고, 변호사 실무 수준의 판례 검색 품질을 달성한다.

---

## 0. 이 계획이 이전과 다른 점

| 항목 | 이전 6회 시도 | 이번 계획 |
|------|-------------|-----------|
| API 테스트 | 없음 (추측 기반) | 6개 가상 케이스 실제 API 호출로 검증 완료 |
| JO 파라미터 | 존재 여부조차 몰랐음 | 작동 방식 완전 파악 (법률명 필터링, 조문번호 무시) |
| 참조판례 체인 | 시도한 적 없음 | 1건 조회로 리딩케이스 3~5건 자동 발견 (테스트 검증) |
| 근본 원인 | 매번 증상만 치료 | 3가지 근본 원인 모두 식별 + 각각에 대응 |
| 안전장치 | 없음 | 각 Phase 독립 실행 가능, 롤백 용이 |

---

## 1. 진단 요약

### 1.1 과거 실패 6회의 공통점

모두 **"검색 엔진이 결과를 반환하지 않는 문제"를 해결하지 못하고, 그 주변만 수정**했다.

```
실패 1: 에러 핸들링 없음 → 0건 → Claude 환각
실패 2: 환각 허용 ([검증필요]) → 가짜 판례 생성
실패 3: 환각 차단 → "추가 검색 필요" (=아무것도 안 함)
실패 4: 타임아웃/재시도 추가 → API 성공하지만 여전히 0건
실패 5: 순차 처리/딜레이 → 안정화되었지만 여전히 0건
실패 6: RAG 버그 발견 → 문서만 작성, 코드 미적용
```

### 1.2 3가지 근본 원인

| # | 근본 원인 | 현재 상태 | 해결 Phase |
|---|-----------|-----------|------------|
| 1 | 법조문 기반 검색 미사용 (JO 파라미터) | API에 있지만 코드에서 호출 안 함 | Phase 2 |
| 2 | 참조판례 체인 추적 미사용 | 상세 조회는 하지만 refCases 필드 무시 | Phase 2 |
| 3 | RAG 41만건 판례 DB를 한판서가 미사용 | Stage 1에서만 RAG 사용, Stage 2에 미전달 | Phase 3 |

### 1.3 API 실전 테스트로 확인된 사실

```
법제처 API:
  ✅ 정상 작동 (응답 1~3초, Rate Limit 없음)
  ✅ JO 파라미터 작동 (법률명 필터, 조문번호는 무시됨)
  ✅ nb 파라미터 작동 (사건번호로 직접 검색)
  ✅ JO + query 조합이 가장 정밀
  ✅ display=200까지 가능
  ⚠️ org=400201 불안정 → 사용하지 않는 것이 안전
  ⚠️ 사건명(evtNm) 기반 검색 → 법리 용어로는 0건
  ⚠️ 복합 키워드 → 0건 (단일 정확 키워드가 최적)
```

---

## 2. 통합 파이프라인 설계

### 2.1 현재 → 목표

```
[현재: 3-Stage]
  Stage 1: 서혜안(쟁점+키워드) → Stage 2: 한판서(키워드만 검색) → Stage 3: 최감수(프롬프트 검증만)

[목표: 4-Stage]
  Stage 1: 서혜안(쟁점 + 법조문 매핑 + 검색 설계)
      ↓
  Stage 2: 한판서(4-Source 병합 검색 + 참조판례 체인)
      ↓
  Stage 3: 한판서(판례 분석 + CaseRef 생성)
      ↓
  Stage 4: 최감수(3중 교차검증 + 사건번호 실존 확인 + 폐기 확인)
```

### 2.2 서혜안 → 한판서 핸드오프 구조

**현재 출력**:
```json
[{"id":1, "issue":"...", "keywords":["손해배상","불법행위"], "priority":"high"}]
```

**개선 출력**:
```json
[{
  "id": 1,
  "issue": "불법행위에 기한 손해배상청구권 성립 여부",
  "statutes": [
    {"law": "민법", "article": "제750조", "content": "불법행위의 성립요건"},
    {"law": "민법", "article": "제751조", "content": "재산 이외의 손해배상"}
  ],
  "searchQueries": {
    "statute": ["민법 제750조", "민법 제751조"],
    "keyword": ["의료과실 손해배상", "설명의무 위반"],
    "semantic": "피고의 과실로 인한 불법행위가 성립하는지"
  },
  "joSearch": [
    {"law": "민법", "query": "손해배상"},
    {"law": "민법", "query": "제750조"}
  ],
  "priority": "high"
}]
```

**핵심 추가 필드**:
- `statutes[]` — 관련 법조문 + 해당 조문의 핵심 내용
- `searchQueries` — 법조문/키워드/시맨틱 3종 검색어 분리 설계
- `joSearch[]` — 법제처 API JO+query 조합 (직접 사용 가능)

### 2.3 한판서 4-Source 검색 전략

```
Source A: JO 파라미터 법조문 검색 (신규)
  법제처 API: JO=법률명 + query=키워드/조문번호
  → 해당 법률을 참조한 판례 목록

Source B: 키워드 검색 (기존, 유지)
  법제처 API: query=단일정확키워드
  → 사건명에 키워드가 포함된 판례 목록

Source C: 참조판례 체인 추적 (신규, 가장 큰 임팩트)
  Source A/B 상위 결과의 상세 조회 → refCases 필드에서 사건번호 추출
  → nb 파라미터로 참조판례 개별 검색/조회
  → 리딩케이스 자동 발견

Source D: RAG 시맨틱 검색 (기존 인프라 활용)
  Supabase 벡터 검색: cases + legal_judgments 테이블
  → 키워드로 못 찾는 유사 법리 판례 발견
```

**병합 로직**:
```
4-Source 결과 수집 (각 5~15건, 총 20~40건)
    ↓
사건번호 기준 중복 제거
    ↓
법원 계층 가중치 적용:
  - 대법원 전원합의체: x1.5
  - 대법원: x1.0
  - 고등법원: x0.7
  - 지방법원: x0.5
    ↓
최종 상위 8~10건 선택 → 한판서에 전달
```

### 2.4 CaseRef 출력 구조 (완전판)

**현재**:
```json
{"id":"CaseRef-1", "court":"대법원", "caseNumber":"2017다241819", "group":"A", "keyHolding":"..."}
```

**개선**:
```json
{
  "id": "CaseRef-1",
  "court": "대법원",
  "division": "전원합의체",
  "caseNumber": "2017다241819",
  "date": "2017. 11. 29.",
  "caseType": "leading",
  "group": "A",
  "relatedStatutes": ["민법 제750조", "민법 제751조"],
  "keyHolding": "핵심 판시사항",
  "factSimilarity": "high",
  "overruled": false,
  "source": "law.go.kr"
}
```

**추가 필드 설명**:
| 필드 | 용도 | 값 |
|------|------|-----|
| `division` | 전원합의체 여부 (리딩케이스 판별) | "전원합의체" / null |
| `caseType` | 판례 유형 분류 | "leading" / "supporting" / "adverse" |
| `relatedStatutes` | 이 판례가 해석한 법조문 | ["민법 제750조"] |
| `factSimilarity` | 본 사건과 사실관계 유사도 | "high" / "medium" / "low" |
| `overruled` | 후속 전원합의체로 폐기 여부 | true / false |
| `source` | 출처 | "law.go.kr" / "rag-db" / "citation-chain" |

---

## 3. Phase별 실행 계획

### Phase 1: 프롬프트 개선 (코드 변경 최소, 즉시 적용)

> **목표**: 검색 엔진을 건드리지 않고, AI 에이전트의 "사고 방식"만 개선.  
> **위험도**: 낮음 (기존 동작에 영향 없음, 새 필드는 optional)

#### 1-A. 서혜안 프롬프트 강화

| 파일 | 수정 위치 | 내용 |
|------|-----------|------|
| `prompts.ts` | 서혜안 검색 키워드 JSON 섹션 (L486~491) | statutes[], searchQueries{}, joSearch[] 추가 |

**프롬프트에 추가할 내용**:
```
## 한판서 연동용 — 쟁점별 검색 설계 (JSON)

각 쟁점에 대해 법조문 매핑과 검색 전략을 설계하세요:

[{
  "id": 1,
  "issue": "쟁점명",
  "statutes": [
    {"law": "법률명(정식)", "article": "제N조", "content": "조문 핵심 내용"}
  ],
  "searchQueries": {
    "statute": ["법률명 제N조"],
    "keyword": ["법률 전문용어 1~2개 단어 조합"],
    "semantic": "이 쟁점의 법리를 자연어로 서술한 문장"
  },
  "joSearch": [
    {"law": "법률명", "query": "검색 키워드"}
  ],
  "priority": "high|medium|low"
}]

### 법조문 매핑 규칙
- 각 쟁점에 대해 근거 법조문을 반드시 1개 이상 매핑
- 법률명은 정식 명칭 사용 (민법, 형법, 근로기준법 등)
- 조문 번호를 확신할 수 없으면 "[조문 확인 필요]" 표시
- 특별법 우선: 일반법(민법)보다 특별법(주택임대차보호법) 우선 매핑

### 검색 키워드 설계 규칙 (API 테스트 기반)
- keyword: 단일 정확 법률용어 1~2개 단어 (예: "편취", "의료과실", "부당해고")
  ※ 3어절 이상 조합은 법제처 API에서 0건 반환됨 — 짧고 정확하게
- semantic: 판사가 판결문에 쓸 법한 자연어 문장
- joSearch: law에 법률명, query에 키워드 또는 "제N조" (법제처 JO 파라미터용)
```

#### 1-B. 한판서 프롬프트 강화

| 파일 | 수정 위치 | 내용 |
|------|-----------|------|
| `prompts.ts` | 한판서 분석 형식 섹션 (L313~347) | 리딩케이스/보강/불리 구분 + 요건사실 분석 + 폐기 확인 |

**프롬프트에 추가할 내용**:
```
### 판례 유형 분류 기준
- **리딩케이스 (Leading Case)**: 대법원 전원합의체 판결, 또는 최초로 법리를 선언한 대법원 판결
- **보강 판례 (Supporting)**: 리딩케이스의 법리를 구체적 사안에 적용한 후속 판결
- **불리 판례 (Adverse)**: 상대방이 인용할 가능성이 높은 판례 + Distinguish 전략

### 각 판례 분석 형식
- **판례 유형**: 리딩케이스 / 보강 판례 / 불리 판례
- **해석 법조문**: {이 판례가 해석한 법조문}
- **사안 요약**: {사실관계 3~4문장}
- **핵심 법리**: {판시사항 핵심 — 판결문 원문 인용}
- **요건사실 분석**:
  ① {요건 1}: 충족 여부 + 근거
  ② {요건 2}: 충족 여부 + 근거
- **본 사건 적용**:
  - 유사점: {사실관계·법률관계의 유사성}
  - 차이점: {구별되는 부분과 결론에 미치는 영향}
- **폐기 여부**: 이 판례가 후속 전원합의체 판결로 변경되었는지 확인. 폐기된 경우 [폐기됨] 표시 + 변경 판례 함께 제시

### 리딩케이스 우선 인용 원칙
1순위: 대법원 전원합의체 판결
2순위: 최초 법리 선언 대법원 판결
3순위: 최신 대법원 판결 (같은 법리 재확인)
4순위: 사실관계 유사 하급심 판결
```

#### 1-C. CaseRef 인터페이스 확장

| 파일 | 수정 위치 | 내용 |
|------|-----------|------|
| `types/document.ts` | CaseRef 인터페이스 (L56~63) | 6개 필드 추가 (모두 optional) |
| `prompts.ts` | CaseRef JSON 출력 형식 (L349~357) | 새 필드 포함 형식으로 변경 |

```typescript
export interface CaseRef {
  id: string;
  court: string;
  date: string;
  caseNumber: string;
  group: "A" | "B" | "C";
  keyHolding: string;
  // Phase 1 추가 (optional — 기존 파싱 로직에 영향 없음)
  division?: string;           // "전원합의체" | null
  caseType?: "leading" | "supporting" | "adverse";
  relatedStatutes?: string[];  // ["민법 제750조"]
  factSimilarity?: "high" | "medium" | "low";
  overruled?: boolean;
  source?: string;             // "law.go.kr" | "rag-db" | "citation-chain"
}
```

**안전장치**: 모든 새 필드가 optional이므로 기존 CaseRef 파싱 로직이 깨지지 않음.

#### 1-D. 한판서 분석 깊이 강화 (프롬프트만)

| 파일 | 수정 위치 | 내용 |
|------|-----------|------|
| `prompts.ts` | 한판서 검색 전략 지시 (L297 부근) | 검색 우선순위 + 판례 유효성 확인 지시 추가 |

```
## 검색 전략 우선순위

### 1순위: 법조문 해석 판례 (리딩케이스)
- 서혜안이 매핑한 statutes의 법조문을 해석한 대법원 판례 우선
- 전원합의체 판결 → 대법원 판결 → 고등법원 순서

### 2순위: 사실관계 유사 판례 (보강)
- 본 사건과 사실관계가 유사한 판례
- 리딩케이스의 법리를 구체적 사안에 적용한 사례

### 3순위: 불리한 판례 & Distinguish 전략
- 상대방이 인용할 가능성이 높은 판례
- 왜 본 사건에 직접 적용되지 않는지 구별 논거 제시

### 판례 유효성 확인
- 전원합의체 판결로 폐기·변경된 판례가 아닌지 확인
- 폐기된 판례 발견 시 "[폐기됨]" 표시 + 변경 판례 함께 제시
```

---

### Phase 2: 검색 엔진 핵심 개선 (코드 변경 필요)

> **목표**: 4-Source 검색 + 참조판례 체인 추적으로 양질의 판례 확보.  
> **위험도**: 중간 (새 함수 추가, 기존 함수 수정)

#### 2-A. Cloudflare proxy에 JO, nb 파라미터 지원 추가

| 파일 | 수정 내용 |
|------|-----------|
| `functions/api/precedent-search.ts` | Request body에 `jo`, `nb` 파라미터 추가, URL 빌드 시 반영 |

```typescript
// Request body 확장
interface PrecedentSearchRequest {
  query?: string;
  count?: number;
  target?: "prec" | "detc" | "expc";
  id?: string;
  detcId?: string;
  jo?: string;     // 신규: 법률명 (JO 파라미터)
  nb?: string;     // 신규: 사건번호 (nb 파라미터)
}

// URL 빌드 시 JO, nb 파라미터 추가
const params = new URLSearchParams({
  OC: LAW_API_OC,
  target: target,
  type: "JSON",
  display: String(count),
  sort: "ddes",
});
if (body.query) params.set("query", body.query);
if (body.jo) params.set("JO", body.jo);
if (body.nb) params.set("nb", body.nb);
```

**안전장치**: jo, nb는 optional. 기존 query 기반 검색에 영향 없음.

#### 2-B. 프론트엔드 API 클라이언트에 새 함수 추가

| 파일 | 수정 내용 |
|------|-----------|
| `src/services/precedent-api.ts` | searchByStatute(), searchByCaseNumber() 추가 |

```typescript
// 법조문 기반 판례 검색 (JO + query 조합)
export async function searchByStatute(
  lawName: string,    // "민법", "형법"
  query: string,      // "손해배상", "제750조"
  count: number = 10,
): Promise<PrecedentCase[]> {
  if (!lawName.trim()) return [];
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ jo: lawName, query, count, target: "prec" }),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as PrecedentSearchResponse;
    return data.precedents ?? [];
  } catch { return []; }
}

// 사건번호로 판례 검색 (nb 파라미터, 참조판례 체인용)
export async function searchByCaseNumber(
  caseNumber: string,
  count: number = 3,
): Promise<PrecedentCase[]> {
  if (!caseNumber.trim()) return [];
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ nb: caseNumber, count, target: "prec" }),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as PrecedentSearchResponse;
    return data.precedents ?? [];
  } catch { return []; }
}
```

#### 2-C. 참조판례 체인 추적 (Citation Chaining) 구현

| 파일 | 수정 내용 |
|------|-----------|
| `src/hooks/useAgents.ts` | Stage 2 한판서 검색 루프에 체인 추적 로직 추가 |
| `src/services/precedent-api.ts` | extractCaseNumbers() 유틸 함수 추가 |

```typescript
// precedent-api.ts — 참조판례 필드에서 사건번호 추출
export function extractCaseNumbers(refCasesHtml: string): string[] {
  // 대법원/고등법원/지방법원 사건번호 패턴
  // 예: "대법원 2002. 10. 28. 선고 2002다45185 판결"
  const pattern = /(\d{2,4}[다나가마바사아자차카타파하두누구무부수우주추쿠투푸후므]\d{1,8})/g;
  const matches = refCasesHtml.match(pattern) ?? [];
  return [...new Set(matches)]; // 중복 제거
}

// useAgents.ts — Stage 2에 체인 추적 추가
// 기존 상세 조회 루프 뒤에 추가
for (const prec of topForIssue) {
  if (!prec.refCases) continue;
  const refNumbers = extractCaseNumbers(prec.refCases);
  for (const refNum of refNumbers.slice(0, 3)) { // 판례당 최대 3건만 추적
    if (seen.has(refNum)) continue;
    try {
      const refResults = await searchByCaseNumber(refNum, 1);
      if (refResults.length > 0 && !seen.has(refResults[0].caseNumber)) {
        seen.add(refResults[0].caseNumber);
        chainedPrecedents.push(refResults[0]);
      }
      await delay(300);
    } catch { /* continue */ }
  }
}
// 총 체인 추적 상한: 9건 (3 이슈 × 3건)
```

**API 호출 예산**:
```
기존: 이슈당 키워드 2개 × (검색 + 헌재) = 4 호출 → 상세 3 호출 = 7 호출/이슈
추가: JO 검색 1 호출 + 체인 추적 3 호출 = 4 호출/이슈
합계: 11 호출/이슈 × 3 이슈 = 33 호출 × 300ms = ~10초 추가
```

#### 2-D. RAG 시맨틱 검색을 Stage 2에 연결

| 파일 | 수정 내용 |
|------|-----------|
| `src/hooks/useAgents.ts` | Stage 2 context에 RAG 결과 포함 |

```typescript
// 현재: RAG 결과 없이 precedent context 생성
const precedentContext: RunAgentsContext = {
  ...context,
  searchKeywords,
  identifiedIssues,
};

// 개선: RAG 결과 포함
const precedentRAG = await searchPool.getForAgent("precedent");
const precedentContext: RunAgentsContext = {
  ...context,
  searchKeywords,
  identifiedIssues,
  ragContext: precedentRAG ? formatRAGContext(precedentRAG) : undefined,
};
```

**안전장치**: RAG 검색 실패 시 undefined → 기존 법제처 API 검색만으로 동작.

#### 2-E. 4-Source 결과 병합 & 중복 제거

| 파일 | 수정 내용 |
|------|-----------|
| `src/hooks/useAgents.ts` | 4-Source 결과를 단일 목록으로 병합 후 포맷팅 |

```
Source A: JO 법조문 검색 결과
Source B: 키워드 검색 결과 (기존)
Source C: 참조판례 체인 추적 결과
Source D: RAG 시맨틱 검색 결과 (컨텍스트로 전달)
    ↓
사건번호 기준 중복 제거 (기존 Set 로직 확장)
    ↓
법원 계층 가중치:
  전원합의체 → 1.5x
  대법원 → 1.0x
  고등법원 → 0.7x
  지방법원 → 0.5x
    ↓
상위 8~10건 선택 → formatPrecedentsForPrompt() → 한판서 프롬프트에 주입
```

---

### Phase 3: RAG 안정화 (기존 버그 수정)

> **목표**: 기존 RAG 인프라의 알려진 버그를 수정하여 시맨틱 검색 정상화.  
> **위험도**: 중간 (Supabase RPC 함수 수정 필요)

#### 3-A. RAG 임계값 수정

| 파일 | 수정 내용 |
|------|-----------|
| `src/services/rag.ts` | match_threshold을 동적 임계값으로 변경 |

```typescript
// 현재: 고정 임계값 0.30 (너무 높아서 유효 결과 필터링됨)
// 개선: 동적 임계값 (상위 점수의 40%, 최소 0.08)
const threshold = Math.max(topScore * 0.4, 0.08);
```

#### 3-B. ts_rank 정규화 (Supabase RPC)

| 파일 | 수정 내용 |
|------|-----------|
| Supabase RPC 함수 | ts_rank에 flag 32 추가하여 0~1 범위로 정규화 |

```sql
-- 현재: ts_rank 반환값 0.001~0.1 (정규화 안 됨)
ts_rank(fts, query)::float AS keyword_score

-- 개선: flag 32로 정규화하여 0~1 범위
ts_rank(fts, query, 32)::float AS keyword_score
```

---

### Phase 4: 검증 & 안정성 강화

> **목표**: 판례 실존 검증, 폐기 확인, 에러 상태 구분으로 신뢰성 확보.  
> **위험도**: 낮음 (추가 검증 레이어, 기존 동작에 영향 없음)

#### 4-A. 사건번호 실존 자동 검증

| 파일 | 수정 내용 |
|------|-----------|
| `src/hooks/useAgents.ts` | CaseRef 파싱 후 nb 파라미터로 실존 확인 |

```typescript
// CaseRef 파싱 후 실존 검증
for (const ref of caseRefs) {
  try {
    const results = await searchByCaseNumber(ref.caseNumber, 1);
    if (!results || results.length === 0) {
      ref.verified = false; // 미확인 마킹
      console.warn(`[검증] ${ref.caseNumber}: 법제처 API에서 미확인`);
    } else {
      // 법원명·선고일 교차 대조
      const matched = results[0];
      if (matched.court !== ref.court || matched.date !== ref.date) {
        console.warn(`[검증] ${ref.caseNumber}: 정보 불일치 (${matched.court} vs ${ref.court})`);
      }
    }
    await delay(300);
  } catch { /* 검증 실패해도 계속 진행 */ }
}
```

**안전장치**: 검증 실패해도 CaseRef는 유지됨 (verified 플래그만 추가). 검증에 실패한다고 기능이 멈추지 않음.

#### 4-B. 판례 폐기 여부 확인

| 파일 | 수정 내용 |
|------|-----------|
| `src/services/prompts.ts` | 최감수 3중 검증에 폐기 확인 항목 추가 |

```
### ④ 판례 폐기 여부 확인
인용된 판례 중 다음을 확인하세요:
- 전원합의체 판결로 변경(폐기)된 판례가 있는지
- 판시사항이나 참조판례에 "변경", "폐기", "전원합의체" 키워드가 있는지
- 폐기된 판례 인용 발견 시: "⛔ [사건번호]: 이 판례는 [변경 판례]에 의해 변경되었습니다. 현행 법리에 맞게 수정하세요."
```

#### 4-C. 법조문 실존 검증

| 파일 | 수정 내용 |
|------|-----------|
| `src/services/prompts.ts` | 최감수 검증에 법조문 정합성 항목 추가 |

```
### ⑤ 법조문 정합성 검증
- 본문에서 인용한 법조문이 실제 존재하는 조문인지
- 인용한 판례가 해당 법조문을 실제로 해석한 것인지 (참조조문 필드 대조)
- 법조문 번호가 의심되면: "⚠️ [법률명 제N조]: 조문 번호 확인이 필요합니다"
```

#### 4-D. 에러 상태 구분

| 파일 | 수정 내용 |
|------|-----------|
| `src/services/precedent-api.ts` | 반환 타입에 에러 상태 추가 |
| `src/hooks/useAgents.ts` | 에러 상태에 따른 분기 처리 |

```typescript
// 현재: 모든 실패 → 빈 배열 [] (구분 불가)
// 개선: 에러 상태 구분
type PrecedentSearchResult =
  | { status: "success"; precedents: PrecedentCase[] }
  | { status: "no_results" }
  | { status: "error"; message: string };
```

---

## 4. 파일별 수정 범위 (전체)

| 파일 | Phase | 수정 내용 | 위험도 |
|------|-------|-----------|--------|
| `src/services/prompts.ts` | 1 | 서혜안/한판서 프롬프트 강화, CaseRef 출력 형식, 최감수 검증 항목 | 낮음 |
| `src/types/document.ts` | 1 | CaseRef 인터페이스 확장 (optional 필드) | 낮음 |
| `functions/api/precedent-search.ts` | 2 | jo, nb 파라미터 지원 추가 | 중간 |
| `src/services/precedent-api.ts` | 2 | searchByStatute(), searchByCaseNumber(), extractCaseNumbers() | 중간 |
| `src/hooks/useAgents.ts` | 2 | 4-Source 검색 + Citation Chaining + RAG 연결 + 실존 검증 | 높음 |
| `src/services/rag.ts` | 3 | 동적 임계값 적용 | 중간 |
| Supabase RPC 함수 | 3 | ts_rank 정규화 (flag 32) | 중간 |

---

## 5. 위험 요소 & 대응

| 위험 | 확률 | 영향 | 대응 |
|------|------|------|------|
| JO 파라미터가 조문 번호 무시 | **확인됨** | 중간 | `JO=법률명` + `query=제N조`로 조합 사용 |
| 참조판례 체인 시 API 호출 폭증 | 높음 | 중간 | 판례당 최대 3건, 총 상한 9건 설정 |
| 서혜안 JSON에 statutes 없음 (파싱 실패) | 중간 | 낮음 | statutes 없으면 기존 키워드만 사용 (폴백) |
| refCases HTML 파싱 오류 | 중간 | 낮음 | 정규식 패턴 추출 + 실패 시 무시 |
| RAG ts_rank 수정이 기존 검색에 영향 | 중간 | 높음 | Phase 3으로 분리, Phase 2 완료 후 적용 |
| API 일시 장애 | 낮음 | 중간 | 기존 15초 타임아웃 + 2회 재시도 유지 |
| Phase 간 의존성으로 롤백 어려움 | 낮음 | 높음 | 각 Phase 독립 배포 가능하도록 설계 |

---

## 6. 검증 계획

### 6.1 Phase별 검증 체크리스트

#### Phase 1 완료 후 확인
- [ ] 서혜안이 statutes[] 포함한 JSON을 출력하는지
- [ ] 한판서가 리딩케이스/보강/불리를 구분하는지
- [ ] CaseRef에 새 필드가 포함되는지
- [ ] 기존 CaseRef 파싱 로직이 깨지지 않는지

#### Phase 2 완료 후 확인
- [ ] JO 파라미터 검색이 결과를 반환하는지
- [ ] 참조판례 체인으로 추가 판례가 발견되는지
- [ ] RAG 결과가 한판서 컨텍스트에 포함되는지
- [ ] 4-Source 병합 후 중복 제거가 정상 동작하는지
- [ ] API 호출 예산(33건/3이슈) 내에서 완료되는지

#### Phase 3 완료 후 확인
- [ ] RAG 검색 결과가 0건이 아닌지 (임계값 수정 후)
- [ ] ts_rank 정규화 후 점수 분포가 합리적인지

#### Phase 4 완료 후 확인
- [ ] CaseRef 사건번호 실존 검증이 동작하는지
- [ ] 에러 상태(success/no_results/error)가 구분되는지

### 6.2 6개 가상 케이스 통합 테스트

| 케이스 | 기대 리딩케이스 | 최소 검색 건수 | Phase 1 | Phase 2 | Phase 4 |
|--------|----------------|---------------|---------|---------|---------|
| 의료과실 손해배상 | 2022다264434, 91다23707 | 10건 | 분석 깊이 | 체인 추적 | 실존 검증 |
| 사기죄 변호 | 2012도14516, 95도3034 | 8건 | 리딩케이스 구분 | JO 검색 | 폐기 확인 |
| 부당해고 | 2018두44647 | 10건 | 법조문 매핑 | 체인 추적 | 실존 검증 |
| 임대차보증금 반환 | 2024다326398 | 10건 | 법조문 매핑 | JO 검색 | 실존 검증 |
| 이혼·재산분할 | 2011므2997 전합 | 8건 | 전원합의체 식별 | 체인 추적 | 폐기 확인 |
| 영업정지 취소 | 2007두19441 | 8건 | 법조문 매핑 | JO 검색 | 실존 검증 |

---

## 7. 실행 순서 요약

```
[Phase 1] 프롬프트 개선 — 즉시 (1~2시간)
  ├─ 1-A. 서혜안 법조문 매핑 + joSearch 추가
  ├─ 1-B. 한판서 리딩케이스/보강/불리 구분 + 요건사실 분석 + 폐기 확인
  ├─ 1-C. CaseRef 인터페이스 확장 (optional 필드 6개)
  └─ 1-D. 한판서 검색 우선순위 지시
  → 검증: 기존 동작 유지 확인 + 새 필드 출력 확인

[Phase 2] 검색 엔진 핵심 개선 — 3~5일
  ├─ 2-A. Cloudflare proxy에 jo, nb 파라미터 추가
  ├─ 2-B. 프론트엔드 searchByStatute(), searchByCaseNumber() 추가
  ├─ 2-C. 참조판례 체인 추적 (Citation Chaining) ← 최대 임팩트
  ├─ 2-D. RAG를 Stage 2에 연결
  └─ 2-E. 4-Source 병합 + 중복 제거
  → 검증: 6개 케이스 테스트, 리딩케이스 발견 확인

[Phase 3] RAG 안정화 — 1~2일
  ├─ 3-A. RAG 동적 임계값 적용
  └─ 3-B. ts_rank 정규화 (Supabase RPC)
  → 검증: RAG 검색 결과 ≥ 1건 확인

[Phase 4] 검증 & 안정성 — 2~3일
  ├─ 4-A. 사건번호 실존 자동 검증 (nb 파라미터)
  ├─ 4-B. 판례 폐기 여부 확인 (최감수 프롬프트)
  ├─ 4-C. 법조문 정합성 검증 (최감수 프롬프트)
  └─ 4-D. 에러 상태 구분 (success/no_results/error)
  → 검증: 6개 케이스 전체 통합 테스트
```

---

## 8. 핵심 원칙

> 이전 6회 실패에서 배운 교훈:

1. **각 Phase는 독립적으로 배포 가능하고 롤백 가능해야 한다** — Phase 2가 실패해도 Phase 1의 개선은 유지됨
2. **새 기능은 optional 필드/함수로 추가** — 기존 파싱 로직을 절대 깨뜨리지 않음
3. **모든 catch 블록에서 기존 동작으로 폴백** — 새 검색 소스가 실패해도 기존 키워드 검색은 유지
4. **API 호출 예산을 명시적으로 관리** — 무한 루프/폭증 방지를 위한 상한 설정
5. **"작동하지 않는 것"과 "결과가 없는 것"을 구분** — 에러 상태 구분으로 디버깅 가능

---

## 부록: 이전 리서치 문서 참조

- `docs/precedent-search-quality-research.md` — 1차 리서치 (시스템 분석 + 4-Phase 계획)
- `docs/precedent-search-final-plan.md` — 16개 에이전트 팀 리서치 (API 테스트 + 3-Phase 계획)
- 본 문서는 위 두 문서를 통합하고 빠진 항목을 보완한 최종 버전임
