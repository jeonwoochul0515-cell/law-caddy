/**
 * 행정법 + 형사법 LLM 원천데이터(판결문, 법령, 결정례, 해석례) → Supabase legal_judgments 테이블
 * CSV 파일을 파싱하여 doc_id 기준으로 문장을 합쳐서 content로 저장
 * Node.js 내장 모듈만 사용 (v20+)
 *
 * 테이블 스키마: supabase/migrations/20260305091806_create_legal_judgments.sql 참조
 * 테이블이 없으면 SQL을 출력하고 종료합니다.
 */

import { execSync } from "child_process";

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const PROJECT_DIR = "/home/user/law-caddy";

// ZIP 파일 소스 목록
const SOURCES = [];

// 행정법
const ADMIN_BASE = `${PROJECT_DIR}/03.행정법 LLM 사전학습 및 Instruction Tuning 데이터/3.개방데이터/1.데이터`;
for (const [split, prefix] of [["Training", "TS"], ["Validation", "VS"]]) {
  const dir = `${ADMIN_BASE}/${split}/01.원천데이터`;
  SOURCES.push({ dir, zip: `${prefix}_판결문.zip`, docType: "판결문", category: "행정법" });
  SOURCES.push({ dir, zip: `${prefix}_법령.zip`, docType: "법령", category: "행정법" });
  SOURCES.push({ dir, zip: `${prefix}_결정례.zip`, docType: "결정례", category: "행정법" });
  SOURCES.push({ dir, zip: `${prefix}_해석례.zip`, docType: "해석례", category: "행정법" });
}

// 형사법
const CRIMINAL_BASE = `${PROJECT_DIR}/04.형사법 LLM 사전학습 및 Instruction Tuning 데이터/3.개방데이터/1.데이터`;
for (const [split, prefix] of [["Training", "TS"], ["Validation", "VS"]]) {
  const dir = `${CRIMINAL_BASE}/${split}/01.원천데이터`;
  SOURCES.push({ dir, zip: `${prefix}_판결문.zip`, docType: "판결문", category: "형사법" });
  SOURCES.push({ dir, zip: `${prefix}_법령.zip`, docType: "법령", category: "형사법" });
  SOURCES.push({ dir, zip: `${prefix}_결정례.zip`, docType: "결정례", category: "형사법" });
  SOURCES.push({ dir, zip: `${prefix}_해석례.zip`, docType: "해석례", category: "형사법" });
}

/**
 * CSV 파싱 — 쉼표 구분, 따옴표 필드 지원
 */
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row = [];
    while (i < len) {
      if (text[i] === '"') {
        i++;
        let field = "";
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            field += text[i];
            i++;
          }
        }
        row.push(field);
        if (i < len && text[i] === ',') i++;
        else if (i < len && (text[i] === '\n' || text[i] === '\r')) {
          if (text[i] === '\r' && i + 1 < len && text[i + 1] === '\n') i += 2;
          else i++;
          break;
        }
      } else {
        let field = "";
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i];
          i++;
        }
        row.push(field);
        if (i < len && text[i] === ',') i++;
        else if (i < len && (text[i] === '\n' || text[i] === '\r')) {
          if (text[i] === '\r' && i + 1 < len && text[i + 1] === '\n') i += 2;
          else i++;
          break;
        }
      }
    }
    if (row.length > 0 && row.some(f => f.length > 0)) {
      rows.push(row);
    }
  }
  return rows;
}

/**
 * CSV 텍스트 → 레코드 1건
 * 각 CSV 파일 = 1건의 문서 (모든 행이 동일 일련번호)
 *
 * 판결문 CSV: 판례일련번호, 구분(판시사항/판결요지/참조조문/판례내용), 문장번호, 내용
 * 법령 CSV: 법령일련번호, MST, 구분(조문/항/호), 문장번호, 내용
 * 결정례 CSV: 결정례일련번호, 구분(전문), 문장번호, 내용
 * 해석례 CSV: 해석례일련번호, 구분(질의요지/회답/이유), 문장번호, 내용
 */
