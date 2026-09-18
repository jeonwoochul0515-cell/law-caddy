# 기한·일정·캘린더·대시보드 알림 점검 (2026-09-17)

## 읽은 파일
- `src/pages/CalendarPage.tsx`
- `src/components/cases/ScheduleTab.tsx`
- `src/types/deadline.ts`
- `src/pages/DashboardPage.tsx`
- `src/services/firebase/firestore.ts` (523~627행, deadlines 섹션)
- `firestore.rules` (181~189행, deadlines 규칙)
- `src/services/notifications.ts`
- `src/components/layout/NotificationBell.tsx`
- `src/components/accounting/OverdueAlertPanel.tsx`
- `src/components/dashboard/DashboardStats.tsx`

## 발견

### 1. 기한 알림이 화면(알림 벨)에만 뜨고, 문자·메일 등 제품 밖으로는 절대 안 나간다
- 심각도: 위험
- 어디서: 헤더 알림 벨
- 무슨 일이: 항소기간이 지연 상태가 돼도 `getDeadlineNotifications`는 Firestore를 조회해 화면에만 뱃지를 띄운다. 앱을 열지 않으면 김 변호사는 절대 모른다. 주말에 사무실 PC를 켜지 않으면 항소기간이 지나가도 알 방법이 없다.
- 근거: `src/services/notifications.ts:32-61` (`getDeadlineNotifications` — Firestore 조회 후 `NotificationItem[]` 반환, 문자·이메일·푸시 발송 코드 없음). `src/components/layout/NotificationBell.tsx:27-49` — `useEffect`가 마운트 시 1회, 드롭다운을 열 때만 갱신. 서비스워커·FCM 코드는 `src/config/firebase.ts`에 `messagingSenderId` 설정값만 있고 실제 `firebase/messaging` import나 알림 구독 코드는 전체 검색에서 없음(`search` 결과 0건).
- 고칠 방향: 불변기간(항소기간 등) D-3 이내 항목은 SMS/카카오 알림톡으로도 발송한다.

### 2. 기한을 「완료」로 표시하는 버튼이 ScheduleTab 어디에도 없다 — `done`·`doneAt`은 타입에만 있고 쓰는 UI가 없다
- 심각도: 답답
- 어디서: 사건 상세 > 일정 관리 탭
- 무슨 일이: 답변서를 실제로 제출해도 완료 처리할 방법이 없다. 목록에 수정(연필)·삭제(휴지통) 버튼만 있고 완료 체크 버튼이 없다. `calcStatus(dDay, d.done)`는 `done`이 true일 때 "완료" 배지를 보여주지만, `done`을 true로 만드는 UI 액션 자체가 존재하지 않는다(생성·수정 폼에도 `done` 필드 입력란 없음).
- 근거: `src/components/cases/ScheduleTab.tsx:413-431` — 렌더링되는 버튼은 `title="기한 수정"`(416행)과 `title="기한 삭제"`(426행)뿐. `src/components/cases/ScheduleTab.tsx:190-208` (`handleSubmit`) — `updateDeadline`·`createDeadline` 호출 데이터에 `done`/`doneAt` 필드가 전혀 없음. `src/types/deadline.ts:46-48` — `done?`, `doneAt?` 필드는 정의만 있음.
- 고칠 방향: 목록 항목에 체크박스나 "완료 처리" 버튼을 추가해 `updateDeadline(id, { done: true, doneAt: toYmd(new Date()) })`를 호출한다.

### 3. `history`(변경 이력) 필드는 타입에만 있고, 쌓지도 보여주지도 않는다
- 심각도: 답답
- 어디서: 사건 상세 > 일정 관리 탭 (기한 수정 시)
- 무슨 일이: 김 변호사가 법원 직권으로 기일이 변경돼 날짜를 고쳐도, "언제 무엇에서 무엇으로 왜 바뀌었는지" 기록이 전혀 남지 않는다. `history` 필드는 있지만 `updateDeadline` 호출부 어디에도 `history` 배열을 채우는 코드가 없다.
- 근거: `src/types/deadline.ts:49-50` — `history?: DeadlineChange[]` 정의. `src/components/cases/ScheduleTab.tsx:190-198` — `updateDeadline(editingId, { title, dueDate, category, baseDateLabel, rule })` 호출에 `history` 갱신 코드 없음. 전체 저장소에서 `history:` 대입 검색 결과 0건(`search` `history` in `src/services/firebase/firestore.ts` 결과 없음).
- 고칠 방향: `updateDeadline`이 날짜가 바뀔 때 이전 `dueDate`를 `history`에 append하고, ScheduleTab에 "변경 이력 보기"를 추가한다.

