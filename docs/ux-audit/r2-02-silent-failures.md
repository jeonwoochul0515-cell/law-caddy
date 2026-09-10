# r2-02 · 조용히 삼키는 실패 점검 — "화면이 조용하면 잘 된 줄 아는" 김 변호사 관점

점검자 역할. 부산 1인 사무소 40대 후반 변호사. 개발 용어·영어 오류 문구를 모른다. 화면이 조용하면 "됐나 보다"라고 믿는다.
점검 방법. `rg "catch"`(src 291곳·functions/api 58곳)와 `console.error|warn`, `alert|toast|setError`를 전수로 뽑아, 각 지점에서 **실패 시 화면에 무엇이 보이는지** 끝까지 추적했다. 서버 오류 응답 본문이 화면까지 어떻게 오는지도 봤다(`apiBase.ts`·`api-auth.ts`·`retry.ts`·`_middleware.ts`·`_shared/plan.ts`·`_shared/auth.ts`·`_shared/rate-limit.ts`).
제외. 이미 보고된 항목(대시보드·알림·연체 0건, 백업 초록색, 연락처 비우고 저장 영어, 402 녹음 버려짐·"버그 리포트" 문구, 전사 402 삼킴, 기본 질문 4개 바꿔치기, 법제처 실패=판례 없음, HTTP 번호·영어·API 키 조각, 사업자등록증 JSON, 구글 로그인 영어). 같은 계열의 **다른 사례**만 실었다.

## 읽은 파일

- 서비스: `src/services/apiBase.ts`, `api-auth.ts`, `retry.ts`, `claude.ts`, `notify.ts`, `payment.ts`, `rtzr.ts`, `recordingStore.ts`, `file-save.ts`, `pdf.ts`, `ocr.ts`, `excel.ts`, `pptx.ts`, `hwpx.ts`, `firebase/firestore.ts`, `firebase/storage.ts`, `firebase/signing.ts`
- 훅: `src/hooks/useCaseDetail.ts`, `useCases.ts`, `useClientCare.ts`, `useDocument.ts`, `useDocumentChat.ts`, `useDropZone.ts`, `usePlanLimits.ts`, `useAuth.ts`, `useRecording.ts`, `useAgents.ts`
- 페이지: `src/pages/CaseDetailPage.tsx`, `AgentsPage.tsx`, `CheckpointPage.tsx`, `DocumentPage.tsx`, `FreeformPage.tsx`, `RecordPage.tsx`, `SettingsPage.tsx`, `ProfileSetupPage.tsx`, `AdminPage.tsx`, `DashboardPage.tsx`, `CasesPage.tsx`, `ClientsPage.tsx`, `FinancePage.tsx`, `CalendarPage.tsx`, `DocumentsPage.tsx`, `LoginPage.tsx`, `LandingPage.tsx`, `PortalPage.tsx`, `SigningPage.tsx`, `PaymentSuccessPage.tsx`, `PaymentFailPage.tsx`, `App.tsx`
- 컴포넌트: `src/components/cases/ClientCareTab.tsx`, `ScheduleTab.tsx`, `CaseRecordsTab.tsx`, `OverviewTab.tsx`, `ContractPaymentSection.tsx`, `ContractGenerateModal.tsx`, `NewCaseModal.tsx`, `DocumentsTab.tsx`, `CaseHeader.tsx`, `OpponentDocs.tsx`, `UnifiedTimelineTab.tsx`, `CaseAssistantTab.tsx`; `accounting/FeeManagementTab.tsx`, `DepositManagementTab.tsx`, `CaseExpenseTab.tsx`, `TaxReportTab.tsx`, `SuccessFeeClaimModal.tsx`, `PurchaseTransactionModal.tsx`, `OfficeExpenseModal.tsx`, `MonthlyReportTab.tsx`, `CourtFeeCalculator.tsx`, `OverdueAlertPanel.tsx`; `payment/PaymentModal.tsx`; `ui/BugReportButton.tsx`, `ui/ApiStatusMonitor.tsx`; `layout/NotificationBell.tsx`; `dashboard/DashboardStats.tsx`
- 서버: `functions/api/_middleware.ts`, `_shared/auth.ts`, `_shared/plan.ts`, `_shared/rate-limit.ts`, `claude.ts`, `transcribe.ts`, `transcribe/[id].ts`, `payment/confirm.ts`, `signing/[token].ts`, `portal/[token].ts`, `notify/client.ts`, `consult.ts`

## 전수 표

심각도. **상** = 돈·데이터를 잃거나 잘못된 판단으로 이어짐 / **중** = 실패했는데 성공처럼 보이거나 다음 행동을 알 수 없음 / **하** = 불편하지만 곧 알아차림

