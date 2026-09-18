# 흐름 A 수정 보고 — 가입·승인·관리자 (2026-09-11)

담당 범위. r1-01 전체, r1-08 (B) 관리자, r2-03-03(승인 대기 문턱), r2-02 중 가입·관리자 행. 소유 파일 밖은 손대지 않았다. `docs/checklist-ux.md`는 공용 파일이라 체크 표시를 직접 바꾸지 않았다 — 아래 표를 기준으로 옮겨 적으면 된다.

## 1. 고친 항목

| id | 무엇을 | 어떻게 (파일) |
|---|---|---|
| r1-01-01 · r1-08-02 | OCR이 "변호사"를 못 읽어도 가입이 막히지 않게 | `ProfileSetupPage.tsx` — 제출 버튼의 `!businessVerified` 잠금 제거. 업태 불일치(`unverified`)·읽기 실패(`failed`)여도 제출되고, `services/firebase/auth.ts`가 `status: "pending"`으로 저장 → 승인 대기 화면. 버튼 문구가 "신청하기 (담당자 확인 후 이용)"으로 바뀌고 아래에 "영업일 1일 안에 확인 + 카카오톡 링크" 안내. 소속 변호사용 "본인 명의 사업자등록증이 없습니다" 체크박스 추가(파일 없이 접수, `noBusinessLicense: true`, 항상 pending) |
| r1-01-02 | 승인 대기 사용자가 관리자 화면에 뜨게 | `firestore.ts` `getPendingUsers()`(기존 복합 색인 status+role+createdAt 그대로 사용), `AdminPage.tsx` 「승인 대기」 탭 신설. 승인은 `approveUser()`(status→approved, approvedAt/By, 거절 사유 삭제) |
| r1-01-03 · r1-08-12 · r1-08 C-17 | 거절된 변호사에게 사유와 연락처 | `LoginForm.tsx` — 세션이 살아 있는 rejected 회원은 구글 버튼을 다시 누르지 않아도 "가입이 승인되지 않았습니다 + 사유(`rejectedReason`) + 카카오톡 1:1(https://pf.kakao.com/_zkzIX/chat) + 1660-4452 + 서류 고쳐 다시 신청 + 다른 계정으로 로그인" 카드를 본다(`LoginPage.tsx`가 store의 user로 판정). 재신청은 `ProfileSetupPage`가 거절 사유 배너를 띄우고, `completeProfile`이 기존 문서를 `updateDoc`(plan·createdAt·role 보존)으로 갱신해 pending으로 보낸다. `App.tsx` RequirePending은 rejected를 /login으로 |
| r1-01-04 | 이름·사무소명 수정 가능 | `ProfileSetupPage.tsx` — 항상 편집 가능한 입력칸. OCR 값은 비어 있을 때만 채우고 "(사업자등록증에서 읽음 — 다르면 고쳐 주세요)" 표시 |
| r1-01-05 · r1-08 C-20·21 | OCR 오류의 영어·JSON 노출 | `ProfileSetupPage.tsx` `friendlyOcrError()` — 401→"로그인이 풀렸습니다", 429→"1분 뒤", 5xx/CLOVA→"잠시 뒤 다시 읽기 또는 그대로 제출", 텍스트 없음→"더 선명한 사진". 같은 파일로 「다시 읽기」 버튼 추가. "AI가 분석 중입니다..." → "사업자등록증을 읽는 중입니다…". 제출 실패도 `friendlySubmitError()`로 permission/storage/network를 한국어로 |
| r1-01-06 | 구글 로그인 오류 한국어화 | `services/firebase/auth.ts` `GOOGLE_LOGIN_ERRORS` 11개 코드 매핑(팝업 차단은 "카카오톡·네이버 앱이면 '다른 브라우저로 열기' / PC는 주소창 팝업 아이콘"까지). permission-denied·unavailable·기타는 "다시 시도 (오류 코드 …)" |
| r1-01-07 (일부) · r1-08 C-35 | 구글 계정 전용 안내 | `LoginForm.tsx` — "로그인은 구글 계정으로만 합니다. 따로 만드는 비밀번호는 없습니다. 구글 비밀번호를 잊으셨다면 구글 계정 찾기(링크)". 설정의 「비밀번호 변경」 섹션 삭제는 G 소유 |
| r1-01-08 (일부) | 탈퇴 길 · 관리자 "탈퇴" 이름 | `PendingScreen.tsx`·`LoginForm.tsx`(거절 카드)에 "카카오톡으로 탈퇴 요청" 링크와 안내. `AdminPage.tsx` 버튼을 실제 동작대로 「거절」(대기 회원)·「이용 중지」(이용 중 회원)로 바꾸고, 대화상자에 "계정과 파일이 지워지는 것은 아닙니다" 명시. `firestore.ts` `deactivateUser` → `rejectUser(uid, reason, by)` |
| r1-01-09 | 승인 대기 화면 연락처·재확인 | `PendingScreen.tsx`·`PendingPage.tsx` — 「승인됐는지 다시 확인」 버튼(`useAuth.refreshUser()` 신설, 승인되면 /dashboard, 거절되면 /login), 탭 복귀(visibilitychange) 시 조용히 재조회, 카카오톡·1660-4452, 절차 문구를 "법률사무소 청송law 담당자가 대조 → 영업일 1일 안 → 승인 문자"로 |
| r1-01-10 · r1-08-13 · r1-08 C-27 | 승인 문자 시점·본문 | `AdminPage.tsx` — `notifyApproved`는 pending→approved(승인 버튼) 때만 호출. 「등록번호 확인 완료」(verified)는 문자 없음(대화상자에도 "문자는 나가지 않습니다"). `functions/api/notify/approved.ts` 본문 "[Law-Caddy] {name}님, 가입 승인이 완료되었습니다. law-caddy.com 에 로그인하시면 바로 이용하실 수 있습니다. 문의 1660-4452", 이름 없으면 "회원" |
| r1-01-11 | "free" 표기 | `LoginForm.tsx` "Starter(무료)가 바로 열립니다". 설정·요금제 화면의 free 표기는 E·G 소유 |
| r1-01-12 | 휴대폰 터치 크기 | 촬영·파일 선택·다시 올리기·미리보기 ✕(44px)·체크박스 20px·제출 48px·로그아웃 44px·관리자 버튼 44px. OCR 표·동의문 12px→14px |
| r1-01-13 | 등록번호·휴대폰 형식 | 등록번호 숫자만(3~6자리, `inputMode=numeric`, 예시 "12345", 설명 한 줄). 휴대폰 자동 하이픈(`formatMobile`), `01x` 10~11자리 검사, "승인 문자가 이 번호로 갑니다" 안내 |
| r1-01-14 | 이메일 변경 불가 안내 | `ProfileSetupPage.tsx` 상단 "앞으로 {이메일}로 로그인합니다. 사무실 계정으로 바꾸려면 맨 아래 '다른 계정으로 로그인'을 먼저 누르세요. 나중에는 바꿀 수 없습니다." |
| r1-08-10 · C-22 | "미검증 사용자" = 승인 회원 전원 | `getUnverifiedUsers()`가 `verified !== true`만 반환(클라이언트 필터, 새 색인 불필요). 탭 이름 「등록번호 확인」 |
| r1-08-11 | 관리자가 사업자등록증을 못 봄 | `AdminPage.tsx` `UserCard` — 「사업자등록증 보기 (새 창)」(`businessLicenseUrl`), 사업자번호·업태/종목·"변호사업 자동 확인됨"·휴대폰·신청일·"사업자등록증 없음 · 소속 변호사" 배지 |
| r1-08-12 · C-23·24 | 거절 사유·되돌리기·확인 단계 | `ActionDialog`(role=dialog, Esc 닫기) — 거절·이용 중지는 사유 5자 이상 필수, `rejectUser`가 `rejectedReason/At/By` 저장. 「거절·중지」 탭에 `getRejectedUsers()` + 「대기로 되돌리기」(`restoreUserToPending`). 승인·확인 완료도 확인 대화상자를 거친다 |
| r1-08-14 (일부) | 검색·정렬 | 검색에 휴대폰 추가, 정렬 셀렉트(오래된 신청부터/최근부터/이름순), 「목록 새로고침」. 플랜 수동 변경은 미룸(아래) |
| r1-08 C-1 · C-25 · C-26 | 문구 | LoginForm "1인 변호사 사무실 운영 SaaS" → "1~5인 법률사무소 운영 도우미". 관리자 "이번 세션 검증 완료" → "오늘 이 화면에서 처리", "버그 리포트" → "불편 신고", 부제 "변호사 확인 · 불편 신고" |
| r1-08 C-18·19 | 승인 대기·프로필 막다른 문구 | 위 r1-01-09·r1-01-01 참조 |
| r2-02 AdminPage:56-58,77 | 조회 실패가 빈 목록으로 보임 | 목록 조회 실패는 빨간 문구 + 「다시 시도」, 불편 신고 조회 실패는 안내 배너 |
| r2-02 AdminPage:93-98 · 115-117,132-134 | 승인·거절·버그 토글 실패가 무언 | 모든 처리 결과를 상단 배너(성공 초록/실패 빨강, 원인 포함)로 표시. 버그 토글 실패는 롤백 + 배너 |
| r2-03-03 (코드 쪽) | 승인 대기 문턱 자기 승인 | `completeProfile` — 기존 문서가 있는 회원(거절 후 재신청·미완성)은 OCR 결과와 무관하게 항상 pending. 규칙 쪽은 F(아래) |
| r2-03-14 (일부) | 죽은 등록 폼 | `src/components/auth/RegisterForm.tsx` 삭제(import 0건 확인) |
| (확신 낮음 항목) | 국세청 확인 `DEMO_KEY` | `functions/api/verify-business.ts` — `env.DATA_GO_KR_API_KEY`가 있으면 그 키로 조회, 없으면 기존 DEMO_KEY(→홈택스 폴백). 화면 문구도 "국세청 조회에서도 영업 중으로 나옵니다"로 근거 수준에 맞춤. 아이폰 HEIC 거부 시 안내 문구 추가 |

