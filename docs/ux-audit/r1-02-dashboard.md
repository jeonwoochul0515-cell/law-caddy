# r1-02 · 대시보드 → 메뉴·상단바·알림 → 설정 → 로그아웃 점검

점검자 시점. 부산 1인 사무소 김 변호사(40대 후반, 비개발자). 아침에 로그인해 30초 안에 오늘 기일·기한·미수금·답장할 의뢰인을 알고 싶다. 화면 글자를 그대로 읽는다.

## 읽은 파일

- src/pages/DashboardPage.tsx
- src/components/dashboard/DashboardStats.tsx, OnboardingGuide.tsx
- src/components/layout/AppLayout.tsx, Sidebar.tsx, Header.tsx, NotificationBell.tsx, PlanExpiryBanner.tsx
- src/hooks/useSidebarCollapse.ts, usePlanLimits.ts, useAuth.ts
- src/pages/SettingsPage.tsx
- src/services/notifications.ts, notify.ts, backupExport.ts, overdueDetector.ts, payment.ts
- src/services/firebase/auth.ts, firebase/accounting.ts(일부)
- src/components/accounting/FinanceSummaryWidget.tsx, OverdueAlertPanel.tsx
- src/components/payment/UsageSummary.tsx, PlanSelector.tsx, PaymentModal.tsx
- src/components/ui/ApiStatusMonitor.tsx, BugReportButton.tsx
- src/types/user.ts, subscription.ts, deadline.ts, accounting.ts(일부)
- src/config/constants.ts(일부), firebase.ts(일부), App.tsx, pages/LoginPage.tsx(일부), pages/AgentsPage.tsx(일부), services/file-save.ts(일부)
- firestore.rules
- functions/api/_shared/plan.ts(일부), functions/api/payment/confirm.ts(일부)

## 발견

### 1. 유료 플랜을 연장할 방법이 화면에 없다 · 심각도 막힘
- 어디서. 상단 노란 배너 "연장 결제하기" → 설정 > 요금제
- 무슨 일이. Pro 만료 7일 전 배너가 뜨고 "연장 결제하기"를 누르면 설정 화면의 **프로필 탭**이 열린다. 요금제 탭으로 옮겨도 Pro 카드에는 "현재 플랜"이라는 글자만 있고 버튼이 없다. 만료가 지나도 똑같다. 위쪽 사용량 칸에는 "Free", 아래 카드에는 "Pro 현재 플랜"이 동시에 보인다.
- 근거.
  - PlanExpiryBanner.tsx:58-60 링크가 `/settings` 뿐 (탭 지정 없음). SettingsPage.tsx:32 기본 탭 `"profile"`, 쿼리스트링을 읽는 코드 없음(useSearchParams 미사용).
  - SettingsPage.tsx:408 `currentPlan={user?.plan ?? "free"}` — 만료 판정 없이 원본 값을 넘김.
  - PlanSelector.tsx:115-120 `planId === currentPlan → "current"`, 199-202 현재 플랜이면 버튼이 아닌 `<div>현재 플랜</div>`.
  - 서버는 만료돼도 users.plan을 바꾸지 않는다. confirm.ts:124-127은 결제 때만 쓰고, plan.ts:82는 만료를 계산만 한다. 그래서 만료 후에도 `user.plan === "pro"`.
  - usePlanLimits.ts:509-511은 만료면 `"free"`로 계산 → UsageSummary.tsx:63,78-80 "Free" 칩.
  - 알림 벨의 "플랜 만료됨" 항목도 `/settings`로만 보낸다(notifications.ts:118, 130).
- 고칠 방향. 현재 플랜이 Pro여도 "연장 결제" 버튼을 두고(만료·임박이면 강조), 배너·알림 링크는 `/settings?tab=plan`으로 보내며 SettingsPage가 이를 읽어 요금제 탭을 연다.

### 2. 연락처를 지우고 저장하면 영어 오류가 뜬다 · 심각도 위험
- 어디서. 설정 > 프로필 > 기본 정보 > 저장
- 무슨 일이. 연락처 칸을 비우고 저장하면 "프로필 업데이트 실패: Function updateDoc() called with invalid data. Unsupported field value: undefined ..." 같은 영어 문장이 빨갛게 뜬다. 이름·사무소명 수정도 함께 실패한다.
- 근거. SettingsPage.tsx:115 `phone: editPhone.trim() || undefined` → auth.ts:225 `updateDoc(..., { ...data })`에 `undefined`가 그대로 들어감. firebase.ts:32 `getFirestore(app)` 기본 설정(ignoreUndefinedProperties 없음). auth.ts:227-228은 SDK 오류 문장을 그대로 붙여 던지고 SettingsPage.tsx:120-123이 그대로 표시.
- 고칠 방향. 빈 값은 `deleteField()` 또는 `null`로 보내고, 오류는 "저장하지 못했습니다. 다시 시도해 주세요"로 바꾼다.

