# 저장 규칙과 보안 점검 (2026-09-17)

담당: Firestore 규칙 · Storage 규칙 · Cloudflare Functions 인증. 코드는 고치지 않았다.
2026-09-11 r2-03에서 이미 고쳐진 것(자기 승인, health ?test 공개, voyage/rerank/clova 한도, receipts 규칙 누락, 연장 결제 기간 계산, plan 캐시 60초, transcribe/{id} 소유권, consult Origin 앵커, Storage write/delete 분리)은 다시 쓰지 않았다.

## 읽은 파일

- `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `public/_headers`
- `functions/api/_middleware.ts`, `_shared/auth.ts`, `_shared/rate-limit.ts`, `_shared/plan.ts`, `_shared/cors.ts`, `_shared/firestore.ts`, `_shared/solapi.ts`
- `functions/api/claude.ts`, `transcribe.ts`, `transcribe/[id].ts`, `voyage.ts`, `rerank.ts`, `clova-ocr.ts`, `verify-business.ts`, `consult.ts`, `health.ts`, `precedent-search.ts`(1~123)
- `functions/api/payment/confirm.ts`, `signing/[token].ts`, `portal/[token].ts`, `notify/client.ts`, `approved.ts`, `bug.ts`, `signup.ts`, `expiry.ts`
- `src/App.tsx`, `src/pages/AdminPage.tsx`, `PendingPage.tsx`, `SigningPage.tsx`, `PortalPage.tsx`, `CaseDetailPage.tsx`
- `src/components/cases/ClientCareTab.tsx`, `ContractGenerateModal.tsx`, `ContractPaymentSection.tsx`, `CaseHeader.tsx`
- `src/components/payment/PlanSelector.tsx`, `PaymentModal.tsx`, `UsageSummary.tsx`
- `src/components/ui/BugReportButton.tsx`, `ApiStatusMonitor.tsx`, `src/components/layout/AppLayout.tsx`, `src/components/auth/PendingScreen.tsx`
- `src/hooks/usePlanLimits.ts`, `useClientCare.ts`
- `src/services/firebase/firestore.ts`, `auth.ts`, `signing.ts`, `src/services/payment.ts`, `claude.ts`, `file-save.ts`, `notify.ts`
- `src/types/subscription.ts`, `bugReport.ts`, `src/config/constants.ts`

## 발견

### 1. 서명 링크가 하루 만에 죽는데 화면은 계속 「서명 대기」이고 다시 보낼 방법이 없다

- 심각도: 막힘
- 어디서: 사건 상세 > 수임료·계약 > 「서명 요청 내역」
- 무슨 일이: 어제 만든 수임계약서가 오늘도 「서명 대기」로 보이고 「서명 링크」 복사 버튼도 살아 있다. 그 링크를 의뢰인에게 다시 보내면 의뢰인 화면에는 "서명 기한 만료 — 변호사에게 다시 요청해 주세요"만 뜬다. 기한을 늘리거나 다시 보내는 버튼이 없어 계약서를 처음부터 다시 만드는 수밖에 없다.
- 근거:
  - `src/components/cases/ContractGenerateModal.tsx:143` — `const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));`
  - `functions/api/signing/[token].ts:95-97` — `if (expired && status === "pending") { ... status: { stringValue: "expired" } }` (의뢰인이 링크를 열었을 때만 만료로 바뀐다. 안 열면 status는 계속 pending)
  - `src/components/cases/ContractPaymentSection.tsx:328` — `pending: { label: "서명 대기", ... }`, `:370` — `{request.status === "pending" && (<button onClick={handleCopyLink}>`
  - 버튼은 링크 복사·다운로드·계약서 보기 셋뿐 — `src/components/cases/ContractPaymentSection.tsx:369-393`
  - 의뢰인 쪽 막다른 문구 — `src/pages/SigningPage.tsx:274-277`
  - 규칙은 expired→pending 되살리기를 막는다(의도는 맞다) — `firestore.rules:304-306`
- 고칠 방향: 목록에서 `expiresAt`을 함께 보고 지났으면 「기한 만료」로 표시해 복사 버튼을 숨기고, pending 요청에 「기한 연장」 버튼(=expiresAt만 갱신, 규칙은 status만 제약하므로 통과)을 둔다. 기본 만료도 24시간→7일.
- 권한 테스트: "소유자가 expiresAt만 바꾸는 update → 허용 / status를 expired에서 pending으로 되돌리는 update → 거부"를 규칙 테스트로 두면 다음엔 사람이 아니라 검사가 잡는다.

### 2. 의뢰인에게 보내는 문자가 아무 번호로나 나갈 수 있다

- 심각도: 위험
- 어디서: 서버 (사건 상세 > 의뢰인 케어 > 문자 보내기가 쓰는 통로)
- 무슨 일이: 서버가 "이 번호가 이 사건의 의뢰인 번호인가"를 확인하지 않는다. 유료 계정 하나로 Law-Caddy 발신번호를 빌려 아무 번호에나 아무 문구를 보낼 수 있다. 발신번호는 모든 사용자가 함께 쓰므로, 스팸 신고가 쌓여 번호가 정지되면 전체 사무소의 문자 기능이 한꺼번에 멈춘다.
- 근거:
  - `functions/api/notify/client.ts:52` — `const to = (body.to ?? "").replace(/\D/g, "");`, `:75` — `await sendSms(context.env, to, text);` (검사는 형식 정규식과 900자 길이뿐)
  - `functions/api/notify/approved.ts:7-8` — "수신번호는 클라이언트 입력을 신뢰하지 않고 Firestore users/{uid}.phone에서 서버가 직접 조회한다(임의 번호로 문자를 보내는 릴레이 악용 방지)", 실제 조회는 `:43`
  - 화면은 입력란 값을 그대로 보낸다 — `src/components/cases/ClientCareTab.tsx:159-165`, `src/services/notify.ts:57-63`
  - 시간당 30건 상한은 isolate별 메모리 — `functions/api/notify/client.ts:18-20`
- 고칠 방향: `caseId`를 함께 받아 서버가 `cases/{caseId}.ownerId == uid`와 `clientPhone` 일치를 확인한 뒤 그 번호로만 보낸다. 번호를 바꾸려면 사건 문서를 먼저 고치게 한다.
- 권한 테스트: "본인 사건의 clientPhone으로 보내면 200 / 다른 번호를 to에 넣으면 403" 두 줄을 두면 다음엔 사람이 아니라 검사가 잡는다.

### 3. 사건을 지우면 의뢰인 케어 메시지가 주인도 못 여는 채 남는다

- 심각도: 위험
- 어디서: 사건 상세 > 우측 상단 휴지통 > 「삭제하기」
- 무슨 일이: 사건 문서만 지워지고 그 아래 붙어 있던 의뢰인 케어 메시지(의뢰인 이름과 사건 내용이 담긴 AI 작성 문구)는 그대로 남는다. 규칙이 부모 사건을 찾지 못해 변호사 본인도 영영 읽거나 지울 수 없다. 반면 관리자 규칙은 부모를 보지 않아 관리자만 계속 읽을 수 있다.
- 근거:
  - `firestore.rules:133-134` — `allow read, write: if isAuthenticated() && get(/databases/$(database)/documents/cases/$(caseId)).data.ownerId == request.auth.uid;` (부모가 없으면 `.data` 참조에서 규칙 오류 → 거부)
  - `firestore.rules:137` — `allow read: if isAdmin();` (부모를 보지 않는다)
  - `src/services/firebase/firestore.ts:752-755` — `deleteCase()`가 `cases/{caseId}` 문서 하나만 지운다
  - 호출 경로 — `src/pages/CaseDetailPage.tsx:476-479` → `src/hooks/useCaseDetail.ts:655-660`
  - 확인 문구는 케어 메시지를 언급하지 않는다 — `src/components/cases/CaseHeader.tsx:324-325`
  - 같은 구조가 분할납부에도 있다 — `firestore.rules:200-203` / `src/services/firebase/accounting.ts:239-242`
- 고칠 방향: `deleteCase`가 `clientCareMessages`를 먼저 전부 지운 뒤 사건 문서를 지운다(`deleteFee`도 `installments` 동일). 확인 문구에 무엇이 함께 지워지는지 적는다.
- 권한 테스트: "사건 생성 → 케어 메시지 1건 → 사건 삭제 → 같은 uid로 그 메시지 read"가 거부되면 실패로 잡는 규칙 테스트를 두면 다음엔 사람이 아니라 검사가 잡는다.

### 4. 이번 달 문서 사용량이 언제나 「0 / 3건」으로 보인다

- 심각도: 위험
- 어디서: 설정 > 요금제 > 「이번 달 사용량」
- 무슨 일이: 문서를 세 건 만들어도 막대는 0/3에 머문다. 화면만 믿고 다음 문서를 만들려 하면 서버가 "무료 요금제의 문서 생성 월 3건을 모두 썼습니다"로 막는다. 화면과 서버가 서로 다른 말을 한다.
- 근거:
  - 화면 쪽 — `src/hooks/usePlanLimits.ts:115-120`: `collection(db!, "documents"), where("ownerId","==",user.uid), where("createdAt",">=",firstDay)` (등호+범위가 서로 다른 필드 → 복합 색인 필요)
  - 색인 쪽 — `firestore.indexes.json:17-24`에 documents는 `caseId + createdAt`뿐. `ownerId + createdAt` 없음. (cases는 `:3-10`에 있어 사건 막대만 정상)
  - 실패를 0으로 삼킨다 — `src/hooks/usePlanLimits.ts:127-133` `// 쿼리 실패 시 보수적으로 0 유지 (차단하지 않음)` → `setDocsUsed(0);`
  - 화면 표시 — `src/components/payment/UsageSummary.tsx:99-101`
  - 서버 판정 — `functions/api/_shared/plan.ts:324-326` `if (docs.completed >= FREE_MONTHLY_DOCS)`
- 고칠 방향: `firestore.indexes.json`에 documents의 `ownerId ASC + createdAt ASC`를 추가해 배포한다. catch에서 0으로 되돌리지 말고 "사용량을 불러오지 못했습니다"를 띄워 조용한 실패를 없앤다.
- 권한/회귀 테스트: 에뮬레이터에서 문서 2건을 만든 뒤 화면과 같은 쿼리를 실행해 `size === 2`인지 보는 스모크 테스트를 두면, 색인이 빠진 채 배포되는 일을 다음엔 사람이 아니라 검사가 잡는다.

### 5. 의뢰인 포털을 꺼도 링크가 살아 있고, 다시 켜면 예전 링크가 되살아난다

- 심각도: 위험
- 어디서: 사건 상세 > 의뢰인 케어 > 「포털 비활성화」 / 「포털 링크 만들기」
- 무슨 일이: 끄기는 스위치만 내리고 주소는 그대로 둔다. 몇 달 뒤 다른 의뢰인을 위해 포털을 다시 켜면 예전에 뿌렸던 그 주소가 다시 열린다. 그 링크를 가진 사람(전 의뢰인, 링크를 전달받은 제3자)이 의뢰인 이름·사건번호·법원명·다가오는 기한·최근 진행 내역을 다시 본다. 「링크 폐기하고 새로 발급」 버튼이 없다.
- 근거:
  - `src/components/cases/ClientCareTab.tsx:109-111` — 끄기는 `updateCase(caseData.id, { portalEnabled: false })`만
  - `src/components/cases/ClientCareTab.tsx:113-121` — `// 기존 토큰 재사용, 없으면 새로 발급 (32자 hex)` `let token = portalToken; if (!token) { ... }`
  - `functions/api/portal/[token].ts:66` — `if (!caseDoc || !fields || !readBool(fields.portalEnabled))` (플래그만 본다. 토큰 만료 필드를 읽는 코드가 없다)
  - 내려주는 내용 — `functions/api/portal/[token].ts:91-101`
  - 규칙은 토큰 교체를 허용한다(막혀서가 아니라 화면이 안 한다) — `firestore.rules:121-122`
- 고칠 방향: 비활성화 때 `portalToken`을 함께 지우고, 활성화는 언제나 새 토큰을 발급한다. 화면에 「새 링크로 교체」를 둔다.
- 권한 테스트: "포털을 껐다 다시 켠 뒤 예전 토큰으로 GET /api/portal/{옛토큰} → 404"를 두면 다음엔 사람이 아니라 검사가 잡는다.

### 6. 포털 스위치가 실패해도 아무 말이 없다

- 심각도: 위험
- 어디서: 사건 상세 > 의뢰인 케어 > 포털 스위치
- 무슨 일이: 저장이 실패하면 오류 없이 스위치만 슬그머니 원래대로 돌아온다. 김 변호사는 "눌렀는데 아무 일도 안 일어났다"만 보고, 껐다고 생각한 포털이 실제로는 계속 열려 있을 수 있다.
- 근거: `src/components/cases/ClientCareTab.tsx:124-128` — `} catch { /* 실패 시 상태 유지 */ } finally { setPortalBusy(false); }` (같은 파일 `:154-156`의 문자 발송은 `setSmsError(...)`로 오류를 보여주는 것과 대비된다)
- 고칠 방향: catch에서 "포털 설정을 저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러 주세요."를 같은 자리에 띄운다.
- 권한 테스트: 규칙 거부 상황을 흉내 낸 테스트에서 화면에 오류 문구가 뜨는지 확인하는 컴포넌트 테스트를 두면 다음엔 사람이 아니라 검사가 잡는다.

### 7. 관리자 계정 하나가 모든 변호사의 사건·녹음·문서·의뢰인 메시지를 읽을 수 있다

- 심각도: 위험
- 어디서: 저장 규칙 전반 (화면에는 안 보이는 문)
- 무슨 일이: `role`이 `admin`인 계정 하나면 전국 모든 변호사의 상담 녹음, 수임계약서 전문, 의뢰인 이름·연락처, 사건기록 PDF를 전부 읽을 수 있다. 변호사법상 비밀유지의무가 걸린 자료인데, 정작 관리자 화면은 이 권한을 쓰지도 않는다.
- 근거:
  - 업무 컬렉션마다 관리자 읽기 — `firestore.rules:128`(cases), `:137`(clientCareMessages), `:148`(recordings), `:158`(documents), `:168`(opponentDocs), `:178`(case_records), `:188`(deadlines), `:196`(fees), `:204`(installments), `:213`(case_expenses), `:221`(transactions), `:229`(office_expenses), `:237`(deposits), `:247`(monthly_summary), `:307`(signing_requests)
  - Storage도 같다 — `storage.rules:43`, `:57`, `:71`, `:85`, `:95`, `:110`, `:125`
  - 판정은 사용자 문서의 role 한 줄 — `firestore.rules:13-16`
  - 관리자 화면이 실제로 쓰는 것은 users·bug_reports뿐 — `src/pages/AdminPage.tsx:22-31`, 구현은 `src/services/firebase/firestore.ts:833-1005`
- 고칠 방향: 업무 컬렉션의 `allow read: if isAdmin()`을 지운다. 장애 대응 조회가 필요하면 서비스 계정 서버 경로로 옮기고 접근 기록을 남긴다. users·bug_reports의 관리자 읽기만 남긴다.
- 권한 테스트: "admin 토큰으로 남의 cases·recordings·documents·case_records read → 거부"를 규칙 테스트로 두면, 다음에 누가 편의상 다시 열어도 사람이 아니라 검사가 잡는다.

### 8. 빌드 설정 하나로 AI 열쇠가 브라우저에 그대로 실린다

- 심각도: 위험
- 어디서: 배포 설정 (사용자에겐 안 보이는 자리)
- 무슨 일이: 빌드 환경에 `VITE_ANTHROPIC_API_KEY`가 있으면 그 값이 배포된 자바스크립트 파일에 문자 그대로 박힌다. 누구나 열어 열쇠를 꺼내 쓸 수 있고, 동시에 요금제·사용량 검사와 요청 제한을 통째로 지나친다.
- 근거:
  - `src/services/claude.ts:68` — `const DIRECT_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;`
  - `src/services/claude.ts:453-455` — `if (DIRECT_API_KEY) { return await withRetry(() => callClaudeDirect(...)); }` (개발 여부를 보지 않는다), 채팅도 같다 `:490-492`
  - 프로덕션 브라우저 직접 호출을 상정한 헤더 — `src/services/claude.ts:313-315`, `:524-526`
  - 같은 저장소의 다른 프록시는 `isDev` 가드를 건다 — `src/services/rag.ts:411`, `src/services/reranker.ts:512,515`
  - 지나쳐 버리는 검사 — `functions/api/_shared/plan.ts:295-345`, `functions/api/_shared/rate-limit.ts:15`
- 고칠 방향: `:453`과 `:490`의 조건을 `if (isDev && DIRECT_API_KEY)`로 바꾼다. 배포 파이프라인에서 이 변수가 설정돼 있으면 빌드를 실패시킨다.
- 권한 테스트: 프로덕션 빌드 산출물에서 `sk-ant-` 문자열이 나오면 실패하는 검사를 CI에 두면 다음엔 사람이 아니라 검사가 잡는다.

### 9. 버그 신고가 실패해도 「저장되었습니다」라고 나오고, 내 신고를 확인할 방법이 없다

- 심각도: 위험
- 어디서: 화면 오른쪽 아래 동그란 「버그 리포트」 버튼
- 무슨 일이: 저장이 실패해도 화면은 똑같이 "리포트가 저장되었습니다"를 보여준다. 김 변호사는 접수된 줄 알고 기다린다. 게다가 규칙이 읽기를 관리자에게만 열어 두어, 본인이 낸 신고를 나중에 다시 볼 방법이 아예 없다.
- 근거:
  - `src/components/ui/BugReportButton.tsx:59-61` — `} catch { // Firestore 저장 실패해도 카카오톡 전송은 진행 }`
  - `src/components/ui/BugReportButton.tsx:72` — `setSent(true);` (무조건), 표시 문구는 `:177-181`
  - `firestore.rules:316` — `allow read: if isAdmin();` (제보자 본인을 위한 read 규칙이 없다)
  - 생성 규칙 자체는 화면과 맞는다 — `firestore.rules:313-315` ↔ `src/components/ui/BugReportButton.tsx:45,49`
- 고칠 방향: catch에서 실패를 구분해 "저장하지 못했습니다. 카카오톡으로 보내 주세요"로 문구를 나눈다. 규칙에 `allow read: if isAuthenticated() && resource.data.reporterUid == request.auth.uid`를 더하고 설정 화면에 「내 신고 내역」을 둔다.
- 권한 테스트: "제보자 본인이 자기 bug_report read → 허용 / 남의 것 read → 거부"를 두면 다음엔 사람이 아니라 검사가 잡는다.

### 10. 화면에 없는 「월 150회」 한도가 서버에만 있다

- 심각도: 답답
- 어디서: 설정 > 요금제 > 「이번 달 사용량」
- 무슨 일이: 사용량 화면은 「사건 분석 n/5」와 「문서 생성 n/3」 두 줄만 보여준다. 그런데 서버에는 한 줄 더 있다 — AI 호출과 음성 변환을 합쳐 월 150회. 사건 분석 한 건에 AI가 6~8번 돌아가므로, 화면이 "2/5, 1/3"인데도 갑자기 "이번 달 AI 호출 한도(150회)를 모두 썼습니다"가 뜰 수 있다. 어디서 얼마를 썼는지 볼 화면이 없다.
- 근거:
  - `functions/api/_shared/plan.ts:50` — `const FREE_MONTHLY_CALLS = 150;`, `:313-314` — `if (totalCalls > FREE_MONTHLY_CALLS) { return quotaExceededResponse(...) }`
  - 호출 한 건이 에이전트 6~8회라는 전제 — `functions/api/_shared/plan.ts:46` 주석
  - 화면은 두 막대뿐 — `src/components/payment/UsageSummary.tsx:92,94` / `:99,101`
  - 표시 상수에도 호출 수 항목이 없다 — `src/types/subscription.ts:14-19`
  - 기록은 있고 규칙도 본인 읽기를 열었는데 읽는 화면이 없다 — `firestore.rules:253-256`, src 전체에서 `usage_monthly` 참조 0건
- 고칠 방향: `UsageSummary`에 「AI 호출 n/150」 막대를 더하고 `usage_monthly/{uid}_{YYYYMM}`을 읽어 채운다. 80%를 넘으면 미리 알린다.
- 권한 테스트: "본인 usage_monthly read → 허용 / 남의 것 read → 거부 / 클라이언트 write → 거부" 세 줄을 두면 다음엔 사람이 아니라 검사가 잡는다.

### 11. 요청 제한이 실제로는 몇 배로 늘어나고, 판례 검색에는 제한이 아예 없다

- 심각도: 답답
- 어디서: 서버 전반 (사용자에겐 안 보이는 자리)
- 무슨 일이: "분당 60회", "시간당 30건" 같은 상한이 서버 조각(isolate)마다 따로 세어진다. 조각이 여럿이면 실제 상한은 그만큼 곱해진다. 문자는 건당 요금이 나가므로 그대로 비용이 된다. 판례 검색은 아예 제한 목록에 없다.
- 근거:
  - `functions/api/_shared/rate-limit.ts:43-46` — `const minuteLog = new Map<string, number[]>(); ... const dailyLog = new Map<...>();` (한계는 `:3-5` 주석이 인정한다)
  - 문자 발송도 같다 — `functions/api/notify/client.ts:18-20`
  - 상담 접수만 KV 카운터를 병행 — `functions/api/consult.ts:99-102`, 도구는 `functions/api/_shared/rate-limit.ts:187-205`에 이미 있다
  - 판례 검색이 규칙 목록에 없다 — `functions/api/_shared/rate-limit.ts:14-27`(MINUTE_RULES), `:35-41`(DAILY_RULES) → `:126` `if (!minuteRule && !dailyRule) return null;`
  - 그 경로는 내부 토큰만으로 인증 없이 열린다 — `functions/api/_middleware.ts:20`
  - 인증 실패 요청은 제한 대상이 아니다 — `functions/api/_middleware.ts:63-72` (실패 시 `checkRateLimit` 전에 return)
- 고칠 방향: 비용이 나가는 경로(claude·transcribe·notify/*)의 카운터를 KV로 옮긴다. `precedent-search`를 MINUTE_RULES에 넣는다. 인증 실패 요청도 IP 기준으로 세도록 미들웨어 순서를 바꾼다.
- 권한 테스트: "같은 uid로 61회 연속 호출 → 429"를 KV 기준으로 확인하는 통합 테스트를 두면 다음엔 사람이 아니라 검사가 잡는다.

### 12. 결제창을 닫았다 다시 열 때마다 새 주문번호가 생긴다

- 심각도: 답답
- 어디서: 설정 > 요금제 > 「업그레이드」 > 결제창
- 무슨 일이: 카드가 없어 창을 닫았다가 다시 열면 주문번호가 바뀐다. 토스 쪽에 미완결 주문이 계속 쌓인다. 이걸 막으려고 만든 함수가 코드에 있는데 아무도 부르지 않는다.
- 근거:
  - `src/services/payment.ts:40-64` — `export function getOrCreateOrderId(...)` (주석 `:37-39`: "결제창을 닫았다 다시 열거나 승인 화면에서 뒤로 갔다 다시 결제해도 주문이 둘로 늘지 않는다")
  - `src/components/payment/PaymentModal.tsx:7`(import에 `createOrderId`만), `:90` — `orderId: createOrderId(planId, period, user.uid),`
  - 보관함을 비우는 함수도 승인 성공 시에만 불린다 — `src/services/payment.ts:148`
- 고칠 방향: `PaymentModal.tsx:90`을 `getOrCreateOrderId(...)`로 바꾸고 import를 교체한다.
- 회귀 테스트: "같은 플랜·기간으로 30분 안에 두 번 주문번호를 만들면 같은 값" 단위 테스트를 두면 다음엔 사람이 아니라 검사가 잡는다.

### 13. 음성 변환 횟수가 AI 호출 칸에 기록된다

- 심각도: 말
- 어디서: 서버 집계 (사용자에겐 안 보이는 자리)
- 무슨 일이: 음성 변환을 아무리 써도 `transcribeCalls`는 0으로 남고 전부 `claudeCalls`에 더해진다. 합산 상한이 같아 막히는 시점은 달라지지 않지만, 나중에 "음성 변환에 돈이 얼마나 나가나"를 이 숫자로 보면 전부 AI 호출로 보인다.
- 근거:
  - `functions/api/_shared/plan.ts:301` — `kind: UsageKind = "claude",` (기본값), 필드를 나누는 곳은 `:266-273`
  - `functions/api/transcribe.ts:29` — `const denied = await requireUsageQuota(context.env, uid);` (세 번째 인자를 안 넘긴다)
  - 문서는 넘기라고 적혀 있다 — `functions/api/_shared/plan.ts:290-293`
- 고칠 방향: `functions/api/transcribe.ts:29`를 `requireUsageQuota(context.env, uid, "transcribe")`로 바꾼다.
- 회귀 테스트: "POST /api/transcribe 1회 후 usage_monthly의 transcribeCalls가 1, claudeCalls가 0"을 확인하면 다음엔 사람이 아니라 검사가 잡는다.

### 14. 실서비스가 내 컴퓨터 주소(localhost)를 계속 허용하고, 쓰지 않는 보안 설정이 남아 있다

- 심각도: 말
- 어디서: 서버 설정 (사용자에겐 안 보이는 자리)
- 무슨 일이: 배포된 서버가 `http://localhost` 출처의 요청도 정식 출처로 받아 준다. 같은 판정을 랜딩 상담 접수의 출처 검사도 쓰므로, 로컬에서 띄운 페이지로 상담을 쏘면 출처 검사를 통과한다. 그리고 보안 정책(CSP)을 만드는 함수가 하나 있는데 어디서도 쓰이지 않아, 다음 사람이 "CSP는 여기서 관리한다"고 오해한다.
- 근거:
  - `functions/api/_shared/cors.ts:12` — `const DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;`, `:27` — `if (DEV_ORIGIN_PATTERN.test(origin)) return origin;` (환경 구분이 없다)
  - 상담 접수가 같은 판정을 쓴다 — `functions/api/_shared/cors.ts:15` 주석, `functions/api/consult.ts:67`
  - 죽은 함수 — `functions/api/_shared/cors.ts:54-71` `export function securityHeaders()` (호출 0건). 실제 적용되는 것은 `:92-93`의 두 헤더뿐이고, 사이트 CSP는 `public/_headers`의 `/*` 블록이 담당한다
  - 그 죽은 함수의 `connect-src`에는 토스 도메인이 없다 — `functions/api/_shared/cors.ts:65` (적용됐다면 결제위젯이 막혔을 내용. `public/_headers`에는 `https://*.tosspayments.com`이 들어 있다)
- 고칠 방향: localhost 허용을 개발 환경 조건 뒤로 옮긴다. `securityHeaders()`는 지우고 "CSP는 `public/_headers` 한 곳"이라는 주석을 남긴다.
- 권한 테스트: "Origin: http://localhost:3000으로 프로덕션 /api/consult POST → 403"을 두면 다음엔 사람이 아니라 검사가 잡는다.

## 확신이 낮은 항목

- **발견 4의 색인 누락** — 콘솔에서 손으로 만든 색인은 `firestore.indexes.json`에 나타나지 않는다. 배포 환경에는 이미 있을 수도 있다. 파일 기준으로 `documents`의 `ownerId + createdAt`이 없는 것은 사실이다(`firestore.indexes.json:17-24`). 실제 배포 색인 목록 확인이 필요하다. (추측)
- **발견 8의 실제 노출 여부** — Cloudflare Pages 빌드 환경 변수를 볼 수 없었다. `VITE_ANTHROPIC_API_KEY`가 설정돼 있지 않다면 지금 노출은 없다. 코드가 그 설정을 막지 않는다는 점만 확인했다. (추측)
- **영수증 파일 형식 거부 가능성** — `src/pages/CaseDetailPage.tsx:376-378`은 `uploadBytes(storageRef, file)`를 메타데이터 없이 부른다. 브라우저가 파일 형식을 못 알아내면 `application/octet-stream`으로 올라가고, 규칙(`storage.rules:118-120`)은 `image/.*`와 `application/pdf`만 허용하므로 거부된다. 확장자 없는 스캔 파일 같은 드문 경우라 실제 발생 빈도는 낮아 보인다. (추측)
- **`/api/verify-business`의 DEMO_KEY 폴백** — `functions/api/verify-business.ts:43` `const serviceKey = context.env.DATA_GO_KR_API_KEY || "DEMO_KEY";`. 키가 없으면 홈택스 HTML 문자열 검색으로 넘어간다(`:91-115`). r2-03에서 이미 확신 낮은 항목으로 올렸고, 실호출이 금지라 이번에도 응답을 보지 못했다. 상태는 그대로다. (추측)
- **`checkPaidPlan`의 실패 시 통과** — `functions/api/_shared/plan.ts:139-147`은 Firestore 조회가 실패하면 `allowed: true`로 통과시킨다(주석에 의도로 적혀 있다). 서비스 계정 설정이 빠지면 모든 한도 검사가 사라진다. 의도된 선택이라 발견에 넣지 않았으나, 이 상태를 알리는 경보는 필요해 보인다. (추측)
