# 녹음 → 전사 → AI 분석 점검 (2026-09-17)

부산 1인 사무소 김 변호사 기준. 휴대폰으로 상담을 녹음하고 사무실 PC에서 이어 작업하는 흐름을 코드로 끝까지 따라갔다. 이미 찾은 253건과 겹치는 항목은 뺐고, 같은 계열이라도 다른 사례면 남겼다.

## 읽은 파일

- src/pages/RecordPage.tsx
- src/pages/AgentsPage.tsx
- src/hooks/useRecording.ts
- src/hooks/useAgents.ts
- src/hooks/usePlanLimits.ts
- src/services/recordingStore.ts
- src/services/rtzr.ts
- src/services/claude.ts
- src/services/retry.ts
- src/services/firebase/storage.ts
- src/services/firebase/firestore.ts (녹음 부분)
- src/types/recording.ts
- functions/api/transcribe.ts
- functions/api/transcribe/[id].ts
- functions/api/_shared/plan.ts
- storage.rules (recordings 경로)
- src/components/cases/DocumentsTab.tsx, UnifiedTimelineTab.tsx (STT 상태 표시 부분)
- src/pages/FreeformPage.tsx, CheckpointPage.tsx, DocumentPage.tsx (녹음 문서 생성 부분만)

## 발견

### 1. 전화가 오면 녹음이 실제로 사라지는데 화면은 「저장되었습니다」라고 말한다

- 심각도: **막힘**
- 어디서: 새 상담 → 상담 녹음 단계. 녹음 중 전화 수신·다른 앱이 마이크를 가져갈 때.
- 무슨 일이: 빨간 배너가 뜨고 "중단 직전까지의 내용은 저장되었습니다. 아래 버튼으로 이어서 녹음하세요"라고 적힌다. 그 말을 믿고 「이어서 녹음」을 누르면 앞부분이 어디에도 없다. 30분 상담이 통째로 없어진다.
- 근거 (저장이 실제로 일어나는 곳): `src/hooks/useRecording.ts:236-244`
  ```
  } else {
    // 호출자 없이 멈췄다 = 강제 중단. 그때까지의 녹음을 파일로 넘긴다.
    const file = buildFileFromChunks();
    if (file) {
      setInterruptedFile(file);
      void clearSession();      ← IndexedDB 조각을 여기서 지운다
    }
  }
  ```
- 근거 (성공 문구가 뜨는 곳): `src/pages/RecordPage.tsx:504-506`
- 무엇이 어긋나는가: 훅은 파일을 만들어 `interruptedFile` 상태에 넣고 디스크를 지운다. 그런데 화면이 그 파일을 꺼내 가지 않는다 — `src/pages/RecordPage.tsx:41`의 구조분해는 `isRecording, duration, startRecording, stopRecording, interrupted, clearInterrupted` 여섯 개뿐이고 `interruptedFile`·`takeInterruptedFile`이 없다. 훅이 내주는데(`useRecording.ts:41-42`) 받는 쪽이 없다. 디스크 사본은 이미 지워졌고, 메모리 사본은 아무도 안 가져가 사라진다.
- 되살릴 길도 막혀 있다: 복구 배너는 화면에 들어올 때 한 번만 확인하므로(`RecordPage.tsx:87-96`) 중단 뒤에 다시 뜨지 않는다. 「이어서 녹음」을 누르면 `startRecording`이 메모리 조각을 비우고(`useRecording.ts:188`) `beginSession`이 스토어를 또 지운다(`src/services/recordingStore.ts:66`).
- 고칠 방향: 화면이 `interruptedFile`을 받아 첨부 목록에 넣은 뒤에만 `clearSession`을 부른다.

### 2. 녹음 중에 화면을 떠나면 녹음이 통째로 사라진다 — 경고창도 없다