### 3. 프로필을 저장해도 왼쪽 메뉴의 이름은 옛 이름이다 · 심각도 답답
- 어디서. 설정 > 프로필 > 저장 → 사이드바 하단, 연체 안내 문자
- 무슨 일이. "프로필이 저장되었습니다"가 떠도 왼쪽 아래 이름과 이니셜, 대시보드 연체 메시지의 서명(사무소명·변호사명)은 다시 로그인하기 전까지 예전 값이다. 저장이 안 된 줄 알고 또 누르게 된다.
- 근거. SettingsPage.tsx:98-127 저장 후 `useAuth` 스토어를 갱신하지 않음. Sidebar.tsx:207,212-213은 `user.name`(스토어 값). OverdueAlertPanel.tsx:177-178 `user?.firmName`, `user?.name`. 규칙(firestore.rules:47-56)은 본인 수정을 허용하므로 Firestore 저장 자체는 된다.
- 고칠 방향. 저장 성공 시 스토어 `user`를 새 값으로 갱신(또는 문서 재조회).

### 4. "비밀번호 변경" 칸은 아무도 쓸 수 없다 · 심각도 답답
- 어디서. 설정 > 프로필 > 비밀번호 변경
- 무슨 일이. 로그인은 구글 버튼뿐인데 설정에는 "현재 비밀번호"를 묻는 칸이 있다. 무엇을 넣어도 "Firebase: Error (auth/invalid-credential)" 같은 영어 오류가 나온다.
- 근거. LoginPage.tsx:8,14 `googleLogin`만 호출. App.tsx 라우트에 회원가입(/register) 없음. auth.ts:50-79 로그인 함수는 `signInWithGoogle` 하나. auth.ts:196-198 `EmailAuthProvider.credential(email, currentPassword)`로 재인증 → 구글 전용 계정에는 비밀번호가 없어 실패. auth.ts:203-210 매핑되지 않은 코드는 원문 그대로 throw. SettingsPage.tsx:323-384 화면.
- 고칠 방향. 구글 로그인 계정이면 이 칸을 숨기고 "구글 계정 비밀번호는 구글에서 바꿉니다" 안내(링크)로 대체.

### 5. 대시보드에 오늘 기일·기한이 없다 · 심각도 답답
- 어디서. 대시보드 전체("대시보드 / 오늘의 업무 현황")
- 무슨 일이. 아침에 열면 사건 수, 매출, 미수금, 6개월 그래프, 최근 사건은 보이는데 **오늘·이번 주 기일과 서면 기한**은 없다. 알려면 오른쪽 위 종을 눌러 320px짜리 드롭다운을 읽거나 "일정 캘린더" 메뉴로 가야 한다. 30초 목표에서 첫 화면이 빗나간다. "답장할 의뢰인" 항목도 어디에도 없다.
- 근거. DashboardPage.tsx:210-373 구성(시작 가이드·통계 4장·자유 지시·새 상담/사건 관리·재무 요약·연체·통계·최근 사건). 기한 데이터는 notifications.ts:32-62(벨)와 CalendarPage.tsx:52-56에서만 읽는다. Header.tsx:258-275에 벨 외 정보 없음. NotificationBell.tsx:369 `w-80 max-h-[420px]`.
- 고칠 방향. 대시보드 최상단에 "오늘 · 이번 주 기일/기한" 카드(각 항목 → 사건 상세 링크)를 두고, 일정 캘린더 링크를 붙인다.

### 6. 통계 카드 4장은 눌러도 아무 일이 없다 · 심각도 답답
- 어디서. 대시보드 상단 "전체 사건 / 진행중 / 생성 문서 / 상담 녹음"
- 무슨 일이. "진행중 12"를 보고 누르면 반응이 없다. 진행중 목록으로 가려면 아래로 내려가 "사건 관리"를 눌러야 한다.
- 근거. DashboardPage.tsx:219-232 `<div>`에 onClick 없음. 반면 바로 아래 카드들(236, 260, 273)은 `<button>`으로 이동한다.
- 고칠 방향. 각 카드를 `/cases`(상태 필터), `/documents`, 녹음 목록으로 연결.

