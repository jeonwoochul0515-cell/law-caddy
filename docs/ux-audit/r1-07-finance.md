# r1-07 재무·요금제·결제·플랜 제한 점검 (김 변호사 시점)

점검일 2026-09-11. 점검자 역할은 부산 1인 사무소 40대 후반 변호사. 화면 글자를 그대로 읽고, 개발 용어를 모른다는 전제. 코드만 추적했고 실행·실데이터 접근은 하지 않았다.

## 읽은 파일

- 화면. `src/pages/FinancePage.tsx`, `src/pages/CaseDetailPage.tsx`(150~300, 620~660), `src/pages/SettingsPage.tsx`(25~100, 380~520), `src/pages/seo/PricingPage.tsx`, `src/pages/PaymentSuccessPage.tsx`, `src/pages/PaymentFailPage.tsx`
- 재무 컴포넌트. `src/components/accounting/` 전체 11개(FeeManagementTab, SuccessFeeClaimModal, OverdueAlertPanel, TaxReportTab, MonthlyReportTab, OfficeExpenseModal, PurchaseTransactionModal, CaseExpenseTab, DepositManagementTab, CourtFeeCalculator, FinanceSummaryWidget)
- 결제 컴포넌트. `src/components/payment/PaymentModal.tsx`, `UsageSummary.tsx`, `PlanSelector.tsx`, `src/components/layout/PlanExpiryBanner.tsx`
- 서비스. `src/services/payment.ts`, `autoRevenue.ts`, `depositAutoDeduct.ts`, `taxCalculator.ts`, `courtFeeCalculator.ts`, `claim-calculator.ts`, `excelExport.ts`, `overdueDetector.ts`, `reportGenerator.ts`(170~260, 355~380), `firebase/accounting.ts`(1~400), `notify.ts`(35~60), `notifications.ts`(95~130), `claude.ts`(388~405)
- 훅·타입·상수. `src/hooks/usePlanLimits.ts`, `src/hooks/useAuth.ts`(60~110), `src/types/subscription.ts`, `src/types/user.ts`, `src/types/accounting.ts`(75~162), `src/config/constants.ts`(PLANS), `src/data/landingContent.tsx`(PLANS)
- 서버. `functions/api/payment/confirm.ts`, `functions/api/_shared/plan.ts`, `functions/api/notify/expiry.ts`
- 규칙. `firestore.rules`(users 31~60, fees·installments·transactions·office_expenses·deposits·payments 135~225)

## 발견

### 1. 만료된 Pro 사용자는 설정 화면에서 연장 결제를 할 수 없다 · 막힘

- 어디서. 설정 > 요금제, 상단 만료 배너
- 무슨 일이. Pro가 만료되면 배너가 "무료 플랜으로 전환되었습니다. 연장 결제하기"라고 안내하는데, 링크를 눌러 들어간 요금제 화면의 Pro 카드에는 "현재 플랜"이라는 회색 글자만 있고 누를 버튼이 없다. 결제창을 여는 길이 없다.
- 근거. `SettingsPage.tsx:408`은 `currentPlan={user?.plan ?? "free"}`로 Firestore의 원래 값("pro")을 넘긴다. 만료 판정은 `usePlanLimits.ts:48-50`에서만 하고 `users.plan` 필드는 아무도 "free"로 바꾸지 않는다(`plan.ts:83-84`도 판정만). `PlanSelector.tsx:116`에서 `planId === currentPlan`이면 `"current"`, `:199-202`에서 버튼 없는 div "현재 플랜"을 그린다. 같은 화면 위쪽 `UsageSummary`는 `plan`(만료 반영, `SettingsPage.tsx:31`)을 받아 "Free"로 표시하므로 한 화면에 "Free"와 "Pro 현재 플랜"이 동시에 뜬다. 배너 링크는 `PlanExpiryBanner.tsx:58`, 문자 안내도 `expiry.ts:78` "설정 > 요금제에서 연장해 주세요".
- 고칠 방향. PlanSelector에 만료 반영된 `plan`을 넘기고, 만료(또는 D-7 이내)면 Pro 카드에 "연장 결제" 버튼을 노출한다.

