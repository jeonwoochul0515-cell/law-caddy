# LAW-CADDY 예행연습 r1-01 — 가입·승인·로그인·비밀번호·탈퇴

점검자 역할. 부산 1인 법률사무소 40대 후반 김 변호사. 개발 용어 모름. 휴대폰으로 상담 녹음, PC로 서면 작성. 비밀번호를 자주 잊는다.
점검 범위. 가입 → 프로필 설정(사업자 확인) → 승인 대기 → 관리자 승인 알림 → 로그인 → 비밀번호 분실 → 탈퇴.
방법. 화면 글자와 버튼을 코드로 끝까지 추적(페이지 → 훅 → 서버 함수 → 규칙). 브라우저·실데이터 접근 없음. 줄 번호는 2026-09-11 기준 파일.

## 읽은 파일

- src/App.tsx (라우트 가드 RequireAuth·RequireAdmin·RequirePending·RequireProfileSetup·PublicOnly)
- src/pages/LoginPage.tsx, src/pages/RegisterPage.tsx, src/pages/ProfileSetupPage.tsx, src/pages/PendingPage.tsx
- src/pages/SettingsPage.tsx (프로필·비밀번호·계정 정보 부분), src/pages/AdminPage.tsx (가입 승인 탭)
- src/hooks/useAuth.ts, src/hooks/usePlanLimits.ts (플랜 판정 부분)
- src/components/auth/LoginForm.tsx, PendingScreen.tsx, RegisterForm.tsx(어디서도 import되지 않는 죽은 코드)
- src/components/layout/Sidebar.tsx (로그아웃 버튼)
- src/services/firebase/auth.ts, src/services/firebase/firestore.ts (관리자 부분), src/services/business-verify.ts, src/services/clova-ocr.ts, src/services/notify.ts, src/services/api-auth.ts
- src/types/user.ts, src/config/demo.ts, src/config/constants.ts (PLANS)
- functions/api/_middleware.ts, functions/api/_shared/auth.ts, functions/api/clova-ocr.ts, functions/api/verify-business.ts, functions/api/notify/signup.ts, functions/api/notify/approved.ts
- firestore.rules (users), storage.rules (business-registrations), firestore.indexes.json, index.html (viewport)

## 흐름 요약 (코드로 확인한 실제 동작)

1. 로그인은 구글 계정 하나뿐이다(LoginForm.tsx:51-72). 이메일·비밀번호 가입 화면은 없다(RegisterPage.tsx:4-6은 /login으로 돌려보내고, App.tsx에는 /register 라우트 자체가 없다).
2. 첫 로그인 뒤 /profile-setup에서 사업자등록증 사진·PDF를 올리면 CLOVA OCR로 읽어 업태/종목에 "변호사·법률·법무"가 있는지 본다(ProfileSetupPage.tsx:135-139). 있으면 즉시 `status: "approved"`로 문서가 만들어진다(services/firebase/auth.ts:102, 112).
3. 관리자 화면은 `status == "approved"` 사용자만 불러와 변호사 등록번호를 사람이 대조하고 「검증」(verified 필드) 또는 「탈퇴」(status rejected)를 누른다(firestore.ts:756-760, 787-806).
4. 변호사가 아는 값만 묻는다는 점은 좋다. 손으로 치는 것은 변호사 등록번호·휴대폰뿐이고 사업자번호·개업일·주소는 OCR이 채운다(ProfileSetupPage.tsx:342-351).

## 발견

### 1. 사업자등록증에서 "변호사"를 못 읽으면 가입이 영구히 막힌다 · 막힘
- 어디서. 프로필 설정 화면(/profile-setup)
- 무슨 일이. OCR이 업태/종목 칸을 잘못 읽으면 "업태/종목에 변호사업이 확인되지 않습니다"가 뜨고 「프로필 설정 완료」 버튼이 회색으로 잠긴다. 다른 사진으로 다시 올리는 것 말고는 할 수 있는 게 없다. 손으로 업태를 적거나 "일단 접수하고 사람이 봐 달라"는 길이 없다.
- 근거. ProfileSetupPage.tsx:159-161(unverified 처리), :185-188(제출 차단), :437(`disabled={... !businessVerified ...}`), :450-453(안내문). 판정은 정규식 파싱 결과 `businessType`·`businessCategory`에만 의존한다(business-verify.ts:134-144 → ProfileSetupPage.tsx:135-139). `status: "pending"`은 `businessVerified === false`일 때만 나오는데(auth.ts:102, 112) UI에서는 `businessVerified`가 false면 제출 자체가 안 되므로, 승인 대기 화면(PendingScreen)은 현재 UI로는 도달할 수 없다.
- 고칠 방향. 변호사업이 확인되지 않아도 `pending`으로 접수는 받고, 관리자가 사업자등록증 파일을 보고 승인하게 한다. 화면에는 "확인이 안 되면 접수 후 1~2일 안에 연락드립니다"와 연락처를 둔다.

