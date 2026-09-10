# r2-03. 저장 규칙·서버 인증·요금 집행 점검 (LAW-CADDY)

점검일 2026-09-11. 관점은 "돈이 새는가 / 남의 사건이 보이는가 / 규칙과 화면이 어긋나 항상 실패하는가"이다.
코드 수정·실행·실API 호출은 하지 않았다. 아래 모든 줄 번호는 `C:/Users/jeonw/.antigravity/law-caddy/law-caddy/` 기준이다.
이미 보고된 6건(상담 파일 삭제 차단 / 관리자 목록 pending 미조회 / 거부 사용자 재제출 / 만료 후 plan 미복귀 / 체크포인트 클릭마다 문서 생성 / 같은 IP 1분 60회)은 뺐다.

## 읽은 파일

- 규칙. `firestore.rules`(248줄 전부), `storage.rules`(94줄 전부), `firebase.json`
- 서버 공통. `functions/api/_middleware.ts`, `_shared/auth.ts`, `_shared/plan.ts`, `_shared/rate-limit.ts`, `_shared/firestore.ts`, `_shared/cors.ts`, `_shared/solapi.ts`, `_shared/types.ts`
- 서버 경로. `claude.ts`, `transcribe.ts`, `transcribe/[id].ts`, `voyage.ts`, `rerank.ts`, `clova-ocr.ts`, `verify-business.ts`, `consult.ts`, `health.ts`, `payment/confirm.ts`, `signing/[token].ts`, `portal/[token].ts`, `notify/approved.ts`·`bug.ts`·`client.ts`·`expiry.ts`·`signup.ts`, `precedent-search.ts`(1~140줄)
- 화면. `rg`로 뽑은 Firestore/Storage 호출 전수(`collection(|doc(|setDoc|updateDoc|deleteDoc|addDoc|getDocs|getDoc(|uploadBytes|deleteObject`) — `src/services/firebase/{firestore,accounting,auth,signing,storage}.ts`, `src/services/{file-save,payment,notify,notifications,backupExport,autoRevenue,reportGenerator,api-auth,rag,reranker,clova-ocr,business-verify,rtzr}.ts`, `src/hooks/{useAuth,useCases,usePlanLimits,useCaseDetail,useRecording}.ts`, `src/pages/{DashboardPage,CaseDetailPage,AgentsPage,FreeformPage,DocumentPage,CheckpointPage,ProfileSetupPage,LandingPage,AdminPage,SettingsPage}.tsx`, `src/components/cases/{ClientCareTab,ContractGenerateModal}.tsx`, `src/components/accounting/{MonthlyReportTab,CaseExpenseTab,SuccessFeeClaimModal}.tsx`, `src/components/ui/BugReportButton.tsx`, `src/components/auth/RegisterForm.tsx`, `src/App.tsx`, `src/types/{subscription,user,case,signing,bugReport}.ts`

## 대조표 1 — 컬렉션·경로 ↔ 화면 호출 ↔ 규칙

판정. 정상 / 항상거부 / 과다허용 / 규칙없음 / 미사용(규칙만 있음)

