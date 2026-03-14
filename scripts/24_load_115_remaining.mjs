#!/usr/bin/env node
/**
 * 115번 데이터 중 미로드 항목 전체 처리:
 * 1. Validation 라벨링데이터 (10 ZIPs) → cases 테이블
 * 2. Training 원천데이터 (18 ZIPs) → cases 테이블 (판례 원문)
 * 3. Validation 원천데이터 (15 ZIPs) → cases 테이블 (판례 원문)
 *
 * 중복 검사: case_number 기준 (on_conflict + ignore-duplicates)
 */

import { execSync } from "child_process";

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const PROJECT_DIR = "/home/user/law-caddy";
const BASE_115 = `${PROJECT_DIR}/115.법률-규정 텍스트 분석 데이터_고도화_상황에 따른 판례 데이터/3.개방데이터/1.데이터`;

// ── Part 1: Validation 라벨링데이터 (동일 포맷) ──

const VAL_LABEL_DIR = `${BASE_115}/Validation/02.라벨링데이터`;
const VAL_LABEL_MAP = {
  "VL_01.민사.zip": "민사",
  "VL_02.가사.zip": "가사",
  "VL_03.형사A(생활형).zip": "형사A(생활형)",
  "VL_04.형사B(일반형).zip": "형사B(일반형)",
  "VL_05.행정.zip": "행정",
  "VL_06.기업.zip": "기업",
  "VL_07.근로자.zip": "근로자",
  "VL_08.특허.저작권.zip": "특허/저작권",
  "VL_09.금융조세.zip": "금융/조세",
  "VL_10.개인정보.ICT.zip": "개인정보/ICT",
};

// ── Part 2+3: 원천데이터 (판례 원문) ──

const SOURCE_FILES = [];

// Training 원천데이터
const TRAIN_SRC_DIR = `${BASE_115}/Training/01.원천데이터`;
const trainFiles = [
  "TS_1.판례_01.민사.zip", "TS_1.판례_02.가사.zip", "TS_1.판례_03.형사A(생활형).zip",
  "TS_1.판례_04.형사B(일반형).zip", "TS_1.판례_05.행정.zip", "TS_1.판례_06.기업.zip",
  "TS_1.판례_07.근로자.zip", "TS_1.판례_08.특허.저작권.zip", "TS_1.판례_09.금융조세.zip",
  "TS_1.판례_10.개인정보.ICT.zip",
  "TS_2.심결례_01.민사.zip", "TS_2.심결례_04.형사B(일반형).zip",
  "TS_2.심결례_05.행정.zip", "TS_2.심결례_06.기업.zip", "TS_2.심결례_07.근로자.zip",
  "TS_2.심결례_08.특허.저작권.zip", "TS_2.심결례_09.금융조세.zip", "TS_2.심결례_10.개인정보.ICT.zip",
];
for (const f of trainFiles) SOURCE_FILES.push({ dir: TRAIN_SRC_DIR, zip: f });

// Validation 원천데이터
const VAL_SRC_DIR = `${BASE_115}/Validation/01.원천데이터`;
const valFiles = [
  "VS_1.판례_01.민사.zip", "VS_1.판례_02.가사.zip", "VS_1.판례_03.형사A(생활형).zip",
  "VS_1.판례_04.형사B(일반형).zip", "VS_1.판례_05.행정.zip", "VS_1.판례_06.기업.zip",
  "VS_1.판례_07.근로자.zip", "VS_1.판례_08.특허.저작권.zip", "VS_1.판례_09.금융조세.zip",
  "VS_1.판례_10.개인정보.ICT.zip",
  "VS_2.심결례_05.행정.zip", "VS_2.심결례_06.기업.zip", "VS_2.심결례_07.근로자.zip",
  "VS_2.심결례_09.금융조세.zip", "VS_2.심결례_10.개인정보.ICT.zip",
];
for (const f of valFiles) SOURCE_FILES.push({ dir: VAL_SRC_DIR, zip: f });

// ── 라벨링 변환 (기존 10_load_115_cases.mjs와 동일 로직) ──

