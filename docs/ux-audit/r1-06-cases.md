# LAW-CADDY 예행연습 r1-06 — 사건 목록·상세·의뢰인·일정 (김 변호사 시점)

점검일 2026-09-11. 점검자 관점은 부산 1인 사무소 변호사(비개발자, 진행 사건 30~40건). 화면 글자와 버튼 동작을 코드로 끝까지 따라갔고, 브라우저·실데이터는 열지 않았다. 추측인 항목은 그렇게 적었다.

## 읽은 파일

- 화면. `src/pages/CasesPage.tsx`, `src/pages/CaseDetailPage.tsx`, `src/pages/ClientsPage.tsx`, `src/pages/CalendarPage.tsx`, `src/pages/DashboardPage.tsx`(기한 관련 grep만)
- 훅. `src/hooks/useCases.ts`, `src/hooks/useCaseDetail.ts`, `src/hooks/useClientCare.ts`, `src/hooks/useDropZone.ts`
- 사건 컴포넌트. `src/components/cases/` 전체 — `NewCaseModal`, `CaseHeader`, `OverviewTab`, `UnifiedTimelineTab`, `ScheduleTab`, `ClientCareTab`, `CaseRecordsTab`, `OpponentDocs`, `DocumentsTab`, `TimelineTab`, `CaseAssistantTab`(구조만)
- 레이아웃. `src/components/layout/Sidebar.tsx`, `Header.tsx`, `NotificationBell.tsx`, `AppLayout.tsx`
- 서비스. `src/services/firebase/firestore.ts`, `firebase/storage.ts`, `notifications.ts`, `notify.ts`, `pdf.ts`(추출 부분), `clova-ocr.ts`, `caseRecordClassifier.ts`, `evidence-registry.ts`, `caseAssistant.ts`
- 서버. `functions/api/clova-ocr.ts`, `functions/api/notify/client.ts`, `functions/api/_shared/plan.ts`, `functions/api/_middleware.ts`(공개 경로 확인)
- 타입·규칙. `src/types/case.ts`, `deadline.ts`, `caseRecord.ts`, `clientCare.ts`, `src/index.css`(테마 색), `firestore.rules`, `storage.rules`

---

## 발견

### 1. 사건번호·전화번호로는 사건을 못 찾는다 · 답답

- 어디서. 사건 관리(목록) 화면, 검색창.
- 무슨 일이. 법원 참여관이 "2026가단12345 건이요"라고 전화하면 검색창에 사건번호를 쳐도 아무것도 안 나온다. 의뢰인 번호가 발신자로 떠도 번호로는 못 찾는다. 이름과 "사건 개요" 글자만 검색된다. 목록 행에도 사건번호·법원이 안 보여서 같은 이름 의뢰인이 사건 2개면 눌러 봐야 안다.
- 근거. `src/pages/CasesPage.tsx:93-94` — `clientName`·`description`만 `includes`. 자리표시자 `:161` "의뢰인 이름 또는 사건 내용 검색...". 행 표시는 `:283-288`(이름·개요만). 반면 의뢰인 화면은 전화번호 검색이 된다(`src/pages/ClientsPage.tsx:79`).
- 고칠 방향. 검색 대상에 `caseNumber`·`clientPhone`(숫자만 비교)·`opponentName`·`courtName`을 넣고, 목록 행에 사건번호를 한 줄 더 보여준다.

### 2. 사건을 지우면 기한·녹음·문서·기록이 유령으로 남고, 안내문은 반대로 말한다 · 위험

