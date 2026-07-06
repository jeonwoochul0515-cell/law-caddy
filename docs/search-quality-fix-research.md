# 판례 검색 실패 원인 분석 및 고품질 검색 구현 리서치

> 작성일: 2026-04-01
> 상태: 리서치 완료, 구현 대기

---

## 1. 현재 상황

텍스트 추출과 초벌 쟁점 분석까지는 정상 작동하지만, 이후 RAG 검색과 법제처 판례 검색에서 결과가 0건으로 나오고 있음.

---

## 2. 근본 원인: ts_rank() 정규화 미비

### 2.1 현재 점수 계산 구조

```
combined_score = (semantic_score × 0.7) + (keyword_score × 0.3)
```

- `semantic_score`: pgvector 코사인 유사도 (0~1 범위, 정상)
- `keyword_score`: PostgreSQL `ts_rank()` (0~1이 **아님**, 고장)

### 2.2 ts_rank()의 실제 반환값

| 상황 | ts_rank 반환값 |
|------|---------------|
| 매우 높은 매칭 (짧은 문서, 다수 단어 일치) | 0.1 ~ 0.6 |
| 일반적 매칭 | 0.01 ~ 0.1 |
| 약한 매칭 (긴 문서에서 1~2개 단어 일치) | 0.001 ~ 0.01 |
| 한국어 'simple' tokenizer 사용 시 | **0.0001 ~ 0.01** |

### 2.3 왜 한국어에서 특히 낮은가

PostgreSQL의 `to_tsvector('simple', ...)` 은 공백 기반 토크나이징만 수행:
- "부당공동행위" → 통째로 1개 토큰 (분리 안 됨)
- "부당" + "공동" + "행위"로 쪼개지지 않음
- 문서에 "부당공동행위"가 정확히 있어야만 매칭
- 결과적으로 keyword_score는 대부분 **0.001~0.05**

### 2.4 실제 계산 결과

```
관련 판례 발견:
  semantic_score = 0.35 (관련 있음)
  keyword_score  = 0.02 (사실상 0)

  combined = (0.35 × 0.7) + (0.02 × 0.3)
           = 0.245 + 0.006
           = 0.251

  현재 임계값 = 0.30 → 탈락!
```

**0.30을 넘으려면 semantic_score > 0.43이 필요 → 한국어 법률 도메인에서 거의 불가능**

한국어 법률 쿼리의 일반적 semantic_score 범위:
- 동일 주제, 높은 관련성: 0.25 ~ 0.45
- 동일 법률 도메인, 간접 관련: 0.15 ~ 0.30
- 관련 없음: 0.05 ~ 0.20

---

## 3. 법제처 판례 검색 0건 원인

### 3.1 과도한 검색 제한 파라미터

| 추가된 파라미터 | 문제 |
|----------------|------|
| `search=3` (판시사항 한정) | 판결요지/본문에만 있는 키워드를 못 찾음 |
| `prncYd` (최근 5년만) | 중요 대법원 판례가 5~20년 전인 경우 많음 |

### 3.2 law.go.kr API 검색 특성

- 관련도 정렬(relevance ranking) **미지원** — 날짜순(ddes/dasc)만 가능
- 고급 검색 문법(AND/OR/NOT) **미지원**
- `search` 파라미터 값: 1=전체, 2=판례명, 3=판시사항 등
- 파라미터 생략 시 **전체 검색(가장 넓은 범위)**이 기본값
- 한 번에 최대 `display=100`건 조회 가능

### 3.3 search 파라미터 상세 (2팀 리서치 결과)

| search 값 | 검색 범위 | 비고 |
|-----------|----------|------|
| 미지정/생략 | **전체** (기본값) | 사건명+판시사항+판결요지+전문 모두 |
| `1` | 판례명(사건명) | 범위 매우 좁음 |
| `2` | 판시사항+판결요지 | |
| `3` | 판시사항만 | **범위 극도로 좁음 — 사용 금지** |

`search=3`이 0건인 이유:
- 판시사항은 법원이 기재한 법적 쟁점 요약으로, 모든 판례에 존재하지 않음
- 하급심 판례는 판시사항이 비어있는 경우가 대다수
- "부당해고" 같은 키워드가 "근로관계의 종료"로 표현될 수 있음

### 3.4 prncYd 5년 제한이 치명적인 이유

한국 법률에서 가장 중요한 대법원 판례는 대부분 **10~30년 전**:
- 불법행위: 대법원 96다36289 (1998)
- 부당이득: 대법원 93다47745 (1995)
- 공정거래: 대법원 2001두1387 (2003)

