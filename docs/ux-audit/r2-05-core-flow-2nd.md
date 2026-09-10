# LAW-CADDY 2차 점검 — 핵심 흐름을 현실 시나리오로 다시 걷기

점검자 역할. 부산 1인 사무소 김 변호사(40대 후반, 개발 배경 없음, 하루 상담 3~4건, 같은 의뢰인 재방문·한 사건에 녹음 여러 개·문서 여러 판본이 일상).
점검 범위. 녹음/업로드 → 전사 → AI 분석 → 체크포인트 → 문서 생성·편집 → 문서고. 1차가 찾은 항목은 제외하고, "두 번째 상담·여러 녹음·여러 판본·다른 유형·중단 후 재개·다른 기기" 각도로만 봤다.
근거 경로는 모두 `C:/Users/jeonw/.antigravity/law-caddy/law-caddy/` 기준이다.

## 읽은 파일

- src/pages/RecordPage.tsx, FreeformPage.tsx, AgentsPage.tsx, CheckpointPage.tsx, DocumentPage.tsx, DocumentsPage.tsx, CaseDetailPage.tsx
- src/hooks/useRecording.ts, useAgents.ts, useDocument.ts, useDocumentChat.ts, useCaseDetail.ts
- src/services/recordingStore.ts, rtzr.ts, claude.ts, prompts.ts(문맥 조립·서식 목록·마스킹 지시 부분), caseAssistant.ts(한도 부분), docxExport.ts·hwpxExport.ts(파일명 부분)
- src/services/firebase/firestore.ts, storage.ts
- src/types/recording.ts, agent.ts, document.ts, case.ts, caseRecord.ts
- src/components/cases/UnifiedTimelineTab.tsx, TimelineTab.tsx, DocumentsTab.tsx, OverviewTab.tsx(문서 항목 부분), CaseAssistantTab.tsx(절단 표시 부분), CaseHeader.tsx(수정 폼 부분)
- src/config/constants.ts, src/App.tsx(라우트 부분)
- functions/api/claude.ts, functions/api/_shared/plan.ts(사용량 부분)
- src/data/ 에는 서식 정의 파일이 없다(landingContent.tsx·seoRoutes.json뿐). 문서 서식 28종은 `src/config/constants.ts`의 `DOC_TYPES`와 `src/services/prompts.ts`의 템플릿 함수에 있다.

## 시나리오별 걷기 기록

**S1. 월요일 첫 상담(녹음) → 소장 생성.** 새 상담 → 녹음 → 자료 첨부 → AI 분석(4명) → 사건 자동 생성(이때 파일 업로드) → 문서 유형 28종 중 선택 → 체크포인트 → 문서 → 저장. 문서는 `documents` 1건, 녹음은 `recordings`에 남는다. 문서에 변호사 등록번호·주소·연락처가 안 들어간다(발견 9).

**S2. 수요일 같은 의뢰인 두 번째 상담(녹음) → "AI 분석 시작".** 사건 화면 "추가 자료 등록" → RecordPage(추가 상담) → 녹음 → 첨부 → AI 분석. 이전 전사·분석·서면이 `previousTranscripts`로 딸려 가서 첫 녹음은 "기억"한다. 그런데 이번 녹음 파일과 전사는 사건에 저장되지 않는다(발견 1). 문서 유형을 고르지 않고 화면을 떠나면 분석 결과도 사라진다(발견 7).

**S3. 수요일 두 번째 상담, "저장 (분석 없이)".** 녹음은 업로드·전사되어 사건에 붙는다. 같이 적은 메모는 버려진다(발견 3).

**S4. 소장을 만든 사건에 준비서면 추가.** 기존 분석으로 다른 유형을 만드는 길이 없다. 다시 자료를 넣고 4명 분석을 처음부터 돌려야 한다(발견 5). 첫 소장은 남는다(문서는 별도 레코드).

**S5. 문서 수정 두 번 → 판본.** "AI 수정" → 저장하기 → 같은 레코드 덮어쓰기. 이전 판본 없음(발견 8).

**S6. 사무실 PC에서 체크포인트까지 하고 집에서 이어서.** 집 PC에서 사건 화면을 열면 '확인 대기' 문서가 보이지만 열 수 없다. 이어서 할 방법이 없다(발견 2).

**S7. 자유 입력으로 시작한 상담.** 항상 새 사건이 만들어져 녹음 상담과 다른 사건 화면에 떨어진다(발견 6).

