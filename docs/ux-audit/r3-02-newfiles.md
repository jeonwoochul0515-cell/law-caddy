# 새 공용 파일 점검 (2026-09-17)

아직 커밋되지 않은 새 공용 파일 5개. `git status` 기준 전부 `??`(untracked)다.

## 읽은 파일

- `src/services/pii-mask.ts`
- `src/utils/friendlyError.ts`
- `src/services/clientMessageGuard.ts`
- `src/utils/localDate.ts`
- `src/components/ui/Dialog.tsx`
- `src/__tests__/services/pii-mask.test.ts`
- `src/utils/piiMask.ts` (기존 파일 — 새 pii-mask.ts와 중복)
- `src/hooks/useClientCare.ts`
- `src/components/cases/ClientCareTab.tsx`
- `src/services/caseAssistant.ts`
- `src/services/prompts.ts` (해당 구간)
- `src/services/retry.ts`
- `src/components/ui/ErrorFallback.tsx`
- `src/config/sentry.ts`
- `src/components/accounting/FeeManagementTab.tsx`
- `src/services/notify.ts`
- `functions/api/notify/client.ts`
- `src/index.css`, `vite.config.ts`

## 각 파일이 실제로 쓰이는가 (사실 확인)

프로젝트 전체(`src`·`functions`·`docs`)를 검색한 결과다.

| 파일 | import하는 곳 | 비고 |
|---|---|---|
| `src/services/pii-mask.ts` | **0곳** | 테스트(`src/__tests__/services/pii-mask.test.ts:3`)에서만 부른다 |
| `src/utils/friendlyError.ts` | **1곳** | `src/pages/LandingPage.tsx:22` → `:88`. 로그인 전 상담신청 폼 하나뿐 |
| `src/services/clientMessageGuard.ts` | **0곳** | |
| `src/utils/localDate.ts` | **0곳** | |
| `src/components/ui/Dialog.tsx` | **0곳** | `ConfirmDialog`도 포함해 0곳 |

5개 중 4개가 어디에도 연결되지 않았다. 아래 발견 대부분이 여기서 파생된다.

---

## 발견

### 1. 새로 만든 공용 파일 5개 중 4개가 아무 화면에도 붙지 않았다

- 심각도: 답답
- 어디서: (화면 없음 — 코드 전체)
- 무슨 일이: 개인정보 가리기·한국어 오류 안내·문자 검사기·날짜 유틸·확인창을 만들어 놓고 어느 화면에도 연결하지 않았다. 김 변호사 입장에서는 「없는 기능」과 똑같다. 아래 2~5번 문제가 전부 이 하나에서 나온다.
- 근거: `src/services/pii-mask.ts` 참조 0곳(테스트 제외), `src/services/clientMessageGuard.ts` 0곳, `src/utils/localDate.ts` 0곳, `src/components/ui/Dialog.tsx` 0곳, `src/utils/friendlyError.ts`는 `src/pages/LandingPage.tsx:22` 한 곳뿐
- 고칠 방향: 붙일 곳을 정해 연결하거나, 계획이 없으면 지운다. 「있는데 안 쓰는 유틸」을 남기면 다음 사람이 이미 처리된 줄 안다.

### 2. 의뢰인 상담 녹음이 가려지지 않은 채 외부 AI로 그대로 나간다

- 심각도: 막힘 (개인정보 유출 경로 — 변호사법 §26 비밀유지의무 직결)
- 어디서: 사건 상세 > 의뢰인 케어 탭 「메시지 생성」, 사건 상세 > 사건 비서 탭
- 무슨 일이: 의뢰인이 상담 중에 말한 주민번호·계좌번호가 녹음 전사에 그대로 남고, 그 전사 원문이 마스킹 없이 Anthropic으로 전송된다. 김 변호사는 가리기 기능이 있는 줄 안다.
- 근거:
  - `src/services/pii-mask.ts:3-4` — 파일 머리말이 이미 이 구멍을 지적한다. `"프롬프트의 \"응답에 개인정보를 그대로 쓰지 말라\"는 지시는 출력 규칙일 뿐이라 입력 자체는 그대로 전송되고 있었다(r2-05-16)"`. 그런데 그 구멍이 아직 그대로다.
  - `src/hooks/useClientCare.ts:134` — `ctx.transcript = latestRec.transcript.slice(0, 3000);` (자르기만 한다. 가리지 않는다)
  - `src/hooks/useClientCare.ts:155` — 그 `ctx`로 만든 프롬프트를 `const content = await callClaude(` 로 보낸다
  - `src/services/caseAssistant.ts:154` — `const original = r.transcript ?? "";` 역시 마스킹 없이 프롬프트에 박는다
  - `src/components/cases/CaseAssistantTab.tsx:85` — `const reply = await callClaudeChat(systemPrompt, next);`
  - 대조: 사건기록 PDF 글자는 **가린다** — `src/hooks/useCaseDetail.ts:406-407` → 즉 마스킹 수단은 이미 있는데 녹음 전사 경로에만 안 걸려 있다.
