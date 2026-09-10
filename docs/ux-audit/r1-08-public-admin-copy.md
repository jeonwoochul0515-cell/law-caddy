# LAW-CADDY 예행연습 r1-08 — 공개 화면 · 관리자 화면 · 전 화면 문구

점검일 2026-09-11. 점검자 두 사람 — ① 부산 1인 사무소 김 변호사(처음 방문, 가입 여부 판단) ② 법률사무소 청송law 실무자(관리자, 가입 승인·회원 관리).
방법. 화면 글자와 버튼 동작을 코드로 끝까지 추적했다. 브라우저·개발 서버·실데이터는 쓰지 않았다. 확신이 낮은 항목은 "추측"이라고 적었다.

## 읽은 파일

- 공개 화면. `src/pages/LandingPage.tsx`, `src/data/landingContent.tsx`, `src/data/seoRoutes.json`, `src/config/contact.ts`, `src/components/landing/FAQItem.tsx`·`KakaoChatButton.tsx`·`SeoPageLayout.tsx`, `src/components/ui/scroll-expansion-hero.tsx`, `src/pages/seo/WorkflowPage.tsx`·`AiAgentsPage.tsx`·`AutomationPage.tsx`·`PricingPage.tsx`·`FaqPage.tsx`, `index.html`(메타 부분)
- 가입 흐름. `src/App.tsx`(라우트 가드), `src/pages/LoginPage.tsx`, `src/components/auth/LoginForm.tsx`·`PendingScreen.tsx`, `src/pages/PendingPage.tsx`, `src/pages/RegisterPage.tsx`, `src/pages/ProfileSetupPage.tsx`, `src/services/firebase/auth.ts`(completeProfile·changePassword·googleLogin 오류 매핑), `src/types/user.ts`, `src/types/subscription.ts`, `src/config/demo.ts`
- 서버. `functions/api/consult.ts`, `functions/api/notify/bug.ts`·`approved.ts`·`signup.ts`, `functions/api/_middleware.ts`, `functions/api/_shared/plan.ts`(발췌), `functions/api/signing/[token].ts`(발췌)
- 관리자. `src/pages/AdminPage.tsx`, `src/services/firebase/firestore.ts`(getUnverifiedUsers·verifyUser·deactivateUser·getBugReports), `src/services/notify.ts`, `firestore.rules`, `src/components/layout/Sidebar.tsx`(발췌)
- UI 공통. `src/components/ui/` 전체 12개
- 문구 전수. `src/pages/*.tsx` 23개 전부(한글 문자열만 추출해 훑음), `src/components/layout/*`, `src/components/payment/*`(문자열), `src/config/constants.ts`(DOC_TYPES 28종 확인), `src/components/accounting/OverdueAlertPanel.tsx`(기능 존재 확인), `src/services/contractGenerator.ts`(녹음 동의 조항 확인)

---

## (A) 공개 화면 — 김 변호사가 처음 와서 본 것

### 1. 첫 화면 10초 안에 "무엇을 해 주는지"가 안 읽힌다 — 답답

- **어디서.** 랜딩 히어로(`/`).
- **무슨 일이.** 히어로는 스크롤을 가로채는 "펼침 연출"이다. 다 펼쳐지기 전까지 보이는 글자는 `1인 변호사 사무실 운영 SaaS` · `좋은 캐디가 절반을 합니다` · `스크롤하면 펼쳐집니다` 세 줄뿐이다. 서비스가 무엇을 하는지 적은 문장("상담 녹음 하나로 판례 검색, 서면 초안, 수임계약, 정산까지"), 시작 버튼, 스코어카드는 전부 펼침이 끝난 뒤(`showContent`)에야 나타난다. 김 변호사는 "캐디? 골프 사이트인가?"에서 멈춘다. "SaaS"도 개발 용어다.
- **근거.** `src/pages/LandingPage.tsx:516-525`(title·date·scrollToExpand), `:530-563`(설명·CTA·스코어카드가 children), `src/components/ui/scroll-expansion-hero.tsx:63-79`(휠 preventDefault), `:118-122`(펼치기 전 scrollTo(0,0)), `:313-320`(children opacity = showContent ? 1 : 0).
- **고칠 방향.** 펼치기 전 화면에도 제목 바로 아래 한 줄을 상시 노출한다. "상담 녹음 하나로 판례 검색·서면 초안·수임계약·정산까지 준비합니다." `date` 문구는 "1인 변호사 사무실 운영 도우미"처럼 우리말로.

### 2. "무료로 시작"을 누르면 사업자등록증 없는 변호사는 막다른 길 — 막힘

