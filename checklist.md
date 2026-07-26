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