| # | 컬렉션·경로 (동작) | 화면 호출 파일:줄 | 규칙 줄 | 판정 |
|---|---|---|---|---|
| 1 | `users/{uid}` 본인 읽기 | `hooks/useAuth.ts:84-85`, `services/firebase/auth.ts:167-168` | firestore 33 | 정상 |
| 2 | `users/{uid}` 본인 생성 (role lawyer, status pending/approved, plan free) | `services/firebase/auth.ts:113-132` | firestore 36-38 | **과다허용** — status "approved"를 클라이언트가 정해 넣을 수 있음 (발견 3) |
| 3 | `users/{uid}` 본인 수정 (이름·사무소·전화, onboardingDismissedAt) | `services/firebase/auth.ts:225`, `pages/DashboardPage.tsx:186` | firestore 47-56 | 정상 |
| 4 | `users/{uid}` 본인 status pending→approved (profileCompleted=true 조건) | 화면 호출 없음 (브라우저 콘솔로 가능) | firestore 53-54 | **과다허용** (발견 3) |
| 5 | `users` 목록 (approved+lawyer) | `services/firebase/firestore.ts:758-763` | firestore 59 | 정상(관리자) |
| 6 | `users/{uid}` 관리자 수정 (verified / status rejected) | `services/firebase/firestore.ts:784, 802` | firestore 60-62 | 정상. plan·planExpiresAt도 바꿀 수 있으나 화면 없음 (발견 13) |
| 7 | `cases` 생성 | `hooks/useCases.ts:129-140`, `services/firebase/firestore.ts:47` | firestore 68-69 | 정상 (status "진행중" 고정, 규칙 값과 `types/case.ts:64` 일치) |
| 8 | `cases` 목록·읽기 | `hooks/useCases.ts:90-97`, `pages/DashboardPage.tsx:49-61`, `hooks/usePlanLimits.ts:107-113`, `services/backupExport.ts:67-68`, `services/firebase/firestore.ts:70-96` | firestore 72 | 정상 (전부 ownerId 필터) |
| 9 | `cases` 수정 (상태·타임라인·portalToken·clientPhone) | `hooks/useCases.ts:181`, `services/firebase/firestore.ts:120, 147`, `components/cases/ClientCareTab.tsx:110, 121, 147, 168` | firestore 75-76 | 정상 |
| 10 | `cases` 삭제 | `services/firebase/firestore.ts:674` (화면 호출자 없음) | firestore 79 | 미사용 |
| 11 | `cases/{id}/clientCareMessages` 생성·목록·삭제 | `services/firebase/firestore.ts:693, 715-716, 737` | firestore 85-91 | 정상 |
| 12 | `recordings` 생성 | `services/firebase/firestore.ts:176`, `services/file-save.ts:51-61`, `pages/AgentsPage.tsx:281`, `pages/FreeformPage.tsx:224` | firestore 97 | 정상 |
| 13 | `recordings` 읽기·수정 | `services/firebase/firestore.ts:203, 234`, `pages/DashboardPage.tsx:69-70` | firestore 98 | 정상 |
| 14 | `documents` 생성 | `services/firebase/firestore.ts:260` ← `pages/AgentsPage.tsx:538`, `pages/FreeformPage.tsx:239`, `pages/DocumentPage.tsx:310`, `hooks/useCaseDetail.ts:592` | firestore 106 | 정상 |
| 15 | `documents` 읽기·수정 | `services/firebase/firestore.ts:289, 310, 337, 361`, `hooks/usePlanLimits.ts:114-120` | firestore 107 | 정상 |
| 16 | `opponentDocs` 생성·목록·삭제 | `services/firebase/firestore.ts:383, 409, 433` | firestore 115 | 정상 |
| 17 | `case_records` 생성·목록·읽기·수정·삭제 | `services/firebase/firestore.ts:567, 597, 620, 641, 659` | firestore 124 | 정상 |
| 18 | `deadlines` 생성·목록·수정·삭제 | `services/firebase/firestore.ts:454, 480, 502, 523, 538`, `services/notifications.ts:33-34` | firestore 133 | 정상 |
| 19 | `fees` CRUD | `services/firebase/accounting.ts:104, 130, 164, 193, 222, 242` | firestore 142-143 | 정상 |
| 20 | `fees/{id}/installments` CRUD | `services/firebase/accounting.ts:302, 326, 355, 380`, `services/reportGenerator.ts:164-165` | firestore 147-152 | 정상 |
| 21 | `case_expenses` CRUD | `services/firebase/accounting.ts:405, 433, 463, 483, 507` | firestore 158-159 | 정상 |
| 22 | `transactions` CRUD | `services/firebase/accounting.ts:552, 583, 628, 654, 674`, `services/autoRevenue.ts:71-76`, `components/accounting/MonthlyReportTab.tsx:127-130` | firestore 165-166 | 정상 |
| 23 | `office_expenses` CRUD | `services/firebase/accounting.ts:698, 729, 759, 779` | firestore 172-173 | 정상 |
| 24 | `deposits` CRUD | `services/firebase/accounting.ts:803, 829, 862, 895, 925, 945` | firestore 179-180 | 정상 |
| 25 | `monthly_summary` 읽기·setDoc·merge·목록 | `services/firebase/accounting.ts:975, 1005-1012, 1038`, `services/reportGenerator.ts:395, 441, 453, 476` | firestore 188-190 | 정상 (생성 페이로드에 ownerId 포함 — reportGenerator 400, accounting data.ownerId) |
| 26 | `payments` 본인 읽기 | `services/payment.ts:79-80` | firestore 217-218 | 정상 (쓰기는 서버 `payment/confirm.ts:130`) |
| 27 | `signing_requests` 생성·사건별 목록 | `services/firebase/signing.ts:36, 66-70`, `services/notifications.ts:78-80` | firestore 234-235 | 정상 |
| 28 | `bug_reports` 생성 | `components/ui/BugReportButton.tsx:40-50` | firestore 241 | 정상 |
| 29 | `bug_reports` 목록·상태 변경 | `services/firebase/firestore.ts:820-821, 841` | firestore 242-245 | 정상 (status open/resolved, `types/bugReport.ts:15` 일치) |
| 30 | `subscriptions` | 화면 호출 없음 | firestore 195-202 | 미사용 (발견 14) |
| 31 | `paymentHistory` | 화면 호출 없음 | firestore 206-213 | 미사용 (발견 14) |
| 32 | Storage `recordings/{uid}/{caseId}/{file}` 업로드 | `services/firebase/storage.ts:27-31`, `hooks/useRecording.ts:210-213` | storage 19-29 | 정상 |
| 33 | Storage `opponent-docs/{uid}/{caseId}/{file}` 업로드 | `services/firebase/storage.ts:80-83` | storage 36-43 | 정상 |
| 34 | Storage `case-records/{uid}/{caseId}/{file}` 업로드 | `services/firebase/storage.ts:112-115` | storage 50-55 | 정상 |
| 35 | Storage `extracted-texts/{uid}/[caseId/]{file}` 업로드 (text/plain) | `services/file-save.ts:43-47` | storage 73-77 (`{allPaths=**}`) | 정상 |
| 36 | Storage `business-registrations/{uid}/{uid}.{ext}` 업로드 | `services/firebase/auth.ts:96-97` | storage 82-88 | 정상 |
| 37 | Storage `receipts/{uid}/{id}_{ts}_{name}` 업로드 (경비 영수증) | `pages/CaseDetailPage.tsx:375-378` ← `components/accounting/CaseExpenseTab.tsx:242` | **없음** | **규칙없음 → 항상거부** (발견 7) |
| 38 | Storage `documents/{uid}/{caseId}/{file}` | 화면 호출 없음 | storage 62-70 | 미사용 |
| 39 | Storage 삭제 (전 경로) | `deleteObject` 호출 0건 | delete 규칙 없음 | 미사용 (파일은 영구 잔존) |