**S8. 같은 이름 의뢰인 두 명이 같은 날 연달아.** 30분 안이면 앞사람 분석이 뒷사람에게 재사용된다(발견 4).

**S9. 90분 상담(전사 3만 자).** 분석·문서 단계에서는 잘리지 않는다. 사건 개요 요약·의뢰인 메시지·AI 비서에서는 잘리며, AI 비서만 표시가 있다(발견 15).

**S10. 주민번호가 들어간 전사·첨부.** 그대로 AI에 간다. 화면에 안내가 없다(발견 16).

---

## 발견

### 1. 두 번째 상담을 "AI 분석 시작"으로 올리면 녹음·첨부·전사가 사건에 저장되지 않는다 · 심각도 **막힘**

- 어디서. 사건 화면 「추가 자료 등록」 → 녹음/첨부 → 「AI 분석 시작」 → 분석 화면.
- 무슨 일이. 새 사건일 때는 분석이 끝난 뒤 `handleCreateCase` 안에서 파일을 Storage에 올리고 `recordings`를 만든다. 그런데 기존 사건(`hasExistingCase`)일 때는 이 함수가 아예 호출되지 않는다. 그래서 두 번째 상담의 녹음 파일, 첨부 서류, 전사 결과, "상담 접수" 타임라인 이벤트가 어디에도 남지 않는다. 사건 화면에는 첫 녹음 하나만 계속 보인다. 세 번째 상담 때 `previousTranscripts`를 만들 때도 `recordings`만 읽으므로(RecordPage.tsx:214-223) 두 번째 상담 내용은 세 번째 분석에서 빠진다. 변호사는 "분석까지 다 했으니 당연히 남았겠지"라고 믿고 원본 녹음을 지울 수 있다.
- 근거. src/pages/AgentsPage.tsx:254-259(`if (hasExistingCase || createdCaseId || isCreatingCase) return;`), 261-262(`handleCreateCase`가 `createdCaseId`가 있으면 즉시 return — 기존 사건은 74행에서 `createdCaseId = state.caseId`로 시작), 274-294(파일 업로드는 이 함수 안에만 있음), 205-206(전사 결과는 `sttTranscript` 메모리에만).
- 고칠 방향. 분석 시작 전(또는 직후)에 사건 ID가 있으면 파일 업로드·`createRecording`·전사 저장·타임라인 이벤트를 새 사건과 동일하게 수행한다. 저장 성공 여부를 분석 화면 상단에 "녹음 1건·서류 2건이 사건에 저장되었습니다"로 보여 준다.

### 2. 사무실에서 체크포인트까지 하고 집에서 이어서 할 수 없다 — '확인 대기' 문서는 사건 화면에서 열리지도 않는다 · 심각도 **막힘**

- 어디서. 사건 화면 개요 탭 → 문서 목록의 '확인 대기'(checkpoint) 또는 '생성 중'(generating) 항목.
- 무슨 일이. 분석 결과는 `documents`에 `status: "checkpoint"`, `finalDocument: ""`로 저장된다. 그런데 개요 탭 문서 항목은 `finalDocument`가 비어 있으면 눌러도 펼쳐지지 않고, 「AI 수정」 버튼은 펼쳐진 영역 안에만 있다. 활동 기록 탭의 문서 카드는 분석 결과를 펼쳐 보여 주기만 하고 이어서 진행할 버튼이 없다. 체크포인트·문서 화면은 `sessionStorage`(그 탭에서만 유효)에서만 상태를 복원한다. 결국 다른 PC·다른 탭·브라우저 재시작 뒤에는 "확인 대기"인 채로 영원히 남는다. 만약 열 수 있게 만들더라도 현재 DocumentPage는 `existingFinalDocument`가 비어 있으면 대화록·체크포인트 답변 없이 문서를 새로 생성하고 상태를 "generating"으로 바꾼 뒤 자동 저장은 건너뛴다.
- 근거. src/components/cases/OverviewTab.tsx:420(`onClick={() => hasContent && setExpanded(!expanded)}`), 447(`expanded && hasContent`), 526-533(AI 수정 버튼 위치); src/components/cases/UnifiedTimelineTab.tsx:528-546(분석 결과 펼치기만); src/pages/CheckpointPage.tsx:95-105, src/pages/DocumentPage.tsx:64-83(sessionStorage 복원); DocumentPage.tsx:135(`existingDocument && existingFinalDocument` 조건), 141-146(상태 generating으로 갱신), 148-173(대화록 없이 재생성), 180(기존 문서는 자동 저장 안 함).
- 고칠 방향. 저장된 문서 레코드만으로 체크포인트를 다시 열 수 있게 한다(agentResults·checkQuestions는 이미 저장됨, 전사는 발견 1을 고치면 `recordings`에 있음). '확인 대기' 항목에 「체크포인트 이어서 하기」 버튼을 개요·활동 기록 양쪽에 둔다.

