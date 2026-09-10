# LAW-CADDY 예행연습 r1-05 — 문서 생성 → 편집 → 내보내기 → 문서고 → 의뢰인 서명·포털

점검자 관점. 부산 1인 법률사무소 김 변호사(40대 후반, 비개발자). 서면은 한글(hwp/hwpx)로 법원에 낸다. 의뢰인은 카톡·문자로 연락한다. 화면 글자를 그대로 읽는다.

점검 방법. 화면에 뜨는 글자와 버튼의 동작을 코드로 끝까지 추적했다. 브라우저·개발 서버·실데이터는 쓰지 않았다. 추측인 항목은 "추측"이라고 적었다.

## 읽은 파일

- `src/pages/DocumentPage.tsx` (전체 1,012줄)
- `src/pages/DocumentsPage.tsx` (전체)
- `src/hooks/useDocument.ts` (전체)
- `src/hooks/useDocumentChat.ts` (전체)
- `src/services/hwpxExport.ts` (전체)
- `src/services/hwpx.ts` (전체)
- `src/services/docxExport.ts` (전체)
- `src/services/pdf.ts` (전체)
- `src/services/file-save.ts` (전체)
- `src/services/contractGenerator.ts` (전체)
- `src/pages/SigningPage.tsx` (전체)
- `src/pages/PortalPage.tsx` (전체)
- `functions/api/signing/[token].ts` (전체)
- `functions/api/portal/[token].ts` (전체)
- `functions/api/notify/client.ts` (전체)
- `firestore.rules` (전체), `storage.rules` (전체)
- 흐름 추적용 부분 읽기. `src/pages/CaseDetailPage.tsx` (340~440, 700~830), `src/components/cases/ContractGenerateModal.tsx` (100~220), `src/components/cases/ContractPaymentSection.tsx` (300~400), `src/components/cases/ClientCareTab.tsx` (90~175, 220~310), `src/components/cases/OverviewTab.tsx` (395~560), `src/services/firebase/firestore.ts` (250~380), `src/services/firebase/signing.ts` (전체), `src/services/notify.ts` (전체), `src/services/notifications.ts` (50~130), `src/services/prompts.ts` (86~130, 2294~2300, 2315~2370, 2454~2530), `src/services/claude.ts` (440~510), `src/pages/AgentsPage.tsx` (545~580), `src/pages/CheckpointPage.tsx` (380~420), `src/hooks/useCaseDetail.ts` (200~230), `src/types/signing.ts`, `src/types/document.ts`, `src/App.tsx` (라우트), `src/components/cases/UnifiedTimelineTab.tsx` (258~266)
- 검색으로 확인. `@media print`·`print:` 클래스가 `src/` 전체에 없음(CaseDetailPage 743줄 계약서 인쇄창 인라인 1건 제외). `beforeunload`·`useBlocker` 사용 0건. `deleteDocument` 함수 0건. `clientMessage`를 보여주는 화면이 DocumentPage 외에 0건.

---

## 발견

### 1. 새로고침 한 번에 문서가 다시 생성되고, 저장해 둔 본문을 덮어쓴다
- 심각도. **위험**
- 어디서. 문서 생성 화면(`/record/document`)
- 무슨 일이. 초안을 받아 AI 채팅으로 30분 고치고 "저장하기"까지 눌렀는데, 브라우저를 새로고침하면 화면이 "문서 생성 중..."으로 돌아가 **처음부터 다시 생성**하고, 생성이 끝나는 순간 그 새 초안이 Firestore의 저장본을 **덮어쓴다**. 30분 작업이 사라진다. 자동 검토도 다시 돌아 API 비용이 한 번 더 나간다.
- 근거.
  - `src/pages/DocumentPage.tsx:79-83` — 새로고침 시 sessionStorage에서 상태를 복원한다(`existingDocument`가 없는 새 문서 흐름이면 편집 결과는 저장돼 있지 않다).
  - `src/pages/DocumentPage.tsx:130-174` — `initialized`가 false로 시작하므로 복원된 상태로 `generateDocument()`를 다시 호출한다. `existingDocument`일 때만 건너뛴다(135-138).
  - `src/pages/DocumentPage.tsx:177-186` — `status === "completed"`가 되면 `docSaved`가 false이므로 `updateDocument(documentId, { finalDocument })`로 **무조건 덮어쓴다**.
  - `src/pages/DocumentPage.tsx:208-214` — 자동 검토(`startAutoReview`)도 다시 시작한다.
- 고칠 방향. 새로고침 시에는 Firestore에 저장된 `finalDocument`를 먼저 읽어 그대로 띄우고(있으면 재생성 금지), 재생성은 "다시 생성" 버튼을 누른 경우로만 한정한다.

