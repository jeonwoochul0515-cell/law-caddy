# 판례 검색 + 문서 생성 파이프라인 고도화 실행 플랜

> 원칙: 에이전트 6개 유지, API 호출 최소화, 중복 제거

---

## 변호사 판례 활용 업무 프로세스 (As-Is)

### 1단계 — 사건 분석 & 쟁점 추출
의뢰인 상담 후 사실관계를 정리하고, 청구권 원인/항변 가능성/입증책임을 기준으로 쟁점을 도출. 적용 법령을 특정.

### 2단계 — 판례 서칭
[법령조문 + 요건사실] → [사실관계 유사도] → [최신판례 우선] 순으로 좁혀감.

### 3단계 — 판례 검토 & 분류
- **A그룹**: 사실관계 유사 → 직접 원용
- **B그룹**: 법리만 차용
- **C그룹**: 불리 → 구별론 준비

### 4단계 — 법리 구성
유리 판례는 주장 근거, 불리 판례는 구별론. 상대방 예상 판례에 선제 대응.

### 5단계 — 서면 작성 & 판례 인용
> 대법원 2020. 3. 12. 선고 2019다○○○ 판결

---

## 7대 페인포인트 해결 방식

| # | 페인포인트 | 해결 | API 추가 |
|---|-----------|------|---------|
| PP1 | 의뢰인 정보 수집 구조화 | 정적 인테이크 체크리스트 | 0회 |
| PP2 | 가짜 판례 인용 | 감수 교차검증 | 0회 |
| PP3 | 서면 간 사실관계 불일치 | 혜안 FactMaster + 감수 검증 | 0회 |
| PP4 | 서면 형식 표준 없음 | 이미 14종 구현됨 | 0회 |
| PP5 | 증거-서면 연결 단절 | EvidenceRegistry + 감수 검증 | 0회 |
| PP6 | 반복 문서 재생산 | 과거 유사문서 RAG 참조 | 0회 |
| PP7 | 법령 개정 반영 지연 | StatuteVersionChecker (1회 실행, 결과 공유) | 법제처 N회 (무료) |

---

## 에이전트 역할 (확장 후)

| 에이전트 | 단계 | 추가되는 역할 |
|---------|------|-------------|
| **혜안** | 1단계 | +FactMaster JSON 출력 (PP3) |
| **율무** | 1단계 보조 | 변경 없음 (법령 검증은 시스템이 별도 수행) |
| **판서** | 2~4단계 | +ABC 분류 + 인용/구별론 초안 |
| **필묵** | 5단계 | +FactMaster/Evidence/유사문서 연동 + 정식 인용 |
| **STT** | 보조 | 변경 없음 |
| **감수** | Stage 3만 | +3중 검증 (사실관계+판례 실존+증거번호) |

---

## API 호출 최적화 — 중복 제거

### 제거 1: 쟁점 분석 2회 → 1회

```
현재 (중복):
  analyzeIssuesWithAI() → 초벌 쟁점 (Claude 1회)
  Stage 1 혜안 실행 (Claude 1회) → 쟁점 산출
  Stage 2 전 analyzeIssuesWithAI(혜안 결과 포함) → 정제 쟁점 (Claude 1회)
  합계: Claude 3회 (쟁점 관련만)

변경 (1회로 통합):
  Stage 1 혜안 실행 (Claude 1회) → 쟁점 + 검색 키워드 + FactMaster 모두 산출
  혜안 결과에서 쟁점/키워드를 파싱 → 판서에 직접 전달
  합계: Claude 1회
```

혜안 프롬프트에 "검색 키워드도 함께 출력하라"는 지시를 추가하면, 별도의 `analyzeIssuesWithAI()` 호출 없이 혜안 1회로 쟁점+키워드+FactMaster를 모두 얻을 수 있다.

### 제거 2: 감수 Stage 1 예비 분석 삭제

```
현재: 감수가 Stage 1에서 예비 분석 (Claude 1회) + Stage 3에서 최종 검증 (Claude 1회)
변경: 감수는 Stage 3에서만 1회 실행 (3중 검증 포함)
```