- 심각도: **막힘**
- 어디서: 상담 녹음 중 왼쪽 메뉴를 누르거나 브라우저 뒤로 가기.
- 무슨 일이: 확인창 없이 화면이 바뀌고, 그때까지 녹음한 것이 전부 없어진다. 다시 새 상담에 들어와도 복구 배너가 뜨지 않는다.
- 근거: `src/hooks/useRecording.ts:144-146` — 언마운트 정리가 `mediaRecorderRef.current.stop()`을 부른다. `stop()`은 비동기라 화면이 사라진 뒤에도 `onstop`이 실행되고, 호출자가 없으므로 위 1번과 같은 경로(`useRecording.ts:236-244`)를 타 `clearSession()`으로 디스크를 비운다.
- 근거 (경고가 없다): RecordPage에 `beforeunload`도 이탈 확인도 없다. 같은 저장소의 `src/pages/DocumentPage.tsx:396-399`에는 있다.
- 고칠 방향: 언마운트 정리에서는 `clearSession`을 부르지 않는다. 조각을 남겨 두면 다음 진입 때 복구 배너가 살린다.

### 3. 녹음 중에도 「이전」 버튼이 눌린다 — 녹음 패널만 사라지고 녹음은 계속된다

- 심각도: **위험**
- 어디서: 상담 녹음 단계 하단 왼쪽 「이전」.
- 무슨 일이: 「다음」은 녹음 중에 막히는데 「이전」은 막히지 않는다. 누르면 "사건 정보 입력" 화면으로 돌아가고 녹음 패널이 화면에서 사라진다. 마이크와 타이머는 계속 돌지만 화면 어디에도 녹음 중이라는 표시가 없다. 멈춘 줄 알고 「뒤로」를 누르면 2번 경로로 녹음이 사라진다.
- 근거: `src/pages/RecordPage.tsx:626-633`(「이전」에 disabled 없음) 대 `src/pages/RecordPage.tsx:634-636`(`disabled={isRecording}`). 패널 표시 조건은 `src/pages/RecordPage.tsx:494`의 `step === "record"`.
- 고칠 방향: 녹음 중에는 「이전」도 막는다. 단계를 옮기더라도 상단에 "녹음 중 00:42" 고정 표시를 둔다.

### 4. 「저장 (분석 없이)」는 1시간 상담을 항상 「실패」로 적는다 — 6분 고정 대기

- 심각도: **위험**
- 어디서: 추가 상담 → 자료 첨부 → 「저장 (분석 없이)」.
- 무슨 일이: 긴 상담은 6분 안에 전사가 끝나지 않는다. 화면은 사건 상세로 넘어가고 녹음에 "STT 실패" 뱃지가 붙는다. 서버는 실제로 변환을 끝냈을 수 있는데 화면만 실패라고 적는다. 다시 전사할 방법도 없다.
- 근거: `src/pages/RecordPage.tsx:312-339` — `POLL_INTERVAL = 3000`, `MAX_POLLS = 120`(6분), 루프를 다 돌면 `updateRecording(recId, { sttStatus: "failed" })`.
- 근거 (이미 고쳐 둔 장치를 쓰지 않는다): `src/services/rtzr.ts:195-200`의 `computeMaxWaitMs`는 파일 길이에 비례해 최대 30분까지 기다리고, `src/services/rtzr.ts:312-360`의 `waitForTranscription`은 일시 오류를 5회까지 견딘다. 이 경로는 둘 다 호출하지 않는다.
- 근거 (길이 정보조차 0): `src/pages/RecordPage.tsx:302`가 `durationSeconds: 0`으로 박아 넣는다. 훅이 `lastRecordingSeconds`를 내주지만(`useRecording.ts:49`) 화면이 받지 않는다.
- 근거 (오류 한 번에 즉시 실패): `src/pages/RecordPage.tsx:340-343`의 `catch`가 try 전체를 감싸고 있어 폴링 중 네트워크가 한 번 끊겨도 재시도 없이 failed가 된다.
- 고칠 방향: `waitForTranscription(transcribeId, { durationSeconds })`를 쓴다. 시간 초과는 failed가 아니라 processing으로 남겨 나중에 다시 확인할 수 있게 한다.

