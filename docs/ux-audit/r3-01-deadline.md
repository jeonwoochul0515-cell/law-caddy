# 기한·일정·캘린더·대시보드 알림 점검 (2026-09-17)

## 읽은 파일
- `src/pages/CalendarPage.tsx`
- `src/components/cases/ScheduleTab.tsx`
- `src/types/deadline.ts`
- `src/pages/DashboardPage.tsx`
- `src/services/firebase/firestore.ts` (Deadlines 구역, 523~625)
- `src/services/notifications.ts`
- `src/components/layout/NotificationBell.tsx`
- `src/components/layout/Header.tsx`
- `src/pages/CaseDetailPage.tsx` (탭 상태 부분)
- `src/components/accounting/OverdueAlertPanel.tsx` (대시보드 "연체 알림"의 정체 확인용)
- `src/utils/friendlyError.ts`
- `src/utils/localDate.ts`
- `src/config/demo.ts`
- `src/components/layout/Sidebar.tsx` (일정 캘린더 진입 경로 확인)
- `firestore.rules` (deadlines 구역, 181~190)

---

## 발견

### 1. 기한을 「완료」로 표시할 버튼이 어디에도 없다 — 제출을 끝내도 영원히 빨간 「지연」
- 심각도: 막힘
- 어디서: 사건 상세 > 일정 관리 탭
- 무슨 일이: 답변서를 실제로 법원에 내고 왔는데도 그 기한은 계속 빨간 「지연」 배지로 남는다. 체크 표시를 할 자리가 화면에 없다. 지연 건수는 날마다 늘기만 하고 줄지 않는다.
- 근거: 타입에는 완료 필드가 있다 — `src/types/deadline.ts:45-48` (`/** 처리 완료 여부 — true면 지연·임박 집계와 알림에서 제외 */ done?: boolean;`). 상태 계산도 완료를 받아 처리한다 — `src/types/deadline.ts:67-68` (`export function calcStatus(dDay: number, done = false)` / `if (done) return "done";`). 화면은 읽기만 한다 — `src/components/cases/ScheduleTab.tsx:234`, `src/pages/CalendarPage.tsx:77`. 그런데 `done`을 **저장하는** 코드가 저장소에 없다. 수정 저장은 이 한 곳뿐이고 보내는 값은 다섯 개다 — `src/components/cases/ScheduleTab.tsx:191-198` (`await updateDeadline(editingId, { title, dueDate, category, baseDateLabel, rule })`). 필터에도 「완료」가 없다 — `src/components/cases/ScheduleTab.tsx:133`, `:296-303`. 완료 배지 색·라벨은 이미 준비돼 있으나 도달할 수 없다 — `src/components/cases/ScheduleTab.tsx:70-77`, `:110-111`.
- 고칠 방향: 기한 카드에 체크 버튼을 달아 `updateDeadline(id, { done: true, doneAt: localDateStr() })`를 호출하고, 필터에 「완료」를 추가한다.

### 2. 항소기간 자동계산이 코드에만 있고 화면에 연결돼 있지 않다 — 불변기간을 손으로 세야 한다
- 심각도: 막힘
- 어디서: 사건 상세 > 일정 관리 탭 > [기한 추가]
- 무슨 일이: 판결정본을 오늘 받았다. 항소기한이 며칠인지 앱이 계산해 주지 않는다. 폼에는 「마감일」 날짜칸 하나뿐이라, 달력을 직접 세어 날짜를 찍어 넣어야 한다. 하루를 잘못 세면 항소가 각하된다.
- 근거: 법정기간 12종이 이미 정의돼 있다 — `src/types/deadline.ts:97-110` (`{ key: "appeal_civil", label: "항소 — 민사 (14일)", days: 14, basis: "민사소송법 §396 ①", baseLabel: "판결정본 송달일" }` 등). 초일불산입·토일 이월 계산 함수도 있다 — `src/types/deadline.ts:137-151` (`export function computeDueDate(baseDate: string, days: number): DueDateResult`). 그러나 저장소 전체에서 `computeDueDate`·`LEGAL_PERIOD_PRESETS`를 import하는 파일은 **정의 파일 자신 외에 하나도 없다**. 일정 탭의 import 목록에도 없다 — `src/components/cases/ScheduleTab.tsx:26-33` (`DEADLINE_CATEGORIES, calcDDay, calcStatus` 세 개만 가져온다). 폼의 마감일 입력은 맨손 날짜 입력이다 — `src/components/cases/ScheduleTab.tsx:475-484`.
- 고칠 방향: 폼에 「법정기간으로 계산」 모드를 넣어 프리셋 선택 + 기산일 입력 → `computeDueDate` 결과를 마감일에 채우고, `rolledOver`가 true면 "말일이 토·일이라 ○일로 넘겼습니다"를 함께 보여 준다.