### 2. AI가 고쳐 준 내용은 자동 저장되지 않고, 나갈 때 경고도 없다
- 심각도. **위험**
- 어디서. 문서 생성/수정 화면
- 무슨 일이. 제안을 적용하면 화면 본문은 바뀌지만 Firestore에는 저장되지 않는다. "저장됨"이라는 말이 따로 뜨지 않으니 저장된 줄 알고 "사건 상세"나 "이전 단계"를 누르면 바뀐 내용이 날아간다. 뒤로 가기·탭 닫기에도 아무 경고가 없다.
- 근거.
  - `src/hooks/useDocument.ts:257-273` — `updateFinalDocument`는 메모리(state)만 바꾼다. Firestore 호출 없음.
  - `src/hooks/useDocumentChat.ts:160-163, 216-219` — 수정안 적용 시 `onDocumentUpdate`만 부른다.
  - `src/pages/DocumentPage.tsx:300-336` — 저장은 "저장하기" 버튼(512-525)을 눌러야만 실행된다.
  - `src/pages/DocumentPage.tsx:349-361` — "사건 상세"/"이전 단계" 버튼은 저장 여부를 묻지 않고 바로 이동한다.
  - `beforeunload`·`useBlocker` 사용 0건(검색 결과).
- 고칠 방향. 수정안 적용 직후 자동 저장(디바운스)하고 상단에 "저장됨 HH:MM"을 상시 표시한다. 미저장 상태에서 이동·닫기 시 확인창을 띄운다.

### 3. "선택 적용"은 문서 전체를 AI 답변으로 통째 바꾸며, 되돌리기가 없다
- 심각도. **위험**
- 어디서. 문서 생성 화면 — AI 법률 비서 채팅
- 무슨 일이. 제안 1개를 적용해도 AI가 "문서 전체"를 다시 써서 보내고 그걸 그대로 본문에 넣는다. AI가 중간을 생략하거나 문단을 빼먹어도(프롬프트로 "생략 없이"라고 부탁만 해 둔 상태) 그대로 반영되고, 이전 본문으로 돌아갈 방법이 없다. "변경 강조"를 끄면 어디가 바뀌었는지도 사라진다.
- 근거.
  - `src/hooks/useDocumentChat.ts:44-56` — `===수정안===` 블록 안 텍스트를 통째로 꺼낸다.
  - `src/hooks/useDocumentChat.ts:214-219` — 꺼낸 텍스트를 검증 없이 `onDocumentUpdate(suggestedEdit)`로 본문 교체.
  - `src/services/prompts.ts:2511-2517` — "생략 없이 완전한 문서"는 프롬프트 요청일 뿐 길이·문단 수 검증 코드가 없다.
  - `src/pages/DocumentPage.tsx:413-422` — "변경 강조 끄기"만 있고 "되돌리기" 버튼 없음. `useDocument.ts`에 이전 버전 스택 없음(129 `finalDocRef` 하나뿐).
- 고칠 방향. 적용 전 본문을 버전 스택에 쌓아 "되돌리기"를 제공하고, 새 본문이 기존보다 30% 이상 짧아지면 적용 전에 경고한다.

### 4. 저장·내보내기가 실패해도 화면은 아무 말이 없다
- 심각도. **위험**
- 어디서. 문서 생성 화면 — "저장하기", "DOCX 다운로드", "HWP 다운로드"
- 무슨 일이. 네트워크가 끊기거나 권한 오류가 나면 "저장 중..."이 잠깐 돌다가 그냥 "저장하기"로 돌아온다. 오류는 개발자 콘솔에만 찍힌다. 변호사는 저장된 줄 안다. 문서 생성 완료 시 자동 저장(177-186)과 의뢰인 메시지 저장(198-205)도 마찬가지다.
- 근거.
  - `src/pages/DocumentPage.tsx:331-335` — `catch (err) { console.error(...) }` 뿐, 화면 상태 변경 없음.
  - `src/pages/DocumentPage.tsx:183-186, 202-204` — `.catch(console.error)`.
  - `src/pages/DocumentPage.tsx:454-457, 476-479` — 내보내기 실패도 `console.error`만.
  - `src/components/cases/OverviewTab.tsx:497, 516` — 사건 상세의 다운로드도 동일.
- 고칠 방향. 실패 시 빨간 배너로 "저장하지 못했습니다. 다시 시도" 버튼을 띄우고, 성공 시각을 표시한다.

