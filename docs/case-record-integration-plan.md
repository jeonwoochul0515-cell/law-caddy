# 전자소송 사건기록 열람 통합 계획서

- 최종 업데이트: 2026-04-19
- 작성 계기: 사법정보공유포털(openapi.scourt.go.kr) API 경로 사망 확인(2026-04-19 법원행정처 회신) 후, "상대방 서면 자동 분석 → 반박 초안 생성" 킬러 피처를 다른 루트로 재설계하기 위함
- 연관 문서: `docs/scourt-api-integration-plan.md`(이전 계획, 이 문서로 대체), `docs/supabase-db-review.md`(판례·법령 RAG 서버 현황), `CLAUDE.md`(루트 명세)

---

## 0. 결정 로그 (2026-04-19 확정)

사용자 의사결정으로 아래 사항이 확정되어, 이 계획서는 단일 루트·단일 저장소 전제로 작성한다.

| 항목 | 결정 | 이유 |
|---|---|---|
| 도입 루트 | **Route A(수동 업로드) 단독** | CODEF 나의사건검색 연동은 변호사·의뢰인 모두에게 이중 작업이라 현 단계에선 ROI가 낮음. 필요해지면 후속 릴리스. |
| 저장소 | **Firebase Storage** | 이미 `src/services/firebase/storage.ts` 에 `uploadOpponentDocFile` 등 업로드 유틸 구축됨. Firebase Auth·Rules와 권한 격리 자연 연동. Supabase는 판례·법령 RAG 전용 서버라 파일 저장 용도가 아님. R2는 현 규모에서 불필요. |
| 분석 결과 공유 | **변호사만 열람** | 오해·환각 리스크 차단. 의뢰인에게는 기존 `generateClientMessage` 파이프라인으로 요약 카톡을 보내는 기존 기능을 재사용. |
| DRM PDF 지원 | **MVP 미포함** | 감지 후 "DRM 해제 후 재업로드" 안내만. 수요 피드백 이후 재검토. |
| 법률사무소 구성원 공유 | **MVP 미포함** | 1인 변호사 = 사건 1인 소유 단순 구조. 팀 기능은 후속. |

---

## 1. Executive Summary

- 사법포털 API 루트 사망 + CODEF 경로도 사용자 판단으로 현 단계 제외 → 구현은 **Route A 단독**(변호사가 전자소송에서 직접 내려받은 기록 PDF를 law-caddy 사건에 업로드).
- 기존 `storage.ts`·`pdf.ts`·`clova-ocr.ts`·`rag.ts`·`prompts.ts`·`OpponentDocs.tsx` 자산을 거의 그대로 확장하므로 **MVP 2~3주**.
- 신규 가치: 업로드된 기록을 **opponentBriefAnalyzer** 에이전트가 분석해 주장 요지·약점·반박 포인트·판례 제안을 내고, 기존 `generateClientMessage`가 이를 의뢰인용 카톡 요약으로 변환. 반박 준비서면 초안은 기존 docgen 에이전트로 이어짐.
- 주요 리스크: DRM PDF(감지·안내로 대응), LLM 환각(인용 강제로 대응), 개인정보 유출(파싱 전 마스킹으로 대응).
- **경쟁 상황**: 리걸프렌즈(legalflow.co.kr)가 "전자소송 PDF 업로드 → 원고/피고/법원/서면/서증 자동 분류 + 태블릿·모바일 뷰어 + 캘린더 연동"을 이미 상용화(5GB 무료·50GB 월 2만·1TB 월 7만). law-caddy는 **같은 기본기 + 상대방 서면 AI 분석(opponentBriefAnalyzer) + 회계 통합**을 묶어 차별화(부록 C 참조).

---

## 2. 도입 목표와 비목표

### 2.1 목표

- 수임 사건의 서면(소장·답변서·준비서면), 증거, 결정문·판결문을 law-caddy 사건 단위로 편입하고 RAG 인덱싱.
- 편입된 기록을 입력으로 삼아 **상대방 서면 분석 에이전트**가 주장 요지·약점·반박 포인트·판례 제안을 자동 산출.
- 분석 결과를 기존 에이전트 플로우(precedent/legal/analysis/docgen/review)와 연결해 반박 준비서면 초안까지 이어지도록.
- 분석 요약은 기존 `generateClientMessage` 로 의뢰인 카톡용 초안 생성.
- 사건 타임라인에 기록 업로드·분석 이벤트 자동 기록.

