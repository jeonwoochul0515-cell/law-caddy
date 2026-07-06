# SEO/GEO/AEO 개선 체크리스트 (2026-07-03 감사 기준)

> 전역 가이드(NAVER_SEO_최적화_가이드.md, SEO_GEO_AEO_최적화_가이드.md) 대조 결과.
> 스코프 판단 근거는 `seo-geo-aeo-context-notes.md` 참조.

## Tier 0 — 즉시 (기초, 낮은 리스크)

- [ ] `public/robots.txt` 생성
  - [ ] `User-agent: *` + 공개 경로 Allow
  - [ ] 로그인 게이트 경로 Disallow (`/dashboard`, `/record`, `/cases`, `/finance`, `/settings`, `/admin`, `/pending`, `/profile-setup`)
  - [ ] `User-agent: Yeti` 명시 허용
  - [ ] AI 검색봇 허용: `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, Anthropic 검색봇 계열
  - [ ] `Sitemap: https://law-caddy.pages.dev/sitemap.xml` (또는 커스텀 도메인 확정 시 해당 도메인)
- [ ] `public/sitemap.xml` 생성 (공개 라우트만: `/`, `/login`)
- [ ] `index.html`에 추가
  - [ ] `<link rel="canonical" href="...">`
  - [ ] `og:type`, `og:title`, `og:description`, `og:image`(1200×630), `og:url`
  - [ ] `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`
- [ ] `favicon.ico` 추가 (`public/`에 배치, `<link rel="shortcut icon">` 우선순위로 마크업)

## Tier 1 — 구조적

- [ ] 로그인 게이트 라우트 컴포넌트에 `<meta name="robots" content="noindex">` 삽입 (robots.txt Disallow와 병행 — 이미 색인된 페이지는 Disallow만으론 제외 안 됨)
- [ ] `react-helmet-async` 설치 + 라우트별 title/description 분리 (최소 `/`, `/login`)
- [ ] 랜딩 페이지에 `Organization` + `sameAs` JSON-LD 추가

## Tier 2 — 별도 스코프 논의 필요

- [ ] SSR/프리렌더 도입 여부 결정 (`vite-react-ssg` 등) — 라우터 설정 변경 수반, 별도 계획 필요
- [ ] 네이버 서치어드바이저 가입 + 소유확인 코드 발급 (사용자 직접 진행) → 발급 후 메타태그 삽입은 코드로 처리

## 스코프 아웃 (사유는 context-notes 참조)

- AEO(질문형 헤딩/두괄식 정답/FAQPage) — 해당 콘텐츠 페이지 없음
- GEO 콘텐츠 최적화(패시지 단위 인용 가능성) — 해당 콘텐츠 페이지 없음
- llms.txt — 콘텐츠 없는 상태에서 의미 없음

## 별도 발견 사항 (SEO 아님, 버그)

- [ ] `/register` 라우트 불일치: `CLAUDE.md`엔 문서화되어 있으나 `App.tsx`에 라우트 미등록, `RegisterPage.tsx`는 `/login`으로 리다이렉트만 함. 의도된 동작인지 확인 필요.