- **어디서.** `/login` → 구글 로그인 → `/profile-setup`.
- **무슨 일이.** 가입은 사업자등록증 업로드가 필수이고, 업태·종목에 "변호사·법률·법무"가 없으면 제출 버튼이 아예 눌리지 않는다. 법무법인·합동사무소 소속 변호사는 본인 명의 사업자등록증이 없다. 화면은 "변호사업이 확인되지 않은 사업자등록증은 승인되지 않습니다."라고만 하고, 문의 링크도 상담 폼 링크도 없다. 게다가 `status: "pending"` 경로는 `businessVerified`가 false일 때만 만들어지는데, 그 상태에서는 제출이 막혀 있어 **승인 대기 화면(PendingScreen)에는 실제로 아무도 도달하지 못한다.**
- **근거.** `src/pages/ProfileSetupPage.tsx:135-139`(업태 키워드), `:185-188`, `:437`(disabled 조건에 `!businessVerified`), `:450-453`(막다른 안내). `src/services/firebase/auth.ts:102,112`(pending은 미검증일 때만). `src/components/auth/PendingScreen.tsx:28-41`(도달 불가한 안내문).
- **고칠 방향.** 미확인 상태 문구 아래에 "소속 변호사이신가요? 카카오톡 문의(링크) 또는 도입 상담(링크)으로 알려 주세요"를 붙인다. 근본적으로는 사업자등록증 없는 경로(변협 등록번호 → pending → 관리자 확인)를 열고 PendingScreen을 살린다.

### 3. "가입 후 7일간 Pro 전체 기능 무료"는 구현이 없다 — 위험

- **어디서.** 랜딩 마무리 CTA.
- **무슨 일이.** 화면은 7일 Pro 체험을 약속하지만, 가입 시 `plan: "free"`로 고정되고 체험·trial 로직이 어디에도 없다. 같은 페이지 수임료 섹션은 "가입하면 Starter가 무료로 열립니다"라고 하니 서로 어긋난다. 광고 문구가 사실과 다르면 표시광고법·변협 규정 양쪽에서 문제가 된다.
- **근거.** `src/pages/LandingPage.tsx:966`(7일 Pro), `:846`(Starter 무료). `src/services/firebase/auth.ts:113`(`plan: "free"`). `functions/api/_shared/plan.ts:25,81-84`(trial 없음). `grep "7일|trial|체험"` 결과에 체험 로직 없음.
- **고칠 방향.** 966행을 "가입하면 Starter가 무료로 열립니다. 신용카드는 필요 없습니다."로 바꾼다. 7일 체험을 진짜 줄 거면 `planExpiresAt` 7일 + `plan: "pro"`로 가입 시 세팅해야 한다.

### 4. 요금표는 화면끼리는 일치하나 CLAUDE.md와 다르다 — 말

- **어디서.** 랜딩 수임료 · `/pricing` · 설정 요금제.
- **무슨 일이.** 화면 세 곳 모두 Starter 무료(월 5건 분석·3건 문서) / Pro 89,000원/월 / Team 69,000원/인(준비중)으로 일치한다. 그러나 프로젝트 CLAUDE.md 1.4는 Starter ₩49,000, Pro ⭐ 89,000, Team 69,000/인이고, 에이전트도 "6개"라고 적혀 있다(화면은 4개). 코드 주석에 2026-07-31 Starter 무료 개방 결정이 명시돼 있으니 문서가 낡은 것이다.
- **근거.** `src/data/landingContent.tsx:121-155`, `src/components/payment/PlanSelector.tsx:29-79`, `src/types/subscription.ts:9-16`, `src/pages/seo/PricingPage.tsx:38-48`. CLAUDE.md §1.4·§5.
- **고칠 방향.** CLAUDE.md 요금표·에이전트 수를 코드 기준으로 갱신한다(코드는 손대지 않는다).

### 5. FAQ 두 항목이 실제와 다르다 — 위험

- **어디서.** 랜딩 FAQ · `/faq`.
- **무슨 일이.** ① "모든 데이터는 … 변호사 본인만 접근할 수 있습니다" — Firestore 규칙은 사건·녹음·문서·상대방 서면·사건기록·수임료 전부에 관리자 읽기를 허용한다. 운영자가 볼 수 있는데 "본인만"이라고 쓰면 의뢰인 비밀 관련 신뢰 문제로 돌아온다. ② "의뢰인 고지용 안내 문구도 제공합니다" — 별도의 녹음 고지 문구 기능은 없다. 있는 것은 사건위임계약서 안의 "AI 분석 및 상담 녹음 활용 동의" 조항이다.
- **근거.** `src/data/landingContent.tsx:168`, `:160`. `firestore.rules:82,101,110,119,128,144`(`allow read: if isAdmin()`). `src/services/contractGenerator.ts:411,432`(동의 조항). `grep "고지용|녹음 안내"` → 랜딩 외 없음.
- **고칠 방향.** ① "변호사 본인 계정으로만 접근하며, 운영자는 장애 대응 목적으로만 열람합니다"처럼 사실대로. ② "수임계약서에 녹음·AI 분석 동의 조항이 들어 있어 의뢰인 동의를 함께 받습니다"로.