- 고칠 방향: `useClientCare.ts:134`와 `caseAssistant.ts:154` 두 지점에서 전사를 프롬프트에 넣기 전에 마스킹을 한 번 통과시킨다.

### 3. 가리기 유틸이 두 개고, 실제로 쓰이는 쪽이 카드·여권을 못 가린다

- 심각도: 위험
- 어디서: 사건 상세 > 사건기록 탭 (PDF 올린 뒤 글자 추출)
- 무슨 일이: 같은 일을 하는 파일이 두 개인데 가리는 항목이 서로 다르다. 어느 쪽을 골라도 뭔가 새어 나간다.
- 근거:
  - 실제로 쓰이는 쪽 `src/utils/piiMask.ts` — 주민번호(`:18`)·휴대전화(`:21`)·일반전화(`:24`)·이메일(`:27`)·계좌(`:30`). **카드·여권 패턴이 없다.**
  - 안 쓰이는 쪽 `src/services/pii-mask.ts` — 주민번호(`:8`)·계좌(`:11`)·카드(`:14`)·여권(`:17`). **휴대전화·이메일 패턴이 아예 없다.**
  - 두 파일이 `MaskResult`라는 같은 이름의 타입을 서로 다른 모양으로 내보낸다 — `src/services/pii-mask.ts:20-23`은 `{text, count}`, `src/utils/piiMask.ts:8-15`는 `{masked, counts, total}`
- 고칠 방향: 하나만 남긴다. 실제로 붙어 있는 `src/utils/piiMask.ts`에 카드·여권 패턴을 옮기고 `src/services/pii-mask.ts`를 지운다.

### 4. 가리기가 놓치는 형식 — 하이픈 없는 카드번호, 은행명이 뒤에 오는 계좌

- 심각도: 위험
- 어디서: (2번과 같은 경로)
- 무슨 일이: 의뢰인이 말로 부른 번호를 사무직원이 하이픈 없이 받아적으면 안 가려진다.
- 근거:
  - `src/services/pii-mask.ts:14` — 구분자 `[-\s]`가 **필수**라 `1234567890123456`처럼 붙여 쓰면 안 걸린다. 테스트도 하이픈 있는 형태만 본다(`src/__tests__/services/pii-mask.test.ts:24-27`)
  - `src/services/pii-mask.ts:11` — 계좌는 `(은행명)(사이)(숫자)` 순서만 본다. `"123456-78-901234 국민은행으로 보내주세요"`처럼 은행명이 뒤에 오면 안 걸린다.
  - **외국인등록번호는 이미 걸린다** — `src/services/pii-mask.ts:8`의 뒷자리 조건이 `([1-8]\d{6})`이고 외국인등록번호 뒷자리 첫 숫자는 5~8이라 범위 안이다. (구멍이 아니다)
- 고칠 방향: 카드 구분자를 `[-\s]?`로 풀고, 계좌는 은행명이 앞뒤 어디 있어도 걸리게 한다.

### 5. 법인등록번호를 주민번호로 잘못 알고 가려 버린다

- 심각도: 답답
- 어디서: 사건 상세 > 사건기록 탭 (법인 사건)
- 무슨 일이: 법인 사건 서면에 있는 법인등록번호가 별표로 덮여, 정작 필요한 번호를 문서에서 못 읽는다.
- 근거: `src/services/pii-mask.ts:8` — 앞 6자리가 날짜처럼 보이고 7번째가 1~8이면 무조건 주민번호로 본다. 법인등록번호도 13자리라 `110111-1234567` 같은 값이 그대로 걸린다. `src/services/pii-mask.ts:5`는 `"법률 문서에 필요한 값은 건드리지 않도록 패턴을 좁게 잡는다"`고 약속했는데 지켜지지 않는다.
- 고칠 방향: 앞 6자리가 실재하지 않는 날짜이거나 법인 접두 형태면 제외한다.

