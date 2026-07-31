# 에이전트 구조 단순화 — 체크리스트

> 배경·근거는 `context-notes.md` 참고. 전체 목표는 6개 병렬 에이전트 → 통합 분석 구조 전환.

## 1단계. 최감수(review) 실행 제거 ✅

- [x] `config/constants.ts` — `AGENTS`에서 `review` 항목 삭제
- [x] `hooks/useAgents.ts` — `AGENT_IDS`를 `AGENTS`에서 파생 (단일 진실원본화)
- [x] `hooks/useAgents.ts` — RAG 대상 목록에서 `review` 제거
- [x] `services/rag.ts` — `AGENT_SEARCH_CONFIG.review` 삭제 (내 변경으로 죽은 코드)
- [x] `pages/DocumentPage.tsx` — `reviewResult` 전달 제거
- [x] 테스트 수정 (`__tests__/config/constants.test.ts` 6 → 4)

## 2단계. 오사서(rag_precedent) 흡수 ✅

- [x] `config/constants.ts` — `AGENTS`에서 `rag_precedent` 항목 삭제
- [x] `hooks/useAgents.ts` — RAG 대상 목록에서 `rag_precedent` 제거하고 **`precedent` 추가**
      (한판서가 법제처 API + RAG 양쪽을 모두 받도록)
- [x] `services/rag.ts` — `AGENT_SEARCH_CONFIG.rag_precedent` 삭제
- [x] `pages/AgentsPage.tsx` — 탭 그리드 `lg:grid-cols-6` → `lg:grid-cols-4`
- [x] `agentResults.rag_precedent` 슬롯은 **유지** (체크포인트 첨부파일 운반 통로로 쓰이는 중)

## 3단계. 토큰 사용량 계측 ✅

- [x] `services/claude.ts` — `usage`에 캐시 필드 2개 추가
      (`cache_creation_input_tokens` / `cache_read_input_tokens`)
- [x] `services/claude.ts` — `logUsage()` 추가, 4개 호출 경로 전부에 연결
- [x] 세션 누적치를 `window.__lawCaddyUsage`로 노출 (콘솔에서 즉시 확인)
- [x] `functions/api/claude.ts` — 프록시가 `usage`를 그대로 통과시키는지 확인

## 검증 ✅

- [x] `npx tsc --noEmit` 통과
- [x] `npm test` 통과
- [x] `npm run build` 통과

---

## 4단계. 스트리밍 도입 ✅

- [x] `functions/api/claude.ts` — `stream` 플래그 수신 시 SSE 본문 통과
- [x] `readClaudeStream()` — 텍스트 누적 + 사용량·중단사유 추출
- [x] 4개 호출 경로 전부 스트리밍 전환 (`Promise<string>` 인터페이스 유지 → 호출부 변경 없음)
- [x] `MAX_TOKENS` 16,384 → 32,000
- [x] SSE 파서 테스트 11개 (청크 경계 분할·깨진 JSON 포함)

## 보안·결제 (2026-07-26 오후) ✅

- [x] `plan`/`planExpiresAt` 자가수정 차단 (`get(key, default)`로 기존 문서 호환)
- [x] 서버 요금제 검사 `_shared/plan.ts` → `/api/claude`, `/api/transcribe`
- [x] `monthly_summary` 규칙 추가 → 세무 모듈 복구
- [x] `signing_requests`의 `allow read, update: if true` 제거 → 서버 토큰 검증으로 전환
- [x] `callClaudeDirect` 재시도 + 오류 메시지에 HTTP 상태 보존
- [x] 서비스 계정 키를 평문 환경변수 → Secret으로 승격 (프로덕션). 결제는 원래 정상이었음
- [x] 프로덕션 배포 + Firestore 규칙 배포 + 검증
- [x] 배포 헬스체크가 실제 배포 대상을 보도록 수정 + 서비스 계정 검사 추가

## 확인 필요 (대표님)

- [ ] Cloudflare 대시보드 → 같은 이름의 **평문 환경변수**(`FIREBASE_CLIENT_EMAIL`,
      `FIREBASE_PRIVATE_KEY`)가 아직 남아 있는지. Secret과 중복이면 평문 쪽 삭제