### 5. AI 분석으로 만든 전사가 사건에 저장되지 않는다 — 「STT 대기」가 영원히 남는다

- 심각도: **위험**
- 어디서: 새 상담 → 「AI 분석 시작」 → 분석 완료 → 사건 파일 자동 생성.
- 무슨 일이: 전사는 분명히 됐고 분석에도 쓰였는데, 사건 화면 녹음 목록에는 "STT 대기"가 계속 남는다. 대화록을 다시 보려고 눌러도 아무것도 없다. 다음 상담 때 이전 대화록을 모을 때도 이 녹음은 빠진다.
- 근거 (전사가 메모리에만): `src/pages/AgentsPage.tsx:205-206`
- 근거 (문서는 pending으로 생성되고 갱신되지 않음): `src/pages/AgentsPage.tsx:288`의 `sttStatus: isAudio ? "pending" : "completed"`. 이후 이 문서를 고치는 `updateRecording` 호출이 AgentsPage에 없다.
- 근거 (이어서 처리하는 장치 없음): `src/services/firebase/firestore.ts:286-289`의 `getPendingTranscriptions`는 호출처가 없고, 애초에 `"processing"`만 걸러 pending은 잡지도 못한다.
- 근거 (다음 상담에서 빠진다): `src/pages/RecordPage.tsx:219-220`이 `sttStatus === "completed"`인 것만 모은다.
- 같은 pending 고아 문서가 `src/pages/CheckpointPage.tsx:326`·`384`, `src/pages/DocumentPage.tsx:469`, `src/pages/FreeformPage.tsx:231`에서도 생긴다.
- 고칠 방향: 전사가 끝나면 해당 녹음 문서에 `transcript`·`utterances`·`sttStatus: "completed"`를 쓴다.

### 6. 녹음이 두 개면 두 번째는 전사되지 않는다 — 상담 후반부가 조용히 빠진다

- 심각도: **위험**
- 어디서: 상담 중 끊겨서 두 번 나눠 녹음한 뒤 「AI 분석 시작」.
- 무슨 일이: 화면은 "음성 파일 변환 중..." 한 줄만 보여 준다. 실제로는 첫 파일만 변환되고 두 번째(상담 후반부)는 에이전트에게 전달되지 않는다. 분석 결과는 상담 절반만 보고 쓴 것인데 그 사실이 어디에도 표시되지 않는다.
- 근거: `src/pages/AgentsPage.tsx:205` — `transcribeAndWait(audioFiles[0])`. 배열 첫 항목만 쓴다.
- 비교: 같은 저장소의 `src/pages/FreeformPage.tsx:161-164`는 오디오 전체를 순회한다. AgentsPage만 다르다.
- 고칠 방향: `audioFiles` 전체를 돌려 합치고, "2개 중 1개 변환 중"으로 진행을 보여 준다.

### 7. 에이전트 1명이 실패하면 사건 파일도 안 생기고 문서 단계로도 못 간다 — 성공한 3명 결과도 버려진다

- 심각도: **막힘**
- 어디서: AI 분석 화면. 4명 중 1명이 오류 표시.
- 무슨 일이: 나머지 3명의 결과는 화면에 보이는데 아무것도 진행되지 않는다. 「생성할 문서 유형」 블록이 아예 나타나지 않고, 사건 파일도 만들어지지 않아 녹음·첨부 파일이 Storage에 올라가지 않는다.
- 근거: `src/pages/AgentsPage.tsx:226` — `const allCompleted = completedCount === AGENTS.length && !isRunning;`
- 근거 (막히는 것들): 사건 생성 `src/pages/AgentsPage.tsx:251-257`, 파일 업로드가 그 안에만 있음 `:274-294`, 문서 유형 선택 `:471`.
- 빠져나갈 길이 없다: 「이전 단계」를 누르면 파일이 전부 사라진다(아래 8번).
- 고칠 방향: 완료+오류를 합쳐 진행 가능 여부를 판정한다. 실패한 에이전트가 있어도 사건 파일 생성과 파일 업로드는 진행한다.