### 6. 오류 화면이 영어 원문을 작은 고정폭 글씨로 그대로 보여 준다

- 심각도: 말
- 어디서: 화면이 멈췄을 때 뜨는 「오류가 발생했습니다」 화면 (전 화면 공통)
- 무슨 일이: 김 변호사는 `FirebaseError: Missing or insufficient permissions.` 를 12px 고정폭 영어로 본다. 작은 글씨를 못 읽는데다 영어 오류 코드라 읽어도 뜻을 모른다. 전화로 설명조차 못 한다.
- 근거:
  - `src/components/ui/ErrorFallback.tsx:25-27` — `<p className="text-[#414846] text-xs font-mono break-all">{error instanceof Error ? error.message : String(error)}</p>`
  - 이 화면은 `src/App.tsx:233`의 `Sentry.ErrorBoundary` fallback이라 어디서 터지든 이게 뜬다
  - 그런데 `src/utils/friendlyError.ts:9`는 `"원문(영어 메시지)은 절대 화면에 내보내지 않는다"`고 적어 놓았다. 이 파일을 여기서 import하지 않는다.
- 고칠 방향: `friendlyError(error, "화면을 여는 중 문제가 생겼습니다.")`로 바꾸고, 영어 원문은 「자세히」를 눌렀을 때만 보이게 한다(`friendlyError.ts:19`의 `rawErrorText`가 그 용도로 이미 있다).

### 7. 한국어 오류 문구에 섞인 숫자를 HTTP 오류 번호로 착각한다

- 심각도: 답답
- 어디서: 상담 신청 폼 등 `friendlyError`를 쓰는 곳
- 무슨 일이: `"보증금 500만원 입금 처리 실패"` 같은 멀쩡한 한국어 메시지가 `"서버에서 문제가 생겼습니다. 잠시 후 다시 시도해 주세요."`로 바뀐다. 김 변호사는 서버가 고장난 줄 알고 기다리는데, 실제 원인은 다른 것이다.
- 근거:
  - `src/utils/friendlyError.ts:74` — `const m = text.match(/\b(401|402|403|404|408|413|429|5\d\d)\b/);` `\b`는 `[A-Za-z0-9_]` 기준이고 한글은 여기 안 들어가므로, `"500만원"`의 `500` 양옆이 모두 경계로 인정돼 걸린다
  - `src/utils/friendlyError.ts:129-130` — HTTP 검사가 먼저 돌고
  - `src/utils/friendlyError.ts:133` — `"이미 한국어면 그대로 쓴다"`는 검사는 그 **뒤**에 있다
  - 법률 업무 특성상 금액(`413만원`)·호수(`402호`)가 본문에 흔하다
- 고칠 방향: `:133`의 한국어 검사를 `:129`의 HTTP 검사보다 위로 올리고, 번호는 `HTTP 500`처럼 맥락이 있을 때만 잡는다.

### 8. 오류를 한국어로 바꾸는 코드가 두 벌이고 같은 상황에 다른 문장이 뜬다

- 심각도: 말
- 어디서: AI 분석·음성 변환 실패 안내 전반
- 무슨 일이: 같은 402(한도 초과)인데 어느 화면에서 났느냐에 따라 문장이 다르다. 게다가 유료 플랜 사용자에게도 「무료 플랜」이라고 단정한다.
- 근거:
  - `src/services/retry.ts:43` — `case 402: return "무료 플랜의 이번 달 한도를 모두 사용했습니다..."` (실제로 쓰인다 — `src/services/claude.ts:379`, `src/services/rtzr.ts:77`)
  - `src/utils/friendlyError.ts:87` — 같은 402에 `"현재 요금제 한도를 넘었습니다..."`
  - 401도 다르다: `src/services/retry.ts:42` `"로그인이 만료되었습니다"` vs `src/utils/friendlyError.ts:85` `"로그인이 풀렸습니다"`
  - 서로 포함관계가 아니다 — `retry.ts:49`에만 529가 있고, Firebase 코드 표는 `friendlyError.ts:39-71`에만 있다