### 3. 기한을 고치면 원래 날짜가 흔적 없이 사라진다 — 변경 이력이 저장도 표시도 안 된다
- 심각도: 위험
- 어디서: 사건 상세 > 일정 관리 탭 > 연필(수정)
- 무슨 일이: 기일이 변경돼 날짜를 고쳤다. 원래 기일이 언제였는지, 왜 바뀌었는지 앱에서 다시 볼 수 없다. 날짜를 잘못 찍어 저장한 경우에도 되돌릴 근거가 없다.
- 근거: 이력 타입이 있고 주석은 "이전 값은 지우지 않고 여기에 쌓는다"라고 한다 — `src/types/deadline.ts:14-27` (`DeadlineChange`: `changedAt`/`fromDueDate`/`toDueDate`/`fromTime`/`fromLocation`/`reason`), `src/types/deadline.ts:49-50` (`history?: DeadlineChange[];`). 그런데 `history`를 쓰는 코드가 저장소에 없다. 수정 저장은 `dueDate`를 그대로 덮어쓴다 — `src/components/cases/ScheduleTab.tsx:191-198`. 목록 렌더링에도 이력 표시가 없다 — `src/components/cases/ScheduleTab.tsx:370-412`.
- 고칠 방향: `dueDate`가 바뀌는 수정에서 `history`에 변경 전 값과 사유를 append하고, 카드에 "기일 변경 이력 N건"을 펼쳐 볼 수 있게 한다.

### 4. 알림 집계가 실패해도 벨은 「새 알림이 없습니다」로 보인다
- 심각도: 위험
- 어디서: 화면 오른쪽 위 알림 벨
- 무슨 일이: 벨에 빨간 숫자가 없다. 눌러 보면 초록 체크와 함께 "새 알림이 없습니다"가 뜬다. 김 변호사는 "오늘 급한 게 없구나" 하고 닫는다. 실제로는 조회가 실패했을 뿐이고, 지연된 항소기한이 있어도 화면은 똑같다.
- 근거: 소스별 실패를 빈 배열로 삼킨다 — `src/services/notifications.ts:148-152` (`getDeadlineNotifications(user.uid).catch(() => [])`). 최종 실패도 조용히 넘긴다 — `src/components/layout/NotificationBell.tsx:39-41` (`.catch(() => { // 집계 실패 시 뱃지 없이 조용히 넘어감 })`). 실패 상태를 담는 state가 없어 화면에 아무 표시도 남지 않고, 빈 목록과 실패가 같은 화면으로 수렴한다 — `src/components/layout/NotificationBell.tsx:104-107`. 지연 기한을 상시로 알려 주는 경로가 이 벨 하나뿐이라(아래 7번) 대가가 크다.
- 고칠 방향: 집계 실패 시 "알림을 불러오지 못했습니다 · 다시 시도" 줄을 드롭다운에 띄운다. "없음"과 "못 불러옴"을 절대 같은 화면으로 보이지 않게 한다.

