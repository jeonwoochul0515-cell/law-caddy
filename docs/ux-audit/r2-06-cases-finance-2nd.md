# LAW-CADDY 2차 점검 — 사건·일정·수임료·재무 (이 실장 시점)

- 점검자 역할. 부산 1인 법률사무소 사무직원 "이 실장". 사건 40건, 매달 1일 세무사 자료 전달, 변호사 계정 하나를 둘이 같이 씀.
- 방법. 화면 글자와 버튼을 코드로 끝까지 추적. 브라우저·개발 서버·실데이터는 쓰지 않았다. 아래 "근거"의 줄 번호는 모두 `src/` 기준.
- 1차가 이미 찾은 항목은 뺐다. 같은 계열이라도 원인이 다른 것만 적었다.
- 화면 테마 확인. `index.css`의 토큰은 밝은 크림 바탕(`--color-navy: #f7f5ec`, `--color-gold: #735c00`)이라 일정 탭의 흰 카드·녹색 글자는 테마와 맞는다. 색 대비 문제는 이 영역에서 새로 찾지 못했다.

## 읽은 파일

pages: CasesPage, CaseDetailPage, ClientsPage, CalendarPage, FinancePage
components/cases: NewCaseModal, CaseHeader, OverviewTab, ContractPaymentSection, CostsSection, ContractGenerateModal, ScheduleTab, TimelineTab, UnifiedTimelineTab, ClientCareTab, OpponentDocs, DocumentsTab, CaseRecordsTab, CaseAssistantTab
components/accounting: FeeManagementTab, CaseExpenseTab, DepositManagementTab, CourtFeeCalculator, SuccessFeeClaimModal, MonthlyReportTab, TaxReportTab, OfficeExpenseModal, PurchaseTransactionModal, OverdueAlertPanel, FinanceSummaryWidget
hooks: useCases, useCaseDetail, useClientCare
services: reportGenerator, autoRevenue, depositAutoDeduct, taxCalculator, courtFeeCalculator, claim-calculator, excelExport, overdueDetector, firebase/firestore, firebase/accounting
types: case, deadline, clientCare, caseRecord, accounting 외 전체
config: firebase.ts, constants.ts(CASE_TYPES), index.css(테마 토큰), layout/AppLayout(배경색)

## 시나리오별 걷기 기록

1. **사건 등록(형사, 상대방 둘)** — "새 사건 등록"을 열면 유형이 무엇이든 같은 8칸(의뢰인·연락처·유형·심급·개요·사건번호·상대방·관할법원·재판부)이다(NewCaseModal 79-133). 상대방 칸은 한 줄 문자열 하나. 형사 사건도 "관할법원·재판부·심급"만 묻고, 수사 단계(경찰·검찰)나 고소인·피고인 지위는 적을 곳이 없다. 형사임을 아는 곳은 수임계약서 모달뿐이다(ContractGenerateModal 39).
2. **같은 의뢰인 사건 2개 + 동명이인** — 의뢰인 화면은 `clientName.trim()`이 같으면 무조건 한 사람으로 묶는다(ClientsPage 60-73). 김민수 두 사람이면 섞이고, "김민수"와 "김 민수"면 갈라진다. 전화번호는 먼저 만난 사건 것 하나만 보여 준다.
3. **법원에서 기일 변경 전화** — 일정 탭에서 연필을 눌러 마감일을 바꾸면 그대로 덮어쓴다(ScheduleTab 179-187). 원래 기일이 언제였는지, 왜 바뀌었는지, 몇 시 어느 법정인지 남길 칸이 없고 활동 기록에도 안 남는다.
4. **착수금 두 번 나눠 입금** — 재무 탭 착수금은 "미납/납부완료" 두 상태뿐, 입금액을 따로 적을 수 없다(FeeManagementTab 567-591). 분할납부 회차로 넣으면 세무자료에는 "잔금"으로 잡히고, 같은 날 같은 금액 두 회차를 체크하면 매출은 한 건만 생긴다.
5. **매달 1일 아침 세무사 자료** — 월별 정산 "생성"을 누르면 첫 달은 저장이 실패한다(아래 1번). 실패를 넘어가도 매출 날짜는 입금일이 아니라 직원이 체크한 날이고, 오전 9시 전에는 전날로 찍힌다.
6. **개요 탭에서 착수금 카드결제 표시** — "카드"를 누르면 잠깐 바뀌었다가 조용히 되돌아온다(아래 2번). 계좌이체도 같다.
7. **둘이서 같은 사건 동시 수정** — 실시간 반영(onSnapshot)이 코드 어디에도 없다. 먼저 연 사람이 나중에 저장하면 상대가 고친 사건번호·부가비용·착수금 정보가 사라진다.