### 2.2 비목표

- 전자소송 시스템의 대체(로그인·제출·송달은 법원 시스템 유지).
- 기록 열람 신청·승인 절차의 자동화.
- 변호사 본인이 수임하지 않은 사건, 제3자 사건 조회.
- DRM PDF 우회, 전자소송 세션 자동화.
- CODEF 나의사건검색 자동 연동(후속 릴리스 후보).

---

## 3. 루트 결정 근거 — Route A 단독

과거 비교에서 검토했던 3개 루트 중 현 단계 선택은 아래와 같다.

| 루트 | 현 단계 채택 여부 | 메모 |
|---|---|---|
| **Route A — 수동 업로드 + AI 분석** | **채택** | 변호사가 전자소송에서 이미 다운받는 PDF를 law-caddy 사건 상세에 드롭하면 됨. 기존 `OpponentDocs.tsx` 의 드래그&드롭·`uploadOpponentDocFile` 을 확장해 재사용. |
| Route B — CODEF 나의사건검색 | 보류 | 변호사·의뢰인 양쪽 모두 인증 위임·동의서 작업이 필요해 이중 작업. 현 규모·우선순위에서 ROI가 낮음. 수임 건수가 커지거나 CODEF가 기록 본문 PDF 제공 상품을 내면 재검토. |
| Route C — 크롬 확장/브라우저 자동화 | **각하** | 전자소송 이용약관·변호사법 §26·변협 윤리장전 저촉 리스크. 내부 PoC도 권장하지 않음. |

---

## 4. 권장 아키텍처

### 4.1 사용자 플로우

```
변호사 (전자소송 ecfs.scourt.go.kr 로그인)
   │  공동인증서/간편인증으로 본인 사건 기록 열람
   ▼
기록 PDF 다운로드 (서면·증거·결정문)
   │
   ▼
law-caddy 사건 상세 페이지 → "사건기록" 탭
   │  드래그&드롭 또는 다중 파일 업로드
   ▼
[functions/api/cases/[caseId]/records/upload.ts]
   │  Firebase Storage(case-records/{ownerId}/{caseId}/) 저장
   │  case_records Firestore 문서 생성, ocrStatus = "pending"
   ▼
[functions/api/cases/[caseId]/records/parse.ts]
   │  pdf.ts로 텍스트 추출 시도 → 실패/이미지 PDF면 clova-ocr.ts 폴백
   │  DRM 감지 시 ocrStatus = "drm_blocked" → 사용자 안내
   │  docType 추정(파일명·헤더 휴리스틱 + LLM 보조)
   │  개인정보 마스킹
   │  parsedText + docType + submittedBy(원고/피고) 확정
   ▼
[rag.ts] 사건 단위 네임스페이스(caseId:{caseId})로 chunk 인덱싱
   ▼
[functions/api/cases/[caseId]/records/analyze.ts]
   │  prompts.ts의 opponentBriefAnalyzer 에이전트 실행
   │  입력: Case 메타 + 대상 서면 parsedText + 동일 사건 RAG 컨텍스트
   │  출력: 주장 요지·근거·약점·반박 포인트·판례 제안 (모두 인용 스팬 첨부)
   ▼
CaseRecordsTab UI에 "반박 초안 카드" 노출 — 변호사 전용
   │  → 클릭 시 기존 docgen(준비서면) 에이전트로 이어짐
   │  → "의뢰인 카톡 요약" 버튼 → 기존 buildClientMessagePrompt 재사용
   ▼
타임라인에 "사건기록 업로드 + 분석 완료" 이벤트 자동 추가
```

### 4.2 기존 자산 재사용 지도

| 신규 기능 지점 | 재사용할 기존 자산 | 경로 |
|---|---|---|
| 파일 저장 | `uploadOpponentDocFile` 패턴 확장 | `src/services/firebase/storage.ts` |
| 드래그&드롭 UI | `OpponentDocs.tsx` 업로드 컴포넌트 | `src/components/cases/OpponentDocs.tsx` |
| PDF 파싱 | `pdf.ts` | `src/services/pdf.ts` |
| 이미지 OCR | `clova-ocr.ts`·`ocr.ts` | `src/services/` |
| RAG 인덱싱 | `rag.ts` | `src/services/rag.ts` |
| 에이전트 엔진 | `prompts.ts` (legal/analysis/docgen/review) | `src/services/prompts.ts` |
| 의뢰인 카톡 요약 | `buildClientMessagePrompt` + `generateClientMessage` | `src/services/prompts.ts`, `src/hooks/useDocument.ts` |
| 인증 | `verifyFirebaseToken` | `functions/api/_shared/auth.ts` |