### 4. `computeDueDate`는 토·일만 넘기고 공휴일은 안 넘기는데, 이 함수는 애초에 어느 화면에서도 호출되지 않는다 — 법정 기간 프리셋 UI 자체가 없다
- 심각도: 막힘
- 어디서: 사건 상세 > 일정 관리 탭 (새 기한 추가)
- 무슨 일이: `LEGAL_PERIOD_PRESETS`(항소 14일, 상고 14일 등 정확한 법정 기간 목록)와 `computeDueDate`(기산일+기간→마감일 자동계산)가 타입 파일에 정의돼 있는데, 이를 불러 쓰는 화면 컴포넌트가 없다. 기한 추가 폼은 `formDueDate`를 사용자가 직접 `<input type="date">`로 입력해야 하고(482행), "기산일 + 며칠"을 넣으면 계산해 주는 기능이 없다. 즉 김 변호사가 "판결정본 송달일이 3/2니까 항소기간은?"을 스스로 암산해서 날짜 입력칸에 직접 써넣어야 한다 — 계산 실수 위험이 그대로 남는다.
- 근거: `src/types/deadline.ts:80-109` (`LEGAL_PERIOD_PRESETS` 정의), `src/types/deadline.ts:137-149` (`computeDueDate` 정의). `computeDueDate`/`LEGAL_PERIOD_PRESETS` 전체 저장소 검색(`src/components`, `src/pages`, `src/hooks`) 결과 0건 — import하는 곳이 없다. `src/components/cases/ScheduleTab.tsx:470-483` — 폼은 `type="date"` 수동 입력뿐.
- 고칠 방향: 기한 추가 폼에 "법정 기간으로 계산" 옵션을 넣어 `LEGAL_PERIOD_PRESETS`에서 선택 → 기산일 입력 → `computeDueDate` 결과를 `formDueDate`에 채운다. 공휴일 미반영 한계는 안내 문구로 명시한다(현재는 계산 자체를 쓸 수 없어 문구조차 무의미).

### 5. `computeDueDate`가 실제로 쓰였다면 나왔을 안내와 달리, 지금 화면 안내문은 "이미 계산된 결과"인 것처럼 공휴일 한계를 설명한다 — 실제로는 사용자가 직접 입력한 날짜라 이 안내 자체가 상황에 안 맞다
- 심각도: 말
- 어디서: 사건 상세 > 일정 관리 탭 하단 안내 문구
- 무슨 일이: "공휴일 및 토요일이 만료일인 경우 다음 영업일로 연장될 수 있으니…"라는 문구가 상시 노출된다. 그런데 이 문구는 `computeDueDate` 자동계산을 전제로 한 설명인데(발견 4번), 실제로는 자동계산 기능 자체가 화면에 없고 날짜를 직접 입력하므로 이 안내가 뜬금없다. 초보 사용자는 "시스템이 뭔가 자동으로 보정해준다"고 오해할 수 있다.
- 근거: `src/components/cases/ScheduleTab.tsx:554-558` (`지연·임박·예정 상태는 오늘 날짜 기준으로 자동 계산됩니다. 공휴일 및 토요일이 만료일인 경우 다음 영업일로 연장될 수 있으니...`).
- 고칠 방향: 날짜 직접 입력 폼 옆에 "공휴일은 자동 반영되지 않으니 대법원 홈페이지 등에서 직접 확인하세요"로 입력 시점 경고로 바꾼다.

### 6. 대시보드 화면에는 기한 지연 건수 카드/숫자가 아예 없다 — "누르면 이동하는지" 이전에 표시 자체가 없다
- 심각도: 답답
- 어디서: 대시보드
- 무슨 일이: 대시보드에는 "지연 알림" 위젯이 `OverdueAlertPanel`(분할납부 연체) 하나뿐이고, 기한(항소기간 등) 지연 건수를 보여주는 카드나 위젯이 없다. `DashboardStats`도 매출·사건유형·전환율만 보여주고 기한 관련 통계는 없다. 김 변호사가 대시보드만 보고는 오늘 지연된 기한이 몇 건인지 전혀 알 수 없고, 지연 기한을 확인하려면 별도로 캘린더 메뉴로 들어가야 한다.
- 근거: `src/pages/DashboardPage.tsx:1-13` — import 목록에 `FinanceSummaryWidget`, `OverdueAlertPanel`(분할납부 연체), `DashboardStats`, `OnboardingGuide`만 있고 기한/일정 관련 컴포넌트 import 없음. `src/pages/DashboardPage.tsx` 전체에서 "지연" 검색 결과 0건, `deadline` 검색 결과 0건. 캘린더 페이지(`CalendarPage.tsx:142-149`)에만 지연 경고 배너가 있다.
- 고칠 방향: 대시보드에 "지연된 기한 N건" 카드를 추가하고 클릭 시 `/calendar`로 이동시킨다.

