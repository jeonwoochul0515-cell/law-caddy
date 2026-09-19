// 첫 화면이 실제로 받는 자바스크립트 양을 잰다.
//
// 왜 따로 재는가.
//
// site-qa의 JS 예산(E01)은 dist 전체 JS를 더한다. 이 제품은 pdfjs·xlsx·docx처럼
// 무거운 라이브러리를 **필요할 때만 받는 별도 청크**로 쪼개 두었다(94개). 그래서
// 총합은 3MB를 넘지만 첫 화면이 실제로 받는 것은 그중 일부다. 총합만 보면
// "사용자가 3MB를 받는다"고 오해하게 되고, 반대로 총합을 통과시키려고 예산을
// 올려 두면 진짜 문제(초기 청크가 뚱뚱해지는 것)를 놓친다.
//
// 그래서 index.html이 즉시 요청하는 것만 센다. <script src>와 modulepreload가
// 그것이다. 이 값이 늘면 첫 화면이 느려진다.
//
// 실행: node scripts/check-initial-load.mjs [dist경로]
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const dist = process.argv[2] ?? "dist";

/**
 * 예산.
 * raw는 파싱 비용, gzip은 전송 비용에 대응한다. 둘 다 본다 —
 * 압축이 잘 되는 코드라도 파싱은 원본 크기만큼 든다.
 */
const BUDGET_RAW_KB = 600;
const BUDGET_GZIP_KB = 200;

const html = readFileSync(path.join(dist, "index.html"), "utf8");

const scriptSrcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(
  (m) => m[1],
);
const initial = [...new Set([...scriptSrcs, ...preloads])];

if (initial.length === 0) {
  console.error("[initial-load] index.html에서 초기 스크립트를 찾지 못했습니다.");
  process.exit(2);
}

let rawBytes = 0;
let gzipBytes = 0;
const rows = [];

for (const url of initial) {
  const file = path.join(dist, url.replace(/^\//, ""));
  let size = 0;
  let gz = 0;
  try {
    size = statSync(file).size;
    gz = gzipSync(readFileSync(file)).length;
  } catch {
    console.error(`[initial-load] ${url} 파일을 찾지 못했습니다.`);
    process.exit(2);
  }
  rawBytes += size;
  gzipBytes += gz;
  rows.push({ url, size, gz });
}

const rawKB = rawBytes / 1024;
const gzipKB = gzipBytes / 1024;

rows.sort((a, b) => b.size - a.size);
for (const r of rows) {
  console.log(
    `  ${(r.size / 1024).toFixed(1).padStart(8)} KB  (gzip ${(r.gz / 1024).toFixed(1).padStart(6)} KB)  ${r.url}`,
  );
}
console.log(
  `[initial-load] 첫 화면 JS ${rawKB.toFixed(1)}KB (gzip ${gzipKB.toFixed(1)}KB) · 예산 ${BUDGET_RAW_KB}KB / ${BUDGET_GZIP_KB}KB`,
);

const over = [];
if (rawKB > BUDGET_RAW_KB) over.push(`원본 ${rawKB.toFixed(1)}KB > ${BUDGET_RAW_KB}KB`);
if (gzipKB > BUDGET_GZIP_KB) over.push(`gzip ${gzipKB.toFixed(1)}KB > ${BUDGET_GZIP_KB}KB`);

if (over.length > 0) {
  console.error(`[initial-load] 예산 초과 — ${over.join(", ")}`);
  console.error("");
  console.error("첫 화면에 필요 없는 것이 초기 청크로 들어왔을 가능성이 높습니다.");
  console.error("무거운 라이브러리는 정적 import 대신 필요한 시점의 동적 import로 옮기세요.");
  process.exit(1);
}

console.log("[initial-load] 예산 안");