### 6. 변호사 광고 규정 관점의 위험 표현 — 위험

- **어디서.** 랜딩 · SEO 서브페이지 · 메타.
- **무슨 일이.**
  - `무료로 시작`(상단 내비·히어로·마무리·SEO 레이아웃) — Starter 무료는 사실이나 §21이 금지하는 "무료" 어휘다. 다만 이 페이지는 변호사가 손님에게 하는 광고가 아니라 변호사에게 파는 도구 광고라 변협 규정 직접 적용은 낮다고 본다(추측). 그래도 운영 주체가 법률사무소라 보수적으로 가는 편이 안전하다.
  - `네 개의 전문 AI` / `네 명의 전문 AI` — "전문" 표현. AI를 "네 명"으로 사람처럼 부른다.
  - `10년간 1,000건 이상의 사건을 수행하며` — 검증 자료가 화면에 없는 실적 수치. 이 파일 머리말(10행)이 스스로 "검증 불가 수치는 싣지 않는다"고 적어 두고도 실명 옆에 들어가 있다.
  - 스코어카드 "판례 검색 3시간→2분", 비교표 "약 7시간→약 10분" — 주석은 "실측"이라 하나 근거·조건 표기가 없다.
  - `사무장 월급의 삼십분의 일` — 비교 표현.
  - "AI가 상담해 드립니다"류(§23)는 **없다.** "AI 분석팀", "AI 법률 비서"는 변호사 내부 도구 명칭이라 손님 상대 광고가 아니다.
- **근거.** `src/pages/LandingPage.tsx:480,544,973`, `src/components/landing/SeoPageLayout.tsx:50`(무료로 시작); `src/pages/seo/AiAgentsPage.tsx:12`, `src/data/seoRoutes.json:12`(전문); `LandingPage.tsx:808-809`(1,000건), `:304-308,740-786`(시간), `:845`(삼십분의 일).
- **고칠 방향.** "무료로 시작" → "지금 시작하기"(Starter 무료는 요금 섹션에서 사실 서술). "전문 AI" → "역할을 나눈 AI 넷". 1,000건은 근거 문서를 붙이거나 뺀다. 시간 수치엔 "청송law 자체 측정 예시"처럼 조건을 단다.

### 7. 상담 접수 폼 — 접수는 되지만 접수자는 문자로만 알고, 화면엔 목록이 없다 — 답답

- **어디서.** 랜딩 맨 아래 "도입 상담" 폼.
- **무슨 일이.** 제출하면 ① KV `consult:{id}`에 저장 → ② 관리자 번호로 문자(`[Law Caddy] 새 도입 상담 신청 …`) → ③ 중앙 접수함(lead-inbox)에 사본. 성공 화면은 "상담 신청이 접수되었습니다. 빠르게 연락드리겠습니다."에서 끝나고 다음 행동(카카오톡 링크 등)이 없다. 접수자 쪽은 문자 한 통이 전부다. 목록 조회 API(`GET /api/consult?token=`)는 있으나 **관리자 화면 어디에도 이걸 부르는 곳이 없어**, 문자를 놓치면 lead-inbox나 KV 콘솔을 뒤져야 한다. 스팸 방지는 허니팟 + Origin 검사 + IP 10분 5회(워커 메모리 기반, 재시작되면 초기화)로 최소한은 있다.
- **근거.** `src/pages/LandingPage.tsx:77-92,107-113,117-124`; `functions/api/consult.ts:20-34,38,53,69-115,117-134`; `src/pages/AdminPage.tsx:28,171-199`(탭은 users·bugs 둘뿐); `grep "api/consult" src` → LandingPage뿐.
- **고칠 방향.** 관리자 페이지에 "도입 상담" 탭을 추가하고(토큰 대신 admin JWT로 인증), 접수 완료 문구 아래 "급하시면 카카오톡 1:1 문의(링크)"를 둔다.

### 8. 휴대폰에서 스코어카드 업무 칸이 잘릴 가능성 — 말 (추측)