### 5. 처리가 끝난 기한이 알림 벨에 영원히 쌓인다 — 진짜 급한 건이 파묻힌다
- 심각도: 위험
- 어디서: 알림 벨 드롭다운
- 무슨 일이: 작년에 끝난 사건의 기한이 「기한 지연: 답변서 제출 / 312일 경과」로 계속 뜬다. 지우거나 읽음 처리할 방법이 없다. 벨 숫자는 곧 "9+"에 붙박이고, 내일이 마감인 항소기한이 그 더미 속에 묻힌다.
- 근거: 알림 집계가 `done`을 전혀 보지 않는다 — `src/services/notifications.ts:38-49`. 읽음 처리 수단이 없다 — 클릭은 이동만 한다(`src/components/layout/NotificationBell.tsx:68-71`), 목록은 매번 Firestore에서 새로 계산된다(`src/services/notifications.ts:32-35`). 뱃지는 9에서 멈춘다 — `src/components/layout/NotificationBell.tsx:88`. 1번(완료 표시 UI 없음)과 맞물려 빠져나갈 길이 없다.
- 고칠 방향: 집계에서 `if (d.done) continue`를 넣고, 지연 알림에 기간 상한(예: D+60 초과는 접기)을 둔다.

### 6. D-Day가 자정을 넘겨도 갱신되지 않는다 — 어제 숫자를 오늘 아침에 본다
- 심각도: 위험
- 어디서: 일정 캘린더
- 무슨 일이: 퇴근하며 사무실 PC에 일정 캘린더를 켜 두고 갔다. 다음 날 아침에 보면 오늘이 마감인 기한이 여전히 「D-1」이고, 오늘 날짜 강조 칸은 어제에 남아 있다. 하루 여유가 있다고 잘못 읽는다.
- 근거: 오늘 날짜를 한 번만 계산한다 — `src/pages/CalendarPage.tsx:112-115` (의존성 배열이 비어 있다). D-Day도 데이터가 바뀔 때만 다시 센다 — `src/pages/CalendarPage.tsx:70-82` (`useMemo(..., [deadlines, caseNames])`). 자동 새로고침 타이머가 없다 — `src/pages/CalendarPage.tsx:66-68`. 오늘 칸 강조도 그 굳은 값을 쓴다 — `src/pages/CalendarPage.tsx:202`.
- 고칠 방향: 자정 타이머 또는 `visibilitychange`에서 오늘 날짜와 `load()`를 다시 돌리고, 화면에 "○시 기준"을 적는다.

### 7. 삭제 확인창이 어느 기한인지 말해 주지 않는다 — 지우면 끝이다
- 심각도: 위험
- 어디서: 사건 상세 > 일정 관리 탭 > 휴지통
- 무슨 일이: 작은 회색 아이콘 두 개(연필·휴지통)가 2px 간격으로 붙어 있다. 수정을 누르려다 삭제를 누른다. 뜨는 창은 "이 기한을 삭제하시겠습니까?" 한 줄뿐이라 어느 기한인지 모른 채 확인을 누른다. 항소기한이 사라진다. 되돌릴 방법이 없다.
- 근거: 확인 문구에 제목·날짜가 없다 — `src/components/cases/ScheduleTab.tsx:219` (`if (!confirm("이 기한을 삭제하시겠습니까?")) return;`). 버튼은 `p-1.5` + `w-4 h-4` ≈ 28px이고 평상시 색이 25% 불투명도, 간격은 `gap-0.5` — `src/components/cases/ScheduleTab.tsx:414-430`. 되돌리기가 없고 이력에도 안 남는다(3번).
- 고칠 방향: 확인 문구에 제목과 날짜를 넣고("「답변서 제출기한」(10월 2일)을 삭제할까요?"), 삭제 버튼을 44px 이상으로 키우고 수정 버튼과 간격을 벌린다.