### 2. 만료 전에 미리 연장하면 남은 날짜를 잃는다 · 위험

- 어디서. 결제 승인 서버, 만료 안내 문자·배너
- 무슨 일이. 문자와 배너가 D-7부터 "연장해 주세요"라고 재촉하는데, 그 말대로 7일 전에 결제하면 새 만료일이 "결제일 + 1개월"이 되어 남아 있던 7일이 사라진다. 연결제(89만원)도 같다.
- 근거. `confirm.ts:120-121` `const now = new Date(); const expiresAt = calcExpiresAt(parsed.period, now);` 기존 `planExpiresAt`을 읽지 않는다. 재촉은 `expiry.ts:26,78`, `PlanExpiryBanner.tsx:8,54-59`.
- 고칠 방향. 기존 만료일이 아직 미래면 그 날짜에 기간을 더하고, 결제창과 성공 화면에 "기존 기간 뒤에 이어집니다"를 표시한다.

### 3. 성공보수 "입금완료"를 눌러도 미수금에서 빠지지 않고, 월별 정산 성공보수 매출은 항상 0원 · 위험

- 어디서. 사건 상세 > 재무 탭 > 성공보수, 재무 관리 > 월별 정산
- 무슨 일이. 성공보수 청구서를 보내고 돈이 들어와 "입금완료"를 누르면 상태 뱃지만 바뀐다. 요약 카드 미수금은 청구액 그대로 남고, 월별 정산의 "성공보수" 칸은 0원이다. 반면 재무 관리 대시보드와 세무 자료에는 매출로 잡혀서 세 화면의 숫자가 다르다.
- 근거. 상태 버튼은 `FeeManagementTab.tsx:1303` `onUpdate({ ...successFee, status })`로 `paidAmount`·`paidDate`를 쓰지 않는다. 집계는 `accounting.ts:61` `successFeePaid = sf.paidAmount ?? 0` → 0. 월별 정산은 `reportGenerator.ts:192-198`에서 `paidDate`·`paidAmount`를 요구해 0. 자동 매출 거래는 `CaseDetailPage.tsx:225-227`에서 만들어지지만 `reportGenerator.ts:235`가 "착수금/잔금/성공보수는 fee에서 이미 집계 → 중복 방지"라며 제외한다. 세무 자료(`taxCalculator.ts:313-317`)는 거래만 보므로 여기엔 잡힌다.
- 고칠 방향. "입금완료" 전환 시 `paidAmount = claimedAmount`, `paidDate = 오늘`을 함께 저장하고 입금일·금액을 입력받는다.

### 4. 입금 처리를 잘못 눌러 되돌려도 매출 기록은 남고, 매출 거래는 고치거나 지울 화면이 없다 · 위험

- 어디서. 사건 상세 > 재무 탭(착수금 납부 상태, 분할납부 동그라미), 재무 관리 > 매출 내역
- 무슨 일이. 회차 동그라미를 실수로 눌렀다가 다시 누르면 납부 상태는 "미납"으로 돌아가지만, 첫 클릭 때 자동으로 생긴 매출(날짜=오늘, 결제수단=계좌이체, 증빙=없음)은 그대로 남는다. 재무 관리의 매출 내역에는 수정·삭제 버튼이 없어 없앨 수 없고, 세무 자료 "증빙 미비"에 계속 잡힌다.
- 근거. 생성은 `CaseDetailPage.tsx:249-255`(분할납부), `:220-222`(착수금). 되돌릴 때 삭제 로직 없음(`FeeManagementTab.tsx:751-767`). 자동 매출의 고정값은 `CaseDetailPage.tsx:184,191`(오늘·계좌이체), `autoRevenue.ts:128` `evidenceType: "없음"`. 매출 행에는 관리 열이 없다(`FinancePage.tsx:519-525` 헤더 5열, `:527-550` 행) — 매입 행만 수정·삭제가 있다(`:616-622`, `:648-667`). `updateTransaction`을 쓰는 곳은 `PurchaseTransactionModal.tsx:103` 하나뿐. 같은 날 같은 금액만 중복 방지(`autoRevenue.ts:62-80`)라 다른 날 다시 누르면 매출이 두 번 잡힌다.
- 고칠 방향. 매출 행에도 수정(증빙·날짜·결제수단)·삭제를 열고, 납부 취소 시 연결된 `feeId` 매출을 함께 지우거나 "매출도 삭제할까요"를 묻는다.