## 발견

### 1. 월별 정산 "생성" 버튼이 첫 달에는 항상 실패한다 · 막힘
- 어디서. 재무 관리 → 월별 정산 → [생성]
- 무슨 일이. 요약 문서를 만들 때 `confirmedAt: existing?.confirmedAt` 처럼 기존 요약이 없으면 `undefined`인 값을 그대로 `setDoc`에 넣는다. Firestore 웹 SDK는 `ignoreUndefinedProperties`를 켜지 않으면 `undefined`가 든 문서 저장을 거부하는데, 이 프로젝트는 `getFirestore(app)` 기본 설정이다. 그래서 그 달의 요약이 처음 만들어질 때(=매달 1일 세무사 자료 만들 때) 저장이 실패하고 화면에는 영문 오류 문장이 뜬다. "확정"까지 간 달도 `sentToAccountant`가 없어 "갱신"이 실패한다.
- 근거. `services/reportGenerator.ts:431-441` (undefined 4개를 담은 객체를 `setDoc`), `config/firebase.ts:32` (`getFirestore(app)`, ignoreUndefinedProperties 없음 — `src` 전체 grep 0건), `components/accounting/MonthlyReportTab.tsx:106-118` (오류를 `setError(msg)`로 그대로 표시)
- 고칠 방향. 요약 객체를 만들 때 값이 없는 키는 아예 넣지 않거나, `initializeFirestore(app, { ignoreUndefinedProperties: true })`로 바꾼다. 어느 쪽이든 실제 생성 한 번 돌려 확인.

### 2. 개요 탭의 "해제·변경" 동작이 전부 조용히 되돌아간다 (카드·계좌이체 선택 포함) · 막힘
- 어디서. 사건 상세 → 개요 → 계약·수임료 현황. 사건 목록의 펼침 패널도 같다.
- 무슨 일이. 결제수단에서 "카드"나 "계좌이체"를 누르면 `receiptIssued = undefined` 키를 붙여 저장하고, 착수금 입금 체크를 끄면 `retainerAmount·retainerDate·retainerMethod·receiptIssued` 네 키를 `undefined`로, 성공보수 유형을 %↔정액으로 바꾸면 `successFeePercent·successFeeAmount`를 `undefined`로 보낸다. 1번과 같은 이유로 저장이 실패하고, 훅은 실패하면 화면을 이전 값으로 되돌리며 아무 말도 하지 않는다. 결과적으로 이 실장 눈에는 "카드를 눌렀는데 안 눌린다", "착수금 체크를 못 끈다", "정액으로 못 바꾼다"로 보인다. 재무 탭도 같은 계열이다. 부가세 "미적용"으로 되돌리기(517), 납부완료 취소(577), 납부일 비우기(600), 성공보수 약정 해제(1021)·유형 변경(1029-1031)·조건 비우기(1281), 분할납부 납부 취소(758), 사건비용 정산 취소(340-341)가 모두 `undefined`를 보낸다.
- 근거. `components/cases/ContractPaymentSection.tsx:29-41, 57-61, 157, 170-174`, `hooks/useCaseDetail.ts:663-678` (catch에서 되돌리기만 함), `pages/CasesPage.tsx:416-434, 130-140`, `components/accounting/FeeManagementTab.tsx:517, 577, 600, 1021, 1029-1031, 1281`, `components/accounting/CaseExpenseTab.tsx:340-341`, `services/firebase/firestore.ts:115-130`(그대로 `updateDoc`)
- 고칠 방향. "값 지우기"는 `deleteField()`를 쓰거나 키를 빼고 보낸다. 실패하면 "저장되지 않았습니다"를 띄운다.