### 3. "저장 (분석 없이)"를 누르면 같이 적은 상담 메모가 버려진다 · 심각도 **위험**

- 어디서. 추가 상담 → 자료 첨부 단계 → 메모 입력란에 상담 내용을 적고 「저장 (분석 없이)」.
- 무슨 일이. 파일은 업로드되고 타임라인에 "N개 파일 업로드 + 메모"라고 적히지만, 메모 본문은 어디에도 저장되지 않는다. 화면은 사건 상세로 이동하며 성공처럼 보인다. 파일 없이 메모만 적어도 버튼이 나타나므로(799행) "메모만 저장"이 되는 줄 알고 눌렀다가 통째로 잃는다.
- 근거. src/pages/RecordPage.tsx:263-362(`handleSaveOnly` 전체 — `typedNotes`를 저장하는 호출 없음), 348-352(타임라인 detail에 "+ 메모" 문구만), 785-788(안내문 "상담 메모만 적어도 분석을 시작할 수 있습니다"), 799-813(메모만 있어도 저장 버튼 표시).
- 고칠 방향. 메모를 타임라인 `note` 이벤트 detail 전체 또는 `recordings`의 텍스트 레코드로 저장한다. 최소한 버튼 문구를 "파일만 저장(메모는 저장되지 않음)"으로 바꾼다.

### 4. 같은 의뢰인 이름이면 30분 안엔 이전 분석을 그대로 재사용하고, 새 메모는 무시하며, 새 사건까지 하나 더 만든다 · 심각도 **위험**

- 어디서. 분석 화면 진입 시(파일 없이 메모만 넣은 경우).
- 무슨 일이. 분석 결과 캐시는 `clientName` 문자열과 30분 시각으로만 대조한다. 사건 ID는 보지 않는다. 그래서 (가) 김철수 상담 후 20분 뒤 다른 김철수(동명이인)가 메모 상담으로 들어오면 앞사람 분석이 그대로 뜬다. (나) 같은 의뢰인의 추가 상담을 메모만으로 넣으면 새 메모를 읽지 않고 이전 분석을 복원한다. (다) 새 상담 경로였다면 복원된 분석으로 사건 개요를 AI 생성하고 사건을 하나 더 만든다(중복 사건). 화면에는 "캐시에서 복원됨" 같은 표시가 없다.
- 근거. src/pages/AgentsPage.tsx:88-92(`!rawState?.files?.length && restoreFromCache(state.clientName)`); src/hooks/useAgents.ts:461-482(`data.clientName !== clientName` 만 검사, 30분), 627-636(캐시 저장 키에 사건 ID 없음); AgentsPage.tsx:229-259(복원 후 사건 자동 생성 조건은 `hasExistingCase`만 봄).
- 고칠 방향. 캐시 키에 사건 ID(또는 입력 자료의 해시)를 포함하고, 복원했으면 화면에 "N분 전 분석 결과를 다시 불러왔습니다 · 다시 분석" 배너를 띄운다.

### 5. 같은 사건에서 두 번째 유형 문서(소장 → 준비서면)를 만들려면 자료를 다시 넣고 분석을 처음부터 돌려야 한다 · 심각도 **답답**