- **어디서.** 히어로 스코어카드.
- **무슨 일이.** 12열 그리드에서 업무 칸이 5열(약 40%)이고 `truncate`가 걸려 있다. 폭 390px 폰에서 카드 내부 폭 ~330px → 업무 칸 ~130px, "판례 검색 · 쟁점 분석"(12px, 11자)은 130px 안팎이라 "…"로 잘릴 수 있다. 넘치지는 않는다(truncate). 나머지는 안전하다. 히어로 그리드는 `lg:`에서만 12열, 사실관계 줄은 flex-wrap, 비교표는 `md:` 2열, `/pricing`엔 표가 없다. FAQ 답변은 `max-h-60`(240px)로 잘라 두었는데 현재 답변 길이(최대 약 120자)는 폰에서도 6줄 안팎이라 여유가 있다.
- **근거.** `src/pages/LandingPage.tsx:344-350,357,369`; `:527,569,732`; `src/components/landing/FAQItem.tsx:30-33`.
- **고칠 방향.** 업무 칸을 6열로 늘리고 PAR·SCORE를 줄이거나, 모바일에서 업무명을 줄인다("판례·쟁점 분석").

### 9. SEO 서브페이지 푸터에 운영 주체가 없다 — 말

- **어디서.** `/workflow` `/ai-agents` `/automation` `/pricing` `/faq`.
- **무슨 일이.** 랜딩 푸터는 상호·대표·사업자번호·주소·전화를 적어 두었고 주석에 "전자상거래법상 표시 의무"라고 스스로 밝혔다. 그런데 검색으로 바로 들어오는 서브페이지 5개의 푸터는 `© Law-Caddy · 준비는 Law-Caddy가…`와 로그인 링크뿐이다. `/pricing`은 요금을 보여주는 페이지라 특히 표시가 필요하다.
- **근거.** `src/components/landing/SeoPageLayout.tsx:70-86`; `src/pages/LandingPage.tsx:985-1037`.
- **고칠 방향.** SeoPageLayout 푸터에 랜딩과 같은 운영 주체 블록을 넣는다.

---

## (B) 관리자 화면 — 청송law 실무자가 가입 승인·회원 관리를 할 때

### 10. "미검증 사용자" 목록이 사실은 승인 회원 전원이다 — 위험

- **어디서.** `/admin` 가입 승인 탭.
- **무슨 일이.** 목록을 가져오는 함수가 `status == approved && role == lawyer`만 거르고 `verified` 여부는 보지 않는다. 그래서 검증 버튼을 눌러 사라진 회원이 새로고침하면 다시 나타난다. 통계 카드 "미검증 사용자 N"은 실제로는 승인 회원 총수다. 실무자가 같은 사람을 또 "검증"하면 승인 완료 문자가 또 나간다(fire-and-forget).
- **근거.** `src/services/firebase/firestore.ts:755-767`(where 두 개뿐), `:779-795`(verified:true만 기록). `src/pages/AdminPage.tsx:52-63`(재조회 로직), `:109-112`(검증 시 문자), `:207-208`.
- **고칠 방향.** 조회에 `where("verified", "!=", true)`(또는 결과에서 `!u.verified` 필터)를 넣고, 검증 완료 회원은 별도 탭에서 본다. 주의. 세 조건 복합 쿼리는 Firestore 색인이 필요할 수 있다.

### 11. 승인 대기 목록에서 사업자등록증을 볼 수 없다 — 답답

- **어디서.** `/admin` 회원 카드.
- **무슨 일이.** 카드에는 이름·사무소·변호사 등록번호·이메일만 있다. 가입 시 사업자등록증 파일은 Storage에 올라가고 `businessLicenseUrl`·업태·종목·사업자번호가 문서에 저장되는데 관리자 화면은 아무것도 안 보여준다. 본인 설정 화면에는 "등록증 원본 이미지 보기"가 있는데 관리자에게는 없다. 실무자는 "이 사람이 정말 변호사업 사업자인가"를 화면에서 확인할 수 없고 변협 조회만 할 수 있다.
- **근거.** `src/pages/AdminPage.tsx:274-295`; `src/services/firebase/auth.ts:92-98,119-128`; `src/types/user.ts:27-36`; `src/pages/SettingsPage.tsx:308-315`(본인용 이미지 보기).
- **고칠 방향.** 카드에 "등록증 보기"(새 창) 링크와 사업자번호·업태/종목·국세청 확인 여부를 한 줄로 표시한다.

### 12. 거절("탈퇴") — 사유도 못 적고, 당사자에게 알리지도 않고, 되돌릴 수도 없다 — 위험

- **어디서.** `/admin` "탈퇴" 버튼.
- **무슨 일이.**
  - 확인 단계는 브라우저 `confirm()` 한 줄이고, 문구가 "등록번호가 확인되지 않는 사용자입니다."로 이미 단정한다. 사유 입력란이 없다.
  - 실제 동작은 `status: "rejected"`로 바꾸는 것뿐이다. 계정 삭제("탈퇴")가 아니다. 문자·이메일 알림 함수 호출이 없다.
  - 목록은 approved만 보여 주므로 거절된 회원은 화면에서 사라지고, 되살릴 버튼이 없다. 실수로 누르면 Firestore 콘솔에서 고쳐야 한다.
  - 당사자는 다음 로그인에서 "가입이 거부되었습니다. 관리자에게 문의하세요."만 본다. 문의 링크가 없다(막다른 안내). 새로고침하면 랜딩이 그냥 뜬다(로그아웃된 것처럼 보임).