### 3. 수임 계약 정보의 "계약서 파일 업로드" 버튼이 아무 일도 하지 않는다 · 막힘
- 어디서. 사건 상세 → 재무 → 수임 계약 정보 → 계약서 파일 [업로드]
- 무슨 일이. 버튼에 onClick이 없다. "미등록"이 영원히 남는다. 종이 계약서를 스캔해 붙이려는 사람은 여기서 막힌다.
- 근거. `components/accounting/FeeManagementTab.tsx:464-467`
- 고칠 방향. 사건비용의 영수증 업로드(`CaseExpenseTab` 228-262)와 같은 방식으로 `contract.contractFileUrl`에 저장.

### 4. 착수금을 두 번에 나눠 받은 것을 착수금으로 적을 수 없고, 같은 날 같은 금액 두 회차는 매출이 한 건만 잡힌다 · 위험
- 어디서. 사건 상세 → 재무 → 착수금 관리 / 분할납부 스케줄
- 무슨 일이. 착수금은 "미납↔납부완료" 토글뿐이고 납부액은 약정액 전액으로 고정된다(`paidAmount: nextPaid ? retainer.amount : 0`). 200만원 중 100만원만 들어온 상태를 표현할 수 없다. 우회로는 분할납부 회차인데, 회차 입금은 매출 세부유형 "수임료_잔금"으로 기록돼 세무 자료에서 착수금이 잔금으로 바뀐다. 게다가 매출 중복 검사는 `사건+수임료+금액+날짜`가 같으면 건너뛰므로, 1회차·2회차가 같은 금액이고 직원이 같은 날 둘 다 체크하면 두 번째 매출은 소리 없이 빠진다.
- 근거. `components/accounting/FeeManagementTab.tsx:567-591, 750-760`, `pages/CaseDetailPage.tsx:270-275`, `services/autoRevenue.ts:36-41, 62-85, 110-111`
- 고칠 방향. 착수금에도 "입금 내역 추가(금액·날짜)"를 두고 paidAmount를 합산. 중복 검사는 회차 ID까지 비교.

### 5. 매출 날짜가 "입금일"이 아니라 "직원이 체크한 날"이고, 오전 9시 전에는 전날로 찍힌다 · 위험
- 어디서. 착수금 납부완료·분할납부 체크·성공보수 입금완료 → 자동 매출 등록. 사건비용·예수금·부가비용의 기본 날짜도 같다.
- 무슨 일이. 자동 매출은 `new Date().toISOString().slice(0,10)`을 날짜로 쓴다. 이 값은 UTC라 한국 시간 00:00~09:00에는 전날이다. 8월 30일 입금을 9월 2일에 확인해 체크하면 9월 매출이 되고, 9월 1일 아침 8시에 체크하면 8월 31일 매출이 된다. 나중에 납부일 칸을 고쳐도 매출은 따라오지 않는다. 한편 월별 정산 요약은 `retainer.paidDate`·`installment.paidDate`(입금일)로 집계하고, 대시보드·Excel 거래상세는 매출 문서의 `date`(체크일)로 집계한다. 어느 화면도 "입금일 기준/등록일 기준"을 적어 두지 않았다. 같은 패턴이 16곳이다.
- 근거. `pages/CaseDetailPage.tsx:183-202` (date=오늘, paymentMethod "계좌이체" 고정), `components/accounting/FeeManagementTab.tsx:101-103, 577, 758`, `services/reportGenerator.ts:183-205` (입금일 기준), `pages/FinancePage.tsx:204-207` (매출 date 기준), `components/accounting/MonthlyReportTab.tsx:137-139`, `toISOString().slice(0, 10)` grep 16건
- 고칠 방향. 자동 매출 날짜는 화면에 입력한 납부일을 쓰고, 오늘 날짜는 로컬 기준으로 만든다. 월별 화면 상단에 "입금일 기준" 한 줄.

