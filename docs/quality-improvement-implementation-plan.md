# 문서 품질 개선 구현 계획서

> 현재: 38/100 (F등급) → 목표: 75+/100 (B+등급)
> 원칙: Claude API 6회/건 유지, 법제처 API(무료) 활용 극대화

---

## Phase 1: 즉시 구현 (2-4시간, +18~25점)

### Task 1-1. 필묵 프롬프트에 판례 인용 형식 강제 (+10~15점)

**파일**: `src/services/prompts.ts` — `buildDocgenPrompt()`

필묵 프롬프트에 추가:
```
[판례 인용 형식 — 반드시 준수]
1. 형식: "(대법원 YYYY. M. D. 선고 사건번호 판결)"
2. 판시사항 인용 시 「겹낫표」 사용
3. 인용 우선순위: 대법원 > 고등법원 > 지방법원, 최신 우선
4. 쟁점당 최소 1건 이상 판례 인용
5. ⛔ 판서의 CaseRef 목록에 없는 사건번호 절대 작성 금지
```

### Task 1-2. 판서 산출물에 CaseRefID 시스템 도입

**파일**: `src/services/prompts.ts` — `buildPrecedentPrompt()`

판서 프롬프트 말미에 추가:
```
## 필묵 연동용 — CaseRef 판례 목록 (JSON)
{"caseRefs": [
  {"id":"CaseRef-1","court":"대법원","date":"2017. 11. 29.","caseNumber":"2017다241819",
   "group":"A","keyHolding":"채무자의 사해의사는 추정된다"}
]}
```

**파일**: `src/hooks/useAgents.ts` — Stage 2 판서 완료 후 CaseRef JSON 파싱
**파일**: `src/types/document.ts` — `CaseRef` 타입 정의

### Task 1-3. 청구취지 정밀화 (+5~8점)

**신규**: `src/services/claim-calculator.ts`
```typescript
interface ClaimCalculation {
  principal: number;
  preLitigationRate: number;    // 민법 제379조: 5%
  postLitigationRate: number;   // 소촉법 제3조: 12%
  provisionalExecution: boolean; // 가집행선고 가능 여부
}
```
- 혜안 FactMaster의 amounts에서 자동 계산
- 가집행선고: 금전 청구 = true, 형성 청구 = false
- `buildDocgenPrompt()`에 계산 결과 주입

### Task 1-4. 플레이스홀더 후처리 검증 (+3~4점)

**신규**: `src/services/post-processor.ts`
- 【여기에...】, {이름}, ○○○ 등 잔존 플레이스홀더 탐지
- FactMaster에 있는 정보로 자동 치환
- 치환 불가능한 것은 경고 목록으로 UI 표시
- Claude API 호출 0회 (순수 정규식)

---

## Phase 2: 1~2일 소요 (+10~15점, 누적 66~78점)

### Task 2-1. 사건번호 검증 API — 허위 판례 방지 (+5~8점)

**신규**: `functions/api/case-verify.ts`
```
POST /api/case-verify
Body: { caseNumbers: ["2023다12345", ...] }
Response: { results: [{ caseNumber, verified, match? }] }
```
- 법제처 API에 사건번호를 query로 검색하여 실존 확인
- 판서 CaseRef 목록과 교차검증
- 결과: ✅ 실존 / ⚠️ 미확인 / ❌ 환각 가능성

**신규**: `src/services/case-verify.ts` — 프론트엔드 서비스
**파일**: `src/hooks/useDocument.ts` — 문서 생성 후 자동 검증 (Stage 4)

### Task 2-2. 증거-파일 매핑 — DocRefID 시스템 (+3~5점)

**신규**: `src/services/evidence-registry.ts`
```typescript
interface EvidenceItem {
  docRefId: string;        // "DocRef-1"
  evidenceNumber: string;  // "갑 제1호증"
  fileName: string;
  description: string;
}
```
- 파일 업로드 시 자동 "갑 제N호증" 부여
- 필묵에게 증거 목록 전달 → 본문에서 "(갑 제1호증)" 형태로 인용
- 감수가 본문-입증방법 일치 검증

### Task 2-3. 교과서 서지정보 DB (+1~2점)

**신규**: `src/config/textbook-citations.ts`
- 핵심 교과서 30~50권 서지정보만 (본문 없음, 저작권 문제 없음)
- 쟁점 키워드로 매칭 → 필묵에게 "참고문헌" 형식 안내

### Task 2-4. 감수 3중 검증 강화

**파일**: `src/services/prompts.ts` — `buildReviewPrompt()`

감수 프롬프트에 추가:
```
① 판례 실존 교차검증: CaseRef 목록 대조 + 법제처 확인
② FactMaster 대조: 날짜/금액/당사자 일관성
③ 증거번호 정합성: EvidenceRegistry vs 입증방법 섹션
```

---

## Phase 3: 3~5일 소요 (+5~10점, 누적 75~85점)

### Task 3-1. 법조문 전문 조회 — StatuteRefID (+3~5점)

**신규**: `functions/api/statute-check.ts` — 법제처 `target=law` API
**신규**: `src/services/statute-api.ts`