| 파일:줄 | 어떤 작업 | 실패 시 화면에 보이는 것 | 심각도 |
|---|---|---|---|
| CaseDetailPage.tsx:165-167 | 수임료 관리 시작(Fee 생성) | 아무것도 없음. 버튼만 그대로 | 상 |
| CaseDetailPage.tsx:199-201 | 매출 자동 등록 | 아무것도 없음(입금 처리는 된 것처럼 보임) | 중 |
| CaseDetailPage.tsx:234-236 | 수임료(계약·착수금·성공보수) 수정 | 아무것도 없음. 탭의 alert는 절대 안 뜸 | 상 |
| CaseDetailPage.tsx:249-251 | 분할납부 등록 | 폼 닫힘, 목록에 안 나타남, 메시지 없음 | 상 |
| CaseDetailPage.tsx:276-278 | 분할납부 납부 처리 | 체크가 안 바뀜, 메시지 없음 | 상 |
| CaseDetailPage.tsx:291-293 | 분할납부 삭제 | 그대로 남음, 메시지 없음 | 중 |
| CaseDetailPage.tsx:339-341 | 예수금 자동 차감 | 비용은 등록, 차감 안 됨, 메시지 없음 | 중 |
| CaseDetailPage.tsx:345-347 | 사건비용 등록 | 폼 닫힘(CaseExpenseTab:324), 목록 그대로 | 상 |
| CaseDetailPage.tsx:354-356 / 363-365 | 사건비용 정산·삭제 | 아무것도 없음 | 중 |
| CaseDetailPage.tsx:386-388 | 예수금 등록 | 폼 닫힘(DepositManagementTab:271), 목록 그대로 | 상 |
| CaseDetailPage.tsx:395-397 / 404-406 | 예수금 사용·반환·삭제 | 아무것도 없음 | 중 |
| CaseDetailPage.tsx:113 | 문자 발송 후 의뢰인 번호 저장 | "문자를 발송했습니다"만. 번호는 저장 안 됨 | 하 |
| CaseDetailPage.tsx:144-146 / 155 | 재무·서명요청 목록 조회 | 빈 화면(수임료 미등록처럼 보임) | 중 |
| CaseDetailPage.tsx:461 | 계약 체결 후 계약·수임료 현황 갱신 | 잠깐 바뀌었다가 조용히 원상복구 | 중 |
| CaseDetailPage.tsx:725 | 계약서 Word 다운로드 | 아무것도 없음 | 중 |
| CaseDetailPage.tsx:476-479 → CaseHeader.tsx:111-114 | 사건 삭제 | 확인 버튼이 원래대로 돌아감, 메시지 없음 | 중 |
| FeeManagementTab.tsx:195 | 수임료 관리 시작 버튼 | await·disabled 없음 → 두 번 누르면 Fee 2개 | 중 |
| FeeManagementTab.tsx:1017-1067, 1283, 1303, 1345 | 성공보수 항목 변경 | 잠금 없음, 실패 무언(상위가 삼킴) | 중 |
| useCaseDetail.ts:118-125 | 문서·녹음·상대방서면·사건기록 조회 | 빈 목록("없음"처럼 보임) | 중 |
| useCaseDetail.ts:171-173 | 사건 상태 변경 | 바뀌었다가 조용히 되돌아감 | 중 |
| useCaseDetail.ts:222-229 | 타임라인 메모 추가 | 폼 닫히고 메모가 사라짐(UnifiedTimelineTab:156-166) | 중 |
| useCaseDetail.ts:254-271 → UnifiedTimelineTab.tsx:169-179 | 상대방 서면 업로드 | 처리되지 않은 오류. 스피너만 멈춤 | 중 |
| useCaseDetail.ts:277-283 → OpponentDocs.tsx:88-95 | 상대방 서면 삭제 | 화면에서 사라짐, 실제론 남음(새로고침 시 부활) | 중 |
| useCaseDetail.ts:325-368 → CaseRecordsTab.tsx:135-143 | 사건기록 업로드 | 처리되지 않은 오류. 폼 열린 채 스피너 멈춤 | 중 |
| useCaseDetail.ts:370-378 → CaseRecordsTab.tsx:146-152 | 사건기록 삭제 | 화면에서 사라짐, 실제론 남음 | 중 |
| useCaseDetail.ts:398-400, 439-441, 454-456 | 사건기록 OCR 상태 저장 | 상태 배지가 "파싱 대기"에 멈춤 | 하 |
| useCaseDetail.ts:445-447 | 사건기록 LLM 분류 보정 | 무언(분류가 파일명 추정 그대로) | 하 |
| useCaseDetail.ts:672-674 / 693-735 | 계약현황·부가비용 저장 | 잠깐 바뀌었다 되돌아감 | 중 |
| useClientCare.ts:100-102 | 케어 메시지 목록 조회 | 빈 목록 | 중 |
| useClientCare.ts:162-189 | 케어 메시지 생성 | 메시지는 저장됐는데 타임라인 실패면 "생성 실패" 표시 | 중 |
| useClientCare.ts:201-204 → ClientCareTab.tsx:195-201 | 케어 메시지 삭제 | 처리되지 않은 오류. 그대로 남음 | 중 |
| ClientCareTab.tsx:124-126 | 의뢰인 포털 켜기/끄기 | 아무것도 없음. 스위치 안 바뀜 | 중 |
| ClientCareTab.tsx:149, 167 | 문자 후 번호 저장 | 무언 | 하 |
| ClientCareTab.tsx:136, 192 · OverviewTab.tsx:414, 634 · DocumentsTab.tsx:60 · UnifiedTimelineTab.tsx:153 · DocumentPage.tsx:249 · FreeformPage.tsx:280 · AdminPage.tsx:144 · OpponentDocs.tsx:137 · SuccessFeeClaimModal.tsx:120 · OverdueAlertPanel.tsx:120 | 클립보드 복사 | "복사됨"이 안 뜸. 그뿐 | 하 |
| OverviewTab.tsx:494 / 513 | 문서 Word·HWPX 내보내기 | 스피너만 멈춤, 파일 없음, 메시지 없음 | 중 |
| DocumentPage.tsx:454-458 / 476-480 | 문서 Word·HWPX 내보내기 | 위와 같음 | 중 |
| ContractPaymentSection.tsx:350 | 계약서 다운로드 | 아무것도 없음 | 중 |
| OpponentDocs.tsx:123-124 | 상대방 서면 → 의뢰인 카톡 문안 생성 | 스피너 멈춤, 메시지 없음 | 하 |
| ContractGenerateModal.tsx:131-133 | 특약사항 AI 법률문체 변환 | 원문 그대로 계약서에 들어감(변환된 줄 앎) | 중 |
| ContractGenerateModal.tsx:165-170 | 계약서·서명요청 생성 | 오류 문구 표시(Firestore 영어 포함) | 하 |
| DocumentPage.tsx:142-145 | 체크포인트 답변 저장 | 무언 | 하 |
| DocumentPage.tsx:183-186 | **완성 문서 자동 저장** | 무언. 화면엔 문서가 보여 저장된 줄 앎 | 상 |
| DocumentPage.tsx:193, 202-204 | 타임라인·의뢰인 메시지 저장 | 무언 | 하 |
| DocumentPage.tsx:331-333 | "저장하기" 버튼 | "저장됨"도 오류도 안 뜸. 버튼만 원상복구 | 상 |
| DocumentPage.tsx:276 | 채팅 첨부 업로드 | 무언(대화는 진행) | 하 |
| useDocumentChat.ts:256-258 | 수정안 적용 후 자동 재검토 | 무언 | 하 |
| AgentsPage.tsx:131-165 | PDF·이미지·Excel·PPT·DOCX·HWPX·HWP 추출 | 무언. 자료 없이 분석 진행 | 중 |
| AgentsPage.tsx:185-187 | OCR 텍스트 저장 | 무언 | 하 |
| AgentsPage.tsx:202-213 | **녹음 STT** | 무언. 대화록 없이 분석. 2번째 녹음은 아예 무시 | 상 |
| AgentsPage.tsx:249 | 사건 개요 요약 | 의뢰인명+"사건"으로 바꿔치기 | 하 |
| AgentsPage.tsx:281-292 | 사건 생성 시 첨부 업로드 | 무언. 사건은 "생성됨" | 상 |
| AgentsPage.tsx:301, 561 | 타임라인 기록 | 무언 | 하 |
| AgentsPage.tsx:535-537, 555 | 에이전트 실행 오류 | "오류: Claude API 호출 실패: HTTP 429 Too Many Requests" 류 | 중 |
| CheckpointPage.tsx:259-261 | 질문별 마이크 녹음 시작 | 아무것도 없음. 버튼이 안 먹는 것처럼 | 하 |
| CheckpointPage.tsx:328-330, 386-388 | 체크포인트 첨부·답변 녹음 업로드 | 무언. 다음 단계로 진행 | 중 |
| CheckpointPage.tsx:342-352 | PDF·이미지 추출 | 무언 | 중 |
| FreeformPage.tsx:111-166 | 첨부 추출·STT | 무언. 자료 없이 지시 실행 | 중 |
| FreeformPage.tsx:234-236 | 결과 저장 시 첨부 업로드 | 무언. "저장됨" 후 사건으로 이동 | 중 |
| RecordPage.tsx:236-238 | 이전 상담 대화록 불러오기 | 무언. 맥락 없이 분석 | 중 |
| RecordPage.tsx:254-255 | 첨부 단계 → 분석으로 이동 | 스피너 멈춤, 화면 그대로. 메시지 없음 | 상 |
| RecordPage.tsx:262-362 | 추가 자료 저장(파일 여러 개) | 일부만 저장된 채 "저장 중 오류". 재시도 시 중복 | 중 |
| RecordPage.tsx:340-343 | 추가 자료 STT | 사건 상세에 "STT 실패" 배지(정상) | 하 |
| useRecording.ts:162-166 | 녹음 중 장치 오류 | 중단 배너(정상, RecordPage:498) | 하 |
| recordingStore.ts:88-90, 124-127, 137-139 | 녹음 조각 임시저장·복구 | 무언. 사고 시 복구 배너가 안 뜸 | 중 |
| useCases.ts:104-107 · CasesPage.tsx:65-67 | 사건 목록 조회 | 빈 목록(CasesPage) / 문구(useCases) | 중 |
| CasesPage.tsx:133-138 | 목록에서 계약현황 변경 | 조용히 새로고침. 그 새로고침이 실패하면 처리되지 않은 오류 | 중 |
| FinancePage.tsx:157-162 | 재무 전체 조회 | 전부 0원·빈 목록 | 중 |
| FinancePage.tsx:187-193 | 거래·사무실 비용 삭제 | 그대로 남음, 메시지 없음 | 중 |
| DashboardStats.tsx:52-53 | 매출·비용 통계 | 0원 | 중 |
| SettingsPage.tsx:79-81, 437 | 결제 내역 조회 | "결제 내역이 없습니다." | 하 |
| SettingsPage.tsx:119-123, 156-160 | 프로필·비밀번호 저장 | 문구 표시(Firebase 영어 그대로) | 하 |
| AdminPage.tsx:56-58, 77 | 가입 대기·버그 목록 조회 | 빈 목록 | 중 |
| AdminPage.tsx:93-98 | 버그 상태 토글 | 되돌아감, 메시지 없음 | 하 |
| AdminPage.tsx:115-117, 132-134 | 가입 승인·거절·탈퇴 | 스피너 멈춤, 줄 그대로. 메시지 없음 | 중 |
| BugReportButton.tsx:59-61, 71-72 | 버그 리포트 저장 | "전송됨" 화면 | 중 |
| useAuth.ts:103-105, 120-122 | 로그인 상태 복원 | 로그아웃된 것처럼 로그인 화면 | 중 |
| usePlanLimits.ts:127-133 | 사용량 조회 | 0건 사용으로 표시(서버가 별도 차단) | 하 |
| notify.ts:17, 34, 47, 86 | 관리자·승인·만료·버그 문자 알림 | 무언(의도된 fire-and-forget) | 하 |
| notify.ts:63-67 · notify/client.ts | 의뢰인 문자 발송 | 서버 한글 문구 표시(정상). 402·429도 한글 | 하 |
| SigningPage.tsx:44-47, 95-97 | 서명 페이지 계약서 조회 | 서버 오류·네트워크도 **"유효하지 않은 링크"** | 중 |
| SigningPage.tsx:237-248 | 서명 제출 | 한글 문구(정상) | 하 |
| PortalPage.tsx:54-61 | 의뢰인 포털 조회 | "일시적인 오류" (정상 구분) | 하 |
| PaymentSuccessPage.tsx:30-35 · confirm.ts:120-141 | 결제 승인(토스 거절) | "결제 승인 실패" — 이유 없음(detail은 버림) | 중 |
| confirm.ts:143-156, 157-165 | 토스 승인 뒤 플랜 기록 | "결제 승인 처리 오류" — **돈은 나갔고 플랜은 미적용** | 상 |
| PaymentModal.tsx:61-64, 97-100 | 결제위젯 로드·결제 요청 | 토스 SDK 문구 그대로 | 하 |
| claude.ts:394-403 · rate-limit.ts:70-73 | 프록시 429 | 서버가 준 한글 `message`를 버리고 "HTTP 429 Too Many Requests" 표시 | 중 |
| claude.ts:394-403 · _shared/auth.ts:192-205 | 프록시 401 | "Claude API 호출 실패: HTTP 401 토큰 만료됨" — 재로그인 안내 없음 | 중 |
| firestore.ts 전 catch(53~842) | 모든 Firestore CRUD | "X 실패: Missing or insufficient permissions." / "…client is offline." 로 재포장 | 중 |
| CalendarPage.tsx:59 · DocumentsPage.tsx:43 · ClientsPage.tsx:50 · ScheduleTab.tsx:164/202/215 · CaseHeader.tsx:96 · NewCaseModal.tsx:59 | 위 재포장 문구를 그대로 표시 | 지하철에서: "일정 조회 실패: Failed to get document because the client is offline." | 중 |
| consult.ts:79-81, 93-95 | 랜딩 상담 접수(KV 저장·문자) | 둘 중 하나만 성공해도 "접수됨" | 하 |
| plan.ts:97-104, 150-156 | 요금제·사용량 조회 실패 | 통과(의도됨) | 하 |
| pdf.ts:75-77, 88-90 | PDF 페이지별 OCR | 해당 페이지만 빠짐, 표시 없음 | 중 |
| pdf.ts:167-171, 208-211 · excel.ts:84-87 · pptx.ts:119-122 · ocr.ts:134-139 · hwpx.ts:196-200 | 파일별 추출 실패 | 실패 문구가 **AI 프롬프트 안**에만 들어감. 화면엔 없음 | 중 |
| file-save.ts:65-68 | OCR 텍스트 파일 저장 | 무언 | 하 |
| useDropZone.ts:144-148 | 폴더 드롭 | 일반 파일로 폴백(정상) | 하 |