### 6. 사건비용을 지우면 예수금에서 빠져나간 돈이 돌아오지 않고, 예수금 탭에서 또 "사용 등록"하면 이중 차감된다 · 위험
- 어디서. 사건 상세 → 재무 → 비용 내역 [삭제] / 예수금 [사용 등록]
- 무슨 일이. 의뢰인 부담 비용을 등록하면 예수금에서 자동 차감되고 4초짜리 토스트만 뜬다. 비용은 수정이 안 되므로 금액 오타면 삭제 후 재등록해야 하는데, 삭제는 비용 문서만 지우고 예수금 `usageHistory`·`usedAmount`는 그대로다. 재등록하면 한 번 더 빠진다. 반대로 직원이 자동 차감을 모르고 예수금 탭에서 수동 "사용 등록"을 하면 같은 인지대가 두 번 빠진다(수동 등록에는 비용 연결 키가 없다).
- 근거. `pages/CaseDetailPage.tsx:296-348` (자동 차감), `359-366` (삭제는 비용만), `components/accounting/CaseExpenseTab.tsx:878-921` (수정 버튼 없음), `services/depositAutoDeduct.ts:77-104`, `components/accounting/DepositManagementTab.tsx:281-323` (수동 사용 등록, caseExpenseId 없음)
- 고칠 방향. 비용 삭제 시 연결된 usage를 되돌리고, 비용 수정 기능을 둔다. 수동 사용 등록에는 "이 사건 비용에서 고르기"를 붙인다.

### 7. 두 사람이 같은 계정으로 같은 사건을 고치면 나중에 저장한 사람이 상대의 변경을 지운다 · 위험
- 어디서. 사건 정보 수정, 개요 탭 계약·수임료, 부가비용
- 무슨 일이. 사건은 열 때 한 번만 읽고(`getCase`) 실시간 반영이 없다(`onSnapshot` 사용 0건). 정보 수정은 9칸 전부를 보내므로, 변호사가 사건번호를 넣은 뒤 직원이 먼저 열어 둔 창에서 상대방만 고쳐 저장하면 사건번호가 빈칸으로 돌아간다. 부가비용은 배열 통째로, 계약·수임료는 객체 통째로 덮어쓴다. 활동 기록만 `arrayUnion`이라 안전하다.
- 근거. `hooks/useCaseDetail.ts:84-138` (1회 읽기), `179-201` (updateInfo), `681-697` (costs 배열 덮어쓰기), `663-678` (contractPayment 덮어쓰기), `components/cases/CaseHeader.tsx:59-93` (9칸 전부 전송), `services/firebase/firestore.ts:147-150` (timeline만 arrayUnion)
- 고칠 방향. 바뀐 칸만 보내고, 부가비용은 서브컬렉션으로. 최소한 `updatedAt`을 비교해 "다른 사람이 먼저 고쳤습니다" 안내.

### 8. 종합소득세 기초자료의 사무소 경비가 "월별 정산을 만든 달"만, 그것도 최근 12개월만 잡힌다 · 위험
- 어디서. 재무 관리 → 세무 자료 → 종합소득세 기초자료
- 무슨 일이. 사무소 경비는 `office_expenses`를 직접 읽지 않고 월별 요약(`monthly_summary`)에서 가져온다. 요약은 최신순 12개만 읽고 그중 귀속연도 것만 남긴다. 2026년 5월에 2025년 귀속을 뽑으면 12개는 2025-05~2026-04라 2025년 1~4월 경비가 빠진다. 1번 때문에 요약 생성이 실패한 달은 아예 0이다. 사건비용 중 사무소 부담분도 필요경비에 들어가지 않는다. 화면에는 "N개월 데이터"라고만 나와 왜 적은지 알 수 없다.
- 근거. `services/taxCalculator.ts:439-441, 449-452, 528-546, 574`, `services/firebase/accounting.ts:1029-1047` (`slice(0, 12)`), `components/accounting/TaxReportTab.tsx:545-548`
- 고칠 방향. 귀속연도의 `office_expenses`·`case_expenses(사무소 부담)`를 직접 집계한다.