- 어디서. 사건 상세 → 휴지통 → "사건 삭제" 확인창.
- 무슨 일이. 확인창은 "관련 녹음, 문서, 상대방 서면 기록은 별도로 보관됩니다"라고 하지만 실제로는 사건 문서 하나만 지운다. 녹음·문서·상대방 서면·사건기록·기한·수임료·서명요청은 전부 남는데 들어갈 사건이 없어 화면에서 사라진다. 특히 **기한은 캘린더와 알림 벨에 이름 없는 항목으로 계속 뜨고**, 누르면 "사건을 찾을 수 없습니다"가 나온다. 파일(Storage)도 그대로 남는다.
- 근거. 안내문 `src/components/cases/CaseHeader.tsx:320-323`. 삭제 실행 `src/hooks/useCaseDetail.ts:655-660` → `src/services/firebase/firestore.ts:671-682`(`cases/{id}` 한 건만 `deleteDoc`). 하위 정리 코드 없음. 캘린더는 `deadlines` 전체를 읽고 사건이 없으면 이름을 빈 문자열로 둔다(`src/pages/CalendarPage.tsx:77`, 클릭 `:218,:256`). 알림 벨도 같은 컬렉션을 그대로 읽는다(`src/services/notifications.ts:32-59`). 의뢰인 케어 메시지는 부모 사건 문서를 `get()`하는 규칙이라 사건이 지워지면 읽지도 지우지도 못한다(`firestore.rules:85-92`). Storage 파일 삭제 호출(`deleteObject`)은 코드베이스 전체에 없다(`src/services/firebase/storage.ts`에 업로드 함수 3개뿐).
- 고칠 방향. 삭제 시 하위 컬렉션(deadlines·case_records·opponentDocs·recordings·documents·fees 등)과 Storage 파일을 함께 지우거나, 최소한 안내문을 사실대로("기한·문서가 같이 삭제됩니다" 또는 "보이지 않게 됩니다")로 바꾼다. 더 안전한 길은 삭제 대신 `status: "보관"` 같은 숨김 처리다.

### 3. 기한을 "끝냈다"고 표시할 방법이 없어 지난 기한이 영원히 "지연"으로 남는다 · 위험

- 어디서. 사건 상세 → 일정 관리 탭, 일정 캘린더, 헤더 알림 벨.
- 무슨 일이. 답변서를 제때 냈어도 마감일이 지나면 그 기한은 빨간 "지연 · N일 경과"가 되고, 캘린더 상단 "지연된 기한 N건" 배너와 알림 벨 "기한 지연:"에 계속 쌓인다. 없애려면 삭제해야 하는데 그러면 "언제 냈다"는 기록이 사라진다. 사건 40건이면 몇 주 만에 진짜 지연과 처리 완료가 구분되지 않는다.
- 근거. 기한 타입에 완료 필드가 없다(`src/types/deadline.ts:14-27`). 상태는 오늘 날짜만으로 계산(`:39-44`, `dDay > 0`이면 무조건 `overdue`). 일정 탭에 있는 조작은 수정·삭제뿐(`src/components/cases/ScheduleTab.tsx:403-424`). 캘린더 배너 `src/pages/CalendarPage.tsx:142-151`, 알림 벨 `src/services/notifications.ts:42-49`.
- 고칠 방향. `done: boolean`·`doneAt`을 추가하고 "완료" 체크 버튼을 둔다. 완료된 기한은 지연 집계·알림·배너에서 뺀다.

### 4. 알림 벨 드롭다운이 검은 바탕에 검은 글씨다 (기한 알림이 보이지 않을 가능성) · 막힘

- 어디서. 모든 화면 상단 헤더 → 종 모양 버튼.
- 무슨 일이. 기한이 7일 안으로 들어오면 알리는 곳은 이 종 하나뿐이다(대시보드에는 기한 항목이 없다). 그런데 드롭다운 배경은 짙은 남색(`#0f1729`)으로 고정돼 있고, 제목·내용 글자색은 라이트 테마 토큰(`text-text-primary` = `#1e2a22`, `text-text-dim` = 반투명 짙은 녹색)이다. 앱 전체가 라이트 테마로 바뀐 뒤 이 컴포넌트만 남은 것으로 보인다. 렌더링을 직접 보지는 않았으나 색 값만으로 판단하면 글자가 거의 안 읽힌다.
- 근거. `src/components/layout/NotificationBell.tsx:93`(`bg-[#0f1729]`), `:120-123`(`text-text-primary`·`text-text-dim`). 토큰 값 `src/index.css:17-18`. 대시보드에 기한 관련 코드 없음(`src/pages/DashboardPage.tsx` grep "기한|Deadline|일정" 결과 0건).
- 고칠 방향. 드롭다운 배경을 `bg-navy`(테마 토큰)로 바꾸고 실제 화면에서 대비를 확인한다. 아울러 대시보드에 "이번 주 기한" 박스를 둔다.

