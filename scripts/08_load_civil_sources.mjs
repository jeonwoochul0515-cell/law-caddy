/**
 * 민사법 LLM 원천데이터 (판결문, 법령, 심결례, 유권해석) → Supabase legal_judgments 테이블
 * Training + Validation 모두 처리
 * Node.js 내장 모듈만 사용 (v20+)
 *
 * JSON 구조:
 *   판결문: { doc_class, doc_id, casenames, normalized_court, casetype, sentences[], announce_date }
 *   법령:   { statute_name, effective_date, proclamation_date, statute_type, statute_abbrv, statute_category, sentences[], data_class }
 *   심결례: { doc_class, document_type, doc_id, decision_date, result, sentences[] }
 *   유권해석: { doc_class, doc_id, response_date, response_institute, sentences[], title }
 */

import fs from "fs";
import { execSync } from "child_process";

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const PROJECT_DIR = "/home/user/law-caddy";
const CIVIL_BASE = `${PROJECT_DIR}/01.민사법 LLM 사전학습 및 Instruction Tuning 데이터/3.개방데이터/1.데이터`;
const TMP_BASE = "/tmp/civil_source_work";
const MAX_CONTENT_LENGTH = 50000;

// ZIP 파일 목록
const SOURCES = [];
for (const [split, prefix] of [["Training", "TS"], ["Validation", "VS"]]) {
  const dir = `${CIVIL_BASE}/${split}/01.원천데이터`;
  SOURCES.push({ dir, zip: `${prefix}_01. 민사법_001. 판결문.zip`, docType: "판결문", jsonType: "judgment" });
  SOURCES.push({ dir, zip: `${prefix}_01. 민사법_002. 법령.zip`, docType: "법령", jsonType: "statute" });
  SOURCES.push({ dir, zip: `${prefix}_01. 민사법_003. 심결례.zip`, docType: "심결례", jsonType: "adjudication" });
  SOURCES.push({ dir, zip: `${prefix}_01. 민사법_004. 유권해석.zip`, docType: "유권해석", jsonType: "interpretation" });
}

const CREATE_TABLE_SQL = `
-- legal_judgments 테이블 생성
-- Supabase Dashboard > SQL Editor에서 실행:
-- https://supabase.com/dashboard/project/eafcyvbgcedvhlwqotis/sql/new

CREATE TABLE IF NOT EXISTS legal_judgments (
  id bigserial PRIMARY KEY,
  doc_id text NOT NULL,
  court text,
  case_name text,
  case_type text,
  category text NOT NULL,
  doc_type text NOT NULL,
  content text NOT NULL,
  summary text,
  embedding vector(1024),
  created_at timestamptz DEFAULT now(),
  UNIQUE(doc_id)
);

CREATE INDEX IF NOT EXISTS idx_legal_judgments_doc_id ON legal_judgments(doc_id);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_category ON legal_judgments(category);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_doc_type ON legal_judgments(doc_type);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_case_type ON legal_judgments(case_type);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_court ON legal_judgments(court);
`;

/**
 * JSON 데이터를 DB 레코드로 변환
 */
