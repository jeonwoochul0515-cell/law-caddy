# 컨텍스트 노트 — 에이전트 구조 단순화

작성 2026-07-26. 결정 사항과 그 이유를 남긴다. 다음 세션이 근거를 다시 캐지 않도록.

---

## 왜 손대는가 — 확인된 사실 3가지

### 1. 최감수(review)는 존재하지 않는 문서를 검토하고 있었다

`useAgents.ts`의 `AGENT_IDS` 6개가 `Promise.allSettled`로 **동시에** 출발한다.
이 시점에서 `docgen`은 문서가 아니라 **체크포인트 질문**을 만든다(`useAgents.ts:389`,
`promptId = agentId === "docgen" ? "docgen_questions" : agentId`).
실제 문서는 변호사가 체크포인트에 답한 **뒤에** `useDocument.ts:196`에서 생성된다.

그런데 `buildReviewPrompt()`(`prompts.ts:2124`)는 이렇게 묻는다.

- "이 서면을 처음 받았을 때 판사가 느낄 인상"
- "인용된 법조문이 존재하며 정확한가"
- "빈칸(○○)이 최소화되어 있는가"

받는 컨텍스트에도 문서가 없다(`buildContextBlock(ctx)`만 전달). **아직 쓰이지 않은 문서를
100점 만점으로 채점하고 있었다.** 그 결과가 `DocumentPage.tsx:158`에서 `reviewResult`로
문서 생성 프롬프트에 다시 주입되고 있었다 — 즉 허수 평가가 문서 품질에 노이즈로 작용.

추가로 `Promise.allSettled`는 전원이 끝나야 다음으로 넘어가므로, **변호사가 다음에 할 일
(체크포인트 답변)이 이 무의미한 채점 뒤에 줄 서 있었다.**

### 2. 판서와 오사서는 둘 다 판례를 분석하고 있었다

`precedent`(한판서)는 법제처 API로, `rag_precedent`(오사서)는 RAG DB로. RAG 결과는 검색
자료일 뿐 별도 인격일 이유가 없다. 게다가 `useAgents.ts:215`의 RAG 대상 목록에
**`precedent`가 빠져 있어서** 한판서는 RAG를 못 받고 있었다.

→ 오사서를 없애고 `precedent`를 RAG 목록에 넣어 한판서가 법제처+RAG 양쪽을 받게 했다.
`AGENT_SEARCH_CONFIG.precedent`는 이미 잘 설정돼 있었다(5개 테이블). 설정은 손대지 않았다.

### 3. 법률 분석은 원래 쪼개면 안 되는 일이다

쟁점이 정해져야 어떤 판례가 중요한지 알 수 있고, 판례가 나와야 논증 구조가 잡히고,
관할이 정해져야 전략이 달라진다. 지금은 이 넷이 서로를 못 본 채 병렬로 나온 뒤
`buildAgentResultsBlock()`(`prompts.ts:283`)이라는 **수동 접착 코드**로 이어붙고 있다.
그 함수의 존재 자체가 "한 덩어리였어야 할 걸 쪼개놨다"는 증거다.

→ 이번 단계에서는 실행만 4개로 줄였고, 통합은 4~5단계로 미뤘다(스트리밍 선행 필요).

---

## 이번에 내린 결정과 이유

### 결정 1 — 타입·Firestore 스키마는 건드리지 않았다

`AgentId` 유니온(`types/agent.ts:6`)과 `LegalDocument.agentResults`(`types/document.ts:26-29`)에
`review`/`rag_precedent`가 그대로 남아 있다. **의도한 것이다.**
프로덕션 Firestore에 이미 이 필드를 가진 문서가 쌓여 있고, 과거 문서를 읽어 표시하는
경로(`UnifiedTimelineTab.tsx:537`, `AgentsPage.tsx:537`)가 살아 있어야 한다.
실행만 멈추면 비용·지연 이득은 100% 얻으면서 마이그레이션 위험은 0이다.

### 결정 2 — `AGENT_IDS`를 `AGENTS`에서 파생시켰다

