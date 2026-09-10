# r1-03 녹음/업로드 → 전사 → 화자·수정 → 자유 입력 → 파일 관리 점검

점검자 시점. 부산 1인 사무소 김 변호사(40대 후반, 비개발자). 휴대폰 기본 녹음 앱으로 40~90분 m4a를 만들어 사무실 PC에서 올리고, 가끔 사이트에서 바로 녹음한다. 화면 글자를 그대로 읽는다.

기준일 2026-09-11. 코드만 읽었고 실행·실데이터 접근은 하지 않았다. 줄 번호는 읽은 시점의 파일 기준이다.

## 읽은 파일

- `src/pages/RecordPage.tsx` (전체)
- `src/pages/FreeformPage.tsx` (전체)
- `src/pages/AgentsPage.tsx` (1~330, 555~585, prepStatus 렌더 위치)
- `src/pages/CheckpointPage.tsx` (300~400), `src/pages/DocumentPage.tsx` (250~295)
- `src/pages/CaseDetailPage.tsx` (465~474, `/record` 이동부)
- `src/hooks/useRecording.ts`, `src/hooks/useDropZone.ts`, `src/hooks/usePlanLimits.ts`, `src/hooks/useAgents.ts` (restoreFromCache 461~482)
- `src/services/rtzr.ts`, `src/services/recordingStore.ts`, `src/services/file-save.ts`, `src/services/api-auth.ts`, `src/services/firebase/storage.ts`, `src/services/firebase/firestore.ts` (160~240 recordings CRUD)
- `src/components/cases/UnifiedTimelineTab.tsx` (55~60, 540~720), `DocumentsTab.tsx` (150~260), `OverviewTab.tsx` (600~660)
- `src/types/recording.ts`, `src/types/subscription.ts`, `src/App.tsx` (라우트 254~258)
- `functions/api/transcribe.ts`, `functions/api/transcribe/[id].ts`, `functions/api/_middleware.ts`
- `functions/api/_shared/rtzr-config.ts`, `rtzr-auth.ts`, `plan.ts`, `rate-limit.ts`, `auth.ts`
- `firestore.rules` (recordings 96~102), `storage.rules` (recordings 19~33)
- 전역 grep 결과. `deleteRecording`·`speakers` 쓰기·`beforeunload`·`rtzrTranscribeId` 읽기가 `src/` 어디에도 없음을 확인

---

## 발견

### 1. 전화로 녹음이 끊긴 뒤 안내대로 "이어서 녹음"을 누르면 끊기기 전 녹음이 지워진다 · 심각도 **위험**

- 어디서. 새 상담 → 2단계 "상담 녹음" (사이트 내 녹음)
- 무슨 일이. 상담 중 전화가 오면 빨간 배너에 "중단 직전까지의 내용은 저장되었습니다. 아래 버튼으로 이어서 녹음하세요"라고 뜬다. 변호사가 그 말대로 마이크 버튼을 누르면 새 녹음 세션이 시작되면서 저장돼 있던 조각을 전부 비운다. 40분 상담이 사라진다. 게다가 "불러오기" 배너는 화면을 처음 열 때만 검사하므로, 끊긴 직후에는 복구 버튼 자체가 보이지 않는다.
- 근거.
  - 배너 문구 `src/pages/RecordPage.tsx:502-506`
  - 버튼 → `handleRecord` `RecordPage.tsx:566`, `172-197`. `isRecording`이 false라 `startRecording()`으로 감 (`189`)
  - `startRecording` → `beginSession()` `src/hooks/useRecording.ts:124` → `s.clear()` `src/services/recordingStore.ts:57-59` (조각 전부 삭제)
  - 끊길 때 `track.onended`가 `mediaRecorder.stop()`을 부르지만(`useRecording.ts:137-145`) `onstop`은 `resolveStopRef`가 null이라 Blob을 `audioBlob` 상태에만 넣는다 (`149-160`). RecordPage는 `audioBlob`을 아예 꺼내 쓰지 않는다 (`RecordPage.tsx:42`)
  - 복구 배너 검사는 마운트 때 한 번뿐 `RecordPage.tsx:88-96`