function jsonToRecord(data, docType, jsonType) {
  let docId = "";
  let court = null;
  let caseName = null;
  let caseType = null;
  let content = "";

  const sentences = Array.isArray(data.sentences)
    ? data.sentences.filter(s => s && typeof s === "string").map(s => s.trim())
    : [];

  if (sentences.length === 0) return null;

  content = sentences.join("\n").slice(0, MAX_CONTENT_LENGTH);
  if (content.length < 20) return null;

  switch (jsonType) {
    case "judgment":
      // { doc_id, casenames, normalized_court, casetype, sentences[] }
      docId = data.doc_id || "";
      court = data.normalized_court || null;
      caseName = data.casenames || null;
      caseType = data.casetype || "civil";
      break;

    case "statute":
      // { statute_name, statute_type, statute_category, sentences[] }
      docId = `statute_${data.statute_name || "unknown"}_${data.effective_date || ""}`.replace(/\s+/g, "_");
      court = null;
      caseName = data.statute_name || null;
      caseType = null;
      break;

    case "adjudication":
      // { doc_id, document_type, decision_date, result, sentences[] }
      docId = data.doc_id || "";
      court = data.document_type || null;
      caseName = null;
      caseType = null;
      break;

    case "interpretation":
      // { doc_id, response_institute, response_date, title, sentences[] }
      docId = data.doc_id || "";
      court = data.response_institute || null;
      caseName = data.title || null;
      caseType = null;
      break;
  }

  if (!docId) return null;

  // 민사법 카테고리 접두사로 고유성 보장
  const fullDocId = `civil_${docType}_${docId}`;

  return {
    doc_id: fullDocId,
    court,
    case_name: caseName ? caseName.slice(0, 500) : null,
    case_type: caseType,
    category: "민사법",
    doc_type: docType,
    content,
  };
}

/**
 * ZIP에서 JSON 파일 추출 후 레코드 변환
 * unzip으로 tmpdir에 풀고, find -print0로 Buffer 경로 목록 생성, 각각 읽기
 */
function processZip(dir, zipName, docType, jsonType) {
  const zipPath = `${dir}/${zipName}`;

  try {
    execSync(`test -f "${zipPath}"`, { stdio: "pipe" });
  } catch {
    console.log(`  [SKIP] 파일 없음: ${zipName}`);
    return [];
  }

  const tmpDir = `${TMP_BASE}/${docType}_${Date.now()}`;

  try {
    execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}"`, { stdio: "pipe" });

    // unzip (한글 파일명 경고 무시)
    try {
      execSync(`unzip -o -q "${zipPath}" -d "${tmpDir}"`, {
        stdio: "pipe",
        maxBuffer: 1024 * 1024 * 100,
        timeout: 600000,
      });
    } catch {
      // unzip 경고에도 exit code != 0 반환
    }

    // find -print0로 Buffer 경로 목록 생성 (한글 깨짐 방지)
    let filePaths = [];
    try {
      const findBuf = execSync(`find "${tmpDir}" -name "*.json" -type f -print0 2>/dev/null`, {
        encoding: "buffer",
        maxBuffer: 1024 * 1024 * 200,
      });

      let start = 0;
      for (let i = 0; i < findBuf.length; i++) {
        if (findBuf[i] === 0) {
          if (i > start) {
            filePaths.push(findBuf.subarray(start, i));
          }
          start = i + 1;
        }
      }
      if (start < findBuf.length && findBuf.length > start) {
        filePaths.push(findBuf.subarray(start));
      }
    } catch {}

    console.log(`    ZIP 해제: ${filePaths.length.toLocaleString()}개 JSON 파일`);

    const records = [];
    let errCount = 0;

    for (const pathBuf of filePaths) {
      try {
        const raw = fs.readFileSync(pathBuf, "utf-8");
        const data = JSON.parse(raw);
        const record = jsonToRecord(data, docType, jsonType);
        if (record) {
          records.push(record);
        }
      } catch {
        errCount++;
      }
    }

    if (errCount > 0) console.log(`    파싱 에러: ${errCount}건`);

    // cleanup
    execSync(`rm -rf "${tmpDir}" 2>/dev/null || true`, { stdio: "pipe" });
    return records;
  } catch (e) {
    console.log(`  ZIP 처리 오류: ${e.message?.slice(0, 200)}`);
    execSync(`rm -rf "${tmpDir}" 2>/dev/null || true`, { stdio: "pipe" });
    return [];
  }
}

/**
 * 테이블 존재 확인
 */