- 고칠 방향: `friendlyError`를 창구 하나로 삼고 숫자 상태 구간은 `describeHttpError`에 넘긴다. 402 문구에서 「무료 플랜」 단정을 뺀다.

### 9. 의뢰인에게 나가는 문자가 아무 검사도 거치지 않는다

- 심각도: 위험
- 어디서: 사건 상세 > 의뢰인 케어 탭 > 「문자 발송」
- 무슨 일이: AI가 쓴 문장이 검사 없이 의뢰인 휴대폰으로 그대로 나간다. 되돌릴 수 없다. 검사기는 만들어 놨는데 부르지 않는다.
- 근거:
  - `src/components/cases/ClientCareTab.tsx:165` — `await sendClientSms(normalized, content);` 앞뒤로 `checkClientMessage`도 `hasBlockingWarning`도 없다
  - `src/services/clientMessageGuard.ts` 참조 0곳
- 고칠 방향: `handleSendSms`에서 `sendClientSms` 직전에 `checkClientMessage(content)`를 돌리고, 걸리면 발송을 막고 어디가 문제인지 보여 준다.

### 10. 앱이 스스로 금지어와 지어낸 숫자를 문자에 넣는다

- 심각도: 위험 (지어낸 값을 실제로 센 값처럼 보여 준다)
- 어디서: 사건 상세 > 의뢰인 케어 탭 — 메시지 아래 노란 꼬리표
- 무슨 일이: 화면에 `AI 에이전트 분석 8건`이라고 뜬다. 그런데 8은 실제로 센 값이 아니라 문서 개수 × 4다. 김 변호사는 이 숫자를 사실로 믿고 의뢰인에게 보낸다.
- 근거:
  - `src/hooks/useClientCare.ts:48-51` — `// 에이전트 분석 횟수 추정 (문서당 4개 에이전트 …)` / `const agentRuns = documents.length * 4;` — 주석이 스스로 「추정」이라고 적었다
  - `src/components/cases/ClientCareTab.tsx:477` — `{w.label} {w.count}건` 으로 화면에 그대로 뜬다
  - `src/services/prompts.ts:2647`·`:2660` — 그 라벨이 `[수행 작업 상세]`로 프롬프트에 들어간다
  - **모순**: `src/services/prompts.ts:2328` — `"AI", "인공지능", "에이전트", "자동 생성", "챗봇"이라는 말을 쓰지 않는다` + `제공된 자료에 없는 숫자를 만들어 쓰지 않는다`. 금지어와 지어낸 숫자를 프롬프트가 둘 다 금지해 놓고, 같은 코드베이스의 다른 파일이 그 둘을 재료로 넣어 준다
  - `src/services/clientMessageGuard.ts:38-44`의 `FABRICATED_NUMBER_PATTERNS`가 정확히 이런 숫자를 잡으라고 만든 것인데 이 경로에서 불리지 않는다
- 고칠 방향: 라벨을 `prompts.ts:2328`이 지시한 대로 `쟁점 검토`로 바꾸고, 세지 않은 값은 숫자 없이 쓰거나 실제 실행 횟수를 센다.

### 11. 문자 검사기가 자기가 권하는 표현을 자기가 막는다

- 심각도: 답답
- 어디서: (검사기를 붙이면 나타날 문제 — 의뢰인 케어 탭)
- 무슨 일이: 경고를 보고 시키는 대로 고쳐도 계속 걸린다. 김 변호사는 무엇을 고쳐야 하는지 알 수 없다.
- 근거:
  - `src/services/clientMessageGuard.ts:31` — 단정 표현 목록에 `받으실\s*수\s*있습니다` 가 있다
  - `src/services/clientMessageGuard.ts:66` — 그 경고의 설명은 `"~할 수 있습니다", "~로 볼 여지가 있습니다"처럼 바꿔 주세요.` — 막은 표현과 권하는 표현이 같은 꼴이다
  - 같은 줄의 `나옵니다`도 `"등기가 나옵니다"` 같은 절차 안내에 걸린다
  - `src/services/clientMessageGuard.ts:30` — `불법입니다|위법입니다` 는 상대방 행위를 설명하는 문장에도 걸린다
- 고칠 방향: `받으실 수 있습니다`·`나옵니다`를 단정 목록에서 뺀다. 이미 완곡한 표현이다.