행 수 95.

## 발견

### 1. 사건 상세 재무 탭의 저장·삭제 실패가 "성공"처럼 보인다 · 상
- **어디서**: 사건 상세 → 수임료·분할납부·사건비용·예수금 탭 전부.
- **무슨 일이**: 탭 컴포넌트는 `await onAdd(...)` 뒤 `setShowForm(false)`로 폼을 닫고, 실패하면 `alert`를 띄우도록 되어 있다. 그런데 부모(`CaseDetailPage`)의 핸들러가 `try { … } catch (err) { console.error(...) }`로 오류를 삼켜 **항상 정상 종료**한다. 결과: Firestore 저장이 실패해도 폼은 닫히고, 목록은 그대로이며, 어떤 메시지도 없다. 김 변호사는 "예수금 300만원 등록했다"고 믿고 넘어간다. 분할납부 "납부됨" 체크도 마찬가지 — 체크가 안 바뀌면 "내가 안 눌렀나?" 하고 다시 누른다.
- **근거**: `src/pages/CaseDetailPage.tsx:165-167, 199-201, 234-236, 249-251, 276-278, 291-293, 345-347, 354-356, 363-365, 386-388, 395-397, 404-406`. 탭 쪽의 죽은 catch: `src/components/accounting/DepositManagementTab.tsx:250-274`, `CaseExpenseTab.tsx:307-327`, `FeeManagementTab.tsx:401-403, 493-495, 711-713, 742-744, 761-763, 901-903`.
- **고칠 방향**: 부모 핸들러에서 `catch`를 지우고 오류를 그대로 던지거나(탭의 alert가 살아난다), 부모에서 `setToast("저장하지 못했습니다. 다시 시도해 주세요")`를 띄운 뒤 다시 던진다. 폼은 성공했을 때만 닫는다.