- [ ] 프로덕션에서 문서 생성 1건 → 잘림 경고가 사라졌는지 확인
- [ ] 콘솔 `window.__lawCaddyUsage` → `cacheRead`가 계속 0이면 캐시 미작동 확정
- [ ] 세무 탭 월별 요약이 되는지 확인

## 9단계. 캐시 재설계 + 예열 ✅ (2026-07-27)

- [x] `buildContextBlock`을 공통부/검색부로 분리 — 대화록·첨부가 캐시 프리픽스로 이동
- [x] 팬아웃 직전 예열 호출 (프리픽스 비용 5×1.25배 → 1.25+4×0.1배)
- [x] 프리픽스 바이트 동일성 불변식 테스트 5개

## 랜딩 전면 재설계 ✅ (2026-07-27)

- [x] "페이지 전체가 한 부의 소장" 컨셉 — 히어로에 법원 서식 소장 실물, 섹션마다 갑 제N호증 스탬프
- [x] 앱과 색 통일(잉크 네이비+금), 노토 세리프 KR + 프리텐다드 자체 번들, keep-all 조판
- [x] 가짜 후기·가짜 이용사무소·검증불가 수치 삭제 (변협 광고규정 오인유발 소지)
- [x] 6명→4명 카피 일괄 정리 (landingContent·SEO 페이지·구조화 데이터·PLANS·useClientCare)
- [x] 프로덕션 배포·실물 확인 완료

## 🔶 대표님 검토 요청

- [ ] 랜딩 "만든 사람" 문구 — "사무실을 운영하는 변호사가 직접 만들었고 지금도 매일 씁니다"
      실명 없이 넣어뒀습니다. 표현 수위를 확인해 주세요 (실명·사무소명 노출은 별도 결정)
- [ ] 히어로 소장 예시의 사건 내용(임대차보증금 5,500만 원)이 적절한지

## 다음 단계 (미착수)
- [ ] **5단계. 통합 분석 1회로 전환** — 쟁점+판례+관할+전략+사건유형을 한 번의 호출로.
      `buildAgentResultsBlock()` 수동 접착 코드 제거.
- [ ] **6단계. 모델 분리** — 분석·문서는 Opus 5, 체크포인트 질문은 Sonnet 5, 의뢰인 메시지는 Haiku 4.5
- [ ] **7단계. `effort` 지정** — 현재 전 호출이 기본값 `high`로 동작 중 (미지정)
- [ ] **8단계. `stop_reason: "refusal"` 처리** — Opus 5 전환 전 필수
- [ ] **9단계. 캐시 블록 재설계 + 팬아웃 직전 예열** (`max_tokens: 0`)

## 별도 판단 필요 (대표님)

- [ ] `data/landingContent.tsx` + `pages/seo/AiAgentsPage.tsx` — 여전히 "6명 에이전트"로 홍보 중.
      런타임과 분리된 파일이라 코드는 안 깨지지만 문구 정합성은 별도 결정 필요.
- [ ] `config/constants.ts`의 `PLANS` — Pro 요금제 설명에 "6개 에이전트" 문구 존재.

## 2026-07-27 마무리 세션
- [x] 브라우저 먹통 원인 확정·해결 (좀비 SW가 구 precache HTML 서빙 → SW/캐시 해제 + 쿼리 리로드)
- [x] 빌드 산출물 파일명 `assets/app-[hash]`로 변경 (재발 방어, SSR 빌드 제외)
- [x] 캐시 재설계 최종 실측 — 팬아웃 4/4 캐시읽기, 재쓰기 0 (2회 재현)
- [x] AgentsPage `completedCount === 6` 하드코딩 버그 수정 (완료 판정·진행률 → AGENTS.length)
- [x] 완료 판정 → 사건 자동 생성 → 문서 유형 선택 개방까지 운영 실측 검증
- [x] 테스트 사건 정리 — 잔여 0건 (캐시검증테스트*는 버그로 미생성이었음, 완료판정테스트는 UI로 삭제)

## 2026-07-30 티어 0 (로드맵: docs/roadmap-office-saas-2026-07.md)
- [x] Team 플랜 판매 중단(준비중) — 화면 3곳 표기 + 결제 서버 승인 거부 + JSON-LD 제외 (결제자 0명 확인 후)
- [x] "6개 에이전트" 잔재 문구 일소 (PlanSelector 3개/6개 → 4개 전체, SEO·주석)
- [x] FinancePage 허위 경비 등록 안내 제거
- [x] (발견·수리) PWA autoUpdate 미작동 — 새 SW가 waiting에 갇혀 배포가 사용자에게 전달 안 되던 문제, workbox skipWaiting/clientsClaim으로 해결