### 8. AI 분석 화면에서 「이전 단계」를 누르면 첨부한 파일이 전부 사라진다

- 심각도: **위험**
- 어디서: AI 분석 화면 좌측 상단 「이전 단계」.
- 무슨 일이: 녹음 화면으로 돌아가는 게 아니라 맨 처음 "사건 정보 입력"으로 떨어지고, 첨부했던 녹음·서류가 하나도 없다. 이 시점에는 아직 Storage 업로드 전이라 어디에도 사본이 없다.
- 근거: `src/pages/AgentsPage.tsx:301-307` — state 없이 `navigate("/record")`. 받는 쪽은 `src/pages/RecordPage.tsx:51-52`, `71-72`가 `step: "info"`, `files: []`로 시작한다. 같은 코드가 `src/pages/AgentsPage.tsx:315`의 「새 상담 시작」에도 있다.
- 근거 (조각도 못 살린다): 정상 정지 시 `src/pages/RecordPage.tsx:185`가 `clearSession()`을 불러 IndexedDB를 이미 비웠다.
- 고칠 방향: 분석 시작 전에 파일을 Storage에 먼저 올린다. `src/services/rtzr.ts:123`의 `transcribeByUrl`이 정확히 그 용도로 만들어져 있으나 호출처가 없다.

### 9. 업로드·전사·분석 중에 새로고침하면 경고 없이 전부 사라진다

- 심각도: **위험**
- 어디서: 녹음 화면 저장 중, AI 분석 화면 분석 중.
- 무슨 일이: 30분 가까이 걸릴 수 있는 작업인데 화면이 멈춘 것처럼 보여 새로고침하기 쉽다. 누르면 아무 확인창 없이 처음부터다.
- 근거: RecordPage·AgentsPage 어디에도 `beforeunload` 핸들러가 없다. 같은 저장소 `src/pages/DocumentPage.tsx:396-399`에는 있다.
- 근거 (재개도 못 한다): 진행 중인 전사 ID를 어디에도 저장하지 않는다 — `src/pages/AgentsPage.tsx:205`가 `transcribeAndWait` 안에서만 쓰고 버린다.
- 고칠 방향: `uploading`·`savingOnly`·`isRunning` 중 하나라도 켜져 있으면 이탈을 경고한다.

### 10. 분석 화면에 다시 들어올 때마다 4명이 처음부터 다시 돈다 — 캐시가 작동한 적이 없다

- 심각도: **위험**
- 어디서: AI 분석 화면 재진입(뒤로 갔다 다시 오기 등).
- 무슨 일이: 이전 결과를 되살리려고 만든 캐시가 구조적으로 절대 복원되지 않는다. 매번 Claude 호출 비용이 다시 나가고 무료 플랜의 월 호출 한도를 그만큼 더 먹는다. 게다가 재진입 시에는 파일이 비어 있어 녹음 없이 분석이 돌아간다 — 결과가 조용히 나빠진다.
- 근거 (저장 쪽): `src/hooks/useAgents.ts:734`가 `cacheKey: context.cacheKey`를 저장하는데, 호출부 `src/pages/AgentsPage.tsx:213`의 `runAllAgents({ ...baseContext, transcript })`에 `cacheKey`가 없다. 항상 undefined라 JSON에서 키 자체가 빠진다.
- 근거 (복원 쪽): `src/hooks/useAgents.ts:535` — `if (!data.cacheKey || data.cacheKey !== cacheKey) return false;` 첫 조건에서 언제나 false.
- 근거 (엉뚱한 값을 넘긴다): `src/pages/AgentsPage.tsx:88`이 cacheKey 자리에 `state.clientName`을 넣는다. 이를 위해 만든 `src/hooks/useAgents.ts:187-196`의 `buildAnalysisCacheKey`는 호출처가 없는 죽은 코드다.
- 근거 (파일이 빈 채로 돈다): `src/pages/AgentsPage.tsx:103` — `const allFiles = rawState?.files ?? [];`
- 고칠 방향: `buildAnalysisCacheKey`로 키를 만들어 `restoreFromCache`와 `runAllAgents` 양쪽에 같은 값을 넘긴다.