기존에는 `config/constants.ts`의 `AGENTS`(UI용)와 `useAgents.ts`의 `AGENT_IDS`(실행용)가
따로 관리되고 있었다. `AgentsPage.tsx:359`가 `AGENTS`를 순회하므로, 둘이 어긋나면
**실행되지 않는 에이전트 카드가 영원히 로딩 상태로 남는다.**
→ `AGENT_IDS = AGENTS.map(a => a.id)`로 단일 진실원본화. 앞으로 에이전트를 늘리거나 줄일 때
`AGENTS` 한 곳만 고치면 된다.

### 결정 3 — `agentResults.rag_precedent` 슬롯은 살려뒀다 (중요)

이 슬롯은 에이전트 결과 저장소가 아니라 **체크포인트 첨부파일을 문서 생성으로 나르는
통로**로 쓰이고 있다.

- `CheckpointPage.tsx:354` — PDF/이미지 OCR 추출 텍스트를 이 슬롯에 이어붙임
- `DocumentPage.tsx:148` — 그 값을 `transcript`(대화록) 자리로 전달

즉 오사서의 판례 분석이 "대화록"인 척 문서 생성에 들어가고 있었다. 오사서를 끄면
이 슬롯에는 첨부파일 텍스트만 남으므로 **오히려 정상화된다.**

→ 다만 이름이 실제 용도와 다르다. `attachedFileContents` 같은 이름으로 바꾸고
`AgentContext.fileContents`(`prompts.ts:112`)로 보내는 게 맞다. 라우터 state 형태를
3개 페이지에 걸쳐 바꿔야 해서 이번 범위에서 제외했다. **후속 작업 목록에 있음.**

### 결정 4 — 마케팅 문구는 건드리지 않았다

`LandingPage.tsx`와 `pages/seo/AiAgentsPage.tsx`는 `data/landingContent.tsx`의 별도
`AGENTS` 상수를 쓴다(`config/constants.ts`와 무관). 따라서 코드는 안 깨진다.
다만 여전히 "6명의 전문 AI 에이전트"로 홍보 중이고, `PLANS`의 Pro 설명에도
"6개 에이전트"가 있다. **외부에 보이는 문구라 임의로 고치지 않았다 — 대표님 결정 사항.**

산출물이 여전히 판례·쟁점·관할·문서 관점을 담으므로 "여러 관점 분석"은 유지 가능하지만,
"6개 AI가 동시에 일합니다" 류의 표현은 사실과 달라진다.

---

## 비용 근거 (2026-07-26 공식 문서 기준)

| 모델 | 입력 $/MTok | 출력 $/MTok |
|---|---|---|
| Opus 5 | 5 | 25 |
| Sonnet 5 | 3 (도입가 2, **2026-08-31 종료**) | 15 (도입가 10) |
| Haiku 4.5 | 1 | 5 |

건당 비용 추정 (40분 상담, 환율 1,400원 가정)

| 구조 | 건당 |
|---|---|
| 현재 (Sonnet 전량, 도입가) | ~920원 |
| 현재 (Sonnet 전량, 9/1 이후) | ~1,390원 |
| 전량 Opus 5 | ~2,310원 |
| 목표 구조 (핵심 2곳만 Opus) | ~1,180원 |

Pro 요금제 ₩89,000/월 무제한 기준 손익분기는 전량 Opus 시 **월 38건**.
→ 3단계 계측이 끝나면 이 추정치를 실측으로 교체할 것.

## 아직 남은 함정

1. **`effort` 미지정** — Opus 5/Sonnet 5는 미지정 시 `high`가 기본이고 생각 기능이 켜진다.
   생각 토큰은 **출력으로 과금되고 `max_tokens` 안에 포함**된다. 현재 `MAX_TOKENS = 16384`가
   생각+본문을 함께 덮고 있어 `claude.ts`의 잘림 경고 경로가 실제로 발동하고 있을 것이다.
2. **6개 동시 호출로 프롬프트 캐시 무효화** — 캐시는 첫 응답이 시작된 뒤에야 읽을 수 있다.
   동시 출발이면 전원이 캐시 쓰기 요금(1.25배)만 낸다. 에이전트가 4개로 줄어 완화됐을 뿐
   원인은 그대로. 팬아웃 직전 `max_tokens: 0` 예열 요청이 정석.