- 고칠 방향. 끊김 감지 시 `chunksRef`로 즉시 파일을 만들어 첨부 목록에 넣고(정상 정지와 같은 경로), `beginSession`은 저장된 세션이 있으면 지우지 말 것. 최소한 끊김 직후 `getSavedSession()`을 다시 불러 "불러오기" 버튼을 띄울 것.

### 2. 화자 1/화자 2를 "변호사/의뢰인"으로 바꿀 수 없다 — 첫 화자가 무조건 변호사 · 심각도 **막힘**

- 어디서. 전사 결과가 보이는 모든 곳 (사건 상세 타임라인·서류 탭·개요 탭)
- 무슨 일이. 의뢰인이 먼저 말을 꺼내면 대화록 전체에서 의뢰인 발언이 "변호사:"로, 변호사 발언이 "의뢰인:"으로 적힌다. 고칠 화면이 없고, 그 상태 그대로 AI 분석과 서면 초안에 들어간다.
- 근거.
  - 기본 라벨 `0→변호사, 1→의뢰인` 고정 `src/services/rtzr.ts:163-170`. RecordPage는 `speakers` 인자 없이 호출 `RecordPage.tsx:320`
  - `Recording.speakers` 필드(`src/types/recording.ts:15`)를 쓰는 코드가 없다. 읽기만 두 곳 `src/components/cases/OverviewTab.tsx:624`, `UnifiedTimelineTab.tsx:666` (전역 grep)
  - 대화록은 라벨이 박힌 문자열로 저장됨 `RecordPage.tsx:320-325` → 라벨을 바꾸려면 `utterances`로 다시 포맷해야 하는데 그 UI가 없다
- 고칠 방향. 대화록 카드에 "화자 이름 바꾸기"(화자별 드롭다운: 변호사/의뢰인/직접 입력) → `updateRecording(id, {speakers, transcript: formatTranscript(utterances, speakers)})`. 규칙은 이미 update를 허용한다 (`firestore.rules:98`).

### 3. 전사 오탈자를 고칠 수 없다 — 대화록은 읽기·복사만 된다 · 심각도 **막힘**

- 어디서. 사건 상세 → 타임라인/서류/개요 탭의 대화록
- 무슨 일이. "손해배상"이 "손해 배송"으로 잡혀도 화면에서는 복사 버튼밖에 없다. 고친 내용을 저장할 길이 없어 잘못된 대화록이 그대로 남는다.
- 근거.
  - 타임라인 카드. 복사 + `<pre>` 표시뿐 `src/components/cases/UnifiedTimelineTab.tsx:651-681`
  - 서류 탭. 동일 `src/components/cases/DocumentsTab.tsx:216-236`
  - `updateRecording`은 존재하나(`src/services/firebase/firestore.ts:229-238`) 호출처는 RecordPage뿐 (전역 grep)
- 고칠 방향. 대화록 영역에 "수정" 토글 → textarea → 저장 시 `updateRecording(id, {transcript})`. 서버 규칙 변경은 불필요.

### 4. 잘못 올린 녹음을 지울 수 없다. 지우는 기능을 만들어도 `storage.rules`가 파일 삭제를 막는다 · 심각도 **막힘**

- 어디서. 사건 상세의 녹음/첨부 목록
- 무슨 일이. 다른 의뢰인 녹음을 잘못 올려도 지울 버튼이 없다. 상대방 서면에는 삭제가 있는데 녹음에는 없다. 지운다 해도 Storage 파일은 규칙에 막혀 남는다.
- 근거.
  - `deleteRecording`·녹음 카드의 삭제 UI가 `src/` 어디에도 없다 (전역 grep). 상대방 서면 카드에는 `onRemove` 있음 `UnifiedTimelineTab.tsx:695-700`
  - Firestore 삭제는 허용 `firestore.rules:98` (`allow read, update, delete: if isOwner()`)
  - Storage는 `allow write`(create·update·delete 통합) 조건에 `request.resource.size`·`request.resource.contentType`이 들어 있다 `storage.rules:21-29`. 삭제 요청에는 `request.resource`가 없으므로 이 식이 오류로 평가되어 거부된다. 결국 삭제 UI를 만들어도 파일은 못 지우고 고아 파일이 쌓인다
