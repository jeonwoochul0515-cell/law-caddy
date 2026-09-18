# 새 공용 파일 점검 (2026-09-17)

## 읽은 파일
- `src/services/pii-mask.ts`
- `src/utils/friendlyError.ts`
- `src/services/clientMessageGuard.ts`
- `src/utils/localDate.ts`
- `src/components/ui/Dialog.tsx`
- `src/__tests__/services/pii-mask.test.ts`
- 대조용: `src/pages/RecordPage.tsx`, `src/pages/DocumentPage.tsx`, `src/pages/AdminPage.tsx`, `src/components/cases/ClientCareTab.tsx`, `src/components/cases/NewCaseModal.tsx`, `src/components/accounting/*Modal.tsx`, `src/hooks/useClientCare.ts`, `src/hooks/useCaseDetail.ts`, `src/services/notify.ts`, `src/services/claude.ts`, `src/services/caseAssistant.ts`, `src/config/sentry.ts`, `src/types/deadline.ts`, `src/utils/piiMask.ts`, `src/__tests__/utils/piiMask.test.ts`

## import 여부 — 프로젝트 전체 검색 결과 (사실)
전체 `src`를 대상으로 각 export 심볼과 상대경로 import 문을 `search`로 검색했다.

| 파일 | import한 곳 | 결론 |
|---|---|---|
| `pii-mask.ts` (`maskSensitiveText`, `maskMany`) | `src/__tests__/services/pii-mask.test.ts` 단 1곳(테스트) | **제품 코드에서 0곳.** 테스트만 통과하고 실제로 아무 데도 연결 안 됨 |
| `friendlyError.ts` (`friendlyError`, `rawErrorText`) | `src/pages/LandingPage.tsx:22,88` 1곳 | **화면 27곳 중 1곳만 사용.** 나머지는 아래 발견 참고 |
| `clientMessageGuard.ts` (`checkClientMessage`, `hasBlockingWarning`, `buildSignature`, `appendSignature`) | 0곳 | **제품 코드에서 0곳.** `sendClientSms`를 호출하는 3개 화면(`ClientCareTab.tsx`, `SuccessFeeClaimModal.tsx`, `CaseDetailPage.tsx`) 어디서도 import하지 않음 |
| `localDate.ts` (`localDateStr`, `formatKst`, `formatKstTime`) | 0곳 | **제품 코드에서 0곳** |
| `components/ui/Dialog.tsx` (`Dialog`, `ConfirmDialog`) | 0곳 | **제품 코드에서 0곳.** 대화상자를 쓰는 6개 이상 화면(`NewCaseModal.tsx`, `ContractGenerateModal.tsx`, `OfficeExpenseModal.tsx`, `PurchaseTransactionModal.tsx`, `PaymentModal.tsx`, `AdminPage.tsx` 등)이 각자 직접 `fixed inset-0` div를 손으로 만든다 |

## 발견

### 1. 의뢰인에게 나가는 문자를 아무도 검사하지 않는다
- 심각도: 위험
- 어디서: 사건 상세 화면의 「의뢰인 케어」 탭, 성공보수 청구 문자
- 무슨 일이: `clientMessageGuard.ts`는 "AI 언급", "승소 단정" 표현을 걸러 발송을 막게 설계돼 있는데, 실제 발송 함수 `sendClientSms`를 부르는 `ClientCareTab.tsx:144,165`, `SuccessFeeClaimModal.tsx:128`, `CaseDetailPage.tsx:111` 어디에도 `checkClientMessage`/`hasBlockingWarning` 호출이 없다. AI가 만든 초안을 그대로, 혹은 "반드시 승소합니다" 같은 문장이 섞인 채로 의뢰인에게 발송해도 아무 경고가 안 뜬다.
- 근거: `src/services/clientMessageGuard.ts:46,84`(정의) vs `src/components/cases/ClientCareTab.tsx:144-165`(발송부 — import 없음), `src/services/notify.ts:57`(`sendClientSms` 정의)
- 고칠 방향: 발송 직전에 `checkClientMessage`를 호출해 `hasBlockingWarning`이면 발송 버튼을 막고, 그 외 경고는 확인 모달로 보여준다.