## 2026-07-30 티어 1 완료 (전 항목)
- [x] 사무소 경비 입력 UI — OfficeExpenseModal (등록·수정·2단계 삭제, 카테고리별 고정/변동비 자동 제안). 운영에서 CRUD 실측 검증
- [x] 매입 거래 입력 UI — PurchaseTransactionModal (부가세 10% 자동 계산, 공제 불가 증빙이면 0 처리)
- [x] 기한 수정 — ScheduleTab 폼을 등록/수정 겸용으로, updateDeadline 서비스 추가
- [x] 서명 링크 문자 발송 — CaseDetailPage 계약 결과 화면에 번호 입력+발송, 번호는 사건(clientPhone)에 저장
- [x] 케어 메시지 문자 발송 — ClientCareTab 메시지별 발송 버튼
- [x] 서버 POST /api/notify/client — 인증+유료 플랜 필수, 번호·길이 검증, uid당 시간당 30건 제한 (미인증 401 실측)
- [x] Case 타입에 clientPhone 필드 추가 (티어 2 의뢰인 CRM의 씨앗)

## 2026-07-30 티어 2 완료 (기일 동기화 재검토 제외 — 대표 결정 대기)
- [x] Case 스키마에 사건번호·관할법원·재판부·상대방·심급 추가 + 헤더 표시 + 수정 모달
- [x] 수동 사건 등록 폼 (사건 관리 > 새 사건 등록) — 이관 고객용. 운영 실측(등록→표시→삭제) 통과
- [x] 통합 캘린더 /calendar — 전 사건 기한 월간 그리드 + 월 목록 + 지연 배너, 사이드바 추가
- [x] 문서고 /documents — 전 사건 문서 35건 검색·유형 필터, 운영 확인
- [x] 의뢰인 /clients — cases 집계형 CRM 라이트 (37명·복수 사건 묶임 확인), 별도 컬렉션은 추후 승격
- [x] 판례 API 조사 완료 — 결론: 한국에 구매 가능한 판례 API 없음 (엘박스·빅케이스 모두 비판매). AI허브 원문 25만 건 무료 흡수가 유일한 대량 보강 경로

## 2026-07-30 티어 3 완료 (알림톡·온보딩 제외)
- [x] 성공보수 청구 — 결과 금액 → 약정별 자동 산정(정률·정액·구간 누진) → 부가세 → 청구서 생성 → 문자 발송 → 청구완료 전환. 운영 실측(5,000,000 → VAT 500,000 → 합계 5,500,000, 상태 전환) 통과
- [x] 의뢰인 포털 — 사건별 토큰 링크(/portal/:token), 서버 공개 API(/api/portal), 케어 탭에서 발급·복사·문자 발송·비활성화. 운영 실측 통과 (사건정보·일정·진행내역 노출, 잘못된 토큰 404)
- [x] 데이터 백업 — 설정 > 시스템에서 ZIP 내려받기 (12개 컬렉션 JSON + 문서 txt). 운영 실측 356건
- [x] 대시보드 통계 — 6개월 매출·경비 막대, 사건 유형 분포, 상담→사건 전환율(실측 38%)
- [x] 알림톡 — 도입하지 않기로 결정 (2026-07-30 대표 지시). 문자로 일원화
- [x] 온보딩 투어 — 완료 (대시보드 시작 가이드)

## 2026-07-30 알림톡 재추진 (당일 번복)
- [x] 카카오 비즈니스 채널 개설 가이드 — 채널명 Law-Caddy, 사업자 소명 문구, 변호사 자격 증빙 안내
- [x] 채널 로고 준비 (icon-512 → 640×640, 바탕화면)
- [x] 알림톡 템플릿 초안 4종 작성 (docs/alimtalk-templates.md)
- [ ] 카카오 비즈니스 채널 심사 결과 대기 (1~3영업일) ← 지금 여기
- [ ] Solapi 발신프로필 연동 → 템플릿 등록·심사 → 발송 코드 전환(문자 대체발송 포함)