### 5. 항소기간 같은 법정 기간을 계산해 주지 않는다 · 답답

- 어디서. 사건 상세 → 일정 관리 → 기한 추가.
- 무슨 일이. "판결 송달 9월 10일, 항소 14일"을 넣으면 마감일이 나오길 기대하지만, 마감일 달력을 직접 골라야 한다. "기산일 설명"·"법적 근거"는 메모 칸일 뿐 계산에 쓰이지 않는다. 안내문도 "정확한 기한은 … 직접 확인하시기 바랍니다"로 끝난다. 분류에 "불변기간"·"법정기간"이 있어서 계산해 줄 것처럼 보인다.
- 근거. 폼 `src/components/cases/ScheduleTab.tsx:452-511`(`formDueDate`는 `type="date"` 수동 입력, `baseDateLabel`·`rule`은 문자열 저장만). 저장 `:174-206`. 안내문 `:541-549`. 분류 목록 `src/types/deadline.ts:4-10`.
- 고칠 방향. "기산일 + 기간(일) → 마감일" 자동 계산과 자주 쓰는 기간 버튼(항소 14일, 즉시항고 7일, 답변서 30일 등)을 넣고, 초일불산입·공휴일 다음날 규칙을 표시한다.

### 6. 서면·기록 업로드가 실패하면 아무 말도 없이 폼만 남는다 · 막힘

- 어디서. 사건 상세 → 활동 기록 탭 "상대방 서면 등록", 사건기록 탭 "기록 업로드".
- 무슨 일이. 파일이 50MB(서면)·100MB(기록)를 넘거나, 로그인이 풀렸거나, 네트워크가 끊기면 업로드 버튼이 돌다가 원래대로 돌아오고 목록에 아무것도 안 생긴다. 왜 안 되는지 문구가 없다. 변호사는 몇 번 더 눌러 보다가 포기한다.
- 근거. `src/components/cases/UnifiedTimelineTab.tsx:169-179`(`try/finally`만, `catch` 없음), `src/components/cases/CaseRecordsTab.tsx:135-144`(같은 구조). 서비스가 던지는 문구는 "상대방 서면 업로드 실패: …"(`src/services/firebase/storage.ts:88-93`) "사건기록 업로드 실패: …"(`:120-125`)인데 화면에 닿지 않는다. 용량 제한 `storage.rules:38-43, 52-55`.
- 고칠 방향. 두 핸들러에 `catch`를 넣어 폼 아래에 빨간 문구로 보여주고, 용량 초과는 업로드 전에 파일 크기로 미리 막는다.

### 7. 서면·기록·케어 메시지 삭제가 확인 없이 즉시 실행되고, 실패해도 표시가 없다 · 위험