### 9. 사무소 경비로 넣은 임대료·관리비의 매입세액이 부가세 자료에 안 잡힌다 · 위험
- 어디서. 재무 관리 → 매입/경비 내역 → [사무소 경비 등록] / 세무 자료 → 부가세 기초자료
- 무슨 일이. 안내문이 "임대료·급여·회비 등은 경비로, 세금계산서를 받은 구매는 매입으로"라고 한다. 그런데 사무소 경비 모달은 증빙 유형 기본값이 "세금계산서"인데도 공급가액·부가세 칸이 없고 금액 하나만 받는다. 부가세 기초자료는 `transactions`(매입 거래)만 읽는다. 임대료는 대부분 세금계산서를 받는 항목인데 안내대로 "경비"에 넣으면 매입세액 0으로 세무사에게 간다.
- 근거. `pages/FinancePage.tsx:603-605` (안내문), `components/accounting/OfficeExpenseModal.tsx:64, 92-104, 182-191`, `services/taxCalculator.ts:313-318, 335-342`, `services/reportGenerator.ts:246-252`
- 고칠 방향. 사무소 경비에도 공급가액/부가세를 받거나, 세금계산서 증빙이면 매입 거래로 저장하도록 안내를 바꾼다.

### 10. 수임계약서 모달에 착수금 330만원과 형사 성과보수 700·500·500만원이 미리 채워져 있고, 버튼이 바로 활성이다 · 위험
- 어디서. 개요 → [수임계약서 작성]
- 무슨 일이. 열자마자 착수금 "330"(만원)이 들어 있어 `canSubmit`이 참이다. 실수로 [계약서 생성 + 서명 요청]을 누르면 330만원짜리 계약서와 24시간짜리 서명 링크가 만들어지고, 사건의 계약 상태가 "체결"로 바뀐다. 형사에서 성과보수를 켜면 "무죄 700만원·집행유예 500만원·벌금형 500만원"이 기본값이다. 이 모달만 "만원" 단위이고 개요·재무 탭의 금액 칸은 "원" 단위라 같은 착수금을 두 곳에서 다른 단위로 적게 된다.
- 근거. `components/cases/ContractGenerateModal.tsx:41, 45-49, 56-57, 215, 373-381`, `pages/CaseDetailPage.tsx:440-463` (contractSigned true로 반영), `components/cases/ContractPaymentSection.tsx:137` ("원")
- 고칠 방향. 기본값을 비우고 0이면 버튼 비활성. 단위는 한 가지로 통일하고 입력 옆에 환산 표시.

### 11. "전달완료"로 표시한 월별 정산도 [갱신]으로 수치가 덮어써지고, 경고가 없다 · 위험
- 어디서. 재무 관리 → 월별 정산
- 무슨 일이. 상태가 전달완료여도 갱신 버튼이 살아 있고, 다시 집계하면 상태만 보존한 채 숫자를 전부 새로 쓴다. 세무사에게 보낸 자료와 화면이 달라져도 표시가 없다. 되돌리기도 없다.
- 근거. `components/accounting/MonthlyReportTab.tsx:193-204`, `services/reportGenerator.ts:394-398, 431, 441`
- 고칠 방향. 전달완료면 갱신 전에 "세무사에게 보낸 자료가 바뀝니다" 확인, 이전 수치 보관.