### 5. 의뢰인 메시지 생성이 실패하면 멀쩡한 문서가 "문서 생성 실패"로 바뀌고, "다시 시도"가 문서를 재생성한다
- 심각도. **위험**
- 어디서. 문서 생성 화면 — "의뢰인 메시지" 탭 → "법률 문서" 탭
- 무슨 일이. 문서는 잘 나왔는데 카톡 메시지 생성만 실패하면(API 오류), 문서 탭으로 돌아왔을 때 본문이 사라지고 "문서 생성 실패" 화면이 뜬다. 거기서 "다시 시도"를 누르면 문서를 처음부터 다시 만든다(1번과 같은 덮어쓰기 경로). 정작 메시지 탭에는 오류 문구가 전혀 없고 "메시지 생성" 버튼만 다시 보인다.
- 근거.
  - `src/hooks/useDocument.ts:244-251` — 메시지 생성 실패 시 문서와 **같은** `status`를 `"error"`로, `error`에 메시지를 넣는다.
  - `src/pages/DocumentPage.tsx:536-550` — `status === "error" && docError`이면 `finalDocument`가 있어도 실패 화면을 그린다. "다시 시도"는 `setInitialized(false)` → 130-174 효과가 다시 돌아 `generateDocument()`.
  - `src/pages/DocumentPage.tsx:796-816` — 메시지 탭은 `generating_message`/`clientMessage`/그 외 세 갈래뿐, 오류 표시 없음.
- 고칠 방향. 문서 상태와 메시지 상태를 분리하고, 메시지 오류는 메시지 탭 안에서 보여 준다.

### 6. "PDF 인쇄"를 누르면 어두운 앱 화면 전체(사이드바·채팅창 포함)가 인쇄된다
- 심각도. **막힘**
- 어디서. 문서 생성 화면 — 내보내기 → "PDF 인쇄"
- 무슨 일이. `window.print()`만 호출한다. 인쇄용 스타일이 하나도 없어서 남색 배경, 왼쪽 메뉴, 오른쪽 AI 채팅, 상단 경고 배너가 그대로 프린터로 간다. 문서 본문은 스크롤 박스 안에 있어서 한 페이지 분량만 찍히거나 잘린다(추측 — 박스가 `overflow-y-auto`·고정 높이라 브라우저에 따라 다르다). 법원에 낼 PDF로 쓸 수 없다. 반면 수임계약서는 별도 흰 창을 열어 인쇄하므로(CaseDetailPage 729-757) 같은 앱 안에서 방식이 다르다. 한글 글꼴 자체는 브라우저 시스템 글꼴을 쓰므로 깨지지 않는다.
- 근거.
  - `src/pages/DocumentPage.tsx:498-507` — `window.print()` 직접 호출.
  - `src/pages/DocumentPage.tsx:407, 530` — 본문이 `h-[calc(100vh-140px)]` 고정 높이 + `overflow-y-auto` 박스 안.
  - `src/` 전체 검색 — `@media print` 0건, Tailwind `print:` 클래스 0건(계약서 인쇄창 인라인 CSS `CaseDetailPage.tsx:743` 1건뿐).
- 고칠 방향. 계약서처럼 본문만 담은 흰 인쇄 창(휴먼명조·A4 여백·쪽번호)을 열거나, hwpx 내보내기 후 한글에서 PDF로 저장하도록 안내한다.

### 7. 문서를 손으로 직접 고칠 수 없다 — 오탈자 하나도 AI에게 부탁해야 한다
- 심각도. **답답**
- 어디서. 문서 생성/수정 화면 — 본문 영역
- 무슨 일이. 본문은 읽기 전용 `<div>`다. "원고 김○○"을 "원고 김철수"로 바꾸는 것도 채팅에 "원고 이름을 김철수로 바꿔 줘"라고 쓰고 AI가 문서 전체를 다시 쓰길 기다려야 한다(3번 위험까지 동반). 변호사가 문장 하나 다듬는 데 1~2분씩 든다.
- 근거.
  - `src/pages/DocumentPage.tsx:552-567` — `<div className="whitespace-pre-wrap ...">{finalDocument}</div>`, `contentEditable`·`textarea` 없음.
  - `src/hooks/useDocument.ts:54` — 본문 갱신 경로는 `updateFinalDocument`(채팅 콜백)뿐.
- 고칠 방향. 본문을 편집 가능한 영역으로 바꾸고 "직접 편집 / AI 수정" 두 길을 모두 둔다.

