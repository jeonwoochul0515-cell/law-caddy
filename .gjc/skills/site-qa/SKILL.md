---
name: site-qa
description: 공개 사이트 기술 QA — 사용자가 "사이트 QA 돌려", "검색 노출 점검해", "배포 전 검사", "site-qa", "robots·sitemap·canonical 확인해", "SEO 점검"이라고 하거나, 공개 페이지의 URL·메타·robots·sitemap·JSON-LD·이미지/영상을 바꾼 뒤 배포 전 검증이 필요할 때 이 스킬을 쓴다. 빌드 산출물(dist)을 읽어 약 70개 결정적 검사를 PASS/WARN/FAIL/N_A/NOT_RUN으로 판정한다. 점수·총점·평균은 없다. REQUIRED FAIL이 0이면 통과이며 WARN은 사유를 적고 종료할 수 있다. 예전 네이버광고 스킬의 15개 영역 98점 채점기를 Search & AI Visibility V2 §11 기준으로 현대화한 것(2026-09-11).
---

# site-qa — 점수가 아니라 결함을 찾는다

**THE SCORE IS NOT THE OBJECTIVE.** 이 도구는 검색·AI 노출에 실제로 해가 되는 기술 결함만 찾는다.
본문 길이, 글 개수, FAQ 개수, 질문형 제목 비율, 문단 길이 같은 편집 판단은 검사하지 않는다.
그런 것은 콘텐츠 계획의 몫이며 QA를 통과하기 위해 본문·FAQ·schema·페이지를 추가하는 일은 없어야 한다.

## 1. 실행

```bash
# 프로젝트 루트에서. 먼저 build로 dist를 만든다.
node "C:/Users/jeonw/.claude/skills/site-qa/scripts/site-qa.mjs" --config site-qa.config.json
node ".../site-qa.mjs" --config site-qa.config.json --v                 # PASS·N_A까지 전부 출력
node ".../site-qa.mjs" --config site-qa.config.json --only A03,B01      # 고친 항목만 재실행
node ".../site-qa.mjs" --config site-qa.config.json --json qa-report.json
```

- 설정은 `site-qa.config.example.json`을 프로젝트 루트에 `site-qa.config.json`으로 복사해 채운다. 브랜드명·연락처·전문가·비공개 경로·칼럼 경로·법적 고지 같은 **사이트 고유값은 전부 config에만** 둔다. 검사기 파일은 프로젝트에 복사하지 않는다.
- exit code. `0` = REQUIRED FAIL 없음, `1` = REQUIRED FAIL 있음, `2` = 설정/산출물 오류. **WARN만으로는 1을 내지 않는다.**

## 2. 판정과 루프

| 판정 | 뜻 |
|---|---|
| FAIL | REQUIRED 항목 미통과. 실제 결함. 고쳐야 배포한다 |
| WARN | RECOMMENDED 항목 미통과. 고치거나 사유를 작업 노트에 적고 넘어간다 |
| PASS | 검사한 조건 통과 |
| N_A | 이 프로젝트에 해당 없음(사유 표시) |
| NOT_RUN | 실행 못 함(사유 표시). PASS로 바꾸지 않는다 |

루프는 이렇게 돈다. **검사 → REQUIRED FAIL 발견 → 실제 결함 수정 → `--only`로 해당 검사 재실행 → REQUIRED FAIL 0 → WARN 사유 기록 → 종료.**
"점수가 오를 때까지"는 없다. 같은 FAIL이 두 번 반복되면 원인을 다시 진단한다.

판정을 고칠 때(측정 오류)는 **왜 그 판정이 틀렸는지 코드 주석에 남긴다.** 기준을 낮춘 것과 판정 오류를 고친 것을 구분하는 것은 주석뿐이다. 자기검열 질문. "이 기준이 처음부터 이랬다면 나는 동의했을까?"

## 3. 검사 영역 (약 70개)