행 수 39.

## 대조표 2 — 서버 경로 ↔ 인증 ↔ 플랜검사 ↔ 입력검증 ↔ 발송대상검증

인증 판정 근거는 `_middleware.ts:10-16`(PUBLIC_PATHS), `:20`(INTERNAL_PATHS), `:66-78`. 레이트리밋은 `_shared/rate-limit.ts:248`이 `/api/claude`·`/api/transcribe`에만 건다.

| 서버 경로 | 인증 | 플랜검사 | 입력검증 | 발송대상검증 | 문제 |
|---|---|---|---|---|---|
| `GET /api/health` | 공개 | 없음 | `?test` 값 | — | `?test=claude`로 누구나 Anthropic 유료 호출(`health.ts:250-265`), 키 앞 15자 노출(`:243`) (발견 5) |
| `POST /api/verify-business` | 공개 | 없음 | 사업자번호 10자리 | — | `serviceKey=DEMO_KEY`(`:44`) → 홈택스 HTML 문자열 검색 폴백(`:91-115`). 레이트리밋 없음 (확신 낮음 1) |
| `POST /api/consult` | 공개 | 없음 | 이름·전화 정규식, 허니팟 `website2` | 관리자 번호 고정 | Origin 정규식이 부분일치·미고정(`consult.ts:331`), Origin 없으면 통과(`:349`). IP 5회/10분은 isolate별 (발견 12) |
| `GET /api/consult?token=` | 쿼리 토큰 | — | — | — | 토큰이 URL에 남음, 단순 `!==` 비교(`:432`) |
| `GET/POST /api/signing/{token}` | 공개(토큰) | 없음 | data:image·2MB | — | 토큰 `crypto.randomUUID()`(`ContractGenerateModal.tsx:140`), 24시간 만료(`:143`), 만료·중복 서명 서버 차단(`signing/[token].ts:161-166`). 정상 |
| `GET /api/portal/{token}` | 공개(토큰) | 없음 | hex 32~64자 | — | 토큰 16바이트 난수(`ClientCareTab.tsx:116-118`), `portalEnabled` 서버 확인(`portal/[token].ts:270`). 정상 |
| `POST /api/claude` | Firebase 토큰 | `requireUsageQuota` | systemPrompt·메시지 존재만 | — | 사건·문서 0건이면 무제한(발견 1), 본문 크기 상한 없음(1M 컨텍스트 베타 `:17`), 마지막 허용 건 차단(발견 2), 오류 시 키 앞 12자 반환(`:131`) |
| `POST /api/transcribe` | Firebase | `requireUsageQuota` | 파일 존재 | — | 파일 크기·길이 상한 없음. 발견 1과 같은 우회 |
| `GET /api/transcribe/{id}` | Firebase | 없음 | — | — | 소유권 검사 없음 — id만 알면 남의 전사 결과 조회(발견 11) |
| `POST /api/voyage` | Firebase | 없음 | 없음(본문 그대로 전달 `:219-228`) | — | 한도·크기 무제한 (발견 6) |
| `POST /api/rerank` | Firebase | 없음 | 없음(`:265-274`) | — | 동일 (발견 6) |
| `POST /api/clova-ocr` | Firebase | 없음 | imageData·format 존재 | — | 한도 없음. users 문서가 없는 구글 로그인 계정도 호출 가능 (발견 6) |
| `POST /api/precedent-search` | Firebase 또는 내부 토큰(상수시간 비교) | 없음 | target·query | — | 정상 |
| `POST /api/payment/confirm` | Firebase | — | orderId 형식, 금액 서버표 대조(`:22-24, 89-96`), uid 일치(`:84`) | — | 금액은 서버가 정한다 — 정상. 단 만료일을 `now` 기준으로 덮어씀(`:120-127`) (발견 9), plan 캐시 60초 (발견 10) |
| `POST /api/notify/signup` | Firebase | 없음 | 없음 — name·firmName이 문자 본문에 그대로 | 관리자 번호 고정 | 로그인 토큰만 있으면 무제한 (발견 4) |
| `POST /api/notify/bug` | Firebase | 없음 | snippet 60자 | 관리자 번호 고정 | 동일 (발견 4) |
| `POST /api/notify/approved` | Firebase + 서버 admin 재확인(`:26-30`) | — | uid | `users/{uid}.phone` 서버 조회(`:38-43`) | 정상 |
| `POST /api/notify/expiry` | Firebase | — | — | 본인 phone 서버 조회, 7일·중복 판정 서버(`:247-258`) | 정상 |
| `POST /api/notify/client` | Firebase | `requirePaidPlan` (`:157`) | 번호 정규식·900자 | 임의 번호 허용, uid당 30건/시간 | 화면이 무료 사용자에게도 버튼을 보여 항상 402 (발견 8) |