function transformLabelRecord(data, category) {
  const info = data.info || {};
  const caseNo = info.caseNoID || info.caseNo || String(info.id || "");
  if (!caseNo) return null;

  const summaryParts = [];
  if (data.jdgmn) summaryParts.push(data.jdgmn);
  if (data.Summary && Array.isArray(data.Summary)) {
    for (const s of data.Summary) {
      if (s.summ_contxt) summaryParts.push(s.summ_contxt);
    }
  }
  const summary = summaryParts.join("\n\n").slice(0, 50000) || null;

  const statutes = [];
  const refRules = data.Reference_info?.reference_rules || null;
  if (refRules) {
    const parts = refRules.split(/[/,;]/).map((s) => s.trim()).filter(Boolean);
    statutes.push(...parts);
  }

  const fullTextParts = [];
  if (data.Summary && Array.isArray(data.Summary)) {
    for (const s of data.Summary) {
      if (s.summ_pass) fullTextParts.push(s.summ_pass);
    }
  }
  const fullText = fullTextParts.join("\n\n").slice(0, 100000) || null;

  const keyIssues = [];
  if (data.jdgmnInfo && Array.isArray(data.jdgmnInfo)) {
    for (const qa of data.jdgmnInfo) {
      if (qa.question) {
        keyIssues.push(qa.answer ? `${qa.question} → ${qa.answer}` : qa.question);
      }
    }
  }

  const className = data.Class_info?.class_name || category;

  return {
    case_number: `aihub115_${caseNo}`,
    court: info.courtNm || "알 수 없음",
    case_date: info.judmnAdjuDe || null,
    category: className,
    summary,
    key_issues: keyIssues.length > 0 ? keyIssues : null,
    statutes: statutes.length > 0 ? statutes : null,
    full_text: fullText,
    source: "aihub_115",
  };
}

// ── 원천데이터 변환 (판례 원문 포맷) ──

function transformSourceRecord(data) {
  const serialNo = data["판례일련번호"];
  const caseNo = data["사건번호"];
  if (!serialNo && !caseNo) return null;

  const uniqueId = caseNo ? `src115_${caseNo}` : `src115_serial_${serialNo}`;

  // 카테고리 추출
  const caseType = data["사건종류명"] || "";
  const caseName = data["사건명"] || "";

  // 요약: 판시사항 + 판결요지
  const summaryParts = [];
  if (data["판시사항"]) summaryParts.push(data["판시사항"]);
  if (data["판결요지"]) summaryParts.push(data["판결요지"]);
  const summary = summaryParts.join("\n\n").slice(0, 50000) || null;

  // full_text: 판례내용
  const fullText = (data["판례내용"] || "").slice(0, 100000) || null;
  if (!fullText && !summary) return null;

  // 참조조문 → statutes
  const statutes = [];
  if (data["참조조문"]) {
    const cleaned = data["참조조문"].replace(/【참조조문】\n?/, "");
    const parts = cleaned.split("\n").map(s => s.trim()).filter(Boolean);
    statutes.push(...parts);
  }

  // 키이슈
  const keyIssues = [];
  if (data["판시사항"]) {
    const cleaned = data["판시사항"].replace(/【판시사항】\n?/, "");
    const items = cleaned.split(/\[\d+\]/).filter(Boolean).map(s => s.trim());
    keyIssues.push(...items);
  }

  return {
    case_number: uniqueId,
    court: data["법원명"] || "알 수 없음",
    case_date: data["선고일자"] || null,
    category: caseType || caseName || "기타",
    summary,
    key_issues: keyIssues.length > 0 ? keyIssues : null,
    statutes: statutes.length > 0 ? statutes : null,
    full_text: fullText,
    source: "aihub_115_source",
  };
}

// ── ZIP 파싱 (unzip -p로 전체 출력 후 JSON 분리) ──

function extractJsonsFromZip(zipPath) {
  let rawText;
  try {
    rawText = execSync(`unzip -p "${zipPath}"`, {
      encoding: "utf-8",
      maxBuffer: 500 * 1024 * 1024,
      timeout: 600000,
    });
  } catch (e) {
    console.log(`  [ERROR] unzip 실패: ${e.message?.slice(0, 100)}`);
    return [];
  }

  const jsons = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { if (inString) escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        jsons.push(rawText.substring(start, i + 1));
        start = -1;
      }
    }
  }
  return jsons;
}