### 11. 임시저장이 안 되고 있어도 화면은 「5초마다 자동 저장됩니다」라고 약속한다

- 심각도: **위험**
- 어디서: 상담 녹음 단계 상단 파란 안내.
- 무슨 일이: 사파리 비공개 모드나 저장공간 부족이면 임시저장이 한 건도 안 되는데, 화면은 계속 "5초마다 자동 저장되므로 끊겨도 그때까지는 남습니다"라고 단언한다. 그 말을 믿고 길게 녹음했다가 전화가 오면 통째로 잃는다.
- 근거 (약속하는 곳): `src/pages/RecordPage.tsx:525-526`
- 근거 (실패를 아는 곳): `src/services/recordingStore.ts:97-100`이 실패를 false로 돌려주고, `src/hooks/useRecording.ts:194-196`이 `setStoreUnavailable(true)`로 표시한다.
- 근거 (받는 쪽이 없다): `src/pages/RecordPage.tsx:41` 구조분해에 `storeUnavailable`이 없다.
- 고칠 방향: `storeUnavailable`이면 문구를 "이 브라우저에서는 자동 저장이 되지 않습니다. 짧게 나누어 녹음하세요"로 바꾸고 경고색으로 띄운다.

### 12. 전사가 왜 실패했는지 화면에 한 글자도 나오지 않는다

- 심각도: **위험**
- 어디서: 사건 화면 녹음 목록의 "STT 실패" 뱃지.
- 무슨 일이: 파일이 깨진 건지, 인터넷이 끊긴 건지, 무료 한도를 다 쓴 건지 알 수 없다. 변호사는 같은 시도를 반복하고, 반복할 때마다 호출 수가 또 올라간다.
- 근거 (사유를 버린다): `src/pages/RecordPage.tsx:340-343` — `catch { await updateRecording(recId, { sttStatus: "failed" }); }` 오류 객체를 받지도 않는다. `src/pages/AgentsPage.tsx:207-209`는 `console.error`만 찍는다. `src/services/rtzr.ts:381-385`의 `transcribeAndWait`도 실패를 null로 삼킨다.
- 근거 (준비된 문구가 버려진다): `src/services/retry.ts:44`(402 한도), `src/services/rtzr.ts:335`(파일 손상), `src/services/rtzr.ts:355`(연결 반복 끊김)에 상황별 한국어 문장이 이미 있다.
- 고칠 방향: 실패 사유를 녹음 문서에 저장하고 뱃지 옆에 한 줄로 보여 준다. 402면 요금제 화면 링크를 함께 둔다.

### 13. 전사·업로드가 얼마나 남았는지 알 수 없다 — 고정 문구 한 줄뿐

- 심각도: **답답**
- 어디서: 「저장 (분석 없이)」 진행 중, AI 분석 화면의 "음성 파일 변환 중...".
- 무슨 일이: 최대 30분 걸릴 수 있는 작업인데 진행 표시가 없다. 멈춘 건지 도는 건지 구분이 안 된다.
- 근거 (전사): `src/pages/RecordPage.tsx:307`이 문구를 한 번 세우고 6분 루프 동안 갱신하지 않는다. `src/pages/AgentsPage.tsx:204-205`는 `transcribeAndWait`에 `onProgress`를 넘기지 않는다. 경과·최대 시간을 주는 콜백이 `src/services/rtzr.ts:283-295`, `353-356`에 이미 있다.
- 근거 (업로드): `src/services/firebase/storage.ts:63-73`은 `onProgress`를 받으면 퍼센트를 준다. 호출부 `src/pages/RecordPage.tsx:276`·`294`, `src/pages/AgentsPage.tsx:281`이 모두 콜백 없이 부른다.
- 고칠 방향: 두 콜백을 연결해 퍼센트와 "약 N분 남음"을 보여 준다.