### 8. 「진행 중 기한」 카드 숫자와 「임박」 필터 결과가 다르다
- 심각도: 위험
- 어디서: 사건 상세 > 일정 관리 탭 상단 요약 카드
- 무슨 일이: 카드에 「진행 중 기한 5건」이라고 떠 있어 아래 「임박」을 누르면 2건만 나온다. 나머지 3건이 어디로 갔는지 알 수 없다. 숫자를 못 믿게 된다.
- 근거: 카드는 임박+예정을 합산한다 — `src/components/cases/ScheduleTab.tsx:241-243`, 라벨은 "진행 중 기한" — `:260-261`. 필터는 임박만 남긴다 — `src/components/cases/ScheduleTab.tsx:238`, 버튼 정의 `:296-303`. 「이번 주 마감」은 상태를 아예 안 본다 — `src/components/cases/ScheduleTab.tsx:244`. 카드는 클릭도 안 되어 대조할 방법이 없다 — `src/components/cases/ScheduleTab.tsx:566-596`.
- 고칠 방향: 카드를 누르면 그 집합이 그대로 걸리는 필터로 연결하고, 라벨을 집합과 일치시킨다.

### 9. 대시보드 첫 화면에 기한이 하나도 없다
- 심각도: 답답
- 어디서: 대시보드 ("오늘의 업무 현황")
- 무슨 일이: 아침에 로그인해 대시보드를 본다. 전체 사건·진행중·생성 문서·상담 녹음 숫자만 있다. 지연된 기한이 몇 건인지 여기서는 알 수 없다.
- 근거: 통계 카드 네 개에 기한이 없다 — `src/pages/DashboardPage.tsx:191-196`. 데이터 로딩에서 deadlines 컬렉션을 조회하지 않는다 — `src/pages/DashboardPage.tsx:47-90`. 대시보드의 「연체 알림」은 기한이 아니라 분할납부 연체다 — `src/pages/DashboardPage.tsx:301`, `src/components/accounting/OverdueAlertPanel.tsx:223-225`. 통계 카드 네 개도 `<div>`라 눌러도 아무 데도 안 간다 — `src/pages/DashboardPage.tsx:219-232`.
- 고칠 방향: 통계 카드에 「지연 기한 N건」(빨강)을 추가하고, 누르면 `/calendar`로 보낸다.

### 10. 「지연된 기한 N건」 배너를 눌러도 아무 일이 없고, 지난달 것은 목록에서 사라진다
- 심각도: 답답
- 어디서: 일정 캘린더 맨 위 빨간 띠
- 무슨 일이: "지연된 기한 5건"이 보여 눌렀는데 반응이 없다. 띠에는 앞 2건만 적혀 있고 "외 3건"이다. 그 3건을 보려면 달을 하나씩 뒤로 넘기며 찾아야 하는데, 어느 달에 있는지는 아무도 알려 주지 않는다.
- 근거: 배너가 `<div>`이고 onClick이 없다 — `src/pages/CalendarPage.tsx:143-152`. 본문은 앞 2건만 — `:148-149`. 아래 목록은 보고 있는 달만 필터링한다 — `src/pages/CalendarPage.tsx:118-123`.
- 고칠 방향: 배너를 버튼으로 바꿔 누르면 달 구분 없이 「지연 기한 전체」 목록으로 전환한다.

### 11. 달력 한 칸에 4건째부터는 볼 방법이 없다 — 「+2건」이 눌리지 않는다
- 심각도: 답답
- 어디서: 일정 캘린더 > 달력 칸
- 무슨 일이: 기일이 몰린 날 칸에 「+2건」이라고만 뜬다. 눌러도 반응이 없다.
- 근거: 세 건만 그린다 — `src/pages/CalendarPage.tsx:216`. 나머지는 클릭 대상이 아닌 문단이다 — `src/pages/CalendarPage.tsx:227-229`. 날짜 칸 자체에도 onClick이 없다 — `src/pages/CalendarPage.tsx:204-207`.
- 고칠 방향: 날짜 칸을 버튼으로 만들어 누르면 그 날의 전체 목록을 아래 패널에 펼친다.