행 수 20.

## 발견

### 1. 무료 사용자가 사건·문서를 안 만들면 AI 분석·음성 변환이 무제한 · 위험

- 무슨 일이. 서버 한도 판정은 "이번 달 만든 `documents` 수 < 3 그리고 `cases` 수 < 5"뿐이다. `/api/claude`와 `/api/transcribe`를 직접 부르는 사람은 사건·문서를 만들 이유가 없으므로 카운트가 영원히 0이고, 호출 자체는 IP당 1분 60회 외에 아무 제한이 없다. 무료 계정 하나로 하루 8만 회(60×60×24)까지 Claude Sonnet 5(1M 컨텍스트 베타)와 리턴제로 STT를 우리 비용으로 쓸 수 있다. 본문 크기 상한도 없어 한 번에 1M 토큰짜리 요청을 보낼 수 있다.
- 근거. `functions/api/_shared/plan.ts:174-180`(카운트 기준), `:35-36`(주석 "분석이 끝나면 사건이 자동 생성되므로 사건 수가 곧 분석 횟수" — 화면 동작에 기댄 가정), `functions/api/claude.ts:52-54, 17, 105`, `functions/api/transcribe.ts:179-181`, `functions/api/_shared/rate-limit.ts:217-218`.
- 고칠 방향. 호출 자체를 서버가 센다. Claude·STT 호출마다 서비스 계정으로 `usage/{uid}_{YYYY-MM}` 같은 문서에 횟수(가능하면 토큰·초)를 증가시키고, 무료는 그 값으로 막는다. 아울러 요청 본문(system+messages 합산 글자 수)과 업로드 파일 크기에 상한을 둔다.

### 2. 무료 한도의 마지막 1건(3번째 문서·5번째 사건)이 서버에서 항상 막힌다 · 위험

- 무슨 일이. 화면은 분석 완료 → `addCase`(사건 +1) → `createDocument`(문서 +1, status "checkpoint") → 체크포인트 → 문서 생성 Claude 호출 순서다. 문서 생성 시점에 서버가 세는 값은 이미 방금 만든 건을 포함하므로, 문서 2건 있던 사용자가 3번째 문서를 만들면 `documents=3`이 되어 `docs < 3`이 거짓 → 402. 사건도 같다(4건 → 5번째 분석은 통과, 사건 생성 후 문서 생성에서 `cases=5` → 402). 즉 실제 무료 한도는 문서 2건·사건 4건이고, 마지막 건은 카운트만 소진되고 문서는 안 나온다. 서버 카운트 캐시가 60초라 체크포인트를 1분 안에 넘기면 되고 천천히 답하면 막혀, 사용자에겐 "될 때도 있고 안 될 때도 있는" 오류로 보인다.
- 근거. `src/pages/AgentsPage.tsx:267`(addCase) → `:538-556`(createDocument) → `:563`(checkpoint 이동) → `src/pages/DocumentPage.tsx:142-171`(generateDocument = Claude 호출). 서버 `functions/api/_shared/plan.ts:180`(`docs < FREE_MONTHLY_DOCS && cases < FREE_MONTHLY_CASES`), `:42, 125-126, 154`(60초 캐시). 화면 쪽 `usePlanLimits.ts:152-155`는 "생성 전" 값으로 `<`를 쓰므로 화면은 허용, 서버는 거부 — 어긋남.
- 고칠 방향. 판정 시점과 기준을 하나로 맞춘다. (a) 서버가 문서 생성 호출을 "이미 만들어진 문서에 대한 작업"으로 보고 `documents` 카운트에서 status "checkpoint"/"generating"인 건은 빼거나, (b) 사건·문서 레코드 생성을 문서 생성 Claude 호출 뒤로 미루거나, (c) 발견 1처럼 호출 자체를 세는 방식으로 바꾸면 이 문제도 같이 사라진다.