### 8. 잘못 만든 초안을 지울 수도, 제목을 바꿀 수도 없다
- 심각도. **답답**
- 어디서. 사건 상세 서류철(OverviewTab), 문서고(`/documents`)
- 무슨 일이. 같은 사건에 "소장"을 세 번 뽑으면 서류철에 "소장 / 소장 / 소장"이 날짜만 다르게 남는다. 어느 것이 최종본인지 표시할 수 없고, 실패한 초안도 영원히 남는다. Firestore 규칙은 삭제를 허용하는데 화면·서비스 함수가 없다.
- 근거.
  - `src/services/firebase/firestore.ts:256-370` — `createDocument`·`getAllDocuments`·`getDocuments`·`getDocument`·`updateDocument`만 있고 삭제 함수 없음(검색 `deleteDocument` 0건).
  - `src/components/cases/OverviewTab.tsx:466-533` — 문서 항목 버튼은 복사·다운로드·"AI 수정" 셋뿐.
  - `src/pages/DocumentsPage.tsx:127-158` — 행 전체가 사건 이동 버튼 하나.
  - `firestore.rules:105-108` — `allow ... delete: if isOwner()` 허용됨.
  - 문서 제목은 `docType`(유형명) 그대로 표시(`OverviewTab.tsx:428`, `DocumentsPage.tsx:141`). 별도 제목 필드 없음(`src/types/document.ts:19-40`).
- 고칠 방향. 문서에 `title`·`isFinal` 필드를 두고 이름 바꾸기·삭제(휴지통)·최종본 표시를 넣는다.

### 9. 문서고에서 문서를 눌러도 문서가 아니라 사건 페이지로 간다. 정렬·사건별 필터도 없다
- 심각도. **답답**
- 어디서. 문서고(`/documents`)
- 무슨 일이. 본문 검색으로 원하는 문서를 찾았는데 행을 누르면 사건 상세로 가서, 거기서 다시 서류철을 펼쳐 같은 문서를 찾아야 한다. 오래된 순·유형별 정렬, 의뢰인(사건)별로 모아 보기 같은 게 없다.
- 근거.
  - `src/pages/DocumentsPage.tsx:133-135` — `navigate(\`/cases/${d.caseId}\`)`. 문서 ID를 넘기지 않는다.
  - `src/pages/DocumentsPage.tsx:151-156` — 버튼 문구도 "사건으로".
  - `src/pages/DocumentsPage.tsx:53-57, 93-101` — 필터는 문서 유형 하나. 정렬은 `firestore.ts:294` 생성일 내림차순 고정.
- 고칠 방향. 행 클릭 시 해당 문서를 바로 열고(`existingDocument` 상태로 `/record/document` 이동), 의뢰인·상태 필터와 정렬을 추가한다.

### 10. 서명 링크는 24시간 만료인데, 변호사 화면은 만료를 모르고 "서명 대기"라며 죽은 링크를 복사해 준다
- 심각도. **위험**
- 어디서. 사건 상세 — 수임계약/서명 요청 내역(ContractPaymentSection)
- 무슨 일이. 어제 만든 링크를 오늘 의뢰인이 "안 열려요"라고 하면 변호사는 목록에서 "서명 대기" 상태와 "서명 링크" 버튼을 보고 같은 링크를 다시 보낸다. 서버는 **의뢰인이 링크를 열어야만** 상태를 "만료"로 바꾸기 때문이다. 재발급 버튼도 없어서 착수금·성과보수를 처음부터 다시 입력해 계약서를 새로 만들어야 한다.
- 근거.
  - `src/components/cases/ContractGenerateModal.tsx:143` — 만료 24시간.
  - `functions/api/signing/[token].ts:91-99` — 만료 판정과 `status: "expired"` 갱신은 GET(의뢰인 열람) 시점에만.
  - `src/components/cases/ContractPaymentSection.tsx:325-329` — 라벨은 `request.status`만 보고 결정, `expiresAt` 비교 없음.
  - `src/components/cases/ContractPaymentSection.tsx:371-380` — `status === "pending"`이면 "서명 링크" 복사 버튼 노출.
  - 재발급·연장 함수 없음(`src/services/firebase/signing.ts`에는 `createSigningRequest`·`getSigningRequestsByCase`뿐).
- 고칠 방향. 목록에서 `expiresAt < now`면 "만료"로 표시하고, 같은 계약서로 새 토큰을 만드는 "링크 다시 보내기" 버튼을 둔다. 만료 기간도 24시간은 짧다(주말·야간 고려, 72시간 이상 검토).