---

## 5. 기술 설계 (파일 단위)

### 5.1 신규 Firestore 컬렉션: `case_records`

```typescript
interface CaseRecord {
  id: string;
  caseId: string;                      // cases/{caseId} FK
  ownerId: string;                     // 변호사 UID — Firestore 보안규칙 격리 키
  docType: RecordDocType;              // 5.2 참조
  submittedBy: "원고" | "피고" | "법원" | "기타" | "미상";
  submittedAt?: string;                // YYYY-MM-DD (기록상 제출일)
  fileName: string;
  storageUrl: string;                  // gs://...
  fileSizeMB: number;
  parsedText?: string;                 // 전체 텍스트(긴 경우 Storage로 오프로드)
  parsedTextSummary?: string;          // 300자 요약
  ocrStatus: "pending" | "ocr_running" | "parsed" | "failed" | "drm_blocked";
  ocrEngine?: "pdf-text" | "clova-ocr";
  maskedPII: boolean;
  ragIndexedAt?: Timestamp;
  analyzedAt?: Timestamp;
  analysisSummaryId?: string;          // opponentBriefAnalyzer 결과 문서 FK
  uploadedAt: Timestamp;
  updatedAt: Timestamp;
}
```

- **보안 규칙**: `ownerId == request.auth.uid` 인 경우만 read/write. 기존 `firestore.rules` 에 블록 추가.
- **인덱스**: `(caseId ASC, submittedAt DESC)`, `(ownerId ASC, uploadedAt DESC)` → `firestore.indexes.json` 에 추가.
- **Storage 경로 규약**: `case-records/{ownerId}/{caseId}/{timestamp}_{originalName}.pdf`. `storage.rules` 에서 같은 `ownerId` 만 접근.

### 5.2 신규 타입: `src/types/caseRecord.ts`

```typescript
export type RecordDocType =
  | "소장"
  | "답변서"
  | "준비서면"
  | "증거"
  | "결정문"
  | "판결문"
  | "기타";

export interface CaseRecord { /* 5.1과 동일 */ }
```

기존 `src/types/case.ts` 의 `OpponentDoc` 은 원시 형태이므로, 이번 작업에서 `CaseRecord` 를 상위 모델로 삼고 `OpponentDoc` 는 점진 마이그레이션(읽기 호환 유지).

### 5.3 신규 API (Cloudflare Functions)

**파싱·분석도 서버 API가 아니라 클라이언트에서 처리**한다(2026-04-19 구현). 이유:
- `src/services/pdf.ts` 의 `extractPdfText` 는 pdfjs-dist + DOM canvas 기반이라 Cloudflare Workers에서 실행 불가.
- `src/services/claude.ts` 의 `callClaude` 는 MVP 단계에서 클라이언트 직접 호출 정책(CLAUDE.md §9).
- 따라서 `functions/api/cases/[caseId]/records/` 하위 라우트는 만들지 않고, 아래 훅에서 파이프라인을 구성한다.

| 레이어 | 함수 | 역할 |
|---|---|---|
| `src/hooks/useCaseDetail.ts` | `uploadCaseRecord` | Storage 업로드 + Firestore 메타 생성 + 타임라인 이벤트 + 백그라운드 파싱 트리거 |
| `src/hooks/useCaseDetail.ts` | `parseRecordInBackground` | `extractPdfText` 호출 → ocrStatus 갱신 (parsed / failed / drm_blocked) |
| `src/hooks/useCaseDetail.ts` | `analyzeCaseRecord` | `buildOpponentBriefAnalyzerPrompt` + `callClaude` + JSON 파싱 → `CaseRecord.analysis` 임베드 저장 + 타임라인 |