### 2. 문자 서명(연락처) 자동 첨부가 실제로는 동작하지 않는다
- 심각도: 답답
- 어디서: 의뢰인 케어 탭 문자 발송, 성공보수 청구 문자
- 무슨 일이: `buildSignature`/`appendSignature`는 "발신번호가 플랫폼 공용이라 본문에 연락처를 넣어 답장·전화가 변호사에게 가게 한다"는 목적으로 만들어졌지만 어디서도 호출되지 않는다. 실제 발송 문구는 각 화면에서 손으로 문자열을 조립하는데(`CaseDetailPage.tsx` 등) 서명이 빠진 경우 의뢰인이 답장·전화할 방법이 없어진다.
- 근거: `src/services/clientMessageGuard.ts:99,109`(정의, 0회 import)
- 고칠 방향: 문자 발송 경로에서 `appendSignature`를 실제로 적용하거나, 각 발송처에 이미 연락처가 들어가는지 확인 후 중복 로직을 정리한다.

### 3. AI 원문이 마스킹 없이 그대로 외부 API·Sentry로 나간다
- 심각도: 위험
- 어디서: 사건 AI 비서(사건 기록 요약), 녹음 전사 분석, 의뢰인 케어 메시지 생성
- 무슨 일이: `pii-mask.ts`는 "전사·첨부 텍스트가 외부 AI로 나가기 전에… 가린다"는 목적을 코드 주석에 명시했지만 제품 코드 어디서도 import되지 않는다. 기존에 살아있는 마스킹 유틸(`src/utils/piiMask.ts` — 아래 발견 11 참고)조차 업로드 PDF 사건기록 파싱 경로 한 곳에만 적용돼 있고, 녹음 전사·의뢰인 케어 메시지 생성 경로는 둘 중 어느 마스킹도 거치지 않는다. `useClientCare.ts:138`은 녹음 `transcript`(주민번호·계좌번호가 섞여 있을 수 있는 상담 내용)를 그대로 `ctx.transcript`에 넣어 `callClaude`로 전송하고, `caseAssistant.ts:154`도 `r.transcript`를 그대로 문자열에 합쳐 AI로 보낸다. 실패 시 `Sentry.captureException(error)`(`claude.ts:462,499`, `rtzr.ts:84`)도 원본 오류 객체를 그대로 캡처하므로, 오류 메시지에 개인정보가 섞여 있으면 Sentry로 유출될 수 있다.
- 근거: `src/services/pii-mask.ts:1-4`(목적 주석) — 0회 import; `src/hooks/useClientCare.ts:138`(`ctx.transcript = latestRec.transcript.slice(0, 3000)`, 마스킹 호출 없음); `src/services/caseAssistant.ts:154`(`const original = r.transcript ?? ""`, 마스킹 호출 없음); `src/services/claude.ts:462`(`Sentry.captureException(error)`); 대조: `src/hooks/useCaseDetail.ts:406-407`(`maskPII`가 적용되는 유일한 경로 — PDF 업로드 파싱)
- 고칠 방향: 녹음 전사·의뢰인 케어 프롬프트 조립 직전(`useClientCare.ts`, `caseAssistant.ts`)에 기존 `maskPII`(발견 11 참고, 신규 `pii-mask.ts`는 폐기)를 적용하고, Sentry 전송 전 `beforeSend`에서도 원문 텍스트 필드를 마스킹한다.

### 4. 마스킹 정규식이 하이픈 없는 계좌번호·외국인등록번호·붙여쓴 카드번호를 놓친다
- 심각도: 위험
- 어디서: (만약 pii-mask가 쓰이게 된다면) 전사 텍스트 처리
- 무슨 일이: 실제로 정규식을 실행해 확인한 결과, ①계좌 컨텍스트 없이 숫자만 있는 경우(`"110234567890 으로 보내주세요"`)는 매칭 안 됨, ②주민등록번호 뒷자리가 9로 시작하는 경우(`850315-9234567` — 최근 주민번호 성별코드 9)는 `[1-8]` 범위 제한 때문에 매칭 안 됨(외국인등록번호 뒷자리 5~8 범위 밖 최신 코드), ③카드번호를 구분자 없이 붙여 쓴 `1234567890123456`은 매칭 안 됨. 테스트(`pii-mask.test.ts`)는 하이픈 있는 정상 케이스만 검증하고 이런 변형은 다루지 않는다.
- 근거: `src/services/pii-mask.ts:8`(`RRN` — `[1-8]\d{6}` 뒷자리 제한), `src/services/pii-mask.ts:11`(`ACCOUNT_CONTEXT` — 은행 키워드 필수), `src/services/pii-mask.ts:14`(`CARD` — `[-\s]` 구분자 필수); 직접 실행 검증(`node -e`)으로 3건 모두 `NO MATCH` 확인
- 고칠 방향: 붙여쓴 16자리 숫자, 은행 키워드 없는 순수 계좌번호 패턴, 뒷자리 9 시작 주민번호(최근 출생자 성별코드)를 추가로 커버한다.