대법원 판례는 사실상 구속력이 있어 수십 년 전 판례가 여전히 인용됨.

### 3.5 최적 검색 전략

법제처 API는 **넓게 검색 → 클라이언트 사이드 리랭킹** 방식이 최선:
- 파라미터: `query` + `sort=ddes` + `display=15~20` 만 사용
- `search`, `prncYd` 파라미터 **사용하지 않음**
- 결과를 Voyage rerank-2.5로 쟁점 관련도 기준 재정렬
- 쿼리는 핵심 키워드 1~2개로 간결하게 (긴 문장 비추천)

### 3.6 다른 한국 법률 AI의 접근

| 제품 | 법제처 API 의존도 | 실제 방식 |
|------|------------------|----------|
| LBOX | 낮음 | 313만건 자체 판례 DB + 시맨틱 검색 |
| BigCase | 낮음 | 업스테이지 LLM + 자체 임베딩 |
| CaseNote | 중간 | 법제처 + 대법원 API 조합 |

**결론**: 상용 법률 AI는 법제처 API를 초기 데이터 수집용으로만 사용, 실시간 검색은 자체 벡터DB에서 수행

---

## 4. 2단계 파이프라인 키워드 전달 검증

### 4.1 데이터 흐름: 정상

```
Stage 1: 5개 에이전트 병렬 (analysis 포함)
  ↓ analysis 완료
Stage 2: analysis 결과로 키워드 재추출 → precedent 에이전트
```

- `Promise.allSettled` 배열 순서 보존됨 ✅
- analysis 실패 시 초벌 키워드로 폴백됨 ✅
- 빈 키워드 방지 (fallback chain: AI → 키워드 사전 → caseType → "손해배상") ✅

### 4.2 발견된 사소한 버그

`runAgent()`가 내부에서 모든 에러를 catch하여 `AgentState`로 반환하므로, `Promise.allSettled`는 항상 `"fulfilled"`를 반환. `r.status === "fulfilled"` 체크가 죽은 코드임. 실제 동작에는 영향 없지만 정리 필요.

**권장 수정**:
```typescript
// 현재 (죽은 코드)
stage1Results.find((r, i) => STAGE1_AGENTS[i] === "analysis" && r.status === "fulfilled")

// 권장 (실제 에이전트 성공 여부 확인)
stage1Results.find((r, i) => 
  STAGE1_AGENTS[i] === "analysis" 
  && r.status === "fulfilled" 
  && r.value.status === "completed"
)
```

---

## 5. 해결 방안 — 3단계

### 5.1 긴급 수정 (즉시, 코드 2줄 변경)

**문제**: 임계값이 너무 높아서 모든 결과가 필터링됨

| 파일 | 위치 | 현재 | 변경 |
|------|------|------|------|
| `rag.ts` | line 974 | `threshold = 0.30` | **`threshold = 0.15`** (원래 값 복원) |
| `rag.ts` | line 1007 | `topScore < 0.20` | **`topScore < 0.08`** (거의 스킵 안 함) |

**이유**: ts_rank 정규화가 안 된 상태에서 임계값을 올리면 안 됨. 원래 0.15에서는 작동했으므로 우선 복원.

### 5.2 단기 수정 (1-2일)

**문제**: keyword_score가 사실상 0이어서 하이브리드 검색의 의미가 없음

#### (a) ts_rank 정규화 — Supabase SQL 함수 수정

```sql
-- 현재: 정규화 안 됨
ts_rank(fts, query)::float AS keyword_score

-- 방안 1: ts_rank 정규화 플래그 32 사용 (score / (score + 1))
ts_rank(fts, query, 32)::float AS keyword_score

-- 방안 2: 상수 스케일링 (×10 후 0~1 클램핑)
LEAST(1.0, ts_rank(fts, query)::float * 10) AS keyword_score
```

- 방안 1이 PostgreSQL 공식 지원 방식이므로 권장
- 정규화 후 keyword_score가 0.1~0.8 범위로 올라옴
- 이렇게 되면 combined_score가 의미 있는 하이브리드 점수가 됨

#### (b) 동적 임계값 — 절대값 대신 상대 비율

```typescript
// 현재: 절대 임계값 (ts_rank 범위에 민감)
const threshold = 0.30;

// 권장: 최고 점수 대비 상대 비율
const topScore = Math.max(...allScores);
const dynamicThreshold = topScore * 0.4; // 최고 점수의 40% 이하 제거
```

장점:
- ts_rank 정규화 문제에 영향받지 않음
- 검색 품질이 높을 때 자동으로 기준이 올라감
- 검색 품질이 낮을 때도 최선의 결과를 유지