### 12. 휴대폰(390px)에서 달력 글씨가 4~5자만 보이고 버튼이 손가락보다 작다
- 심각도: 답답
- 어디서: 일정 캘린더 (휴대폰)
- 무슨 일이: 휴대폰으로 열면 한 칸에 「김철수…」에서 잘리고 무슨 기한인지는 안 보인다. 다음 달로 넘기려고 화살표를 누르다 옆 칸 기한이 눌려 사건 화면으로 튄다.
- 근거: 폭에 상관없이 7칸 고정 — `src/pages/CalendarPage.tsx:198`. 390px에서 한 칸은 50px 안쪽이고, 칩은 좌우 패딩 12px + `truncate` + 11px 글씨라 4~5자만 남는다 — `src/pages/CalendarPage.tsx:221`. 의뢰인 이름을 먼저 그려 제목이 먼저 잘린다 — `:223-224`. 칩 높이는 `py-0.5`+11px ≈ 18px로 44px에 한참 못 미친다. 월 이동 버튼은 ≈36px — `:156-162`, `:174-180`. 「오늘」 버튼은 ≈24px 높이 — `:166-172`. 일정 탭의 수정·삭제 아이콘은 ≈28px — `src/components/cases/ScheduleTab.tsx:415-430`.
- 고칠 방향: 휴대폰 폭에서는 달력 대신 목록을 기본으로 보이고, 터치 영역을 44px 이상으로 키운다.

### 13. 기일 시각과 법정 호수를 넣을 칸이 없다 — 제목에 욱여넣어야 한다
- 심각도: 답답
- 어디서: 사건 상세 > 일정 관리 탭 > [기한 추가], 분류 「기일」
- 무슨 일이: 변론기일을 등록하는데 몇 시인지, 몇 호 법정인지 적을 칸이 없다. 제목에 "변론기일 14시 301호"라고 다 넣는 수밖에 없고, 그렇게 넣으면 달력 칸에서 잘려 시각·법정이 안 보인다.
- 근거: 타입에는 있다 — `src/types/deadline.ts:36-39` (`time?: string;` / `location?: string;`). 분류에 「기일」이 있다 — `src/types/deadline.ts:4-10`. 그러나 폼 입력칸은 다섯 개뿐이다 — `src/components/cases/ScheduleTab.tsx:462-520`. 저장 호출에도 없다 — `:191-209`. 목록에도 표시하지 않는다 — `:370-412`.
- 고칠 방향: 분류가 「기일」이면 시각·장소 입력칸을 폼에 노출하고, 목록·달력 칩에 "14:00 301호"를 함께 보여 준다.

### 14. 「수정」을 눌러도 화면이 그대로다 — 폼이 맨 아래에서 열린다
- 심각도: 답답
- 어디서: 사건 상세 > 일정 관리 탭 > 연필
- 무슨 일이: 기한이 여러 건인 사건에서 위쪽 카드의 연필을 눌렀는데 보이는 화면에 아무 변화가 없다. 안 눌렸나 싶어 또 누른다. 한참 아래로 내려가 보면 「기한 수정」 폼이 열려 있다.
- 근거: 상태만 바꾸고 스크롤·포커스 이동이 없다 — `src/components/cases/ScheduleTab.tsx:157-165`, 버튼 `:416`. 폼은 목록·필터 아래 페이지 맨 끝에 그려진다 — `src/components/cases/ScheduleTab.tsx:446-548`.
- 고칠 방향: `startEdit`에서 폼으로 스크롤하고 제목칸에 포커스를 준다.

### 15. 기한 알림을 눌러도 「개요」 탭이 열린다 — 일정 탭을 다시 찾아 눌러야 한다
- 심각도: 답답
- 어디서: 알림 벨 → 사건 상세
- 무슨 일이: "기한 지연: 답변서 제출 / 3일 경과"를 눌렀더니 사건 개요 화면이 뜬다. 방금 본 그 기한은 화면에 없다.
- 근거: 링크에 탭 정보가 없다 — `src/services/notifications.ts:47`, `:56`. 달력 칩·목록도 같다 — `src/pages/CalendarPage.tsx:219`, `:256`. 탭은 로컬 state이고 항상 개요로 시작한다 — `src/pages/CaseDetailPage.tsx:51`.
- 고칠 방향: 링크를 `/cases/{id}?tab=schedule`로 만들고 CaseDetailPage가 초기 탭을 쿼리에서 읽게 한다.