혜안/판서가 인용한 법조문을 일괄 조회 → 전문 텍스트를 필묵에게 전달:
```
StatRef-1: 민법 제406조 제1항 — "채무자가 채권자를 해함을 알면서..."
⚠️ 공정거래법 제19조 — 2025.03.01 개정 (개정이유: ...)
```

### Task 3-2. 별지 자동 생성 (+2~3점)

**파일**: `src/services/prompts.ts` — 필묵 프롬프트 확장

조건부 별지 생성 규칙:
- 부동산 2건+ → "별지 부동산의 표시"
- 당사자 3인+ → "별지 당사자 목록"
- 채권 복잡 → "별지 채권 목록"

---

## 전체 파이프라인 (최종)

```
[Stage 1] 4개 에이전트 병렬 (Claude 3회 + RTZR 1회)
  ├─ 혜안: 쟁점 + 키워드 + FactMaster
  ├─ 율무: 관할 + 소송요건
  ├─ 필묵: 체크포인트 질문 (3~4개)
  └─ STT: 음성 변환

[혜안 결과 파싱]
  → identifiedIssues, searchKeywords, FactMaster

[Stage 2] 판서 (Claude 1회 + 법제처 API)
  ├─ 채널 A: RAG + 채널 B: 법제처 display=15
  ├─ rerank-2.5 → 상위 5건 상세 조회
  ├─ ABC 분류 + 인용/구별론 초안
  └─ CaseRef JSON 출력

[법령 검증] StatuteVersionChecker (법제처 API, Claude 0회)

[체크포인트 — 변호사 응답]

[Stage 3] 필묵 + 감수 (Claude 2회)
  ├─ 필묵 (Claude 1회): 최종 문서
  │    입력: 모든 에이전트 결과 + FactMaster + CaseRef
  │         + EvidenceRegistry + ClaimCalculation
  │         + StatuteRef + 교과서 서지 + 체크포인트
  │    출력: 판례 인용 + 정식 형식 + 별지 포함 서면
  │
  └─ 감수 (Claude 1회): 3중 검증
       ① 판례 실존 (CaseRef 대조)
       ② 사실 일관성 (FactMaster 대조)
       ③ 증거 정합성 (EvidenceRegistry 대조)

[Stage 4] 사건번호 자동 검증 (법제처 API, Claude 0회)
  → 문서 내 사건번호 추출 → 법제처 조회 → ✅/⚠️/❌ 배지

[후처리] 플레이스홀더 검증 (Claude 0회)
  → 잔존 【】, ○○ 탐지 → FactMaster로 치환 → 경고 표시

Claude API 합계: 6회/건 (현행 유지)
```

---

## 영역별 점수 예상

| 영역 (배점) | 현재 | P1 후 | P2 후 | P3 후 |
|------------|------|-------|-------|-------|
| A. 서식 (15) | 8 | 11 | 12 | 13 |
| B. 법적 정확성 (20) | 10 | 15 | 16 | 18 |
| C. 인용 품질 (25) | 2 | 12 | 17 | 19 |
| D. 논증 구조 (20) | 10 | 12 | 13 | 15 |
| E. 증거 연결 (10) | 4 | 4 | 8 | 9 |
| F. 완성도 (10) | 4 | 7 | 7 | 8 |
| **합계** | **38 (F)** | **61 (C)** | **73 (B)** | **82 (A)** |

---

## 변경 파일 목록

| Phase | 파일 | 변경 |
|-------|------|------|
| 1 | `src/services/prompts.ts` | 필묵 인용형식 + 판서 CaseRef |
| 1 | `src/services/claim-calculator.ts` | 신규 — 청구취지 계산기 |
| 1 | `src/services/post-processor.ts` | 신규 — 플레이스홀더 검증 |
| 1 | `src/types/document.ts` | CaseRef 타입 추가 |
| 1 | `src/hooks/useAgents.ts` | CaseRef 파싱 |
| 2 | `functions/api/case-verify.ts` | 신규 — 사건번호 검증 API |
| 2 | `src/services/case-verify.ts` | 신규 — 검증 서비스 |
| 2 | `src/services/evidence-registry.ts` | 신규 — 증거 매핑 |
| 2 | `src/config/textbook-citations.ts` | 신규 — 교과서 서지 DB |
| 2 | `src/services/prompts.ts` | 감수 3중 검증 |
| 2 | `src/hooks/useDocument.ts` | Stage 4 검증 + 후처리 |
| 3 | `functions/api/statute-check.ts` | 신규 — 법령 검증 프록시 |
| 3 | `src/services/statute-api.ts` | 신규 — 법령 서비스 |
| 3 | `src/services/prompts.ts` | 별지 생성 규칙 |

---

## 비용 영향

| 항목 | 현재 | 변경 후 | 비고 |
|------|------|--------|------|
| Claude API | 6회/건 | **6회/건** | 변동 없음 |
| 법제처 API | 판례 검색 | +사건번호 검증 +법령 조회 | 무료 |
| 신규 파일 | 0 | 8개 | 서비스+API+타입+설정 |
| 수작업 | 0 | 교과서 DB 30~50권 입력 | 1회성, 0.5일 |
