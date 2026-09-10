# R2-01 휴대폰 사용성 · 접근성 · 상태 표시 전수 점검

점검자 시점. 부산 1인 사무소 40대 후반 김 변호사. 법원 복도에서 아이폰 사파리(화면폭 390px)로 쓴다. 돋보기 없이 작은 글씨를 못 읽고, 엄지로 작은 버튼을 잘못 누른다. 화면 글자를 그대로 읽는다. 개발 용어를 모른다.

근거는 전부 클래스명·코드다. 실제 기기에서 돌려 본 것은 아니므로 픽셀 수치는 계산값이다.
기보고(r1-01~07)와 겹치는 항목은 뺐다. 같은 계열의 다른 사례만 적었다.

## 읽은 파일

- 레이아웃 전체. `src/components/layout/AppLayout.tsx` · `Header.tsx` · `Sidebar.tsx` · `NotificationBell.tsx` · `PlanExpiryBanner.tsx`
- 공통 UI 전체. `src/components/ui/ApiStatusMonitor.tsx` · `Badge.tsx` · `BugReportButton.tsx` · `ErrorFallback.tsx` · `GhostButton.tsx` · `Glass.tsx` · `GoldButton.tsx` · `Input.tsx` · `Pill.tsx` · `Select.tsx` · `Waveform.tsx` · `scroll-expansion-hero.tsx`
- `src/index.css` · `index.html` · `vite.config.ts` (tailwind.config는 없음. Tailwind v4 `@theme` 방식)
- 페이지 전체. `src/pages/RecordPage.tsx` · `AgentsPage.tsx` · `CheckpointPage.tsx` · `DocumentPage.tsx` · `CaseDetailPage.tsx` · `FinancePage.tsx` · `SigningPage.tsx` · `PortalPage.tsx` · `LandingPage.tsx` · `CasesPage.tsx` · `DashboardPage.tsx` · `CalendarPage.tsx` · `DocumentsPage.tsx` · `ClientsPage.tsx` · `SettingsPage.tsx` · `ProfileSetupPage.tsx` · `AdminPage.tsx` · `FreeformPage.tsx` · `LoginPage.tsx` · `PaymentSuccessPage.tsx` · `PaymentFailPage.tsx` · `PendingPage.tsx` · `App.tsx`
- 보조로 본 것. `src/hooks/useRecording.ts` · `useDocument.ts`(상태 부분) · `src/components/cases/CaseHeader.tsx` · `OverviewTab.tsx`(일부) · `src/components/payment/PaymentModal.tsx`(일부) · `src/components/accounting/FeeManagementTab.tsx`(일부) · 모달 컨테이너 클래스 전수 grep

## 발견

### 1. 첫 화면 영상이 펼쳐지기 전엔 상단 메뉴가 안 먹고, 메뉴 띠 가로 스크롤도 막힌다 · 심각도 막힘

- **어디서** 랜딩 `/` 첫 화면(히어로).
- **무슨 일이** 휴대폰으로 law-caddy.com을 열면 "스크롤하면 펼쳐집니다"가 뜬다. 나는 요금이 궁금해서 위쪽 메뉴 띠의 「수임료」를 누른다. 화면이 잠깐 움직이는 듯하다가 다시 맨 위로 튕긴다. 메뉴 띠를 옆으로 밀어 「질문」을 보려 해도 손가락에 아무 반응이 없다. 영상을 다 펼치기 전엔 이 페이지에서 아무 데도 못 간다.
- **근거**
  - `src/components/ui/scroll-expansion-hero.tsx:118-122` — 펼쳐지기 전(`!mediaFullyExpanded`)에는 `scroll` 이벤트마다 `window.scrollTo(0, 0)`. 앵커 이동(`#pricing`)도 스크롤 이벤트라 즉시 0으로 되돌린다.
  - `scroll-expansion-hero.tsx:86-112, 143-144` — `touchmove`를 `window`에 `passive: false`로 걸고 `e.preventDefault()`. 세로뿐 아니라 가로 터치 이동도 전부 막는다.
  - `src/pages/LandingPage.tsx:486-506` — 모바일 메뉴 띠가 `overflow-x-auto`인 가로 스크롤 요소. 위 `touchmove` 차단에 걸린다.
  - `LandingPage.tsx:512-514` 주석이 "상시 노출 동선은 상단 내비 '무료로 시작' 버튼이 맡는다"고 적어 놓았다. 즉 메뉴 앵커가 안 먹는 건 알고 있는 상태다.
- **고칠 방향** 펼쳐지기 전이라도 앵커 클릭은 통과시킨다(클릭 시 `mediaFullyExpanded`를 true로 만들고 이동). `touchmove` 차단은 히어로 영역 안에서만 걸고, 가로 이동(|dx| > |dy|)은 막지 않는다.

### 2. "동작 줄이기"를 켠 사람은 표제 「좋은 캐디가 절반을 합니다」를 영영 못 본다 · 심각도 막힘(접근성)

- **어디서** 랜딩 히어로.
- **무슨 일이** 멀미가 있어 아이폰 설정에서 「동작 줄이기」를 켜 둔 동료 변호사가 사이트를 열었다. 제목이 없고 영상만 있다. 히어로에 무슨 말을 하려는 건지 알 수 없다.
- **근거**
  - `scroll-expansion-hero.tsx:41-47` — `prefers-reduced-motion: reduce`면 `scrollProgress`를 처음부터 1로 둔다.
  - `scroll-expansion-hero.tsx:184` — `textTranslateX = scrollProgress * 180`(모바일). 진행도 1이면 180vw.
  - `scroll-expansion-hero.tsx:298-309` — h1의 두 span을 `translateX(-180vw)` / `translateX(+180vw)`로 밀어낸다. 화면 폭의 1.8배 밖이라 절대 안 보인다. `:272-287`의 부제 "1인 변호사 사무실 운영 SaaS"도 같이 나간다.