### 14. 아이폰에서 녹음한 파일이 실제와 다른 이름·형식으로 올라간다

- 심각도: **답답**
- 어디서: 아이폰 사파리로 녹음 후 정지.
- 무슨 일이: 사파리는 WebM을 지원하지 않아 실제로는 mp4로 녹음되는데, 파일은 `.webm` 이름에 `audio/webm` 형식으로 붙는다.
- 근거 (하드코딩): `src/pages/RecordPage.tsx:181` — `new File([blob], \`recording_${Date.now()}.webm\`, { type: "audio/webm" })`
- 근거 (훅은 제대로 알고 있다): `src/hooks/useRecording.ts:190-191`이 실제 mimeType을 `mimeRef`에 담고, `:150-157`의 `buildFileFromChunks`는 확장자를 맞춘다. 화면이 그 정보를 쓰지 않는다.
- 근거 (그대로 흘러간다): `src/services/firebase/storage.ts:56`, `functions/api/transcribe.ts:76`.
- 고칠 방향: `stopRecording`이 Blob 대신 훅이 만든 File을 돌려주거나, 화면이 `blob.type`을 그대로 쓴다.

### 15. 녹음 삭제 버튼이 너무 작고, 누르면 확인 없이 사라진다

- 심각도: **답답**
- 어디서: 상담 녹음 단계의 「녹음 완료」 목록, 자료 첨부 단계의 파일 목록.
- 무슨 일이: 터치 영역이 약 28px이라 잘못 누르기 쉽다. 누르면 확인창 없이 즉시 없어지고 되돌릴 수 없다. 이 시점에 그 녹음의 사본은 메모리의 File 하나뿐이다.
- 근거: `src/pages/RecordPage.tsx:613-616` — `className="p-1.5 ..."` 에 `<X className="w-4 h-4" />`. 삭제 동작은 `:610-612`.
- 근거 (사본이 없다): `src/pages/RecordPage.tsx:185`의 `clearSession()`이 정상 정지 때 IndexedDB 조각을 이미 지웠다.
- 첨부 파일 목록 버튼도 같은 크기이며 aria-label이 없다 — `src/pages/RecordPage.tsx:743-747`.
- 고칠 방향: 터치 영역을 44px 이상으로 키우고, 녹음 삭제에는 "되돌릴 수 없습니다" 확인을 둔다.

### 16. 같은 파일을 두 번 첨부해도 막지 않는다 — 두 번 올라가고 두 번 변환된다

- 심각도: **답답**
- 어디서: 자료 첨부 단계에서 같은 파일을 실수로 두 번 선택.
- 무슨 일이: 목록에 같은 이름이 나란히 놓이고 구분할 단서가 없다. 그대로 진행하면 같은 1시간 녹음이 두 번 업로드되고 두 번 전사된다. 무료 플랜 월 호출 한도가 두 배로 소모된다.
- 근거: `src/pages/RecordPage.tsx:161` — `setFiles((prev) => [...prev, ...otherFiles])` 검사 없음. 드래그 앤 드롭(`:68-70`), 카메라(`:159-165`)도 같다.
- 판단 근거는 이미 있다: `src/hooks/useAgents.ts:187-196`의 `buildAnalysisCacheKey`가 `name:size` 조합을 쓴다.
- 고칠 방향: name+size+lastModified가 같으면 "이미 첨부한 파일입니다"로 알리고 넣지 않는다.

### 17. 한도와 용량 문제를 1시간 녹음이 끝난 뒤에 알게 된다