### 3. "승인 대기" 문턱을 사용자가 스스로 넘을 수 있다 · 위험

- 무슨 일이. 가입 시 `users` 문서의 `status`는 클라이언트가 정한다. `businessVerified`(OCR 결과가 "변호사·법률·법무"를 포함하면 true — 국세청 확인과 무관)가 true면 곧바로 `approved`로 생성되고, 규칙도 create에서 approved를 허용한다. 이미 pending인 사용자도 규칙 53-54가 "profileCompleted가 true이면 pending→approved 자기 갱신"을 허용하므로 브라우저 콘솔에서 `updateDoc(users/내uid, {status:"approved", profileCompleted:true})` 한 줄로 대기를 벗어난다. 화면 게이트는 `status`만 본다. 변호사가 아닌 사람이 사업자등록증 아무거나(또는 위조 이미지) 올리고 스스로 승인해 무료 한도의 AI·STT를 쓰거나, 발견 1과 결합하면 무제한으로 쓴다. 관리자의 "검증(verified)"은 별도 필드라 이 흐름을 막지 못한다.
- 근거. `firestore.rules:36-38`(create status approved 허용), `:53-54`(자기 승인 조건), `src/services/firebase/auth.ts:104, 113`(status를 클라이언트 값으로 결정), `src/pages/ProfileSetupPage.tsx:141-146`(OCR 키워드만으로 businessVerified=true), `src/App.tsx:105-106, 126`(status만 검사).
- 고칠 방향. create는 `status == "pending"` 고정, pending→approved는 admin 또는 서버(서비스 계정)만. 자동 승인을 유지하려면 `/api/verify-business`가 서비스 계정으로 status를 써 주도록 옮긴다. 화면 게이트는 `status=="approved"` 외에 `verified==true`(관리자 확인)를 유료 기능·문자 발송 조건에 더한다.

### 4. 관리자 번호로 문자 폭탄 — 로그인 토큰만 있으면 무제한 · 위험

- 무슨 일이. `/api/notify/signup`·`/api/notify/bug`는 미들웨어 인증(Firebase 토큰)만 통과하면 관리자 휴대폰(`ADMIN_NOTIFY_PHONE`)으로 문자를 보낸다. 플랜·역할·`users` 문서 존재·횟수 제한이 전혀 없다. 구글 로그인은 누구나 되므로(users 문서가 없어도 토큰은 발급됨) 스크립트로 초당 수 건씩 보내면 건당 문자 요금이 그대로 나가고 관리자 전화가 마비된다. `signup`은 `name`·`firmName`을 그대로 본문에 넣어 임의 문구도 실린다.
- 근거. `functions/api/notify/signup.ts:310-325`, `functions/api/notify/bug.ts:87-103`, `functions/api/_shared/rate-limit.ts:248`(이 경로들은 레이트리밋 대상 아님), `functions/api/_middleware.ts:10-16`(공개 경로 아님 — 인증은 있음). 비교. `notify/client.ts:132-144`는 uid당 30건/시간을 두었고 `notify/approved.ts:26-30`은 admin을 재확인한다.
- 고칠 방향. signup은 `users/{uid}` 문서를 서비스 계정으로 읽어 `signupNotifiedAt`이 없을 때 1회만 보내고 기록한다. bug는 uid당 시간당 3건 같은 상한과 `users` 문서 존재(status pending 이상) 확인. 본문의 이름·사무소는 서버가 `users` 문서에서 읽는다.

### 5. 공개 경로 `/api/health?test=claude`로 누구나 유료 API를 호출하고 키 앞자리를 본다 · 위험

- 무슨 일이. `/api/health`는 인증 없는 공개 경로인데 `?test=claude`를 붙이면 서버가 Anthropic에 실제 요청을 보낸다(요청당 5토큰이라 건당은 싸지만 상한이 없다). `?test=datagokr`도 공공데이터 키로 외부 호출을 한다. 응답에는 Anthropic 키 앞 15자(`keyPrefix`)와 설정 여부가 그대로 담긴다.
- 근거. `functions/api/_middleware.ts:11`(PUBLIC_PATHS), `functions/api/health.ts:243, 250-265, 281-306`.
- 고칠 방향. `?test` 분기는 내부 토큰(`X-Internal-Token`)이 있을 때만 열거나 삭제한다. `keyPrefix`는 빼고 `claudeConfigured: true/false`만 남긴다.

