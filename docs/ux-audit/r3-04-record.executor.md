# 녹음→전사→AI 분석→문서 생성 점검 (2026-09-17)

## 읽은 파일
- `src/pages/RecordPage.tsx`
- `src/hooks/useRecording.ts`
- `src/services/recordingStore.ts`
- `src/services/rtzr.ts`
- `src/services/retry.ts`
- `src/hooks/useAgents.ts`
- `src/pages/AgentsPage.tsx`
- `src/pages/CheckpointPage.tsx`
- `src/pages/DocumentPage.tsx`
- `src/pages/FreeformPage.tsx`
- `src/services/firebase/firestore.ts`
- `src/services/firebase/storage.ts`
- `src/components/cases/DocumentsTab.tsx`
- `functions/api/transcribe.ts`
- `functions/api/transcribe/[id].ts`

## 발견

### 1. 전화가 와서 녹음이 끊기면, "저장되었다"는 안내와 달리 실제로는 그 녹음이 사라진다
- 심각도: 위험
- 어디서: 새 상담 > 상담 녹음 화면
- 무슨 일이: 상담 중 전화가 와서 녹음이 강제로 끊기면 화면에 "중단 직전까지의 내용은 저장되었습니다. 아래 버튼으로 이어서 녹음하세요"라는 안내가 뜬다. 그런데 실제로 이어서 쓸 수 있는 파일은 화면 어디에도 나타나지 않는다. 다시 녹음 버튼을 누르면 그 상담의 앞부분은 그대로 사라진다.
- 근거: `src/pages/RecordPage.tsx:42`에서 `useRecording()`을 `interruptedFile`, `takeInterruptedFile` 없이 구조분해한다. 반면 `src/hooks/useRecording.ts:226-241`의 `mediaRecorder.onstop`은 강제 중단(전화)일 때 `setInterruptedFile(file); void clearSession();`으로 **IndexedDB 백업을 즉시 지운다** — `interruptedFile`을 화면이 꺼내 쓴다는 전제 하에. `src/pages/RecordPage.tsx:494-511`의 안내 배너는 텍스트만 있고, 실제로 파일을 첨부 목록에 넣는 동작은 `clearInterrupted()`(배너 닫기)뿐이다. 즉 유일한 백업(IndexedDB)이 지워지고, 대체 백업(`interruptedFile`)은 화면이 읽지 않아 메모리에 고립된 채 다음 렌더에서 버려진다.
- 고칠 방향: `RecordPage`가 `interruptedFile`/`takeInterruptedFile`을 받아 중단 즉시 첨부 목록에 파일을 넣거나, `onstop`에서 화면이 실제로 파일을 확보하기 전에는 `clearSession()`을 호출하지 않게 한다.

### 2. 같은 문제의 다른 사례 — 임시저장 실패 경고도 화면에 나오지 않는다
- 심각도: 위험
- 어디서: 새 상담 > 상담 녹음 화면
- 무슨 일이: 브라우저 저장공간이 부족하거나 시크릿 모드라서 5초 조각 저장이 계속 실패하면 `useRecording`은 `storeUnavailable`을 true로 만든다. 이건 "지금 녹음이 백업되고 있지 않다"는 뜻이라 변호사가 알아야 하는데, 화면에는 아무 표시도 없다. 이 상태에서 전화가 오면 항목 1처럼 사라지는 게 아니라 애초에 백업본 자체가 없다.
- 근거: `RecordPage.tsx:42`가 `storeUnavailable`을 구조분해하지 않는다. `useRecording.ts:203-204`(`appendChunk` 실패 시 `setStoreUnavailable(true)`)는 존재하지만 이를 표시하는 UI가 `RecordPage.tsx` 어디에도 없다.
- 고칠 방향: `storeUnavailable`이 true면 녹음 화면에 "이 기기에서는 임시 백업이 되지 않고 있습니다" 경고를 상시 노출한다.

### 3. AI 에이전트 하나만 실패해도 다음 단계로 영원히 못 넘어간다
- 심각도: 막힘
- 어디서: AI 분석 화면 (에이전트 4명 진행률)
- 무슨 일이: 판서·율무·혜안·필묵 중 한 명이라도 오류(네트워크·요금 한도 등)로 실패하면 오류 카드에 "오류: ..." 문구만 뜨고 재시도 버튼이 없다. 이 에이전트는 "완료" 상태가 될 수 없으므로 진행률이 4/4가 되지 못해 사건 파일 자동 생성·문서 유형 선택 버튼이 영원히 나타나지 않는다. 다시 할 수 있는 방법은 화면을 새로고침해 처음부터 전체 4명을 다시 돌리는 것뿐이다.
- 근거: `src/pages/AgentsPage.tsx:230-233`의 `allCompleted = completedCount === AGENTS.length && !isRunning`은 `status === "completed"`만 센다(`AgentsPage.tsx:229`). `src/hooks/useAgents.ts`에는 실패한 에이전트 하나만 재시도하는 `retryAgent`가 이미 구현돼 있지만(`useAgents.ts` — `retryAgent` 함수), `AgentsPage.tsx:67`의 `useAgents()` 구조분해에는 `retryAgent`가 빠져 있고 화면 어디서도 호출되지 않는다.
- 고칠 방향: 오류 카드에 `retryAgent(agentId)`를 호출하는 "다시 시도" 버튼을 붙인다.