### 7. "이번 달 재무 요약" 안의 미수금·예수금은 이번 달 값이 아니다 · 심각도 위험
- 어디서. 대시보드 "이번 달 재무 요약"
- 무슨 일이. 제목은 "이번 달"인데 미수금은 전 기간 미완납 합계, 예수금은 현재 보관 중 잔액이다. 매출·지출만 이번 달이다. "이번 달 미수금이 800만원"으로 잘못 읽는다.
- 근거. FinanceSummaryWidget.tsx:61 제목. DashboardPage.tsx:121-126 미수금 "월 무관"(주석 그대로), 143-150 예수금 상태 기준 잔액. 109-119, 128-141만 `ym` 필터.
- 고칠 방향. 카드 라벨을 "이번 달 매출 / 이번 달 지출 / 미수금(전체) / 예수금 잔액"으로 나누거나 제목에서 "이번 달"을 뺀다.

### 8. "상담 → 사건 전환율"과 "상담 녹음" 숫자는 실제와 다르다 · 심각도 위험
- 어디서. 대시보드 "사건 구성 · 수임 전환", 통계 카드 "상담 녹음"
- 무슨 일이. 녹음 없이 메모만 붙여 넣은 상담은 세지 않고, PDF·사진을 첨부하면 그 개수만큼 "녹음"으로 센다. 전환율은 사건 수 ÷ 녹음 수라 파일 3개 붙인 사건 하나면 33%, 메모 상담 열 건이면 표시가 아예 안 되거나 100%다. 수임률로 믿고 판단하면 틀린다.
- 근거. DashboardStats.tsx:91-95 `cases.length / recordingCount`, 100% 상한. recordings 문서는 파일이 있을 때만 파일당 1건 생성(AgentsPage.tsx:275-291), OCR 텍스트도 recordings에 기록(file-save.ts:51-61 `fileType: "ocr-text"`). usePlanLimits.ts:566 주석이 같은 사실을 인정("녹음 문서는 파일 업로드 때만 생기므로 … 지표로 부정확"). DashboardPage.tsx:69-70,195 "상담 녹음" 카드는 recordings 전체 개수.
- 고칠 방향. 전환율은 없애거나 "상담(사건) 수 대비 수임계약 서명 건수"처럼 실제 의미가 있는 분모·분자로 바꾸고, 카드는 "첨부 파일"로 이름을 고친다.

### 9. 데이터 조회가 실패하면 "0건", "새 알림이 없습니다", 연체 패널 사라짐으로 보인다 · 심각도 위험
- 어디서. 대시보드 통계 카드, 알림 벨, 연체 알림
- 무슨 일이. 네트워크·권한 문제로 조회가 실패하면 오류 안내 없이 "전체 사건 0", 종에 배지 없음, 연체 패널이 통째로 사라진다. 변호사는 "오늘은 급한 게 없네"로 읽는다.
- 근거. DashboardPage.tsx:86-89 catch → 통계를 0으로 덮어쓰고 화면 안내 없음(console.error만). notifications.ts:148-152 각 소스 실패를 `[]`로 삼킴, NotificationBell.tsx:315-317 catch 무시, 379-383 빈 상태 문구. OverdueAlertPanel.tsx:250-252 `error`면 `null` 반환.
- 고칠 방향. 실패 시 카드에 "불러오지 못했습니다 · 다시 시도" 문구와 버튼을 두고, 벨은 "알림을 확인하지 못했습니다"로 구분.

### 10. 알림은 읽음 처리·지우기가 없고, 지난 기한은 삭제 전까지 영원히 빨간 배지다 · 심각도 답답
- 어디서. 상단 종 아이콘
- 무슨 일이. 서면을 제출해 기한을 끝내도 "기한 지연: 답변서 제출 · 12일 경과"가 계속 남고 배지는 빨간색이다. "확인했어요"를 누를 방법이 없고, 없애려면 사건 상세에서 기한 자체를 삭제해야 한다. 알림이 쌓이면 진짜 급한 것이 묻힌다(9건 넘으면 "9+").
- 근거. notifications.ts:42-49 `dDay > 0`이면 항상 urgent. CaseDeadline(deadline.ts:14-27)에 완료 여부 필드 없음. NotificationBell.tsx:339-345,357-365 읽음 상태 없이 매번 재집계·배지 표시. 항목 클릭은 이동만(342-345).
- 고칠 방향. 기한에 "완료" 체크를 두고 완료·확인한 항목은 알림에서 제외한다.