### 5. 착수금 "부가세 적용"의 뜻이 화면과 장부에서 반대다 · 위험

- 어디서. 사건 상세 > 재무 탭 > 착수금 관리 "부가세 적용", 재무 관리 > 세무 자료
- 무슨 일이. 착수금 1,000,000원에 부가세 적용을 켜면 화면은 "공급가액 1,000,000 / 부가세 100,000 / 합계 1,100,000"을 보여준다. 그런데 납부완료를 누르면 매출은 총액 1,000,000원(공급가 909,091 + 부가세 90,909)으로 기록된다. 약정액·미수금도 부가세 없는 1,000,000원 기준이라, 의뢰인에게 110만원을 받아야 하는데 100만원 받으면 "완납"이 된다.
- 근거. 화면 계산 `FeeManagementTab.tsx:112-119` `calculateVat(supplyAmount)`(입력액=공급가). 매출 기록 `CaseDetailPage.tsx:220-222`가 `data.retainer.amount`를 넘기고 `autoRevenue.ts:52-55` `calculateVatFromTotal`이 이를 총액으로 역산. 집계 `accounting.ts:46` `retainerAgreed = fee.retainer.amount`(부가세 제외).
- 고칠 방향. 착수금 입력 시 "부가세 포함/별도"를 고르게 하고, 약정액·매출·미수금이 모두 같은 기준(합계)으로 흐르게 한다.

### 6. 인지대 계산기가 소가 1,000만원 이하를 "소액사건 ×0.5"로 자동 감액한다 · 위험

- 어디서. 사건 상세 > 재무 탭 > 사건비용 > 실비 계산기
- 무슨 일이. 소가 800만원을 넣으면 "소액사건 (x0.5) 자동 적용" 체크가 켜지고 인지대가 절반으로 나온다. 계산 근거는 "민사소송 등 인지법 기준"이라는 한 줄뿐이고 조문·개정일·확인일이 없다. 이 값을 그대로 의뢰인에게 청구하면 절반만 받는다.
- 근거. `courtFeeCalculator.ts:72` `SMALL_CLAIM_THRESHOLD = 10_000_000`(소액사건 기준은 소가 3,000만원 이하로 알고 있음), `:122-125` `if (isSmallClaim) baseFee *= 0.5;`. 자동 체크 `CourtFeeCalculator.tsx:58-60`. 안내문 `:350-352`. 민사소송등인지법에 소액사건 자체를 절반으로 하는 규정은 없는 것으로 안다(지급명령 1/10, 조정 1/5 등은 별개 절차) — 확신 낮음 항목에 함께 적음. 누진 구간·심급 배수·전자소송 10% 감액(`:109-130`)은 인지법 산식과 맞아 보인다.
- 고칠 방향. 소액사건 감액 옵션을 빼거나 근거 조문을 명시하고, 화면에 "기준 법령·확인일"과 법원 인지대 계산 페이지 링크를 둔다.

### 7. 월별 정산·Excel의 "연체 금액/건수"는 시간이 지나도 0인 채로 남는다 · 위험

- 어디서. 재무 관리 > 월별 정산, Excel "미수금" 시트, 대시보드 연체 알림
- 무슨 일이. 대시보드 연체 알림에는 "3건 연체"가 뜨는데 같은 달 월별 정산 화면과 세무사에게 보내는 Excel에는 연체 0건·0원으로 나간다.
- 근거. 월별 정산은 `reportGenerator.ts:373-377`에서 저장된 `inst.overdue` 플래그만 본다. 그 플래그는 회차 등록 때 한 번(`FeeManagementTab.tsx:737`, 미래 날짜면 false)과 납부 토글 때(`:760`)만 쓰이고 날짜가 지나도 갱신되지 않는다. 대시보드는 `overdueDetector.ts:60-64`에서 오늘 날짜로 실시간 계산한다.
- 고칠 방향. 월별 정산도 `dueDate < 오늘 && !paid`로 실시간 계산하고, 저장 플래그는 버린다.