### 11. 만료·오류 화면이 막다른 골목이다 — "변호사에게 요청하세요"인데 연락처가 없다
- 심각도. **말**
- 어디서. 서명 화면(`/sign/:token`) 만료 상태, 포털(`/portal/:token`) 오류 상태
- 무슨 일이. 의뢰인이 문자로 받은 링크를 열었더니 "서명 기한이 만료되었습니다. 변호사에게 다시 요청해 주세요."만 뜬다. 전화번호·카톡 채널·사무소명이 없다(만료 상태에서는 사무소명도 화면에 안 그린다). 의뢰인은 문자를 다시 뒤져야 한다. 전역 규칙 §12-1(막다른 안내 금지) 위반.
- 근거.
  - `src/pages/SigningPage.tsx:287-297` — 만료 카드에 `firmName`·`lawyerName` 미표시, 링크·전화 없음.
  - `functions/api/signing/[token].ts:52-67, 106-113` — 서버가 사무소명·변호사명만 주고 전화번호는 내려주지 않는다.
  - `src/pages/PortalPage.tsx:78-84` — "담당 변호사에게 새 링크를 요청해 주세요." 역시 연락처 없음.
- 고칠 방향. 만료·오류 카드에 사무소명과 `tel:` 전화 링크를 넣는다(서버 응답에 `lawyerPhone` 추가).

### 12. 의뢰인이 서명해도 변호사에게 알림이 오지 않는다
- 심각도. **답답**
- 어디서. 서명 완료 처리(서버) → 변호사 앱
- 무슨 일이. 의뢰인이 밤에 서명해도 문자·카톡·푸시가 없다. 변호사가 앱에 로그인해 알림 목록을 열어야 "수임계약 서명 완료"가 보이고, 그것도 최근 7일치를 조회할 때만이다. 열람 여부(`openedAt`)는 타입에만 있고 기록되지 않아 "봤는데 안 한 건지, 못 본 건지"도 알 수 없다.
- 근거.
  - `functions/api/signing/[token].ts:135-204` — POST는 Firestore 갱신만 하고 알림 전송 없음.
  - `functions/api/signing/[token].ts:73-124` — GET에서 `auditTrail.openedAt`을 쓰지 않는다(`src/types/signing.ts:35`에는 필드 존재).
  - `src/services/notifications.ts:76-100` — 로그인 후 목록 조회 시에만 "서명 완료" 항목 생성.
- 고칠 방향. 서명 완료 시 변호사 휴대폰으로 문자 1건(솔라피, 이미 `_shared/solapi.ts` 있음). GET 첫 열람 시 `openedAt` 기록.

### 13. 서명 화면에서 개인정보동의서가 두 번 나오고, 본문의 "[ ] 동의합니다" 칸은 누를 수 없다
- 심각도. **말**
- 어디서. 서명 화면(`/sign/:token`)
- 무슨 일이. 계약서 텍스트 끝에 개인정보동의서 전문(5개 항목, 각각 "[ ] 위 … 동의합니다")이 붙어 나오고, 그 아래 같은 동의서가 **이미지**(`privacy-consent.jpg`)로 또 나온다. 의뢰인은 "[ ]"를 눌러 보지만 반응이 없고, 결국 맨 아래 체크박스 하나로 계약+개인정보+AI 활용+교육자료 활용까지 일괄 동의한다. 동의서 본문에는 "AI 활용·교육자료 활용은 거부해도 불이익 없음"이라 써 놓았는데 개별 거부가 불가능하다. 계약서는 고정폭 글꼴(`font-mono`)이라 휴대폰에서 한글이 어색하게 보인다.
- 근거.
  - `src/services/contractGenerator.ts:35-37` — 동의서 텍스트를 계약서 뒤에 붙인다. `375, 396, 408, 432, 451` — "[ ] … 동의합니다" 5회. `429-430, 449` — 거부 가능 문구.
  - `src/pages/SigningPage.tsx:369-373` — 전문을 `<pre font-mono>`로 표시. `376-385` — 이미지 동의서 별도 표시. `391-401` — 체크박스 하나.
- 고칠 방향. 텍스트 동의서 하나만 남기고(이미지 삭제) 항목별 체크박스 5개로 나눈다. 필수/선택을 구분해 선택 항목은 거부 가능하게. 글꼴은 본문 글꼴로.

### 14. 계약서·서명 화면 문구가 법률 원문 그대로다
- 심각도. **말**
- 어디서. 서명 화면(계약서 전문), 계약서 DOCX
- 무슨 일이. 의뢰인이 읽는 화면에 "기명날인", "인장조각", "위임사무", "상소심", "면소, 공소기각(판결), 기소유예", "선량한 관리자의 주의의무", 영문 "Attorney-Client Privilege"가 설명 없이 나온다. 계약서는 법률문서라 조문 자체를 바꾸긴 어렵지만, 서명 화면 위쪽에 "이 계약서는 무엇이고 어디를 보면 되는지" 한 줄 안내가 없다. 전역 규칙 §12 기준(읽는 사람이 실제로 쓰는 말) 미달.
- 근거.
  - `src/services/contractGenerator.ts:162` (위임한계·심급), `185` (인장조각), `199` (기명날인), `101` (면소·공소기각·기소유예), `306` (Attorney-Client Privilege 영문).
  - `src/pages/SigningPage.tsx:355-366` — 제목 "사건위임계약서"와 사무소명뿐, 읽는 법 안내 없음.