분석 결과는 별도 컬렉션이 아닌 **CaseRecord 문서에 임베드**(필드: `analysis`). 분량 몇 KB 수준이라 Firestore 1MB 한계에 여유가 크다. 향후 분량 증가 시 `case_record_analyses` 컬렉션으로 분리.

### 5.4 기존 파일 확장

- `src/services/firebase/storage.ts`: `uploadCaseRecordFile(file, ownerId, caseId)` 추가 ✅(2026-04-19 구현). 기존 `uploadOpponentDocFile` 과 경로만 다름.
- `src/services/firebase/firestore.ts`: `createCaseRecord` / `getCaseRecords` / `getCaseRecord` / `updateCaseRecord` / `deleteCaseRecord` 5개 추가 ✅(2026-04-19 구현). 컬렉션명 `case_records`.
- `src/services/prompts.ts`: **opponentBriefAnalyzer** 프롬프트 신규 추가(아래 5.5). 기존 `buildClientMessagePrompt` 는 분석 결과를 입력으로 받을 수 있도록 인자 시그니처 한 가지 추가.
- `src/services/rag.ts`: 사건 단위 네임스페이스 컨벤션 `caseId:{caseId}` 확정, 기존 문서 chunk와 구분.
- `src/services/pdf.ts`: DRM·암호화 PDF 감지 시 예외 대신 `{ drmBlocked: true }` 반환으로 시그니처 확장.
- `src/services/clova-ocr.ts`: 페이지 단위 분할 호출 옵션 추가.
- `src/components/cases/CaseRecordsTab.tsx` **신설**: 기록 목록·상태 배지·분석 결과 카드·반박 초안 CTA·의뢰인 카톡 요약 버튼. `UnifiedTimelineTab.tsx` 에 이벤트 피드 연결.

### 5.5 opponentBriefAnalyzer 프롬프트 (개요)

- 시스템 역할: "한국 민사·가사·형사 실무에 능한 상대방 서면 분석 전문가".
- 입력 변수: `{사건 기본정보}`, `{대상 서면 전문}`, `{RAG로 가져온 동일 사건 선행 서면 요약}`.
- 출력 섹션:
  1. 상대방 주장 요지(번호 매김, 3~7개)
  2. 주장별 근거(서면에서 인용, 페이지·문장 단위)
  3. 주장별 약점(논리·증거·법리)
  4. 반박 포인트(우리 측 주장과 연결)
  5. 제안 판례·법조문(가능하면 선행 precedent 에이전트 결과 참조)
  6. 반박 준비서면 골격(h2 수준 목차만, 본문 작성은 docgen 에이전트가 후속 담당)
- 제약: 환각 방지용으로 **모든 주장·근거·반박에 서면 원문 인용 스팬**을 `"..."` 형식으로 첨부. 인용 없는 주장은 출력 금지. 결과에 "AI 초안 — 변호사 검토 필수" 고정 배너.

### 5.6 의뢰인 카톡 요약 연동

- opponentBriefAnalyzer 결과 → `buildClientMessagePrompt` 에 "최근 상대방 서면 분석 요약" 섹션으로 주입.
- 의뢰인은 law-caddy에 로그인하지 않음. 변호사가 "카톡 요약 생성" 클릭 → 기존 `generateClientMessage` 가 250~350자 초안 생성 → 변호사 검토·편집 → 카톡/문자로 복사해 전달.
- 분석 결과 본문은 변호사 전용. 카톡에는 **법률용어 일상화된 요약만** 전달.

---

## 6. 법적 가드레일 체크리스트

- [ ] **변호사법 §26 비밀유지**: `case_records` 는 `ownerId` 격리. MVP에서는 팀 공유 UI 자체를 만들지 않음(구성원 공유 미포함).
- [ ] **개인정보보호법**: 파싱 단계에서 주민번호(6-7자리 패턴)·계좌번호·상세주소·휴대번호 자동 마스킹(`maskedPII=true` 로 기록). 원문은 Storage에만 보관, 로그·RAG 청크·프롬프트에는 마스킹본 사용.
- [ ] **저작권**: 법원 결정문·판결문은 공공저작물로 활용 가능, 상대 측 서면은 저작권이 상대 변호사에 귀속 → (a) 외부 공유·학습데이터화 금지, (b) Anthropic API 호출 시 오프트레이닝 설정 확인, (c) 내부 분석 결과는 `ownerId` 범위 내에서만 노출.
- [ ] **전자소송 DRM PDF**: 우회 금지. `drm_blocked` 상태에서는 "DRM 해제 후 재업로드" 안내 문구만 제공. 도움말 링크로 전자소송에서 DRM 없는 버전 재다운 방법 안내.
- [ ] **이용약관 반영**: law-caddy 이용약관·개인정보처리방침에 "사건기록 업로드·AI 분석" 처리 항목 추가.