Stage 1에서 감수가 할 수 있는 예비 분석은 아직 문서가 없는 상태라 실질적 가치가 없다. Stage 3에서 최종 문서를 받아 3중 검증하는 것이 유일하게 의미 있는 시점.

### 제거 3: RAG 검색 중복 방지

```
현재: SearchPool이 Stage 1에서 전체 테이블 검색 (1회)
     + 판서가 Stage 2에서 동일 쿼리로 RAG 재검색 가능성

변경: SearchPool 결과를 판서에게도 전달 (추가 RAG 호출 0회)
     판서는 SearchPool의 cases/legal_judgments 결과를 채널 A로 사용
     채널 B(법제처 API)만 신규 호출
```

### 제거 4: 법령 검증 1회만 실행, 결과 공유

```
현재 플랜: 율무가 법령 검증 + 판서가 참조조문 검증 → 같은 법제처 API를 2곳에서 호출

변경: Stage 2 판서 완료 후, StatuteVersionChecker 1회 실행
     → 혜안/율무/판서가 인용한 모든 법조문을 모아서 일괄 검증
     → 결과를 필묵/감수에 공유
```

### 최적화 후 Claude API 호출 수

| 단계 | 현재 | 최적화 후 | 절감 |
|------|------|----------|------|
| analyzeIssuesWithAI (초벌) | 1회 | **0회** (혜안에 통합) | -1 |
| Stage 1: 혜안 | 1회 | 1회 (쟁점+키워드+FactMaster) | 0 |
| Stage 1: 율무 | 1회 | 1회 | 0 |
| Stage 1: 필묵 (체크포인트) | 1회 | 1회 | 0 |
| Stage 1: 감수 (예비) | 1회 | **0회** (삭제) | -1 |
| Stage 1: STT | 0회 (RTZR) | 0회 | 0 |
| 쟁점 정제 | 1회 | **0회** (혜안에 통합) | -1 |
| Stage 2: 판서 | 1회 | 1회 | 0 |
| 사건유형 분류 | 0~1회 | 0~1회 | 0 |
| Stage 3: 필묵 (최종 문서) | 1회 | 1회 | 0 |
| Stage 3: 감수 (최종 검증) | — | 1회 (Stage 3 신규) | +1 |
| **합계** | **~8회** | **~6회** | **-2~3회** |

---

## Phase 1: 긴급 복구 (30분)

#### 1-1. RAG 임계값 복원
**파일**: `src/services/rag.ts`
- `threshold = 0.30` → `0.15`
- `topScore < 0.20` → `topScore < 0.08`

#### 1-2. 법제처 파라미터 제거 배포
**파일**: `functions/api/precedent-search.ts`
- `search=3`, `prncYd` 제거 (로컬 완료, 배포만)

---

## Phase 2: 파이프라인 최적화 + 판서 고도화 (1-2일)

#### 2-1. analyzeIssuesWithAI 제거 → 혜안에 통합
**파일**: `src/hooks/useAgents.ts`, `src/services/prompts.ts`

혜안 프롬프트에 아래 출력을 추가:
```
## 검색 키워드 (JSON)
각 쟁점별로 법제처 판례 검색에 최적화된 키워드 2개:
[{"issue": "쟁점명", "keywords": ["키워드1", "키워드2"]}]

## FactMaster (JSON)
{"parties": [...], "timeline": [...], "amounts": [...], "keyFacts": [...]}
```

`useAgents.ts`에서:
1. `analyzeIssuesWithAI()` 초벌 호출 삭제
2. Stage 1 혜안 완료 후 결과에서 키워드/FactMaster JSON 파싱
3. 파싱 실패 시 기존 `extractFallbackKeywords()` 폴백
4. Stage 2 전 쟁점 정제 호출도 삭제

#### 2-2. 감수 Stage 1 제거 → Stage 3만 실행
**파일**: `src/hooks/useAgents.ts`

```
Stage 1 에이전트: ["stt", "analysis", "legal", "docgen"] (4개, 감수 제외)
Stage 3에서 감수 1회만 실행 (3중 검증 포함)
```