- **고칠 방향** 모션 최소화일 때는 `textTranslateX`를 0으로 고정하고 표제·부제를 그 자리에 둔다. (일반 사용자도 펼친 뒤엔 표제가 사라지는데, 이건 설계 의도라 여기선 접근성 경우만 적는다.)

### 3. 결제창이 검은 바탕에 검은 글씨다 · 심각도 막힘

- **어디서** 설정 → 요금제 → 플랜 선택 → 결제창.
- **무슨 일이** "플랜 변경" 제목, "선택한 플랜", 금액 설명, "결제 수단을 불러오는 중...", 하단 안내가 검정 남색 상자 안에 짙은 초록검정 글씨로 찍힌다. 돈 내는 화면인데 뭘 사는지 읽히지 않는다.
- **근거**
  - `src/components/payment/PaymentModal.tsx:112` — `bg-[#0f1729]`(옛 다크 테마 남색).
  - `PaymentModal.tsx:115, 165, 170, 175, 187, 191` — `text-text-primary` / `text-text-dim`. `src/index.css:17-18`에서 `--color-text-primary: #1e2a22`, `--color-text-dim: rgba(20,57,43,0.5)`. 둘 다 어두운 색이라 `#0f1729` 위에서 대비가 1.2:1 안팎이다.
  - 같은 계열. 알림 벨 드롭다운(`NotificationBell.tsx:93`)은 r1-06 #4에 기보고. 라이트 테마 전환 때 `#0f1729`를 남긴 곳이 이 둘이다.