### 4. 오디오를 여러 개 첨부해도 첫 번째 파일만 전사돼 나머지는 AI 분석에서 조용히 빠진다
- 심각도: 위험
- 어디서: 새 상담 > AI 분석 준비 단계 (자유 지시 화면도 동일)
- 무슨 일이: 상담을 두 번에 나눠 녹음했거나(전화 끊겼다 이어서 녹음 등) 녹음 파일과 별도 음성 메모를 같이 올렸을 때, AI 분석에는 첫 번째 오디오의 내용만 들어간다. 두 번째 이후 녹음은 파일로는 사건에 저장되지만(추후 사건 파일 생성 단계에서 업로드), 정작 판서·율무·혜안이 읽는 대화록에는 없다. 변호사는 "다 넣었으니 AI가 다 봤겠지" 생각하지만 실제 분석은 일부 내용만 보고 나온 것이다.
- 근거: `src/pages/AgentsPage.tsx:101-105`에서 `audioFiles`를 여러 개 모으지만, `AgentsPage.tsx:205` `transcript = (await transcribeAndWait(audioFiles[0])) ?? undefined;`로 **첫 번째만** 전사한다. `FreeformPage.tsx:158-167`는 반대로 전체 오디오를 순회하며 전사하는데(`for (const af of audioFiles)`), 같은 제품 안에서 경로별로 동작이 다르다.
- 고칠 방향: `AgentsPage.tsx`도 `FreeformPage.tsx`처럼 오디오 파일 전체를 순회해 전사하고 합친다.

### 5. STT 전사가 조용히 실패해도 변호사에게 알리지 않는다
- 심각도: 위험
- 어디서: 사건 상세 > 추가 상담 저장(분석 없이)
- 무슨 일이: 기존 사건에 오디오 파일을 추가해 "저장(분석 없이)"을 누르면 파일별로 업로드 후 전사를 시도한다. 전사가 실패해도 화면에는 아무 오류도 뜨지 않고 다음 파일로 그냥 넘어간다. 변호사는 저장이 다 끝난 줄 알고 나가는데, 사건 상세 화면에서 그 녹음을 열어봐야만("STT 실패" 작은 배지) 문제를 알 수 있다.
- 근거: `src/pages/RecordPage.tsx:340-343` — `catch { await updateRecording(recId, { sttStatus: "failed" }); }` 이 catch 블록은 `setSaveError`를 호출하지 않는다. 화면에 뜨는 `saveError`(`RecordPage.tsx:63`, `saveError` state)는 `handleSaveOnly`의 바깥쪽 catch(`RecordPage.tsx:346-349` 근처)에서만 설정되므로, 파일 단위 STT 실패는 사용자에게 전혀 전달되지 않는다.
- 고칠 방향: 파일별 STT 실패를 모아 저장 완료 후 "N건은 음성 변환에 실패했습니다"라고 요약해 보여준다.

### 6. 같은 상담을 실수로 두 번 올려도 막지 않는다 — 전사 요금이 두 번 나간다
- 심각도: 위험
- 어디서: 새 상담 > 자료 첨부 화면
- 무슨 일이: 드래그로 파일을 두 번 놓거나 같은 파일을 "파일 선택"으로 다시 골라도 이름·크기가 같은 파일이 그대로 두 번 첨부 목록에 쌓인다. 막는 로직이 없다. 그대로 진행하면 같은 상담 오디오가 두 번 업로드되고, `functions/api/transcribe.ts`는 요청마다 요금제 한도를 소모하므로(`requireUsageQuota`) 전사 비용이 이유 없이 두 배로 나간다.
- 근거: `handleFileSelect`(`src/pages/RecordPage.tsx:132-152`)와 드롭존 콜백(`RecordPage.tsx:70-73`)이 `setFiles((prev) => [...prev, ...droppedFiles])`처럼 이름/크기 중복 검사 없이 바로 이어붙인다. 전사 요청은 파일마다 독립적으로 `requireUsageQuota`를 태운다(`functions/api/transcribe.ts` — `requireUsageQuota(context.env, uid)` 호출부).
- 고칠 방향: 첨부 시 파일명+크기가 같은 항목이 있으면 "이미 첨부됨" 안내로 대체 첨부를 막는다.