### 2. 녹음이 변환되지 않아도 분석은 그대로 진행되고, 두 번째 녹음은 통째로 버려진다 · 상
- **어디서**: 상담 접수 → AI 분석(`/record/agents`).
- **무슨 일이**: `transcribeAndWait`는 실패·시간초과·네트워크 오류를 모두 `null`로 돌려준다(`rtzr.ts:214-235`). `AgentsPage`는 진행 콜백을 넘기지 않아 "음성 변환 실패" 문구가 어디에도 안 뜨고, `transcript`가 `undefined`인 채로 6개 에이전트를 돌린다(`prompts.ts:228`은 대화록이 없으면 그 블록을 통째로 생략). 화면은 "음성 파일 변환 중…" → "에이전트 분석 시작…"으로 자연스럽게 넘어가고 결과가 나온다. 변호사는 **녹음이 반영된 분석**이라 믿는다. 게다가 `audioFiles[0]`만 변환하므로 상담 녹음을 2개 첨부하면 두 번째는 변환·분석 어디에도 안 들어간다. 사건 생성 시 녹음 레코드는 `sttStatus: "pending"`·대화록 없음으로 저장되어(`AgentsPage.tsx:281-289`) 사건 상세엔 영원히 "STT 대기" 배지가 남고, 나중에 "추가 상담"으로 들어오면 `sttStatus === "completed"` 필터(`RecordPage.tsx:220`) 때문에 이전 대화록은 다시 쓰이지 않는다.
- **근거**: `src/pages/AgentsPage.tsx:200-213, 281-289`, `src/services/rtzr.ts:214-235`, `src/services/prompts.ts:228-231`, `src/pages/RecordPage.tsx:218-222`, `src/components/cases/DocumentsTab.tsx:15-20`.
- **고칠 방향**: 변환 실패 시 분석을 멈추고 "녹음을 글로 옮기지 못했습니다. 다시 시도 / 녹음 없이 진행" 선택을 받는다. 오디오는 전부 변환하고, 변환된 대화록을 녹음 레코드에 `transcript`+`completed`로 저장한다.