---

## 7. 단계별 로드맵

### Phase 1 — 수동 업로드 + 분석 MVP (2~3주)

- `src/types/caseRecord.ts` 추가.
- `src/services/firebase/storage.ts` 에 `uploadCaseRecordFile` 추가.
- `functions/api/cases/[caseId]/records/upload.ts` · `parse.ts` · `analyze.ts` 3개 라우트 구현.
- `src/services/prompts.ts` 에 opponentBriefAnalyzer 추가 + `buildClientMessagePrompt` 시그니처 확장.
- `src/services/rag.ts` 네임스페이스 규약 확정.
- `src/services/pdf.ts` 에 DRM 감지 추가.
- `src/components/cases/CaseRecordsTab.tsx` 신설, `CaseDetailPage` 에 탭 연결.
- `firestore.rules` · `firestore.indexes.json` · `storage.rules` 갱신.
- 개인정보 마스킹 util 추가.
- **Definition of Done**
  - [ ] 단일 PDF(텍스트 기반 50페이지) 업로드 → 3분 내 parsed 상태 도달
  - [ ] 이미지 PDF OCR 폴백 동작
  - [ ] DRM PDF 업로드 시 사용자 안내 노출, 분석 단계로 진입 안 함
  - [ ] opponentBriefAnalyzer가 3개 이상의 인용 포함 반박 포인트 생성
  - [ ] `ownerId` 격리 테스트(다른 변호사 계정에서 404) 통과
  - [ ] CaseRecordsTab에서 업로드·상태·분석 결과·카톡 요약까지 UI 왕복 가능
  - [ ] 타임라인에 "사건기록 업로드"·"분석 완료" 이벤트 자동 기록
  - [ ] Storage 규칙·Firestore 규칙 단위 테스트 통과

### Phase 2 — 다중 파일·대량 처리 (2주)

- OCR 큐(1차: 단순 `waitUntil` 폴백, 필요 시 Cloudflare Queues 검토).
- 파싱 실패 재시도 3회 + 사용자 재시도 버튼.
- 100페이지 초과 기록은 페이지 단위 분할 RAG 인덱싱.
- **Definition of Done**
  - [ ] 300페이지 기록을 15분 내 parsed 상태까지 완료
  - [ ] 실패 리트라이 로그가 Firestore `case_records` 에 남음
  - [ ] RAG 검색이 페이지 번호 포함해 인용 가능

### 후속 후보(백로그, 확정 아님)

- **CODEF 나의사건검색 연동**: 수임 건수가 커지거나 의뢰인 포털 출시 시점에 재검토.
- **DRM PDF 지원**: 사용자 피드백으로 필요성이 확인되면 화면 캡처 OCR 방식 등 검토.
- **법률사무소 구성원 공유**: 팀 플랜 수요 발생 시 `ownerId` → `orgId` 권한 모델로 확장.
- **의뢰인 포털**: 의뢰인이 기록을 직접 업로드·조회하는 별도 UI.

---

## 8. 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| 전자소송 DRM PDF 증가 | 파싱 실패율 상승 | 사용자 안내 + DRM 해제 가이드 링크. 우회 시도 금지 |
| LLM 환각 | 반박 초안 신뢰도 저하 | 인용 스팬 강제, 인용 없는 문장 렌더링 차단, "AI 초안 — 변호사 검토 필수" 배너, 편집 전/후 저장 |
| 개인정보 유출 | 법적·계약 리스크 | 파싱 전 마스킹 → 로그·프롬프트에 마스킹본만 투입, 원문은 Storage에만 보존, Anthropic 오프트레이닝 설정 확인 |
| Firebase Storage 비용 급증 | 월 청구 상승 | 90일 이상 미접근 파일은 자동 보관함 이동(후속), 사건당 업로드 상한(예: 500MB) 소프트 리밋 |
| 대용량 PDF로 Functions 타임아웃 | 업로드 실패 | 업로드와 파싱 분리(업로드만 동기, 파싱은 큐), 100MB 초과 파일 사전 경고 |