### 7. 1시간 녹음이 얼마나 걸리는지 미리도, 기다리는 중에도 알려주지 않는다
- 심각도: 답답
- 어디서: AI 분석 준비 단계 ("음성 파일 변환 중...")
- 무슨 일이: 긴 상담일수록 전사 대기가 최대 30분까지 걸릴 수 있는데(`computeMaxWaitMs`), 화면에는 시작부터 끝까지 "음성 변환 중..." 고정 문구만 보인다. 몇 분 남았는지, 지금 몇 분째인지 전혀 알 수 없어 변호사는 화면이 멈춘 건지 기다리면 되는 건지 판단할 수 없다.
- 근거: `src/services/rtzr.ts:281-297`의 `waitForTranscription`은 `onProgress?.({elapsedSeconds, maxSeconds})`로 경과·최대 시간을 넘길 수 있지만, `transcribeAndWait`(`rtzr.ts:366-381`)는 이 세부 진행률을 받지 않고 `"음성 변환 중..."` 같은 고정 문자열만 자신의 `onProgress`에 보낸다. `AgentsPage.tsx:204`는 이 고정 문자열을 그대로 `prepStatus`에 표시한다.
- 고칠 방향: `transcribeAndWait`가 `waitForTranscription`의 `onProgress`를 그대로 전달해 "약 12분 중 4분 경과" 같은 문구로 바꾼다.

### 8. 업로드·저장 중 뒤로 가기를 눌러도 경고가 없다
- 심각도: 답답
- 어디서: 새 상담 > 자료 첨부 화면의 "AI 분석 시작"/"저장(분석 없이)" 진행 중
- 무슨 일이: `uploading`·`savingOnly`가 true인 동안에도 브라우저 뒤로 가기나 다른 메뉴 클릭을 막는 장치가 없다. 문서 편집 화면(`DocumentPage.tsx`)에는 `beforeunload` 경고가 있는데 녹음·업로드 화면에는 없다.
- 근거: `src/pages/DocumentPage.tsx:397-398`에는 `window.addEventListener("beforeunload", handler)`가 있지만, `RecordPage.tsx` 전체에 `beforeunload`가 없다(검색 결과 0건).
- 고칠 방향: `uploading || savingOnly` 동안 `beforeunload` 경고를 등록한다.

### 9. 녹음 중임을 탭이 가려지면 알 수 없다
- 심각도: 답답
- 어디서: 상담 녹음 화면 (다른 탭으로 전환했을 때)
- 무슨 일이: 녹음 중 파형·타이머는 화면 안에서만 보인다. 탭 제목이나 아이콘이 바뀌지 않아, 다른 탭을 보다가 "지금도 녹음 중인가?"를 알 방법이 브라우저 탭으로는 없다. (MediaRecorder 자체는 백그라운드에서도 계속 녹음되므로 데이터 유실은 아니다 — 표시 문제다.)
- 근거: `document.title`을 바꾸는 코드가 저장소 전체에 없다(검색 결과 0건). `useRecording.ts`에도 `visibilitychange` 처리가 없다.
- 고칠 방향: 녹음 중일 때 탭 제목 앞에 "● 녹음 중" 등을 붙인다.

### 10. AI 분석 진행 화면을 벗어나면 STT/에이전트 결과가 어디에도 안 뜬다
- 심각도: 답답
- 어디서: AI 분석 화면에서 뒤로 가기 후 다시 들어왔을 때
- 무슨 일이: `AgentsPage`는 `location.state`가 없으면 `sessionStorage`에서 `AgentsState`(파일 제외)를 복원하지만, `rawState?.files`는 새로고침·재진입 시 항상 비어 있다. 그 상태에서 `restoreFromCache`가 실패하면(예: 캐시 만료 30분 초과) 첨부했던 파일 자체가 사라진 채로 처음부터 다시 시작해야 하는데, 화면은 이를 설명하지 않고 그냥 다시 "분석 중" 스피너를 돌린다(오디오 없이).
- 근거: `src/pages/AgentsPage.tsx:52-65`의 `state` 복원 로직에서 `files`는 `(AgentsState & { files?: File[] })`로 `location.state`에만 존재하고 `sessionStorage`에는 저장되지 않는다(`{ files: _files, ...serializable }`로 제외). `restoreFromCache`(`useAgents.ts` 내 `restoreFromCache`)는 30분 유효(`AgentsCacheData.timestamp` 체크)이며 그 이후엔 실패한다.
- 고칠 방향: 파일이 없이 재진입했을 때 "첨부 파일 정보가 사라졌습니다. 상담 녹음부터 다시 진행해 주세요" 안내로 대체한다.

## 확신이 낮은 항목
- 발견 3(에이전트 재시도 버튼 부재)은 `useAgents.ts`의 `retryAgent` 구현을 근거로 "쓸 수 있는데 안 붙였다"고 판단했다. UI에 다른 경로(예: 별도 컴포넌트)로 재시도가 연결돼 있을 가능성은 `search` 결과상 없었지만, 런타임에서 실제로 재시도가 전혀 불가능한지는 브라우저 실행으로 확인하지 못했다 — 코드 근거만으로 판단.
- 발견 8은 "경고가 없다"는 사실만 확인했고, 실제로 뒤로 가기 시 업로드가 중단되는지(브라우저가 진행 중인 fetch를 취소하는지)는 브라우저별로 다를 수 있어 추측이다.