## 2. 뒤로 미룬 항목

| id | 이유 |
|---|---|
| r1-01-07 · r1-02-04 | 설정 화면(SettingsPage)은 G 소유. 로그인 화면 한 줄 안내만 했다 |
| r1-01-08 (실제 삭제) | Auth·Firestore·Storage를 함께 지우는 서버 함수(관리자 SDK)가 필요 — 새 엔드포인트는 이번 범위 밖. 지금은 카카오톡으로 탈퇴 요청 → 운영자가 콘솔에서 처리. 설정 화면의 「탈퇴 요청」 버튼은 G에 요청 |
| r1-01-12 (Sidebar 로그아웃 32px 아이콘) | `Sidebar.tsx` 미소유 |
| r1-08-12 (거절 문자 알림) | `functions/api/notify/rejected.ts`·`src/services/notify.ts`가 소유 밖. 대신 로그인 화면에 사유가 뜬다 |
| r1-08-13 (랜딩 556행 "변호사 인증 후 사용") | `LandingPage.tsx` 미소유 |
| r1-08-14 (플랜 수동 변경·전체 회원 탭) | 규칙상 admin write로 plan 변경은 가능하나 화면 설계(만료일 입력·결제기록 정합)가 E 소유 결제 흐름과 얽혀 이번엔 뺐다 |
| r2-02 useAuth.ts:103-105 (로그인 복원 실패가 로그아웃처럼 보임) | 오류를 화면까지 올리려면 AppLayout 등 공용 컴포넌트가 필요. 다음 차례 |