async function checkTable() {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/legal_judgments?select=doc_id&limit=1`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return resp.ok;
}

/**
 * 기존 doc_id 목록 조회 (중복 방지)
 */
async function getExistingDocIds() {
  const ids = new Set();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/legal_judgments?select=doc_id&category=eq.${encodeURIComponent("민사법")}&offset=${offset}&limit=${limit}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (!resp.ok) break;
    const data = await resp.json();
    if (data.length === 0) break;

    for (const row of data) {
      ids.add(row.doc_id);
    }
    offset += limit;
    if (data.length < limit) break;
  }

  return ids;
}

/**
 * 배치 업로드 (100건 단위, 중복 무시)
 */
async function uploadBatch(rows) {
  const url = `${SUPABASE_URL}/rest/v1/legal_judgments`;
  let success = 0;
  const batchSize = 100;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    let retries = 3;

    while (retries > 0) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal,resolution=ignore-duplicates",
          },
          body: JSON.stringify(batch),
        });

        if (resp.ok) {
          success += batch.length;
          break;
        } else {
          const text = await resp.text();
          if (resp.status === 409 || text.includes("duplicate")) {
            // 개별 upsert
            for (const row of batch) {
              try {
                const r2 = await fetch(url, {
                  method: "POST",
                  headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    "Content-Type": "application/json",
                    Prefer: "return=minimal,resolution=ignore-duplicates",
                  },
                  body: JSON.stringify([row]),
                });
                if (r2.ok) success++;
              } catch {}
            }
            break;
          }
          console.log(`  업로드 에러 [${i}]: ${resp.status} - ${text.slice(0, 200)}`);
          retries--;
          if (retries > 0) await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e) {
        retries--;
        if (retries > 0) await new Promise(r => setTimeout(r, 2000));
        else console.log(`  업로드 실패 [${i}]: ${e.message?.slice(0, 100)}`);
      }
    }

    // 진행 표시 (500건마다)
    if ((i + batchSize) % 500 < batchSize) {
      console.log(`  업로드 진행: ${Math.min(i + batchSize, rows.length).toLocaleString()}/${rows.length.toLocaleString()} (성공: ${success.toLocaleString()})`);
    }
  }

  return success;
}

/**
 * DB에서 테이블 생성 시도 (pg 모듈 사용, DATABASE_URL 필요)
 */
async function tryCreateTableViaPg() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) return false;

  try {
    const pg = await import("pg");
    const pool = new pg.default.Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    await pool.query(CREATE_TABLE_SQL);
    console.log("  pg로 테이블 생성 완료!");
    await pool.end();
    return true;
  } catch (e) {
    console.log(`  pg 연결 실패: ${e.message?.slice(0, 100)}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const createTableOnly = args.includes("--create-table");
  const testLimit = args.includes("--test") ? 500 : 0;

  console.log("=".repeat(60));
  console.log("민사법 원천데이터 → Supabase legal_judgments");
  console.log("판결문 + 법령 + 심결례 + 유권해석 (Training + Validation)");
  if (dryRun) console.log("[DRY RUN] 데이터 추출만 수행, 업로드 없음");
  if (testLimit) console.log(`[TEST] 처음 ${testLimit}건만 업로드`);
  console.log("=".repeat(60));

  // --create-table: SQL만 출력
  if (createTableOnly) {
    console.log("\nlegal_judgments 테이블 생성 SQL:\n");
    console.log(CREATE_TABLE_SQL);
    return;
  }

  // 1. 테이블 존재 확인
  if (!dryRun) {
    let tableOk = await checkTable();

    if (!tableOk) {
      console.log("\nlegal_judgments 테이블이 존재하지 않습니다.");
      console.log("DATABASE_URL 환경변수로 직접 생성 시도...");

      const created = await tryCreateTableViaPg();
      if (created) {
        // PostgREST 캐시 갱신 대기
        console.log("  PostgREST 스키마 캐시 갱신 대기 (5초)...");
        await new Promise(r => setTimeout(r, 5000));
        tableOk = await checkTable();
      }

      if (!tableOk) {
        console.log("\n아래 SQL을 Supabase SQL Editor에서 실행하세요:");
        console.log("https://supabase.com/dashboard/project/eafcyvbgcedvhlwqotis/sql/new\n");
        console.log("=".repeat(60));
        console.log(CREATE_TABLE_SQL);
        console.log("=".repeat(60));
        console.log("\n테이블 생성 후 스크립트를 다시 실행하세요.");
        console.log("또는 --dry-run 플래그로 데이터 추출만 테스트할 수 있습니다.");
        process.exit(1);
      }
    }

    console.log("legal_judgments 테이블 확인 완료\n");
  }

  // 2. 기존 doc_id 가져오기
  const existingIds = new Set();
  if (!dryRun) {
    console.log("기존 민사법 데이터 확인 중...");
    const ids = await getExistingDocIds();
    for (const id of ids) existingIds.add(id);
    console.log(`  기존 민사법 레코드: ${existingIds.size.toLocaleString()}건\n`);
  }

  // tmp 디렉토리 초기화
  execSync(`rm -rf "${TMP_BASE}"; mkdir -p "${TMP_BASE}"`, { stdio: "pipe" });

  // 3. ZIP 파일 처리
  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalExtracted = 0;
  let buffer = [];
  let reachedLimit = false;

  for (const src of SOURCES) {
    if (reachedLimit) break;

    console.log(`\n[${src.docType}] ${src.zip}`);
    console.log(`  경로: ${src.dir}`);

    const records = processZip(src.dir, src.zip, src.docType, src.jsonType);
    totalExtracted += records.length;
    console.log(`  → ${records.length.toLocaleString()}건 추출`);

    if (dryRun) {
      // dry run: 샘플 1건 출력
      if (records.length > 0) {
        const sample = records[0];
        console.log(`  샘플 doc_id: ${sample.doc_id}`);
        console.log(`  샘플 court: ${sample.court || "(없음)"}`);
        console.log(`  샘플 case_name: ${sample.case_name || "(없음)"}`);
        console.log(`  샘플 content 길이: ${sample.content.length.toLocaleString()}자`);
      }
      continue;
    }

    // 중복 필터링
    const newRecords = records.filter(r => !existingIds.has(r.doc_id));
    const skipped = records.length - newRecords.length;
    totalSkipped += skipped;

    if (skipped > 0) console.log(`  중복 스킵: ${skipped.toLocaleString()}건`);
    console.log(`  신규: ${newRecords.length.toLocaleString()}건`);

    // 기존 ID에 추가
    for (const r of newRecords) existingIds.add(r.doc_id);

    buffer.push(...newRecords);

    // 테스트 모드: 제한 확인
    if (testLimit && buffer.length >= testLimit) {
      buffer = buffer.slice(0, testLimit);
      reachedLimit = true;
      console.log(`\n[TEST] ${testLimit}건 제한 도달`);
    }

    // 5000건 이상이면 중간 업로드 (메모리 관리)
    if (!reachedLimit && buffer.length >= 5000) {
      console.log(`\n  중간 업로드: ${buffer.length.toLocaleString()}건...`);
      const success = await uploadBatch(buffer);
      totalSuccess += success;
      console.log(`  중간 업로드 완료: ${success.toLocaleString()}건`);
      buffer = [];
    }
  }

  // 4. 남은 데이터 업로드
  if (!dryRun && buffer.length > 0) {
    console.log(`\n최종 업로드: ${buffer.length.toLocaleString()}건...`);
    const success = await uploadBatch(buffer);
    totalSuccess += success;
    console.log(`업로드 완료: ${success.toLocaleString()}건`);
  }

  // cleanup
  execSync(`rm -rf "${TMP_BASE}" 2>/dev/null || true`, { stdio: "pipe" });

  console.log("\n" + "=".repeat(60));
  console.log(`총 추출: ${totalExtracted.toLocaleString()}건`);
  if (!dryRun) {
    console.log(`총 업로드 성공: ${totalSuccess.toLocaleString()}건`);
    console.log(`총 중복 스킵: ${totalSkipped.toLocaleString()}건`);
  }
  console.log("=".repeat(60));
}

main().catch(console.error);
