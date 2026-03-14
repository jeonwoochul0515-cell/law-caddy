#!/usr/bin/env node
/**
 * 115번 '법률-규정 텍스트 분석 데이터_고도화_상황에 따른 판례 데이터'
 * 라벨링 데이터(TL_*.zip) → Supabase cases 테이블
 *
 * Node.js v20+ 내장 모듈만 사용
 * 배치 업로드 100건 단위, 에러/손상 파일 스킵
 *
 * 사용법: node scripts/10_load_115_cases.mjs
 */

import { execSync } from "child_process";

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const PROJECT_DIR = "/home/user/law-caddy";
const BASE_DIR = `${PROJECT_DIR}/115.법률-규정 텍스트 분석 데이터_고도화_상황에 따른 판례 데이터/3.개방데이터/1.데이터/Training/02.라벨링데이터`;

const SOURCE_NAME = "aihub_115";

// 카테고리 매핑: zip 파일명 → 카테고리
const CATEGORY_MAP = {
  "TL_01.민사.zip": "민사",
  "TL_02.가사.zip": "가사",
  "TL_03.형사A(생활형).zip": "형사A(생활형)",
  "TL_04.형사B(일반형).zip": "형사B(일반형)",
  "TL_05.행정.zip": "행정",
  "TL_06.기업.zip": "기업",
  "TL_07.근로자.zip": "근로자",
  "TL_08.특허.저작권.zip": "특허/저작권",
  "TL_09.금융조세.zip": "금융/조세",
  "TL_10.개인정보.ICT.zip": "개인정보/ICT",
};

/**
 * JSON 데이터를 cases 테이블 행으로 변환
 */
function transformRecord(data, category) {
  const info = data.info || {};
  const caseNo = info.caseNoID || info.caseNo || String(info.id || "");
  if (!caseNo) return null;

  // 판결 요지(jdgmn) + QA를 summary로 합침
  const summaryParts = [];
  if (data.jdgmn) summaryParts.push(data.jdgmn);
  if (data.Summary && Array.isArray(data.Summary)) {
    for (const s of data.Summary) {
      if (s.summ_contxt) summaryParts.push(s.summ_contxt);
    }
  }
  const summary = summaryParts.join("\n\n").slice(0, 50000) || null;

  // 키워드 추출
  const keywords = [];
  if (data.keyword_tagg && Array.isArray(data.keyword_tagg)) {
    for (const kw of data.keyword_tagg) {
      if (kw.keyword) keywords.push(kw.keyword);
    }
  }

  // 관련 법조문
  const refRules = data.Reference_info?.reference_rules || null;
  const refCases = data.Reference_info?.reference_court_case || null;

  // 관련 법률을 statutes 배열로
  const statutes = [];
  if (refRules) {
    // "제840조 제6호 / 민법 제842조" 같은 형식을 분리
    const parts = refRules.split(/[/,;]/).map((s) => s.trim()).filter(Boolean);
    statutes.push(...parts);
  }

  // full_text: Summary의 전문 passage들
  const fullTextParts = [];
  if (data.Summary && Array.isArray(data.Summary)) {
    for (const s of data.Summary) {
      if (s.summ_pass) fullTextParts.push(s.summ_pass);
    }
  }
  const fullText = fullTextParts.join("\n\n").slice(0, 100000) || null;

  // key_issues: QA에서 추출
  const keyIssues = [];
  if (data.jdgmnInfo && Array.isArray(data.jdgmnInfo)) {
    for (const qa of data.jdgmnInfo) {
      if (qa.question) {
        const issue = qa.answer
          ? `${qa.question} → ${qa.answer}`
          : qa.question;
        keyIssues.push(issue);
      }
    }
  }

  // class_name, instance_name을 category로 활용
  const className = data.Class_info?.class_name || category;

  // 사건번호를 source 고유 ID로 사용
  const caseNumber = `aihub115_${caseNo}`;

  return {
    case_number: caseNumber,
    court: info.courtNm || "알 수 없음",
    case_date: info.judmnAdjuDe || null,
    category: className,
    summary,
    key_issues: keyIssues.length > 0 ? keyIssues : null,
    statutes: statutes.length > 0 ? statutes : null,
    full_text: fullText,
    raw_json: data,
    source: SOURCE_NAME,
  };
}

/**
 * ZIP에서 모든 JSON을 파이프로 추출하고 파싱
 * 파일명에 한국어 인코딩 문제가 있으므로 unzip -p로 전체 출력 후 JSON 분리
 */
function extractJsonsFromZip(zipPath) {
  let rawText;
  try {
    rawText = execSync(`unzip -p "${zipPath}"`, {
      encoding: "utf-8",
      maxBuffer: 500 * 1024 * 1024, // 500MB
    });
  } catch (e) {
    console.log(`  [ERROR] unzip 실패: ${e.message?.slice(0, 100)}`);
    return [];
  }

  // JSON 객체들을 분리 (최상위 { } 쌍 기준)
  const jsons = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        jsons.push(rawText.substring(start, i + 1));
        start = -1;
      }
    }
  }

  return jsons;
}