## 3. 새로 발견한 문제

- `src/hooks/useAuth.ts`의 `ProfileSetupData`가 `src/services/firebase/auth.ts`의 같은 이름 인터페이스를 복제하고 있다. 이번에 필드 하나 추가하다 한쪽만 고쳐 tsc가 잡았다. 한쪽을 `import type`으로 바꾸는 게 맞다(다음 정리 때).
- `SettingsPage.tsx:503` 계정 상태가 `pending/rejected` 영어 그대로 — G 소유(r1-08 C-37).
- 승인 문자는 `phone`이 없으면 조용히 `sent:false`다. 이제 프로필에서 휴대폰 형식을 검사하므로 새 가입자는 문제없지만, 관리자 카드에 "휴대폰 없음(승인 문자 불가)"를 표시해 두었다.
- 기존 `approved` 회원 문서에는 `verified` 필드가 없어 전원이 「등록번호 확인」 탭에 뜬다 — 의도된 동작(실제로 대조가 안 된 회원들). 한 번 정리하면 끝난다.
- `DATA_GO_KR_API_KEY`는 `health.ts`에서도 읽으므로 Pages 시크릿에 이미 있을 가능성이 높다. 없으면 국세청 조회는 종전처럼 홈택스 폴백으로 간다(가입은 막히지 않음).