### 3. AI가 만든 최종 문서가 저장되지 않아도 화면엔 문서가 떠 있다 · 상
- **어디서**: 문서 생성 페이지(`/record/document`).
- **무슨 일이**: 문서 생성이 끝나면 `updateDocument(...).catch(console.error)`로 자동 저장하는데, `setDocSaved(true)`를 **저장 시도 전에** 걸어 두어 실패해도 재시도가 없다. 화면엔 완성 문서가 그대로 보이니 저장된 줄 안다. 실제 Firestore 문서는 `status: "generating"`·`finalDocument` 빈 값으로 남아 사건 상세 개요 탭에 "진행중"으로만 보인다. "저장하기" 버튼도 실패하면 `console.error`만 하고 "저장됨" 표시도 오류도 없이 버튼만 원래대로 돌아온다.
- **근거**: `src/pages/DocumentPage.tsx:177-195, 296-336, 519-524`, `src/components/cases/OverviewTab.tsx:405`.
- **고칠 방향**: 자동 저장 실패 시 화면 상단에 "문서가 저장되지 않았습니다 — 다시 저장" 배너를 붙이고 `docSaved`는 성공 후에만 세운다. "저장하기" 실패는 버튼 옆에 빨간 문구.

### 4. 토스 결제는 승인됐는데 플랜이 안 붙을 수 있고, 화면은 "처리 오류"라고만 한다 · 상
- **어디서**: 결제 완료 페이지(`/payment/success`) → 서버 `payment/confirm`.
- **무슨 일이**: 서버는 토스 승인(돈 빠짐)에 성공한 **뒤** Firestore에 플랜·결제기록을 쓴다. 이 두 번째 단계가 실패하면 하나의 `catch`로 떨어져 500 "결제 승인 처리 오류"를 돌려준다. 이미 돈은 나갔고 플랜은 free 그대로다. 화면은 "결제 승인에 실패했습니다 / 결제 승인 처리 오류"와 "설정으로 돌아가기"뿐이다. 변호사는 결제가 안 된 줄 알고 다시 결제한다(orderId에 타임스탬프가 붙어 매번 새 주문이므로 **이중 결제**). 새로고침하면 토스가 "이미 처리된 결제"를 돌려주고 화면은 여전히 "결제 승인 실패"다(이유 `detail`은 화면이 버린다).
- **근거**: `functions/api/payment/confirm.ts:120-141(토스 승인), 143-156(Firestore 기록), 157-165(공통 catch)`, `src/services/payment.ts:15-17, 45-47`, `src/pages/PaymentSuccessPage.tsx:30-35`.
- **고칠 방향**: 토스 승인 성공 후의 Firestore 실패는 별도로 잡아 "결제는 완료되었으나 적용이 지연되고 있습니다. 다시 결제하지 마세요. 1660-4452로 연락 주세요"로 구분해 보여주고, 서버는 결제기록을 먼저 남긴다. 승인 실패 이유(`detail.message`)도 화면에 한 줄.

### 5. 첨부 파일 업로드가 실패해도 사건은 "생성됨", 문서는 "저장됨"으로 끝난다 · 상
- **어디서**: AI 분석 완료 후 자동 사건 생성, 체크포인트, 자유 지시 저장, 상담 접수 첨부 단계.
- **무슨 일이**: 사건이 만들어진 뒤 녹음·PDF를 하나씩 올리는데 각 업로드가 `catch { console.error }`로 삼켜진다. 사건은 정상 생성, 타임라인엔 "상담 접수"까지 찍히지만 첨부는 0개. 변호사는 사건 상세에 들어가 "파일이 어디 갔지" 하거나, 못 알아채고 원본 녹음을 지운다. 체크포인트(`CheckpointPage`)와 자유 지시(`FreeformPage`)도 같다. 첨부 단계에서 "다음"을 눌렀을 때의 실패(`RecordPage:254`)는 스피너만 멈추고 화면이 그대로라 "버튼이 안 먹네" 하고 계속 누른다.
- **근거**: `src/pages/AgentsPage.tsx:275-293`, `src/pages/CheckpointPage.tsx:315-331, 373-389`, `src/pages/FreeformPage.tsx:216-237`, `src/pages/RecordPage.tsx:254-255`.
- **고칠 방향**: 업로드 실패 파일명을 모아 사건 생성 완료 화면에 "다음 파일은 올라가지 않았습니다 — 다시 올리기"로 표시. RecordPage의 "다음" 실패는 오류 문구 + 재시도 버튼.

### 6. 낙관적 갱신이 조용히 되돌아간다 (상태 변경·메모·계약현황·부가비용) · 중
- **어디서**: 사건 상세 헤더의 상태 변경, 타임라인 메모, 계약·수임료 현황, 부가비용, 사건 목록의 계약현황, 관리자 버그 상태.
- **무슨 일이**: 화면을 먼저 바꾸고 Firestore 저장이 실패하면 `catch {}`에서 원래 값으로 되돌린다. 메시지가 없어서 변호사는 "방금 '종결'로 바꿨는데 왜 다시 '진행중'이지?"를 눈치채지 못하거나 화면 버그로 여긴다. 메모는 폼이 닫히면서 방금 쓴 내용이 사라진다(`UnifiedTimelineTab:156-166`는 성공 여부와 무관하게 입력을 비운다). 계약서 서명 요청을 만든 직후의 "계약 체결" 현황 갱신도 이 경로라(`CaseDetailPage:461`) 계약서는 나갔는데 현황은 미체결로 남을 수 있다. `CasesPage:133-138`는 실패 시 목록을 다시 불러오는데 그 재조회가 실패하면 처리되지 않은 오류가 된다.
- **근거**: `src/hooks/useCaseDetail.ts:171-173, 222-229, 672-674, 693-695, 713-715, 733-735`, `src/components/cases/UnifiedTimelineTab.tsx:156-166`, `src/pages/CaseDetailPage.tsx:461`, `src/pages/CasesPage.tsx:125-140`, `src/pages/AdminPage.tsx:86-99`.
- **고칠 방향**: 되돌릴 때 토스트 한 줄("저장하지 못해 이전 값으로 되돌렸습니다"). 메모는 실패 시 입력을 지우지 않는다.

