/**
 * 151번 '금융, 법률 문서 기계독해 데이터' → Supabase legal_mrc 테이블
 *
 * ZIP 내 JSON → data[] → paragraphs[] → qas[] 순회하여
 * context + question + answer 추출 후 Supabase에 배치 업로드
 *
 * Node.js v20 (pg 모듈은 프로젝트 node_modules에서 사용)
 */

import { execSync } from 'child_process';
import pg from 'pg';

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS legal_mrc (
  id SERIAL PRIMARY KEY,
  doc_id TEXT,
  doc_title TEXT,
  doc_source TEXT,
  doc_class TEXT,
  qa_type TEXT,
  context TEXT,
  question TEXT,
  answer TEXT,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_legal_mrc_qa_type ON legal_mrc(qa_type);
CREATE INDEX IF NOT EXISTS idx_legal_mrc_doc_id ON legal_mrc(doc_id);
`;

const DATA_BASE = "/home/user/law-caddy/151.금융, 법률 문서 기계독해 데이터/01-1.정식개방데이터";

// qa_type 번호 → 한글 이름 매핑
const QA_TYPE_MAP = {
  1: "정답경계 추출형",
  2: "YesNo 단문형",
  3: "Table 정답 추출형",
  4: "다지선다형",
  5: "절차(방법)형",
};

// ZIP 파일 목록: [상대경로, qa_type 한글명]
const ZIP_FILES = [
  // Training
  ["Training/02.라벨링데이터/TL_1.정답경계 추출형.zip", "정답경계 추출형"],
  ["Training/02.라벨링데이터/TL_2.YesNo 단문형.zip", "YesNo 단문형"],
  ["Training/02.라벨링데이터/TL_3.Table 정답 추출형.zip", "Table 정답 추출형"],
  ["Training/02.라벨링데이터/TL_4.다지선다형.zip", "다지선다형"],
  ["Training/02.라벨링데이터/TL_5.절차(방법)형.zip", "절차(방법)형"],
  // Validation
  ["Validation/02.라벨링데이터/VL_1.정답경계 추출형.zip", "정답경계 추출형"],
  ["Validation/02.라벨링데이터/VL_2.YesNo 단문형.zip", "YesNo 단문형"],
  ["Validation/02.라벨링데이터/VL_3.Table 정답 추출형.zip", "Table 정답 추출형"],
  ["Validation/02.라벨링데이터/VL_4.다지선다형.zip", "다지선다형"],
  ["Validation/02.라벨링데이터/VL_5.절차(방법)형.zip", "절차(방법)형"],
];

/**
 * ZIP에서 JSON을 stdout으로 파이프하여 읽기 (단일 JSON 파일 ZIP)
 */
function readJsonFromZip(zipPath) {
  try {
    const buf = execSync(`unzip -p "${zipPath}"`, {
      maxBuffer: 300 * 1024 * 1024, // 300MB
      timeout: 120000,
    });
    // BOM 제거
    let raw = buf;
    if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
      raw = raw.subarray(3);
    }
    return JSON.parse(raw.toString("utf8"));
  } catch (e) {
    console.error(`  ZIP 읽기 실패: ${e.message?.slice(0, 150)}`);
    return null;
  }
}

/**
 * JSON 데이터에서 QA 레코드 추출
 */
function extractRecords(json, qaTypeName) {
  const records = [];
  const dataArr = json.data || [];

  for (const doc of dataArr) {
    const docId = doc.doc_id || "";
    const docTitle = doc.doc_title || "";
    const docSource = doc.doc_source || "";
    const docClass = doc.doc_class
      ? `${doc.doc_class.class || ""} / ${doc.doc_class.code || ""}`
      : "";

    for (const para of doc.paragraphs || []) {
      const context = (para.context || "").trim();
      if (!context) continue;

      for (const qa of para.qas || []) {
        const question = (qa.question || "").trim();
        if (!question) continue;

        // answer 텍스트 추출
        let answerText = "";
        if (qa.answer) {
          answerText = (qa.answer.text || "").trim();
          // 다지선다형: options가 있으면 답변에 포함
          if (qa.answer.options && Array.isArray(qa.answer.options)) {
            const opts = qa.answer.options.join(", ");
            answerText = `${answerText} [선택지: ${opts}]`;
          }
        }
        if (!answerText) continue;

        records.push({
          doc_id: docId.slice(0, 200),
          doc_title: docTitle.slice(0, 1000),
          doc_source: docSource.slice(0, 500),
          doc_class: docClass.slice(0, 500),
          qa_type: qaTypeName,
          context: context.slice(0, 10000),
          question: question.slice(0, 5000),
          answer: answerText.slice(0, 5000),
        });
      }
    }
  }

  return records;
}

/**
 * Supabase에 배치 업로드
 */
async function uploadToSupabase(rows) {
  const url = `${SUPABASE_URL}/rest/v1/legal_mrc`;
  let success = 0;
  const batchSize = 200;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    let retries = 3;

    while (retries > 0) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify(batch),
        });

        if (resp.ok) {
          success += batch.length;
          break;
        } else {
          const text = await resp.text();
          console.error(`  업로드 에러 [${i}]: ${resp.status} - ${text.slice(0, 200)}`);
          retries--;
          if (retries > 0) await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e) {
        retries--;
        if (retries > 0) await new Promise(r => setTimeout(r, 2000));
        else console.error(`  업로드 실패 [${i}]: ${e.message?.slice(0, 100)}`);
      }
    }

    // 진행 상황 출력 (5000건마다)
    if ((i + batchSize) % 5000 < batchSize) {
      console.log(`    업로드 진행: ${Math.min(i + batchSize, rows.length).toLocaleString()}/${rows.length.toLocaleString()}`);
    }
  }

  return success;
}

/**
 * Supabase Management API로 테이블 생성 시도
 */
async function createTableViaMgmtApi(accessToken) {
  const projectRef = "eafcyvbgcedvhlwqotis";
  const resp = await fetch(
    `https://api.supabase.com/platform/pg-meta/${projectRef}/query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: CREATE_TABLE_SQL }),
    }
  );
  if (resp.ok) {
    console.log("  Management API로 테이블 생성 완료");
    return true;
  }
  console.error(`  Management API 실패: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  return false;
}

/**
 * 테이블 존재 여부 확인 후 없으면 생성
 */
async function ensureTable() {
  // REST API로 테이블 존재 여부 확인
  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/legal_mrc?select=id&limit=1`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (checkResp.ok) {
    console.log("legal_mrc 테이블 확인 완료");
    return true;
  }

  console.log("legal_mrc 테이블이 없습니다. 생성 시도...");

  // 방법 1: DATABASE_URL로 직접 생성
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    console.log("  DATABASE_URL로 테이블 생성 시도...");
    const pool = new pg.Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await pool.query(CREATE_TABLE_SQL);
      console.log("  테이블 생성 완료");
      await pool.end();
      return true;
    } catch (e) {
      console.error("  테이블 생성 실패:", e.message);
      await pool.end().catch(() => {});
    }
  }

  // 방법 2: SUPABASE_ACCESS_TOKEN으로 Management API 사용
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (accessToken) {
    console.log("  SUPABASE_ACCESS_TOKEN으로 테이블 생성 시도...");
    const ok = await createTableViaMgmtApi(accessToken);
    if (ok) return true;
  }

  // 생성 불가 시 SQL 출력
  console.error("\nlegal_mrc 테이블을 생성할 수 없습니다.");
  console.error("아래 방법 중 하나를 선택하세요:\n");
  console.error("1) Supabase Dashboard > SQL Editor에서 아래 SQL 실행:");
  console.error("   https://supabase.com/dashboard/project/eafcyvbgcedvhlwqotis/sql/new\n");
  console.error("2) DATABASE_URL 환경변수 설정 후 재실행:");
  console.error("   DATABASE_URL=postgresql://... node scripts/11_load_151_mrc.mjs\n");
  console.error("3) SUPABASE_ACCESS_TOKEN 환경변수 설정 후 재실행:");
  console.error("   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/11_load_151_mrc.mjs\n");
  console.error("=".repeat(60));
  console.error(CREATE_TABLE_SQL);
  console.error("=".repeat(60));
  return false;
}

async function main() {
  console.log("=".repeat(60));
  console.log("151번 금융/법률 문서 기계독해 데이터 → Supabase legal_mrc");
  console.log("=".repeat(60));

  const tableReady = await ensureTable();
  if (!tableReady) {
    process.exit(1);
  }

  let grandTotal = 0;

  for (const [relPath, qaTypeName] of ZIP_FILES) {
    const zipPath = `${DATA_BASE}/${relPath}`;
    const label = relPath.includes("Training") ? "[Train]" : "[Valid]";
    console.log(`\n${label} ${qaTypeName} 처리중...`);

    const json = readJsonFromZip(zipPath);
    if (!json) {
      console.log(`  건너뜀`);
      continue;
    }

    const records = extractRecords(json, qaTypeName);
    console.log(`  추출: ${records.length.toLocaleString()}건`);

    if (records.length === 0) continue;

    const success = await uploadToSupabase(records);
    console.log(`  업로드 완료: ${success.toLocaleString()}건`);
    grandTotal += success;

    // JSON 파싱 후 메모리 해제 유도
    json.data = null;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`전체 업로드 완료: ${grandTotal.toLocaleString()}건`);
  console.log("=".repeat(60));
}

main().catch(console.error);