### 6. 임베딩·재정렬·OCR 프록시는 로그인만 하면 한도 없이 우리 비용으로 쓴다 · 위험

- 무슨 일이. `/api/voyage`·`/api/rerank`는 요청 본문을 검사 없이 Voyage AI에 그대로 넘기고, `/api/clova-ocr`는 이미지를 CLOVA에 넘긴다. 셋 다 플랜·사용량·레이트리밋·크기 상한이 없다. 발견 3의 자기 승인 없이도, `users` 문서조차 없는 구글 로그인 계정이 호출할 수 있다(미들웨어는 토큰 서명만 본다).
- 근거. `functions/api/voyage.ts:219-228`, `functions/api/rerank.ts:265-274`, `functions/api/clova-ocr.ts:149-178`, `functions/api/_shared/rate-limit.ts:248`, `functions/api/_middleware.ts:66-78`(uid만 넘김, users 문서 확인 없음).
- 고칠 방향. 세 경로에 `requireUsageQuota`(또는 발견 1의 호출 카운트)와 본문 크기 상한(예: voyage input 합계 8KB, OCR 이미지 base64 10MB)을 두고, 레이트리밋 대상 경로에 추가한다. 미들웨어에서 `users/{uid}`가 없거나 `status`가 approved가 아니면 비용 경로를 거부하는 공통 검사를 넣으면 한 번에 해결된다(`checkPaidPlan`이 이미 users 문서를 읽는다).

### 7. 사건 경비의 영수증 업로드 경로에 Storage 규칙이 없어 항상 실패 · 막힘

- 무슨 일이. 사건 상세 > 경비 탭에서 영수증 파일을 붙이면 `receipts/{uid}/{랜덤}_{시각}_{파일명}`으로 올리는데 `storage.rules`에 `receipts/` 항목이 없다. Storage는 규칙에 없는 경로를 기본 거부하므로 업로드가 매번 permission denied로 끝나고, 경비 등록 자체가 실패하거나 영수증 없이 저장된다(에러 처리는 `CaseExpenseTab.tsx:242` 호출부에 달려 있다).
- 근거. `src/pages/CaseDetailPage.tsx:375-378`(경로 `receipts/...`), `src/components/accounting/CaseExpenseTab.tsx:106, 242`(호출), `storage.rules:19-92`(match 목록에 `receipts` 없음).
- 고칠 방향. `match /receipts/{ownerId}/{fileName}`을 추가(본인만 read/write, 이미지·PDF, 10MB)하거나, 업로드 경로를 이미 규칙이 있는 `case-records/{uid}/{caseId}/` 계열로 바꾼다. 배포 뒤 경비 탭에서 영수증 1건을 실제로 올려 확인한다.

### 8. 무료 사용자에게 "문자 발송" 버튼이 그대로 보이고 서버는 항상 402 · 답답

- 무슨 일이. 의뢰인 케어 탭·포털 링크 문자·성공보수 청구·사건 상세의 문자 발송은 모두 `/api/notify/client`를 부르는데, 서버는 `starter/pro/team`만 허용한다. 가입 시 plan은 "free"이므로 결제 전 사용자는 어느 버튼을 눌러도 "유료 요금제가 필요한 기능입니다"만 받는다. 화면 쪽에는 plan을 보고 버튼을 잠그거나 안내하는 코드가 한 곳도 없다(네 파일 모두 `usePlanLimits`·plan 참조 0건).
- 근거. `functions/api/notify/client.ts:157-158`, `functions/api/_shared/plan.ts:25`, `src/services/firebase/auth.ts:113`(plan "free"), 호출부 `src/components/cases/ClientCareTab.tsx:144, 165`, `src/pages/CaseDetailPage.tsx:111`, `src/components/accounting/SuccessFeeClaimModal.tsx:128`.
- 고칠 방향. `usePlanLimits().plan`이 free면 버튼을 비활성화하고 "문자 발송은 Pro에서 가능합니다 → 요금제 보기" 링크를 같은 자리에 둔다(주소를 글자로만 적지 말고 클릭되게). 서명 링크·포털 링크는 무료도 복사해 카톡으로 보낼 수 있다는 안내를 곁들인다.

### 9. 결제로 연장하면 남은 기간이 사라진다 · 위험