### 7. 삭제가 화면에서만 사라진다 — 새로고침하면 부활 · 중
- **어디서**: 상대방 서면 삭제, 사건기록 삭제, 의뢰인 케어 메시지 삭제, 재무 페이지 거래·비용 삭제, 관리자 승인·탈퇴.
- **무슨 일이**: `removeOpponentDoc`·`removeCaseRecord`는 화면 목록에서 먼저 지우고 Firestore 삭제를 던진다. 실패하면 오류가 위로 올라가는데 호출부(`OpponentDocs:88-95`, `CaseRecordsTab:146-152`)가 `try/finally`뿐이라 **처리되지 않은 오류**가 되고 화면엔 아무것도 없다. 항목은 사라져 보이지만 실제로는 남아 있다. 케어 메시지는 반대로 화면에 남는데 메시지가 없다. 재무 페이지 삭제(`FinancePage:187-193`)와 관리자 승인·탈퇴(`AdminPage:115-135`)는 `console.error`만 한다 — 대표가 "승인" 눌렀는데 줄이 그대로면 두 번 세 번 누른다.
- **근거**: `src/hooks/useCaseDetail.ts:277-283, 370-378`, `src/components/cases/OpponentDocs.tsx:88-95`, `src/components/cases/CaseRecordsTab.tsx:146-152`, `src/components/cases/ClientCareTab.tsx:195-201`, `src/hooks/useClientCare.ts:196-205`, `src/pages/FinancePage.tsx:187-193`, `src/pages/AdminPage.tsx:100-137`.
- **고칠 방향**: 삭제는 성공 후 화면에서 제거하거나, 실패 시 되살리며 "삭제하지 못했습니다" 문구. 호출부에 `catch` + 오류 표시.

### 8. 상대방 서면·사건기록 업로드 실패가 "처리되지 않은 오류"로 끝난다 · 중
- **어디서**: 타임라인 탭 상대방 서면 등록, 사건기록 탭 업로드.
- **무슨 일이**: `uploadOpponentDoc`·`uploadCaseRecord`는 Storage 업로드 → Firestore 기록 → 타임라인 순으로 던지기만 한다. 호출부는 `try { await onUpload(); resetForm(); } finally { setUploading(false) }` — `catch`가 없어 오류가 콘솔로만 가고, 폼은 열린 채 스피너만 멈춘다. 변호사는 "올라갔나?"를 알 길이 없어 다시 올린다(Storage에 같은 파일 2개). 타임라인 기록만 실패한 경우엔 파일은 올라갔는데 폼이 안 닫혀 또 올린다.
- **근거**: `src/hooks/useCaseDetail.ts:236-271, 325-368`, `src/components/cases/UnifiedTimelineTab.tsx:169-179`, `src/components/cases/CaseRecordsTab.tsx:135-143`.
- **고칠 방향**: 호출부에 `catch`로 "업로드하지 못했습니다: 파일이 너무 크거나 연결이 끊겼습니다" 표시. 타임라인 기록 실패는 업로드 성공과 분리.

### 9. Word·HWPX 내보내기 실패가 무언이다 · 중
- **어디서**: 사건 개요 탭 문서 카드, 문서 생성 페이지, 계약서 다운로드 버튼(사건 상세·계약 섹션).
- **무슨 일이**: 내보내기 실패는 전부 `console.error`만. 스피너가 멈추고 파일이 안 내려오면 변호사는 브라우저 다운로드 차단인지, 다시 눌러야 하는지 모른다.
- **근거**: `src/components/cases/OverviewTab.tsx:487-495, 506-514`, `src/pages/DocumentPage.tsx:448-458, 470-480`, `src/pages/CaseDetailPage.tsx:718-725`, `src/components/cases/ContractPaymentSection.tsx:342-350`.
- **고칠 방향**: 실패 시 버튼 아래 "파일을 만들지 못했습니다. 복사하기로 대신하거나 다시 시도해 주세요".

### 10. 의뢰인 포털 켜기/끄기가 실패하면 스위치가 안 움직이고 끝 · 중
- **어디서**: 의뢰인 케어 탭 → 진행상황 페이지 켜기.
- **무슨 일이**: `updateCase` 실패 시 `catch { /* 실패 시 상태 유지 */ }`. 스위치는 안 바뀌고 메시지는 없다. 변호사는 여러 번 누르다가 포기하거나, 켜진 줄 알고 링크를 문자로 보낸다(포털은 404).
- **근거**: `src/components/cases/ClientCareTab.tsx:108-129`.
- **고칠 방향**: `setSmsError("포털 설정을 저장하지 못했습니다")` 재사용.

### 11. 서명 페이지는 서버 장애·네트워크 끊김도 "유효하지 않은 링크"라고 한다 · 중
- **어디서**: 의뢰인이 문자로 받은 서명 링크 페이지.
- **무슨 일이**: `fetchSigningRequest`는 서버가 `state:"error"`(500)를 보내도 화면이 아는 상태가 아니면 `not-found`로 접고, `fetch` 자체가 실패해도 `not-found`다. 의뢰인은 "변호사가 잘못된 링크를 보냈다"고 이해하고 사무소에 전화한다. 변호사는 링크를 다시 만들고 다시 보낸다(이전 요청은 그대로 pending으로 남음).
- **근거**: `src/pages/SigningPage.tsx:44-47, 86-97, 300-310`, `functions/api/signing/[token].ts:118-126`.
- **고칠 방향**: `PortalPage`처럼 `error` 상태를 따로 두고 "일시적인 오류입니다. 잠시 후 다시 열어 주세요"로 구분.

### 12. 프록시 429·401의 한글 안내가 버려지고 영어 상태 문구만 뜬다 · 중
- **어디서**: AI 분석·문서 생성·채팅 등 Claude 호출 전부.
- **무슨 일이**: 속도제한 응답은 `{error:"Too Many Requests", message:"요청 한도 초과: 60회/분. N초 후 다시 시도하세요."}`인데 화면은 `detail ?? error`만 읽어 "Claude API 호출 실패: HTTP 429 Too Many Requests"를 보여준다. 몇 초 뒤 되는지 알려주는 한글 `message`는 버려진다. 401은 "인증 실패"+`detail:"토큰 만료됨"` → "Claude API 호출 실패: HTTP 401 토큰 만료됨" — 다시 로그인하라는 안내가 없다. 에이전트 탭엔 "오류: …" 그대로 찍힌다.
- **근거**: `src/services/claude.ts:394-403, 567-573`, `functions/api/_shared/rate-limit.ts:66-88`, `functions/api/_shared/auth.ts:186-205`, `src/pages/AgentsPage.tsx:445-448`.
- **고칠 방향**: `errorBody.message ?? errorBody.detail ?? errorBody.error` 순으로 읽고, 401은 "로그인이 풀렸습니다. 다시 로그인해 주세요", 429는 서버 `Retry-After`를 문장에 넣는다.