- 고칠 방향. 녹음 카드에 "삭제"(확인 대화) → Firestore 문서 + Storage 파일 둘 다 삭제. `storage.rules`의 recordings에 `allow delete: if isAuthenticated() && request.auth.uid == ownerId;`를 따로 둔다.

### 5. 전사 중 브라우저를 닫으면 녹음이 "처리중"으로 영원히 멈추고, AI 분석 중 새로고침하면 녹음 파일 자체가 어디에도 저장되지 않는다 · 심각도 **위험**

- 어디서. (a) 추가 상담 → "저장 (분석 없이)" (b) 새 상담 → "AI 분석 시작" 이후 AI 분석 화면
- 무슨 일이. (a) 폴링이 브라우저 안에서만 돈다. 탭을 닫거나 다른 메뉴를 누르면 리턴제로에서 결과가 나와도 받아올 코드가 없다. 사건 상세에 "STT 처리중" 배지가 깜빡이며 영원히 남는다. (b) 새 상담은 파일을 AI 분석이 다 끝난 뒤에야 올린다. 분석 중(수 분) 새로고침하면 파일이 사라져 사건은 만들어지는데 녹음은 없다. 떠나기 전 경고도 없다.
- 근거.
  - (a) 폴링 루프 `RecordPage.tsx:312-335`. `rtzrTranscribeId`를 저장하지만(`310`) 그걸 다시 읽는 코드가 없다 (전역 grep. `functions/api/transcribe/[id].ts`는 `pollTranscription`만 부른다)
  - "처리중" 배지 `UnifiedTimelineTab.tsx:57` (`animate-pulse`)
  - `beforeunload` 처리 없음 (전역 grep 0건)
  - (b) 업로드는 `handleCreateCase` 안에서, 즉 모든 에이전트 완료 후 `AgentsPage.tsx:275-294`. `files`는 sessionStorage에 넣지 않는다 `AgentsPage.tsx:53-60` → 새로고침하면 `rawState`가 null → `allFiles=[]` (`101`), `rawState?.files`가 undefined라 업로드 생략 (`275`)
  - 캐시 복원이 되어도(`src/hooks/useAgents.ts:461-482`) 파일은 복원 대상이 아니다
- 고칠 방향. 파일은 분석 시작 전에 먼저 올리고 녹음 문서를 만들어 둘 것. 전사는 서버가 마무리하게 하거나(스케줄러/큐), 최소한 사건 상세 진입 시 `sttStatus=processing && rtzrTranscribeId` 문서를 찾아 다시 폴링할 것. 전사·분석 중 이탈 시 `beforeunload` 경고.

### 6. 90분 파일은 6분 폴링 한도에 걸려 "실패" 처리될 수 있고, 그 뒤 결과가 나와도 받을 길이 없다 · 심각도 **위험**

- 어디서. 추가 상담 "저장 (분석 없이)", 새 상담 AI 분석, 자유 지시
- 무슨 일이. 90분짜리 파일을 올리면 6분을 기다린 뒤 "STT 실패"로 표시된다. 리턴제로는 계속 처리해 결과를 내놓지만 저장된 `rtzrTranscribeId`로 다시 조회하는 코드가 없다. AI 분석 쪽은 시간 초과 문구조차 화면에 안 나오고 대화록 없이 분석이 진행된다.
- 근거.
  - `MAX_POLLS=120`, 3초 간격 = 6분 `RecordPage.tsx:313-314` → 초과 시 `failed` `337-339`
  - `src/services/rtzr.ts:194-195` 동일. 시간 초과 시 `onProgress("음성 변환 시간 초과")`(`230`)이지만 AgentsPage는 `onProgress`를 안 넘긴다 `AgentsPage.tsx:205` → 아무 표시 없이 `transcript=undefined`로 `runAllAgents` (`214`)
  - RecordPage 폴링은 네트워크가 한 번만 끊겨도 `pollTranscription`이 throw → 바깥 catch(`340-343`)에서 곧바로 `failed`. `transcribeAndWait`의 5회 관용(`rtzr.ts:196, 218-225`)이 여기엔 없다
  - 서버는 파일 전체를 Worker 메모리로 읽어 다시 올린다 `functions/api/transcribe.ts:23-44`. 파일 크기·길이 검사 없음. Storage 한도만 500MB `storage.rules:23`
