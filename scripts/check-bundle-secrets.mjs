// 빌드 결과물에 서버 전용 비밀값이 섞여 들어갔는지 검사한다.
//
// (2026-09-19) 이 검사를 만든 이유. src/services/rag.ts가 `import.meta.env[key]`로
// 환경변수를 대괄호 접근했다. Vite는 정적 점 접근만 값으로 치환하므로, 어느 키를
// 읽을지 모르는 이 코드 때문에 **env 객체 전체**가 번들에 박혔다. 그 안에
// VITE_ANTHROPIC_API_KEY가 평문으로 들어 있었다. 쓰지도 않는 열쇠가 누구나 받아
// 열어볼 수 있는 파일에 실려 나간 것이다.
//
// 코드 리뷰로는 잡기 어렵다. 한 줄만 잘못 써도 관계없는 파일에서 새기 때문이다.
// 그래서 실제 산출물을 본다. 카나리 값을 넣고 빌드한 뒤, 그 값이 dist에 있으면 세운다.
//
// 실행: node scripts/check-bundle-secrets.mjs [dist경로]
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const dist = process.argv[2] ?? "dist";

/**
 * 브라우저에 실리면 안 되는 환경변수 이름.
 * VITE_ 접두어가 붙어 있어도 서버 전용이면 여기 적는다. 이름 자체가 산출물에
 * 나타나면 env 객체가 통째로 실렸다는 신호다.
 */
const FORBIDDEN_ENV_NAMES = [
  "VITE_ANTHROPIC_API_KEY",
  "VITE_VOYAGE_API_KEY",
  "ANTHROPIC_API_KEY",
  "RTZR_CLIENT_SECRET",
  "SOLAPI_API_SECRET",
  "FIREBASE_PRIVATE_KEY",
  "TOSS_SECRET_KEY",
  "CONSULT_ADMIN_TOKEN",
  "LEAD_INBOX_TOKEN",
];

/** 값 자체의 생김새로 잡는 것 — 이름을 바꿔 숨겨도 걸린다 */
const FORBIDDEN_VALUE_PATTERNS = [
  { name: "Anthropic 키", re: /sk-ant-[A-Za-z0-9_-]{8,}/ },
  { name: "OpenAI 키", re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: "PEM 개인키", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Google 서비스계정", re: /"type"\s*:\s*"service_account"/ },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs|cjs|html|json|css|map)$/.test(entry)) out.push(p);
  }
  return out;
}

let files;
try {
  files = walk(dist);
} catch {
  console.error(`[bundle-secrets] ${dist}를 읽지 못했습니다. 먼저 빌드하세요.`);
  process.exit(2);
}

const findings = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const name of FORBIDDEN_ENV_NAMES) {
    if (text.includes(name)) findings.push(`${file} — 환경변수 이름 "${name}"`);
  }
  for (const { name, re } of FORBIDDEN_VALUE_PATTERNS) {
    if (re.test(text)) findings.push(`${file} — ${name} 형태의 값`);
  }
}

if (findings.length > 0) {
  console.error("[bundle-secrets] 빌드 결과물에 서버 전용 값이 들어 있습니다:");
  for (const f of findings) console.error("  - " + f);
  console.error("");
  console.error("흔한 원인. import.meta.env를 대괄호로 읽으면 env 객체가 통째로 번들에");
  console.error("박힙니다. import.meta.env.VITE_XXX 처럼 이름을 적은 정적 접근을 쓰세요.");
  process.exit(1);
}

console.log(`[bundle-secrets] 검사 통과 — 파일 ${files.length}개에서 서버 전용 값 없음`);