- **근거.** `src/pages/AdminPage.tsx:122-137`; `src/services/firebase/firestore.ts:800-811`; `src/services/notify.ts`(거절 알림 함수 없음); `src/pages/LoginPage.tsx:24-25`; `src/App.tsx` PublicOnly(rejected면 랜딩 렌더).
- **고칠 방향.** "가입 거절" 모달(사유 입력 → 본인 문자 발송) + "거절 회원" 탭에 복구 버튼. LoginPage 문구에 카카오톡 1:1 문의 링크를 붙인다.

### 13. 승인 문자와 화면 안내가 실제 흐름과 어긋난다 — 말

- **어디서.** 검증 버튼 → 본인 문자 / 승인 대기 화면 / 랜딩.
- **무슨 일이.** 가입은 사업자등록증 OCR로 즉시 `approved`가 된다. 그런데 관리자가 나중에 "검증"을 누르면 본인에게 "가입 승인이 완료되었습니다. 지금 로그인하시면 모든 기능을 사용하실 수 있습니다."가 간다 — 이미 며칠째 쓰고 있는 사람에게. 랜딩은 "변호사 인증 후 사용", PendingScreen은 "관리자 승인 후 서비스 이용", 관리자 배너는 "회원가입 시 즉시 서비스 이용이 가능합니다"라고 각각 다르게 말한다. 이름이 비어 있으면 문자가 "변호사 변호사님"이 된다.
- **근거.** `functions/api/notify/approved.ts:44,54`; `src/services/firebase/auth.ts:112`; `src/pages/LandingPage.tsx:556`; `src/components/auth/PendingScreen.tsx:24`; `src/pages/AdminPage.tsx:220-221`.
- **고칠 방향.** 문자를 "변호사 등록번호 확인이 끝났습니다. 계속 이용해 주세요."로. 랜딩 556행은 "가입 즉시 사용 · 등록번호는 사후 확인"으로. 이름 기본값은 "회원"으로.

### 14. 회원 검색은 있고, 정렬·전체 회원 조회·플랜 변경은 없다 — 답답

- **어디서.** `/admin`.
- **무슨 일이.** 검색은 이름·사무소·등록번호·이메일로 된다. 정렬은 가입일 오름차순 고정이고 바꿀 수 없다. 페이지 넘김이 없어 회원이 늘면 한 화면에 다 쌓인다. 관리자·거절 회원은 어디서도 조회할 수 없다. "이번 세션 검증 완료" 숫자는 새로고침하면 0이 된다. 플랜 수동 변경 UI는 없다 — 규칙상 관리자 write는 role·status 값만 검사하고 plan을 막지 않으므로 콘솔에서는 바꿀 수 있지만 화면에서는 불가능하다(`user.ts` 주석은 "관리자 수동 부여"를 전제로 한다).
- **근거.** `src/pages/AdminPage.tsx:149-155,229-237`(검색), `:37,114,212-213`(세션 카운터); `src/services/firebase/firestore.ts:761`(orderBy 고정); `firestore.rules:60-62`; `src/types/user.ts:13`.
- **고칠 방향.** 회원 행에 플랜 선택 + 만료일 입력(관리자 write로 저장), 정렬 토글(가입일·이름), "전체 회원 / 거절 회원" 탭.

### 15. 버그 신고 문자의 "관리자 페이지에서 확인하세요"는 길이 없다 — 말

- **어디서.** 버그 신고 → 관리자 문자.
- **무슨 일이.** 문자 본문이 "관리자 페이지에서 확인하세요."로 끝난다. 문자에는 링크를 못 걸지만 주소는 적을 수 있다. 관리자 화면 버그 탭 자체는 정상이다(미처리/처리완료 토글, 되돌리기 있음).
- **근거.** `functions/api/notify/bug.ts:35`; `src/pages/AdminPage.tsx:327-403`.
- **고칠 방향.** 문자 끝을 "law-caddy.com/admin"으로.

---

## (C) 문구 전수 표

기준. ①어려운 말 ②막다른 안내 ③오류 문구 ④단정·광고 표현 ⑤현장 말과 다른 이름 ⑥부호·어투·오탈자