### 13. 지하철에서 끊기면 "Failed to get document because the client is offline." 이 그대로 뜬다 · 중
- **어디서**: 일정, 문서함, 의뢰인 목록, 기한 탭, 사건 정보 수정, 새 사건 등록.
- **무슨 일이**: `firestore.ts`의 모든 catch는 `"X 실패: " + error.message`로 재포장한다. Firebase 오류 문구는 영어(`Missing or insufficient permissions.`, `Failed to get document because the client is offline.`)라 화면엔 "일정 조회 실패: Failed to get document because the client is offline."가 뜬다. 기보고된 "영어 노출" 계열이지만 **네트워크 끊김**이라는 가장 흔한 상황에서 전부 이 경로를 탄다. 게다가 재시도 버튼이 있는 곳이 없다.
- **근거**: `src/services/firebase/firestore.ts:53-56, 80-84(이하 동일 패턴 35곳)`, 표시부 `src/pages/CalendarPage.tsx:59`, `DocumentsPage.tsx:43`, `ClientsPage.tsx:50`, `src/components/cases/ScheduleTab.tsx:164, 202, 215`, `CaseHeader.tsx:96`, `NewCaseModal.tsx:59`.
- **고칠 방향**: `firestore.ts`에서 `code`(`unavailable`/`permission-denied`/`deadline-exceeded`)를 보고 한글 문장으로 바꾼다("인터넷 연결이 끊겼습니다. 연결 후 다시 시도해 주세요"). 조회 화면엔 "다시 불러오기" 버튼.

### 14. "수임료 관리 시작"은 두 번 누르면 수임료 문서가 두 개 생긴다 · 중
- **어디서**: 사건 상세 → 수임료 탭 첫 화면.
- **무슨 일이**: 버튼에 `disabled`가 없고 `onCreateFee`를 `await`하지 않는다. 느린 연결에서 두 번 누르면 `createFee`가 두 번 실행되어 Fee 문서 2개. 화면은 `fees[0]`만 쓰므로 하나는 보이지 않는 채 남고, 재무 페이지 집계(`getFeesByCase`·매출 자동 등록)에 섞일 수 있다. 성공보수 항목의 `onUpdate(...)`들도 잠금 없이 연타 가능하다.
- **근거**: `src/components/accounting/FeeManagementTab.tsx:194-200, 1017-1067, 1283, 1303, 1345`, `src/pages/CaseDetailPage.tsx:160-168`.
- **고칠 방향**: `busy` 상태로 버튼 잠금, 부모는 Fee가 이미 있으면 생성하지 않는다.

### 15. "추가 자료 저장"이 중간에 실패하면 절반만 저장된 채 재시도가 중복을 만든다 · 중
- **어디서**: 기존 사건에서 들어온 상담 접수 → "음성 변환 후 저장".
- **무슨 일이**: 파일을 하나씩 업로드·기록하다가 3번째에서 실패하면 "저장 중 오류가 발생했습니다"가 뜬다. 앞의 2개는 이미 사건에 붙어 있는데 화면엔 그 사실이 없어 변호사는 같은 파일을 다시 전부 올린다 → 중복 첨부·STT 비용 2배.
- **근거**: `src/pages/RecordPage.tsx:262-362`.
- **고칠 방향**: 실패 시 "N개 중 M개는 저장됐습니다. 남은 파일: …"로 부분 성공을 알리고 남은 것만 재시도.

### 16. 케어 메시지는 저장됐는데 "생성 실패"로 보여 다시 만들게 된다 · 중
- **어디서**: 의뢰인 케어 탭 메시지 생성.
- **무슨 일이**: Claude 호출 → Firestore 저장 → 화면 반영 → 타임라인 기록 순인데, 마지막 타임라인 기록이 실패하면 `throw`로 올라가 탭이 `errorStage`를 세운다. 메시지는 이미 목록에 있고 저장도 됐지만 "실패" 표시를 보고 다시 누른다 → 같은 메시지가 2개, Claude 비용 2배.
- **근거**: `src/hooks/useClientCare.ts:162-192`, `src/components/cases/ClientCareTab.tsx:178-185`.
- **고칠 방향**: 타임라인 기록 실패는 삼키고(로그만), 메시지 저장 실패만 실패로 취급.

### 17. 특약사항 AI 변환이 실패하면 원문이 그대로 계약서에 들어간다 · 중
- **어디서**: 수임계약서 생성 모달.
- **무슨 일이**: 변호사가 구어체로 적은 특약을 법률 문체로 바꾸는 호출이 실패하면 `fees.specialTerms = specialTerms.trim()`으로 원문을 그대로 넣는다. 화면은 계약서를 정상 생성해 의뢰인에게 서명 링크까지 보낸다. 변호사는 변환된 줄 알고 확인 없이 발송할 수 있다.
- **근거**: `src/components/cases/ContractGenerateModal.tsx:108-134`.
- **고칠 방향**: 변환 실패 시 미리보기에 "특약은 입력하신 문장 그대로 들어갔습니다" 안내를 붙이고 발송 전 확인.

### 18. 버그 리포트 저장이 실패해도 "전송됨"이 뜬다 · 중
- **어디서**: 우하단 버그 리포트 버튼.
- **무슨 일이**: Firestore 저장 실패를 `catch {}`로 넘기고 클립보드 복사 후 `setSent(true)`. 관리자 문자 알림도 저장 성공 안에서만 호출된다. 변호사는 "보냈다"고 믿고 카카오톡 창을 닫으면 어디에도 기록이 없다.
- **근거**: `src/components/ui/BugReportButton.tsx:30-73`.
- **고칠 방향**: 저장 실패 시 "저장은 안 됐습니다. 아래 카카오톡으로 꼭 보내 주세요"를 붉게 표시.

