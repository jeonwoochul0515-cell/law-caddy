// 빌드 산출물(dist)을 읽어 검색·AI 노출 관련 기술 결함을 PASS/WARN/FAIL로 판정하는 결정적 QA 도구 (Search & AI Visibility V2 §11 구현체)
// 사용법: node site-qa.mjs --config site-qa.config.json [--dist dist] [--only A03,B01] [--v] [--json report.json]
//
// 판정 원칙
//  - 총점·가중 평균·점수 gate가 없다. 항목마다 PASS / WARN / FAIL / N_A / NOT_RUN 하나를 낸다.
//  - REQUIRED 항목이 통과하지 못하면 FAIL, RECOMMENDED 항목이 통과하지 못하면 WARN.
//  - exit code: REQUIRED FAIL이 하나라도 있으면 1, 아니면 0. WARN만으로는 1을 내지 않는다.
//  - 근거는 산출물에 있는 것만 본다. 분량·개수·문단 길이·질문형 제목·FAQ 개수 같은 편집 판단은 검사하지 않는다.
//    그런 것은 콘텐츠 계획의 몫이며 QA FAIL 조건이 아니다.
//  - 프로젝트 고유값(브랜드·연락처·전문가·비공개 경로·칼럼 경로 등)은 전부 config에서 온다. 이 파일에 사이트 이름을 박지 않는다.
//  - 판정을 바꿀 때는 왜 바꿨는지 주석에 남긴다. "기준을 낮췄다"와 "판정 오류를 고쳤다"를 구분하는 것은 주석뿐이다.
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, extname, basename } from 'node:path'

// ── 인자 ────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const arg = (k, d = null) => {
  const i = argv.indexOf(k)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}
const V = argv.includes('--v')
const ONLY = (arg('--only') || '').split(',').map((s) => s.trim()).filter(Boolean)
const JSON_OUT = arg('--json')
const CONFIG_PATH = arg('--config', 'site-qa.config.json')