| # | 화면 | 원문 | 문제 기준 | 파일:줄 | 고칠 문구 제안 |
|---|---|---|---|---|---|
| 1 | 랜딩 히어로 | 1인 변호사 사무실 운영 SaaS | ①영어 약어 | `src/pages/LandingPage.tsx:522` (로그인 화면도 동일 `src/components/auth/LoginForm.tsx:32`) | 1인 변호사 사무실 운영 도우미 |
| 2 | 랜딩 히어로 | 스크롤하면 펼쳐집니다 | ①개발 용어 | `src/pages/LandingPage.tsx:523` | 아래로 내리면 이어집니다 |
| 3 | 랜딩 스코어카드 | SCORECARD / PAR / SCORE / TOTAL | ①영어 소제목(골프 용어 설명 없음) | `src/pages/LandingPage.tsx:335,349,350,396` | 스코어카드 / 기존 / Law-Caddy / 합계 |
| 4 | 랜딩 수임료 | 사무장 월급의 삼십분의 일 | ④비교 표현 | `src/pages/LandingPage.tsx:845` | 월 89,000원부터, 사무장 없이 |
| 5 | 랜딩 마무리 | 가입 후 7일간 Pro 플랜 전체 기능을 무료로 쓸 수 있습니다. | ④사실과 다른 약속(구현 없음) | `src/pages/LandingPage.tsx:966` | 가입하면 Starter가 무료로 열립니다. 신용카드는 필요 없습니다. |
| 6 | 랜딩 만든 사람 | 10년간 1,000건 이상의 사건을 수행하며 | ④검증 자료 없는 실적 수치 | `src/pages/LandingPage.tsx:808-809` | (근거 없으면) 10년간 민사·형사 실무를 하며 |
| 7 | 랜딩 푸터·본문 | 법률사무소청송law | ⑥정식 표기는 "법률사무소 청송law"(전역 §18) | `src/pages/LandingPage.tsx:807,821,1022,1026,1035` | 법률사무소 청송law |
| 8 | 랜딩 히어로 vs 사실관계 | 1인 변호사 사무실 / 대상 1~5인 법률사무소 | ⑤한 화면 안에서 대상이 다름 | `src/pages/LandingPage.tsx:522,573` | 둘 다 "1~5인 법률사무소"로 |
| 9 | 랜딩 안내 | 신용카드 없이 가입 · 변호사 인증 후 사용 | ⑤실제는 가입 즉시 사용(사후 확인) | `src/pages/LandingPage.tsx:556` | 신용카드 없이 가입 · 사업자등록증으로 즉시 시작 |
| 10 | 상담 접수 완료 | 상담 신청이 접수되었습니다. 빠르게 연락드리겠습니다. | ②다음 행동 없음 | `src/pages/LandingPage.tsx:112` | … 급하시면 카카오톡 1:1 문의(링크)로 바로 연락 주세요. |
| 11 | AI 소개 페이지·메타 | 네 개의 전문 AI / 네 명의 전문 AI | ④"전문" ⑥AI를 사람 단위로 | `src/pages/seo/AiAgentsPage.tsx:12`, `src/data/seoRoutes.json:12` | 역할을 나눈 AI 넷 |
| 12 | FAQ | 의뢰인 고지용 안내 문구도 제공합니다. | ⑤없는 기능 | `src/data/landingContent.tsx:160` | 수임계약서에 녹음·AI 분석 동의 조항이 들어 있어 의뢰인 동의를 함께 받습니다. |
| 13 | FAQ | 변호사 본인만 접근할 수 있습니다. | ⑤관리자 읽기 허용과 어긋남 | `src/data/landingContent.tsx:168` | 변호사 본인 계정으로만 접근하며, 운영자는 장애 대응 목적으로만 열람합니다. |
| 14 | FAQ | 전자서명법에 따라 … 법적 효력이 있습니다. … 분쟁 시 근거가 됩니다. | ④단정 | `src/data/landingContent.tsx:180` | 전자서명법 제3조에 따라 전자 형태라는 이유로 효력이 부인되지 않으며, … 근거 자료로 쓸 수 있습니다. |
| 15 | FAQ | 아닙니다. 모든 산출물은 … | ⑥어투(질문에 잘라 답함) | `src/data/landingContent.tsx:164` | 바로 제출은 권하지 않습니다. 모든 산출물은 … |
| 16 | SEO 서브페이지 푸터 | © Law-Caddy · 준비는 Law-Caddy가, 판단은 변호사가 합니다. | ②운영 주체·연락처 없음 | `src/components/landing/SeoPageLayout.tsx:76` | 랜딩 푸터의 상호·사업자번호·전화 블록 추가 |
| 17 | 로그인 | 가입이 거부되었습니다. 관리자에게 문의하세요. | ②링크 없는 문의 | `src/pages/LoginPage.tsx:25` | 가입이 승인되지 않았습니다. 카카오톡 1:1 문의(링크)로 연락 주시면 사유를 안내드립니다. |
| 18 | 승인 대기 | 대한변호사협회 등록번호 확인 / 관리자 수동 승인 (1~2 영업일) / 승인 완료 후 자동 활성화 | ⑤도달 불가 화면이며 실제 흐름(즉시 승인)과 다름 | `src/components/auth/PendingScreen.tsx:28-41` | 화면을 없애거나, 사업자 미확인 경로를 열 때 그 흐름에 맞춰 다시 쓴다 |
| 19 | 프로필 설정 | 변호사업이 확인되지 않은 사업자등록증은 승인되지 않습니다. | ②막다른 안내 | `src/pages/ProfileSetupPage.tsx:452` | … 소속 변호사이신가요? 카카오톡 문의(링크)로 알려 주시면 따로 확인해 드립니다. |
| 20 | 프로필 설정 | AI가 사업자등록증을 분석 중입니다... | ⑥말줄임 3점 ①AI 앞세움 | `src/pages/ProfileSetupPage.tsx:107` | 사업자등록증을 읽는 중입니다… |
| 21 | 프로필 설정 | OCR 처리 중 오류가 발생했습니다. | ①OCR ③원인·다음 행동 없음 | `src/pages/ProfileSetupPage.tsx:131` | 사업자등록증 글자를 읽지 못했습니다. 더 선명한 사진으로 다시 올려 주세요. |
| 22 | 관리자 | 미검증 사용자 | ⑤실제는 승인 회원 전원(버그) | `src/pages/AdminPage.tsx:208,254` | 등록번호 확인 대기 |
| 23 | 관리자 | 탈퇴 | ⑤실제는 거절(status rejected), 계정 삭제 아님 | `src/pages/AdminPage.tsx:313` | 가입 거절 |
| 24 | 관리자 | 등록번호가 확인되지 않는 사용자입니다. 탈퇴 처리하시겠습니까? | ④단정 ②사유 없음 | `src/pages/AdminPage.tsx:123` | 이 회원의 가입을 거절합니다. 사유를 적어 주세요(본인에게 문자로 전달됩니다). |
| 25 | 관리자 | 이번 세션 검증 완료 | ①세션 | `src/pages/AdminPage.tsx:213` | 오늘 이 화면에서 확인 완료 |
| 26 | 관리자 부제·탭 | 변호사 검증 · 버그 리포트 / 버그 리포트 | ①개발 용어 | `src/pages/AdminPage.tsx:168,192,331` | 변호사 확인 · 불편 신고 |
| 27 | 승인 문자 | [Law-Caddy] {name} 변호사님, 가입 승인이 완료되었습니다. 지금 로그인하시면 모든 기능을… | ⑤이미 사용 중인 사람에게 ⑥이름 없으면 "변호사 변호사님" | `functions/api/notify/approved.ts:44,54` | [Law-Caddy] {name}님, 변호사 등록번호 확인이 끝났습니다. 계속 이용해 주세요. law-caddy.com |
| 28 | 버그 문자 | 관리자 페이지에서 확인하세요. | ②주소 없음 | `functions/api/notify/bug.ts:35` | law-caddy.com/admin 에서 확인하세요. |
| 29 | 상담 접수 문자 | [Law Caddy] 새 도입 상담 신청 | ⑥다른 문자는 "[Law-Caddy]" | `functions/api/consult.ts:88` | [Law-Caddy] 새 도입 상담 신청 |
| 30 | 상담 접수 서버 | error: "forbidden" / "bad_request" / "receipt_failed" (message 없음) | ③영어 코드만(화면은 기본 문구로 대체됨) | `functions/api/consult.ts:38,49,112` | message에 "허용되지 않은 요청입니다." 등 한글 추가 |
| 31 | 오류 화면 | (error.message 원문 노출) + "홈으로" → /dashboard | ③영어 원문 노출 ②비로그인 사용자도 대시보드로 | `src/components/ui/ErrorFallback.tsx:25-27,38` | 원문은 "오류 내용 복사" 버튼 뒤로, 홈은 "/" |
| 32 | 상단 알림 | API 오류 발생 / 버그 리포트 버튼으로 관리자에게 알려주세요. | ①API·버그 리포트 | `src/components/ui/ApiStatusMonitor.tsx:27,30` | 서버 응답 오류 / 오른쪽 아래 불편 신고 버튼으로 알려 주세요. |
| 33 | 버그 신고 모달 | 베타 테스트 피드백 / 리포트 저장 + 카카오톡 전송 준비 | ①⑥ | `src/components/ui/BugReportButton.tsx:119,170` | 사용 중 불편 신고 / 저장하고 카카오톡으로 보내기 |
| 34 | 버그 신고 버튼 | aria-label "버그 리포트" | ① | `src/components/ui/BugReportButton.tsx:102` | 불편 신고 |
| 35 | 설정 | 비밀번호 변경 / 현재 비밀번호 | ⑤구글 로그인 전용이라 항상 실패(이메일 재인증) | `src/pages/SettingsPage.tsx:323-356`, `src/services/firebase/auth.ts:196-198` | 섹션 삭제, 또는 "구글 계정 비밀번호는 구글에서 변경합니다"(링크) |
| 36 | 설정 시스템 정보 | AI 모델 Claude claude-sonnet-5 / STT 엔진 RTZR Sommers / 프레임워크 React 18 + TypeScript + Vite / 백엔드 Firebase … | ①개발 용어 나열 | `src/pages/SettingsPage.tsx:485-489` | 음성 인식: 리턴제로 / AI: Anthropic Claude 두 줄만 |
| 37 | 설정 계정 정보 | 계정 상태: "활성" 아니면 status 원문(pending/rejected) | ③영어 값 노출 | `src/pages/SettingsPage.tsx:503` | 승인 대기 / 거절 로 매핑 |
| 38 | 대시보드·자유지시 | 양식 없이 AI에게 직접 시키기 · 체크포인트 생략 · 20~30초 | ①체크포인트 | `src/pages/DashboardPage.tsx:251`, `src/pages/FreeformPage.tsx:298-299` | 확인 질문 없이 |
| 39 | 문서 생성 | HWP 다운로드 (실제 파일은 .hwpx) | ⑤이름과 결과 다름 | `src/pages/DocumentPage.tsx:477,486` | 한글(HWPX) 다운로드 |
| 40 | AI 분석 대기 문구 | 판결문 DB에서 시맨틱 검색 중… / 벡터 분석 중… / 승소/패소 패턴을 분석하고 있습니다… | ①개발 용어 ④승패 언급 | `src/pages/AgentsPage.tsx:614-616` | 비슷한 사건을 찾는 중… / 판단 경향을 정리하는 중… |
| 41 | 재무 관리 빈 상태 | 사건 상세 페이지의 [재무] 탭에서 … 추가할 수 있어요. | ②링크 없음 ⑥어투(다른 화면은 합쇼체) | `src/pages/FinancePage.tsx:414-417` | "사건 관리로 가기"(링크) … 추가할 수 있습니다. |
| 42 | 일정 캘린더 빈 상태 | 사건 상세의 [일정 관리] 탭에서 기한을 추가하세요. | ②링크 없음 | `src/pages/CalendarPage.tsx:249` | "사건 목록으로 가기"(링크) |
| 43 | 새 상담 | "…" 파일은 레거시 DOC 형식입니다. | ①레거시 | `src/pages/RecordPage.tsx:143,147` | 옛 워드 형식(.doc)입니다. |
| 44 | 서명 페이지(의뢰인) | 본 전자서명은 전자서명법 제3조에 따라 법적 효력을 가집니다. | ④조문보다 강한 단정 | `src/pages/SigningPage.tsx:460` | 전자서명법 제3조에 따라, 전자 형태라는 이유로 효력이 부인되지 않습니다. |