---

## 9. 측정 지표 (출시 후 확인)

- 사건당 평균 업로드 기록 수.
- 파싱 성공률(텍스트 PDF / 이미지 PDF / DRM 분류별).
- 반박 초안 변호사 수정률(원문 대비 30% 이하 목표).
- 반박 초안 채택률(준비서면으로 실제 제출된 비율).
- "사건기록 업로드" 후 첫 분석 완료까지 평균 소요 시간(p50 3분, p95 10분).
- 의뢰인 카톡 요약 생성 건수.

---

## 부록 A — 관련 파일

- `functions/api/_shared/auth.ts`
- `src/types/case.ts`
- `src/services/firebase/firestore.ts`
- `src/services/firebase/storage.ts`
- `src/services/pdf.ts`
- `src/services/ocr.ts`
- `src/services/clova-ocr.ts`
- `src/services/rag.ts`
- `src/services/prompts.ts`
- `src/hooks/useDocument.ts`
- `src/components/cases/OpponentDocs.tsx`
- `src/components/cases/DocumentsTab.tsx`
- `src/components/cases/UnifiedTimelineTab.tsx`
- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`

---

## 부록 B — 영상 출처 메모

사용자가 이번 논의 계기로 공유한 YouTube 영상(`https://youtu.be/3oZwwIBoSrU`)의 oEmbed 메타 확인 결과, 실제 영상은 **"학교폭력가해자 법적책임알아보기" (채널: LegalFlow 리걸플로)** 로 확인됨. "사건기록 사용 메뉴얼"과는 다른 콘텐츠이므로 본 계획서의 업로드 UI·절차는 사용자 구두 지시("변호사가 전자소송에서 다운받아 law-caddy에 업로드하는 단순 플로우")만을 근거로 설계했음. 원 메뉴얼 영상이 별도로 확인되면 CaseRecordsTab UI 세부 조정에만 반영.

참고: 같은 회사(리걸플로 Inc., 사업자번호 520-81-00895)가 "리걸프렌즈" 라는 경쟁 제품을 운영 중이며, 영상은 해당 회사의 법률정보 콘텐츠 채널로 보임. 제품 분석은 부록 C 참조.

---

## 부록 C — 경쟁자 분석: 리걸프렌즈(LegalFlow Inc.)

### C.1 제품 개요

- **운영사**: 주식회사 리걸플로(대표 김충환, 사업자번호 520-81-00895, 서울 강남구 논현로87길 25, HB타워 4층)
- **연락**: 1833-9639 / service@legalflow.co.kr
- **제품군**: **기일관리(웹+앱)** + **캘린더** + **사건기록관리** 3종 세트, "리걸프렌즈" 브랜드로 변호사 B2B 판매
- **현재 버전**: v0.4.60 (웹 패키지 기준, 모바일 앱 스토어 출시 상태)

### C.2 핵심 기능 — 3가지 덩어리로

**1) 자동 기일관리**
- 하루 4번 법원 사이트 자동 조회로 사건 진행 상황 업데이트
- 버튼 한 번으로 실시간 업데이트도 가능
- 전자소송에서 "사건목록 파일" 다운받아 업로드하면 사건 일괄 마이그레이션
- 웹 ↔ 모바일 앱 양방향 동기화

**2) 사건기록관리 (law-caddy가 지금 만들려는 영역)**
- 전자소송에서 받은 PDF 업로드 → **원고/피고/법원/서면/서증** 자동 분류
- 사건 일정 클릭 → 해당 기일에 낸 서면 PDF가 내장 뷰어로 즉시 열림
- 클라우드 저장(5GB 무료 → 최대 1TB)
- 법정에서 태블릿·모바일로 기록 즉시 열람

**3) 업무 편의**
- 사건 분야별 대시보드, 접수일·담당자·분야 상세검색
- 기일 변경 → 캘린더 자동 갱신

### C.3 가격 구조

| 플랜 | 용량 | 가격 |
|---|---|---|
| Free | 5GB | ₩0 |
| Standard | 50GB | ₩20,000/월 |
| Pro | 1TB | ₩70,000/월 (프리런칭 무료) |
| Enterprise | 맞춤 | 별도 문의 |