- 고칠 방향. 폴링 한도를 파일 길이에 비례해 늘리거나 서버 마무리로 바꿀 것(5번과 같은 해법). 실패 카드에 "다시 확인" 버튼으로 저장된 ID를 재조회. 업로드 전에 크기·길이 한도를 한국어로 미리 알릴 것.

### 7. 무료 플랜 한도(월 5건)를 넘으면 녹음이 아무 말 없이 버려진다 · 심각도 **위험**

- 어디서. 세 경로 모두 (추가 상담 저장, AI 분석, 자유 지시)
- 무슨 일이. 서버는 402와 한국어 안내("무료 플랜의 이번 달 사건 분석 5건을 모두 사용했습니다…")를 돌려주는데, 화면은 그걸 어디에도 보여주지 않는다. 추가 상담은 "STT 실패" 배지만 남고, AI 분석과 자유 지시는 녹음 없이 조용히 진행돼 "녹음을 올렸는데 왜 분석에 상담 내용이 없지"가 된다. 미리 막아주는 버튼도 없다.
- 근거.
  - 서버 판정·문구 `functions/api/_shared/plan.ts:162-195`, 적용 `functions/api/transcribe.ts:18-20`
  - 클라이언트는 `STT 전사 요청 실패 (HTTP 402): {"error":…,"code":"QUOTA_EXCEEDED"}` 형태로 throw `src/services/rtzr.ts:58-62`
  - RecordPage. `catch {}`로 삼키고 `failed`만 기록 `RecordPage.tsx:340-343`
  - AgentsPage. `transcribeAndWait`가 null 반환(`rtzr.ts:232-236`) → `console.error`만 `AgentsPage.tsx:206-210`
  - FreeformPage. 동일 `src/pages/FreeformPage.tsx:161-166`
  - 화면 쪽 사전 검사 `usePlanLimits().canRecord`는 RecordPage에서 쓰이지 않는다 (호출처는 SettingsPage뿐, 전역 grep)
  - 부가. 한도 기준이 "녹음 5건"이 아니라 "이번 달 만든 사건 5건"이다 `plan.ts:39, 175-180`. 기존 사건에 추가 녹음만 해도 사건 수가 5건이면 막힌다. 안내 문구(`src/types/subscription.ts:9` "월 5건 녹음")와 다르다
- 고칠 방향. 402를 별도로 잡아 서버 문구를 그대로 띄우고 "설정 > 요금제" 링크를 붙일 것. 업로드 버튼 위에 "이번 달 N/5건 사용"을 미리 보여줄 것. 한도 단위(사건 vs 녹음)를 문구와 맞출 것.

### 8. 녹음 파일을 두 개 올리면 두 번째는 분석에서 빠진다 · 심각도 **위험**

- 어디서. 새 상담 → AI 분석
- 무슨 일이. 휴대폰이 긴 녹음을 두 파일로 나눠 저장했거나 전반·후반을 따로 녹음한 경우, 첫 파일만 전사되고 나머지는 "STT 대기"로 올라간 채 분석에도 대화록에도 들어가지 않는다. 경고가 없다.
- 근거. `transcribeAndWait(audioFiles[0])` `src/pages/AgentsPage.tsx:205`. 나머지는 `sttStatus: "pending"`으로 문서만 생성 `AgentsPage.tsx:280-290`
- 고칠 방향. 오디오 전부 순차 전사해 합치거나, 최소한 "첫 파일만 변환됩니다"를 첨부 단계에서 알릴 것.

### 9. AI 분석·자유 지시로 만든 대화록은 녹음 문서에 저장되지 않아 "STT 대기"로 영원히 남는다 · 심각도 **위험**