---

## 확신이 낮은 항목

- **(A)6 "무료" 어휘의 규정 적용 범위.** 변협 광고규정은 변호사가 손님에게 하는 광고를 다룬다. 변호사에게 파는 SaaS 광고에 그대로 적용되는지는 규정 원문(협회 자치규정, 법제처에 없음)을 확인해야 한다. 원문 미확보라 "보수적으로 피하라"로만 적었다.
- **(A)8 스코어카드 잘림.** 폭 계산은 글꼴 폭 추정이다. 실기기에서 확인해야 한다.
- **(B)10 Firestore 색인.** `status`·`role` 두 조건 + `createdAt` 정렬은 복합 색인이 없으면 조회 자체가 실패해 목록이 비고 콘솔에 에러만 남는다(`AdminPage.tsx:56-57`은 console.error만). 배포 환경에 색인이 있는지는 코드로 알 수 없다. `firestore.indexes.json`은 이번에 읽지 않았다.
- **(A)6 "1,000건 이상".** 사실일 수 있다. 문제는 화면에 근거가 없다는 점이지 거짓이라는 뜻이 아니다.
- **(A)5 FAQ 보안.** Storage 규칙은 읽지 않았다. Firestore 규칙만으로 판단했다.
- **관리자 화면 색 토큰.** AdminPage가 쓰는 `text-text-dim`·`bg-gold-dim`·`bg-navy-light`는 `src/index.css`에 라이트 테마 값으로 정의돼 있어 깨지진 않는다. 다만 다크 시절 이름(navy)이라 값과 이름이 다르다 — 화면엔 안 보이니 표에 넣지 않았다.
- **PendingScreen 도달 불가.** 코드상 `businessVerified`가 false면 제출이 막힌다. 다만 `useAuth.completeProfile`이 다른 경로로도 불리는지는 `src/hooks/useAuth.ts` 전체를 읽지 않아 100%는 아니다(발췌만 확인).