// ── 배치 업로드 ──

async function uploadBatch(rows) {
  const url = `${SUPABASE_URL}/rest/v1/cases?on_conflict=case_number`;
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
          if (resp.status === 409 || text.includes("duplicate") || text.includes("unique")) {
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
          if (retries > 0) await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (e) {
        retries--;
        if (retries > 0) await new Promise((r) => setTimeout(r, 2000));
        else console.log(`  업로드 실패 [${i}]: ${e.message?.slice(0, 100)}`);
      }
    }

    if ((i + batchSize) % 500 < batchSize) {
      console.log(`    진행: ${Math.min(i + batchSize, rows.length).toLocaleString()}/${rows.length.toLocaleString()} (성공: ${success.toLocaleString()})`);
    }
  }
  return success;
}

function isZipValid(zipPath) {
  try {
    execSync(`test -f "${zipPath}"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("115번 미로드 데이터 전체 로드");
  console.log("=".repeat(60));

  let grandSuccess = 0;
  let grandDup = 0;

  // ── Part 1: Validation 라벨링 (10 ZIPs) ──
  console.log("\n" + "─".repeat(40));
  console.log("Part 1: Validation 라벨링데이터 → cases");
  console.log("─".repeat(40));

  for (const [zipName, category] of Object.entries(VAL_LABEL_MAP)) {
    const zipPath = `${VAL_LABEL_DIR}/${zipName}`;
    console.log(`\n[${category}] ${zipName}`);

    if (!isZipValid(zipPath)) {
      console.log("  [SKIP] 파일 없음");
      continue;
    }

    console.log("  JSON 추출 중...");
    const jsonStrings = extractJsonsFromZip(zipPath);
    console.log(`  ${jsonStrings.length}개 JSON 추출`);

    const records = [];
    let parseErrors = 0;

    for (const jsonStr of jsonStrings) {
      try {
        const data = JSON.parse(jsonStr);
        const record = transformLabelRecord(data, category);
        if (record) records.push(record);
      } catch { parseErrors++; }
    }

    if (parseErrors > 0) console.log(`  파싱 에러: ${parseErrors}건`);
    if (records.length === 0) { console.log("  새 데이터 없음"); continue; }

    console.log(`  ${records.length}건 업로드...`);
    const success = await uploadBatch(records);
    grandSuccess += success;
    console.log(`  완료: ${success.toLocaleString()}건`);
  }

  // ── Part 2+3: 원천데이터 (33 ZIPs) ──
  console.log("\n" + "─".repeat(40));
  console.log("Part 2+3: Training+Validation 원천데이터 → cases");
  console.log("─".repeat(40));

  for (const { dir, zip } of SOURCE_FILES) {
    const zipPath = `${dir}/${zip}`;
    console.log(`\n[원천] ${zip}`);

    if (!isZipValid(zipPath)) {
      console.log("  [SKIP] 파일 없음");
      continue;
    }

    console.log("  JSON 추출 중...");
    const jsonStrings = extractJsonsFromZip(zipPath);
    console.log(`  ${jsonStrings.length}개 JSON 추출`);

    const records = [];
    let parseErrors = 0;

    for (const jsonStr of jsonStrings) {
      try {
        const data = JSON.parse(jsonStr);
        const record = transformSourceRecord(data);
        if (record) records.push(record);
      } catch { parseErrors++; }
    }

    if (parseErrors > 0) console.log(`  파싱 에러: ${parseErrors}건`);
    if (records.length === 0) { console.log("  새 데이터 없음"); continue; }

    console.log(`  ${records.length}건 업로드...`);
    const success = await uploadBatch(records);
    grandSuccess += success;
    console.log(`  완료: ${success.toLocaleString()}건`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`총 업로드: ${grandSuccess.toLocaleString()}건`);
  console.log("=".repeat(60));
}

main().catch(console.error);