### 8. 미수금 현황의 "연체일수"가 계약일부터 세고, 착수금만 냈으면 분할납부가 밀려도 "-"로 나온다 · 위험

- 어디서. 재무 관리 > 현황 대시보드 > 미수금 현황
- 무슨 일이. 계약 체결일이 60일 전이고 착수금은 계약 당일 받았는데 2회차 잔금이 20일 밀린 의뢰인이 "연체일수 -"로 표시된다. 반대로 착수금이 아직이면 계약일부터 60일로 빨갛게 나와 실제 납부기한과 무관하다.
- 근거. `FinancePage.tsx:773-778` `fee.retainer.paidDate ? 0 : fee.contract.signedDate ? calcOverdueDays(fee.contract.signedDate) : 0`. 분할납부 예정일은 보지 않는다.
- 고칠 방향. 가장 오래된 미납 회차의 예정일 기준으로 연체일수를 계산한다.

### 9. 분할납부 회차의 금액·예정일·실납부액을 고칠 수 없다. 수임료 자체도 지울 수 없다 · 답답

- 어디서. 사건 상세 > 재무 탭 > 분할납부 스케줄
- 무슨 일이. 예정일을 잘못 넣으면 삭제 후 다시 등록해야 하고, 그러면 회차 번호가 뒤로 밀린다. 100만원 예정에 50만원만 들어온 경우를 적을 수 없다(누르면 100만원 전액 납부로 기록). 화면은 "(실납부: …)"를 표시할 준비가 되어 있지만 그 값을 넣을 입력이 없다. 잘못 만든 수임료 관리 자체를 없애는 버튼도 없다.
- 근거. 회차 조작은 납부 토글(`FeeManagementTab.tsx:843-855`, `paidAmount: nextPaid ? inst.amount : 0` `:757`)과 삭제(`:892-928`)뿐. 실납부 표시 `:885-888`. `deleteFee`는 `accounting.ts:239`에 있으나 어느 화면도 부르지 않는다. 계약서 "업로드" 버튼은 `onClick`이 없어 눌러도 아무 일도 안 일어난다(`:464-468`).
- 고칠 방향. 회차 행에 연필(수정) 아이콘으로 예정일·예정액·실납부액·납부일을 편집하게 하고, 수임료 삭제(연결 매출 처리 안내 포함)와 계약서 업로드를 실제로 붙인다.

### 10. 저장 실패가 조용히 삼켜진다 (재무 탭 대부분) · 위험

- 어디서. 사건 상세 > 재무 탭 전체, 재무 관리 삭제, 설정 > 결제 내역
- 무슨 일이. 인터넷이 잠깐 끊긴 상태에서 납부완료를 누르면 화면은 아무 말이 없고, 새로고침하면 미납으로 돌아와 있다. 착수금 납부 버튼은 연타 방지가 실제로 안 되어 두 번 누르면 켜졌다 꺼진다. 결제 내역 조회가 실패하면 "결제 내역이 없습니다."로 보인다.
- 근거. `CaseDetailPage.tsx:229-231`(수임료 수정), `:245-247`(회차 생성), `:274-276`(회차 수정), `:288-290`(회차 삭제) 모두 `console.error`만. `FeeManagementTab.tsx:398-405`, `:490-497`의 `safeUpdate`는 `onUpdate`가 비동기라 `try/catch`가 잡을 게 없어 `alert`가 영원히 안 뜬다. 착수금 납부 버튼 `:568-583`은 `setBusy(true)` 뒤 동기 `finally`에서 곧바로 `setBusy(false)`. `FinancePage.tsx:191-193` 삭제 실패 `console.error`만. `SettingsPage.tsx:78-80` `.catch(() => {})`.
- 고칠 방향. 핸들러가 오류를 던지게 하고 화면에서 토스트로 "저장 실패, 다시 시도"를 보여준다.

### 11. 결제 성공 후 설정 화면이 옛 플랜을 보여준다 · 답답