- 어디서. 사건기록 탭 휴지통, 의뢰인 케어 탭 휴지통, 활동 기록 탭 상대방 서면 삭제(이건 확인 있음).
- 무슨 일이. 사건기록의 휴지통을 잘못 누르면 확인 없이 바로 사라진다. 서버 삭제가 실패해도 화면에서는 이미 지워져 있어 새로고침해야 돌아온다. 실패 문구는 어디에도 안 뜬다. 삭제되더라도 Storage 원본 파일은 남는다(내려받기 주소가 살아 있다).
- 근거. 사건기록 `src/components/cases/CaseRecordsTab.tsx:146-153`(`confirm` 없음, `catch` 없음) → `src/hooks/useCaseDetail.ts:368-377`(목록에서 먼저 제거 후 삭제, 주석 "Storage 원본은 별도 정리"). 상대방 서면 `useCaseDetail.ts:277-285` 같은 구조. 케어 메시지 `src/components/cases/ClientCareTab.tsx:195-202`(`catch` 없음). 반면 활동 기록 탭의 서면 카드는 2단계 확인이 있다(`UnifiedTimelineTab.tsx:701, 728-735`). 참고로 `storage.rules:38-43, 52-55`의 `allow write`는 `request.resource.size`를 참조해 삭제 요청(resource 없음)을 거부하는 조건이지만, 코드가 삭제를 시도하지 않아 지금은 드러나지 않는다. 나중에 파일 삭제를 붙이면 이 규칙에 막힌다.
- 고칠 방향. 사건기록·케어 메시지 삭제에 확인창을 붙이고, 실패 시 목록을 되돌리며 문구를 보여준다. `storage.rules`에 `allow delete: if isAuthenticated() && request.auth.uid == ownerId`를 따로 두고 삭제 시 파일도 지운다.

### 8. 의뢰인 케어 "문자 발송"은 실제로 나가지만, 보냈다는 기록이 3초 뒤 사라진다 · 위험

- 어디서. 사건 상세 → 의뢰인 케어 탭 → 생성된 메시지 → "문자 발송".
- 무슨 일이. 버튼을 누르면 Solapi로 진짜 문자(LMS)가 나간다. "발송됨"이 3초 보이고 원래 "문자 발송"으로 돌아온다. 사건 기록(활동 기록)에도 남지 않고 메시지에도 표시가 없어, 다음 날 "이거 보냈던가?"를 알 수 없다. 같은 메시지를 두 번 보내거나 안 보낸 줄 알고 넘어간다. 안내문은 "카카오톡 메시지를 자동 생성"이라고 해서 카톡으로 가는 줄 알기 쉽다.
- 근거. 발송 `src/components/cases/ClientCareTab.tsx:160-176`(`setSentId` 후 3초 뒤 해제 `:169-170`, `addTimelineEvent`·Firestore 기록 없음). 서버 `functions/api/notify/client.ts:74-76`(발송만, 로그 저장 없음). "카카오톡" 문구 `ClientCareTab.tsx:309`. 메시지 생성 시에는 타임라인에 남긴다(`src/hooks/useClientCare.ts:181-186`)는 점과 대비된다.
- 고칠 방향. 발송 성공 시 메시지 문서에 `sentAt`·`sentTo`를 저장하고 카드에 "9월 11일 14:02 010-…로 발송"을 고정 표시, 활동 기록에도 남긴다. 안내문의 "카카오톡"은 "문자(LMS)"로 바로잡는다.

### 9. 케어 메시지는 화면에서 고칠 수 없고, 900자를 넘으면 보낼 때 가서야 막힌다 · 답답

- 어디서. 의뢰인 케어 탭 메시지 카드.
- 무슨 일이. AI가 만든 문구에서 한 줄만 고치고 싶어도 편집칸이 없다(읽기 전용). 900자를 넘긴 메시지는 "문자 내용이 너무 깁니다. (최대 900자, 현재 1,120자)"가 뜨는데 화면에서 줄일 수 없어 복사 → 다른 곳에서 편집 → 카톡으로 보내야 한다. 무료 플랜이면 눌러 본 뒤에야 "유료 요금제가 필요한 기능입니다"를 본다.
- 근거. 읽기 전용 표시 `src/components/cases/ClientCareTab.tsx:465-467`. 길이 제한 `functions/api/notify/client.ts:15, 61-66`. 플랜 제한 `:42`, 문구 `functions/api/_shared/plan.ts:106-110`. 버튼은 번호 길이만 검사한다(`ClientCareTab.tsx:426-427`).
- 고칠 방향. 카드에 편집(textarea) 모드와 글자 수 표시(900자 기준)를 두고, 무료 플랜은 버튼 옆에 미리 안내한다.