- 무슨 일이. 결제 승인 시 만료일을 "지금 + 1개월(또는 12개월)"로 덮어쓴다. 기존 `planExpiresAt`을 읽지 않는다. 만료 7일 전에 서버가 "연장해 주세요" 문자를 보내고(`notify/expiry.ts:274`), 그 문자를 보고 바로 결제한 사용자는 최대 7일을 잃는다. 연결제 중인 사람이 실수로 월결제를 누르면 남은 11개월이 1개월로 줄어든다. 사용자가 손해를 보는 방향이라 환불·분쟁 소지가 있다.
- 근거. `functions/api/payment/confirm.ts:120-127`(`calcExpiresAt(parsed.period, now)`), `:55-60`, `functions/api/notify/expiry.ts:222, 274`.
- 고칠 방향. 승인 전 `users/{uid}.planExpiresAt`을 읽어 `기준일 = max(now, 기존 만료일)`에서 기간을 더한다. 화면(요금제 탭)에도 "연장 시 남은 기간 뒤에 이어 붙습니다"를 적어 둔다.

### 10. 결제 직후 60초 동안은 여전히 무료로 판정된다 · 답답

- 무슨 일이. `checkPaidPlan`이 uid별 결과를 60초 캐시한다. 결제 성공 페이지에서 곧바로 문서 생성이나 문자 발송을 누르면, 결제 전에 한 번이라도 한도 검사가 돌았던 isolate에서는 최대 1분간 402가 난다. 결제 직후는 사용자가 가장 기대에 차 있는 순간이라 "돈 냈는데 안 된다"는 인상을 남긴다.
- 근거. `functions/api/_shared/plan.ts:42-43, 69-72, 101`, `:125-126, 154`(사용량 캐시도 동일), `functions/api/payment/confirm.ts:124-127`(캐시 무효화 없음).
- 고칠 방향. `payment/confirm`이 성공하면 같은 모듈의 `planCache.delete(uid)`·`usageCache` 삭제를 호출한다(다른 isolate는 못 지우므로 TTL을 10~15초로 줄이는 것도 병행). 결제 성공 화면에는 "반영까지 최대 1분" 안내를 둔다.

### 11. 전사 결과 조회에 소유권 검사가 없다 · 말

- 무슨 일이. `/api/transcribe/{id}`는 로그인만 확인하고 리턴제로에 그 id를 그대로 조회한다. 다른 사용자의 전사 id를 알면 상담 녹음의 전문을 읽을 수 있다. id는 리턴제로가 발급하는 난수라 추측은 어렵고, 우리 쪽에 id↔uid 대응도 저장돼 있지 않아 지금 구조로는 검사할 방법이 없다.
- 근거. `functions/api/transcribe/[id].ts:293-324`, `functions/api/transcribe.ts:215-216`(id를 돌려주기만 하고 저장 안 함).
- 고칠 방향. 전사 요청 시 서비스 계정으로 `transcriptions/{id}`에 `{uid}`를 기록하고, 조회 시 대조한다. 또는 응답의 id를 uid로 HMAC 서명해 붙이고 조회 때 검증한다.

### 12. 상담 접수의 Origin 검사가 장식에 가깝다 · 말

- 무슨 일이. 정규식이 `/law-caddy\.com|localhost|127\.0\.0\.1|\.pages\.dev/`로 앞뒤가 고정되지 않아 `https://evil-law-caddy.com`, `https://아무거나.pages.dev`가 통과하고, Origin 헤더를 아예 안 보내면(curl) 검사 자체를 건너뛴다. 남는 방어는 IP당 10분 5회인데 isolate별 메모리라 지역·isolate가 바뀌면 초기화된다. 접수 1건마다 관리자 문자 요금이 나간다.
- 근거. `functions/api/consult.ts:331, 348-349, 332-345`.
- 고칠 방향. 허용 Origin을 `_shared/cors.ts:359-366`의 목록·정규식(앵커 포함)으로 통일하고, Origin이 없으면 거부한다. 레이트리밋은 KV(`CONSULTS`가 이미 있다)에 `rl:{ip}` 카운터를 두면 isolate와 무관해진다.

### 13. 관리자가 요금제를 수동 연장·부여할 화면이 없다 · 말

- 무슨 일이. 규칙은 관리자가 `users` 문서의 plan·planExpiresAt을 바꾸는 것을 허용하지만, 관리자 페이지에는 검증·탈퇴·버그 상태 변경만 있고 plan 관련 쓰기가 없다. 무료 체험 연장, 결제 오류 보상, 만료 후 수동 복구는 전부 Firebase 콘솔에서 필드를 직접 고쳐야 한다. 콘솔에서 `planExpiresAt`을 문자열로 넣는 실수를 하면 서버 판정(`readTimestampMs`)이 null이 되어 "만료 없음"으로 영구 유료가 된다.
- 근거. `firestore.rules:60-62`, `src/pages/AdminPage.tsx`(rg `plan` 0건, 쓰기는 `verifyUser`·`deactivateUser`·버그 상태뿐 `:109, 129, 89-97`), `functions/api/_shared/plan.ts:56-60, 82-84`.
- 고칠 방향. 관리자 페이지 사용자 행에 "요금제 / 만료일" 편집(plan 선택 + 날짜)과 사유 메모를 두고, 저장은 Timestamp로 쓴다. 규칙은 그대로 두어도 된다.