### 7. (캘린더 화면 자체의) 지연 경고 배너는 있지만 클릭해도 반응이 없다 — 개별 항목이 아니라 배너 전체가 버튼이 아니다
- 심각도: 답답
- 어디서: 일정 캘린더 상단 지연 경고 배너
- 무슨 일이: "지연된 기한 N건"이라는 빨간 배너가 뜨지만 이 배너 자체는 `<div>`이지 클릭 가능한 버튼이 아니다. 개별 기한을 보려면 아래 달력이나 목록에서 직접 찾아 눌러야 한다. 지연 건이 여러 사건에 흩어져 있으면 배너를 눌러 필터링하는 게 자연스러운데 그 경로가 없다.
- 근거: `src/pages/CalendarPage.tsx:142-150` — `<div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-error/10...">` 로 시작하며 `onClick` 핸들러 없음.
- 고칠 방향: 배너를 버튼화해 지연 목록으로 스크롤하거나 필터를 "지연"으로 전환한다.

### 8. 달력 월 이동 시 재조회를 안 한다 — 한 번에 전체를 불러온 뒤 클라이언트에서만 필터링
- 심각도: 답답 (데이터량이 커지면 위험으로 격상 가능)
- 어디서: 일정 캘린더
- 무슨 일이: `moveMonth`는 `viewMonth` 상태만 바꾸고, `load()`(Firestore 조회)는 컴포넌트 마운트 시 1회만 호출된다. 지금은 `getAllDeadlines`가 전체 기한을 한 번에 가져와 클라이언트에서 월별 필터링하므로 "다른 달 기한이 안 보이는" 문제는 없지만, 기한이 수백~수천 건 쌓이면 매번 전체 컬렉션을 읽어오는 구조라 느려지고, 캘린더 진입 후 새로 등록된 기한은 페이지를 새로고침하지 않는 한 안 보인다.
- 근거: `src/pages/CalendarPage.tsx:64-70` (`useEffect(() => { load(); }, [load])` — `load`의 의존성은 `[user]`뿐, `viewMonth`가 없음). `src/pages/CalendarPage.tsx:130-132` (`moveMonth`는 `setViewMonth`만 호출, `load` 재호출 없음).
- 고칠 방향: 당장은 문제 없지만, 기한이 쌓일 사무소 특성상(연 수십~수백 건) 월별 쿼리로 전환하거나 최소한 캘린더 재진입 시 재조회를 추가한다.

### 9. 기한이 0건일 때 캘린더 목록은 다음 행동을 안내하지만, ScheduleTab의 "전체 필터 0건"과 "다른 필터 0건" 안내가 뒤섞여 있다
- 심각도: 말
- 어디서: 사건 상세 > 일정 관리 탭
- 무슨 일이: 기한이 아예 없을 때는 "등록된 기한이 없습니다. 아래 버튼으로 기한을 추가하세요"로 잘 안내되지만(발견 없음, 정상), 필터("지연"/"임박"/"예정")를 눌러 해당 조건에 0건일 때는 "해당 조건의 기한이 없습니다"만 뜨고 "전체 보기로 돌아가라"는 다음 행동 안내가 없다. 초보 사용자는 필터를 누른 채로 "기한이 다 사라졌다"고 오인할 수 있다.
- 근거: `src/components/cases/ScheduleTab.tsx:344-351` — `deadlines.length === 0 ? "등록된 기한이 없습니다..." : "해당 조건의 기한이 없습니다"` — 후자 분기에 다음 행동 문구 없음.
- 고칠 방향: "해당 조건의 기한이 없습니다. [전체 보기]" 버튼을 함께 제공한다.

### 10. 캘린더 달력 칸의 항목 글자가 11px로 표시된다 — 390px 폭 휴대폰에서 의뢰인 이름+제목이 거의 다 잘려 title 툴팁에만 의존한다
- 심각도: 답답
- 어디서: 일정 캘린더 달력 그리드
- 무슨 일이: 달력 칸 하나는 7분할 그리드라 390px 화면에서 칸 폭이 약 55px 안팎이다. 그 안에 `text-[11px]`로 "의뢰인명 + 제목"을 `truncate`로 넣으므로 실제로는 이름 두세 글자만 보이고 나머지는 잘린다. 내용은 `title` 속성(마우스오버 툴팅)에만 있는데, 터치 기기에는 호버가 없어 무엇이 잘렸는지 확인할 방법이 없다.
- 근거: `src/pages/CalendarPage.tsx:220-226` (`className="w-full text-left px-1.5 py-0.5 rounded border text-[11px] leading-tight truncate..."`, `title={...}`). 버튼 자체 높이도 `py-0.5`(상하 2px 패딩)라 44px 터치 타깃 기준에 크게 못 미친다 — 실측 높이는 텍스트 11px + 패딩 4px 안팎으로 20px 미만.
- 고칠 방향: 모바일 폭에서는 달력 칸 내부 텍스트 대신 점(dot) 표시로 바꾸고, 하단 "이번 달 목록"으로 상세를 보게 유도한다.