### 12. 막는 기준이 뒤집혀 있다 — AI 언급은 막고 「승소합니다」는 통과시킨다

- 심각도: 위험
- 어디서: (11번과 같음)
- 무슨 일이: 승패를 못 박는 문장이 경고만 뜨고 그대로 나갈 수 있다. 의뢰인이 이 문자를 근거로 판단한다.
- 근거:
  - `src/services/clientMessageGuard.ts:84-86` — `return warnings.some((w) => w.kind === "ai_mention");` — `ai_mention` 하나만 막는다
  - `src/services/clientMessageGuard.ts:27-29` — `승소(합니다|하십니다|할\s*것)`, `보장(합니다|드립니다)` 는 `definitive`로 분류되어 막히지 않는다
- 고칠 방향: `definitive`도 막는 대상에 넣는다. 광고규정보다 승패 단정이 의뢰인에게 더 위험하다.

### 13. 문자에 누가 보냈는지 안 적힌다 (서명 함수를 안 쓴다)

- 심각도: 답답
- 어디서: 사건 상세 > 의뢰인 케어 탭 > 「문자 발송」
- 무슨 일이: 의뢰인은 모르는 번호로 서명 없는 문자를 받는다. 누구인지 몰라 답전화를 못 하거나 스팸으로 지운다.
- 근거:
  - `src/services/clientMessageGuard.ts:98` — `/** … 발신번호가 플랫폼 공용이라 본문에 연락처를 넣어 답장·전화가 변호사에게 가게 한다 */` — 이유까지 적어 놓고 `appendSignature`(`:109`)를 아무도 안 부른다
  - `src/components/cases/ClientCareTab.tsx:146` — 포털 문자는 서명을 직접 문자열에 박아 넣었다
  - `src/components/cases/ClientCareTab.tsx:165` — 케어 메시지는 `content` 를 그대로 보낸다. 서명 없음
  - `firmName`·`lawyerName`은 이미 이 컴포넌트에 들어와 있다 (`ClientCareTab.tsx:64-65`)
- 고칠 방향: 두 경로 모두 `appendSignature`를 쓰게 통일한다.

### 14. 문자 길이 제한이 화면에 안 보여 눌러 봐야 실패를 안다

- 심각도: 답답
- 어디서: 사건 상세 > 의뢰인 케어 탭
- 무슨 일이: 글자 수 표시가 없다. 「문자 발송」을 누른 뒤에야 길다는 걸 알고, 얼마나 줄여야 하는지 모른 채 본문을 손으로 깎는다.
- 근거:
  - `src/services/clientMessageGuard.ts:89` — `export const SMS_MAX_LENGTH = 900;` 이 상수를 화면에서 쓰지 않는다
  - `functions/api/notify/client.ts:15` — 서버 `MAX_TEXT_LENGTH = 900`, `:66-70`에서 거절한다
  - `src/services/prompts.ts:2731` — 종결 안내는 `300~500자 이내`로 쓰게 돼 있어 서명까지 붙으면 상한에 가까워진다
- 고칠 방향: 발송 버튼 옆에 `N/900` 글자 수를 띄우고, 넘으면 버튼을 미리 막는다.

### 15. 문자 발송에 확인 절차가 없다 — 작은 버튼 한 번에 나간다

- 심각도: 위험
- 어디서: 사건 상세 > 의뢰인 케어 탭 — 메시지 카드 오른쪽 위 작은 버튼 3개
- 무슨 일이: 「복사」를 누르려다 바로 옆 「문자 발송」을 잘못 누르면 의뢰인에게 문자가 나간다. 되돌릴 수 없다.
- 근거:
  - `src/components/cases/ClientCareTab.tsx:163-165` — 클릭하면 확인 없이 바로 `await sendClientSms(normalized, content);`
  - `src/components/cases/ClientCareTab.tsx:427-435`(문자 발송)·`:446`(복사)·`:456`(삭제) — `px-2.5 py-1.5 text-xs` 짜리 작은 버튼이 나란히 붙어 있다
  - `src/components/cases/ClientCareTab.tsx:166-168` — 보내면 그 번호가 사건에 조용히 저장된다. 잘못 친 번호도 저장된다
  - 확인창은 이미 만들어져 있다 — `src/components/ui/Dialog.tsx:183`의 `ConfirmDialog`. 안 쓴다
