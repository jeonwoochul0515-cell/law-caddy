// codef_accounts 컬렉션 전수 조사 — 샌드박스 잔재 점검용.
//
// 실행: node scripts/check-codef-accounts.mjs
// 필요: .dev.vars 에 FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY 존재
//       (프로젝트 ID는 .env 의 VITE_FIREBASE_PROJECT_ID 에서 읽음)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const FIRESTORE_BASE = "https://firestore.googleapis.com/v1";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

const PROD_CUTOFF_ISO = "2026-04-22T00:00:00Z";

function parseEnvFile(path) {
  const text = readFileSync(path, "utf8");
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function base64UrlEncode(data) {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return Buffer.from(binary, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function importPrivateKey(pem) {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");
  const binary = Uint8Array.from(Buffer.from(pemBody, "base64"));
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getAccessToken({ clientEmail, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: FIRESTORE_SCOPE,
    aud: OAUTH_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const claimB64 = base64UrlEncode(JSON.stringify(claim));
  const unsigned = `${headerB64}.${claimB64}`;
  const key = await importPrivateKey(privateKey);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64UrlEncode(new Uint8Array(sig))}`;

  const resp = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!resp.ok) throw new Error(`OAuth 실패: HTTP ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.access_token;
}

async function listAllCodefAccounts(projectId, accessToken) {
  const base = `${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/codef_accounts`;
  const docs = [];
  let pageToken = null;
  do {
    const url = new URL(base);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      throw new Error(`list 실패: HTTP ${resp.status} ${await resp.text()}`);
    }
    const data = await resp.json();
    for (const d of data.documents ?? []) docs.push(d);
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);
  return docs;
}

function readField(fields, key) {
  const v = fields?.[key];
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("booleanValue" in v) return v.booleanValue;
  return undefined;
}

function idOf(doc) {
  return doc.name.split("/").pop();
}

async function main() {
  const devVars = parseEnvFile(join(ROOT, ".dev.vars"));
  const env = parseEnvFile(join(ROOT, ".env"));

  const clientEmail = devVars.FIREBASE_CLIENT_EMAIL;
  const privateKey = devVars.FIREBASE_PRIVATE_KEY;
  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    env.VITE_FIREBASE_PROJECT_ID ??
    "law-caddy";

  if (!clientEmail || !privateKey) {
    console.error("FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY 가 .dev.vars 에 없습니다.");
    process.exit(1);
  }

  console.log(`프로젝트: ${projectId}`);
  console.log(`서비스 계정: ${clientEmail}`);

  const accessToken = await getAccessToken({ clientEmail, privateKey });
  const docs = await listAllCodefAccounts(projectId, accessToken);

  console.log(`\ncodef_accounts 문서 개수: ${docs.length}`);

  if (docs.length === 0) {
    console.log("→ 재연결 대상 없음. 샌드박스 잔재 걱정 없습니다.");
    return;
  }

  const byType = {};
  const byOwner = {};
  let preCutoff = 0;
  let postCutoff = 0;
  let unknownCreated = 0;

  const sample = [];

  for (const doc of docs) {
    const f = doc.fields ?? {};
    const type = readField(f, "type") ?? "?";
    const ownerId = readField(f, "ownerId") ?? "?";
    const createdAt = readField(f, "createdAt");
    const institutionName = readField(f, "institutionName") ?? "?";
    const syncStatus = readField(f, "syncStatus") ?? "?";
    const connectedId = readField(f, "connectedId") ?? "";

    byType[type] = (byType[type] ?? 0) + 1;
    byOwner[ownerId] = (byOwner[ownerId] ?? 0) + 1;

    if (!createdAt) unknownCreated++;
    else if (createdAt < PROD_CUTOFF_ISO) preCutoff++;
    else postCutoff++;

    if (sample.length < 10) {
      sample.push({
        id: idOf(doc),
        ownerId: ownerId.slice(0, 10) + "…",
        type,
        institutionName,
        syncStatus,
        createdAt: createdAt ?? "(없음)",
        connectedIdPrefix: connectedId ? connectedId.slice(0, 12) + "…" : "(빈값)",
      });
    }
  }

  console.log("\n유형별 분포:");
  for (const [k, v] of Object.entries(byType)) console.log(`  - ${k}: ${v}건`);

  console.log(`\n소유자(변호사) 수: ${Object.keys(byOwner).length}명`);

  console.log("\n생성 시점 분석 (기준: 2026-04-22 = 정식버전 전환일)");
  console.log(`  - 전환 이전(샌드박스 잔재 의심): ${preCutoff}건`);
  console.log(`  - 전환 이후(정식 가능성):        ${postCutoff}건`);
  if (unknownCreated > 0) console.log(`  - createdAt 누락:                ${unknownCreated}건`);

  console.log("\n샘플 (최대 10건):");
  for (const s of sample) {
    console.log(
      `  [${s.id}] ${s.type} · ${s.institutionName} · ${s.syncStatus} · createdAt=${s.createdAt} · connectedId=${s.connectedIdPrefix} · owner=${s.ownerId}`,
    );
  }

  console.log("\n결론:");
  if (preCutoff === 0 && unknownCreated === 0) {
    console.log("  전환 이전 데이터 없음 → 재연결 필요 없음.");
  } else if (postCutoff === 0) {
    console.log("  전부 전환 이전 데이터 → 재연결 필요. 전수 삭제 또는 플래그 처리 검토.");
  } else {
    console.log("  혼재 상태 → 샌드박스 잔재만 선별 처리 필요.");
  }
}

main().catch((err) => {
  console.error("스크립트 오류:", err);
  process.exit(1);
});
