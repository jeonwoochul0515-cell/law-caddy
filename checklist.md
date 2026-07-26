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

## 다음 단계 (미착수 — 3단계 실측 데이터 확보 후)

- [ ] **4단계. 스트리밍 도입** — `MAX_TOKENS 16384`가 생각+본문을 함께 덮고 있어 문서 잘림 발생 중.
      통합 분석(B)은 이 한도를 넘으므로 스트리밍이 전제 조건.
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