- 고칠 방향: `ConfirmDialog`로 감싸고 받는 번호와 첫 줄을 보여 준 뒤 보낸다.

### 16. 오전 9시 전에는 연체 판정과 납부일이 하루 밀린다

- 심각도: 위험
- 어디서: 사건 상세 > 보수 관리 탭 (분납 연체 표시·납부완료 체크)
- 무슨 일이: 재현 조건은 **한국시간 00:00~08:59**다. 이 시간대에 `toISOString()`은 UTC 기준이라 어제 날짜를 준다. 김 변호사는 출근 직후(보통 8시대)에 정산을 본다 — 정확히 이 구간이다.
  1. 어제가 기한인 분납금이 아직 「연체」로 안 뜬다.
  2. 9/17 오전 8시에 「납부완료」를 누르면 납부일이 **9/16**으로 기록된다. 장부에 틀린 날짜가 박힌다.
- 근거:
  - `src/utils/localDate.ts:1` — `// 한국 시간 기준 날짜 문자열 유틸 — toISOString()의 UTC 날짜 오류를 막는다` — 이걸 막으려고 만든 파일인데 참조 0곳
  - `src/components/accounting/FeeManagementTab.tsx:101-103` — `function todayString(): string { return new Date().toISOString().slice(0, 10); }`
  - `src/components/accounting/FeeManagementTab.tsx:106-108` — `return dueDate < todayString();`
  - `src/components/accounting/FeeManagementTab.tsx:577`·`:758` — `paidDate: nextPaid ? todayString() : undefined,`
  - 같은 패턴이 남아 있는 다른 곳: `CaseExpenseTab.tsx:131`, `DepositManagementTab.tsx:114`, `CourtFeeCalculator.tsx:115`, `src/components/cases/CostsSection.tsx:32`, `src/pages/CaseDetailPage.tsx:186`, `src/services/caseAssistant.ts:144`
- 고칠 방향: `new Date().toISOString().slice(0,10)` 을 전부 `src/utils/localDate.ts:4`의 `localDateStr()`로 바꾼다.

### 17. 날짜가 깨지면 「Invalid Date」라는 영어가 그대로 뜬다

- 심각도: 말
- 어디서: (localDate를 쓰는 화면 — 아직 없음. 붙이면 나타난다)
- 무슨 일이: 날짜 자리에 영어로 `Invalid Date`가 뜬다.
- 근거: `src/utils/localDate.ts:10`·`:22` — `if (d.getTime() === 0) return "";` 잘못된 날짜의 `getTime()`은 `NaN`이고 `NaN === 0`은 `false`라 이 검사를 그냥 지나간다.
- 고칠 방향: `if (!Number.isFinite(d.getTime())) return "";` 로 바꾸면 NaN과 0을 한 번에 거른다.

### 18. 확인창 껍데기를 만들어 놓고 기존 모달 6개는 여전히 Esc로 안 닫힌다

- 심각도: 답답
- 어디서: 사건 정보 수정, 사건 삭제 확인, 새 사건 등록, 사무실 경비 입력, 매입 거래 입력, 성공보수 청구
- 무슨 일이: 창이 뜨면 Esc로 못 닫는다. Tab을 누르면 초점이 창 밖 배경 버튼으로 새어 나간다.
- 근거:
  - `src/components/ui/Dialog.tsx:86-89`(Esc 닫기)·`:92-112`(초점 가두기)·`:117`(초점 복귀)·`:135`(`role="dialog"`) — 전부 구현돼 있으나 참조 0곳
  - `src/components/cases/CaseHeader.tsx:184`, `:309` — `Escape|keydown|useEffect`를 찾으면 **검색 결과 없음**
  - `src/components/cases/NewCaseModal.tsx:66`, `OfficeExpenseModal.tsx:125`, `PurchaseTransactionModal.tsx:123`, `SuccessFeeClaimModal.tsx:155` — 전부 맨 `fixed inset-0` div
  - `role="dialog"`가 붙은 건 `PaymentModal.tsx:104`와 `DocumentPage.tsx:1087` 둘뿐
- 고칠 방향: 6개를 `Dialog`로 옮기고, 삭제 확인창은 `ConfirmDialog`로 바꾼다. 옮길 계획이 없으면 `Dialog.tsx`를 지운다.

### 19. 확인창 낭독 문구의 조사가 틀렸고, 안전한 동작에서도 Enter가 취소로 간다