### 12. "수임료 관리 시작"을 두 번 누르면 수임료 문서가 둘 생기고, 사건 탭은 하나만 보여 준다 · 위험(확신 중간)
- 어디서. 사건 상세 → 재무 → [수임료 관리 시작]
- 무슨 일이. 버튼에 진행 중 비활성이 없고 `createFee`는 비동기다. 느린 연결에서 두 번 누르면 Fee 문서 2개가 생긴다. 사건 탭은 `fees[0]`만 쓰고, 재무 관리 미수금 목록에는 같은 의뢰인이 두 줄로 뜬다. 수임료 삭제는 없다(1차 발견).
- 근거. `components/accounting/FeeManagementTab.tsx:194-200`, `pages/CaseDetailPage.tsx:136-141, 160-168`, `pages/FinancePage.tsx:236-244`
- 고칠 방향. 누르면 즉시 비활성, 생성 전에 이미 있으면 재사용.

### 13. 의뢰인 화면은 이름만 같으면 다른 사람도 한 사람으로 묶는다 · 답답
- 어디서. 의뢰인
- 무슨 일이. `clientName.trim()`만으로 묶는다. 동명이인의 사건이 한 카드에 섞이고, 전화번호는 먼저 만난 사건 것 하나만 보인다. 반대로 "김민수"와 "김 민수"는 두 사람이 된다. 사건마다 따로 적힌 이름·전화를 고칠 곳도 여기엔 없다(1차의 "한 곳에서 수정 불가"와 같은 뿌리).
- 근거. `pages/ClientsPage.tsx:60-73`, `types/case.ts:43-45` (의뢰인 식별자 없음)
- 고칠 방향. 이름+전화번호로 묶고, 같은 이름·다른 번호는 "동명이인일 수 있음" 표시.

### 14. 상대방이 여럿인 사건을 담을 수 없고, 등록 폼이 사건 유형과 무관하게 같다 · 답답
- 어디서. 새 사건 등록 / 사건 정보 수정 / 재무 탭 실비 계산기
- 무슨 일이. 상대방은 문자열 한 칸(`opponentName?: string`)이라 "피고 홍길동, 김철수"처럼 쉼표로 적는 수밖에 없고, 원고인지 피고인지 지위도 없다. 유형을 형사로 골라도 관할법원·재판부·심급을 묻고 수사기관·죄명·고소인 칸은 없다. 형사 사건의 재무 탭에서도 "실비 계산기"가 "소가(청구금액)"를 묻는다.
- 근거. `types/case.ts:55-56`, `components/cases/NewCaseModal.tsx:89-133`, `components/cases/CaseHeader.tsx:165, 246-253`, `components/cases/ContractGenerateModal.tsx:39` (형사 분기는 여기뿐), `components/accounting/CaseExpenseTab.tsx:415-439`, `components/accounting/CourtFeeCalculator.tsx:159-181`
- 고칠 방향. 상대방을 배열(이름·지위)로. 유형별로 칸을 바꾸고, 민사·가사·행정이 아니면 인지대 계산기를 숨긴다.

### 15. 기일이 바뀌면 이전 기일 흔적이 사라지고, 시각·법정·변경 사유를 적을 칸이 없다 · 답답
- 어디서. 사건 상세 → 일정 관리 → 연필
- 무슨 일이. 수정은 `updateDoc`으로 날짜를 덮어쓴다. 활동 기록에 "기일 변경"이 남지 않고, 기한 자료형에 시각·장소·이력 필드가 없다. "10월 2일 14:00 301호"는 제목에 손으로 적어야 한다.
- 근거. `components/cases/ScheduleTab.tsx:179-187`, `services/firebase/firestore.ts:518-530`, `types/deadline.ts:102-115`
- 고칠 방향. 수정 시 이전 값을 `history`에 쌓고 활동 기록에 한 줄 남긴다. 기일 분류에는 시각·장소 칸.