- 고칠 방향. 서명 화면 상단에 쉬운 말 요약 3줄(착수금·성과보수·연락처)을 두고, 어려운 조항 옆에 괄호 병기("기명날인(이름을 쓰고 도장을 찍음)")를 붙인다.

### 15. 버튼은 "HWP 다운로드"인데 나오는 파일은 .hwpx다. 같은 앱 다른 화면은 "한글 (HWPX)"라고 쓴다
- 심각도. **말**
- 어디서. 문서 생성 화면 내보내기 메뉴 / 사건 상세 서류철 다운로드 메뉴
- 무슨 일이. 변호사는 ".hwp 파일이 온다"고 기대한다. 실제로는 `.hwpx`가 내려오고, 한글 2020 이전 버전(구버전 사무실 PC)에서는 열리지 않는다. 안내가 없다.
- 근거.
  - `src/pages/DocumentPage.tsx:486` — "HWP 다운로드".
  - `src/services/hwpxExport.ts:482` — 파일명 `*.hwpx`.
  - `src/components/cases/OverviewTab.tsx:521` — "한글 (HWPX)".
  - `src/services/hwpx.ts:3` — 주석 "HWPX는 한컴오피스 2020부터 기본 저장 형식".
- 고칠 방향. 두 화면 모두 "한글 (HWPX)"로 통일하고 "한글 2020 이상에서 열립니다" 한 줄 부기.

### 16. hwpx 내보내기는 줄 단위 텍스트 변환이라 쪽번호·들여쓰기·표가 없다
- 심각도. **답답**
- 어디서. 내보내기 → 한글(HWPX), 계약서 Word
- 무슨 일이. 글꼴(휴먼명조 12pt·줄간 250%·A4)은 실무 서면에 맞췄지만, 머리글·바닥글·쪽번호가 없어 법원 제출 전에 한글에서 손봐야 한다. 각 줄의 앞 공백을 지워(`trimStart`) 청구취지·증거목록의 들여쓰기가 사라진다. AI가 마크다운 표(`| … |`)를 쓰면 파이프 문자가 그대로 본문에 남는다(확신 낮음 — 아래 참조). 계약서 완성 창에는 hwpx 버튼이 아예 없고 Word만 있다(전역 규칙 §10-1은 hwpx가 기본).
- 근거.
  - `src/services/hwpxExport.ts:405-446` — 섹션 설정에 머리글/바닥글/쪽번호 정의 없음.
  - `src/services/hwpxExport.ts:58, 156` — `line.trimStart()` 후 본문 단락에 넣음.
  - `src/services/hwpxExport.ts:57-164` — `|` 표 처리 분기 없음.
  - `src/pages/CaseDetailPage.tsx:716-728` — 계약서는 "Word 다운로드"만.
- 고칠 방향. 바닥글에 쪽번호 삽입, 앞 공백을 보존(전각 공백 또는 들여쓰기 paraPr), 계약서 창에도 한글(HWPX) 버튼 추가.

### 17. 변호사가 타임라인에 쓴 메모 제목이 의뢰인 포털에 그대로 나간다
- 심각도. **위험**
- 어디서. 사건 상세 타임라인 "메모 추가" → 의뢰인 포털 "최근 진행 내역"
- 무슨 일이. 메모 입력칸은 "메모 제목 / 상세 내용"뿐이고 "의뢰인에게 보입니다"라는 표시가 없다. 서버는 상세(`detail`)만 숨기고 제목(`label`)은 포털에 노출한다. 변호사가 "의뢰인 진술 앞뒤 안 맞음 — 확인 필요", "패소 가능성 높음, 화해 유도"처럼 제목을 쓰면 의뢰인이 본다. 사건 상태 "보류"도 설명 없이 그대로 보인다. 전역 규칙 §21(손님에게 확정적 판단 금지)이 사람 손을 거치지 않고 새는 경로다.
- 근거.
  - `functions/api/portal/[token].ts:30-47` — `label`만 추출해 노출(주석 "내부 메모 detail은 노출하지 않음"). `101` — 최근 5건.
  - `src/hooks/useCaseDetail.ts:203-221` — 메모는 `type: "note"`로 같은 `timeline`에 들어간다. 타입 필터 없음.
  - `src/components/cases/UnifiedTimelineTab.tsx:258, 264` — placeholder "메모 제목"·"상세 내용을 입력하세요...". 포털 노출 안내 없음.
  - `src/pages/PortalPage.tsx:20-24, 112-114` — 상태 "보류"를 그대로 배지로 표시.