- 어디서. 사건 상세의 녹음 카드
- 무슨 일이. 돈 내고 전사한 대화록이 AI 프롬프트에만 쓰이고 사라진다. 나중에 사건 상세를 열면 배지가 "STT 대기"이고 대화록이 없다. 다시 올리면 또 한 건 소모된다.
- 근거.
  - AgentsPage. 전사 결과는 `sttTranscript` 상태(`AgentsPage.tsx:80, 206`)에만 있고 다음 화면 state로만 넘긴다 (`572`). 녹음 문서는 `pending`으로 생성 (`288`) 후 갱신 없음
  - FreeformPage. 전사 텍스트는 프롬프트에만(`FreeformPage.tsx:162-163`), 저장 시 `pending` (`231`)
  - CheckpointPage `326, 384`, DocumentPage `273`도 `pending`. `pending`을 읽어 재시도하는 코드 없음 (전역 grep)
- 고칠 방향. 전사가 끝나면 해당 녹음 문서에 `updateRecording(id, {sttStatus:"completed", transcript, utterances})`. 파일 업로드·문서 생성을 전사 전에 해두면 자연스럽게 된다.

### 10. 업로드·전사 진행률이 없고, 같은 파일을 두 번 올린다 · 심각도 **답답**

- 어디서. 추가 상담 "저장 (분석 없이)", AI 분석 준비 단계
- 무슨 일이. 100MB 파일을 올리면 "업로드 중..." 글자만 보인다. 몇 %인지, 몇 분 남았는지 모른다. 그다음 "음성 변환 중..."도 마찬가지로 몇 분씩 멈춘 것처럼 보인다. 실제로는 같은 파일을 Storage에 한 번, 전사 서버에 한 번 총 두 번 올리고 있어 사무실 회선에서 체감 시간이 두 배다.
- 근거.
  - `uploadBytes`(진행 콜백 없음) `src/services/firebase/storage.ts:31`
  - 문구만 갱신 `RecordPage.tsx:277, 292, 307`
  - 전사 요청이 파일을 다시 전송 `src/services/rtzr.ts:48-56` → `functions/api/transcribe.ts:23-44`
  - AgentsPage는 상태를 10px 회색 글자로만 표시 `AgentsPage.tsx:408-409`
- 고칠 방향. `uploadBytesResumable`로 % 표시 + 경과 시간, "보통 N분 걸립니다" 안내. 전사는 Storage URL을 서버가 받아 리턴제로로 넘기는 방식으로 한 번만 올리게.

### 11. 마이크 권한을 거부하면 영어 오류가 뜨고 다음 행동 안내가 없다 · 심각도 **답답**

- 어디서. 새 상담 → 상담 녹음 → 마이크 버튼
- 무슨 일이. 처음 누르면 브라우저가 마이크 허용을 묻는데 실수로 "차단"을 누르면 "녹음 시작 실패: Permission denied" 같은 영어 문장이 뜬다. 다시 허용하는 방법(주소창 자물쇠 → 마이크)을 알려주지 않는다.
- 근거.
  - `err.message`를 그대로 붙임 `src/hooks/useRecording.ts:174-179`
  - 화면은 "not found"만 한국어로 바꿈 `RecordPage.tsx:583-589`
- 고칠 방향. `NotAllowedError`·`NotFoundError`·`NotReadableError`를 각각 한국어로 매핑하고, 재허용 경로와 "파일 첨부로 대신 올리기" 링크를 같이 보여줄 것.

### 12. 녹음을 어느 사건에 붙일지 고를 수 없고, 나중에 옮길 수도 없다 · 심각도 **답답**

- 어디서. 새 상담 1단계 "사건 정보", 사건 상세
- 무슨 일이. 1단계는 의뢰인 이름만 묻는다. 기존 의뢰인이라도 여기서 시작하면 분석이 끝난 뒤 사건이 하나 더 자동 생성된다(같은 의뢰인 사건 두 개). 기존 사건에 붙이려면 반드시 사건 상세 → "추가 자료 등록"으로 들어와야 하는데, 그 화면에서 새로고침하면 사건 연결이 풀려 "새 상담"이 된다. 잘못 붙은 녹음을 다른 사건으로 옮기는 기능도 없다.
- 근거.
  - 1단계 입력은 이름뿐 `RecordPage.tsx:428-440`. 사건 선택 UI 없음
  - 사건 연결은 `location.state`로만 `RecordPage.tsx:45-49`, 진입점 `src/pages/CaseDetailPage.tsx:465-474`
  - 새 상담은 분석 완료 후 `addCase`로 자동 생성 `AgentsPage.tsx:268-273`
  - `caseId`를 바꾸는 `updateRecording` 호출·UI 없음 (전역 grep)