3. **캐시 블록에 정작 큰 게 빠져 있다** — `SHARED_AGENT_PREFIX`(2,056자)만 캐시되고,
   정작 반복되는 대화록·첨부파일·RAG 결과는 캐시 안 되는 두 번째 블록에 들어간다.
4. **`stop_reason: "refusal"` 미처리** — `extractText()`가 빈 content를 만나 예외를 던진다.
   Opus 5는 거절을 정상 응답(HTTP 200)으로 돌려주므로 전환 전 반드시 처리.

---

# 2026-07-26 (오후) — 보안·결제·배포

## 🔴 결제가 깨져 있었다 (해결됨, 다만 후속 조치 필요)

Cloudflare Pages에 **`FIREBASE_CLIENT_EMAIL`·`FIREBASE_PRIVATE_KEY`가 등록돼 있지 않았다.**
`wrangler pages secret put` 실행 시 "Creating the secret"이 떴다 = 기존에 없었다는 뜻.

`_shared/firestore.ts`는 이 둘로 서비스 계정 토큰을 만든다. 없으면 서버에서 Firestore를
쓰는 기능이 전부 실패한다. `payment/confirm.ts`가 여기에 걸려 있었다:

```
1) Toss 승인 fetch      → 성공 (카드가 실제로 결제됨)
2) firestorePatchDocument → 예외 (plan/planExpiresAt 못 씀)
3) catch → 500 반환
```

**돈은 나가고 요금제는 안 올라가는** 최악의 실패 모드였다.

→ **후속 조치**: 토스 대시보드에 승인된 결제가 있는데 해당 사용자의 `users/{uid}.plan`이
`free`로 남아 있다면 수동 보정이 필요하다. `payments` 컬렉션에도 기록이 안 남았으므로
토스 쪽 내역이 유일한 근거다.

키는 `.dev.vars`에 있었고(gitignore 처리됨), 로컬에서 Google 토큰 발급까지 확인한 뒤 등록했다.
프리뷰 환경은 wrangler 4.68.1이 `--environment` 플래그를 지원하지 않아 등록하지 못했다.
**프리뷰에서 서버 Firestore 기능을 테스트하려면 wrangler 업그레이드가 먼저다.**

## 🔴 signing_requests가 전 세계에 열려 있었다 (해결됨)

규칙에 `allow read, update: if true`가 있었다. 주석은 "토큰으로 조회"였지만 규칙에는
토큰 검증이 없었다 — 검증은 앱 코드의 `where("token","==",...)`에만 있었으므로
Firestore REST API를 직접 치면 무력화됐다. 수임계약서 전문 유출 + 제3자 변조가 가능했다.

문서 ID를 토큰으로 바꾸는 방법(마이그레이션 필요) 대신 **서버 검증**을 택했다.
`functions/api/signing/[token].ts`가 서비스 계정으로 조회/서명하고, 규칙에서는 `if true`를
제거했다. 서명자 IP는 클라이언트가 보낸 값이 아니라 `CF-Connecting-IP`를 쓴다.

## 배포에서 밟은 함정 두 개

**1. 브랜치에서 `npm run deploy`하면 프리뷰로 간다.**
`wrangler pages deploy`는 현재 git 브랜치로 프로덕션/프리뷰를 판단한다.
프로덕션에 올리려면 `main`에서 배포해야 한다.

**2. `scripts/post-deploy-check.sh`가 프로덕션 URL을 하드코딩하고 있다.**
`PROD_URL="https://law-caddy.pages.dev"` — 브랜치에서 배포하면 **방금 올린 코드가 아니라
구버전 프로덕션을 검사**하고 "모든 헬스체크 통과"를 띄운다. 초록 메시지를 믿으면 안 된다.
→ 개선 여지: wrangler 출력의 배포 URL을 받아서 검사하도록 바꾸면 좋다.

**3. 커스텀 도메인은 전파가 늦다.** 배포 직후 `law-caddy.com`은 구버전 Functions를
잠시 더 서빙했다(신규 공개 경로가 401). 1~2분 뒤 정상화됐다. 배포 검증 시 감안할 것.

## 배포 순서 (외워둘 것)

앱 코드 → **그다음** 규칙. 순서를 뒤집으면 아직 구버전이 떠 있는 프로덕션에서
`if true`에 의존하던 서명이 즉시 깨진다.