### 11. 휴대폰에서 왼쪽 메뉴는 글자 없는 아이콘 9개다 · 심각도 답답
- 어디서. 휴대폰(1024px 미만) 모든 화면의 사이드바
- 무슨 일이. 마이크·폴더·달력·문서·사람·계산기·톱니 아이콘만 세로로 늘어서고 이름이 없다. 접기 버튼도 없어 64px 띠가 항상 화면을 차지한다. 390px 폰에서는 본문 폭이 약 278px(64 사이드바 + 좌우 24px 여백)로 줄어 재무 요약의 두 칸 금액이 비좁다. 손끝을 올려도 툴팁은 데스크톱에서만 뜬다.
- 근거. Sidebar.tsx:125 `w-16 lg:w-60`, 187 라벨 `hidden lg:inline`, 191 툴팁 `group-hover:lg:block`, 153 접기 버튼 `hidden lg:flex`. AppLayout.tsx:30 `ml-16`, 46 `p-6`. FinanceSummaryWidget.tsx:72 `grid-cols-2`.
- 고칠 방향. 모바일은 하단 탭 바(아이콘+이름 4~5개) 또는 햄버거 메뉴로 바꾸고 본문 여백을 줄인다.

### 12. 로그아웃은 이름 없는 아이콘 하나이고 확인·오류 안내가 없다 · 심각도 말
- 어디서. 사이드바 하단
- 무슨 일이. 문 모양 아이콘만 있어 "로그아웃"이라는 글자를 화면에서 볼 수 없다. 실수로 눌러도 되묻지 않고, 실패하면 아무 반응이 없다.
- 근거. Sidebar.tsx:221-227(데스크톱), 231-239(접힘·모바일) `<LogOut />` 아이콘만, aria-label만 있음. useAuth.ts:211-214 실패 시 throw하는데 Sidebar.tsx:222,232 `onClick={onLogout}`에 처리 없음.
- 고칠 방향. "로그아웃" 글자를 붙이고 실패 시 안내 문구를 띄운다.

### 13. 설정 "시스템 정보" 탭은 개발 용어 나열이고, 백업이 그 안에 숨어 있다 · 심각도 말
- 어디서. 설정 > 시스템 정보
- 무슨 일이. "AI 모델 Claude claude-sonnet-5", "프레임워크 React 18 + TypeScript + Vite", "백엔드 Firebase (Auth + Firestore + Storage)"가 표로 나온다. 변호사에게 필요 없는 정보다. 정작 "내 데이터 백업"은 이 탭 맨 아래에 있어 찾기 어렵다. 계정 상태는 승인 전이면 "pending" 영어 그대로 나온다.
- 근거. SettingsPage.tsx:169 탭 이름, 484-489 표 내용, 503 `user?.status ?? "-"`(approved만 "활성"으로 번역), 516-541 백업 위치.
- 고칠 방향. 탭 이름을 "백업·정보"로 바꾸고 기술 스택 표는 삭제(또는 "문의" 안내로 대체), 상태값은 한글로.

### 14. 백업 실패 문구가 초록색으로 뜨고, 되돌리기(가져오기)가 없다 · 심각도 위험
- 어디서. 설정 > 시스템 정보 > 전체 데이터 내려받기 (ZIP)
- 무슨 일이. 내려받기가 실패하면 "실패: …" 문장이 성공과 같은 초록색으로 표시돼 성공으로 오인한다. ZIP에는 분할납부 회차, 수임계약 서명 기록, 의뢰인 케어 메시지, 녹음·첨부 파일 원본이 빠진다(README에만 적힘). 가져오기 기능은 없어 되돌릴 수 없다.
- 근거. SettingsPage.tsx:64 실패 문장 → 540 `text-success`로 출력. backupExport.ts:254-267 대상 12개 컬렉션에 installments(서브컬렉션)·signing_requests·clientCareMessages 없음, 354 README 문구. 화면 안내(SettingsPage.tsx:519-522)는 "사건, 문서, 재무 기록 전체"라고 말함. 복원 함수는 확인 범위에서 없음.
- 고칠 방향. 실패는 빨간색으로 구분하고, 화면 안내에 "녹음 원본·서명 기록은 포함되지 않습니다"를 명시하며, 최소한 분할납부·서명 기록을 백업에 넣는다.