- 어디서. 결제 완료 화면 → "설정으로 돌아가기"
- 무슨 일이. "결제가 완료되었습니다. 플랜이 즉시 적용되었습니다"를 읽고 설정으로 돌아오면 Pro 카드에 여전히 "업그레이드" 버튼이 있고 사용량 카드는 "Free"다. 브라우저 새로고침을 해야 바뀐다. 결제가 안 된 줄 알고 다시 누를 수 있다.
- 근거. `useAuth.ts:83-87`은 로그인 시점에 `getDoc` 한 번만 읽고 다시 읽는 함수가 없다. 서버는 REST로 `users/{uid}`를 갱신(`confirm.ts:124-127`)하지만 클라이언트 스토어는 모른다. `PaymentSuccessPage.tsx:65` `navigate("/settings")`는 클라이언트 이동이라 재조회가 없다.
- 고칠 방향. 승인 성공 시 사용자 문서를 다시 읽어 스토어에 넣거나, 성공 화면에서 전체 새로고침으로 이동한다. 중복 결제는 서버가 같은 `orderId`만 덮어쓰므로(`confirm.ts:129-130`) 돈이 두 번 나가진 않지만, 사용자가 새 주문을 만들면 두 번 나간다.

### 12. 영수증·세금계산서를 받을 길이 없다 · 답답

- 어디서. 설정 > 요금제 > 결제 내역
- 무슨 일이. 89,000원을 카드로 내고 나면 "Pro 플랜 · 2026. 9. 11. 결제 · 카드 · ₩89,000" 한 줄뿐이다. 영수증을 열 링크도, 세금계산서 신청도, 사업자번호를 넣는 칸도 없다. 매입세액공제를 받으려면 토스 고객센터에 물어봐야 한다.
- 근거. `confirm.ts:130-140`은 `method`·`status`·금액만 저장하고 토스 응답의 영수증 URL(`receipt.url`)은 버린다(`TossConfirmResponse` `:37-42`에 정의도 없음). 결제 내역 화면 `SettingsPage.tsx:428-485`에 링크·버튼 없음. `user.businessNumber`(`types/user.ts:27`)는 있으나 결제에 쓰이지 않는다.
- 고칠 방향. 승인 응답의 `receipt.url`을 `payments` 문서에 저장해 "영수증 보기" 링크를 달고, 세금계산서 발행 여부와 사업자번호 입력을 결제창에 둔다.

### 13. 해지·환불 안내가 없고, 결제창 제목이 "플랜 변경"이다 · 말

- 어디서. 결제창(PaymentModal), 설정 > 요금제
- 무슨 일이. 결제창 제목이 "플랜 변경"인데 실제로는 결제다. "자동 갱신이 아닙니다"는 있지만 중도 해지·환불이 되는지, 안 되는지 어디에도 없다. "다운그레이드" 버튼 코드는 있으나 Starter는 "가입 시 기본 제공", Team은 "출시 예정"이라 실제로는 절대 나오지 않는다.
- 근거. `PaymentModal.tsx:115` 제목, `:191-194` 안내문. `PlanSelector.tsx:191-217` 분기.
- 고칠 방향. 제목을 "Pro 결제"로, 안내문에 환불 규정 한 줄(예: 결제 후 7일 이내 미사용 시 전액 환불)과 문의 링크를 넣는다.

### 14. 무료 한도의 이름이 화면마다 다르다 (녹음 / 사건 분석 / 문서) · 말

- 어디서. 설정 > 요금제 카드·비교표, 사용량 카드, /pricing, 서버 오류 문구
- 무슨 일이. 요금제 카드는 "녹음: 5건/월", 바로 위 사용량 카드는 "사건 분석 5건", /pricing은 "사건 분석 월 5건", 한도 초과 오류는 "이번 달 사건 분석 5건". 녹음 5개를 했는지 사건 5개를 만들었는지 헷갈린다. 실제 카운트는 "사건(cases) 생성 수"다. 에이전트 수도 카드는 "4개 전체"인데 프로젝트 문서(CLAUDE.md 1.4)는 "6개 에이전트", Starter 가격도 문서는 49,000원·코드는 무료라 문서가 낡았다.
- 근거. `PlanSelector.tsx:39,92` "녹음", `UsageSummary.tsx:92` "사건 분석", `landingContent.tsx:126`, `plan.ts:185`. 카운트 기준 `usePlanLimits.ts:102-113`(cases), `plan.ts:175-178`. 에이전트 `PlanSelector.tsx:41,57,74` "4개 전체". Pro 89,000원은 `constants.ts:79`·`PlanSelector.tsx:51`·`landingContent.tsx:131`·`confirm.ts:23` 네 곳이 일치한다.
- 고칠 방향. 한 단어("사건 분석")로 통일하고 CLAUDE.md 1.4 요금표를 현재 값(Starter 무료·Team 준비중)으로 고친다.