- 어디서. 사건 화면 「추가 자료 등록」/「새 문서 생성」 → RecordPage.
- 무슨 일이. 문서 유형은 분석 화면 끝에서만 고를 수 있고, 분석 화면에 가려면 파일이나 메모가 반드시 있어야 한다(없으면 버튼 자체가 안 보임). 분석은 진입할 때마다 4명 전원을 새로 돌린다. "기존 분석으로 다른 유형 만들기" 경로가 없다. 첫 문서는 별도 레코드라 남기는 하지만, 준비서면 하나 더 만들려고 30분짜리 분석을 다시 기다리고 요금도 다시 든다.
- 근거. src/pages/RecordPage.tsx:207(`files.length === 0 && !typedNotes.trim()` 이면 return), 799(버튼 조건); src/pages/AgentsPage.tsx:94-216(매 진입마다 `startAgents`); AgentsPage.tsx:504-524(유형 선택은 분석 완료 후에만); src/services/firebase/firestore.ts:256-271(문서는 매번 새 레코드).
- 고칠 방향. 사건 화면 문서 목록에 「이 분석으로 다른 문서 만들기」를 두어 저장된 `agentResults`로 바로 체크포인트 화면으로 간다.

### 6. 자유 지시는 항상 새 사건을 만든다 — 기존 사건에 붙일 수 없고, 저장이 중간에 실패하면 재시도마다 사건이 하나씩 늘어난다 · 심각도 **위험**

- 어디서. 새 상담 첫 화면 「자유 지시로 바로 생성」 → 결과 → 「사건으로 저장」.
- 무슨 일이. 저장은 무조건 `addCase`로 시작해 사건을 새로 만들고, 유형은 "기타"로 고정된다. 이미 진행 중인 사건의 의뢰인이라도 같은 사건에 넣을 방법이 없어, 녹음 상담과 자유 입력 상담이 서로 다른 사건 화면에 흩어진다. 기존 사건에서 들어온 RecordPage에는 자유 지시 버튼이 아예 숨겨져 있다. 또 사건 생성 뒤 파일 업로드나 문서 저장에서 실패하면 오류만 뜨고 `saved`가 false로 남아, 다시 누르면 `addCase`부터 다시 실행되어 빈 사건이 하나 더 생긴다.
- 근거. src/pages/FreeformPage.tsx:211-215(`addCase(... caseType: "기타" ...)`), 205-273(실패 시 `saved` 미설정 → 재시도에 사건 재생성), 476-477(버튼은 `saving || saved`만 막음); src/pages/RecordPage.tsx:401(`!prefilled?.caseId &&` 조건으로 기존 사건에서는 숨김).
- 고칠 방향. 자유 지시 화면에 "기존 사건에 붙이기(사건 선택)" 옵션을 두고, 사건 화면에서도 자유 지시로 진입할 수 있게 한다. 저장은 사건 생성 성공 후 그 ID를 상태에 보관해 재시도 시 재사용한다.

### 7. 분석 결과(4명 산출물)는 문서가 완성되는 순간 사건 화면에서 사라지고, 유형을 고르지 않고 나가면 애초에 저장되지 않는다 · 심각도 **답답**

- 어디서. 사건 화면 활동 기록 탭 문서 카드, 개요 탭 문서 항목.
- 무슨 일이. 분석 결과는 「체크포인트 확인」을 눌러야 `documents`에 저장된다. 분석만 보고 나가면 30분짜리 sessionStorage 캐시 말고는 아무 데도 없다. 저장된 뒤에도 활동 기록 카드는 `finalDocument`가 비어 있을 때만 판례·쟁점 분석을 펼쳐 보여 주고, 문서가 완성되면 본문만 보인다. 개요 탭 문서 항목은 처음부터 본문만 보여 준다. 즉 "지난주 판례 검색 결과를 다시 보자"가 불가능하다.
- 근거. src/pages/AgentsPage.tsx:538-555(`createDocument`는 유형 선택 버튼 안에만); src/components/cases/UnifiedTimelineTab.tsx:505(`isExpanded && hasContent` → 본문), 528(`isExpanded && !hasContent && doc.agentResults` → 분석); src/components/cases/OverviewTab.tsx:447-463(본문만).
- 고칠 방향. 문서 카드에 「분석 결과 보기」 탭을 항상 두고, 분석 완료 시점에 유형 선택과 무관하게 사건에 저장한다.

### 8. 문서 판본이 없다 — 「저장하기」는 덮어쓰기이고, 같은 유형이 여러 건이면 날짜·시각으로만 구분한다 · 심각도 **답답**