- 고칠 방향. 1단계에 "기존 사건에 추가 / 새 사건" 선택 + 사건 검색 드롭다운. 녹음 카드에 "다른 사건으로 옮기기". 사건 연결은 URL(`/cases/:id/record`)로 받아 새로고침에 견디게.

### 13. 전사가 실패해도 "다시 시도(재전사)" 버튼이 없다 · 심각도 **답답**

- 어디서. 사건 상세 녹음 카드
- 무슨 일이. "STT 실패" 배지만 있다. 파일은 Storage에 있는데 다시 돌릴 방법이 없어 파일을 또 올려야 하고, 그러면 같은 녹음 문서·파일이 두 벌 생긴다.
- 근거.
  - 실패 배지만 `UnifiedTimelineTab.tsx:59, 607-609`. 카드 안 동작은 재생·다운로드·복사뿐 `623-681`
  - 재업로드 시 타임스탬프 접두어로 항상 새 파일 `src/services/firebase/storage.ts:25-27`
- 고칠 방향. 실패·대기 카드에 "다시 변환" 버튼 → 저장된 `fileUrl`로 서버가 전사 재요청(4·5번 해법과 묶어 서버 마무리로).

### 14. "STT", "00:00", "업로드 중..." 등 화면 문구가 틀리거나 개발 용어다 · 심각도 **말**

- 어디서. 사건 상세 녹음 카드, 새 상담 3단계 버튼
- 무슨 일이.
  - 배지가 "STT 완료/처리중/대기/실패"다. 변호사는 STT가 뭔지 모른다
  - 대화록 요약이 "대화록 12턴 · 00:00"으로 나온다. 길이가 항상 0으로 저장되기 때문이다
  - 3단계 "AI 분석 시작"을 누르면 버튼이 "업로드 중..."으로 바뀌지만 이 시점엔 아무것도 올리지 않는다(이전 녹음 조회만 한다)
  - "저장 (분석 없이)" 누르면 버튼이 "변환 중..."인데 실제로는 업로드 → 전사 → 타임라인까지 여러 단계다
- 근거.
  - 배지 라벨 `UnifiedTimelineTab.tsx:55-60`, 표시 `607-609`, `DocumentsTab.tsx:208-210`
  - `durationSeconds: 0` 고정 `RecordPage.tsx:285, 302`, `AgentsPage.tsx:287`, `FreeformPage.tsx:230` → `formatDuration(rec.durationSeconds)` `UnifiedTimelineTab.tsx:597`
  - "업로드 중..." `RecordPage.tsx:819`, 실제 동작 `199-260` (navigate만)
  - "변환 중..." `RecordPage.tsx:808`
- 고칠 방향. "음성 → 글 변환 완료/진행 중/대기/실패"로. 길이는 `<audio>` 메타데이터나 전사 결과 마지막 `startAt+duration`으로 채울 것. 버튼 문구는 실제 단계와 맞출 것.

### 15. 상담 중 탭을 실수로 닫아도 경고가 없고, 복구 배너는 1단계 뒤에 숨어 있다 · 심각도 **답답**

- 어디서. 새 상담 → 상담 녹음
- 무슨 일이. 녹음 중 탭을 닫아도 "녹음 중입니다" 경고가 안 뜬다. 5초마다 저장되니 내용은 남지만, 다시 들어오면 1단계에서 의뢰인 이름을 넣고 "다음"을 눌러야 2단계에서 "저장된 녹음이 있습니다" 배너를 본다. 대시보드에는 아무 표시가 없어 그런 게 남아 있는지 모른다. 휴대폰에서 녹음했으면 PC에서는 복구 못 한다(브라우저 저장소라서).
- 근거.
  - `beforeunload` 없음 (전역 grep)
  - 5초 조각 저장 `useRecording.ts:170`, 배너는 `step === "record"` 안에서만 `RecordPage.tsx:463-495`, 새 상담은 `info`로 시작 `RecordPage.tsx:51`
  - 저장소는 IndexedDB(기기 로컬) `src/services/recordingStore.ts:9-11`