function csvToRecord(csvText, docType, category) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return null;

  const header = rows[0];
  const contentIdx = header.findIndex(h => h.trim() === "내용");
  if (contentIdx < 0) return null;

  const gubunIdx = header.findIndex(h => h.trim() === "구분");

  let docId = "";
  const sectionMap = {}; // 구분별 문장 수집

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length <= contentIdx) continue;

    if (!docId && row[0]) docId = row[0].trim();

    const gubun = gubunIdx >= 0 && row[gubunIdx] ? row[gubunIdx].trim() : "내용";
    const content = row[contentIdx] ? row[contentIdx].trim() : "";
    if (content.length > 0) {
      if (!sectionMap[gubun]) sectionMap[gubun] = [];
      sectionMap[gubun].push(content);
    }
  }

  if (!docId) return null;

  // 전체 내용 합치기
  const allSentences = [];
  for (const [section, lines] of Object.entries(sectionMap)) {
    allSentences.push(...lines);
  }
  if (allSentences.length === 0) return null;

  // doc_id에 카테고리 접두사 추가
  const prefixMap = { "행정법": "admin", "형사법": "criminal" };
  const fullDocId = `${prefixMap[category]}_${docType}_${docId}`;

  // case_type 매핑
  const caseTypeMap = { "행정법": "admin", "형사법": "criminal" };

  // summary 추출: 판결문은 판결요지/판시사항, 해석례는 회답, 결정례는 첫 몇 문장
  let summary = null;
  if (docType === "판결문") {
    const yoji = sectionMap["판결요지"] || sectionMap["판시사항"];
    if (yoji) summary = yoji.join("\n").slice(0, 2000);
  } else if (docType === "해석례") {
    const answer = sectionMap["회답"];
    if (answer) summary = answer.join("\n").slice(0, 2000);
  } else if (docType === "결정례") {
    // 결정례: 전문 중 처음 500자를 요약으로
    const fullText = allSentences.join("\n");
    if (fullText.length > 100) summary = fullText.slice(0, 500);
  }

  return {
    doc_id: fullDocId,
    category,
    doc_type: docType,
    case_type: caseTypeMap[category],
    content: allSentences.join("\n").slice(0, 50000),
    summary: summary || null,
  };
}

/**
 * ZIP에서 파일 목록을 가져오고, 각 CSV를 파이프로 읽어 레코드 생성
 */
function processZip(dir, zipName, docType, category) {
  const zipPath = `${dir}/${zipName}`;

  try {
    execSync(`test -f "${zipPath}"`, { stdio: "pipe" });
  } catch {
    console.log(`  [SKIP] 파일 없음: ${zipName}`);
    return [];
  }

  let fileList;
  try {
    const raw = execSync(`unzip -Z1 "${zipPath}" 2>/dev/null`, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 50,
    });
    fileList = raw.split("\n").filter(f => f.endsWith(".csv"));
  } catch (e) {
    console.log(`  [ERROR] 파일 목록 실패: ${zipName} - ${e.message?.slice(0, 100)}`);
    return [];
  }

  console.log(`  ${category} ${docType} (${zipName}): ${fileList.length}개 CSV`);

  const records = [];
  let errCount = 0;

  for (const fileName of fileList) {
    try {
      let csvText;
      try {
        csvText = execSync(`unzip -p "${zipPath}" "${fileName}" 2>/dev/null`, {
          encoding: "utf-8",
          maxBuffer: 1024 * 1024 * 10,
        });
      } catch {
        // utf-8 실패 시 buffer로 읽고 latin1으로 디코딩
        try {
          const buf = execSync(`unzip -p "${zipPath}" "${fileName}" 2>/dev/null`, {
            encoding: "buffer",
            maxBuffer: 1024 * 1024 * 10,
          });
          csvText = buf.toString("latin1");
        } catch {
          errCount++;
          continue;
        }
      }

      const record = csvToRecord(csvText, docType, category);
      if (record) {
        records.push(record);
      }
    } catch {
      errCount++;
    }
  }

  if (errCount > 0) console.log(`    파싱 에러: ${errCount}건`);
  console.log(`    → ${records.length}건 추출`);

  return records;
}