- 어디서. 문서 화면 「저장하기」, 사건 화면 문서 목록, 문서고.
- 무슨 일이. 「AI 수정」으로 열어 고치고 저장하면 같은 레코드의 `finalDocument`를 교체한다. 이전 판본은 어디에도 없고 되돌릴 수 없다. 반대로 체크포인트를 다시 거치면 새 레코드가 생겨 "준비서면·준비서면·준비서면"이 나란히 쌓이는데, 제목·메모 필드가 없어 "1차 제출본"과 "판사 지적 반영본"을 구분할 길이 없다. 문서고도 유형·의뢰인·상태만 보여 준다.
- 근거. src/pages/DocumentPage.tsx:300-336(`updateDocument(state.documentId, { finalDocument, status: "completed" })`); src/types/document.ts:66-87(`LegalDocument`에 판본·제목·메모 필드 없음); src/components/cases/UnifiedTimelineTab.tsx:489-493(카드 제목은 `doc.docType`, 부제 "법률 문서"); src/pages/DocumentsPage.tsx:119-156.
- 고칠 방향. 저장 시 이전 본문을 `versions[]`에 밀어 넣고 「이전 판본 보기/되돌리기」를 둔다. 문서에 제목(기본값 "유형 · 날짜")과 한 줄 메모를 추가한다.

### 9. 본 흐름(녹음→분석→문서)으로 만든 서면에는 변호사 등록번호·사무소 주소·연락처가 안 들어간다 · 심각도 **답답**

- 어디서. 문서 생성 화면(처음 만들 때).
- 무슨 일이. RecordPage는 `firmName`·`lawyerName`만 다음 화면으로 넘기고, 이 상태가 분석·체크포인트·문서까지 그대로 전달된다. 프롬프트는 `barLicenseNumber`·`businessAddress`·`lawyerPhone`이 있을 때만 "등록번호·사무소 주소·연락처"를 사건 자료에 넣으므로, 처음 생성되는 소장·준비서면의 당사자 표시·서명란에 그 정보가 빠진다. 반면 사건 화면에서 「AI 수정」으로 열 때는 세 값을 넘겨서, 같은 문서를 두 경로로 다루면 결과가 달라진다.
- 근거. src/pages/RecordPage.tsx:241-253(`firmName`, `lawyerName`만); src/pages/AgentsPage.tsx:563-575(`...state` 전달); src/pages/DocumentPage.tsx:161-165(`state.barLicenseNumber` 등은 undefined); src/services/prompts.ts:169-174(있을 때만 삽입); src/pages/CaseDetailPage.tsx:424-426(AI 수정 경로만 세 값 전달).
- 고칠 방향. RecordPage에서 `user.barLicenseNumber`·`businessAddress`·`phone`을 함께 넘기거나, DocumentPage가 `useAuth`에서 직접 읽는다.

### 10. 화면의 문서 유형 28종 중 5종은 전용 서식이 없고, 사건 유형과 무관하게 28개가 한 번에 나열된다 · 심각도 **답답**

- 어디서. 분석 완료 후 「생성할 문서 유형」 격자.
- 무슨 일이. `DOC_TYPES` 28종이 그대로 버튼이 된다(타입 정의에는 내부용 "자유지시"까지 29종). 그런데 서식 템플릿은 23종만 있어서 **가처분신청서·이의신청서·조정신청서·고발장·상담 요약 리포트**는 "[일반 법률 문서 서식]"으로 생성된다. 빈칸 안내는 15종뿐이다. 이 차이가 화면에 표시되지 않아 변호사는 5종도 다른 것과 같은 품질로 나오리라 기대한다. 또 형사 사건인데 이혼소장·임차권등기명령신청서까지 다 보이고, 사건 화면에 별도 흐름(수임계약서 생성 모달)이 있는 사건위임계약서 2종도 여기 섞여 있다.
- 근거. src/config/constants.ts:585-608(28종); src/types/document.ts:52-64(29종); src/services/prompts.ts:756-1956(템플릿 키 23개 — 758, 826, 865, 886, 921, 965, 988, 1015, 1036, 1063, 1112, 1161, 1218, 1265, 1329, 1383, 1435, 1482, 1535, 1580, 1643, 1704, 1865), 1956(폴백 "[일반 법률 문서 서식]"), 1964-2047(빈칸 안내 15개); src/pages/AgentsPage.tsx:510-524(사건 유형 필터 없음).
- 고칠 방향. 서식 없는 5종에 서식을 추가하거나 버튼에 "기본 서식" 표시를 붙인다. 분류된 사건 유형에 맞는 유형을 앞에 두고 나머지는 접는다.

### 11. 분석 화면의 「이전 단계」는 기존 사건 맥락을 버리고 빈 "새 상담" 첫 화면으로 보낸다 · 심각도 **답답**