## 4. F에 요청할 규칙 변경 (firestore.rules `users`)

코드는 아래 전제로 짰다. 어긋나면 알려 달라.

1. **create**. 현재 `status in ["pending","approved"]` 유지 요청. OCR로 변호사업이 읽힌 신규 회원은 클라이언트가 `approved`로 만든다(즉시 이용). 만약 F가 create를 `pending` 고정으로 바꾸면 `services/firebase/auth.ts:131`의 `isApproved` 계산과 ProfileSetup의 "제출하면 바로 시작됩니다" 문구를 같이 바꿔야 하니 결정을 공유해 달라.
2. **self update — pending→approved 차단**(F 진행 중인 방향 그대로). 코드는 기존 문서가 있으면 항상 `pending`을 쓴다.
3. **self update — rejected→pending 허용**. 조건 제안. `resource.data.status == "rejected" && request.resource.data.status == "pending" && request.resource.data.profileCompleted == true`. 이때 본인이 바꾸는 필드는 name·firmName·barLicenseNumber·phone·officePhone·privacyConsented(+At)·business*(10개)·businessLicenseUrl·noBusinessLicense·profileCompleted·status. **rejectedReason/rejectedAt/rejectedBy는 본인이 건드리지 않는다**(관리자 승인·되돌리기 때만 null로 씀).
4. **self update — pending→pending**(대기 중 재제출)도 같은 필드 범위로 허용해 달라. 현재 규칙의 `status == status` 분기로 이미 통과할 것으로 본다.
5. **verified**는 본인이 못 쓴다(현행 56행 유지). `noBusinessLicense`는 본인이 쓴다.
6. **admin write**. 현행(role·status 값만 검사)으로 `approvedAt/approvedBy/verified*/rejectedReason/rejectedAt/rejectedBy` 쓰기·null 처리가 모두 통과한다. 변경 불필요.
7. **storage.rules** `business-registrations/{uid}`. 거절 회원의 재업로드는 소유자 write로 이미 허용. 변경 불필요.
8. **firestore.indexes.json**. pending·rejected 조회는 기존 `(status, role, createdAt)` 색인을 쓴다. 추가 색인 불필요.

## 5. 수정 파일

- `src/App.tsx` (RequirePending: rejected → /login)
- `src/pages/LoginPage.tsx`, `src/components/auth/LoginForm.tsx` (거절 카드·오류·문의 링크·`SupportLinks` 공용 컴포넌트)
- `src/pages/PendingPage.tsx`, `src/components/auth/PendingScreen.tsx`
- `src/pages/ProfileSetupPage.tsx`
- `src/pages/AdminPage.tsx`
- `src/hooks/useAuth.ts` (`refreshUser`, `noBusinessLicense`)
- `src/services/firebase/auth.ts` (오류 매핑, 재신청 update 경로, pending 규칙)
- `src/services/firebase/firestore.ts` — 관리자 사용자 함수만: `getUnverifiedUsers` 수정, `getPendingUsers`·`getRejectedUsers`·`approveUser`·`rejectUser`(구 `deactivateUser`)·`restoreUserToPending` 추가. 다른 함수는 손대지 않음
- `src/types/user.ts` (`verified*`, `rejected*`, `noBusinessLicense`)
- `functions/api/notify/approved.ts` (문자 본문만)
- `functions/api/verify-business.ts` (환경변수 키 사용)
- 삭제. `src/components/auth/RegisterForm.tsx`
- `src/pages/RegisterPage.tsx`, `src/services/business-verify.ts` — 읽었으나 변경 없음

## 6. 검증

- `npx tsc --noEmit -p tsconfig.app.json` — **내 소유 파일 오류 0**. 다른 흐름 파일에서 남은 오류(보고만). `src/components/cases/ScheduleTab.tsx:62,105`, `src/pages/CalendarPage.tsx:12`(`done` 누락), `src/pages/DocumentPage.tsx:796`, `src/services/rtzr.ts:68`.
- `npx tsc --noEmit -p functions/tsconfig.json` — `verify-business.ts`·`notify/approved.ts` 오류 0(다른 파일 오류는 타 흐름).
- `npx eslint <수정 파일 15개>` — 오류 0, 경고 0.
- 관련 단위 테스트 없음(`src/__tests__`에 auth·admin 대상 파일 없음). 빌드·배포·규칙 배포는 지시대로 하지 않았다.