### 15. 한도 초과 오류가 개발 용어로 나오고 갈 길이 링크가 아니다 · 말

- 어디서. 무료 플랜에서 4번째 문서 생성·6번째 분석을 시도할 때
- 무슨 일이. "Claude API 호출 실패: HTTP 402 무료 플랜의 이번 달 문서 생성 3건을 모두 사용했습니다. 설정 > 요금제에서 Pro로 업그레이드하면…"이 뜬다. "Claude API", "HTTP 402"는 뜻을 모르고, "설정 > 요금제"는 글자라 눌러서 갈 수 없다.
- 근거. 서버 문구 `plan.ts:187-194`(코드 `QUOTA_EXCEEDED`), 클라이언트 접두어 `claude.ts:403` `` `Claude API 호출 실패: HTTP ${response.status} ${detail}` ``. 402·`QUOTA_EXCEEDED`를 따로 처리하는 곳이 `src/`에 없다(grep 결과 0건).
- 고칠 방향. 402·`QUOTA_EXCEEDED`를 잡아 "이번 달 무료 한도를 다 썼습니다" 카드와 "Pro로 올리기" 버튼(설정>요금제로 이동)을 띄운다.

### 16. 만료 문자는 만료 7일 전 안에 로그인해야만 나가고, 전화번호가 없으면 조용히 안 나간다 · 답답

- 어디서. 상단 만료 배너, 문자
- 무슨 일이. 바빠서 열흘간 안 들어왔다면 만료 문자를 못 받는다. 프로필에 휴대폰을 안 적었으면 문자가 아예 안 가는데 그 사실을 아무 화면도 말해주지 않는다. 배너는 X를 누르면 그 세션 동안 사라진다.
- 근거. 발송 요청은 배너가 화면에 그려질 때만(`PlanExpiryBanner.tsx:24-28` → `notify.ts:43-49`), 예약 작업 없음(`expiry.ts` 주석 `:4` "본인 세션에서 호출"). 전화번호 없으면 `expiry.ts:65-68` `sent:false`만 반환. 배너 닫기 `PlanExpiryBanner.tsx:35-38`.
- 고칠 방향. 서버 예약(Cron)으로 D-7·D-1 발송하고, 전화번호가 없으면 배너에 "문자 알림을 받으려면 프로필에 휴대폰을 등록하세요" 링크를 넣는다.

### 17. 같은 달 매출이 탭마다 다른 숫자로 나온다 · 답답

- 어디서. 재무 관리 > 현황 대시보드 / 월별 정산 / 세무 자료
- 무슨 일이. 착수금 110만원(부가세 포함)을 받은 달에 대시보드 "총 매출"은 거래 합계(부가세 포함), 월별 정산 "착수금"은 수임료 카드의 납부액, 세무 자료 "총수입금액"은 공급가액이다. 세 탭이 세 숫자를 보여주고 왜 다른지 설명이 없다.
- 근거. 대시보드 `FinancePage.tsx:256-259` `tx.vat.totalAmount` 합. 월별 정산 `reportGenerator.ts:179-204` fee의 `paidAmount`, 자문료·기타만 거래에서(`:234-238`). 세무 자료 `taxCalculator.ts:321-324` `supplyAmount`.
- 고칠 방향. 각 카드 옆에 "부가세 포함/공급가액" 표기를 붙이고, 매출 원천을 하나(거래)로 통일한다.

### 18. 세무사에게 줄 Excel에 건별 세금계산서 정보가 없다 · 답답