| 영역 | 내용 | 근거 |
|---|---|---|
| A 크롤링·색인 | robots 존재·Sitemap 지시, **RFC 9309 그룹 매칭으로 "봇 X에 경로 P가 허용인가"**, 학습 token 차단(소유자 정책), 전용 그룹의 * 상속 누락, JS/CSS 접근, sitemap 형식·절대 URL·색인 대상 전부 포함·비공개 미포함·lastmod 미래/일괄치환, canonical 존재·자기 주소, 공개 noindex 확인, 비공개 화면 인증 확인, 404 | V2 §06·§08 B, S01, S02, G22, N06 |
| B HTML·메타·링크 | title 존재·1개·중복, description, 길이 극단값(정보), charset·lang, viewport, h1 존재(개수 채점 없음), alt 속성, width/height, video preload/poster, fragment·javascript: 링크, 내부 링크 존재·깨짐, 외부 URL 괄호 짝 | V2 §06.4·Q06·Q07, N08 |
| C 오픈그래프 | og 5종, 절대 URL, 파일 실재, og:url=canonical, twitter:card, 글별 고유 이미지 | G13, N08 |
| D 구조화 데이터 | JSON-LD 파싱, entity 페이지의 조직 entity와 표준명 일치, sameAs 절대 URL(개수 없음), 전문가 페이지 Person, Breadcrumb 실제 계층, Article 날짜 유효·미래 아님·수정≥발행, author/publisher, **FAQPage는 있을 때 화면 일치만**(rich result 목적 강제 없음) | G18, G30, V2 §05.3, Q08, Q14 |
| E 성능 | JS 예산(설정값·WARN), _headers 캐시·보안 헤더, _routes.json 겹침(Cloudflare일 때만) | Q13, deploy-cloudflare 스킬 15-3 |
| F 접근성 기초 | 버튼 접근 이름, 입력 label for/aria-label, main·header·footer, 고정 폭 인라인 | S08, Q12 (자동 검사는 WCAG 증명이 아님) |
| G Naver·통지·브랜드 | 소유확인 meta가 head 안, 파비콘, RSS는 있을 때만 N05 검사, IndexNow 키 파일(형식 강제 없음)·배포 연결, 브랜드명·전화·주소 표기 통일, llms.txt는 검사 안 함 | N16, N10, N05, S03, core §13·reference/tools-cli.md |
| H 법적·신뢰 | 금지 표현, 필수 고지, 개인정보처리방침, 글의 저자/감수자 문자열(실제 검수는 사람이 확인), 긴급 번호 tel 링크 | core §13, V2 §04.4 |

**검사하지 않는 것(의도적).** 페이지 개수, 본문 글자 수, 칼럼 편수, 질문형 H2 비율, 두괄식 CSS class, FAQ 개수·답 길이, ol/ul 유무, 숫자·판례번호 정규식 "근거 있음", 전 페이지 정의문, RSS 항목 수, sitemap priority/changefreq, llms.txt, h1 개수, 문단 평균 길이, AI 봇 전용 Allow 그룹, ChatGPT-User robots. 이유는 Search & AI Visibility V2 §04.3·§06.3·§06.4·§08·§09.1·§10과 2026-09-11 감사 기록(V2 Changelog).

## 4. robots 정책 기대값

기본값은 V2 §08 B Owner Policy Profile(2026-09-11)이다. 허용 봇은 **전용 그룹 없이 `User-agent: *`** 를 따르게 하고, 차단은 GPTBot·ClaudeBot·Applebot-Extended뿐이다. Google-Extended는 허용(grounding 유지). ChatGPT-User·Perplexity-User는 robots 대상이 아니라 검사하지 않는다. 정책이 바뀌면 `config.robots.allow/block`만 바꾸고 검사 코드는 그대로 둔다. Applebot은 전용 그룹이 없으면 Googlebot 그룹을 따르는 fallback을 검사기가 반영한다.

## 5. 연결

- 공개 웹 검색/노출 **판단**이 필요할 때만 Search & AI Visibility V2 Checklist를 읽는다. 현재 위치 `C:/Users/jeonw/.claude/search-ai/SEARCH_VISIBILITY_CHECKLIST_V2.md` (2026-09-11 설치 경로). Master 전체 자동 import 금지. 근거 ID는 Source Matrix 해당 행만.
- 광고 개편은 `네이버광고` 스킬이 맡고, 개편 뒤 기술 검증은 이 스킬로 넘어온다.
- 배포 전 순서. `typecheck → build → site-qa(REQUIRED FAIL 0) → 배포 → 화면으로 다시 본다`.
- **사람이 막히는 문제는 이 스킬이 못 잡는다.** 없는 기능·막다른 안내·어려운 말·이상하게 보이는 화면은 `qa` 스킬(사람 QA·시각 QA)이 맡는다. 배포 뒤 "화면으로 다시 본다"가 그 스킬이다.

## 6. 콘텐츠 계획은 QA가 아니다

"어떤 검색어에 답하는 화면이 있는가"는 유용한 계획 질문이다. 네이버광고 스킬 §5의 공식(공개 페이지 하한 ≈ 활성 키워드 ÷ 5~6)을 참고값으로 쓰되, **그 값 때문에 QA FAIL이 나지 않는다.** 글이 부족하면 "부족하다"고 계획 노트에 적는다. 점수로 환산하지 않는다.