- 어디서. 분석 화면 좌상단 「이전 단계」.
- 무슨 일이. `navigate("/record")`를 상태 없이 호출한다. RecordPage는 `location.state`가 없으면 사건 ID·의뢰인 이름·방금 넣은 파일과 메모를 모두 잃고 1단계 "사건 정보 입력"(의뢰인 이름 빈칸)부터 시작한다. 추가 상담 중이던 변호사는 사건 화면으로 돌아가 다시 「추가 자료 등록」을 눌러야 하고, 이미 진행 중이던 분석 API 호출은 그대로 돈다.
- 근거. src/pages/AgentsPage.tsx:328-334; src/pages/RecordPage.tsx:45-49(prefilled null), 51(초기 step "info"), 76(clientName "").
- 고칠 방향. `navigate(-1)` 또는 `state`를 되돌려 주고, 분석 진행 중이면 "분석이 취소됩니다" 확인을 받는다.

### 12. 날짜가 UTC 기준으로 붙는다 — 내보내기 파일명과 AI 비서에 주는 날짜가 오전 9시 이전엔 전날이 된다 · 심각도 **말**

- 어디서. 문서 화면 「DOCX/HWP 다운로드」, 사건 개요 문서 항목 「다운로드」, 사건 AI 비서.
- 무슨 일이. `toISOString().slice(0, 10)`은 UTC 날짜다. 한국 시간 새벽 0시~8시 59분 사이에 내보내면 파일명 `소장_홍길동_2026-09-10.docx`처럼 하루 전 날짜가 붙고, 그 시간대에 만든 문서는 개요 탭 다운로드 파일명도 전날이 된다. AI 비서는 녹음·타임라인 날짜를 같은 방식으로 프롬프트에 넣어 "9월 11일 상담"을 "9월 10일"로 알고 답한다. 화면 표시(`toLocaleDateString`)는 정상이라 화면과 파일명이 어긋난다.
- 근거. src/pages/DocumentPage.tsx:452, 474; src/components/cases/OverviewTab.tsx:489, 508; src/services/caseAssistant.ts:144, 160; src/services/docxExport.ts:173, src/services/hwpxExport.ts:482(파일명에 `meta.date`).
- 고칠 방향. 로컬 날짜(`ko-KR` 기준 YYYY-MM-DD) 헬퍼 하나로 통일한다.

### 13. 사건 개요 화면의 문서 상태가 "checkpoint"·"generating" 영어 그대로 찍힌다 · 심각도 **말**

- 어디서. 사건 화면 개요 탭 → 문서 폴더 → 각 문서의 상태 배지.
- 무슨 일이. `completed`→"완료", `processing`→"진행중"만 한글이고 나머지는 `doc.status` 원문이 나온다. 발견 2의 '확인 대기' 문서는 여기서 "checkpoint"로, 생성 중 끊긴 문서는 "generating"으로 보인다. 같은 문서가 활동 기록 탭에서는 "체크포인트"·"생성중", 문서고에서는 "확인 대기"·"생성 중"으로 표기되어 세 화면이 다 다르다.
- 근거. src/components/cases/OverviewTab.tsx:405; src/components/cases/UnifiedTimelineTab.tsx:48-53; src/pages/DocumentsPage.tsx:11-16.
- 고칠 방향. 상태 라벨 표를 한 곳(예: types/document.ts 옆)에 두고 세 화면이 같은 표를 쓴다.

### 14. 사건을 삭제해도 녹음·전사·문서가 남는다 — 문서고에 "(삭제된 사건)"으로 떠 있고 누르면 "사건을 찾을 수 없습니다" · 심각도 **위험**

- 어디서. 사건 화면 삭제 → 문서고.
- 무슨 일이. 삭제는 `cases` 문서 하나만 지운다. `recordings`(녹음 파일 URL·전사 전문), `documents`(서면 본문), Storage 파일은 그대로 남는다. 문서고는 이 문서들을 "(삭제된 사건)"으로 계속 보여 주고, 클릭하면 사건 상세로 이동해 "사건을 찾을 수 없습니다"만 뜬다. 의뢰인이 "제 기록 다 지워 주세요"라고 해서 사건을 삭제해도 상담 전사가 서버에 남는다는 뜻이다.
- 근거. src/hooks/useCaseDetail.ts:655-660(`firestoreDeleteCase(caseId)`만); src/services/firebase/firestore.ts:671-681; src/pages/DocumentsPage.tsx:135(`navigate(/cases/${d.caseId})`), 144("(삭제된 사건)"); src/pages/CaseDetailPage.tsx:492-507.
- 고칠 방향. 삭제 시 하위 `recordings`·`documents`·Storage 경로를 함께 지우거나(서버 함수), 최소한 삭제 확인 창에 "녹음 N건·문서 N건이 남습니다/함께 삭제됩니다"를 명시하고 문서고에서 고아 문서는 열람·삭제만 가능하게 한다.

