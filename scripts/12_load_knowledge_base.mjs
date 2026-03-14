#!/usr/bin/env node
/**
 * 법률 지식베이스 데이터 → Supabase 적재
 *
 * 처리 대상:
 *   1. 법령용어(Json).zip        → legal_terms 테이블
 *   2. 법령지식_교통사고(Json).zip   → legal_knowledge 테이블
 *   3. 법령지식_창업인허가(Json).zip  → legal_knowledge 테이블
 *   4. 법령지식_층간소음(Json).zip   → legal_knowledge 테이블
 *   5. 법령지식_관련판례(Json).zip   → cases 테이블 (기존 판례 테이블)
 *   6. 법률데이터_판례.zip (N-triple) → cases 테이블
 *   7. 법률데이터_법령.zip (N-triple) → legal_knowledge 테이블
 *   8. 법률데이터_생활법령.zip (N-triple) → legal_knowledge 테이블
 *
 * Node.js v20+ 내장 모듈만 사용
 * 배치 업로드 100건 단위, 에러 핸들링 철저
 *
 * 사용법: node scripts/12_load_knowledge_base.mjs
 */

import { execSync } from "child_process";
import fs from "fs";
import { createReadStream } from "fs";
import path from "path";

// ============================================================
// 설정
// ============================================================

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const KB_DIR = "/home/user/law-caddy/법률 지식베이스";
const TMP_DIR = "/tmp/kb_work";
const BATCH_SIZE = 100;

// RDF/JSON 프로퍼티 키 약어
const RDF = {
  type: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  label: "http://www.w3.org/2000/01/rdf-schema#label",
  name: "http://www.aihub.or.kr/kb/law/name",
  related: "http://www.aihub.or.kr/kb/law/related",
  synonym: "http://www.aihub.or.kr/kb/law/synonym",
  hypernym: "http://www.aihub.or.kr/kb/law/hypernym",
  homonym: "http://www.aihub.or.kr/kb/law/homonym",
  fullText: "http://www.aihub.or.kr/kb/law/fullText",
  fullName: "http://www.aihub.or.kr/kb/law/fullName",
  statuteName: "http://www.aihub.or.kr/kb/law/statuteName",
  articleName: "http://www.aihub.or.kr/kb/law/articleName",
  paragraphName: "http://www.aihub.or.kr/kb/law/paragraphName",
  containingWord: "http://www.aihub.or.kr/kb/law/containingWord",
  citations: "http://www.aihub.or.kr/kb/law/citations",
  // 판례 관련
  caseNumber: "http://www.aihub.or.kr/kb/law/caseNumber",
  courtName: "http://www.aihub.or.kr/kb/law/courtName",
  sentenceDate: "http://www.aihub.or.kr/kb/law/sentenceDate",
  caseName: "http://www.aihub.or.kr/kb/law/caseName",
  caseType: "http://www.aihub.or.kr/kb/law/caseType",
  judgementType: "http://www.aihub.or.kr/kb/law/judgementType",
  judgementAbstract: "http://www.aihub.or.kr/kb/law/judgementAbstract",
  judgementNote: "http://www.aihub.or.kr/kb/law/judgementNote",
  precedentNumber: "http://www.aihub.or.kr/kb/law/precedentNumber",
  precedentText: "http://www.aihub.or.kr/kb/law/precedentText",
  refArticle: "http://www.aihub.or.kr/kb/law/refArticle",
  refPrecedent: "http://www.aihub.or.kr/kb/law/refPrecedent",
  sentence: "http://www.aihub.or.kr/kb/law/sentence",
};

// ============================================================
// 테이블 생성 SQL
// ============================================================

const SQL_FILE = "/home/user/law-caddy/scripts/12_create_knowledge_tables.sql";

const CREATE_TABLES_SQL = fs.existsSync(SQL_FILE)
  ? fs.readFileSync(SQL_FILE, "utf-8")
  : `-- SQL 파일을 찾을 수 없습니다: ${SQL_FILE}`;

/**
 * psql을 사용해서 테이블 생성 시도
 * Supabase Pooler 또는 Direct 연결
 */
async function tryCreateTablesWithPsql() {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD;
  const dbUrl = process.env.DATABASE_URL;

  if (!dbPassword && !dbUrl) {
    return false;
  }

  let connectionString = dbUrl;
  if (!connectionString && dbPassword) {
    const regions = ["ap-northeast-2", "us-east-1", "ap-southeast-1"];
    for (const region of regions) {
      connectionString = `postgresql://postgres.eafcyvbgcedvhlwqotis:${dbPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`;
      try {
        execSync(`PGPASSWORD="${dbPassword}" psql "${connectionString}" -c "SELECT 1" 2>&1`, {
          timeout: 10000,
        });
        break;
      } catch {
        connectionString = null;
      }
    }
  }

  if (!connectionString) return false;

  try {
    const sqlStatements = CREATE_TABLES_SQL.split(";")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));

    for (const stmt of sqlStatements) {
      try {
        execSync(
          `psql "${connectionString}" -c "${stmt.replace(/"/g, '\\"')}" 2>&1`,
          { timeout: 30000 }
        );
      } catch (e) {
        // 테이블 이미 존재하는 에러는 무시
        const msg = e.message || "";
        if (!msg.includes("already exists")) {
          console.log(`  SQL 실행 경고: ${msg.slice(0, 100)}`);
        }
      }
    }
    return true;
  } catch (e) {
    console.log(`  psql 실행 실패: ${e.message?.slice(0, 100)}`);
    return false;
  }
}