- 심각도: 말
- 어디서: (확인창을 붙이면 나타남)
- 무슨 일이: 낭독기가 「삭제 또는 취소**을** 고르세요」라고 읽는다. 그리고 위험하지 않은 확인창에서 Enter를 치면 저장이 아니라 취소된다.
- 근거:
  - `src/components/ui/Dialog.tsx:238` — `{confirmLabel} 또는 {cancelLabel}을 고르세요.` `cancelLabel` 기본값 `"취소"`는 받침이 없어 `를`이 맞다
  - `src/components/ui/Dialog.tsx:213` — `initialFocus="[data-confirm-cancel]"` 가 고정이다. `danger` 기본값은 `false`인데 초점은 항상 「취소」에 간다
  - 참고: 삭제 같은 위험한 동작에서 「취소」에 초점을 두는 것 자체는 **맞는 선택**이다. 문제는 `danger`가 아닐 때도 똑같이 적용되는 것이다
- 고칠 방향: 조사를 받침에 따라 고르거나 `"… 중에서 고르세요."`로 바꾼다. 초점은 `danger`일 때만 취소에 둔다.

### 20. 테스트가 거꾸로 붙어 있다 — 안 쓰는 파일만 테스트가 있다

- 심각도: 답답
- 어디서: (코드 전체)
- 무슨 일이: 5개 중 유일하게 테스트가 있는 파일이 하필 아무 데서도 안 쓰는 파일이다. 정작 실제로 도는 코드는 테스트가 없다.
- 근거:
  - 있음: `src/services/pii-mask.ts` ← 프로덕션 참조 0곳. 실제로 쓰이는 `src/utils/piiMask.ts`는 따로 테스트를 갖고 있다 — 같은 목적에 모듈 2개, 테스트 2벌
  - 없음: `src/utils/friendlyError.ts` — 순서가 중요한 분기가 `:113-137`에 5단계로 있다. 7번 버그가 살아남은 이유다
  - 없음: `src/services/clientMessageGuard.ts` — 실제 의뢰인에게 나가는 문자를 거르는 정규식 12개(`:18-44`)
  - 없음: `src/utils/localDate.ts` — 존재 이유가 시간대 경계인데 시계를 고정해 검증하기 가장 쉬운 대상이다
  - 없음: `src/components/ui/Dialog.tsx` — Esc·초점 가두기·초점 복귀(`:86-117`)
- 고칠 방향: `friendlyError`·`clientMessageGuard`·`localDate` 세 개를 먼저 붙인다.

---

## 확신이 낮은 항목

- **모바일에서 키보드가 확인창 버튼을 가리는 문제 (추측).** `src/components/ui/Dialog.tsx:124`가 휴대폰에서 창을 화면 아래(`items-end`)에 붙이고, `:79`가 열릴 때 첫 입력칸에 자동으로 초점을 준다. iOS Safari는 키보드가 떠도 `position: fixed` 기준 영역을 줄이지 않으므로 버튼이 키보드 뒤로 들어갈 것으로 본다. **개발서버·브라우저를 쓰지 않는 조건이라 확인하지 못했다.**
- **`src/services/pii-mask.ts`의 lookbehind 구형 사파리 호환 (추측).** lookbehind는 사파리 16.4부터 지원한다. 그 이전 버전에서는 모듈을 읽는 순간 문법 오류가 난다. 지금은 아무도 import하지 않아 실제 피해는 없다 — 2번 지적대로 연결할 때 같이 봐야 한다.
- **Sentry로 나가는 오류 본문에 개인정보가 섞일 가능성 (추측).** `src/config/sentry.ts:4`의 `SENSITIVE_KEYS`는 **객체의 키 이름**만 검사해 가린다. 오류 메시지 문자열 자체는 거르지 않는다. `src/services/claude.ts:462`·`src/services/rtzr.ts:84`가 `Sentry.captureException(error)`로 올리므로, 오류 메시지에 전사 일부가 들어 있으면 그대로 올라간다.
- **주민번호 마스킹이 하이픈을 없던 자리에 넣는다.** 테스트가 `"9001012345678"` → `"900101-*******"`를 기대한다. 원문에 없던 하이픈이 생긴다. 원문 인용 정확성이 중요한 법률 문서에서 맞는 선택인지는 판단하지 못했다.