### 15. 긴 상담 전사는 분석·문서 단계에서는 잘리지 않지만, 사건 개요 요약·의뢰인 메시지는 앞 2,000자만 보고 만들며 안내가 없다. 이전 상담 자료는 무제한으로 누적 전송된다 · 심각도 **말**

- 어디서. 분석 완료 후 사건 개요 자동 생성, 문서 화면 「의뢰인 메시지」 탭, 추가 상담 분석.
- 무슨 일이. (가) 90분 전사(3만 자)는 공통 자료 블록에 그대로 들어가고 서버도 자르지 않는다(1M 컨텍스트 베타). 그러나 사건 개요 요약은 대화록 2,000자·분석 2,000자만 보고, 의뢰인 메시지는 완성 문서의 앞 2,000자만 참고한다. 뒤쪽에 있는 청구 금액·기한이 메시지에 빠져도 화면엔 표시가 없다. 사건 AI 비서만 녹음당 8,000자 절단을 "⚠ 일부 절단"으로 알려 준다. (나) 추가 상담 때는 이전 전사 전부 + 이전 분석 전부 + 이전 서면 전부를 이어 붙여 4명 + 예열 1회에 매번 보낸다. 상한이 없어 세 번째·네 번째 상담부터는 요청 크기와 요금이 계속 불어나는데 사용자는 알 수 없다.
- 근거. src/services/prompts.ts:214-232(fileContents·previousTranscripts·transcript 무제한), 2580-2582(2,000자·1,000자·2,000자), 2317(`finalDocument.slice(0, 2000)`); src/services/claude.ts:87(1M 베타), functions/api/claude.ts:56-113(입력 상한 없음); src/services/caseAssistant.ts:32-35, src/components/cases/CaseAssistantTab.tsx:120; src/pages/RecordPage.tsx:219-235(누적 조립); src/hooks/useAgents.ts:514-524(예열 호출에도 같은 프리픽스).
- 고칠 방향. 사건 개요·의뢰인 메시지는 전문을 쓰거나 "앞부분만 참고했습니다" 표시. 이전 자료는 최근 N건·요약본으로 제한하고 분석 화면에 "이전 상담 2건 포함"을 표시한다.

### 16. 전사·첨부·체크포인트 답변의 주민번호·계좌번호가 마스킹 없이 그대로 AI로 가고, 화면 어디에도 "외부 AI로 보낸다"는 안내가 없다 · 심각도 **위험**

- 어디서. 자료 첨부 단계, 분석 화면, 체크포인트, 문서 화면 채팅.
- 무슨 일이. 전사 원문·첨부 파일 추출 텍스트·체크포인트 답변·채팅 첨부 PDF는 가공 없이 프롬프트에 들어간다. 프롬프트의 마스킹 지시는 "응답에 그대로 포함하지 말라"는 출력 규칙일 뿐 입력을 가리지 않는다. 서버 프록시에도 마스킹 단계가 없다(functions/api 아래에 mask 관련 코드 없음). 사건기록 탭은 `maskedPII` 플래그를 두고 다루지만 녹음·문서 흐름에는 그런 개념이 없다. 자료 첨부 화면 문구는 "계약서·내용증명·상대방 서면 등을 넣어 주세요"뿐이라, 변호사는 주민번호가 적힌 등본을 그대로 올린다. 변호사법 비밀유지 관점에서 최소한 고지가 필요하다.
- 근거. src/services/prompts.ts:214-232, 380-420(원문 삽입), 81·2557(출력 마스킹 지시만); functions/api/claude.ts:56-113; src/hooks/useDocumentChat.ts:597-619(첨부 PDF 원문 삽입); src/types/caseRecord.ts:270(사건기록만 `maskedPII`); src/pages/RecordPage.tsx:666-667(안내 문구).
- 고칠 방향. 자료 첨부·체크포인트 화면에 "입력 내용은 AI 분석을 위해 외부 서비스로 전송됩니다. 주민등록번호 뒷자리·계좌번호는 지우고 올려 주세요" 안내를 넣고, 전송 전에 주민번호·계좌번호 정규식 마스킹을 한 번 거친다.