const CREATE_TABLE_SQL = `
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
 * 테이블 존재 확인
 */
async function ensureTable() {
  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/legal_judgments?select=doc_id&limit=1`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (checkResp.ok) {
    console.log("legal_judgments 테이블 확인 완료");
    return true;
  }

  console.log("legal_judgments 테이블이 없습니다.");
  console.log("아래 SQL을 Supabase SQL Editor에서 실행하세요:");
  console.log("  https://supabase.com/dashboard/project/eafcyvbgcedvhlwqotis/sql/new\n");
  console.log("=".repeat(60));
  console.log(CREATE_TABLE_SQL);
  console.log("=".repeat(60));

  console.log("\n테이블 생성 후 스크립트를 다시 실행하세요.");
  console.log("또는 --force 플래그로 테이블 확인을 건너뛸 수 있습니다.");
  return false;
}

/**
 * 이미 존재하는 doc_id Set 가져오기
 */
async function getExistingDocIds(category) {
  const ids = new Set();
  let offset = 0;
  const limit = 1000;

  while (true) {
    try {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/legal_judgments?select=doc_id&category=eq.${encodeURIComponent(category)}&offset=${offset}&limit=${limit}`,
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
    } catch {
      break;
    }
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
            // 중복 충돌 — 개별 삽입
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

    // 진행 표시 (1000건마다)
    if ((i + batchSize) % 1000 < batchSize) {
      console.log(`  업로드 진행: ${Math.min(i + batchSize, rows.length).toLocaleString()}/${rows.length.toLocaleString()} (성공: ${success.toLocaleString()})`);
    }
  }

  return success;
}

async function main() {
  console.log("=".repeat(60));
  console.log("행정법 + 형사법 원천데이터 → Supabase legal_judgments");
  console.log("=".repeat(60));

  // 1. 테이블 확인 (--force 로 건너뛰기 가능)
  const forceMode = process.argv.includes("--force");
  if (!forceMode) {
    const tableOk = await ensureTable();
    if (!tableOk) return;
  } else {
    console.log("--force 모드: 테이블 존재 확인 건너뜀");
  }

  // 2. 기존 doc_id 조회 (중복 방지)
  console.log("\n기존 데이터 확인 중...");
  const existingAdmin = await getExistingDocIds("행정법");
  const existingCriminal = await getExistingDocIds("형사법");
  console.log(`  행정법 기존: ${existingAdmin.size}건, 형사법 기존: ${existingCriminal.size}건`);

  const existingIds = new Set([...existingAdmin, ...existingCriminal]);

  // 3. ZIP 파일 순회 처리
  let totalSuccess = 0;
  let totalSkipped = 0;
  let buffer = [];

  for (const src of SOURCES) {
    console.log(`\n[${src.category}] ${src.docType} — ${src.zip}`);

    const records = processZip(src.dir, src.zip, src.docType, src.category);

    // 중복 필터링
    const newRecords = records.filter(r => !existingIds.has(r.doc_id));
    const skipped = records.length - newRecords.length;
    totalSkipped += skipped;

    if (skipped > 0) console.log(`    중복 스킵: ${skipped}건`);

    buffer.push(...newRecords);
    for (const r of newRecords) existingIds.add(r.doc_id);

    // 5000건 이상이면 중간 업로드
    if (buffer.length >= 5000) {
      console.log(`\n  중간 업로드: ${buffer.length.toLocaleString()}건...`);
      const success = await uploadBatch(buffer);
      totalSuccess += success;
      console.log(`  중간 업로드 완료: ${success.toLocaleString()}건`);
      buffer = [];
    }
  }

  // 4. 남은 데이터 업로드
  if (buffer.length > 0) {
    console.log(`\n최종 업로드: ${buffer.length.toLocaleString()}건...`);
    const success = await uploadBatch(buffer);
    totalSuccess += success;
    console.log(`업로드 완료: ${success.toLocaleString()}건`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`총 업로드 성공: ${totalSuccess.toLocaleString()}건`);
  console.log(`총 중복 스킵: ${totalSkipped.toLocaleString()}건`);
  console.log("=".repeat(60));
}

main().catch(console.error);