### 5. `friendlyError`를 안 쓰는 화면에서 영어 원문 오류가 그대로 노출된다
- 심각도: 말
- 어디서: 문서 화면(`DocumentPage.tsx`), 사건 경비·예수금·착수금 관리(`CaseExpenseTab.tsx`, `DepositManagementTab.tsx`, `FeeManagementTab.tsx` 등), 캘린더, 사건 헤더 등 27곳 이상
- 무슨 일이: `friendlyError`는 정확히 Firebase `permission-denied`, `unavailable` 같은 코드를 한국어 문장으로 바꾸도록 만들어졌는데, 실제로는 `LandingPage.tsx` 1곳만 쓴다. 나머지는 전부 `err instanceof Error ? err.message : "..."` 패턴으로 Firebase/네트워크 원문 영어 메시지(`"Missing or insufficient permissions."`, `"Failed to fetch"` 등)를 그대로 화면에 띄운다. 김 변호사가 겪는 "영어 오류 노출"은 이 패턴이 27곳에 퍼져 있어서 생긴다.
- 근거: `src/utils/friendlyError.ts:4-5`(사용법 안내 주석) — 실사용 1곳만; `src/components/accounting/CaseExpenseTab.tsx:255`(`const message = err instanceof Error ? err.message : "업로드 실패"`); `src/components/accounting/DepositManagementTab.tsx:273`; `src/components/cases/ClientCareTab.tsx:154,172`(문자 발송 실패도 영어 원문 노출 가능)
- 고칠 방향: `err.message`를 직접 쓰는 27곳을 `friendlyError(err, "…")`로 일괄 교체한다.

### 6. 김 변호사가 겪은 확인창 관련 UX 결함들이 공용 `Dialog`/`ConfirmDialog`를 만들어 놓고도 하나도 못 고쳐졌다
- 심각도: 답답
- 어디서: 사건 등록, 계약서 생성, 사무경비·매입거래 등록, 결제, 관리자 승인/거절 화면
- 무슨 일이: `Dialog.tsx`는 Esc 닫기·초점 가두기·모바일 `items-end` 레이아웃·`ConfirmDialog`(취소 버튼 기본 초점)까지 갖춘 공용 컴포넌트로 설계됐지만 실제로는 0곳에서 쓰인다. `NewCaseModal.tsx:66`, `ContractGenerateModal.tsx:177`, `OfficeExpenseModal.tsx:125` 등은 각자 `<div className="fixed inset-0 … flex items-center justify-center">`를 직접 만들어 Esc 닫기·초점 가두기가 전혀 없다. `window.confirm()`을 쓰는 삭제 확인(`DocumentPage.tsx:504,546,551`, `DocumentsPage.tsx:146`)은 브라우저 기본 확인창이라 화면 디자인과 안 맞고 버튼 위치를 매번 다르게 기억해야 한다.
- 근거: `src/components/ui/Dialog.tsx` 전체 — 0회 import; `src/components/cases/NewCaseModal.tsx:66`; `src/pages/DocumentPage.tsx:504,546,551`(`window.confirm(...)`)
- 고칠 방향: 기존 모달들을 `Dialog`/`ConfirmDialog`로 교체하고 `window.confirm` 호출을 `ConfirmDialog`로 바꾼다.