/**
 * 배치 업로드 (100건 단위)
 */
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
            // 중복 → 개별 upsert
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
                else {
                  const t2 = await r2.text();
                  if (!t2.includes("duplicate") && !t2.includes("unique")) {
                    console.log(`    개별 업로드 에러: ${r2.status} - ${t2.slice(0, 150)}`);
                  }
                }
              } catch {}
            }
            break;
          }
          console.log(`  업로드 에러 [${i}/${rows.length}]: ${resp.status} - ${text.slice(0, 200)}`);
          retries--;
          if (retries > 0) await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (e) {
        retries--;
        if (retries > 0) await new Promise((r) => setTimeout(r, 2000));
        else console.log(`  업로드 실패 [${i}]: ${e.message?.slice(0, 100)}`);
      }
    }

    // 진행 표시 (500건마다)
    if ((i + batchSize) % 500 < batchSize) {
      console.log(
        `    진행: ${Math.min(i + batchSize, rows.length).toLocaleString()}/${rows.length.toLocaleString()} (성공: ${success.toLocaleString()})`
      );
    }
  }

  return success;
}

/**
 * ZIP 유효성 검사
 */
function isValidZip(zipPath) {
  try {
    execSync(`unzip -t "${zipPath}" 2>&1 | tail -1`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("115번 판례 라벨링 데이터 → Supabase cases 테이블");
  console.log("=".repeat(60));

  // 1. 테이블 확인
  const checkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/cases?select=id&limit=1`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  if (!checkResp.ok) {
    console.error("cases 테이블 접근 실패:", await checkResp.text());
    process.exit(1);
  }
  console.log("cases 테이블 확인 완료\n");

  // 2. 기존 aihub_115 소스 데이터 확인
  console.log("기존 aihub_115 데이터 확인 중...");
  const existingIds = new Set();
  let offset = 0;
  while (true) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/cases?select=case_number&source=eq.${SOURCE_NAME}&offset=${offset}&limit=1000`,
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
    for (const row of data) existingIds.add(row.case_number);
    offset += 1000;
    if (data.length < 1000) break;
  }
  console.log(`  기존 데이터: ${existingIds.size}건\n`);

  // 3. ZIP 파일 순회
  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  const zipFiles = Object.keys(CATEGORY_MAP);

  for (const zipName of zipFiles) {
    const category = CATEGORY_MAP[zipName];
    const zipPath = `${BASE_DIR}/${zipName}`;
    console.log(`\n[${category}] ${zipName}`);

    // 파일 존재 확인
    try {
      execSync(`test -f "${zipPath}"`, { stdio: "pipe" });
    } catch {
      console.log("  [SKIP] 파일 없음");
      continue;
    }

    // ZIP 유효성 검사
    try {
      const result = execSync(`unzip -t "${zipPath}" 2>&1 | tail -1`, {
        encoding: "utf-8",
        timeout: 30000,
      });
      if (!result.includes("No errors")) {
        console.log(`  [SKIP] 손상된 ZIP: ${result.trim()}`);
        continue;
      }
    } catch (e) {
      console.log(`  [SKIP] ZIP 검증 실패: ${e.message?.slice(0, 100)}`);
      continue;
    }

    console.log("  ZIP 유효 — JSON 추출 중...");

    // JSON 추출
    const jsonStrings = extractJsonsFromZip(zipPath);
    console.log(`  ${jsonStrings.length}개 JSON 추출 완료`);

    // 변환
    const records = [];
    let parseErrors = 0;

    for (const jsonStr of jsonStrings) {
      try {
        const data = JSON.parse(jsonStr);
        const record = transformRecord(data, category);
        if (record) {
          if (existingIds.has(record.case_number)) {
            totalSkipped++;
          } else {
            records.push(record);
            existingIds.add(record.case_number);
          }
        }
      } catch {
        parseErrors++;
      }
    }

    if (parseErrors > 0) {
      console.log(`  JSON 파싱 에러: ${parseErrors}건`);
      totalErrors += parseErrors;
    }

    if (totalSkipped > 0) {
      console.log(`  중복 스킵: ${totalSkipped}건`);
    }

    if (records.length === 0) {
      console.log("  새 데이터 없음 — 스킵");
      continue;
    }

    console.log(`  ${records.length}건 업로드 시작...`);
    const success = await uploadBatch(records);
    totalSuccess += success;
    console.log(`  업로드 완료: ${success.toLocaleString()}건`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`총 업로드 성공: ${totalSuccess.toLocaleString()}건`);
  console.log(`총 중복 스킵: ${totalSkipped.toLocaleString()}건`);
  console.log(`총 파싱 에러: ${totalErrors.toLocaleString()}건`);
  console.log("=".repeat(60));
}

main().catch(console.error);