// ============================================================
// 유틸리티 함수
// ============================================================

/** RDF/JSON 엔트리에서 리터럴 값 추출 (첫 번째) */
function getLiteral(entry, prop) {
  const arr = entry[prop];
  if (!arr || arr.length === 0) return null;
  return arr[0].value || null;
}

/** RDF/JSON 엔트리에서 모든 리터럴 값 추출 */
function getAllLiterals(entry, prop) {
  const arr = entry[prop];
  if (!arr || arr.length === 0) return [];
  return arr.filter((v) => v.type === "literal").map((v) => v.value);
}

/** RDF/JSON 엔트리에서 URI 값 추출 후 마지막 경로 디코딩 */
function getUriNames(entry, prop) {
  const arr = entry[prop];
  if (!arr || arr.length === 0) return [];
  return arr
    .filter((v) => v.type === "uri")
    .map((v) => {
      const parts = v.value.split("/");
      try {
        return decodeURIComponent(parts[parts.length - 1]);
      } catch {
        return parts[parts.length - 1];
      }
    });
}

/** RDF URI에서 타입 이름 추출 */
function getTypeName(entry) {
  const typeArr = entry[RDF.type];
  if (!typeArr || typeArr.length === 0) return null;
  const uri = typeArr[0].value;
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

/** 배치 업로드 (재시도 + 중복 무시) */
async function uploadBatch(table, rows, conflictColumn, batchOverride) {
  const conflictParam = conflictColumn ? `?on_conflict=${conflictColumn}` : "";
  const url = `${SUPABASE_URL}/rest/v1/${table}${conflictParam}`;
  let success = 0;
  const bSize = batchOverride || BATCH_SIZE;

  for (let i = 0; i < rows.length; i += bSize) {
    const batch = rows.slice(i, i + bSize);
    let retries = 3;

    while (retries > 0) {
      try {
        const prefer = conflictColumn
          ? "return=minimal,resolution=ignore-duplicates"
          : "return=minimal";
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: prefer,
          },
          body: JSON.stringify(batch),
        });

        if (resp.ok) {
          success += batch.length;
          break;
        }

        const text = await resp.text();
        if (
          resp.status === 409 ||
          text.includes("duplicate") ||
          text.includes("unique")
        ) {
          // 중복 에러 → 개별 업로드
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
                if (
                  !t2.includes("duplicate") &&
                  !t2.includes("unique")
                ) {
                  console.log(
                    `    개별 업로드 에러: ${r2.status} - ${t2.slice(0, 150)}`
                  );
                }
              }
            } catch {}
          }
          break;
        }

        console.log(
          `  업로드 에러 [${i}/${rows.length}]: ${resp.status} - ${text.slice(0, 200)}`
        );
        retries--;
        if (retries > 0) await sleep(2000);
      } catch (e) {
        retries--;
        if (retries > 0) await sleep(2000);
        else
          console.log(
            `  업로드 실패 [${i}]: ${e.message?.slice(0, 100)}`
          );
      }
    }

    // 진행 표시 (500건마다)
    if ((i + bSize) % 500 < bSize) {
      process.stdout.write(
        `\r    진행: ${Math.min(i + bSize, rows.length).toLocaleString()}/${rows.length.toLocaleString()} (성공: ${success.toLocaleString()})`
      );
    }
  }

  console.log(
    `\r    완료: ${rows.length.toLocaleString()}건 중 ${success.toLocaleString()}건 성공`
  );
  return success;
}

/** 스트리밍 배치 업로드 (대용량 파일용 - 개별 삽입으로 타임아웃 방지) */
async function uploadBatchStreaming(table, batch, conflictColumn) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  let success = 0;

  // 개별 삽입 (cases 테이블이 너무 커서 배치 on_conflict가 타임아웃됨)
  for (const row of batch) {
    let retries = 2;
    while (retries > 0) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(row),
        });

        if (resp.ok) {
          success++;
          break;
        }

        const text = await resp.text();
        if (
          resp.status === 409 ||
          text.includes("duplicate") ||
          text.includes("unique")
        ) {
          // 중복 → 스킵 (이미 존재)
          break;
        }

        if (resp.status === 500 && text.includes("57014")) {
          // 타임아웃 → full_text 제거 후 재시도
          const slimRow = { ...row, full_text: row.full_text?.slice(0, 5000) || null };
          const r2 = await fetch(url, {
            method: "POST",
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify(slimRow),
          });
          if (r2.ok) success++;
          break;
        }

        retries--;
        if (retries > 0) await sleep(1000);
      } catch (e) {
        retries--;
        if (retries > 0) await sleep(1000);
      }
    }
  }

  return success;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 테이블 존재 여부 확인 */
async function tableExists(table) {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id&limit=0`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

/** 테이블 행 수 조회 */
async function countTable(table) {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=id&limit=0`,
      {
        method: "HEAD",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "count=exact",
        },
      }
    );
    const range = resp.headers.get("content-range");
    if (range) {
      const match = range.match(/\/(\d+)/);
      return match ? parseInt(match[1]) : -1;
    }
    return -1;
  } catch {
    return -1;
  }
}

// ============================================================
// 1. 법령용어 처리
// ============================================================