### 2. 승인 대기(pending) 사용자는 관리자 화면에 아예 뜨지 않는다 · 막힘
- 어디서. 관리자 화면(/admin) 가입 승인 탭 ↔ 승인 대기 화면(/pending)
- 무슨 일이. 대기 화면은 "관리자 수동 승인 (1~2 영업일)"이라 약속하지만, 관리자 목록은 `status == "approved"`만 조회한다. pending 계정은 누구 눈에도 안 띄어 영원히 대기한다. 승인 문자(notifyApproved)도 관리자 「검증」 버튼에서만 나가므로, pending→approved 전환 코드는 프로젝트 어디에도 없다.
- 근거. firestore.ts:756-760(`where("status","==","approved")`), AdminPage.tsx:53-54(getUnverifiedUsers만 호출), PendingScreen.tsx:36(1~2 영업일 문구), AdminPage.tsx:107-112(verifyUser → notifyApproved). `grep pending`으로 AdminPage·firestore.ts에 pending 처리 없음 확인.
- 고칠 방향. 관리자 목록에 「승인 대기」 탭을 추가해 pending도 불러오고, 승인 시 status를 approved로 바꾼 뒤 approved.ts 문자를 보낸다. (1번을 고치는 순간 이 문제가 실제로 터진다.)

### 3. 거부된 변호사는 이유도 연락처도 없이 로그인 화면만 본다. 다시 신청하면 영어 오류가 뜬다 · 위험
- 어디서. 로그인 화면(/login), 프로필 설정 화면(/profile-setup)
- 무슨 일이. 관리자가 「탈퇴」를 누르면 status가 rejected가 된다. 변호사는 다음 접속에 아무 설명 없이 로그인 화면으로 밀려나고, 구글 버튼을 다시 눌러야 "가입이 거부되었습니다. 관리자에게 문의하세요."가 뜬다. 어디로 문의하는지 없다. 주소창에 /profile-setup을 치면 화면이 열리고 사업자등록증을 다시 올릴 수 있는데, 파일은 저장소에 올라간 뒤 Firestore 규칙에서 막혀 "Missing or insufficient permissions." 같은 영어가 그대로 뜬다.
- 근거. App.tsx:105(rejected → /login), :215-219(PublicOnly는 rejected면 그냥 로그인 폼 표시, 메시지 없음), LoginPage.tsx:24-25(문구), App.tsx:170-175(RequireProfileSetup은 rejected 사용자를 통과시킴), auth.ts:94-98(파일 먼저 업로드) → :132(setDoc) ↔ firestore.rules:47-55(rejected→approved·pending 모두 불허) → ProfileSetupPage.tsx:237(`err.message` 그대로 표시). 연락처 문자열 grep 결과 auth 화면 어디에도 없음.
- 고칠 방향. rejected 전용 화면을 만들어 사유·연락처·재신청 버튼을 두고, 재신청은 서버가 처리한다. 로그인 화면에도 세션이 살아 있으면 상태 안내를 띄운다.

### 4. 이름·사무소명은 OCR이 읽은 값 그대로 잠겨 있어 잘못 읽혀도 못 고친다 · 위험
- 어디서. 프로필 설정 화면
- 무슨 일이. "변호사 이름 (사업자등록증)", "법률사무소 이름 (사업자등록증)" 칸이 읽기 전용이다. OCR이 "김창희"를 "김창회"로 읽으면 그 이름이 관리자 문자·승인 문자·문서 서명에 들어간다. 법무법인 소속 변호사가 가입하면 본인이 아니라 대표자 이름이 들어간다.
- 근거. ProfileSetupPage.tsx:114-120(OCR 값으로 덮어씀), :372·:376(`readOnly`), business-verify.ts:117-120("대표자/성명" 뒤 2~5글자를 name으로), signup.ts:27(문자에 name), approved.ts:44(문자에 name). 설정에서 나중에 고칠 수는 있으나(SettingsPage.tsx:100-110) 그 사실을 화면 어디에도 알리지 않는다.
- 고칠 방향. 칸을 편집 가능하게 열고 "사업자등록증과 다르면 고쳐 주세요" 한 줄을 붙인다.