- **고칠 방향** `bg-[#0f1729]`를 `bg-navy`(#f7f5ec) 또는 `bg-white`로 바꾼다. 저장소 전체에서 `0f1729`를 지운다.

### 4. 연한 분홍·연두 글씨가 크림 배경에 찍혀 안 보인다 — 수정된 문장 강조, 플랜 만료 배너, 결제 오류 · 심각도 위험

- **어디서** 문서 화면 「변경 강조」, 상단 플랜 만료 배너, 요금제 사용량, 결제창 오류.
- **무슨 일이** AI가 문서를 고쳐 주면 "바뀐 부분을 초록으로 표시했다"는데 내 눈엔 연두색 형광펜만 보이고 글자는 사라진 것처럼 보인다. 플랜 만료 7일 전 배너는 연분홍 글씨라 있는지도 모르고 지나친다. 결제가 실패했을 때 이유도 연분홍이다.
- **근거**
  - `src/pages/DocumentPage.tsx:553-561` — 바뀐 문장을 `<mark className="bg-emerald-500/15 text-emerald-300">`으로 그린다. `text-emerald-300`(#6ee7b7)은 다크 배경용 색. 크림(#f7f5ec) 위 대비 약 1.4:1. `:417`의 「변경 강조」 토글 버튼도 같은 색에 `text-[10px]`.
  - `src/components/layout/PlanExpiryBanner.tsx:42-46` — `text-red-300` / `text-amber-300` on `bg-red-500/10` / `bg-amber-500/10`. 배경이 거의 크림이라 글자 대비 1.5~1.8:1.
  - `src/components/payment/UsageSummary.tsx:108` — `text-amber-300`.
  - `PaymentModal.tsx:178` — 오류 문구 `text-red-300`.
- **고칠 방향** 테마에 있는 `text-success`(#2e6242) · `text-error`(#ba1a1a) · `text-warning`(#735c00)으로 바꾼다. `-300` 계열은 전부 다크 테마 잔재다.

### 5. 수임계약서 완료 패널이 휴대폰 높이를 넘어도 스크롤이 안 되고, 「PDF 다운로드」는 팝업이 막히면 무반응이다 · 심각도 위험

- **어디서** 사건 상세 → 수임계약서 생성 완료 뒤 뜨는 "수임계약서 완성" 패널.
- **무슨 일이** 계약서가 만들어졌다는 패널이 화면을 덮는다. 제목, 설명, 「Word 다운로드」「PDF 다운로드」 상자, 서명 링크 상자(입력칸 + 복사), 전화번호 입력 + 「문자로 보내기」, 안내문, 「완료」 버튼이 세로로 쌓인다. 사파리 위아래 막대를 뺀 높이(약 660px)를 넘기면 아래쪽 「문자로 보내기」「완료」가 잘려 나가고 스크롤도 안 된다. 뒤로 가려면 오른쪽 위 X를 찾아 눌러야 한다. 「PDF 다운로드」는 눌러도 아무 일이 없다.
- **근거**
  - `src/pages/CaseDetailPage.tsx:699-700` — `fixed inset-0 ... flex items-center justify-center p-4` 안에 `max-w-md w-full space-y-4`. 다른 모달(`NewCaseModal.tsx:67`, `OfficeExpenseModal.tsx:126`)에 있는 `max-h-[90vh] overflow-y-auto`가 여기엔 없다.
  - 내용 높이 추정. 제목 40 + 설명 20 + 1번 상자(p-4, 제목, 버튼 2.5) ~120 + 2번 상자(제목, 링크줄, 전화줄, 안내) ~190 + 완료 버튼 44 + 여백(space-y-4 × 5, p-6) ~130 → 약 640~700px. 390×664 화면에서 넘친다. (추정)
  - `CaseDetailPage.tsx:733-751` — `window.open('', '_blank')`로 새 창을 열고 `if (!printWindow) return;`. 아이폰 사파리는 사용자 제스처 이후의 비동기 창 열기·팝업 차단이 흔하고, 막히면 조용히 `return`이라 화면에 아무 표시가 없다. (r1-05 #22는 "인쇄 창이지 다운로드가 아니다"를 적었고, 여기는 휴대폰에서 아예 안 열리는 경우다.)
- **고칠 방향** 패널에 `max-h-[90vh] overflow-y-auto`. 「PDF 다운로드」는 `window.open`이 `null`이면 "팝업이 막혔습니다. 사파리 설정에서 팝업을 허용하거나 Word로 내려받으세요"를 인라인으로 띄운다. 가능하면 Word와 같은 방식(파일 생성)으로 바꾼다.

### 6. 서명 페이지에서 통신이 끊기면 "유효하지 않은 서명 링크입니다"라고 한다 · 심각도 위험

- **어디서** 의뢰인이 문자로 받은 `/sign/:token`.
- **무슨 일이** 의뢰인이 지하철에서 링크를 눌렀다. 데이터가 잠깐 끊겨 "🔗 유효하지 않은 링크 — 유효하지 않은 서명 링크입니다"가 떴다. 의뢰인은 내가 잘못된 링크를 보냈다고 전화한다. 새로고침하면 멀쩡히 열리는데, 화면은 "다시 시도"라는 말을 하지 않는다.
- **근거**
  - `src/pages/SigningPage.tsx:95-97` — `fetchSigningRequest`가 던지는 모든 예외(네트워크 실패 포함)를 `setPageState("not-found")`로 접는다.
  - `SigningPage.tsx:300-310` — `not-found` 화면은 링크가 틀렸다는 문구뿐이고 새로고침·재시도 버튼이 없다.
  - 대비. `src/pages/PortalPage.tsx:50-61, 72-88`은 404와 통신 오류를 나눠 "일시적인 오류가 발생했습니다 / 잠시 후 다시 시도해 주세요"를 띄운다. 서명 페이지만 못 나눈다.
- **고칠 방향** `resp.ok`가 아니거나 fetch가 던지면 `error` 상태를 따로 두고 "연결이 잠시 끊겼습니다" + 「다시 불러오기」 버튼.

### 7. 개인정보 동의서가 사진 한 장이라 휴대폰에선 읽을 수 없고, 화면 낭독기에도 안 잡힌다 · 심각도 위험

- **어디서** 서명 페이지 「개인정보 수집·이용 및 제공 동의서」.
- **무슨 일이** A4 한 장짜리 동의서가 350px 폭으로 줄어든 그림으로 나온다. 확대하지 않으면 글자가 점으로 보인다. 그런데 바로 아래 체크박스는 "위 계약 내용 및 개인정보 수집·이용·제공에 동의합니다"다. 읽지도 못한 문서에 동의하라는 셈이다. 시각장애가 있는 의뢰인이면 아예 내용이 없다.
- **근거**
  - `SigningPage.tsx:379-383` — `<img src="/privacy-consent.jpg" alt="개인정보 수집·이용 및 제공 동의서" className="w-full h-auto" />`. 본문 텍스트가 없고 alt는 제목 한 줄.
  - 계약서 본문(`:369-373`)은 `<pre>` 텍스트로 넣었으면서 동의서만 이미지다.
  - r1-05 #13은 "동의서가 두 번 나온다"를 다뤘다. 여기는 그 한 번이 이미지라는 점.
- **고칠 방향** 동의서를 텍스트(HTML)로 넣는다. 이미지가 꼭 필요하면 "원문 크게 보기" 링크를 함께 두고 alt에 요약을 적는다.

### 8. 재무 관리의 미수금·예수금 표가 휴대폰에선 라벨 없는 숫자 나열이 된다 · 심각도 위험

- **어디서** 재무 관리 → 현황 대시보드 → 미수금 현황, 예수금 현황.
- **무슨 일이** 미수금 한 줄이 "홍길동 / 민사 / 5,000,000원 / 2,000,000원 / 3,000,000원 / 45일"로 세로로 쌓인다. 어느 게 약정액이고 어느 게 입금액이고 어느 게 미수금인지 글자로는 알 수 없다. 색이 회색·초록·빨강으로 다를 뿐이다. 예수금도 "원금 / 잔액"이 라벨 없이 두 숫자다. 의뢰인 앞에서 "미수금이 얼마죠?"에 답하려면 화면을 세 번 봐야 한다.
- **근거**
  - `src/pages/FinancePage.tsx:763-770` — 열 머리(의뢰인/사건유형/약정액/입금액/미수금/연체일수)가 `hidden lg:grid`. lg(1024px) 미만에선 아예 없다.
  - `FinancePage.tsx:783-816` — 행이 `grid-cols-1 lg:grid-cols-12`. 각 칸에 라벨 없이 값만 있고, 구분은 `text-text-dim` / `text-success` / `text-error` 색뿐.
  - `FinancePage.tsx:867-874, 881-910` — 예수금도 같은 구조. 원금(`text-text-dim`) / 잔액(`text-info`).
  - 매출·경비 표(`:519, :616`)는 `sm:` 기준이라 폰에서 같은 문제. 다만 매출은 금액이 하나라 덜 헷갈린다.
- **고칠 방향** lg 미만에서는 카드형으로 바꾸고 각 값 앞에 "약정 / 입금 / 미수" 라벨을 붙인다(`<span class="lg:hidden">약정액</span>`).

### 9. 재무 항목 삭제가 "한 번 더 누르면 삭제"인데, 그 안내가 마우스 툴팁에만 있어 휴대폰에선 아무 말 없이 빨개진다 · 심각도 위험

- **어디서** 재무 관리 → 매입/경비 내역의 휴지통 버튼.
- **무슨 일이** 휴지통을 눌렀는데 지워지지 않고 버튼만 빨갛게 변한다. 고장인가 싶어 한 번 더 누르니 그 즉시 사라진다. 확인 창도 없고, 뭐가 지워졌는지도 없다. 첫 번째 클릭이 실수였다면 두 번째도 실수로 이어진다.
- **근거**
  - `FinancePage.tsx:179-194` — 첫 클릭은 `armedDeleteId` 세팅, 3초 안 두 번째 클릭이면 삭제.
  - `FinancePage.tsx:656-666, 704-714` — 안내 문구 "한 번 더 누르면 삭제됩니다"가 `title=` 속성에만 있다. 터치 기기엔 툴팁이 없다. 상태 변화는 `text-white bg-error` 색뿐이고 `aria-pressed`·문구 변경이 없다.
  - 버튼 자체가 `p-1.5` + 아이콘 14px = 약 26px. 옆의 연필(수정)과 `gap-1`(4px)로 붙어 있다.
- **고칠 방향** 무장 상태에서 버튼 글자를 "삭제 확인"으로 바꾸거나, 행 아래에 "정말 지울까요? [삭제] [취소]"를 인라인으로 띄운다(`CaseExpenseTab.tsx:898`이 이미 그 방식이다).

### 10. 체크포인트 답변 녹음이 마이크 권한 거부 시 아무 반응이 없고, 첨부 지우기 버튼이 14px이다 · 심각도 위험

- **어디서** 체크포인트 → 질문 펼침 → 「녹음」「파일 첨부」.
- **무슨 일이** 「녹음」을 눌렀는데 아무 일도 안 일어난다. 사파리에서 마이크를 한 번 거부한 적이 있어서인데, 화면은 그 말을 안 한다. 다시 눌러도 조용하다. 첨부한 파일 옆 X는 손톱보다 작아 옆의 KB 숫자를 누른다.
- **근거**
  - `src/pages/CheckpointPage.tsx:259-261` — `catch { // 마이크 접근 실패 }` 빈 블록. 상태도 문구도 안 바뀐다. (r1-03 #11의 녹음 화면 영어 오류와 다른 화면이고, 여기는 아예 무응답이다.)
  - `CheckpointPage.tsx:634-639, 652-657` — X 버튼이 `<button className="text-text-dim hover:text-error shrink-0">` + `w-3.5 h-3.5`. 패딩 0, 터치 면적 14×14px.
  - `CheckpointPage.tsx:562-568, 580-586, 608-615` — 「파일 첨부」「촬영」「녹음」이 `px-3 py-1.5 text-xs`. 높이 약 28px.
- **고칠 방향** catch에서 "마이크를 쓸 수 없습니다. 사파리 설정 → 마이크를 허용해 주세요"를 질문 카드 안에 인라인 표시. 삭제 X는 `p-2`(최소 40px) + `aria-label="첨부 삭제"`.

### 11. 대화상자 어디에도 Esc로 닫기·초점 가두기·`role="dialog"`가 없다 (결제창 하나만 예외) · 심각도 답답

- **어디서** 새 사건 등록, 사건 정보 수정, 사건 삭제 확인, 사무소 경비·매입 거래 등록, 성공보수 청구, 수임계약서 생성, 계약서 완료 패널, 버그 리포트.
- **무슨 일이** 키보드(블루투스 키보드·데스크톱)로 쓸 때 Esc를 눌러도 안 닫힌다. 탭 키를 누르면 초점이 대화상자 뒤 화면으로 새 나간다. 화면 낭독기는 대화상자가 열렸는지 모른다. 새 사건 등록은 바깥을 눌러도 안 닫히고, 버그 리포트는 바깥을 누르면 닫혀서 쓰던 글이 날아간다.
- **근거**
  - 저장소 전체 grep 결과 `Escape` 키 처리 0건, `role="dialog"`·`aria-modal`은 `src/components/payment/PaymentModal.tsx:104` 한 곳뿐.
  - `src/components/cases/NewCaseModal.tsx:66-73, 139` — 닫기는 X와 「취소」뿐. 배경 클릭 없음.
  - `src/components/ui/BugReportButton.tsx:109-111` — 배경 `onClick={handleClose}`가 입력 중 글을 지운다(`:89-94`).
  - `src/components/cases/CaseHeader.tsx:184-190, 309` · `src/components/accounting/OfficeExpenseModal.tsx:125-132` · `PurchaseTransactionModal.tsx:123-130` · `SuccessFeeClaimModal.tsx:155-162` · `ContractGenerateModal.tsx:177-181` · `CaseDetailPage.tsx:699-706` — 모두 `fixed inset-0` div + X 버튼. `role`·`aria-labelledby`·키 처리 없음.
- **고칠 방향** 공통 `Modal` 컴포넌트 하나로 모은다. `role="dialog" aria-modal="true" aria-labelledby`, Esc 닫기, 열릴 때 첫 입력칸 초점, 닫힐 때 원래 버튼으로 초점 복귀, 입력이 있으면 배경 클릭으로 닫지 않기.

### 12. 문서고·의뢰인·캘린더가 비어 있을 때 "가서 하세요"라고만 하고 갈 버튼이 없다 · 심각도 답답

- **어디서** 문서고, 의뢰인, 일정 캘린더, 재무 관리 첫 화면.
- **무슨 일이** 문서고를 열면 "아직 생성된 문서가 없습니다. 상담을 진행하면 문서가 여기에 쌓입니다." 끝. 캘린더는 "사건 상세의 [일정 관리] 탭에서 기한을 추가하세요"라는데 어느 사건인지, 어떻게 가는지 없다. 왼쪽 아이콘 메뉴를 다시 더듬어야 한다. (전역 원칙 §12-1 "가는 길을 말하지 말고 놓아라"에 정확히 걸린다.)
- **근거**
  - `src/pages/DocumentsPage.tsx:107-115` — 텍스트만. 버튼 없음.
  - `src/pages/ClientsPage.tsx:105-111` — "아직 등록된 의뢰인이 없습니다." 버튼 없음.
  - `src/pages/CalendarPage.tsx:247-250` — 문장 안에 "[일정 관리] 탭"이 글자로만.
  - `src/pages/FinancePage.tsx:403-433` — 빈 상태 카드가 "사건 상세 페이지의 [재무] 탭"을 굵은 글씨로만 적고 링크가 없다. 알약 3개(`:420-428`)도 `<span>`이라 눌리지 않는다.
  - 대비. `CasesPage.tsx:246-253` · `DashboardPage.tsx:331-337`은 「첫 상담 시작하기」 버튼이 있다. 이 패턴을 나머지에 안 옮겼다.
- **고칠 방향** 문서고·의뢰인 → 「새 상담 시작」 버튼. 캘린더 → 「사건 목록에서 기한 추가하기」(`/cases`) 버튼. 재무 → 알약을 `<Link to="/cases">`로.

### 13. 재무 관리 탭 3개가 휴대폰 폭을 넘쳐 잘린다 · 심각도 답답

- **어디서** 재무 관리 상단 「현황 대시보드 / 월별 정산 / 세무 자료」.
- **무슨 일이** 「세무 자료」 탭이 오른쪽으로 밀려 반쯤 잘리거나 화면이 옆으로 흔들린다. 사건 상세·설정의 탭은 옆으로 밀리는데 여기만 안 밀린다.
- **근거**
  - `FinancePage.tsx:366-387` — 컨테이너 `flex items-center gap-1 mb-6 border-b`. `overflow-x-auto`도 `flex-wrap`도 없다. 각 탭 `px-4 py-3 text-sm` + 아이콘 16px + `gap-2`.
  - 폭 계산. 본문 폭 = 390 − 사이드바 64(`AppLayout.tsx:30` `ml-16`) − 좌우 여백 48(`AppLayout.tsx:46` `p-6`) = 278px. 탭 3개 합 ≈ 154 + 126 + 126 + gap 8 ≈ 414px. 278px를 크게 넘는다.
  - 대비. `CaseDetailPage.tsx:552` · `SettingsPage.tsx:177`은 `overflow-x-auto`.
- **고칠 방향** 같은 컨테이너에 `overflow-x-auto` + `whitespace-nowrap`. 근본적으로는 폰에서 사이드바 64px + 여백 48px로 본문이 278px밖에 안 남는 구조(§1 계열, r1-02 #11에 아이콘 메뉴로 기보고)를 손봐야 모든 화면이 숨을 쉰다.

### 14. 상단 헤더가 64px 고정인데 제목·부제가 한 줄에 안 들어가면 줄바꿈되어 아래와 겹친다 · 심각도 답답

- **어디서** 모든 앱 화면 상단. 특히 새 상담("상담 녹음 → 자료 첨부 → AI 분석"), 체크포인트("홍길동 - 내용증명"), 추가 상담("홍길동 · 기존 사건에 추가").
- **무슨 일이** 제목 옆에 "/ 상담 녹음 → 자료 첨부 → AI 분석"이 붙는데 폭이 모자라 두세 줄로 꺾인다. 헤더 높이는 그대로라 글자가 헤더 밑 배너·본문 위로 흘러내린다. (추정. 줄바꿈 자체는 확실하고, 겹침 정도는 기기 폰트에 따라 다르다.)
- **근거**
  - `src/components/layout/Header.tsx:13` — `h-16`(64px 고정) + `px-6`.
  - `Header.tsx:15-23` — `flex items-center gap-2` 안에 `<h1 text-lg>` + `/` + `<span text-sm>`. `truncate`·`min-w-0`·`hidden sm:inline` 없음.
  - 가용 폭 ≈ 278px(위 계산) − 벨 36px − gap ≈ 230px. "새 상담 / 상담 녹음 → 자료 첨부 → AI 분석"은 18px·14px 글자로 약 330px.
  - `RecordPage.tsx:373` · `CheckpointPage.tsx:418` · `DocumentPage.tsx:347` · `CasesPage.tsx:152`에서 긴 부제를 넘긴다.
- **고칠 방향** 부제를 `hidden sm:inline` 또는 `truncate min-w-0`. 헤더는 `min-h-16`.

### 15. 아이폰에서 14px 입력칸을 누르면 화면이 저절로 확대되고 그대로 남는다 · 심각도 답답

- **어디서** 사건 검색창, 설정 프로필 입력, 체크포인트 답변칸, 상담 메모칸, 문서 화면 채팅칸, 재무 모달 입력 등.
- **무슨 일이** 검색창을 누르니 화면이 훅 커진다. 다 치고 나면 확대된 채라 좌우로 밀며 봐야 한다. iOS 사파리는 글자 크기 16px 미만인 입력칸에 초점이 가면 자동 확대한다.
- **근거**
  - `index.html:6` — `viewport ... initial-scale=1.0`. 확대 허용 상태(허용은 맞다. 문제는 입력칸 글자 크기다).
  - `CasesPage.tsx:162` · `DocumentsPage.tsx:90` · `ClientsPage.tsx:99` — 검색 `text-sm`(14px).
  - `SettingsPage.tsx:172-174` — `inputClass`가 `text-sm`.
  - `CheckpointPage.tsx:555` · `RecordPage.tsx:760` — `text-sm` textarea.
  - `DocumentPage.tsx:657, 763` — 채팅칸 `text-[15px]`. 이것도 16 미만이라 확대된다.
  - `CaseHeader.tsx:199-251` · `NewCaseModal` 등 모달 입력 `text-sm`.
  - 예외. `RecordPage.tsx:434`(의뢰인 이름)와 `FreeformPage.tsx:315`는 크기 지정이 없어 16px. 이 둘만 안 튄다.
- **고칠 방향** 입력칸 글자를 16px 이상으로(`text-base`). 화면 폭이 좁을 때만 키우려면 `text-base sm:text-sm`.

### 16. 오류가 `alert()` 창 20곳, `confirm()` 2곳으로 튀어나오고, 상단 오류 토스트는 닫기 버튼에 이름이 없다 · 심각도 답답

- **어디서** 사건 상세 → 재무 탭(수임료·분할납부·비용·예수금), 인지대 계산기, 관리자 탈퇴, 일정 삭제. 그리고 모든 화면의 API 오류 토스트.
- **무슨 일이** 영수증 사진을 올리다 실패하면 아이폰 특유의 "law-caddy.com 내용:" 회색 창이 뜬다. 앱이 아니라 웹사이트 경고처럼 보여 신뢰가 떨어진다. 기한 삭제는 "이 기한을 삭제하시겠습니까?" 확인 창이 뜨는데, 같은 화면의 서면 삭제는 확인 없이 지워진다(r1-06 #7). 기준이 없다. API 오류 상자는 오른쪽 위에 붙어 알림 벨을 가리고, 닫기 X에 이름이 없어 낭독기는 "버튼"이라고만 읽는다.
- **근거**
  - `alert(` 20곳. `src/components/accounting/FeeManagementTab.tsx:403, 495, 713, 744, 763, 903` · `CaseExpenseTab.tsx:232, 236, 256, 327, 345, 358` · `DepositManagementTab.tsx:274, 286, 319, 340, 959` · `CourtFeeCalculator.tsx:125, 128`. 성공 알림까지 alert다(`CourtFeeCalculator.tsx:125` "등록되었습니다").
  - `confirm(` 2곳. `src/pages/AdminPage.tsx:123` · `src/components/cases/ScheduleTab.tsx:209`.
  - `src/components/ui/ApiStatusMonitor.tsx:23` — `fixed top-4 right-4 max-w-sm`(384px). 390px 화면에서 오른쪽 16px 여백을 빼면 374px밖에 없어 왼쪽으로 삐져나갈 수 있다. `:33-35` 닫기 버튼 `aria-label` 없음, 자동으로 사라지지 않음.
  - `ApiStatusMonitor.tsx:29-31` — 사용자에게 주는 다음 행동이 "버그 리포트 버튼으로 관리자에게 알려주세요"뿐.
- **고칠 방향** 사건 상세에 이미 있는 하단 토스트(`CaseDetailPage.tsx:817-821`) 하나로 통일한다. 삭제는 인라인 확인(재무 화면 `CaseExpenseTab.tsx:898` 방식)으로. `ApiStatusMonitor`는 `role="alert"`, `aria-label="닫기"`, `max-w-[calc(100vw-2rem)]`.

### 17. 엄지로 못 누르는 크기의 버튼이 곳곳에 있다 (가입 화면 외) · 심각도 답답

- **어디서** 문서 화면 상단, 체크포인트, 사건 상세 상단, 사건 목록, 재무, 랜딩 상단.
- **무슨 일이** 문서 화면에서 「저장하기」를 누르려다 「내보내기」가 열린다. 사건 상세에서 연필(수정)을 누르려다 휴지통(삭제)을 누른다. 둘은 4px 간격이다. 랜딩 상단 「로그인」과 「무료로 시작」이 나란히 36px 높이다.
- **근거** (44px 기준. 계산은 패딩 + 글자/아이콘 높이)
  - `DocumentPage.tsx:429-431, 512-516` — 「내보내기」「저장하기」 `px-2.5 py-1 text-xs` ≈ 24px 높이. 문서를 지키는 가장 중요한 버튼이 가장 작다.
  - `DocumentPage.tsx:634-636, 741-743` — 채팅 첨부 파일 X `w-3 h-3` 패딩 0 = 12px.
  - `DocumentPage.tsx:982-987` — 「전체 선택」 `text-[11px]` 패딩 0.
  - `CaseHeader.tsx:136-149` — 수정·삭제 아이콘 `p-1.5` + 16px = 28px, `gap-2`. 삭제 옆에 수정.
  - `CaseDetailPage.tsx:534-540` — 「추가 자료 등록」(핵심 CTA) `px-4 py-2 text-xs` ≈ 32px.
  - `CasesPage.tsx:335-344` — 펼치기 `p-1` + 16px = 24px.
  - `CasesPage.tsx:505-518` — 결제수단 「카드/현금/이체」 `px-2 py-1 text-[11px]` ≈ 22px.
  - `FinancePage.tsx:589-602` — 「사무소 경비 등록」「매입 거래 등록」 `py-1.5 text-xs` ≈ 28px.
  - `RecordPage.tsx:478-492` — 복구 배너 「버리기」「불러오기」 `py-2 text-xs` ≈ 30px. "버리기"가 녹음을 영구 삭제하는 버튼인데 이 크기다.
  - `LandingPage.tsx:468-481` — 「로그인」「무료로 시작」 `py-2` ≈ 36px. `:497-505` 모바일 메뉴 알약 `py-1.5 text-[13px]` ≈ 30px.
  - `AdminPage.tsx:282-292` — 등록번호 복사 `w-3.5 h-3.5` 패딩 0.
- **고칠 방향** 최소 `min-h-11`(44px). 아이콘 버튼은 `p-2.5` 이상. 파괴적 버튼(삭제·버리기)은 다른 버튼과 12px 이상 띄운다.

### 18. 아이콘만 있고 이름이 없는 버튼 · 심각도 답답

- **어디서** 문서 화면 채팅, 새 상담 첨부 목록, 자유 지시 첨부 목록, 계약서 완료 패널, 사건 목록, 버그 리포트, 오류 토스트.
- **무슨 일이** VoiceOver를 켜면 "버튼, 버튼, 버튼"만 들린다. 어느 게 보내기이고 어느 게 닫기인지 알 수 없다. 저시력이라 아이콘이 무엇인지 안 보일 때도 같다.
- **근거** (`aria-label`도 글자도 없는 것)
  - `DocumentPage.tsx:659-665, 765-771` — 채팅 보내기 `<Send>`만.
  - `DocumentPage.tsx:687-689` — 모바일 채팅 닫기 `<X>`만.
  - `DocumentPage.tsx:642-649, 749-756` — 첨부는 `title="파일 첨부"`만(낭독기는 대체로 읽지만 터치 툴팁은 없음).
  - `RecordPage.tsx:742-747` — 첨부 파일 삭제 X. (같은 파일 `:613`의 녹음 삭제는 `aria-label`이 있는데 여긴 빠졌다.)
  - `FreeformPage.tsx:384-389` — 첨부 삭제 X.
  - `CaseDetailPage.tsx:703-705` — 계약서 패널 닫기 X.
  - `CasesPage.tsx:335-344` — 펼치기 `<ChevronRight>`만. `aria-expanded`도 없음.
  - `BugReportButton.tsx:121-123` — 모달 닫기 X.
  - `ApiStatusMonitor.tsx:33-35` — 닫기 X.
  - `CaseHeader.tsx:136-149` · `FinancePage.tsx:649-666` · `AdminPage.tsx:282-292` — `title`만.
- **고칠 방향** 전부 `aria-label` 추가. 펼치기 버튼은 `aria-expanded`. 공통 `IconButton` 컴포넌트에서 `aria-label`을 필수 prop으로.

### 19. 사건 목록의 「계약」「착수금」 표시가 색으로만 됐고 됐는지 안 됐는지를 말한다 · 심각도 답답

- **어디서** 사건 목록 각 행(휴대폰 행 포함).
- **무슨 일이** 행마다 "계약" "착수금" 글자가 똑같이 있다. 초록이면 됐고 회색이면 안 된 거라는데, 나는 초록과 회색을 잘 구분하지 못한다(색약 남성 약 5~8%). 글자도 10px다. 결국 눌러 들어가서 확인한다.
- **근거**
  - `CasesPage.tsx:292-316`(데스크톱), `:346-361`(모바일) — `cp?.contractSigned ? "bg-success/10 text-success" : "bg-surface text-text-dim/50"`. 글자 "계약" "착수금" 동일. `text-[10px]`. 데스크톱 쪽 `title="계약 체결"`도 상태를 말하지 않는다.
  - 같은 계열. `NotificationBell.tsx:13-17, 116-118` — 알림 심각도가 8px 색점(`w-2 h-2`)뿐. 글자 없음.
- **고칠 방향** "계약 완료 / 계약 전", "착수금 입금 / 착수금 미입금"처럼 글자를 바꾸거나 체크·빈원 아이콘을 붙인다. 12px 이상. 알림 점에는 `aria-label="긴급"` 또는 글자 배지.

### 20. 자료 첨부 화면의 「폴더 선택」 타일이 휴대폰에선 아무 소용이 없다 · 심각도 답답

- **어디서** 새 상담 → 자료 첨부.
- **무슨 일이** 「파일 선택」「폴더 선택」「카메라 촬영」 세 타일이 2열로 뜬다(하나는 홀로 남는다). 「폴더 선택」을 누르면 폴더는 못 고르고 그냥 파일 선택 창이 뜨거나 아무 일도 없다. 휴대폰에 폴더 고르기란 게 없다.
- **근거**
  - `RecordPage.tsx:678` — `grid grid-cols-2 sm:grid-cols-4`. 타일 3개라 2열이면 한 칸이 빈다.
  - `RecordPage.tsx:687-693` — `webkitdirectory` 입력. iOS 사파리·안드로이드 크롬은 지원하지 않는다(일반 파일 선택으로 동작하거나 무시).
  - 참고. 「파일 선택」(`:684`)에 `accept`가 없어 아이폰에서 "사진 보관함 / 사진 찍기 / 파일 선택"이 다 뜬다. 녹음 앱에서 공유한 m4a도 "파일 선택"으로 들어오니 이건 괜찮다.
- **고칠 방향** 「폴더 선택」 타일을 `hidden sm:flex`. 폰에서는 「파일 선택」「카메라 촬영」 2개만.

### 21. 문서 화면이 "화면 높이 − 140px"로 잠겨 있어 휴대폰에선 스크롤이 두 겹이고, 떠 있는 채팅 버튼이 본문을 가린다 · 심각도 답답

- **어디서** 문서 생성/수정 화면 「법률 문서」 탭.
- **무슨 일이** 문서 상자 안에서 스크롤하다 손가락이 상자 밖에 걸리면 페이지 전체가 움직인다. 상자 아랫부분은 화면 밖에 있어 두 번 스크롤해야 한다. 오른쪽 아래 노란 동그라미(채팅)와 그 밑 초록 동그라미(버그 리포트) 두 개가 본문 마지막 줄들을 가린다.
- **근거**
  - `DocumentPage.tsx:407` — `h-[calc(100vh-140px)]`. 그런데 그 위에 헤더 64(`Header.tsx:13`) + 본문 여백 24 + 「이전 단계」 ~32 + 탭 ~44 + 경고 배너 ~60 ≈ 224px. 84px가 화면 아래로 빠진다. iOS 사파리는 `100vh`가 주소창을 뺀 높이보다 커서 더 빠진다.
  - `DocumentPage.tsx:530` — 상자 안 `overflow-y-auto`. 바깥 `AppLayout.tsx:46`도 `overflow-y-auto`. 이중 스크롤.
  - `DocumentPage.tsx:671-676` — 채팅 버튼 `fixed bottom-24 right-6 w-14 h-14`. `BugReportButton.tsx:101` — `fixed bottom-6 right-6 w-12 h-12`. 오른쪽 아래 130px 세로 구간이 가려진다.
- **고칠 방향** 폰에서는 고정 높이를 풀고(`lg:h-[calc(100dvh-140px)]`) 문서를 페이지 흐름에 두어 스크롤을 한 겹으로. 문서 하단에 `pb-32` 여백. `100vh` 대신 `100dvh`.

### 22. 잔 글씨와 잔 문구 · 심각도 말

- **단계 표시가 숫자만 남는다** — `RecordPage.tsx:389-391` 단계 이름이 `hidden sm:inline`. 폰에서는 ①②③④와 화살표만 보여 지금이 무슨 단계인지 헤더 부제(§14에서 잘리는 그 부제)로만 안다.
- **스코어카드가 잘린다** — `LandingPage.tsx:369` 업무 이름이 `text-[12px] truncate`. 390px 폰(카드 폭 ≈ 370px, 12칸 중 5칸 ≈ 150px)에서 "판례 검색 · 쟁점 분석"이 "판례 검색 · 쟁…"으로 끊긴다. 열 머리 `:344` `text-[10px]`, 카드 머리 `:337` `text-[10px]`.
- **10~11px 글자 목록** (돋보기 없이 못 읽는 크기. 상태·날짜·안내처럼 읽어야 하는 것들) — `AgentsPage.tsx:409`(파일 추출 진행 문구 10px, 그것도 `truncate`) · `:432`(AI 정확성 경고 11px) · `:740`(질문 분류 10px) · `CheckpointPage.tsx:514`(분류 10px) · `DocumentPage.tsx:398`(검토 필수 경고 11px) · `:1003`("수정안이 문서에 적용됨" 11px) · `CaseDetailPage.tsx:802`("서명 링크는 24시간 유효" 11px) · `CasesPage.tsx:285`(등록일 10px) · `CalendarPage.tsx:220, 227`(달력 칸 일정 11px·"+N건" 10px) · `FinancePage.tsx:603, 687` · `BugReportButton.tsx:218`(붙여넣기 안내 10px) · `NotificationBell.tsx:83`(배지 숫자 10px) · 재무 컴포넌트 다수(`CaseExpenseTab.tsx` 10px 15곳, `CourtFeeCalculator.tsx:216` 9px).
- **고칠 방향** 화면에서 읽어야 하는 글자는 12px 밑으로 내리지 않는다. 경고·안내는 13px 이상. 카테고리 배지처럼 장식에 가까운 것만 11px 허용.

## 확신이 낮은 항목

- **재무 표의 폰 배치가 1열이 아니라 4열로 벌어질 수 있다.** `FinancePage.tsx:530, 629, 674`의 행이 `grid-cols-1 sm:grid-cols-12`인데 자식이 `col-span-2`·`col-span-4`·`col-span-3`을 그대로 갖는다. Tailwind v4에서 `col-span-4`는 `grid-column: span 4`이고, CSS 그리드는 명시 열이 1개여도 최대 span만큼 암시 열을 만든다. 그러면 폰에서 날짜·구분이 나란히, 이름이 한 줄, 금액·증빙이 나란히 놓이는 4열 격자가 될 가능성이 있다. 보기 나쁘지 않을 수도 있지만 의도(1열)와 다르고 `text-right` 칸이 이상한 자리에 갈 수 있다. 실기기 확인 필요.
- **사건 목록의 기간 필터 줄이 폰 폭을 넘칠 수 있다.** `CasesPage.tsx:196-211` — "기간" 라벨 + `type="date"` 2개 + "~"가 `flex items-center gap-2`로 한 줄. iOS 날짜 입력은 폭이 130px 안팎이라 합계 약 300px. 본문 폭 278px면 넘친다. 부모(`:195`)는 `flex-col sm:flex-row`라 줄 자체는 세로로 쌓이지만 이 내부 줄은 안 쌓인다.
- **§14 헤더 겹침의 정도.** 줄바꿈은 확실하나, 64px 헤더를 넘친 글자가 배너와 겹치는지 여백으로 밀리는지는 브라우저 렌더링에 달렸다.
- **§5 계약서 패널 높이.** 640~700px 추정은 기본 폰트·줄 간격 기준이다. 아이폰 SE(667px)나 사파리 툴바가 펼쳐진 상태에서는 거의 확실히 넘치고, 큰 폰 세로에서는 아슬아슬하게 들어갈 수 있다.
- **§1 앵커 차단.** `handleScroll`이 `scrollTo(0,0)`을 호출하는 건 확실하지만, 브라우저가 앵커 점프 뒤 `scroll` 이벤트를 어느 타이밍에 내보내는지에 따라 "잠깐 갔다 튕김"이 아니라 "아예 안 감"으로 보일 수도 있다. 어느 쪽이든 도착하지 못하는 결과는 같다.