async function loadLegalTerms() {
  console.log("\n" + "=".repeat(60));
  console.log("1. 법령용어 → legal_terms 테이블");
  console.log("=".repeat(60));

  const zipPath = `${KB_DIR}/법령용어/법령용어(Json).zip`;
  if (!fs.existsSync(zipPath)) {
    console.log("  [SKIP] 파일 없음:", zipPath);
    return;
  }

  // legal_terms 테이블 확인
  if (!(await tableExists("legal_terms"))) {
    console.log("  [ERROR] legal_terms 테이블이 존재하지 않습니다.");
    return;
  }

  console.log("  ZIP 추출 및 파싱 중... (266MB, 잠시 대기)");

  let rawJson;
  try {
    rawJson = execSync(`unzip -p "${zipPath}"`, {
      encoding: "utf-8",
      maxBuffer: 500 * 1024 * 1024,
    });
  } catch (e) {
    console.log(`  [ERROR] unzip 실패: ${e.message?.slice(0, 100)}`);
    return;
  }

  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (e) {
    console.log(`  [ERROR] JSON 파싱 실패: ${e.message?.slice(0, 100)}`);
    return;
  }
  rawJson = null; // 메모리 해제

  const entries = Object.entries(data);
  console.log(`  총 엔트리: ${entries.length.toLocaleString()}건`);

  // Term 엔트리만 필터링 → legal_terms 형식으로 변환
  const rows = [];
  let skipped = 0;
  for (const [uri, entry] of entries) {
    const typeName = getTypeName(entry);
    if (typeName && typeName !== "Term") continue;

    const termName = getLiteral(entry, RDF.name);
    if (!termName) {
      skipped++;
      continue;
    }

    const related = getUriNames(entry, RDF.related);
    const synonyms = getUriNames(entry, RDF.synonym);
    const hypernyms = getUriNames(entry, RDF.hypernym);

    // 정의(definition) 생성
    const defParts = [];
    if (synonyms.length > 0) defParts.push(`동의어: ${synonyms.join(", ")}`);
    if (hypernyms.length > 0) defParts.push(`상위어: ${hypernyms.join(", ")}`);
    if (related.length > 0) defParts.push(`관련용어: ${related.join(", ")}`);

    // legal_terms 테이블 스키마: term, related_terms, synonyms, hypernyms, definition, source_uri
    rows.push({
      term: termName,
      related_terms: related.length > 0 ? related : null,
      synonyms: synonyms.length > 0 ? synonyms : null,
      hypernyms: hypernyms.length > 0 ? hypernyms : null,
      definition: defParts.join("\n") || null,
      source_uri: uri,
    });
  }

  data = null; // 메모리 해제
  console.log(`  변환 완료: ${rows.length.toLocaleString()}건 (스킵: ${skipped}건)`);

  if (rows.length === 0) {
    console.log("  새 데이터 없음");
    return;
  }

  // legal_terms에는 UNIQUE(term) 제약이 있으므로 중복 무시
  const success = await uploadBatch("legal_terms", rows, "term");
  console.log(`  법령용어 업로드 완료: ${success.toLocaleString()}건`);
}

// ============================================================
// 2. 법령지식 (교통사고, 창업인허가, 층간소음) 처리
// ============================================================

async function loadKnowledgeSmall() {
  console.log("\n" + "=".repeat(60));
  console.log("2. 법령지식 (교통사고, 창업인허가, 층간소음) → legal_knowledge");
  console.log("=".repeat(60));

  if (!(await tableExists("legal_knowledge"))) {
    console.log("  [ERROR] legal_knowledge 테이블이 존재하지 않습니다.");
    return;
  }

  const zipFiles = [
    {
      zip: `${KB_DIR}/법령지식/법령지식_교통사고(Json).zip`,
      category: "교통사고",
    },
    {
      zip: `${KB_DIR}/법령지식/법령지식_창업인허가(Json).zip`,
      category: "창업인허가",
    },
    {
      zip: `${KB_DIR}/법령지식/법령지식_층간소음(Json).zip`,
      category: "층간소음",
    },
  ];

  let totalSuccess = 0;

  for (const { zip: zipPath, category } of zipFiles) {
    console.log(`\n  [${category}] ${path.basename(zipPath)}`);

    if (!fs.existsSync(zipPath)) {
      console.log("    [SKIP] 파일 없음");
      continue;
    }

    let rawJson;
    try {
      rawJson = execSync(`unzip -p "${zipPath}"`, {
        encoding: "utf-8",
        maxBuffer: 100 * 1024 * 1024,
      });
    } catch (e) {
      console.log(`    [ERROR] unzip 실패: ${e.message?.slice(0, 100)}`);
      continue;
    }

    let data;
    try {
      data = JSON.parse(rawJson);
    } catch (e) {
      console.log(`    [ERROR] JSON 파싱 실패: ${e.message?.slice(0, 100)}`);
      continue;
    }
    rawJson = null;

    const entries = Object.entries(data);
    console.log(`    총 엔트리: ${entries.length.toLocaleString()}건`);

    const rows = [];
    for (const [uri, entry] of entries) {
      const typeName = getTypeName(entry);

      // Article, Paragraph, Statute만 처리 (owl 메타데이터 스킵)
      if (!typeName || typeName.startsWith("owl#") || typeName === "Ontology") {
        continue;
      }

      const label = getLiteral(entry, RDF.label);
      const fullText = getLiteral(entry, RDF.fullText);
      const fullName = getLiteral(entry, RDF.fullName);
      const statuteName = getLiteral(entry, RDF.statuteName);
      const articleName = getLiteral(entry, RDF.articleName);
      const citationsRaw = getLiteral(entry, RDF.citations);

      const title = fullName || label || uri.split("/").pop();
      if (!title) continue;

      const contentParts = [];
      if (fullText) contentParts.push(fullText);
      if (citationsRaw) contentParts.push(`관련 판례: ${decodeURIComponent(citationsRaw)}`);
      const content = contentParts.join("\n\n") || null;

      const relatedLaws = [];
      if (statuteName) relatedLaws.push(statuteName);

      // legal_knowledge 테이블 스키마:
      // category, title, content, source, source_uri, statute_name, article_name, related_laws, entry_type
      rows.push({
        category: category,
        title: title.slice(0, 1000),
        content: content?.slice(0, 50000) || null,
        source: `kb_${category}`,
        source_uri: uri,
        statute_name: statuteName || null,
        article_name: articleName || null,
        related_laws: relatedLaws.length > 0 ? relatedLaws : null,
        entry_type: typeName,
      });
    }

    data = null;
    console.log(`    변환: ${rows.length.toLocaleString()}건`);

    if (rows.length > 0) {
      // legal_knowledge has UNIQUE(source, source_uri)
      const success = await uploadBatch("legal_knowledge", rows, "source,source_uri");
      totalSuccess += success;
    }
  }

  console.log(`\n  법령지식(소규모) 총 업로드: ${totalSuccess.toLocaleString()}건`);
}