### 16. 활동 기록 메모는 고치거나 지울 수 없고, 날짜를 정할 수 없으며, 저장 실패하면 조용히 사라진다 · 답답
- 어디서. 사건 상세 → 활동 기록 → [메모]
- 무슨 일이. 타임라인 항목에 id가 없어 수정·삭제 버튼 자체가 없다. 날짜는 저장 시각으로 고정돼 "어제 법원에서 온 전화"를 어제 날짜로 적을 수 없다. 저장 실패 시 방금 쓴 메모를 화면에서 빼기만 하고 안내가 없다.
- 근거. `types/case.ts:72-77`, `components/cases/UnifiedTimelineTab.tsx:446-464`, `hooks/useCaseDetail.ts:203-234`, `services/firebase/firestore.ts:138-157`
- 고칠 방향. 항목에 id와 날짜 입력을 두고, 실패 시 메시지.

### 17. 인지대·송달료 계산의 근거가 상수로 박혀 있고, 소액사건 송달료 회분이 틀린다 · 답답
- 어디서. 사건 상세 → 재무 → 실비 계산기
- 무슨 일이. 송달료 단가 5,200원은 "2025년 기준"이라고만 적혀 있고 바꿀 칸이 없다. 회분은 1심 15회로 고정이라 소액사건(10회분)을 체크해도 15회로 계산한다. 인지대 구간 요율표는 화면에 없고 "계산 상세 내역"에도 심급 배수만 나온다. 우편요금이 바뀌면 코드를 고치기 전까지 틀린 값을 등록하게 된다. (소액사건 인지대 ×0.5 문제는 1차 발견이라 제외.)
- 근거. `services/courtFeeCalculator.ts:62-69, 155-158, 197-206`, `components/accounting/CourtFeeCalculator.tsx:262-264, 350-353`
- 고칠 방향. 단가·회분을 설정값으로 빼고 기준일을 표시. 소액 체크 시 회분 10.

### 18. 사건 목록은 상세에 갔다 오면 검색·필터·정렬이 초기화되고, 정렬은 등록일순뿐이다 · 답답
- 어디서. 사건 관리
- 무슨 일이. 검색어·유형·상태·기간·정렬이 컴포넌트 상태라 사건 하나 열고 돌아오면 40건 전체가 다시 뜬다. 정렬은 최신/오래된순 두 가지이고 의뢰인 이름순·다음 기일순이 없다. 페이지도 없다(40건이면 스크롤로 버틸 수 있음).
- 근거. `pages/CasesPage.tsx:45-50, 118-122, 213-219, 279`
- 고칠 방향. 필터를 URL 쿼리나 sessionStorage에 보관. 이름순 정렬 추가.

### 19. 금액 입력 방식이 화면마다 다르고 휴대폰에서 숫자 키패드가 안 뜬다 · 답답
- 어디서. 수임계약서(만원, 자동 콤마), 개요·재무 착수금(원, 콤마 수동), 사건비용(원, 자동 콤마), 사무소 경비·매입(`type=number`, 콤마 입력 불가), 예수금(원, 콤마 수동)
- 무슨 일이. 같은 "착수금"을 한 곳은 만원, 다른 곳은 원으로 적는다. `inputMode="numeric"`은 실비 계산기와 성공보수 청구 모달 두 곳뿐이라 나머지는 휴대폰에서 문자 키보드가 뜬다. 날짜는 모두 `type="date"`라 휴대폰에서 문제없다.
- 근거. `components/cases/ContractGenerateModal.tsx:208-215`, `components/accounting/FeeManagementTab.tsx:528-537`, `components/accounting/OfficeExpenseModal.tsx:184-191`, `components/accounting/PurchaseTransactionModal.tsx:178-186`, `components/accounting/DepositManagementTab.tsx:446-452`, `components/accounting/CaseExpenseTab.tsx:517-525`, grep `inputMode="numeric"` 2건(랜딩 제외)
- 고칠 방향. 금액 입력 공용 컴포넌트 하나(원 단위·자동 콤마·numeric 키패드).

### 20. 예수금 등록 때 사건 안인데도 의뢰인 이름을 다시 타이핑해야 한다 · 답답
- 어디서. 사건 상세 → 재무 → 새 예수금 등록
- 무슨 일이. 사건의 `clientName`이 예수금 탭에 전달되지 않아 "의뢰인명"이 빈칸이다. 오타가 나면 재무 관리 예수금 표에 다른 이름으로 뜬다.
- 근거. `pages/CaseDetailPage.tsx:667-674` (clientName 미전달), `components/accounting/DepositManagementTab.tsx:34-41, 234-236, 420-429`
- 고칠 방향. 사건에서 열면 의뢰인명을 채워 넣고 잠근다.