### 7. `ConfirmDialog` 기본 초점이 "취소"인 설계 자체는 안전하지만, 실제로 안 쓰여서 그 안전장치가 어디에도 적용 안 되고 있다
- 심각도: 답답
- 어디서: 사건·문서 삭제 확인
- 무슨 일이: `ConfirmDialog`는 `initialFocus="[data-confirm-cancel]"`(`Dialog.tsx:216`)로 설계돼 있어 실수로 Enter를 눌러도 삭제가 아니라 취소가 실행되는 안전한 기본값이다. 판단은 맞는 설계다("삭제·로그아웃처럼 되돌리기 어려운 동작"이라 미검출보다 오검출 방지가 맞다). 하지만 0회 import이므로 이 안전장치가 실제 삭제 확인(`DocumentPage.tsx`의 `window.confirm`)에는 전혀 적용되지 않고, `window.confirm`은 브라우저마다 기본 포커스 동작이 다르다(엔터=확인이 기본인 브라우저도 있음).
- 근거: `src/components/ui/Dialog.tsx:216`(`initialFocus="[data-confirm-cancel]"`); `src/pages/DocumentPage.tsx:551`(`window.confirm(...)` — 대체 안전장치 없음)
- 고칠 방향: 문서·사건 삭제처럼 파괴적인 동작에 한해 `window.confirm`을 `ConfirmDialog danger`로 교체.

### 8. `localDate.ts`가 안 쓰여서 자정 부근 날짜 처리가 기존 코드처럼 흩어져 남아있다
- 심각도: 위험
- 어디서: 사건 경비 등록일, 예수금 등록일, 소송비용 등록일, 사무경비 등록일(여러 회계 탭)
- 무슨 일이: `localDate.ts` 주석은 "toISOString()의 UTC 날짜 오류를 막는다"는 목적으로 만들어졌는데(즉 `toISOString()`은 UTC 기준이라 한국 자정~오전 9시 사이엔 날짜가 하루 밀린다는 걸 인지하고 만든 파일), 정작 `CaseExpenseTab.tsx:131,340`, `CourtFeeCalculator.tsx:115`, `DepositManagementTab.tsx:114`, `FeeManagementTab.tsx:102`, `OfficeExpenseModal.tsx:46`, `PurchaseTransactionModal.tsx:34`, `CostsSection.tsx:32`, `CaseDetailPage.tsx:186,723` 등 9곳 이상이 여전히 `new Date().toISOString().slice(0, 10)`로 "오늘 날짜"를 구한다. 부산은 UTC+9라 오전 0시~9시 사이에 이 버튼을 누르면 등록일이 실제로는 어제인데 오늘로, 혹은 그 반대로 하루 밀려 기록된다. `localDate.ts:4`의 `localDateStr()`이 정확히 이 문제를 고치려고 만든 함수인데 아무도 안 쓴다.
- 근거: `src/utils/localDate.ts:1,4`(목적 주석 + `localDateStr` 정의, 0회 import); `src/components/accounting/CaseExpenseTab.tsx:131`(`date: new Date().toISOString().slice(0, 10)`); `src/components/accounting/DepositManagementTab.tsx:113-114`(`function today() { return new Date().toISOString().slice(0, 10); }`)
- 고칠 방향: 위 9곳의 `new Date().toISOString().slice(0, 10)` 패턴을 전부 `localDateStr()`로 교체.

### 9. `checkClientMessage`의 "에이전트" 오탐 여지 — 미검출보다 오검출이 안전하지만 정상 단어까지 막을 수 있다
- 심각도: 답답
- 어디서: (쓰이게 된다면) 의뢰인 문자 작성 화면
- 무슨 일이: `AI_PATTERNS`의 `/에이전트/`는 단어 경계 없이 아무 데나 "에이전트"가 들어가면 걸린다. 직접 실행해 확인한 결과 "보험 에이전트를 통해 진행됩니다"처럼 법률 맥락에서 정상적으로 쓰이는 문장도 AI 언급으로 오탐되어 발송이 막힌다(`hasBlockingWarning`은 `ai_mention`이면 무조건 차단). 판단: 광고규정 위반 리스크를 막는 게 목적이므로 오검출이 미검출보다 안전한 방향은 맞지만, 차단(발송 불가)까지 가는 건 과하다 — 경고만 띄우고 변호사가 확인 후 진행할 수 있게 하는 편이 낫다.
- 근거: `src/services/clientMessageGuard.ts:24`(`/에이전트/` — 단어 경계 없음), `src/services/clientMessageGuard.ts:84-86`(`hasBlockingWarning` — `ai_mention`이면 무조건 차단); 직접 실행 검증(`node -e`)으로 "보험 에이전트" 오탐 확인
- 고칠 방향: `ai_mention`도 경고로만 두고 발송은 변호사 확인 후 허용하거나, 패턴에 문맥(예: "AI 에이전트", "챗봇 에이전트")을 요구하도록 좁힌다.