- 어디서. 재무 관리 > 세무 자료 > Excel 내보내기
- 무슨 일이. 부가세 파일은 증빙유형별 합계·월별 합계뿐이고 거래 한 건 한 건(거래처 사업자번호, 세금계산서 승인번호, 공급일)이 없다. 세무사는 결국 홈택스 자료로 다시 맞춘다. 자동 생성 매출은 증빙이 전부 "없음"(발견 4)이라 "증빙 미비 N건"이 파일에 그대로 찍힌다.
- 근거. `excelExport.ts:314-430` 시트 4개 모두 집계 행. 거래상세 시트는 월별정산 파일에만 있고(`:181-221`) 열이 날짜·유형·적요·금액·결제수단·증빙유형까지다. 거래 타입에 사업자번호·승인번호 필드 자체가 없다(`types/accounting.ts` Transaction).
- 고칠 방향. 부가세 파일에도 거래상세 시트를 넣고, 매출 거래에 "세금계산서 발행일·승인번호" 입력을 추가한다.

### 19. /pricing의 "시작하기"가 로그인 화면으로만 간다 · 말

- 어디서. 검색 유입용 요금제 페이지(/pricing)
- 무슨 일이. 이미 로그인한 변호사가 Pro "시작하기"를 누르면 로그인 화면이 나온다. 결제로 이어지지 않는다. Team은 "준비중"인데 "69,000 /인 · 월"이라는 가격이 큼직하게 보인다.
- 근거. `seo/PricingPage.tsx:65-66` `<Link to="/login">`, `landingContent.tsx:147-154`.
- 고칠 방향. 로그인 상태면 `/settings`(요금제 탭)로, 아니면 로그인 후 그곳으로 돌려보낸다. 준비중 플랜은 가격 대신 "출시 예정"만.

## 확인된 것 (문제 아님)

- 결제 금액은 서버가 정한다. `confirm.ts:22-24,88-96`에서 플랜 요금표와 대조해 다르면 400. 본인 orderId만 승인(`:83-86`). 클라이언트가 `users.plan`을 못 바꾸는 규칙(`firestore.rules:49-50`).
- 무료 한도 "월"은 화면·서버 모두 달력 월 1일 기준이다(`usePlanLimits.ts:32-35` 로컬, `plan.ts:118-122` KST — 한국에서는 같음). 사용량 카드가 "2026.09.01 ~ 2026.09.30"으로 기간을 보여준다(`UsageSummary.tsx:64-67`).
- 정기결제가 아니라 1회 결제라는 점은 결제창(`PaymentModal.tsx:191-194`)과 설정(`SettingsPage.tsx:404`)에 적혀 있다.
- 결제 실패 화면은 토스가 넘긴 `message`(한국어)를 그대로 보여주고 기본 문구가 있다(`PaymentFailPage.tsx:7`). 영어 코드는 노출되지 않는다.
- 만료 후 데이터는 그대로 보인다. 플랜 판정은 AI 분석·전사·문자 발송 API에만 걸린다(`functions/api/claude.ts:53`, `transcribe.ts:19`, `notify/client.ts:42`). 재무 화면은 Firestore 직접 조회라 막히지 않는다.
- 사무소 경비·매입 거래는 등록·수정·삭제가 되고 삭제는 2단계 확인이다(`FinancePage.tsx:179-194`, 모달 2종).

## 확신이 낮은 항목

- 발견 6의 "소액사건 ×0.5 감액 규정 없음"과 "소액사건 기준 3,000만원": 기억에 의존했다. 법제처 원문(민사소송등인지법 제2조, 소액사건심판규칙 제1조의2)으로 확인 후 고칠 것.
- 송달료 1회분 단가 5,200원 "2025년 기준"(`courtFeeCalculator.ts:69`): 우편요금 인상으로 바뀌었을 가능성이 있다. 대법원 송달료규칙 고시 확인 필요.
- 발견 11의 "새 주문을 만들면 두 번 결제"는 코드 흐름상 가능하다는 추정이고, 토스 쪽 중복 방지는 확인하지 않았다.
- 토스 `failUrl`에 붙는 파라미터 이름이 `message`인지(`PaymentFailPage.tsx:7`)는 토스 문서를 열어 확인하지 않았다.
- `plan.ts:93-99`는 요금제 조회 자체가 실패하면 통과시킨다(fail-open). 사용자 불편은 아니지만 비용 누수 가능성으로 기록해 둔다.