### 21. 영수증은 등록할 때만 붙일 수 있고, 아이폰 기본 사진(HEIC)은 거부된다 · 답답(확신 중간)
- 어디서. 사건 상세 → 재무 → 비용 등록 → 영수증 첨부 / 비용 내역
- 무슨 일이. 첨부는 등록 폼에만 있고 등록된 비용에는 첨부 추가 버튼이 없다. 파일 검사가 `file.type`이 `image/jpeg·png·pdf`일 때만 통과라 아이폰 카메라 기본 형식(HEIC)은 "JPG, PNG, PDF 파일만"으로 막힌다.
- 근거. `components/accounting/CaseExpenseTab.tsx:230-233, 603-640, 843-867 (보기만), 878-921`
- 고칠 방향. 상세 펼침에 "영수증 추가", HEIC 허용 또는 촬영 시 JPEG 변환.

### 22. 심급을 한 번 정하면 "미지정"으로 되돌릴 수 없다 · 말
- 어디서. 사건 정보 수정 → 심급
- 무슨 일이. 저장 시 `instance`는 값이 있을 때만 보내므로 "미지정"을 골라도 예전 값이 남는다.
- 근거. `components/cases/CaseHeader.tsx:92`
- 고칠 방향. 빈 값이면 `deleteField()`.

### 23. 재무 관리 미수금 표의 "사건유형" 열에 계약 형태(서면·전자·구두)가 찍힌다 · 말
- 어디서. 재무 관리 → 미수금 현황
- 무슨 일이. 머리글은 "사건유형"인데 값은 `fee.contract.contractType`이다. 수임료 문서에 사건유형이 없다. 방금 "수임료 관리 시작"만 누른 사건(약정 0원)도 미완납으로 이 표에 올라온다.
- 근거. `pages/FinancePage.tsx:765, 790-792, 236-244`, `services/firebase/accounting.ts:68-77`
- 고칠 방향. 사건 문서에서 유형을 가져오거나 머리글을 "계약 형태"로.

### 24. 세무사용 Excel의 결제수단이 자동 매출은 전부 "계좌이체"이고, 세부유형이 "수임료_착수금"처럼 밑줄째 나간다 · 말
- 어디서. 월별 정산 → Excel 내보내기 → 거래상세 시트
- 무슨 일이. 착수금·분할납부 자동 매출은 결제수단을 "계좌이체"로 박아 넣는다(재무 탭에서 카드를 골라도). 증빙 유형은 항상 "없음". 세부유형 열은 내부 코드값 그대로다.
- 근거. `pages/CaseDetailPage.tsx:195`, `services/autoRevenue.ts:127-128`, `services/excelExport.ts:199-210`
- 고칠 방향. Fee의 결제수단·증빙을 넘기고, Excel에는 표시용 이름("착수금")으로.

## 확신이 낮은 항목

- 1·2번의 근거인 "Firestore가 `undefined` 값을 거부한다"는 SDK 문서상 동작이며 이번 점검에서 실행해 보지는 않았다. 코드에 `ignoreUndefinedProperties`가 없다는 것까지만 확인했다. 실제로 저장이 되고 있다면 이 두 항목은 취소해야 한다.
- 12번(더블클릭으로 수임료 2개)은 코드상 가능하나 빈도는 낮다.
- 17번의 송달료 단가 5,200원이 2026년 현재 맞는지는 확인하지 못했다. 값이 상수라는 점만 문제 삼았다.
- 21번의 HEIC 거부는 기기 설정(아이폰 "호환성 우선")에 따라 안 겪을 수도 있다.
- 5번의 "자정~오전 9시" 문제는 브라우저 시간대가 한국일 때 기준이다.