- 고칠 방향. 포털에는 `type`이 `doc`·`filing`·`response`·`consult`인 이벤트만 내보내고 `note`는 제외한다. 메모 입력칸에 "의뢰인 포털에 표시 안 됨"을 명시. "보류"는 의뢰인에게 "검토 중"으로 바꿔 보여 준다.

### 18. 서명 링크만 있으면 누구나 서명할 수 있다 — 본인 확인 단계가 없다
- 심각도. **위험**
- 어디서. 서명 화면(`/sign/:token`)
- 무슨 일이. 토큰 자체는 UUID라 추측할 수 없고, 의뢰인이 Firestore를 직접 읽지 못하게 규칙도 막혀 있다(잘 돼 있음). 그러나 문자·카톡으로 받은 링크를 가족·지인에게 전달하면 그 사람이 이름 확인이나 휴대폰 인증 없이 서명을 완료할 수 있다. 수임계약서는 착수금 수백만 원이 걸린 문서다. 서버가 IP·기기 정보는 남기지만 "누가" 서명했는지는 남지 않는다.
- 근거.
  - `src/components/cases/ContractGenerateModal.tsx:140` — `crypto.randomUUID()` (추측 불가).
  - `firestore.rules:233-237` — 미인증 읽기 차단. 서버 경유만 가능(`functions/api/signing/[token].ts:1-13`).
  - `functions/api/signing/[token].ts:135-192` — POST에 이름·전화번호·인증번호 검증 없음. 서명 이미지 형식·크기만 확인(145-150).
  - `src/pages/SigningPage.tsx:206-249` — 동의 체크 + 그림 서명만.
- 고칠 방향. 서명 전 "이름 + 휴대폰 뒷자리" 확인 또는 문자 인증번호 1회(솔라피 이미 연결됨). 서명 시 입력한 이름을 `auditTrail`에 저장.

### 19. 새로고침 후 상태를 못 읽으면 "사건 정보가 없습니다"만 뜨고 갈 곳이 없다
- 심각도. **막힘**
- 어디서. 문서 생성 화면
- 무슨 일이. 상담 대화록·첨부 파일 텍스트 전체가 화면 상태로 실려 오는데(길면 수만 자), 이를 sessionStorage에 저장하다 용량을 넘기면 조용히 건너뛴다. 이후 새로고침하면 "사건 정보가 없습니다." 한 줄만 있고 사건 목록·대시보드로 가는 링크가 없다. 문서는 Firestore에 있는데 화면에서 닿을 방법이 없다(추측 — 용량 초과가 실제로 얼마나 자주 나는지는 미확인. 다만 막다른 화면 자체는 확정).
- 근거.
  - `src/pages/DocumentPage.tsx:76` — `try { sessionStorage.setItem(...) } catch { /* quota */ }`.
  - `src/pages/AgentsPage.tsx:571-573` — `transcript`·`fileContents` 전체를 라우터 state로 전달.
  - `src/pages/DocumentPage.tsx:338-343` — 링크·버튼 없는 안내 문구만.
- 고칠 방향. 상태에는 `documentId`·`caseId`만 싣고 나머지는 Firestore에서 다시 읽는다. 안내 화면에 "사건 목록으로" 버튼.

### 20. 만들어 둔 의뢰인 카톡 메시지를 나중에 다시 볼 화면이 없고, 복사 말고는 보낼 길이 없다
- 심각도. **답답**
- 어디서. 문서 생성 화면 "의뢰인 메시지" 탭 → 사건 상세
- 무슨 일이. 메시지는 Firestore `documents.clientMessage`에 저장되지만 사건 상세·문서고 어디에도 표시되지 않는다. 그 자리에서 "복사"해 카톡에 붙여 넣지 않으면 다시 열 수 없다(AI 수정으로 문서를 열어도 메시지 탭은 비어 있어 새로 생성해야 한다). 케어 메시지 탭에는 "문자로 보내기"가 있는데 이 탭에는 없다.
- 근거.
  - `src/pages/DocumentPage.tsx:198-205` — 저장. `785-793` — 복사 버튼만.
  - `clientMessage` 표시 화면 검색 — DocumentPage 외 0건(`OverviewTab.tsx` 0건).
  - `src/components/cases/ClientCareTab.tsx:140-155` — 문자 발송은 케어 탭에만.
- 고칠 방향. 서류철 문서 항목에 "의뢰인 메시지 보기/문자로 보내기" 추가. 기존 문서 열 때 저장된 메시지를 탭에 복원.

