# SEO/GEO/AEO 계획 — 컨텍스트 노트

## 감사 방법 (2026-07-03)

Explore 서브에이전트로 코드베이스 실제 파일을 Read/Grep해서 확인. 추측 없이 파일 존재 여부·내용 그대로 기록.
결과 요약: robots.txt/sitemap.xml/canonical/OG/twitter카드/JSON-LD/페이지별 메타태그/SSR 전부 부재. 순수 CSR SPA(React Router 7, `vite-react-ssg` 등 프리렌더 패키지 미설치).

## 왜 가이드를 전체 적용하지 않았는가

전역 가이드(SEO_GEO_AEO_최적화_가이드.md)는 "콘텐츠로 검색 유입을 만드는 사이트"를 전제로 작성됨. law-caddy는:
- 공개 라우트: `/`(랜딩), `/login` 뿐
- 그 외(`/dashboard`, `/record`, `/cases`, `/finance`, `/settings`, `/admin`)는 전부 로그인 필요 + 개인정보(의뢰인 사건 정보 등) 포함 — 검색 노출 대상이 아니라 오히려 **막아야 하는** 대상

AEO(질문형 헤딩 + 두괄식 정답 + FAQPage)와 GEO(패시지 단위 인용 최적화)는 "질문에 답하는 콘텐츠 페이지"가 있어야 의미가 있는데, 현재 랜딩 페이지는 마케팅 카피(AI 에이전트 의인화, 기능 소개) 중심이라 이 틀에 맞지 않음. 나중에 "법률사무소 업무자동화란?" 같은 블로그/가이드 콘텐츠를 만들 계획이 생기면 그때 AEO/GEO 구조(질문형 H2 + 40~60단어 정답)를 적용하는 게 맞음.

**결론**: 가이드 체크리스트 중 "찾아지고, 정확히 표시되고, 비공개 페이지가 새지 않는" 기초 SEO(Tier 0~1)에 집중. AEO/GEO 콘텐츠 전략은 스코프 아웃.

## 로그인 게이트 라우트를 robots.txt만으로 막을 수 없는 이유

robots.txt Disallow는 "앞으로 크롤링하지 마라"는 지시일 뿐, 이미 색인된 URL을 검색결과에서 빼주지 않음(가이드 15절 동일 언급 — "robots.txt로 먼저 차단하면 로봇이 noindex를 못 봐서 제외가 안 됨"). 따라서 각 게이트 라우트 컴포넌트에 `<meta name="robots" content="noindex">`를 직접 넣는 것과 병행해야 함. 순서: noindex 먼저 배포 → 검색결과에서 빠진 것 확인 → robots.txt Disallow 추가(선택).

## SSR/프리렌더를 Tier 2로 미룬 이유

CSR SPA는 크롤러 1차 수집 시 정적 HTML만 보고 판단하는데(가이드 6-3절), 지금 index.html의 `<div id="root"></div>`는 사실상 빈 페이지. 이건 근본적으로 중요한 문제지만, `vite-react-ssg` 도입은 React Router 설정을 건드리는 구조 변경이라 Tier 0/1(파일 추가 수준)과 리스크가 다름. 별도 세션에서 스코프 잡아 진행 권장.

## 네이버 서치어드바이저를 직접 못 하는 이유

계정 생성/가입은 시스템 정책상 대행 불가. 사용자가 직접 가입 후 발급받은 `naver-site-verification` 코드를 주면, 그 코드를 `index.html <head>`에 넣는 작업(코드 수정)은 대신 처리 가능.

## 발견된 부수 이슈: `/register` 라우트 불일치

`CLAUDE.md` 8절 라우트 구조에 `/register`가 문서화되어 있으나, 실제 `App.tsx`엔 라우트가 등록돼 있지 않고 `RegisterPage.tsx`는 `<Navigate to="/login" replace />` 한 줄짜리 리다이렉트 컴포넌트. 회원가입 플로우가 다른 방식(예: 관리자 초대, 별도 폼)으로 바뀌었는데 문서만 안 갱신된 것으로 추정 — SEO 작업과 무관하니 별도로 확인 필요.