#### 2-3. 판서 검색량 확대 + SearchPool 결과 활용
**파일**: `src/hooks/useAgents.ts`

```
판서 입력:
  채널 A: SearchPool의 cases/legal_judgments 결과 (추가 RAG 호출 0회)
  채널 B: 법제처 API display=15 (쟁점당, 순차)
  → 합산 → 중복 제거 → rerank-2.5 → 상위 5건 상세 조회
```

#### 2-4. 판서 프롬프트 — ABC 분류 + 인용/구별론
**파일**: `src/services/prompts.ts`

```
1. [ABC 분류] A: 직접 원용 / B: 법리 차용 / C: 구별론 준비
2. [핵심 판시사항] 1~3줄 요약
3. [사실관계 비교] 유사점/차이점
4. [인용 초안] (A/B) "대법원 [선고일] 선고 [사건번호] 판결은 「...」"
5. [구별론 초안] (C) "위 판결의 사안은 [차이점]이 있어..."
6. [상대방 대응] 원용 가능성 + 반박 논거
```

#### 2-5. 인테이크 체크리스트 (PP1)
**파일**: `src/config/intake-checklists.ts` (신규, 정적 데이터, API 0회)

#### 2-6. RAG 동적 임계값 + 3단계 주입
**파일**: `src/services/rag.ts`
```
동적: combined_score < (topScore × 0.4)이면 제거
3단계: ≥0.20 정상 / 0.10~0.20 저신뢰(2건) / <0.10 스킵
```

---

## Phase 3: 필묵 강화 + 감수 검증 + 인프라 (3-5일)

#### 3-1. 필묵 프롬프트 — ABC 인용 + FactMaster + Evidence
**파일**: `src/services/prompts.ts`

```
입력: 혜안(쟁점+FactMaster) + 판서(ABC 판례) + 율무(관할)
     + EvidenceRegistry + 과거 유사문서 + 법령 검증 결과 + 체크포인트

[인용 형식] 대법원 YYYY. M. D. 선고 사건번호 판결
[A그룹] 인용 초안을 서면에 녹임
[C그룹] 구별론 초안으로 선제 대응
[필수] 쟁점당 1건+ 인용, 「겹낫표」, FactMaster로 일관성, Evidence로 정확한 호증번호
```

#### 3-2. 감수 3중 검증 (Stage 3에서 1회만 실행)
**파일**: `src/services/prompts.ts`
```
① FactMaster 대조 → 사실관계 일관성 (PP3)
② 법제처/RAG 대조 → 판례 실존 교차검증 (PP2)
③ EvidenceRegistry 대조 → 증거번호 정합성 (PP5)
```

#### 3-3. 법령 검증 — 1회 실행, 결과 공유 (PP7)
**파일**: `src/services/statute-api.ts` (신규), `functions/api/statute-check.ts` (신규)

Stage 2 판서 완료 후 1회 실행:
- 혜안이 인용한 법조문 + 판서가 찾은 판례의 참조조문을 **모아서 일괄 검증**
- 결과를 필묵/감수에 공유 (중복 호출 방지)

```
✅ 민법 제750조 — 현행
⚠️ 공정거래법 제19조 — 2025.03.01 개정
   개정이유: [법제처 제개정이유]
   신구대조: [개정 전 vs 개정 후]
```

#### 3-4. ts_rank 정규화
```sql
ts_rank(fts, query, 32)::float AS keyword_score
```

#### 3-5. PGroonga 한국어 전문검색

#### 3-6. find() 버그 수정

---

## Phase 4: 고도화 (1-2주)
- KURE-v1 A/B 테스트
- 자체 판례 벡터DB
- 판례 인용 그래프 분석

---

## 전체 파이프라인 (최적화 후)