### 5. 사업자등록증 인식이 실패하면 영어·JSON 덩어리가 그대로 보인다 · 답답
- 어디서. 프로필 설정 화면, 업로드 상태 줄
- 무슨 일이. 서버 설정이 빠졌거나 CLOVA가 거부하면 `CLOVA OCR HTTP 503: {"error":"CLOVA OCR 설정이 되어있지 않습니다."}` 처럼 뜬다. 토큰이 만료됐으면 `CLOVA OCR HTTP 401: {"error":"인증 실패","detail":"토큰 만료됨"}`. 변호사는 "CLOVA"가 뭔지 모른다.
- 근거. clova-ocr.ts:65-68(`throw new Error("CLOVA OCR HTTP " + status + ": ...")`), ProfileSetupPage.tsx:129-132(`err.message`를 verifyMessage로), functions/api/clova-ocr.ts:19-22(503), _shared/auth.ts:187-190(401 detail).
- 고칠 방향. 상태 코드별로 사람 말("잠시 뒤 다시 올려 주세요", "다시 로그인해 주세요")로 바꾸고 「다시 시도」 버튼을 붙인다.

### 6. 구글 로그인 오류 대부분이 영어로 뜬다 · 말
- 어디서. 로그인 화면
- 무슨 일이. 팝업 닫힘·팝업 차단·다른 방법 가입 3가지만 한국어다. 네트워크 끊김, 도메인 미허용, 중복 팝업 등은 "Firebase: Error (auth/network-request-failed)."처럼 그대로 나온다. "팝업이 차단되었습니다. 팝업 차단을 해제해 주세요."도 40대 변호사는 어디서 해제하는지 모른다.
- 근거. services/firebase/auth.ts:66-75(3개만 매핑, `default: throw error`), LoginPage.tsx:31-32(`setError(err.message)`). signInWithRedirect 미사용(grep 결과 없음).
- 고칠 방향. 나머지 코드를 한국어로 매핑하고, 팝업 차단은 "휴대폰이면 크롬·사파리로 열어 주세요"처럼 행동을 적는다.

### 7. 비밀번호가 없는 구글 계정인데 설정에 「비밀번호 변경」이 있고 누르면 항상 실패한다 · 답답
- 어디서. 설정 > 프로필 탭
- 무슨 일이. 비밀번호를 자주 잊는 변호사는 이 칸을 보고 "현재 비밀번호"를 뭘 넣어야 하나 헤맨다. 구글로만 가입한 계정에는 이메일 비밀번호가 없어 `EmailAuthProvider` 재인증이 실패한다. 반대로 정말 비밀번호(구글 비밀번호)를 잊었을 때 안내는 없다.
- 근거. SettingsPage.tsx:323-388(모든 사용자에게 표시), auth.ts:196-198(EmailAuthProvider.credential로 재인증), :203-210(실패 코드 일부만 매핑). `sendPasswordResetEmail` 사용처 없음(grep).
- 고칠 방향. 섹션을 없애고 "로그인은 구글 계정으로 합니다. 비밀번호를 잊으셨으면 구글 계정 복구 페이지에서 찾으세요" 링크 한 줄로 바꾼다.

### 8. 스스로 탈퇴하는 길이 없다. 관리자 「탈퇴」도 실제로는 삭제가 아니다 · 위험
- 어디서. 설정 화면, 관리자 화면
- 무슨 일이. 개인정보 동의문은 "회원 탈퇴 시까지" 보관한다고 하지만 탈퇴 버튼이 없다. 관리자의 「탈퇴」는 status만 rejected로 바꾼다. 구글 인증 계정, 저장소의 사업자등록증 파일, 사건·녹음 데이터는 그대로 남는다.
- 근거. SettingsPage.tsx grep에서 "탈퇴·삭제" 없음(계정 정보 표시만, :500-512), ProfileSetupPage.tsx:428(보유 기간 문구), firestore.ts:800-804(`status: "rejected"`만 update), AdminPage.tsx:123(확인창 문구 "탈퇴 처리"). deleteUser 호출처 없음(grep).
- 고칠 방향. 설정에 「탈퇴 요청」을 두고 서버(관리자 SDK)가 Auth·Firestore·Storage를 함께 지우며, 관리자 버튼 이름은 "이용 차단"으로 바꾼다.