### 10. 테스트 커버리지가 5개 중 1개뿐 — 나머지는 검증 없이 방치
- 심각도: 답답
- 어디서: (개발 과정 문제, 화면 직접 노출은 아님)
- 무슨 일이: `src/__tests__/services/pii-mask.test.ts` 하나만 존재한다. `friendlyError.ts`(27곳에 적용해야 할 핵심 유틸), `clientMessageGuard.ts`(발송 차단 로직), `localDate.ts`(날짜 경계 버그 회피용), `Dialog.tsx`(포커스 트랩·Esc)는 테스트가 전혀 없다. 특히 `clientMessageGuard.ts`의 정규식들(발견 9)과 `friendlyError.ts`의 코드 매핑 우선순위는 회귀에 취약한데 검증 장치가 없다.
- 근거: `src/__tests__/services/pii-mask.test.ts:1-3`(유일하게 존재하는 테스트 파일); `find`로 `src/__tests__` 내 friendlyError/clientMessageGuard/localDate/Dialog 관련 테스트 파일 부재 확인
- 고칠 방향: 최소한 `friendlyError`(코드 매핑 27개), `clientMessageGuard`(오탐 케이스 포함)에 대한 단위 테스트를 추가한다.

### 11. `pii-mask.ts`는 이미 실사용 중인 `piiMask.ts`와 기능이 겹치는 중복 죽은 코드다
- 심각도: 답답
- 어디서: (개발 과정 문제)
- 무슨 일이: `src/utils/piiMask.ts`의 `maskPII()`는 주민등록번호·휴대전화·일반전화·이메일·계좌번호를 가리며 `useCaseDetail.ts:406-407`에서 업로드 PDF 사건기록 파싱 직후 실제로 호출되고 테스트(`src/__tests__/utils/piiMask.test.ts`)도 갖춰져 있다. 반면 새로 만든 `src/services/pii-mask.ts`의 `maskSensitiveText()`는 주민등록번호·계좌번호·카드번호·여권번호를 가리는 겹치는 기능인데 휴대전화·이메일은 다루지 않고, 정작 실사용처는 0곳이다. 두 파일이 정규식 세부(계좌번호 판정 조건, 주민번호 뒷자리 범위 등)도 서로 달라 앞으로 유지보수할 때 어느 쪽을 고쳐야 하는지 혼란을 만든다.
- 근거: `src/utils/piiMask.ts:34`(`maskPII` 정의) + `src/hooks/useCaseDetail.ts:406`(실사용); `src/services/pii-mask.ts:26`(`maskSensitiveText` 정의, 0회 import); `src/__tests__/utils/piiMask.test.ts:1-3`(기존 파일 테스트 존재) vs `src/__tests__/services/pii-mask.test.ts:1-3`(신규 파일 테스트 존재)
- 고칠 방향: 기존 `utils/piiMask.ts`를 살리고, 전화번호·이메일 마스킹이 빠진 것을 보완해 발견 3의 AI 전송 경로에도 적용한다. 신규 `services/pii-mask.ts`는 삭제하거나 카드번호·여권번호 패턴만 기존 파일에 병합한다.

## 확신이 낮은 항목
- `pii-mask.ts`의 계좌번호 패턴이 실제 한국 계좌번호 자릿수 분포(은행마다 10~14자리 다양)를 정확히 커버하는지는 은행별 자릿수 표와 대조하지 않아 추측이다.
- `Dialog.tsx`의 모바일 `items-end` 레이아웃이 실제 가상 키보드 상황에서 가려지는지는 브라우저 렌더링을 실행해 보지 않아 코드 구조(고정 `inset-0`, `max-h-[90dvh]`)로부터의 추론이다. `dvh` 단위 자체가 최신 브라우저의 동적 뷰포트 대응이라 오히려 키보드를 반영할 가능성도 있어 확정하지 않았다.
- `localDate.ts` 미사용이 실제로 회계 데이터에 하루 밀린 기록을 만들어냈는지는 실데이터를 보지 않아 코드 로직상의 가능성으로만 적었다.