### 10. 사건기록 PDF는 앞부분만 읽고도 "분석 가능"이라고 한다 · 위험

- 어디서. 사건 상세 → 사건기록 탭 → 상태 배지.
- 무슨 일이. 전자소송에서 받은 200쪽 기록을 올리면 글자 15,000자(대략 10~15쪽)까지만 읽고 나머지는 "(이하 생략)"으로 잘린다. 스캔본이면 OCR을 10쪽까지만 돌린다. 그런데 배지는 초록색 "분석 가능"이고, 이어지는 "AI 분석"·"반박 준비서면 초안"은 이 잘린 텍스트로 만들어진다. 변호사는 기록 전체를 분석한 줄 안다(§25 원칙과 정면 충돌).
- 근거. `src/services/pdf.ts:17`(`MAX_CHARS_PER_FILE = 15_000`), `:21`(`MAX_OCR_PAGES = 10`), 잘림 `:142-146`, OCR 상한 `:164`. 상태 저장 `src/hooks/useCaseDetail.ts:404-417`(잘렸는지 여부 저장 안 함). 배지 문구 `src/components/cases/CaseRecordsTab.tsx:83-87`("분석 가능"). 분석은 `parsedText.slice(0, 18000)`(`useCaseDetail.ts:485`).
- 고칠 방향. 추출 결과에 `truncated`·`pagesRead/pagesTotal`을 저장하고 배지를 "일부만 읽음(12/200쪽)"으로 표시, 분석 버튼 옆에 경고를 붙인다. 긴 기록은 서버에서 나눠 처리한다.

### 11. OCR·자동 분류 결과를 화면에서 확인·수정할 수 없고, 실패하면 다시 시도할 버튼이 없다 · 답답

- 어디서. 사건기록 탭 카드.
- 무슨 일이. 추출된 글자를 볼 수 있는 곳이 없어서 OCR이 "갑 제3호증"을 "갑 제8호증"으로 읽어도 모른다. 문서 종류·제출자가 틀려도 고칠 칸이 없다(타입 주석은 "사용자가 UI에서 직접 변경 가능"이라 한다). "파싱에 실패했습니다. … 다시 시도해 주세요"라고 하지만 다시 시도 버튼이 없어 지우고 다시 올려야 한다. 업로드 직후 다른 화면으로 나가면 브라우저에서 돌던 추출이 끊겨 "텍스트 추출 중"에 영원히 머문다. 또 업로드 폼이 항상 "기타/미상"을 넘겨서 파일명 자동 분류는 실제로 쓰이지 않는다.
- 근거. `CaseRecordsTab.tsx` 전체에 `parsedText` 표시·편집 없음(grep 0건), 종류·제출자 편집 UI 없음. 주석 `src/types/caseRecord.ts:6-7`. 실패 문구 `CaseRecordsTab.tsx:399`, 재시도 버튼 없음(파싱 완료 시만 분석 버튼 `:415`). 브라우저 내 백그라운드 추출 `src/hooks/useCaseDetail.ts:359-361, 396-401`(`ocr_running` 저장 후 페이지 이탈 시 갱신 없음). 폼 기본값 `CaseRecordsTab.tsx:110-111`, 항상 meta 전달 `:139` → `useCaseDetail.ts:297-299`에서 `meta?.docType ?? classified` 이므로 파일명 추정은 무시됨.
- 고칠 방향. 카드에 "추출 텍스트 보기/수정"과 종류·제출자 수정 셀렉트, "다시 추출" 버튼을 둔다. 폼 기본값을 "자동"으로 두어 파일명 추정이 살아나게 한다.

### 12. 의뢰인 정보(전화·주소)를 한 곳에서 고칠 수 없다 · 답답