### 9. 승인 대기 화면에 연락처·상태 확인 버튼이 없고, 승인돼도 새로고침 전엔 모른다 · 답답
- 어디서. 승인 대기 화면(/pending)
- 무슨 일이. "1~2 영업일" 문구 외에 누가 언제 연락하는지, 급하면 어디로 전화하는지 없다. 사용자 문서는 로그인할 때 한 번만 읽으므로 승인이 나도 화면이 바뀌지 않는다. 승인 문자도 pending 경로에는 없다(2번).
- 근거. PendingScreen.tsx:21-51(문구·로그아웃만), useAuth.ts:84-88(getDoc 1회, 실시간 구독 없음).
- 고칠 방향. 연락처 한 줄 + 「승인됐는지 확인」 버튼(문서 재조회), 승인 시 문자.

### 10. 며칠째 쓰고 있는 변호사에게 "가입 승인이 완료되었습니다. 지금 로그인하시면…" 문자가 간다 · 말
- 어디서. 관리자 「검증」 버튼 → 변호사 휴대폰 문자
- 무슨 일이. 가입 즉시 approved라 이미 서비스를 쓰고 있는데, 관리자가 등록번호를 대조하고 「검증」을 누르면 "가입 승인 완료, 지금 로그인하세요" 문자가 온다. "그럼 지금까지는 승인 전이었나?" 하고 놀란다. 관리자 화면 안내문도 "회원가입 시 즉시 서비스 이용이 가능합니다"라고 적혀 있어 문자와 어긋난다.
- 근거. approved.ts:54(문자 본문), AdminPage.tsx:107-112(verifyUser 직후 notifyApproved), :220-221(안내 배너), firestore.ts:787-795(verified 필드만 추가).
- 고칠 방향. 문자를 "변호사 등록번호 확인이 끝났습니다. 계속 이용하시면 됩니다"로 바꾼다.

### 11. "Starter가 무료로 열립니다"라더니 계정 요금제는 "free"라고 뜬다 · 말
- 어디서. 로그인 화면 ↔ 설정 > 계정 정보
- 무슨 일이. 로그인 화면은 Starter를 준다고 하고, 가입 시 plan은 "free"로 저장된다. PLANS 목록에 "free"가 없어 설정 화면 요금제 줄에 영어 "free"가 그대로 찍힌다.
- 근거. LoginForm.tsx:42, auth.ts:113(`plan: "free"`), constants.ts:77-81(starter·pro·team만), SettingsPage.tsx:505(`PLANS.find(...)?.name ?? user?.plan`). 한도는 free=starter로 같게 취급한다(usePlanLimits.ts:41, 50-51).
- 고칠 방향. 가입 시 plan을 "starter"로 저장하거나, free를 "Starter(무료)"로 표시한다.

### 12. 휴대폰에서 누를 것들이 작다 · 답답
- 어디서. 프로필 설정·승인 대기·사이드바
- 무슨 일이. 「촬영」「파일 선택」 버튼 약 40px, 미리보기 지우기 ✕ 28px, "다른 파일로 다시 업로드" 약 30px, 동의 체크박스 16px, 대기 화면 로그아웃 약 40px, 사이드바 로그아웃은 글자 없는 아이콘 32px. OCR 결과 표와 동의문은 12px 글자다. 44px 기준에 못 미친다.
- 근거. ProfileSetupPage.tsx:306·310(`py-2.5 text-sm`), :322(`w-7 h-7`), :358(`text-xs py-1.5`), :406(`w-4 h-4`), :341·:418(`text-xs`), PendingScreen.tsx:47(`py-2`), Sidebar.tsx:166(`w-8 h-8`, 아이콘만). viewport 메타는 있음(index.html:6).
- 고칠 방향. 버튼 최소 높이 44px, 본문 14px 이상, 로그아웃에 글자 표기.

### 13. 변호사 등록번호·휴대폰 형식 안내와 검사가 없다 · 답답
- 어디서. 프로필 설정 화면
- 무슨 일이. 등록번호 칸은 "변호사 등록번호 입력"뿐, 자릿수 예시가 없다. 휴대폰은 아무 글자나 통과한다. 번호를 잘못 치면 승인·검증 문자가 조용히 안 나가고(서버는 `sent:false`로 성공 처리) 변호사는 모른다.
- 근거. ProfileSetupPage.tsx:386(placeholder), :393(`type="tel"`만, 형식 검사 없음), :189-196(빈 값만 검사), approved.ts:43-48(전화번호 없으면 조용히 성공).
- 고칠 방향. 휴대폰은 숫자 10~11자리 검사와 자동 하이픈, 등록번호는 "변호사 신분증의 등록번호(예: 12345)" 예시.