// ============================================================
// 3. 법령지식_관련판례 (196MB zip → 892MB JSON) → cases 테이블
// ============================================================

async function loadRelatedPrecedents() {
  console.log("\n" + "=".repeat(60));
  console.log("3. 법령지식_관련판례 → cases 테이블");
  console.log("=".repeat(60));

  const zipPath = `${KB_DIR}/법령지식/법령지식_관련판례(Json).zip`;
  if (!fs.existsSync(zipPath)) {
    console.log("  [SKIP] 파일 없음:", zipPath);
    return;
  }

  if (!(await tableExists("cases"))) {
    console.log("  [ERROR] cases 테이블이 존재하지 않습니다.");
    return;
  }

  // 기존 kb_precedent 소스 데이터 확인
  const existingIds = new Set();
  let offset = 0;
  console.log("  기존 kb_precedent 데이터 확인 중...");
  while (true) {
    try {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/cases?select=case_number&source=eq.kb_precedent&offset=${offset}&limit=1000`,
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
    } catch {
      break;
    }
  }
  console.log(`  기존 데이터: ${existingIds.size}건`);

  // 892MB JSON을 unzip -p로 추출하고 청크 단위로 파싱
  console.log("  892MB JSON 추출 및 파싱 시작...");
  console.log("  (메모리 절약: 청크 단위 읽기 + 즉시 업로드)");

  const { spawn } = await import("child_process");
  const proc = spawn("unzip", ["-p", zipPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let totalParsed = 0;
  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let bytesProcessed = 0;

  // 스트리밍 JSON 파서 상태
  let state = "top";
  let gEscape = false;
  let currentKeyBuf = "";
  let currentValueBuf = "";
  let valueDepthLocal = 0;
  let vInString = false;
  let vEscape = false;

  // 파싱된 레코드를 배치로 모음
  const pendingRows = [];

  function convertPrecedentEntry(uri, valueStr) {
    let entry;
    try {
      entry = JSON.parse(valueStr);
    } catch {
      totalErrors++;
      return null;
    }
    totalParsed++;

    const typeName = getTypeName(entry);
    if (typeName !== "Precedent") return null;

    const precedentNumber = getLiteral(entry, RDF.precedentNumber);
    const caseNum = getLiteral(entry, RDF.caseNumber);
    const caseNumber = `kb_prec_${precedentNumber || caseNum || totalParsed}`;

    if (existingIds.has(caseNumber)) {
      totalSkipped++;
      return null;
    }

    const courtName = getLiteral(entry, RDF.courtName);
    const sentenceDate = getLiteral(entry, RDF.sentenceDate);
    const caseName = getLiteral(entry, RDF.caseName);
    const caseType = getLiteral(entry, RDF.caseType);
    const judgementAbstract = getLiteral(entry, RDF.judgementAbstract);
    const judgementNote = getLiteral(entry, RDF.judgementNote);
    const precedentText = getLiteral(entry, RDF.precedentText);
    const refArticle = getLiteral(entry, RDF.refArticle);

    const summaryParts = [];
    if (judgementAbstract) summaryParts.push(judgementAbstract);
    if (judgementNote) summaryParts.push(judgementNote);
    const summary = summaryParts.join("\n\n").slice(0, 50000) || null;

    const statutes = [];
    if (refArticle) {
      const parts = refArticle.split(/[,;/]/).map((s) => s.trim()).filter(Boolean);
      statutes.push(...parts);
    }

    let caseDate = null;
    if (sentenceDate) {
      const cleaned = sentenceDate.replace(/\./g, "-");
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleaned)) {
        caseDate = cleaned;
      }
    }

    existingIds.add(caseNumber);
    return {
      case_number: caseNumber,
      court: courtName || "미상",
      case_date: caseDate,
      category: caseType || "미분류",
      summary,
      key_issues: null,
      statutes: statutes.length > 0 ? statutes : null,
      full_text: precedentText?.slice(0, 15000) || null,
      source: "kb_precedent",
    };
  }

  function processChunk(chunk) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      bytesProcessed++;

      switch (state) {
        case "top":
          if (ch === "{") state = "seekKey";
          break;
        case "seekKey":
          if (ch === '"') { currentKeyBuf = ""; state = "key"; }
          else if (ch === "}") state = "done";
          break;
        case "key":
          if (ch === '"' && !gEscape) state = "afterKey";
          else if (ch === "\\" && !gEscape) { gEscape = true; currentKeyBuf += ch; }
          else { gEscape = false; currentKeyBuf += ch; }
          break;
        case "afterKey":
          gEscape = false;
          if (ch === ":") state = "seekValue";
          break;
        case "seekValue":
          if (ch === "{") {
            currentValueBuf = "{"; valueDepthLocal = 1;
            vInString = false; vEscape = false; state = "value";
          }
          break;
        case "value":
          currentValueBuf += ch;
          if (vEscape) { vEscape = false; break; }
          if (ch === "\\" && vInString) { vEscape = true; break; }
          if (ch === '"') { vInString = !vInString; break; }
          if (!vInString) {
            if (ch === "{") valueDepthLocal++;
            else if (ch === "}") {
              valueDepthLocal--;
              if (valueDepthLocal === 0) {
                const row = convertPrecedentEntry(currentKeyBuf, currentValueBuf);
                if (row) pendingRows.push(row);
                currentKeyBuf = ""; currentValueBuf = ""; state = "seekNext";
              }
            }
          }
          break;
        case "seekNext":
          if (ch === ",") state = "seekKey";
          else if (ch === "}") state = "done";
          break;
        case "done": break;
      }
    }
  }

  // 데이터 수집 단계: 전체 스트림 읽기
  await new Promise((resolve) => {
    let lastProgressMB = 0;

    proc.stdout.on("data", (chunk) => {
      processChunk(chunk.toString("utf-8"));

      const mb = Math.floor(bytesProcessed / (10 * 1024 * 1024));
      if (mb > lastProgressMB) {
        lastProgressMB = mb;
        process.stdout.write(
          `\r  파싱: ${(bytesProcessed / 1024 / 1024).toFixed(0)}MB, 판례: ${totalParsed.toLocaleString()}, 신규: ${pendingRows.length.toLocaleString()}, 스킵: ${totalSkipped.toLocaleString()}`
        );
      }
    });

    proc.stderr.on("data", () => {});
    proc.on("close", () => resolve());
  });

  console.log(`\n  파싱 완료: 총 ${totalParsed.toLocaleString()}건, 신규 ${pendingRows.length.toLocaleString()}건, 스킵 ${totalSkipped.toLocaleString()}건`);

  // 업로드 단계: 5건씩 배치 삽입 + 병렬 3개 동시 요청
  const BATCH = 5;
  const CONCURRENCY = 3;
  if (pendingRows.length > 0) {
    console.log(`  업로드 시작 (${pendingRows.length.toLocaleString()}건, 배치=${BATCH}, 병렬=${CONCURRENCY})...`);
    const url = `${SUPABASE_URL}/rest/v1/cases`;

    async function uploadSmallBatch(batch, batchIdx) {
      let retries = 2;
      while (retries > 0) {
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify(batch),
          });

          if (resp.ok) {
            return { success: batch.length, skipped: 0, errors: 0 };
          }

          const text = await resp.text();

          // 배치 중 일부가 중복인 경우 → 개별 삽입으로 폴백
          if (text.includes("duplicate") || text.includes("unique") || resp.status === 409) {
            let s = 0, sk = 0, e = 0;
            for (const row of batch) {
              try {
                const r2 = await fetch(url, {
                  method: "POST",
                  headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    "Content-Type": "application/json",
                    Prefer: "return=minimal",
                  },
                  body: JSON.stringify(row),
                });
                if (r2.ok) s++;
                else {
                  const t2 = await r2.text();
                  if (t2.includes("duplicate") || t2.includes("unique") || r2.status === 409) sk++;
                  else e++;
                }
              } catch { e++; }
            }
            return { success: s, skipped: sk, errors: e };
          }

          if (resp.status === 500 && text.includes("57014")) {
            // 타임아웃 → full_text 축소 후 재시도
            for (const row of batch) {
              row.full_text = row.full_text?.slice(0, 3000) || null;
              row.summary = row.summary?.slice(0, 5000) || null;
            }
            retries--;
            if (retries <= 0) return { success: 0, skipped: 0, errors: batch.length };
            continue;
          }

          if (totalErrors < 10) {
            console.log(`\n    배치 에러 [${batchIdx}]: ${resp.status} - ${text.slice(0, 150)}`);
          }
          retries--;
          if (retries > 0) await sleep(500);
          else return { success: 0, skipped: 0, errors: batch.length };
        } catch (e) {
          retries--;
          if (retries > 0) await sleep(500);
          else return { success: 0, skipped: 0, errors: batch.length };
        }
      }
      return { success: 0, skipped: 0, errors: batch.length };
    }

    // 배치를 만들어 병렬 실행
    const batches = [];
    for (let i = 0; i < pendingRows.length; i += BATCH) {
      batches.push(pendingRows.slice(i, i + BATCH));
    }

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const chunk = batches.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map((b, j) => uploadSmallBatch(b, i + j)));
      for (const r of results) {
        totalSuccess += r.success;
        totalSkipped += r.skipped;
        totalErrors += r.errors;
      }

      const processed = Math.min((i + CONCURRENCY) * BATCH, pendingRows.length);
      if (processed % 500 < BATCH * CONCURRENCY || processed >= pendingRows.length) {
        process.stdout.write(
          `\r  업로드: ${processed.toLocaleString()}/${pendingRows.length.toLocaleString()} (성공: ${totalSuccess.toLocaleString()}, 스킵: ${totalSkipped.toLocaleString()})`
        );
      }
    }
  }

  console.log(`\n  관련판례 처리 완료:`);
  console.log(`    총 파싱: ${totalParsed.toLocaleString()}건`);
  console.log(`    업로드 성공: ${totalSuccess.toLocaleString()}건`);
  console.log(`    중복 스킵: ${totalSkipped.toLocaleString()}건`);
  console.log(`    파싱 에러: ${totalErrors.toLocaleString()}건`);
}

// ============================================================
// 4. 법률데이터_판례 (N-triple) → cases 테이블
// ============================================================

/** N-triple 라인 파서 */
function parseNTriple(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  // <subject> <predicate> <object> . 또는 <subject> <predicate> "literal"^^<type> .
  const parts = [];
  let i = 0;

  // Subject
  if (trimmed[i] === "<") {
    const end = trimmed.indexOf(">", i);
    if (end === -1) return null;
    parts.push(trimmed.substring(i + 1, end));
    i = end + 1;
  } else return null;

  // Skip whitespace
  while (i < trimmed.length && trimmed[i] === " ") i++;

  // Predicate
  if (trimmed[i] === "<") {
    const end = trimmed.indexOf(">", i);
    if (end === -1) return null;
    parts.push(trimmed.substring(i + 1, end));
    i = end + 1;
  } else return null;

  // Skip whitespace
  while (i < trimmed.length && trimmed[i] === " ") i++;

  // Object: URI or Literal
  if (trimmed[i] === "<") {
    const end = trimmed.indexOf(">", i);
    if (end === -1) return null;
    parts.push({ type: "uri", value: trimmed.substring(i + 1, end) });
  } else if (trimmed[i] === '"') {
    // Literal: "value"^^<type> or "value"
    let j = i + 1;
    let escaped = false;
    while (j < trimmed.length) {
      if (escaped) {
        escaped = false;
        j++;
        continue;
      }
      if (trimmed[j] === "\\") {
        escaped = true;
        j++;
        continue;
      }
      if (trimmed[j] === '"') break;
      j++;
    }
    const value = trimmed
      .substring(i + 1, j)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
    parts.push({ type: "literal", value });
  } else {
    return null;
  }

  return { subject: parts[0], predicate: parts[1], object: parts[2] };
}

/** N-triple에서 subject 기준으로 그룹핑 */
function groupNTriples(ntContent) {
  const groups = {};
  const lines = ntContent.split("\n");

  for (const line of lines) {
    const triple = parseNTriple(line);
    if (!triple) continue;

    if (!groups[triple.subject]) {
      groups[triple.subject] = {};
    }

    const pred = triple.predicate;
    if (!groups[triple.subject][pred]) {
      groups[triple.subject][pred] = [];
    }
    groups[triple.subject][pred].push(triple.object);
  }

  return groups;
}

async function loadNTriplePrecedents() {
  console.log("\n" + "=".repeat(60));
  console.log("4. 법률데이터_판례 (N-triple) → cases 테이블");
  console.log("=".repeat(60));

  const zipPath = `${KB_DIR}/법률데이터/법률데이터_판례.zip`;
  if (!fs.existsSync(zipPath)) {
    console.log("  [SKIP] 파일 없음:", zipPath);
    return;
  }

  if (!(await tableExists("cases"))) {
    console.log("  [ERROR] cases 테이블이 존재하지 않습니다.");
    return;
  }

  // 임시 디렉토리에 압축 해제
  const tmpDir = `${TMP_DIR}/판례`;
  execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}"`);
  execSync(`unzip -o "${zipPath}" -d "${tmpDir}"`, {
    maxBuffer: 100 * 1024 * 1024,
  });

  const ntDir = `${tmpDir}/nia_law_data_case`;
  const files = fs.readdirSync(ntDir).filter((f) => f.endsWith(".nt"));
  console.log(`  NT 파일: ${files.length}개`);

  // 법원.nt 파일에서 법원 목록 추출 (참조용)
  // 법관.nt에서 법관 정보
  // 재판부.nt + 재판부구성.nt에서 재판부 정보
  // → 이 데이터는 법원 메타데이터이므로 legal_knowledge에 적재

  // 이 NT 데이터는 판례 본문이 아니라 법원/법관/재판부 구성 메타데이터
  // cases 테이블보다는 legal_knowledge에 법원 정보로 적재가 적절

  const allRows = [];

  for (const file of files) {
    const filePath = `${ntDir}/${file}`;
    const stat = fs.statSync(filePath);
    console.log(`\n  [${file}] (${(stat.size / 1024).toFixed(0)}KB)`);

    const content = fs.readFileSync(filePath, "utf-8");
    const groups = groupNTriples(content);
    const subjects = Object.keys(groups);
    console.log(`    엔트리: ${subjects.length}건`);

    // 엔트리를 legal_knowledge로 변환
    for (const [subjectUri, props] of Object.entries(groups)) {
      const label = props["http://www.w3.org/2000/01/rdf-schema#label"]?.[0]?.value;
      if (!label) continue;

      // 간단한 정보만 추출
      const row = {
        category: "법원정보",
        title: label,
        content: null,
        source: "nt_case_" + file.replace(".nt", ""),
        source_uri: subjectUri,
        statute_name: null,
        article_name: null,
        related_laws: null,
        entry_type: file.replace(".nt", ""),
      };

      allRows.push(row);
    }
  }

  if (allRows.length > 0) {
    console.log(`\n  총 ${allRows.length.toLocaleString()}건 → easy_law 테이블`);
    if (await tableExists("easy_law")) {
      // easy_law 형식으로 변환 (content는 NOT NULL)
      const easyRows = allRows.map(r => ({
        topic: r.category,
        title: r.title,
        content: r.content || r.title,
        related_statutes: r.related_laws,
      }));
      const success = await uploadBatch("easy_law", easyRows, null);
      console.log(`  업로드 완료: ${success.toLocaleString()}건`);
    } else {
      console.log("  [ERROR] easy_law 테이블 없음");
    }
  }

  execSync(`rm -rf "${tmpDir}"`);
}

// ============================================================
// 5. 법률데이터_법령 (N-triple) → legal_knowledge 테이블
// ============================================================

async function loadNTripleStatutes() {
  console.log("\n" + "=".repeat(60));
  console.log("5. 법률데이터_법령 (N-triple) → easy_law 테이블");
  console.log("=".repeat(60));

  const zipPath = `${KB_DIR}/법률데이터/법률데이터_법령.zip`;
  if (!fs.existsSync(zipPath)) {
    console.log("  [SKIP] 파일 없음:", zipPath);
    return;
  }

  if (!(await tableExists("easy_law"))) {
    console.log("  [ERROR] easy_law 테이블이 존재하지 않습니다.");
    return;
  }

  const tmpDir = `${TMP_DIR}/법령`;
  execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}"`);
  execSync(`unzip -o "${zipPath}" -d "${tmpDir}"`, {
    maxBuffer: 200 * 1024 * 1024,
  });

  // 디렉토리 탐색 (구조가 다를 수 있음)
  let ntDir = `${tmpDir}/nia_law_data_law`;
  if (!fs.existsSync(ntDir)) {
    // 다른 가능한 경로 시도
    const dirs = execSync(`find "${tmpDir}" -type d`, { encoding: "utf-8" }).trim().split("\n");
    ntDir = dirs.find(d => d !== tmpDir) || tmpDir;
  }

  const files = fs.readdirSync(ntDir).filter((f) => f.endsWith(".nt"));
  console.log(`  NT 파일: ${files.length}개`);

  let totalSuccess = 0;

  for (const file of files) {
    const filePath = `${ntDir}/${file}`;
    const stat = fs.statSync(filePath);
    console.log(`\n  [${file}] (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);

    const content = fs.readFileSync(filePath, "utf-8");
    const groups = groupNTriples(content);
    const subjects = Object.keys(groups);
    console.log(`    엔트리: ${subjects.length.toLocaleString()}건`);

    const rows = [];
    for (const [subjectUri, props] of Object.entries(groups)) {
      const label = props["http://www.w3.org/2000/01/rdf-schema#label"]?.[0]?.value;
      if (!label) continue;

      const contentParts = [];
      for (const [pred, values] of Object.entries(props)) {
        if (pred.includes("label") || pred.includes("#type")) continue;
        for (const val of values) {
          if (val.type === "literal" && val.value) {
            const predName = pred.split("/").pop();
            contentParts.push(`${predName}: ${val.value}`);
          }
        }
      }

      // easy_law 형식 (content는 NOT NULL)
      rows.push({
        topic: "법령_" + file.replace(".nt", ""),
        title: label.slice(0, 1000),
        content: contentParts.join("\n").slice(0, 50000) || label,
        related_statutes: null,
      });
    }

    if (rows.length > 0) {
      console.log(`    변환: ${rows.length.toLocaleString()}건`);
      const success = await uploadBatch("easy_law", rows, null);
      totalSuccess += success;
    }
  }

  console.log(`\n  법률데이터_법령 총 업로드: ${totalSuccess.toLocaleString()}건`);
  execSync(`rm -rf "${tmpDir}"`);
}

// ============================================================
// 6. 법률데이터_생활법령 (N-triple) → legal_knowledge 테이블
// ============================================================

async function loadNTripleDailyLaw() {
  console.log("\n" + "=".repeat(60));
  console.log("6. 법률데이터_생활법령 (N-triple) → easy_law 테이블");
  console.log("=".repeat(60));

  const zipPath = `${KB_DIR}/법률데이터/법률데이터_생활법령.zip`;
  if (!fs.existsSync(zipPath)) {
    console.log("  [SKIP] 파일 없음:", zipPath);
    return;
  }

  if (!(await tableExists("easy_law"))) {
    console.log("  [ERROR] easy_law 테이블이 존재하지 않습니다.");
    return;
  }

  const tmpDir = `${TMP_DIR}/생활법령`;
  execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}"`);
  execSync(`unzip -o "${zipPath}" -d "${tmpDir}"`, {
    maxBuffer: 200 * 1024 * 1024,
  });

  // 디렉토리 탐색
  let ntDir = `${tmpDir}/nia_law_data_common`;
  if (!fs.existsSync(ntDir)) {
    const dirs = execSync(`find "${tmpDir}" -type d`, { encoding: "utf-8" }).trim().split("\n");
    ntDir = dirs.find(d => d !== tmpDir) || tmpDir;
  }

  const files = fs.readdirSync(ntDir).filter((f) => f.endsWith(".nt"));
  console.log(`  NT 파일: ${files.length}개`);

  let totalSuccess = 0;

  for (const file of files) {
    const filePath = `${ntDir}/${file}`;
    const stat = fs.statSync(filePath);
    console.log(`\n  [${file}] (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);

    const content = fs.readFileSync(filePath, "utf-8");
    const groups = groupNTriples(content);
    const subjects = Object.keys(groups);
    console.log(`    엔트리: ${subjects.length.toLocaleString()}건`);

    const rows = [];
    for (const [subjectUri, props] of Object.entries(groups)) {
      const label = props["http://www.w3.org/2000/01/rdf-schema#label"]?.[0]?.value;
      if (!label) continue;

      const contentParts = [];
      for (const [pred, values] of Object.entries(props)) {
        if (pred.includes("label") || pred.includes("#type")) continue;
        for (const val of values) {
          if (val.type === "literal" && val.value) {
            const predName = decodeURIComponent(pred.split("/").pop());
            contentParts.push(`${predName}: ${val.value}`);
          }
        }
      }

      // easy_law 형식 (content는 NOT NULL)
      rows.push({
        topic: "생활법령_" + file.replace(".nt", ""),
        title: label.slice(0, 1000),
        content: contentParts.join("\n").slice(0, 50000) || label,
        related_statutes: null,
      });
    }

    if (rows.length > 0) {
      console.log(`    변환: ${rows.length.toLocaleString()}건`);
      const success = await uploadBatch("easy_law", rows, null);
      totalSuccess += success;
    }
  }

  console.log(`\n  법률데이터_생활법령 총 업로드: ${totalSuccess.toLocaleString()}건`);
  execSync(`rm -rf "${tmpDir}"`);
}

// ============================================================
// 메인
// ============================================================

async function main() {
  console.log("=".repeat(70));
  console.log("  법률 지식베이스 → Supabase 적재 스크립트");
  console.log("  (legal_terms + legal_knowledge + easy_law + cases 테이블 활용)");
  console.log("=".repeat(70));
  console.log(`  시작 시각: ${new Date().toLocaleString("ko-KR")}`);

  // 1. 필수 테이블 확인
  console.log("\n[사전 확인] 테이블 존재 여부...");
  const legalTermsOk = await tableExists("legal_terms");
  const legalKnowledgeOk = await tableExists("legal_knowledge");
  const easyLawOk = await tableExists("easy_law");
  const casesOk = await tableExists("cases");

  console.log(`  legal_terms:     ${legalTermsOk ? "OK" : "없음"}`);
  console.log(`  legal_knowledge: ${legalKnowledgeOk ? "OK" : "없음"}`);
  console.log(`  easy_law:        ${easyLawOk ? "OK" : "없음"}`);
  console.log(`  cases:           ${casesOk ? "OK" : "없음"}`);

  if (!legalTermsOk && !legalKnowledgeOk && !easyLawOk && !casesOk) {
    console.log("\n[ERROR] 필수 테이블이 모두 없습니다. 종료합니다.");
    process.exit(1);
  }

  // 옵션 파싱
  const casesOnly = process.argv.includes("--cases-only");
  const skipCases = process.argv.includes("--skip-cases");

  if (casesOnly) {
    console.log("  --cases-only 모드: 관련판례만 처리합니다.\n");
  }
  if (skipCases) {
    console.log("  --skip-cases 모드: 관련판례를 건너뜁니다.\n");
  }

  // 2. 작업 디렉토리 생성
  execSync(`mkdir -p "${TMP_DIR}"`);

  // 3. 각 데이터 순차 처리
  try {
    // 3-1. 법령용어 → legal_terms
    if (!casesOnly && legalTermsOk) {
      await loadLegalTerms();
    }

    // 3-2. 법령지식 (소규모: 교통사고, 창업인허가, 층간소음) → legal_knowledge
    if (!casesOnly && legalKnowledgeOk) {
      await loadKnowledgeSmall();
    }

    // 3-3. 법령지식_관련판례 (대용량 스트리밍) → cases
    if (!skipCases && casesOk) {
      await loadRelatedPrecedents();
    }

    // 3-4. 법률데이터_판례 (N-triple) → easy_law
    if (!casesOnly && easyLawOk) {
      await loadNTriplePrecedents();
    }

    // 3-5. 법률데이터_법령 (N-triple) → easy_law
    if (!casesOnly && easyLawOk) {
      await loadNTripleStatutes();
    }

    // 3-6. 법률데이터_생활법령 (N-triple) → easy_law
    if (!casesOnly && easyLawOk) {
      await loadNTripleDailyLaw();
    }
  } finally {
    try {
      execSync(`rm -rf "${TMP_DIR}"`);
    } catch {}
  }

  // 4. 최종 통계
  console.log("\n" + "=".repeat(70));
  console.log("  적재 완료!");
  console.log("=".repeat(70));

  const finalLegalTerms = await countTable("legal_terms");
  const finalLegalKnowledge = await countTable("legal_knowledge");
  const finalEasyLaw = await countTable("easy_law");
  const finalCases = await countTable("cases");

  console.log(`  legal_terms:     ${finalLegalTerms >= 0 ? finalLegalTerms.toLocaleString() + "건" : "확인 불가"}`);
  console.log(`  legal_knowledge: ${finalLegalKnowledge >= 0 ? finalLegalKnowledge.toLocaleString() + "건" : "확인 불가"}`);
  console.log(`  easy_law:        ${finalEasyLaw >= 0 ? finalEasyLaw.toLocaleString() + "건" : "확인 불가"}`);
  console.log(`  cases:           ${finalCases >= 0 ? finalCases.toLocaleString() + "건" : "확인 불가"}`);
  console.log(`  종료 시각: ${new Date().toLocaleString("ko-KR")}\n`);
}

main().catch((e) => {
  console.error("\n[FATAL]", e);
  process.exit(1);
});