### 15. 요금제 화면의 이름과 숫자가 서로 다르다 · 심각도 말
- 어디서. 설정 > 요금제
- 무슨 일이. 위 사용량 칸은 "사건 분석 3 / 5건", 아래 카드는 "녹음: 5건/월"이라 같은 한도를 다른 이름으로 부른다. 실제로 세는 것은 이번 달 만든 **사건 수**다. 무료 사용자는 사용량 칸에 "Free", 카드에는 "Starter · 가입 시 기본 제공"이 보이고 "현재 플랜" 표시가 어디에도 없다.
- 근거. UsageSummary.tsx:92 "사건 분석", PlanSelector.tsx:39,92 "녹음", usePlanLimits.ts:563-574 `cases` 집계. PlanSelector.tsx:83 `PLAN_ORDER = ["starter","pro","team"]`에 "free" 없음 → 113 `currentIndex = -1`, 157-161 "현재 플랜" 배지 미표시. UsageSummary.tsx:11-16 `free: "Free"`.
- 고칠 방향. 용어를 "사건 분석"으로 통일하고, free 사용자는 Starter 카드에 "현재 플랜"을 표시한다.

### 16. 알림을 어떻게 받을지 정하는 곳이 없다 · 심각도 답답
- 어디서. 설정(프로필·요금제·시스템 정보 3개 탭)
- 무슨 일이. 문자(플랜 만료 안내)가 서버 판단으로 자동 발송되는데 받을지, 어느 번호로 받을지, 기한 임박을 문자로도 받을지 정할 화면이 없다. 알림은 종 아이콘 하나뿐이다.
- 근거. SettingsPage.tsx:166-170 탭 3개. PlanExpiryBanner.tsx:33-37 배너가 뜨면 `notifyPlanExpiry()` 자동 호출. 소스 전체에 "알림 설정" 문자열·설정 필드 없음(grep).
- 고칠 방향. 설정에 "알림" 탭을 두고 최소한 문자 수신 여부와 기한 알림 D-day 기준을 고르게 한다.

### 17. 시작 가이드 4단계 "수임료 기록하기"의 버튼이 사건 목록으로만 보낸다 · 심각도 말
- 어디서. 대시보드 시작 가이드
- 무슨 일이. "사건에서 등록"을 누르면 사건 목록이 열리고 끝이다. 어느 사건의 어느 탭에서 수임료를 넣는지 안내가 없어 처음 쓰는 사람은 여기서 멈춘다. 2단계도 같은 `/cases`로 간다.
- 근거. OnboardingGuide.tsx:241-248 `to: "/cases"`, 225-232 `to: "/cases"`. 3단계 "28종 서식"은 constants.ts DOC_TYPES 28개와 일치(확인).
- 고칠 방향. 사건이 있으면 최근 사건의 수임료 탭으로 바로 보내고, 없으면 "먼저 사건을 만드세요" 안내.

### 18. 대시보드 카피에 개발 용어가 섞여 있다 · 심각도 말
- 어디서. 대시보드 금색 카드 "자유 지시로 빠르게 생성"
- 무슨 일이. "양식 없이 AI에게 직접 시키기 · 체크포인트 생략 · 20~30초"에서 "체크포인트"는 제품 내부 단계 이름이다. 변호사는 무엇을 생략한다는지 모른다. "NEW" 배지도 언제까지 새것인지 기준이 없다.
- 근거. DashboardPage.tsx:247-251.
- 고칠 방향. "확인 질문 없이 바로 초안" 식으로 풀어 쓴다.

## 확신이 낮은 항목

- 2번의 정확한 오류 문장은 Firebase SDK 버전(package.json: firebase ^12.9.0)에 따라 다를 수 있다. `undefined` 값을 `updateDoc`에 넣으면 거부된다는 동작은 SDK 문서 기준이며 실행해 보지는 않았다.
- 4번은 `src/pages/RegisterPage.tsx` 파일이 남아 있으나 App.tsx 라우트에 없다는 점으로 "구글 로그인만 가능"이라고 판단했다. 과거 이메일 가입자가 남아 있다면 그 계정에서는 비밀번호 변경이 동작할 수 있다.
- 11번의 "본문 폭 278px"은 클래스 값(64px + 24px×2)으로 계산한 추정이다. 실제 렌더링은 확인하지 않았다.
- 10번에서 "기한 삭제 외 방법이 없다"는 CaseDeadline 타입과 알림 집계 코드 기준이다. 사건 상세의 기한 컴포넌트는 이번 범위에서 읽지 않았다.
- 14번 "복원 기능 없음"은 `importAllData|restoreBackup` 검색 결과 없음에 근거한다. 다른 이름으로 존재할 가능성은 배제하지 못했다.
- 알림 드롭다운(w-80=320px)이 휴대폰에서 사이드바 위로 겹칠 가능성이 있으나 렌더링을 보지 않아 발견 목록에 넣지 않았다.