### 14. 프로필 확정 뒤에는 이메일(구글 계정)을 바꿀 길이 없다 · 답답
- 어디서. 설정 > 프로필
- 무슨 일이. 사무실 계정 대신 개인 구글 계정으로 가입해 버리면 되돌릴 수 없다. 설정에서 고칠 수 있는 것은 이름·사무소명·휴대폰뿐이다. 프로필 설정 단계에는 「다른 계정으로 로그인」이 있어(ProfileSetupPage.tsx:458-460) 그 전까지는 괜찮다.
- 근거. SettingsPage.tsx:33-35(편집 필드 3개), auth.ts:220-226(updateUserProfile도 name·firmName·phone만).
- 고칠 방향. 최소한 프로필 설정 화면 상단에 "이 구글 계정(이메일)으로 계속 씁니다. 사무실 계정으로 바꾸려면 여기서 다른 계정으로 로그인하세요"를 강조한다.

## 규칙과 화면 값 대조 (항상 거부되는 동작이 있는지)

- 생성. 화면은 `role:"lawyer"`, `status:"approved"|"pending"`, `profileCompleted:true`로 만든다(auth.ts:104-130). 규칙 create는 role lawyer + status pending/approved(firestore.rules:36-38). 일치.
- 본인 수정. 설정의 name·firmName·phone 갱신은 role·plan·planExpiresAt을 건드리지 않아 통과(rules:47-56).
- 관리자 수정. verified·verifiedAt·verifiedBy 추가, status rejected는 admin write 조건(role·status 값)에 맞는다(rules:60-62).
- 저장소. 화면은 image/* 또는 application/pdf, 10MB 이하만 받고(ProfileSetupPage.tsx:58-65), storage.rules:82-88도 같다. 일치.
- 어긋나는 경우는 3번(rejected 사용자의 재제출)뿐이다. 정상 흐름에서 규칙 때문에 항상 막히는 동작은 없다.
- 관리자 목록 쿼리(status·role·createdAt 복합 인덱스)는 firestore.indexes.json:35-43에 있다.

## 확신이 낮은 항목

- (1번 관련) 실제 사업자등록증 인쇄 양식에서 "업태"와 "종목"이 표 형태로 헤더 줄과 값 줄이 나뉘면 정규식(business-verify.ts:135-144)이 값을 못 잡을 가능성이 높다고 본다. CLOVA가 줄을 어떻게 끊는지는 실물로 확인해야 한다. 잠김 자체는 코드로 확실하다.
- 카카오톡·네이버 앱 안의 브라우저에서 구글 팝업 로그인이 구글 정책(disallowed_useragent)으로 막힐 가능성이 있다. 코드에 대응(signInWithRedirect 또는 안내)이 없는 것은 확실하고, 실제 차단 여부는 기기 확인 필요.
- 7번에서 구글 전용 계정의 재인증 실패 코드가 `auth/wrong-password`("현재 비밀번호가 일치하지 않습니다")로 올지 `auth/invalid-credential`(영어 그대로)로 올지는 Firebase SDK 버전에 따라 다르다. 어느 쪽이든 변호사에게는 뜻이 안 통한다.
- 아이폰 사진첩에서 HEIC를 고르면 확장자 기준으로 "jpg"로 보내(business-verify.ts:40-43) CLOVA가 거부할 수 있다. 실측 없음.
- verify-business.ts는 `serviceKey=DEMO_KEY`(:44)와 홈택스 응답의 "부가가치세" 문자열 포함 여부(:104)로 진위를 판단하고, 통과하면 화면에 "국세청 진위 확인 완료"(ProfileSetupPage.tsx:151)라고 확정 표시한다. 실제 API 동작을 확인하지 않았으나 문구가 근거보다 강하다. 변호사 입장의 불편보다는 운영 신뢰 문제라 발견 목록에서 뺐다.
- 구버전 이메일 가입자(profileCompleted 없음, plan이 pro 등)가 프로필 설정을 다시 하면 setDoc이 plan을 "free"로 덮어 규칙(rules:49)에 막힐 수 있다. 그런 계정이 실제로 있는지는 모른다.