### 14. 규칙만 있고 화면이 쓰지 않는 컬렉션·경로와 죽은 등록 폼 · 말

- 무슨 일이. `subscriptions`, `paymentHistory`, Storage `documents/`는 어느 화면도 읽고 쓰지 않는다. `RegisterForm.tsx`는 어디서도 import되지 않는다(회원가입은 `ProfileSetupPage`가 담당). 다음 점검자가 "이 규칙이 왜 있지 / 이 폼이 어디서 쓰이지"를 다시 찾게 만든다.
- 근거. `firestore.rules:195-213`, `storage.rules:62-70`, `rg "subscriptions|paymentHistory"` src 0건, `rg RegisterForm` src에서 정의 파일 외 0건.
- 고칠 방향. 규칙은 "(미사용 — 단건 결제 전환 전 잔재)" 주석을 달거나 삭제, `RegisterForm.tsx`는 삭제.

### 15. 오류 응답에 API 키 앞자리가 실린다 · 말

- 무슨 일이. Claude 프록시가 실패하면 `apiKeyPrefix`(키 앞 12자)를 클라이언트에 돌려주고, 화면은 그것을 오류 문구에 붙여 보여 준다. health는 15자. 앞자리는 `sk-ant-api03-`처럼 대부분 형식 문자열이라 직접 위험은 작지만, 키 회전 여부가 밖에서 식별되고 스크린샷으로 돌아다닌다.
- 근거. `functions/api/claude.ts:131`, `src/services/claude.ts:396-398`, `functions/api/health.ts:243`.
- 고칠 방향. 두 곳 모두 제거. 진단은 서버 로그(`console.error`)로.

## 확신이 낮은 항목

1. **`verify-business`의 `serviceKey=DEMO_KEY`** (`functions/api/verify-business.ts:44`). 공공데이터포털은 유효한 키를 요구하므로 첫 호출이 항상 실패해 홈택스 HTML 스크래핑 폴백(`:91-115`)으로만 동작하고 있을 가능성이 크다. 폴백은 "부가가치세"·"등록되어 있는" 같은 문자열 포함 여부로 판정하므로 오류 페이지에도 그 단어가 있으면 verified=true가 된다. 실호출이 금지라 응답을 보지 못했다. 전역 CLAUDE.md §16에 국세청 진위확인 API가 승인된 정식 키가 있으니 그것으로 바꾸고 `b_stt_cd`로만 판정하는 것이 맞다.
2. **`plan.ts`의 실패 시 통과(fail-open)** (`:65-67, 93-99, 130, 147-152`). 서비스 계정 환경변수가 빠지거나 Firestore가 잠깐 막히면 모든 한도 검사가 "허용"으로 돌아간다. 주석에 의도로 적혀 있어 발견에는 넣지 않았으나, 발견 1과 결합하면 비용 노출이 커진다. 최소한 Sentry 알림은 붙여야 한다.
3. **`countMonthly`의 300건 상한** (`plan.ts:139-146`). 정렬 없이 300건만 받아 이번 달 것을 고르므로, 누적 사건이 300건을 넘는 무료 사용자는 이번 달 건수가 빠져 한도를 넘겨 쓸 수 있다. 무료 사용자가 그 규모일 가능성은 낮다.
4. **발견 2의 재현 조건**. 60초 캐시 때문에 체크포인트를 빨리 넘기면 통과한다. "항상"이 아니라 "1분 넘게 머물면"이 정확한 표현일 수 있다. 캐시가 isolate별이라 재현이 들쭉날쭉할 것이다.
5. **`users` 자기 갱신 규칙의 `verified` 조건** (`firestore.rules:56`). 기존 문서에 `verified` 필드가 없고 클라이언트가 `verified`를 포함하지 않으면 통과, 포함하면 `resource.data.verified` 접근에서 규칙 오류로 거부된다. 현재 화면 호출(`auth.ts:225`, `DashboardPage.tsx:186`)은 verified를 보내지 않아 문제없지만, 나중에 프로필 수정에 필드를 늘릴 때 걸릴 수 있다.
6. **Storage 삭제 규칙 부재의 범위** (`storage.rules` 전체, `deleteObject` 0건). 기보고 항목은 "상담 파일 write 조건이 삭제를 막음"인데, 실제로는 어느 경로도 삭제를 호출하지 않아 사건기록 삭제(`useCaseDetail.ts:369-376`, 주석 "Storage 원본은 별도 정리")·상대방 서면 삭제 뒤 파일이 영구히 남는다. 비용은 작지만 개인정보 보존 기간 관점에서 검토가 필요하다. 기보고와 겹쳐 발견에서 뺐다.