#### (c) 3단계 RAG 주입 — CRAG 논문 기반

```
topScore >= 0.25  → 정상 RAG 주입 (전체 결과)
0.12 ≤ topScore < 0.25 → 저신뢰 모드 (상위 2건만 + "참고용" 표시)
topScore < 0.12  → RAG 완전 스킵
```

현재 2단계(통과/스킵)보다 훨씬 유연.

### 5.3 중기 개선 (1-2주)

#### (a) PGroonga 도입 — 한국어 전문검색 혁신

현재 PostgreSQL `simple` tokenizer의 한계:
- "부당공동행위" → 1개 토큰 (분리 불가)
- 한국어 형태소 분석 없음

PGroonga (Supabase 공식 Extension):
- 한국어 N-gram/형태소 분석 지원
- "부당공동행위" → "부당", "공동", "행위", "부당공동", "공동행위" 등으로 분리
- `simple` tokenizer 대비 **24~43배 빠른 검색**
- 한국어 매칭 정확도 대폭 향상

```sql
-- PGroonga 인덱스
CREATE INDEX idx_pgroonga ON cases 
  USING pgroonga (case_summary pgroonga_text_full_text_search_ops_v2);

-- 검색 (한국어 자동 분리)
SELECT * FROM cases WHERE case_summary &@~ '부당공동행위 가격담합';
```

#### (b) Voyage rerank-2.5 instruction 활용

```typescript
// 쟁점별 맞춤 instruction으로 리랭킹 정확도 +11.48%
voyageRerank({
  model: "rerank-2.5",
  query: "가격담합 부당공동행위",
  documents: searchResults,
  instruction: "한국 공정거래법 위반 부당공동행위 관련 판례를 우선순위로 정렬하세요."
})
```

#### (c) 법제처 API 검색 최적화

```
최적 전략:
1. 넓은 검색: query + sort=ddes + display=20 (파라미터 최소화)
2. 클라이언트 리랭킹: Voyage rerank-2.5로 쟁점 관련도 재정렬
3. 상위 3~5건 선별하여 프롬프트 주입
```

#### (d) KURE-v1 한국어 임베딩 모델 테스트

- 고려대 NLP&AI Lab 개발, 한국어 검색 특화
- MTEB-ko-retrieval 벤치마크 NDCG 0.655 (최고 성능)
- BGE-M3 기반, 한국어+영어 지원
- 현재 voyage-3 대비 한국어 법률 검색 정확도 향상 기대
- A/B 테스트 후 결정

---

## 6. 실행 우선순위 요약

| 순서 | 작업 | 효과 | 난이도 |
|------|------|------|--------|
| **1** | rag.ts 임계값 0.15 복원 + 스킵 0.08 | **즉시 작동 복구** | 2줄 변경 |
| **2** | precedent-search.ts에서 search=3, prncYd 제거 확인 | **법제처 검색 복구** | 이미 완료 |
| **3** | ts_rank(..., 32) 정규화 (Supabase SQL) | keyword_score 정상화 | SQL 1줄 |
| **4** | 동적 임계값 (topScore × 0.4) | 안정적 필터링 | 코드 5줄 |
| **5** | 3단계 RAG 주입 (정상/저신뢰/스킵) | 유연한 컨텍스트 관리 | 코드 15줄 |
| **6** | PGroonga 도입 | 한국어 검색 24~43배 향상 | 인프라 변경 |
| **7** | KURE-v1 임베딩 A/B 테스트 | 한국어 시맨틱 정확도 | 테스트 필요 |

---

## 7. 참고 자료

- [PostgreSQL ts_rank 정규화 문서](https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-RANKING)
- [CRAG (Corrective RAG) 논문](https://arxiv.org/abs/2401.15884) — 3단계 분기 패턴
- [Adaptive-RAG (NAACL 2024)](https://arxiv.org/abs/2403.14403) — 쿼리 복잡도별 전략
- [Chroma Context Rot Research (2025)](https://research.trychroma.com/context-rot) — 8K 토큰 이하 권장
- [PGroonga vs pg_bigm 비교](https://pgroonga.github.io/reference/pgroonga-versus-pg-bigm.html)
- [KURE-v1 (Hugging Face)](https://huggingface.co/nlpai-lab/KURE-v1) — 한국어 검색 NDCG 0.655
- [Voyage AI rerank-2.5](https://blog.voyageai.com/2025/08/11/rerank-2-5/) — instruction-following +11.48%
- [법제처 판례 API 가이드](https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=precListGuide)