**관찰**: 저장공간 중심의 과금 구조. 즉 "파일 캐비닛" 포지셔닝. AI 분석·문서 자동 생성은 제공 기능에 없음.

### C.4 law-caddy와의 포지셔닝 비교

| 축 | 리걸프렌즈 | law-caddy |
|---|---|---|
| 핵심 가치 | 파일 캐비닛 + 일정 자동화 | **AI 변호 파트너**(녹음→판례→분석→문서→의뢰인 메시지) + 파일 캐비닛 |
| 자동 사건 상태 조회 | **있음** (하루 4회) | 현재 없음 — 리걸프렌즈 대비 **약점** |
| 전자소송 PDF 자동 분류 | **있음** | Phase 1 신규 구현 필요(opponentBriefAnalyzer가 겸함) |
| 사건 일정–문서 연동 | **있음** | 기존 `UnifiedTimelineTab` 에 붙일 예정 |
| 태블릿·모바일 뷰어 | **있음** | 계획서 범위 외 — 후속 과제 |
| 녹음 STT + 6 에이전트 | 없음 | **있음** (LAW-CADDY 고유) |
| 상대방 서면 AI 분석·반박 초안 | 없음 | **Phase 1 opponentBriefAnalyzer** |
| 의뢰인 카톡 요약 | 없음 | **있음** (`generateClientMessage`) |
| 회계(수임료·카드·홈택스) 통합 | 없음 | **있음** (CODEF) |
| 판례 RAG | 없음 | **있음** (231만건 Supabase) |
| 요금제 | 저장 기반 ₩0·2만·7만 | 기능 기반 Starter 4.9만·Pro 8.9만·Team 6.9만/인 |

### C.5 시사점과 반영 사항

1. **law-caddy의 구조적 강점**: "기록 관리"는 리걸프렌즈가 같은 수준이지만, **녹음→AI→문서→의뢰인 메시지→회계** 까지 하나로 묶는 서비스는 시장에 없음. 마케팅 포지셔닝을 "파일 캐비닛" 이 아니라 "**AI가 붙어 있는 사건방**" 으로 가져가야 함.
2. **기능 갭**: **사건 진행상황 자동 조회(하루 N회)** 가 리걸프렌즈 핵심 셀링포인트 중 하나. law-caddy에는 아직 없음. 본 계획서 범위는 아니지만 **백로그에 명시 추가** 필요(CODEF 나의사건검색 연동이 그 자리).
3. **UI 기대치**: 변호사들은 이미 리걸프렌즈에서 "PDF 업로드 → 원고/피고 자동 분류"를 경험한 상태. `CaseRecordsTab` 설계 시 **동급 이상의 분류 정확도**가 심리적 허들. opponentBriefAnalyzer의 docType 추정을 파일명·헤더 휴리스틱 + LLM 2단계로 구성해 정확도를 확보.
4. **가격 포지셔닝**: law-caddy Pro(₩89,000/월)는 리걸프렌즈 1TB(₩70,000/월)보다 비싸지만, **무제한 녹음·6 에이전트·판례 RAG·회계**가 포함됨. 마케팅 페이지에서 "리걸프렌즈 1TB + 에이전트를 쓰려면 얼마?" 프레임으로 비교해야 가격 방어 가능.
5. **저장 정책**: law-caddy Pro 요금제가 저장 용량을 명시하지 않으면 영업에서 불리함. "**Pro 기본 50GB 포함, 초과분 별도**" 같은 정책을 Phase 1 마무리 시 확정 권장(본 계획서 결정 범위 밖, 제품 정책 이슈).

### C.6 백로그 추가 항목

- **사건 진행상황 자동 조회 파이프라인**: CODEF 나의사건검색(본 계획 Route B 백로그)으로 하루 N회 폴링해 `cases.timeline` 자동 갱신. 리걸프렌즈의 "하루 4번 업데이트"에 대응.
- **태블릿·모바일 뷰어**: 기존 반응형 CaseRecordsTab을 우선 모바일 퍼스트로 만들고, 차후 WebView 앱(이미 CLAUDE.md §2.4에 언급) 전환 시 동일 UI 재사용.
- **대시보드 분야별 사건 수 위젯**: 기존 DashboardPage에 `caseType` 별 카운트 카드 추가.