### 19. 사건 상세 하위 목록·재무·통계 조회 실패가 "없음"으로 보인다 (기보고 계열의 다른 사례) · 중
- **어디서**: 사건 상세(문서·녹음·상대방 서면·사건기록 4종), 사건 상세 재무 4종, 재무 페이지 전체, 대시보드 매출·비용 통계, 관리자 가입 대기 목록, 결제 내역.
- **무슨 일이**: 조회 실패를 빈 배열·0원으로 바꿔치기한다. 재무 페이지가 전부 0원이면 "이번 달 매출이 0원"으로 읽히고, 관리자 페이지가 비면 "승인할 사람이 없다"로 읽힌다.
- **근거**: `src/hooks/useCaseDetail.ts:112-125`, `src/pages/CaseDetailPage.tsx:127-149`, `src/pages/FinancePage.tsx:157-162`, `src/components/dashboard/DashboardStats.tsx:44-57`, `src/pages/AdminPage.tsx:52-61, 66-84`, `src/pages/SettingsPage.tsx:75-84, 437`, `src/hooks/useClientCare.ts:96-105`.
- **고칠 방향**: 빈 목록과 조회 실패를 구분하는 `error` 상태 + "다시 불러오기".

### 20. 첨부 파일 추출 실패 문구가 화면이 아니라 AI 프롬프트 안에만 들어간다 · 중
- **어디서**: AI 분석·체크포인트·자유 지시의 PDF·이미지·Excel·PPT·HWP 추출.
- **무슨 일이**: 파일별 추출 실패는 `(텍스트 추출 실패: …)` 문자열을 결과 텍스트에 끼워 넣는다. 이 텍스트는 Claude에게만 가고 변호사 화면엔 "PDF 3개 추출 중…"이 끝나고 분석이 시작될 뿐이다. 스캔 PDF의 OCR이 페이지 단위로 실패해도 그 페이지만 조용히 빠진다. 분석 결과에 "증거 서류가 없다"는 식의 판단이 섞여 나와도 이유를 알 수 없다.
- **근거**: `src/services/pdf.ts:75-77, 88-90, 167-171, 208-211`, `excel.ts:84-87`, `pptx.ts:119-122`, `ocr.ts:134-139`, `hwpx.ts:196-200`, `src/pages/AgentsPage.tsx:129-170`, `CheckpointPage.tsx:340-353`, `FreeformPage.tsx:109-168`.
- **고칠 방향**: 추출 결과에 파일별 성공/실패를 돌려주고 분석 시작 전 "다음 파일은 읽지 못했습니다" 목록을 보여준다.

### 21. 체크포인트 질문별 녹음 버튼이 마이크 거부 시 아무 반응이 없다 · 하
- **어디서**: 체크포인트 페이지의 답변 녹음.
- **무슨 일이**: `getUserMedia` 실패를 `catch { // 마이크 접근 실패 }`로 삼킨다. 버튼을 눌러도 녹음 표시가 안 뜨니 고장난 줄 안다. 상담 접수 화면(`RecordPage:191-193`)은 같은 상황에 문구를 띄우므로 페이지마다 다르다.
- **근거**: `src/pages/CheckpointPage.tsx:210-264`.
- **고칠 방향**: RecordPage처럼 오류 문구("마이크 권한을 허용해 주세요").

### 22. 녹음 임시저장이 실패하면 사고 복구 배너가 안 뜬다 · 중
- **어디서**: 상담 녹음 중 5초마다 IndexedDB에 조각 저장.
- **무슨 일이**: 저장 실패는 `console.warn`뿐. 녹음 화면은 정상적으로 시간이 흐르므로 변호사는 보호받고 있다고 믿는다. 브라우저가 죽으면 복구할 조각이 없다(사파리 비공개 모드·저장공간 부족에서 실제로 난다).
- **근거**: `src/services/recordingStore.ts:70-90, 110-128`.
- **고칠 방향**: 첫 조각 저장 실패 시 녹음 화면에 "임시저장이 안 되고 있습니다. 녹음이 끊기면 복구되지 않습니다" 경고.

## 확신이 낮은 항목

- **결제 완료 페이지의 로그인 복원 타이밍**: `PaymentSuccessPage`는 `useAuth`를 쓰지 않지만 `App.tsx:267`에서 `RequireAuth`(initialized 대기)로 감싸져 있어 토큰 없는 401은 나지 않는 것으로 판단했다. 문제 없음으로 봤으나 실제 리다이렉트 직후 동작은 실행해 봐야 확정된다.
- **삭제의 "처리되지 않은 오류"(발견 7·8)**: 전역 `unhandledrejection` 핸들러가 있는지 `main.tsx`·Sentry 설정을 읽지 않았다. 있더라도 사용자 화면 문구는 없을 가능성이 높다.
- **Firestore 오류 문구의 실제 영어 원문**(발견 13): `Missing or insufficient permissions.`·`Failed to get document because the client is offline.`는 Firebase SDK 통상 문구를 근거로 적었다. 코드에서 재포장 방식(`X 실패: ${error.message}`)은 확인했다.
- **발견 14의 집계 영향**: Fee 문서가 2개일 때 재무 페이지·매출 자동 등록이 실제로 어긋나는지는 `accounting.ts`의 집계 쿼리를 끝까지 읽지 않아 "섞일 수 있다"로만 적었다.
- **발견 4의 이중 결제**: 토스 위젯이 같은 사용자의 미승인 결제를 얼마나 오래 보류하는지는 코드 밖의 일이라, "다시 결제하면 새 주문번호로 두 번 승인될 수 있다"는 코드 구조(`createOrderId`에 `Date.now()`)만을 근거로 했다.
- **consult.ts(랜딩 상담 접수)**: KV 저장 실패+문자 성공이면 접수 화면은 "접수됨"이지만 운영자 목록엔 없다. 손님이 아니라 운영자 쪽 유실이라 표에만 두고 발견에서 뺐다.