### 17. 「의뢰인 메시지」 탭을 연달아 누르면 메시지가 두 번 생성된다 · 심각도 **말**

- 어디서. 문서 화면 상단 「의뢰인 메시지」 탭.
- 무슨 일이. 탭을 누를 때 `clientMessage`가 비어 있으면 생성을 시작하는데, 생성 중임을 확인하는 조건이 없다. 응답이 오기 전에 탭을 한 번 더 누르면(또는 문서 탭으로 갔다가 다시 오면) 요청이 한 번 더 나가고 나중 결과가 앞 결과를 덮는다. 요금이 두 배로 들고 저장 훅도 첫 결과로 한 번만 저장한다.
- 근거. src/pages/DocumentPage.tsx:376-380(`if (!clientMessage) handleGenerateClientMessage()`); src/hooks/useDocument.ts:394-417(중복 호출 방지 없음); DocumentPage.tsx:198-205(`msgSaved` 1회).
- 고칠 방향. `status === "generating_message"`면 호출하지 않는다.

### 18. 활동 기록의 녹음 시각은 상담한 시각이 아니라 분석이 끝나 업로드된 시각이고, 상담 일자를 적는 칸이 없다 · 심각도 **말**

- 어디서. 사건 화면 활동 기록 탭.
- 무슨 일이. 새 상담 경로에서 녹음 파일은 4명 분석이 모두 끝난 뒤에야 업로드·등록되므로 `createdAt`이 상담 종료 후 10~20분 뒤가 된다. 아침에 폰으로 녹음해 저녁에 올리면 저녁 시각으로 남는다. "상담 접수" 이벤트도 같은 시점이다. 상담 일시를 직접 적는 입력란은 어디에도 없어, 나중에 "언제 상담했는지"를 활동 기록으로 증명하기 어렵다.
- 근거. src/pages/AgentsPage.tsx:253-259, 274-301(분석 완료 후 업로드·이벤트); src/services/firebase/firestore.ts:172-187(`createdAt: serverTimestamp()`); src/components/cases/UnifiedTimelineTab.tsx:128, 138(createdAt 기준 정렬); src/types/recording.ts:3-17(상담 일시 필드 없음).
- 고칠 방향. 녹음 파일의 마지막 수정 시각(`File.lastModified`)이나 녹음 시작 시각을 `recordedAt`으로 저장하고 활동 기록은 그 값으로 정렬한다. 자료 첨부 화면에 "상담 일시" 칸을 둔다.

---

## 확신이 낮은 항목

- **타임라인 이벤트와 문서·녹음의 시계가 다르다.** 타임라인 이벤트는 브라우저 시각(`Timestamp.now()`, firestore.ts:143-146), 문서·녹음은 서버 시각(`serverTimestamp()`)이다. PC 시계가 몇 분 틀어져 있으면 같은 순간의 "문서 초안 작성 완료" 이벤트와 문서 카드 순서가 뒤바뀔 수 있다. 실제로 체감될 만큼 어긋나는지는 확인하지 못했다.
- **발견 1의 "새 사건" 경로도 파일 업로드 실패를 조용히 삼킨다.** AgentsPage.tsx:290-292는 업로드 실패를 `console.error`로만 남기고 사건 생성은 성공으로 표시한다. 어떤 조건에서 실제로 실패하는지는 실행 없이 알 수 없어 확신이 낮다. (1차의 "저장·내보내기 실패 침묵"과 같은 계열이라 별도 항목으로 올리지 않았다.)
- **28종 목록에 있는 사건위임계약서 2종이 분석 흐름에서 정상 생성되는지.** 서식은 존재하지만(prompts.ts:1704, 1865) 이 흐름은 체크포인트 질문 → 서면 생성용이라 계약서에 필요한 수임료·성공보수 입력이 없다. 실제 출력 품질은 실행하지 않아 판단하지 못했다. 사건 화면의 수임계약서 모달(ContractGenerateModal)과 결과가 다를 가능성만 지적한다.