### 11. 기한 저장 실패 시 폼이 열린 채로 화면 상단에만 에러 문구가 뜬다 — 조용한 실패는 아니지만, 입력값이 사라질 위험은 없는지 확인 필요
- 심각도: 답답
- 어디서: 사건 상세 > 일정 관리 탭 (기한 추가/수정)
- 무슨 일이: `handleSubmit` 실패 시 `setError(...)`로 에러 문구를 세팅하지만, 폼은 안 닫히고(`resetForm()`은 성공 시에만 호출) 입력값도 그대로 남는다. 이 자체는 안전하지만, 에러 문구가 뜨는 위치(347행 부근, 필터 버튼 위)가 폼(479행 부근)과 멀리 떨어져 있어, 폼을 스크롤해 채우던 중이면 상단 에러 메시지를 못 보고 "왜 저장이 안 되지"하며 등록 버튼을 계속 누를 수 있다.
- 근거: `src/components/cases/ScheduleTab.tsx:184-211` (`handleSubmit`의 catch에서 `setError` 호출, `resetForm()`은 try 블록 성공 경로에서만 호출됨). `src/components/cases/ScheduleTab.tsx:284-289` (에러 표시 위치 — 필터 위쪽), `src/components/cases/ScheduleTab.tsx:461-536`(폼 위치, 훨씬 아래).
- 고칠 방향: 폼 내부에도 에러 메시지를 표시하거나, 에러 발생 시 폼으로 스크롤 이동시킨다.

### 12. `calcDDay`는 자정 로컬 기준으로 계산되지만, `new Date(\`${dueDate}T00:00:00\`)`가 브라우저 로컬 타임존에 의존해 타임존이 다른 기기에서 열면 하루가 밀릴 수 있다 (추측 성격 강함, 낮은 확신)
- 심각도: 위험
- 어디서: 캘린더/일정 탭 D-Day 계산 전반
- 무슨 일이: `calcDDay`는 `dueDate`를 `T00:00:00`(타임존 명시 없음)으로 파싱해 브라우저 로컬 자정으로 해석하고, `now`도 로컬 `Date`로 만들어 같은 로컬 자정 기준으로 뺀다. 사무실 PC와 휴대폰이 모두 한국 로컬 타임존이면 안전하지만, OS 시간대 설정이 잘못되어 있거나(예: UTC로 설정된 공용 PC) 해외 서버·VPN을 쓰는 경우 자정 경계에서 하루가 밀릴 수 있다. 같은 파일 내 `computeDueDate`의 `parseYmd`도 동일한 패턴을 쓴다.
- 근거: `src/types/deadline.ts:57-61` (`calcDDay` — `new Date(\`${dueDate}T00:00:00\`)`, `Math.round((today.getTime() - due.getTime()) / 86_400_000)`), `src/types/deadline.ts:126-128` (`parseYmd`도 동일 패턴).
- 고칠 방향: 정상적인 로컬 사용 환경에서는 문제가 재현되지 않으므로 낮은 우선순위. OS 시간대 설정 오류 시나리오는 "확신이 낮은 항목"으로 분류.

## 확신이 낮은 항목
- 발견 12번(`calcDDay` 타임존 문제)은 코드상 이론적 결함이지 실제 재현 시나리오(OS 타임존이 KST가 아닌 경우)를 직접 확인한 것은 아니다 — 추측.
- FCM/푸시 알림이 정말 프로젝트 어디에도 없는지는 `src/config/firebase.ts`의 `messagingSenderId` 설정값 외에 `firebase/messaging` 관련 코드를 전체 검색해 없음을 확인했으나, 빌드 설정(`vite.config.ts` 등)이나 Cloudflare Pages Functions 쪽에 별도 발송 로직이 있을 가능성은 이 점검 범위(지정 파일 + firestore) 밖이라 완전히 배제하지는 못한다.
- 발견 8번(달력 재조회 부재)은 현재 데이터량에서는 사용자가 체감하지 못할 수 있어 "위험"이 아닌 "답답"으로 낮춰 잡았다 — 사무소의 실제 기한 등록량에 따라 체감 심각도가 달라질 수 있다.