- 고칠 방향. 녹음 중 `beforeunload` 경고. 저장된 세션이 있으면 대시보드·1단계에서도 배너를 띄우고 바로 불러오기.

### 16. 같은 사무실(같은 공인 IP)에서 여러 명이 쓰면 1분 60회 제한에 걸려 전사가 "실패"로 끝난다 · 심각도 **답답**

- 어디서. 추가 상담 "저장 (분석 없이)"
- 무슨 일이. 폴링이 3초마다(분당 20회) 나가고 AI 분석 호출도 같은 통에 센다. 직원 PC 두세 대가 동시에 돌리면 429가 나는데, RecordPage 폴링은 오류 1회에 바로 "실패"로 기록한다. 1인 사무소면 드물지만 직원이 있으면 겪는다.
- 근거.
  - IP당 60회/분, `/api/transcribe`·`/api/claude` 공용 `functions/api/_shared/rate-limit.ts:6-7, 37`
  - RecordPage 폴링은 관용 없이 throw → `failed` `RecordPage.tsx:318, 340-343`
- 고칠 방향. 폴링 경로(`/api/transcribe/:id`)는 제한에서 빼거나 사용자(uid) 단위로 세고, 클라이언트는 429·일시 오류에 몇 번 재시도.

---

## 확신이 낮은 항목 (코드 밖 사실이 섞여 있어 추측으로 적는다)

- **90분 파일의 서버 통과 여부.** `functions/api/transcribe.ts:23`이 요청 본문 전체를 Worker에서 읽는다. Cloudflare Pages Functions의 요청 본문 한도가 플랜별 100MB/200MB/500MB로 알려져 있다(추측·플랫폼 문서 기준). 90분 m4a는 128kbps면 약 85MB, 256kbps면 약 170MB라 무료 플랜이면 413으로 막힐 수 있다. 그때 화면에는 `STT 전사 요청 실패 (HTTP 413): <html…>` 같은 원문이 나오거나(자유 지시), 아예 안 보인다(7번과 같은 경로). 실제 한도는 배포 플랜을 확인해야 한다.
- **리턴제로 처리 시간.** 6분 한도(6번)가 90분 파일에 부족한지는 리턴제로 실측이 필요하다. 배치 STT는 보통 실시간의 수 분의 1이라 10분 안팎이 걸릴 가능성이 있다(추측).
- **아이폰 사파리 녹음 파일 형식.** 사파리는 `audio/webm`을 지원하지 않아 mp4로 녹음되는데(`useRecording.ts:114-119`), 정지 시 Blob 타입을 `audio/webm`으로 고정하고(`useRecording.ts:150`) 파일명도 `.webm`이다(`RecordPage.tsx:180`). 복구 경로는 mp4를 제대로 붙인다(`recordingStore.ts:120-123`). 리턴제로가 내용을 보고 판별하면 문제없지만, 확장자·MIME으로 거르면 사파리 녹음만 실패한다. 실기기 확인 필요.
- **아이폰에서 화면이 꺼지거나 다른 앱으로 가면 녹음이 멈추는지.** 안내(`RecordPage.tsx:523-525`)는 방해금지만 말한다. iOS 사파리 백그라운드 캡처 제한은 버전마다 달라 실기기로 확인해야 한다.
- **권한 거부 시 정확한 영어 문구.** 크롬은 "Permission denied", 사파리는 다른 문장을 준다. 어느 쪽이든 한국어가 아니라는 점은 코드로 확실하다(11번).
- **"폴더 선택"(`RecordPage.tsx:692`, `webkitdirectory`)은 아이폰 사파리에서 동작하지 않는 것으로 알려져 있다.** 휴대폰에서는 버튼이 눌리는데 아무 일도 안 일어날 수 있다.