### 16. 기한 저장·조회가 실패하면 영어 문장이 그대로 뜬다
- 심각도: 말
- 어디서: 사건 상세 > 일정 관리 탭 / 일정 캘린더
- 무슨 일이: 기한을 등록하다 실패하면 빨간 띠에 "기한 등록 실패: Missing or insufficient permissions."처럼 영어가 섞여 나온다.
- 근거: 한국어 변환 유틸이 있고 "원문(영어 메시지)은 절대 화면에 내보내지 않는다"고 못박아 뒀다 — `src/utils/friendlyError.ts:9`. 그런데 기한 화면은 이를 쓰지 않고 원문을 그대로 넣는다 — `src/components/cases/ScheduleTab.tsx:174`(조회), `:212`(등록·수정), `:225`(삭제), `src/pages/CalendarPage.tsx:60`(캘린더 로딩). Firestore 래퍼가 영어를 덧붙여 던진다 — `src/services/firebase/firestore.ts:543-545`, `:567-569`, `:606-608`, `:621-623`.
- 고칠 방향: 네 곳 모두 `friendlyError(err, "기한을 저장하지 못했습니다.")` 형태로 바꾼다.

### 17. 공휴일 안내가 흐린 잔글씨이고, 일요일이 빠졌고, 캘린더에는 아예 없다
- 심각도: 말
- 어디서: 사건 상세 > 일정 관리 탭 맨 아래 안내 상자 / 일정 캘린더
- 무슨 일이: 안내가 작고 흐려 눈에 안 들어온다. 읽더라도 "공휴일 및 토요일이 만료일인 경우 다음 영업일로 연장될 수 있으니"라고 돼 있어 앱이 공휴일까지 계산해 주는 것처럼 읽힌다. 실제로는 공휴일을 전혀 판단하지 않는다.
- 근거: 문구와 스타일 — `src/components/cases/ScheduleTab.tsx:554-558`. 계산은 토·일만 넘기고 공휴일은 판단하지 않는다 — `src/types/deadline.ts:145-147`, 함수 주석도 같은 취지 — `src/types/deadline.ts:133-135`. 문구는 토요일만 적고 일요일이 없다. 일정 캘린더에는 이 안내가 없다.
- 고칠 방향: "공휴일은 자동 계산하지 않습니다. 마감일이 공휴일이면 다음 영업일인지 직접 확인하세요"로 바꾸고 글씨를 키운다. 캘린더에도 같은 안내를 둔다.

---

## 확신이 낮은 항목

- **(추측) 데모 모드에서 일정 탭이 오류를 뿜을 수 있다.** 캘린더는 데모 모드를 확인하고 조회를 건너뛰지만(`src/pages/CalendarPage.tsx:47-50`), 일정 탭은 `isDemoMode`를 확인하지 않고 바로 `getDeadlines`를 부른다. 다만 데모 모드는 `MODE !== "production"`에서만 켜지므로 실제 서비스에서 겪을 일은 아니다. 실행해 확인하지 않았다.
- **(추측) 기한이 쌓이면 캘린더·알림 벨이 느려진다.** `getAllDeadlines`에 `limit`도 `orderBy`도 없어 소유자의 전 기한을 통째로 읽는다(`src/services/firebase/firestore.ts:577-587`). 몇 건부터 체감되는지는 측정하지 않았다.
- **(추측) 브라우저 시간대가 한국이 아니면 D-Day가 하루 어긋날 수 있다.** `calcDDay`는 브라우저 로컬 자정을 쓴다(`src/types/deadline.ts:55-59`). 시간대를 한국으로 고정하는 유틸이 따로 있으나(`src/utils/localDate.ts`) 기한 계산에는 쓰이지 않는다.
- **(확인한 사실, 발견 아님)** 기한 삭제는 저장 규칙에서 허용돼 있다 — `firestore.rules:182-185`. 녹음 삭제가 규칙에 막힌 것과 달리 기한은 규칙이 원인이 아니다.