- 어디서. 의뢰인 화면.
- 무슨 일이. 의뢰인 목록은 사건의 이름을 글자 그대로 묶어 만든 것이라 "김철수"와 "김 철수"는 다른 사람이 된다. 전화번호는 그 사람 사건 중 번호가 있는 첫 사건 것이 보이고, 번호가 바뀌면 사건마다 들어가 수정해야 한다. 주소를 넣을 칸은 앱 어디에도 없다.
- 근거. `src/pages/ClientsPage.tsx:2`(주석 "별도 컬렉션 없이 cases를 집계"), 묶기 `:60-73`, 전화 `:68`. 화면에 수정 버튼 없음. `src/types/case.ts:40-70`에 주소 필드 없음.
- 고칠 방향. 당장은 의뢰인 카드에 "연락처 수정" 버튼(같은 이름 사건 전체에 반영), 중기적으로 `clients` 컬렉션.

### 13. 캘린더에 "오늘·이번 주" 묶음이 없고, 눌러 들어가면 개요 탭으로 떨어진다 · 답답

- 어디서. 일정 캘린더.
- 무슨 일이. 월간 달력 + "9월 기한 목록"뿐이라 월말에는 다음 달 초 기일이 안 보인다. "이번 주 무엇이 있나"를 보려면 달력 칸을 눈으로 훑어야 한다. 기한을 누르면 사건 상세 "개요" 탭이 열려 다시 "일정 관리" 탭을 눌러야 한다.
- 근거. 목록은 표시 중인 달로만 거른다(`src/pages/CalendarPage.tsx:117-122`, `:242`). 이동 `:218, :256` → `CaseDetailPage.tsx:51`(기본 탭 `"overview"`, URL로 탭 지정 불가).
- 고칠 방향. 상단에 "오늘 / 이번 주 / 다음 7일" 목록을 두고, `/cases/:id?tab=schedule`로 이동시킨다.

### 14. 여러 곳에서 실패가 소리 없이 삼켜진다 · 위험

- 어디서. 사건 목록 확장 패널(계약·착수금 토글), 상태 변경 셀렉트, 사건 삭제, 포털 켜기, 재무 탭 전반.
- 무슨 일이. 착수금 토글이 저장에 실패하면 목록만 다시 불러오고 끝. 상태를 "완료"로 바꿨는데 실패하면 셀렉트가 슬며시 "진행중"으로 돌아간다. 사건 삭제 실패는 확인창이 그냥 닫힌다. 포털 링크 만들기가 실패하면 버튼만 원래대로. 수임료·분할납부·경비·예수금 저장 실패는 전부 콘솔에만 찍힌다. 변호사는 "저장된 줄" 알고 넘어간다.
- 근거. `src/pages/CasesPage.tsx:131-139`(`catch` 후 재조회만). `src/hooks/useCaseDetail.ts:163-174`(상태 롤백, 문구 없음 — 게다가 `updateCase` 성공 후 `addTimelineEvent`가 실패해도 롤백해서 서버와 화면이 어긋남). `src/components/cases/CaseHeader.tsx:107-115`. `src/components/cases/ClientCareTab.tsx:124-126`("실패 시 상태 유지"). `src/pages/CaseDetailPage.tsx:165-167, 234-236, 249-251, 276-278, 291-293, 345-347, 354-356, 363-365, 386-388, 395-397, 404-406`(모두 `console.error`만).
- 고칠 방향. `CaseDetailPage`에 이미 있는 토스트(`setToast`, `:817-821`)를 이 핸들러들이 공유해 "저장 실패: …"를 보여준다.

### 15. 휴대폰에서 등록·수정 폼이 두 칸으로 쪼개져 좁고, 사이드바 메뉴는 아이콘만 남는다 · 답답