// ── 설정: 기본값 + 프로젝트 config ─────────────────────────────
// robots 기대값의 기본은 Search & AI Visibility V2 §08 B Owner Policy Profile(2026-09-11)이다.
// 정책이 바뀌면 config.robots.allow / block만 바꾼다. 검사 코드는 그대로 둔다.
const DEFAULTS = {
  origin: null,
  dist: 'dist',
  lang: 'ko',
  privatePaths: [],            // 정규식 문자열. 비공개(검색 대상 아님) 화면의 URL
  dynamicPathPrefixes: ['/api/'], // 산출물에 파일이 없어도 정상인 경로(서버 함수 등)
  articlePathPrefix: null,     // 예: '/columns/'. 없으면 글 관련 검사는 N_A
  entityPages: ['/'],          // Organization/LocalBusiness가 있어야 하는 페이지
  expertPages: [],             // Person이 있어야 하는 페이지(선택)
  brand: { name: null, schemaTypes: [], forbiddenVariants: [], phone: null, address: null },
  experts: [],                 // 저자·감수자 이름(문자열 존재만 확인. 실제 검수 여부는 사람이 확인)
  naver: { ownershipMeta: false },
  indexnow: false,
  cloudflare: false,           // _headers / _routes.json 검사 여부
  jsBudgetKB: { total: 900, chunk: 400 },
  legal: { banRegex: null, requiredNotices: [], privacyPath: null, privacyRegex: null },
  emergencyNumbers: [],
  robots: {
    allow: ['Googlebot', 'Googlebot-Image', 'bingbot', 'Yeti', 'OAI-SearchBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Applebot', 'Google-Extended'],
    block: ['GPTBot', 'ClaudeBot', 'Applebot-Extended'],
    blockLevel: 'RECOMMENDED', // 학습 token 차단은 소유자 정책이며 노출 결함이 아니므로 기본 WARN. FAIL로 올리려면 'REQUIRED'
    samplePaths: null,         // null이면 '/' + 색인 대상 페이지 일부 + 자산 경로를 자동 표본으로 쓴다
  },
}
function deepMerge(a, b) {
  const out = { ...a }
  for (const k of Object.keys(b || {})) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) out[k] = deepMerge(a[k], b[k])
    else out[k] = b[k]
  }
  return out
}
if (!existsSync(CONFIG_PATH)) {
  console.error(`config 파일이 없다: ${CONFIG_PATH}\n예시: ${join(import.meta.dirname, '..', 'site-qa.config.example.json')}`)
  process.exit(2)
}
const CFG = deepMerge(DEFAULTS, JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
const DIST = resolve(arg('--dist', CFG.dist))
const ORIGIN = (CFG.origin || '').replace(/\/$/, '')
if (!ORIGIN) {
  console.error('config.origin이 필요하다 (예: https://example.com)')
  process.exit(2)
}
const rx = (s, f = '') => (s ? new RegExp(s, f) : null)
const PRIVATE = CFG.privatePaths.map((p) => rx(p))

// ── 산출물 수집 ──────────────────────────────────────────────
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
if (!existsSync(DIST)) {
  console.error(`산출물 폴더가 없다: ${DIST}. 먼저 build를 실행한다.`)
  process.exit(2)
}
const files = walk(DIST)
const norm = (p) => p.replace(/\\/g, '/')
const relOf = (f) => '/' + norm(relative(DIST, f))
const read = (p) => readFileSync(p, 'utf8')
const readIf = (p) => (existsSync(p) ? read(p) : null)
const htmlFiles = files.filter((f) => f.endsWith('.html'))
const allPages = htmlFiles.map((f) => {
  const html = read(f)
  let url = relOf(f).replace(/index\.html$/, '').replace(/\.html$/, '')
  url = url === '/' ? '/' : url.replace(/\/$/, '')
  return { file: f, url, html }
})
const isPrivate = (p) => PRIVATE.some((r) => r.test(p.url)) || /^\/(404|offline)$/.test(p.url)
const hasNoindex = (h) => /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(h) || /<meta[^>]+content="[^"]*noindex[^"]*"[^>]+name="robots"/i.test(h)
const pages = allPages.filter((p) => !isPrivate(p))          // 공개 화면
const indexable = pages.filter((p) => !hasNoindex(p.html))    // 색인 대상
const articles = CFG.articlePathPrefix ? indexable.filter((p) => p.url.startsWith(CFG.articlePathPrefix)) : []
const urlSet = new Set(allPages.map((p) => p.url))

const robotsTxt = readIf(join(DIST, 'robots.txt'))

// sitemap·rss를 정적 파일이 아니라 요청 시점에 서버(예: Cloudflare Pages Functions)가
// 만드는 프로젝트가 있다. 그런 사이트는 dist에 파일이 없는 것이 정상이고, 실제로는
// 정상 제공된다. 파일이 없다는 이유만으로 FAIL을 내면 그것은 결함이 아니라 측정 오류다.
// config.runtimeArtifacts에 URL을 적으면 그 주소에서 한 번 받아 같은 검사를 그대로 돌린다.
// (기준을 낮추는 것이 아니다 — 검사 대상을 실제 산출물이 있는 곳에서 읽을 뿐이다.)
async function fetchRuntime(url) {
  if (!url) return null
  try {
    const r = await fetch(url, { redirect: 'follow' })
    if (!r.ok) return null
    const t = await r.text()
    return t && t.trim() ? t : null
  } catch { return null }
}
const RT = CFG.runtimeArtifacts || {}
const sitemapXml = readIf(join(DIST, 'sitemap.xml')) || (await fetchRuntime(RT.sitemap))
const rssXml = readIf(join(DIST, 'rss.xml')) || readIf(join(DIST, 'feed.xml')) || (await fetchRuntime(RT.rss))
const headersTxt = readIf(join(DIST, '_headers'))
const routesJson = readIf(join(DIST, '_routes.json'))

// ── HTML 도우미 ─────────────────────────────────────────────
const tag = (html, re) => (html.match(re) || [])[1] ?? null
const all = (html, re) => [...html.matchAll(re)].map((m) => m[1])
const headOf = (h) => h.split(/<\/head>/i)[0] || ''
const title = (h) => tag(h, /<title[^>]*>([\s\S]*?)<\/title>/i)
const desc = (h) => tag(h, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i) ?? tag(h, /<meta[^>]+content="([^"]*)"[^>]+name="description"/i)
const canonical = (h) => tag(h, /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i) ?? tag(h, /<link[^>]+href="([^"]*)"[^>]+rel="canonical"/i)
const ogv = (h, p) => tag(h, new RegExp(`<meta[^>]+property="og:${p}"[^>]+content="([^"]*)"`, 'i')) ?? tag(h, new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="og:${p}"`, 'i'))
const bodyText = (h) =>
  (h.split(/<body[^>]*>/i)[1] || h)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
function jsonLd(h) {
  return all(h, /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi).map((s) => {
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  })
}
function ldNodes(h) {
  const out = []
  const push = (x) => {
    if (!x || typeof x !== 'object') return
    if (Array.isArray(x)) return x.forEach(push)
    if (x['@type']) out.push(x)
    if (Array.isArray(x['@graph'])) x['@graph'].forEach(push)
  }
  jsonLd(h).forEach(push)
  return out
}
const typesOf = (n) => (Array.isArray(n['@type']) ? n['@type'] : [n['@type']])
const hasType = (n, t) => typesOf(n).includes(t)
const imgsOf = (h) => h.match(/<img\s[^>]*>/gi) || []
const videosOf = (h) => h.match(/<video\s[^>]*>/gi) || []
const hrefsOf = (h) => all(h, /<a\s[^>]*href="([^"]*)"/gi)
const normUrl = (u) => {
  let s = u.replace(ORIGIN, '')
  s = s.split(/[?#]/)[0]
  if (s === '') s = '/'
  return s === '/' ? '/' : s.replace(/\/$/, '')
}

// ── robots.txt — RFC 9309 그룹 매칭 ─────────────────────────
// 질문은 "봇 X에게 경로 P는 허용인가"다. 정규식으로 그룹 존재를 세지 않는다.
// 규칙: 토큰과 정확히(대소문자 무시) 일치하는 그룹이 있으면 그 그룹만, 없으면 '*' 그룹. 전용 그룹은 '*'의 규칙을 상속하지 않는다.
// 제품별 fallback: Applebot은 전용 그룹이 없으면 Googlebot 그룹을 따른다[AP01]. Google 미디어 토큰은 Googlebot 그룹으로 떨어진다[G29].
const FALLBACK = { applebot: ['googlebot'], 'googlebot-image': ['googlebot'], 'googlebot-video': ['googlebot'], 'googlebot-news': ['googlebot'] }
function parseRobots(txt) {
  const groups = []
  const sitemaps = []
  let cur = null
  let lastWasAgent = false
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1].toLowerCase()
    const val = m[2].trim()
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] }
        groups.push(cur)
      }
      cur.agents.push(val.toLowerCase())
      lastWasAgent = true
    } else if (key === 'allow' || key === 'disallow') {
      if (cur) cur.rules.push({ allow: key === 'allow', path: val })
      lastWasAgent = false
    } else {
      if (key === 'sitemap') sitemaps.push(val)
      lastWasAgent = false
    }
  }
  return { groups, sitemaps }
}
function groupsFor(parsed, token) {
  const t = token.toLowerCase()
  let g = parsed.groups.filter((x) => x.agents.includes(t))
  if (!g.length) for (const fb of FALLBACK[t] || []) {
    g = parsed.groups.filter((x) => x.agents.includes(fb))
    if (g.length) break
  }
  if (!g.length) g = parsed.groups.filter((x) => x.agents.includes('*'))
  return g
}
function patternToRegex(p) {
  let anchored = false
  if (p.endsWith('$')) {
    anchored = true
    p = p.slice(0, -1)
  }
  const esc = p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp('^' + esc + (anchored ? '$' : ''))
}
function isAllowed(parsed, token, path) {
  const rules = groupsFor(parsed, token).flatMap((g) => g.rules)
  let best = null
  for (const r of rules) {
    if (r.path === '') continue // 빈 Disallow/Allow는 규칙 없음과 같다
    if (!patternToRegex(r.path).test(path)) continue
    const len = r.path.length
    // 가장 긴 패턴이 이기고, 길이가 같으면 Allow가 이긴다(RFC 9309 §2.2.2)
    if (!best || len > best.len || (len === best.len && r.allow && !best.allow)) best = { len, allow: r.allow }
  }
  return best ? best.allow : true
}
const hasOwnGroup = (parsed, token) => parsed.groups.some((g) => g.agents.includes(token.toLowerCase()))

// --ask "Yeti:/admin/,GPTBot:/" — 검사 없이 "봇 X에게 경로 P는 허용인가"만 답한다(운영자 확인용)
const ASK = arg('--ask')
if (ASK) {
  if (!robotsTxt) {
    console.error('robots.txt 없음')
    process.exit(2)
  }
  const parsed = parseRobots(robotsTxt)
  for (const q of ASK.split(',')) {
    const i = q.indexOf(':')
    const bot = q.slice(0, i).trim()
    const path = q.slice(i + 1).trim()
    console.log(`${bot} ${path} → ${isAllowed(parsed, bot, path) ? 'ALLOW' : 'DISALLOW'}${hasOwnGroup(parsed, bot) ? '' : ' (전용 그룹 없음 → fallback/* 적용)'}`)
  }
  process.exit(0)
}

// ── 판정 틀 ─────────────────────────────────────────────────
const results = []
const LIMIT = 8
function check(id, area, level, label, fn) {
  if (ONLY.length && !ONLY.includes(id)) return
  let r
  try {
    r = fn()
  } catch (e) {
    r = { status: 'NOT_RUN', detail: `실행 오류: ${e.message}` }
  }
  // fn은 {ok, detail, pages} 또는 {status, detail}을 준다
  let status = r.status
  if (!status) status = r.ok ? 'PASS' : level === 'REQUIRED' ? 'FAIL' : 'WARN'
  if (level === 'NOT_APPLICABLE') status = 'N_A'
  results.push({ id, area, level, label, status, detail: r.detail || '', pages: (r.pages || []).slice(0, LIMIT), pageCount: (r.pages || []).length })
}
// 페이지 집합에 술어를 적용해 실패 페이지 목록을 만든다
const failing = (arr, pred) => arr.filter((p) => !pred(p)).map((p) => p.url)
const byPages = (arr, pred, detail = '') => {
  const f = failing(arr, pred)
  return { ok: f.length === 0, pages: f, detail: detail || (f.length ? `${f.length}/${arr.length} 페이지` : '') }
}
const NA = (why) => ({ status: 'N_A', detail: why })

// ═══════════════════════════════════════════════════════════
// A. 크롤링·색인
// ═══════════════════════════════════════════════════════════
check('A01', 'A 크롤링·색인', 'REQUIRED', 'robots.txt 존재', () => ({ ok: !!robotsTxt }))
const robots = robotsTxt ? parseRobots(robotsTxt) : null
check('A02', 'A 크롤링·색인', 'RECOMMENDED', 'robots.txt에 Sitemap 절대 URL 지시', () =>
  robots ? { ok: robots.sitemaps.some((s) => /^https?:\/\//.test(s)), detail: robots.sitemaps.join(', ') } : NA('robots.txt 없음'))

const samplePaths = [...new Set(CFG.robots.samplePaths || ['/', ...indexable.slice(0, 6).map((p) => p.url)])]
const assetPaths = [...new Set(pages.flatMap((p) => [...all(p.html, /<script[^>]+src="(\/[^"]+)"/gi), ...all(p.html, /<link[^>]+href="(\/[^"]+\.css[^"]*)"/gi)]))].slice(0, 6)

check('A03', 'A 크롤링·색인', 'REQUIRED', 'robots: 검색·retrieval 허용 봇이 공개 표본 경로에 접근 가능 (V2 §08 B)', () => {
  if (!robots) return NA('robots.txt 없음')
  const bad = []
  for (const bot of CFG.robots.allow) for (const p of samplePaths) if (!isAllowed(robots, bot, p)) bad.push(`${bot}: ${p}`)
  return { ok: !bad.length, detail: bad.length ? bad.join('; ') : `${CFG.robots.allow.length}개 봇 × ${samplePaths.length}개 경로` }
})
check('A04', 'A 크롤링·색인', CFG.robots.blockLevel, 'robots: 학습 전용 token이 / 에서 차단됨 (소유자 정책 V2 §08 B)', () => {
  if (!robots) return NA('robots.txt 없음')
  const notBlocked = CFG.robots.block.filter((b) => isAllowed(robots, b, '/'))
  return { ok: !notBlocked.length, detail: notBlocked.length ? `미차단: ${notBlocked.join(', ')} (정책 미적용. 결함이 아니라 정책 결정 사항)` : CFG.robots.block.join(', ') }
})
check('A05', 'A 크롤링·색인', 'RECOMMENDED', 'robots: 허용 봇 전용 그룹이 * 그룹의 제외 경로를 잃지 않음 (RFC 9309 그룹은 상속되지 않는다)', () => {
  if (!robots) return NA('robots.txt 없음')
  const star = robots.groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules).filter((r) => !r.allow && r.path)
  const issues = []
  for (const bot of CFG.robots.allow) {
    if (!hasOwnGroup(robots, bot)) continue
    for (const r of star) {
      const probe = r.path.replace(/\*.*$/, '').replace(/\$$/, '') || '/'
      if (isAllowed(robots, bot, probe)) issues.push(`${bot}: ${r.path} 미상속`)
    }
  }
  return { ok: !issues.length, detail: issues.join('; ') || '전용 그룹 없음 또는 상속 문제 없음' }
})
check('A06', 'A 크롤링·색인', 'REQUIRED', 'robots: Googlebot·Yeti가 JS/CSS 자산 경로에 접근 가능', () => {
  if (!robots) return NA('robots.txt 없음')
  if (!assetPaths.length) return NA('HTML에서 자산 경로를 찾지 못함')
  const bad = []
  for (const bot of ['Googlebot', 'Yeti']) for (const a of assetPaths) if (!isAllowed(robots, bot, a)) bad.push(`${bot}: ${a}`)
  return { ok: !bad.length, detail: bad.join('; ') || `${assetPaths.length}개 자산 경로` }
})
check('A07', 'A 크롤링·색인', 'REQUIRED', 'sitemap.xml 존재·urlset 형식', () => ({ ok: !!sitemapXml && /<urlset[\s>]/.test(sitemapXml) }))
const locs = sitemapXml ? all(sitemapXml, /<loc>\s*([^<]+?)\s*<\/loc>/g) : []
check('A08', 'A 크롤링·색인', 'REQUIRED', 'sitemap URL이 모두 대표 origin의 절대 URL', () => {
  if (!sitemapXml) return NA('sitemap 없음')
  const bad = locs.filter((u) => !u.startsWith(ORIGIN + '/') && u !== ORIGIN)
  return { ok: !bad.length, detail: bad.slice(0, LIMIT).join(', ') || `${locs.length}개` }
})
const locSet = new Set(locs.map(normUrl))
check('A09', 'A 크롤링·색인', 'REQUIRED', 'sitemap이 색인 대상 공개 페이지를 모두 포함', () => {
  if (!sitemapXml) return NA('sitemap 없음')
  const missing = indexable.filter((p) => !locSet.has(p.url)).map((p) => p.url)
  return { ok: !missing.length, pages: missing, detail: missing.length ? `누락 ${missing.length}/${indexable.length}` : `${indexable.length}개 포함` }
})
check('A10', 'A 크롤링·색인', 'REQUIRED', 'sitemap에 비공개·noindex·없는 페이지가 없음', () => {
  if (!sitemapXml) return NA('sitemap 없음')
  const idx = new Set(indexable.map((p) => p.url))
  const bad = [...locSet].filter((u) => !idx.has(u))
  return { ok: !bad.length, pages: bad, detail: bad.length ? `${bad.length}개 (noindex/비공개/산출물에 없음)` : '' }
})
check('A11', 'A 크롤링·색인', 'REQUIRED', 'sitemap lastmod에 미래 날짜 없음 (가짜 최신일 금지)', () => {
  if (!sitemapXml) return NA('sitemap 없음')
  const lm = all(sitemapXml, /<lastmod>\s*([^<]+?)\s*<\/lastmod>/g)
  if (!lm.length) return NA('lastmod 없음')
  const future = lm.filter((d) => new Date(d).getTime() > Date.now() + 86400e3)
  return { ok: !future.length, detail: future.length ? `미래 날짜 ${future.length}건: ${future.slice(0, 3).join(', ')}` : `${lm.length}건` }
})
check('A12', 'A 크롤링·색인', 'RECOMMENDED', 'sitemap lastmod가 배포 시각으로 일괄 치환된 흔적 없음 (실질 변경일이어야 함)', () => {
  if (!sitemapXml) return NA('sitemap 없음')
  const lm = all(sitemapXml, /<lastmod>\s*([^<]+?)\s*<\/lastmod>/g)
  if (lm.length < 5) return NA('lastmod 5건 미만이라 판단 불가')
  const days = new Set(lm.map((d) => d.slice(0, 10)))
  const today = new Date().toISOString().slice(0, 10)
  const suspicious = days.size === 1 && [...days][0] >= today
  return { ok: !suspicious, detail: suspicious ? `모든 lastmod가 ${[...days][0]}로 동일 — 배포 시 치환 여부 확인` : `${days.size}개 날짜` }
})
check('A13', 'A 크롤링·색인', 'REQUIRED', '색인 대상 페이지에 canonical 존재', () => byPages(indexable, (p) => !!canonical(p.html)))
check('A14', 'A 크롤링·색인', 'REQUIRED', 'canonical이 절대 URL이며 자기 주소 (의도적 예외는 config.canonicalExceptions)', () => {
  const ex = new Set(CFG.canonicalExceptions || [])
  return byPages(indexable.filter((p) => !ex.has(p.url)), (p) => {
    const c = canonical(p.html)
    return !!c && /^https?:\/\//.test(c) && normUrl(c) === p.url && c.startsWith(ORIGIN)
  })
})
check('A15', 'A 크롤링·색인', 'RECOMMENDED', '공개 페이지의 noindex는 의도된 것인지 확인 (목록에 나오면 사유 기록)', () => {
  const ni = pages.filter((p) => hasNoindex(p.html)).map((p) => p.url)
  return { ok: !ni.length, pages: ni, detail: ni.length ? `${ni.length}개 공개 화면에 noindex` : '' }
})
check('A16', 'A 크롤링·색인', 'RECOMMENDED', '비공개 화면이 정적 산출물에 있으면 인증으로 보호되는지 확인 (noindex·robots는 보호 수단이 아님)', () => {
  const priv = allPages.filter((p) => PRIVATE.some((r) => r.test(p.url))).map((p) => p.url)
  return { ok: !priv.length, pages: priv, detail: priv.length ? `${priv.length}개. 인증 없는 GET에 비공개 본문이 없는지 서버에서 확인` : '비공개 경로 없음' }
})
check('A17', 'A 크롤링·색인', 'RECOMMENDED', '404 문서 존재', () => ({ ok: existsSync(join(DIST, '404.html')) }))

// ═══════════════════════════════════════════════════════════
// B. HTML·메타·링크
// ═══════════════════════════════════════════════════════════
check('B01', 'B HTML·메타', 'REQUIRED', '모든 공개 페이지에 비어 있지 않은 title', () => byPages(pages, (p) => !!(title(p.html) || '').trim()))
check('B02', 'B HTML·메타', 'REQUIRED', 'title 태그가 정확히 1개', () => byPages(pages, (p) => (p.html.match(/<title[^>]*>/gi) || []).length === 1))
check('B03', 'B HTML·메타', 'RECOMMENDED', 'title 중복 없음 (pagination 등 의도적 중복은 사유 기록)', () => {
  const m = new Map()
  for (const p of indexable) {
    const t = (title(p.html) || '').trim()
    m.set(t, [...(m.get(t) || []), p.url])
  }
  const dup = [...m.entries()].filter(([, v]) => v.length > 1)
  return { ok: !dup.length, pages: dup.flatMap(([, v]) => v), detail: dup.length ? `${dup.length}개 제목이 중복` : '' }
})
check('B04', 'B HTML·메타', 'RECOMMENDED', '색인 대상 페이지에 description', () => byPages(indexable, (p) => !!(desc(p.html) || '').trim()))
check('B05', 'B HTML·메타', 'RECOMMENDED', 'description 중복 없음', () => {
  const m = new Map()
  for (const p of indexable) {
    const d = (desc(p.html) || '').trim()
    if (!d) continue
    m.set(d, [...(m.get(d) || []), p.url])
  }
  const dup = [...m.entries()].filter(([, v]) => v.length > 1)
  return { ok: !dup.length, pages: dup.flatMap(([, v]) => v), detail: dup.length ? `${dup.length}개 설명이 중복` : '' }
})
check('B06', 'B HTML·메타', 'RECOMMENDED', 'title/description 길이 진단 (고정 글자 수는 규칙이 아님. 극단값만 표시)', () => {
  // 글자 수 자체는 순위 조건이 아니다(V2 §06.4). 잘렸거나 비정상적으로 긴 값만 알린다.
  const longT = pages.filter((p) => (title(p.html) || '').length > 120).map((p) => p.url)
  const longD = pages.filter((p) => (desc(p.html) || '').length > 320).map((p) => p.url)
  const ts = pages.map((p) => (title(p.html) || '').length)
  const ds = pages.map((p) => (desc(p.html) || '').length).filter(Boolean)
  const rng = (a) => (a.length ? `${Math.min(...a)}~${Math.max(...a)}자` : '없음')
  return { ok: !longT.length && !longD.length, pages: [...longT, ...longD], detail: `title ${rng(ts)}, description ${rng(ds)}` }
})
check('B07', 'B HTML·메타', 'REQUIRED', `charset 선언과 html lang="${CFG.lang}"`, () =>
  byPages(pages, (p) => /<meta[^>]+charset=/i.test(p.html) && new RegExp(`<html[^>]+lang="${CFG.lang}`, 'i').test(p.html)))
check('B08', 'B HTML·메타', 'REQUIRED', 'viewport(width=device-width)', () => byPages(pages, (p) => /name="viewport"[^>]+width=device-width/i.test(p.html)))
check('B09', 'B HTML·메타', 'RECOMMENDED', '주요 제목(h1) 존재 — 개수는 채점하지 않음', () => byPages(indexable, (p) => /<h1[\s>]/i.test(p.html)))
check('B10', 'B HTML·메타', 'REQUIRED', '이미지에 alt 속성 (장식은 alt="" 허용)', () => {
  const bad = pages.filter((p) => imgsOf(p.html).some((i) => !/\salt=/i.test(i))).map((p) => p.url)
  return { ok: !bad.length, pages: bad, detail: `${pages.reduce((s, p) => s + imgsOf(p.html).length, 0)}개 이미지` }
})
check('B11', 'B HTML·메타', 'RECOMMENDED', '이미지에 width·height (레이아웃 이동 예방)', () => {
  const bad = pages.filter((p) => imgsOf(p.html).some((i) => !(/\swidth=/i.test(i) && /\sheight=/i.test(i)))).map((p) => p.url)
  return { ok: !bad.length, pages: bad }
})
check('B12', 'B HTML·메타', 'RECOMMENDED', '동영상 preload=metadata|none 및 poster', () => {
  const withV = pages.filter((p) => videosOf(p.html).length)
  if (!withV.length) return NA('video 없음')
  return byPages(withV, (p) => videosOf(p.html).every((v) => /preload="(metadata|none)"/i.test(v) && /\sposter=/i.test(v)))
})
check('B13', 'B HTML·메타', 'REQUIRED', 'fragment(#/) 라우팅 링크 없음', () => byPages(pages, (p) => !/href="#!?\//.test(p.html)))
check('B14', 'B HTML·메타', 'REQUIRED', 'javascript: 링크 없음', () => byPages(pages, (p) => !/href="javascript:/i.test(p.html)))
check('B15', 'B HTML·메타', 'RECOMMENDED', '페이지마다 내부 탐색 href가 1개 이상 (개수 목표 없음)', () =>
  byPages(indexable, (p) => hrefsOf(p.html).some((h) => h.startsWith('/') && !h.startsWith('//'))))
check('B16', 'B HTML·메타', 'RECOMMENDED', '내부 링크가 산출물에 존재 (동적 경로는 config.dynamicPathPrefixes로 제외)', () => {
  const broken = []
  for (const p of pages) {
    for (const h of hrefsOf(p.html)) {
      if (!h.startsWith('/') || h.startsWith('//')) continue
      const u = normUrl(h)
      if (CFG.dynamicPathPrefixes.some((d) => u.startsWith(d))) continue
      const isFile = extname(u) && !u.endsWith('.html')
      const ok = isFile ? existsSync(join(DIST, u)) : urlSet.has(u) || existsSync(join(DIST, u)) || existsSync(join(DIST, u, 'index.html'))
      if (!ok) broken.push(`${p.url} → ${h}`)
    }
  }
  return { ok: !broken.length, pages: broken, detail: broken.length ? `${broken.length}건` : '' }
})
check('B17', 'B HTML·메타', 'REQUIRED', '외부 링크 URL의 괄호 짝이 맞음 (법제처 판례 주소 등 잘림 방지)', () => {
  const bad = []
  for (const p of pages) for (const h of hrefsOf(p.html)) {
    if (!/^https?:\/\//.test(h)) continue
    const o = (h.match(/\(/g) || []).length
    const c = (h.match(/\)/g) || []).length
    if (o !== c) bad.push(`${p.url} → ${h}`)
  }
  return { ok: !bad.length, pages: bad }
})

// ═══════════════════════════════════════════════════════════
// C. 오픈그래프·소셜
// ═══════════════════════════════════════════════════════════
check('C01', 'C 오픈그래프', 'RECOMMENDED', 'og:title·description·url·image·type 존재', () =>
  byPages(indexable, (p) => ['title', 'description', 'url', 'image', 'type'].every((k) => !!ogv(p.html, k))))
check('C02', 'C 오픈그래프', 'REQUIRED', 'og:image가 절대 URL', () => {
  const withOg = pages.filter((p) => ogv(p.html, 'image'))
  if (!withOg.length) return NA('og:image 없음')
  return byPages(withOg, (p) => /^https?:\/\//.test(ogv(p.html, 'image')))
})
check('C03', 'C 오픈그래프', 'REQUIRED', '같은 origin의 og:image 파일이 산출물에 실재', () => {
  const same = pages.filter((p) => (ogv(p.html, 'image') || '').startsWith(ORIGIN + '/'))
  if (!same.length) return NA('같은 origin의 og:image 없음')
  return byPages(same, (p) => existsSync(join(DIST, ogv(p.html, 'image').replace(ORIGIN, '').split(/[?#]/)[0])))
})
check('C04', 'C 오픈그래프', 'RECOMMENDED', 'og:url이 canonical과 일치', () => {
  const both = indexable.filter((p) => ogv(p.html, 'url') && canonical(p.html))
  if (!both.length) return NA('비교 대상 없음')
  return byPages(both, (p) => normUrl(ogv(p.html, 'url')) === normUrl(canonical(p.html)))
})
check('C05', 'C 오픈그래프', 'RECOMMENDED', 'twitter:card', () => byPages(indexable, (p) => /name="twitter:card"/i.test(p.html)))
check('C06', 'C 오픈그래프', 'RECOMMENDED', '글마다 고유 og:image (공유 시 어느 글인지 보이게)', () => {
  if (!articles.length) return NA('articlePathPrefix 없음 또는 글 없음')
  const m = new Map()
  for (const p of articles) {
    const k = ogv(p.html, 'image') || ''
    m.set(k, [...(m.get(k) || []), p.url])
  }
  const dup = [...m.entries()].filter(([, v]) => v.length > 1)
  return { ok: !dup.length, pages: dup.flatMap(([, v]) => v), detail: dup.length ? `${dup.length}개 이미지가 여러 글에 공유됨` : '' }
})

// ═══════════════════════════════════════════════════════════
// D. 구조화 데이터 — 문법과 화면 일치만. rich result 노출 목적의 타입 강제는 없다.
// ═══════════════════════════════════════════════════════════
check('D01', 'D 구조화 데이터', 'REQUIRED', 'JSON-LD 파싱 오류 없음', () => byPages(pages, (p) => jsonLd(p.html).every((o) => o !== null)))
const brandTypes = CFG.brand.schemaTypes || []
check('D02', 'D 구조화 데이터', brandTypes.length ? 'REQUIRED' : 'NOT_APPLICABLE', `entity 페이지(${CFG.entityPages.join(', ')})에 조직 entity(${brandTypes.join('/') || '미설정'}) 존재`, () => {
  const targets = pages.filter((p) => CFG.entityPages.includes(p.url))
  if (!targets.length) return NA('entityPages에 해당하는 페이지 없음')
  return byPages(targets, (p) => ldNodes(p.html).some((n) => brandTypes.some((t) => hasType(n, t))))
})
check('D03', 'D 구조화 데이터', CFG.brand.name ? 'REQUIRED' : 'NOT_APPLICABLE', '조직 entity의 name이 브랜드 표준명과 일치', () => {
  const withOrg = pages.filter((p) => ldNodes(p.html).some((n) => brandTypes.some((t) => hasType(n, t))))
  if (!withOrg.length) return NA('조직 entity 없음')
  return byPages(withOrg, (p) => ldNodes(p.html).filter((n) => brandTypes.some((t) => hasType(n, t))).every((n) => n.name === CFG.brand.name))
})
check('D04', 'D 구조화 데이터', 'REQUIRED', 'sameAs 값이 절대 URL (개수 목표 없음. 실재 공식 채널만)', () => {
  const withSame = pages.filter((p) => ldNodes(p.html).some((n) => n.sameAs))
  if (!withSame.length) return NA('sameAs 없음')
  return byPages(withSame, (p) => ldNodes(p.html).every((n) => !n.sameAs || [].concat(n.sameAs).every((u) => /^https?:\/\//.test(u))))
})
check('D05', 'D 구조화 데이터', CFG.expertPages.length ? 'RECOMMENDED' : 'NOT_APPLICABLE', `전문가 페이지(${CFG.expertPages.join(', ')})에 Person entity`, () => {
  const targets = pages.filter((p) => CFG.expertPages.includes(p.url))
  if (!targets.length) return NA('expertPages에 해당하는 페이지 없음')
  return byPages(targets, (p) => ldNodes(p.html).some((n) => hasType(n, 'Person')))
})
check('D06', 'D 구조화 데이터', 'RECOMMENDED', 'BreadcrumbList가 있으면 실제 계층(2단계 이상)이고 마지막 항목이 현재 페이지', () => {
  const withBc = pages.filter((p) => ldNodes(p.html).some((n) => hasType(n, 'BreadcrumbList')))
  if (!withBc.length) return NA('BreadcrumbList 없음')
  return byPages(withBc, (p) =>
    ldNodes(p.html).filter((n) => hasType(n, 'BreadcrumbList')).every((n) => {
      const items = n.itemListElement || []
      if (items.length < 2) return false
      const last = items[items.length - 1]
      const u = typeof last.item === 'string' ? last.item : last.item?.['@id'] || last.item?.url || ''
      return !u || normUrl(u) === p.url
    }))
})
check('D07', 'D 구조화 데이터', 'REQUIRED', 'Article 날짜가 유효하고 미래가 아니며 dateModified ≥ datePublished (가짜 최신일 금지)', () => {
  const withArt = pages.filter((p) => ldNodes(p.html).some((n) => typesOf(n).some((t) => /Article$/.test(t))))
  if (!withArt.length) return NA('Article 없음')
  return byPages(withArt, (p) =>
    ldNodes(p.html).filter((n) => typesOf(n).some((t) => /Article$/.test(t))).every((n) => {
      const pub = n.datePublished ? new Date(n.datePublished) : null
      const mod = n.dateModified ? new Date(n.dateModified) : null
      const lim = Date.now() + 86400e3
      if (pub && (isNaN(pub) || pub.getTime() > lim)) return false
      if (mod && (isNaN(mod) || mod.getTime() > lim)) return false
      if (pub && mod && mod.getTime() < pub.getTime()) return false
      return true
    }))
})
check('D08', 'D 구조화 데이터', 'RECOMMENDED', '글의 Article에 author·publisher·dateModified', () => {
  if (!articles.length) return NA('articlePathPrefix 없음 또는 글 없음')
  return byPages(articles, (p) => ldNodes(p.html).filter((n) => typesOf(n).some((t) => /Article$/.test(t))).some((n) => n.author && n.publisher && n.dateModified))
})
check('D09', 'D 구조화 데이터', 'REQUIRED', 'FAQPage가 있으면 질문이 화면 본문에도 있음 (rich result 목적이 아니라 화면 일치 검사)', () => {
  const withFaq = pages.filter((p) => ldNodes(p.html).some((n) => hasType(n, 'FAQPage')))
  if (!withFaq.length) return NA('FAQPage 없음 — 2026 Google/Naver FAQ rich result 종료. 새로 만들 이유 없음')
  return byPages(withFaq, (p) => {
    const txt = bodyText(p.html)
    return ldNodes(p.html).filter((n) => hasType(n, 'FAQPage')).every((n) => (n.mainEntity || []).every((q) => txt.includes((q.name || '').slice(0, 12))))
  })
})

// ═══════════════════════════════════════════════════════════
// E. 성능·자산 (예산은 프로젝트 설정값. 랭킹 점수가 아니라 회귀 경고)
// ═══════════════════════════════════════════════════════════
const jsFiles = files.filter((f) => f.endsWith('.js'))
check('E01', 'E 성능', 'RECOMMENDED', `JS 총량 예산 ${CFG.jsBudgetKB.total}KB`, () => {
  const total = jsFiles.reduce((s, f) => s + statSync(f).size, 0)
  return { ok: total <= CFG.jsBudgetKB.total * 1024, detail: `${Math.round(total / 1024)}KB` }
})
check('E02', 'E 성능', 'RECOMMENDED', `가장 큰 JS 묶음 예산 ${CFG.jsBudgetKB.chunk}KB`, () => {
  const biggest = jsFiles.map((f) => ({ f: relOf(f), s: statSync(f).size })).sort((a, b) => b.s - a.s)[0]
  if (!biggest) return NA('JS 없음')
  return { ok: biggest.s <= CFG.jsBudgetKB.chunk * 1024, detail: `${biggest.f} ${Math.round(biggest.s / 1024)}KB` }
})
check('E03', 'E 성능', CFG.cloudflare ? 'RECOMMENDED' : 'NOT_APPLICABLE', '정적 자산 장기 캐시 규칙(_headers)', () => {
  if (!headersTxt) return { ok: false, detail: '_headers 없음' }
  return { ok: /max-age=31536000/i.test(headersTxt) }
})
check('E04', 'E 성능', CFG.cloudflare ? 'RECOMMENDED' : 'NOT_APPLICABLE', '보안 헤더(X-Content-Type-Options·HSTS)', () => {
  if (!headersTxt) return { ok: false, detail: '_headers 없음' }
  return { ok: /X-Content-Type-Options/i.test(headersTxt) && /Strict-Transport-Security/i.test(headersTxt) }
})
check('E05', 'E 성능', CFG.cloudflare ? 'REQUIRED' : 'NOT_APPLICABLE', '_routes.json이 있으면 파싱되고 include가 ["/*"] 하나 (겹침 규칙은 배포 실패)', () => {
  if (!routesJson) return NA('_routes.json 없음')
  try {
    const o = JSON.parse(routesJson)
    const inc = o.include || []
    return { ok: inc.length === 1 && inc[0] === '/*', detail: `include=${JSON.stringify(inc)} exclude ${(o.exclude || []).length}개` }
  } catch (e) {
    return { ok: false, detail: `파싱 실패: ${e.message}` }
  }
})

// ═══════════════════════════════════════════════════════════
// F. 접근성 기초 — 자동 검사는 WCAG 적합성 증명이 아니다. 명백한 결함만 잡는다.
// ═══════════════════════════════════════════════════════════
check('F01', 'F 접근성', 'REQUIRED', '버튼에 접근 이름(글자 또는 aria-label)', () =>
  byPages(pages, (p) => [...p.html.matchAll(/<button\s([^>]*)>([\s\S]*?)<\/button>/gi)].every((m) => /aria-label=/.test(m[1]) || m[2].replace(/<[^>]+>/g, '').trim().length > 0 || /<img[^>]+alt="[^"]+"/i.test(m[2]))))
check('F02', 'F 접근성', 'RECOMMENDED', '입력칸에 label for= 또는 aria-label (id만으로는 라벨이 아님)', () =>
  byPages(pages, (p) => {
    // aria-hidden="true"인 입력칸은 접근성 트리에서 아예 빠지므로 라벨 요구 대상이 아니다.
    // 스팸 차단용 허니팟이 여기 해당한다 — 라벨을 붙이면 스크린리더가 읽어 버려 오히려 잘못된 수정이 된다.
    // (2026-09-13 스토킹119에서 허니팟 하나 때문에 WARN이 났고, 그건 결함이 아니라 측정 오류였다.)
    const ins = (p.html.match(/<(input|textarea|select)\s[^>]*>/gi) || []).filter(
      (i) => !/type="(hidden|checkbox|radio|submit|button)"/i.test(i) && !/aria-hidden="true"/i.test(i),
    )
    return ins.every((i) => {
      if (/aria-label=|aria-labelledby=/.test(i)) return true
      const id = (i.match(/\sid="([^"]+)"/) || [])[1]
      return !!id && new RegExp(`<label[^>]+for="${id}"`, 'i').test(p.html)
    })
  }))
check('F03', 'F 접근성', 'RECOMMENDED', 'main 랜드마크', () => byPages(pages, (p) => /<main[\s>]/i.test(p.html)))
check('F04', 'F 접근성', 'RECOMMENDED', 'header·footer 랜드마크', () => byPages(pages, (p) => /<header[\s>]/i.test(p.html) && /<footer[\s>]/i.test(p.html)))
check('F05', 'F 접근성', 'RECOMMENDED', '가로 스크롤을 만드는 고정 폭 인라인 스타일 없음', () => byPages(pages, (p) => !/style="[^"]*width:\s*\d{4,}px/i.test(p.html)))

// ═══════════════════════════════════════════════════════════
// G. Naver·색인 통지·브랜드 일관성
// ═══════════════════════════════════════════════════════════
check('G01', 'G Naver·브랜드', CFG.naver.ownershipMeta ? 'REQUIRED' : 'NOT_APPLICABLE', 'naver-site-verification 메타가 head 안에 있음', () =>
  byPages(pages, (p) => /name="naver-site-verification"/i.test(headOf(p.html))))
check('G02', 'G Naver·브랜드', 'RECOMMENDED', '파비콘 링크', () => byPages(pages, (p) => /rel="(shortcut )?icon"/i.test(p.html)))
check('G03', 'G Naver·브랜드', 'RECOMMENDED', 'RSS가 있으면 item 1개 이상·본문 전체(content:encoded)·자동발견 링크 (없으면 N_A. 개수 목표 없음)', () => {
  if (!rssXml) return NA('RSS 없음 — 실제 발행 피드가 유용할 때만 만든다')
  const items = (rssXml.match(/<item[\s>]/g) || []).length
  const full = /<content:encoded/.test(rssXml)
  const disc = pages.some((p) => /type="application\/rss\+xml"/i.test(headOf(p.html)))
  return { ok: items >= 1 && full && disc, detail: `item ${items}개, content:encoded ${full ? '있음' : '없음'}, 자동발견 ${disc ? '있음' : '없음'}` }
})
check('G04', 'G Naver·브랜드', CFG.indexnow ? 'REQUIRED' : 'NOT_APPLICABLE', 'IndexNow 키 파일이 루트에 있고 본문이 파일명과 같음 (형식은 hex 강제 없음)', () => {
  const keys = files.filter((f) => norm(relative(DIST, f)).indexOf('/') < 0 && /^[A-Za-z0-9-]{8,128}\.txt$/.test(basename(f)))
  const ok = keys.filter((f) => read(f).trim() === basename(f, '.txt'))
  return { ok: ok.length >= 1, detail: keys.length ? `${keys.map((f) => basename(f)).join(', ')}` : '키 파일 없음' }
})
check('G05', 'G Naver·브랜드', CFG.indexnow ? 'RECOMMENDED' : 'NOT_APPLICABLE', '배포 스크립트에 IndexNow 통지 연결 (전역 규칙 §19)', () => {
  const pkgPath = resolve('package.json')
  if (!existsSync(pkgPath)) return { status: 'NOT_RUN', detail: 'package.json 없음 — 프로젝트 루트에서 실행' }
  const pkg = JSON.parse(read(pkgPath))
  const scripts = Object.values(pkg.scripts || {}).join(' ')
  return { ok: /indexnow/i.test(scripts) }
})
check('G06', 'G Naver·브랜드', CFG.brand.forbiddenVariants?.length ? 'REQUIRED' : 'NOT_APPLICABLE', '브랜드명 표기 통일 (금지 변형 없음)', () => {
  const bad = CFG.brand.forbiddenVariants.map((s) => rx(s))
  return byPages(allPages, (p) => !bad.some((r) => r.test(p.html)))
})
check('G07', 'G Naver·브랜드', CFG.brand.phone ? 'RECOMMENDED' : 'NOT_APPLICABLE', '전화번호 표기 통일', () => {
  const v = rx(CFG.brand.phone.variants)
  const c = CFG.brand.phone.canonical
  return byPages(allPages, (p) => !v.test(p.html) || p.html.includes(c))
})
check('G08', 'G Naver·브랜드', CFG.brand.address ? 'RECOMMENDED' : 'NOT_APPLICABLE', '주소 표기 일관 (marker가 있는 페이지는 표준 주소 포함)', () => {
  const m = rx(CFG.brand.address.marker)
  // 이 검사는 "사람이 읽는 주소 표기가 흔들리지 않는가"를 본다. JSON-LD의 PostalAddress는
  // addressRegion·streetAddress로 쪼개 담는 것이 올바른 형식이라 표준 문자열이 통째로 들어갈 수가 없다.
  // 구조화 데이터 안의 marker까지 세면, 본문에 주소를 안 쓰는 화면이 전부 걸린다
  // (2026-09-13 스토킹119의 /admin·/live가 그랬고, 결함이 아니라 측정 오류였다).
  const prose = (h) => h.replace(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi, '')
  return byPages(allPages, (p) => !m.test(prose(p.html)) || p.html.includes(CFG.brand.address.canonical))
})
check('G09', 'G Naver·브랜드', 'NOT_APPLICABLE', 'llms.txt — 검사하지 않음 (Google Search 미사용 G03. 다른 소비자의 실사용 목적이 있을 때만 별도 판단)', () => NA('검사 대상 아님'))

// ═══════════════════════════════════════════════════════════
// H. 법적 고지·신뢰 (config.legal이 있을 때만)
// ═══════════════════════════════════════════════════════════
check('H01', 'H 법적·신뢰', CFG.legal.banRegex ? 'REQUIRED' : 'NOT_APPLICABLE', '광고 규정 금지 표현 없음', () => {
  const r = rx(CFG.legal.banRegex)
  return byPages(pages, (p) => !r.test(bodyText(p.html)))
})
for (const [i, n] of (CFG.legal.requiredNotices || []).entries()) {
  check(`H0${2 + i}`, 'H 법적·신뢰', 'REQUIRED', `필수 고지: ${n.label || n.regex}`, () => {
    const r = rx(n.regex)
    const targets = n.pages === 'all' || !n.pages ? pages : pages.filter((p) => rx(n.pages).test(p.url))
    if (!targets.length) return NA('대상 페이지 없음')
    return byPages(targets, (p) => r.test(bodyText(p.html)))
  })
}
check('H10', 'H 법적·신뢰', CFG.legal.privacyPath ? 'REQUIRED' : 'NOT_APPLICABLE', '개인정보처리방침 페이지 존재(필요 시 위탁·국외 이전 고지)', () => {
  const pv = allPages.find((p) => p.url === CFG.legal.privacyPath)
  if (!pv) return { ok: false, detail: `${CFG.legal.privacyPath} 없음` }
  if (CFG.legal.privacyRegex && !rx(CFG.legal.privacyRegex).test(bodyText(pv.html))) return { ok: false, detail: `고지 문구(${CFG.legal.privacyRegex}) 없음` }
  return { ok: true }
})
check('H11', 'H 법적·신뢰', CFG.experts.length && articles.length ? 'RECOMMENDED' : 'NOT_APPLICABLE', '글에 저자/감수자 표기 (문자열 존재만 확인. 실제 검수 여부는 사람이 확인)', () =>
  byPages(articles, (p) => CFG.experts.some((e) => bodyText(p.html).includes(e))))
check('H12', 'H 법적·신뢰', CFG.emergencyNumbers.length ? 'RECOMMENDED' : 'NOT_APPLICABLE', '본문에 긴급 번호가 글자로만 있으면 tel: 링크로', () => {
  const nums = CFG.emergencyNumbers
  const targets = pages.filter((p) => nums.some((n) => bodyText(p.html.replace(/<a\s[\s\S]*?<\/a>/gi, ' ')).includes(n)))
  if (!targets.length) return NA('긴급 번호가 링크 밖 본문에 없음')
  return byPages(targets, (p) => nums.some((n) => new RegExp(`href=["']tel:${n}`).test(p.html)))
})

// ═══════════════════════════════════════════════════════════
// 출력
// ═══════════════════════════════════════════════════════════
const counts = { FAIL: 0, WARN: 0, PASS: 0, N_A: 0, NOT_RUN: 0 }
for (const r of results) counts[r.status]++
const requiredFail = results.filter((r) => r.status === 'FAIL')
console.log(`site-qa — ${ORIGIN} · 공개 페이지 ${pages.length}개 (색인 대상 ${indexable.length}개${articles.length ? `, 글 ${articles.length}편` : ''})`)
let lastArea = ''
for (const r of results) {
  if (!V && (r.status === 'PASS' || r.status === 'N_A')) continue
  if (r.area !== lastArea) {
    console.log(`\n${r.area}`)
    lastArea = r.area
  }
  const mark = { FAIL: '❌ FAIL', WARN: '⚠️ WARN', PASS: '✅ PASS', N_A: '— N_A', NOT_RUN: '⏸ NOT_RUN' }[r.status]
  console.log(`  ${mark}  ${r.id} ${r.label}${r.detail ? `  (${r.detail})` : ''}  [${r.level}]`)
  for (const p of r.pages) console.log(`           · ${p}`)
  if (r.pageCount > r.pages.length) console.log(`           · … 외 ${r.pageCount - r.pages.length}건 (--json으로 전체)`)
}
console.log(`\n${'─'.repeat(60)}`)
console.log(`REQUIRED FAIL ${counts.FAIL} · WARN ${counts.WARN} · PASS ${counts.PASS} · N_A ${counts.N_A} · NOT_RUN ${counts.NOT_RUN}`)
if (requiredFail.length) console.log(`다음: FAIL 항목의 실제 결함을 고치고 \`--only ${requiredFail.map((r) => r.id).join(',')}\`로 재실행한다.`)
else console.log('REQUIRED FAIL 없음. WARN은 사유를 작업 노트에 남기면 종료할 수 있다. 점수는 없다.')
if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ origin: ORIGIN, dist: DIST, at: new Date().toISOString(), counts, results: results.map((r) => ({ ...r, pages: undefined, pageCount: undefined, failing: r.pages })) }, null, 2))
  console.log(`JSON 보고서: ${JSON_OUT}`)
}
process.exit(requiredFail.length ? 1 : 0)