```
[상담 시작 전] IntakeChecklist (정적, PP1)

[녹음/업로드] STT → transcript

[Stage 1] 4개 에이전트 병렬 (Claude 3회 + RTZR 1회)
  ├─ 혜안 (Claude 1회): 쟁점 + 검색 키워드 + FactMaster JSON
  ├─ 율무 (Claude 1회): 관할 + 소송요건
  ├─ 필묵 (Claude 1회): 체크포인트 질문 생성
  └─ STT (RTZR): 음성 변환
  ※ 감수는 여기서 실행하지 않음 (Stage 3으로 이동)
  ※ analyzeIssuesWithAI 별도 호출 없음 (혜안에 통합)
      ↓
  혜안 결과에서 파싱:
    identifiedIssues → 판서 입력
    searchKeywords → 판서 입력
    FactMaster → Firestore 저장 + 필묵/감수 입력

[Stage 2] 판서 1개 (Claude 1회 + 법제처 API + rerank)
  ├─ 채널 A: SearchPool 결과 재사용 (RAG 추가 호출 0회)
  ├─ 채널 B: 법제처 API (display=15, 순차)
  ├─ 합산 → rerank-2.5 → 상위 5건 상세 조회
  ├─ ABC 분류 + 인용/구별론 초안
  └─ 판서 산출물 → 필묵 입력

[법령 검증] StatuteVersionChecker (법제처 API 1회 일괄, Claude 0회)
  혜안 인용 법조문 + 판서 참조조문 → 모아서 일괄 검증
  → 결과를 필묵/감수에 공유

[체크포인트 — 변호사 응답]

[Stage 3] 필묵 + 감수 (Claude 2회)
  ├─ 필묵 (Claude 1회): 최종 문서 생성
  │    FactMaster + ABC 판례 + EvidenceRegistry
  │    + 유사문서 + 법령 검증 + 체크포인트
  │
  └─ 감수 (Claude 1회): 3중 검증
       ① 사실관계 일관성 (FactMaster)
       ② 판례 실존 (법제처/RAG)
       ③ 증거번호 정합성 (EvidenceRegistry)
```

**Claude API 합계: 6회/건** (현재 ~8회에서 2회 절감)

---

## 변경 파일 목록

| Phase | 파일 | 변경 |
|-------|------|------|
| 1 | `rag.ts` | threshold 0.15, skip 0.08 |
| 1 | `precedent-search.ts` | search=3/prncYd 제거 배포 |
| 2 | `useAgents.ts` | analyzeIssuesWithAI 제거, 감수 Stage1 제거, 혜안 파싱, display 15 |
| 2 | `prompts.ts` | 혜안(+키워드+FactMaster) + 판서(+ABC/인용/구별론) |
| 2 | `intake-checklists.ts` | 신규 (PP1) |
| 2 | `rag.ts` | 동적 임계값 + 3단계 RAG |
| 3 | `prompts.ts` | 필묵(+인용형식/FactMaster/Evidence) + 감수(+3중 검증) |
| 3 | `statute-api.ts` | 신규 (PP7) |
| 3 | `statute-check.ts` | 신규 프록시 (PP7) |
| 3 | `case.ts` | FactMaster, Evidence 타입 |
| 3 | `scripts/*.sql` | ts_rank(..., 32) |
| 3 | Supabase | PGroonga |
| 3 | `useAgents.ts` | find() 수정, Stage 3 감수 실행 |

---

## 기대 효과

| 지표 | 현재 | P1 | P2 | P3 | P4 |
|------|------|----|----|----|----|
| **Claude API** | ~8회 | ~8회 | **~6회** | ~6회 | ~6회 |
| RAG 결과 | 0건 | 5~15건 | 3~5건 | 고품질 | 최고 |
| 법제처 판례 | 0건 | 3~5건 | 리랭킹 | 리랭킹 | 시맨틱 |
| ABC 분류 | 없음 | 없음 | **있음** | 있음 | 있음 |
| 서면 인용 | 없음 | 나열 | **정식** | 정식 | 정식 |
| 사실 일관성 | 없음 | 없음 | **FactMaster** | +감수 | 완전 |
| 증거 정합성 | 없음 | 없음 | 없음 | **검증** | 완전 |
| 법령 개정 | 없음 | 없음 | 없음 | **감지** | 완전 |
| 변호사 체감 | 못 씀 | 나옴 | **실무** | 좋음 | LBOX급 |