- 심각도: **답답**
- 어디서: 무료 플랜으로 한도를 다 쓴 상태에서 새 상담 녹음.
- 무슨 일이: 녹음 버튼이 그대로 눌리고, 막히는 건 다 녹음한 뒤 전사 요청 때다. 게다가 그 사유가 화면에 안 나온다(12번).
- 근거 (사전 확인 없음): RecordPage가 `usePlanLimits`를 import하지 않는다. 실제 차단은 서버에서 일어난다 — `functions/api/transcribe.ts:32-33`.
- 근거 (크기 안내 없음): 녹음 전·업로드 전 크기 검사나 예상 용량 표시가 없다. 한계는 뒤늦게 `storage.rules:34`(500MB)와 `functions/api/transcribe.ts:88-90`(413)에서 드러난다.
- 근거 (실행할 수 없는 지시): `functions/api/transcribe.ts:89`가 "파일을 나누어 올려 주세요"라고 하는데 앱에 파일을 나누는 기능이 없다.
- 고칠 방향: 녹음 시작 전 남은 한도를 보여 주고, 녹음 중 경과 시간 옆에 대략 용량과 "전사 예상 N분"을 함께 띄운다.

### 18. 사파리에서 인터넷이 끊기면 「오류: Load failed」라는 영어가 그대로 뜬다

- 심각도: **말**
- 어디서: AI 분석 화면의 에이전트 결과 탭.
- 무슨 일이: 크롬에서는 한국어 안내가 나오는데 사파리에서는 영어 원문이 화면에 찍힌다.
- 근거 (조건이 크롬 문구에만 맞다): `src/services/claude.ts:469`, `:500`, `src/services/rtzr.ts:85` — 모두 `error instanceof TypeError && error.message.includes("fetch")`. 크롬은 "Failed to fetch"라 걸리지만 사파리는 "Load failed"라 걸리지 않는다.
- 근거 (그대로 나간다): `src/services/claude.ts:473-475` → `src/hooks/useAgents.ts:657` → `src/pages/AgentsPage.tsx:447`이 `오류: {agents[activeTab].error}`로 렌더한다.
- 고칠 방향: 조건을 `error instanceof TypeError`로 넓히거나 "Load failed"·"NetworkError"를 함께 본다.

### 19. 마이크 오류 문구에 실행되지 않는 영어 검사 분기가 남아 있다

- 심각도: **말**
- 어디서: 상담 녹음 단계의 오류 문구.
- 무슨 일이: 화면 동작에는 영향이 없다. 다만 "여기로 영어가 올 수 있다"는 잘못된 인상을 주는 잔재다.
- 근거: `src/pages/RecordPage.tsx:586-588` — `recordError.includes("not found") ? "마이크를 찾을 수 없습니다..." : recordError`
- 근거 (도달 불가): `startRecording`은 실패를 전부 `describeMicError`로 감싸 던지고(`src/hooks/useRecording.ts:262-265`), `describeMicError`는 여섯 갈래 전부 한국어만 돌려준다(`:53-76`).
- 고칠 방향: 삼항을 지우고 `recordError`를 그대로 보여 준다.

## 확신이 낮은 항목

- **화면이 꺼지거나 탭이 백그라운드로 갈 때 녹음이 어떻게 되는가** — 코드로 답을 못 냈다. 확인한 사실은 두 가지다. (가) Wake Lock API를 쓰는 코드가 저장소에 없다. (나) 마이크를 빼앗기는 경우는 `track.onended`로 감지한다(`src/hooks/useRecording.ts:211-224`). iOS 사파리가 MediaRecorder를 어떻게 다루는지는 실행해야 알 수 있고 이번 점검은 실행하지 않았다. **추측**: 백그라운드에서 타이머가 throttle되면 `durationRef`가 실제보다 작게 쌓이고, 그 값이 저장 메타와 복구 배너 표시 시간에 쓰인다. 실측 필요.
- **14번의 실제 영향 범위** — 이름·형식이 실제와 다르게 붙는다는 것은 코드로 확정된다. 다만 전사 서버가 Content-Type을 무시하고 내용으로 판별할 가능성이 있어, 실제로 전사가 실패하는지까지는 확인하지 못했다. **추측**.
- **17번의 500MB 상한에 1시간 녹음이 걸리는지** — opus 코덱이면 1시간이 대략 30MB 안팎이라 대개 걸리지 않을 것으로 본다. **추측**이며, 문제의 핵심은 상한 자체보다 "미리 알려 주지 않는다"는 점이다.