- 어디서. 새 사건 등록, 사건 정보 수정, 사건기록 업로드, 왼쪽 메뉴.
- 무슨 일이. 400px 폰에서 "의뢰인 이름 / 연락처", "사건번호 / 상대방" 칸이 나란히 붙어 글자가 잘린다. 왼쪽 메뉴는 아이콘 8개만 세로로 서 있어 비개발자는 어느 것이 "일정 캘린더"인지 눌러 봐야 안다. 사건 상세의 탭 7개는 가로 스크롤이라 뒤쪽 "의뢰인 케어"가 안 보인다.
- 근거. `src/components/cases/NewCaseModal.tsx:79, 89, 114, 124`·`CaseHeader.tsx:193, 213, 236, 255`·`CaseRecordsTab.tsx:266` — 모두 `grid-cols-2`에 반응형 접두어 없음. 메뉴 글자 `src/components/layout/Sidebar.tsx:129`(`hidden lg:inline`). 탭 `src/pages/CaseDetailPage.tsx:552`(`overflow-x-auto`).
- 고칠 방향. `grid-cols-1 sm:grid-cols-2`. 모바일에서는 하단 탭바 또는 햄버거 메뉴로 글자 있는 메뉴를 제공한다.

### 16. 잔 문구·동작 · 말

- 일정 탭 요약 "진행 중 기한 N건"은 30일 이내 것만 세서 45일 뒤 기일은 빠진다(`ScheduleTab.tsx:230-233`). "30일 이내 기한"으로 바꾸거나 전체를 센다.
- 사건 정보 수정에서 심급을 "미지정"으로 되돌릴 수 없다 — 빈 값이면 필드를 안 보낸다(`CaseHeader.tsx:92`).
- 새 사건 등록 부제 "진행 중인 사건을 상담 없이 바로 등록합니다"(`NewCaseModal.tsx:71`) — 필수는 이름·유형뿐이라 상담 단계에서도 쓸 수 있다는 점을 밝히면 좋다. 사건번호·법원이 선택인 것은 잘 되어 있다.
- 사건기록 상태 "파싱 대기 / 텍스트 추출 중 / 분석 가능 / 파싱 실패 / DRM 해제 필요"(`CaseRecordsTab.tsx:72-98`) — "파싱"은 개발 용어. "읽는 중 / 글자 추출 완료 / 읽기 실패"로.
- 상태값 자체는 규칙과 일치한다(화면 `CaseHeader.tsx:132-134` = `firestore.rules:69, 76`의 `["진행중","완료","보류"]`). 문제 없음.

---

## 확신이 낮은 항목

- **4번(알림 벨 색)**은 CSS 값으로만 판단했다. 실제 화면에서 다른 스타일이 덮어쓰고 있으면 문제가 아닐 수 있다. 브라우저 확인 필요.
- **11번의 "페이지 이탈 시 추출 중단"**은 코드 구조(컴포넌트 안 훅에서 `void parse...`)에서 추론한 것이다. React 언마운트가 진행 중인 fetch를 끊지는 않으므로 실제로는 끝까지 갈 수도 있으나, 상태 갱신 `setCaseRecords`는 언마운트 뒤 무의미하고 Firestore 갱신은 `await`가 이어지면 될 수 있다. 확실한 것은 "다시 시도" 버튼이 없다는 점이다.
- `src/components/cases/OpponentDocs.tsx`와 `DocumentsTab.tsx`, `TimelineTab.tsx`는 어디에서도 import되지 않는다(dead code로 보임). `OpponentDocs.tsx:72-77, 110`에는 붙여넣은 서면 본문을 `pending-<시각>` 키로 저장해 문서 id와 영영 매칭되지 않는 버그가 있으나, 안 쓰이는 파일이라 발견 목록에는 넣지 않았다. 나중에 되살리면 이 버그가 같이 살아난다.
- 2번의 "Storage 파일이 남는다"는 삭제 호출이 없다는 사실로 확정이지만, "내려받기 주소가 계속 살아 있다"는 Firebase 다운로드 토큰 방식에 대한 일반 지식이고 이 프로젝트에서 실측하지 않았다.