### 21. 자동 검토가 강제로 돌고, 적용할 때마다 또 돈다 — 끌 수 없다
- 심각도. **답답**
- 어디서. 문서 생성 화면 AI 법률 비서
- 무슨 일이. 초안이 나오자마자 검토 요청이 자동 전송되고, 제안을 적용하면 0.8초 뒤 다시 검토 요청이 간다. 변호사가 "이제 됐다"고 해도 매번 새 제안이 쌓이며 시간·API 비용이 든다. 끄는 스위치가 없다.
- 근거.
  - `src/pages/DocumentPage.tsx:208-214` — 생성 완료 즉시 `startAutoReview()`.
  - `src/hooks/useDocumentChat.ts:232-261` — 적용 후 `setTimeout(..., 800)`으로 재검토.
  - `src/services/prompts.ts:2526-2528` — "변호사가 만족할 때까지 반복".
- 고칠 방향. "자동 재검토" 토글(기본 켬)과 "이 문서 검토 마침" 버튼.

### 22. 계약서 "PDF 다운로드"는 다운로드가 아니라 인쇄 창이다
- 심각도. **말**
- 어디서. 사건 상세 — "수임계약서 완성" 창
- 무슨 일이. 버튼을 누르면 새 창이 뜨고 브라우저 인쇄 대화상자가 열린다. "PDF로 저장"은 브라우저마다 위치가 다르고 휴대폰에서는 팝업이 막히면 아무 일도 안 일어난다(`window.open`이 null이면 조용히 return). 변호사는 "파일이 어디 갔지"를 찾는다.
- 근거.
  - `src/pages/CaseDetailPage.tsx:729-757` — `window.open('', '_blank')` → `document.write` → `print()`. `731` — 팝업 차단 시 `if (!printWindow) return;` 안내 없음.
  - `src/pages/CaseDetailPage.tsx:756` — 버튼 문구 "PDF 다운로드".
- 고칠 방향. 문구를 "인쇄 / PDF로 저장"으로 바꾸고, 팝업이 막히면 안내 문구 표시. 가능하면 hwpx 버튼 추가(16번).

---

## 확신이 낮은 항목

- **16번 표(`|`) 문제.** "표가 효과적인 경우 마크다운 표를 사용"(`prompts.ts:55`)은 `SHARED_AGENT_PREFIX` 안의 지시인데, 문서 초안 프롬프트(`buildDocgenPrompt`)가 이 prefix를 포함하는지까지는 확인하지 못했다(`prompts.ts:320`에서 어떤 빌더가 쓰는지 미추적). 초안에 표가 실제로 나오는지는 추측이다. 들여쓰기 유실·쪽번호 부재는 확정.
- **6번 인쇄 시 본문이 잘리는지.** 고정 높이·스크롤 박스 안 내용을 브라우저가 인쇄 때 어떻게 펼치는지는 브라우저별로 달라 실행해 봐야 안다. 다크 배경·사이드바·채팅창이 함께 인쇄되는 것은 확정(인쇄용 CSS 0건).
- **19번 sessionStorage 용량 초과 빈도.** 대화록 길이가 5MB를 넘는 일이 실제로 얼마나 있는지는 미확인. 막다른 화면(링크 없음) 자체는 확정.
- **휴대폰에서 hwpx/docx 다운로드.** `file-saver`의 `saveAs`(hwpxExport.ts:483, docxExport.ts:174)는 iOS Safari에서 새 탭으로 열리거나 "파일" 앱에 저장 위치를 물어 사용자가 어디 갔는지 모르는 경우가 있다고 알려져 있으나 이 코드로 실측하지 않았다(추측). 앱은 "모바일 퍼스트"를 표방(CLAUDE.md 2.4)하므로 실기기 확인이 필요하다.
- **1번의 범위.** `existingDocument` 모드(사건 상세에서 "AI 수정"으로 연 경우)는 새로고침 시 재생성하지 않는다(135-138). 다만 그 경우도 `existingFinalDocument`는 열 때의 sessionStorage 사본이라 저장 후 새로고침하면 저장 전 본문으로 되돌아가 보인다(추측 — 저장 시 sessionStorage를 갱신하는 코드가 없으므로 그럴 것으로 봄).
- **3번 자동 적용의 발동 조건.** 일반 질문에도 AI가 `===수정안===` 블록을 붙이면 사용자가 "적용"을 누르지 않았는데도 본문이 바뀐다(`useDocumentChat.ts:158-163`, 주석은 "변호사가 직접 수정 요청한 경우"라고 가정). 프롬프트가 잘 지켜지면 드물겠지만 방어 코드는 없다.
