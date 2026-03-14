/**
 * AIHub 민사법/행정법/형사법 LLM 데이터 → Supabase aihub_legal_qa 테이블
 * Node.js 버전 — 전체 데이터 (제한 없음)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const PROJECT_DIR = "/home/user/law-caddy";
const TMP_BASE = "/tmp/aihub_work";

const DATASETS = [
  {
    category: "민사법",
    base: path.join(PROJECT_DIR, "01.민사법 LLM 사전학습 및 Instruction Tuning 데이터", "3.개방데이터", "1.데이터"),
    files: [
      ["Training/02.라벨링데이터/TL_01. 민사법_001. 판결문_0001. 질의응답.zip", "판결문", "QA"],
      ["Training/02.라벨링데이터/TL_01. 민사법_001. 판결문_0002. 요약.zip", "판결문", "SUM"],
      ["Training/02.라벨링데이터/TL_01. 민사법_002. 법령_0001. 질의응답.zip", "법령", "QA"],
      ["Training/02.라벨링데이터/TL_01. 민사법_003. 심결례_0001. 질의응답.zip", "심결례", "QA"],
      ["Training/02.라벨링데이터/TL_01. 민사법_003. 심결례_0002. 요약.zip", "심결례", "SUM"],
      ["Training/02.라벨링데이터/TL_01. 민사법_004. 유권해석_0001. 질의응답.zip", "유권해석", "QA"],
      ["Training/02.라벨링데이터/TL_01. 민사법_004. 유권해석_0002. 요약.zip", "유권해석", "SUM"],
    ],
  },
  {
    category: "행정법",
    base: path.join(PROJECT_DIR, "03.행정법 LLM 사전학습 및 Instruction Tuning 데이터", "3.개방데이터", "1.데이터"),
    files: [
      ["Training/02.라벨링데이터/TL_판결문_QA.zip", "판결문", "QA"],
      ["Training/02.라벨링데이터/TL_판결문_SUM.zip", "판결문", "SUM"],
      ["Training/02.라벨링데이터/TL_법령_QA.zip", "법령", "QA"],
      ["Training/02.라벨링데이터/TL_결정례_QA.zip", "결정례", "QA"],
      ["Training/02.라벨링데이터/TL_결정례_SUM.zip", "결정례", "SUM"],
      ["Training/02.라벨링데이터/TL_해석례_QA.zip", "해석례", "QA"],
      ["Training/02.라벨링데이터/TL_해석례_SUM.zip", "해석례", "SUM"],
    ],
  },
  {
    category: "형사법",
    base: path.join(PROJECT_DIR, "04.형사법 LLM 사전학습 및 Instruction Tuning 데이터", "3.개방데이터", "1.데이터"),
    files: [
      ["Training/02.라벨링데이터/TL_판결문_QA.zip", "판결문", "QA"],
      ["Training/02.라벨링데이터/TL_판결문_SUM.zip", "판결문", "SUM"],
      ["Training/02.라벨링데이터/TL_법령_QA.zip", "법령", "QA"],
      ["Training/02.라벨링데이터/TL_결정례_QA.zip", "결정례", "QA"],
      ["Training/02.라벨링데이터/TL_결정례_SUM.zip", "결정례", "SUM"],
      ["Training/02.라벨링데이터/TL_해석례_QA.zip", "해석례", "QA"],
      ["Training/02.라벨링데이터/TL_해석례_SUM.zip", "해석례", "SUM"],
    ],
  },
];

function extractFromJson(data, taskType) {
  const info = data.info || {};
  // 민사법: taskinfo, 행정법/형사법: label
  const task = data.taskinfo || data.label || {};

  let question = "";
  let answer = (task.output || "").trim();

  if (taskType === "QA") {
    // 민사법: taskinfo.input, 행정법/형사법: label.input 또는 label.instruction
    question = (task.input || task.instruction || "").trim();
  } else {
    // SUM: 민사법은 sentences, 행정법/형사법은 instruction
    const sentences = task.sentences;
    if (Array.isArray(sentences)) {
      question = sentences.filter(s => s && s.trim()).map(s => s.trim()).join("\n");
    } else if (typeof sentences === "string") {
      question = sentences.trim();
    }
    if (!question) {
      question = (task.instruction || "").trim();
    }
  }

  if (!answer || answer.length < 10) return null;

  const sourceParts = [];
  if (info.statute_name) sourceParts.push(info.statute_name);
  if (info.title) sourceParts.push(info.title);
  if (info.doc_id) sourceParts.push(info.doc_id);

  return {
    question: (question || "").slice(0, 5000),
    answer: answer.slice(0, 5000),
    source_info: sourceParts.join(" | ").slice(0, 500),
  };
}

function findAllFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          results.push(...findAllFiles(full));
        } else if (stat.isFile() && full.endsWith('.json')) {
          results.push(full);
        }
      } catch {}
    }
  } catch {}
  return results;
}

function processZip(zipPath, category, docType, taskType) {
  if (!fs.existsSync(zipPath)) {
    console.log(`  파일 없음: ${path.basename(zipPath)}`);
    return [];
  }

  const tmpDir = path.join(TMP_BASE, `${category}_${docType}_${taskType}_${Date.now()}`);

  try {
    execSync(`rm -rf "${tmpDir}" 2>/dev/null; mkdir -p "${tmpDir}"`, { stdio: 'pipe' });

    // unzip — 에러 무시 (한글 파일명 경고)
    try {
      execSync(`unzip -o -q "${zipPath}" -d "${tmpDir}"`, {
        stdio: 'pipe',
        maxBuffer: 1024 * 1024 * 50,
        timeout: 600000,
      });
    } catch {
      // unzip은 경고에도 exit code != 0 반환
    }

    // find -print0 → Buffer로 받아서 null byte로 분리
    // Buffer 경로를 사용하면 깨진 한글 파일명도 정확히 읽을 수 있음
    let filePaths = [];
    try {
      const findBuf = execSync(`find "${tmpDir}" -name "*.json" -type f -print0 2>/dev/null`, {
        encoding: 'buffer',
        maxBuffer: 1024 * 1024 * 100,
      });
      // null byte로 분리
      let start = 0;
      for (let i = 0; i < findBuf.length; i++) {
        if (findBuf[i] === 0) {
          if (i > start) {
            filePaths.push(findBuf.subarray(start, i));
          }
          start = i + 1;
        }
      }
      if (start < findBuf.length) {
        filePaths.push(findBuf.subarray(start));
      }
    } catch {}

    console.log(`    ZIP 해제: ${filePaths.length}개 JSON 파일`);

    const results = [];
    let errCount = 0;

    for (const pathBuf of filePaths) {
      try {
        // Buffer 경로로 직접 읽기 — 인코딩 문제 우회
        const raw = fs.readFileSync(pathBuf, "utf-8");
        const data = JSON.parse(raw);
        const item = extractFromJson(data, taskType);
        if (item) {
          item.category = category;
          item.doc_type = docType;
          item.task_type = taskType;
          results.push(item);
        }
      } catch {
        errCount++;
      }
    }

    if (errCount > 0) console.log(`    파싱 에러: ${errCount}건`);

    // cleanup
    execSync(`rm -rf "${tmpDir}" 2>/dev/null || true`, { stdio: 'pipe' });
    return results;
  } catch (e) {
    console.log(`  ZIP 처리 오류: ${e.message?.slice(0, 150)}`);
    execSync(`rm -rf "${tmpDir}" 2>/dev/null || true`, { stdio: 'pipe' });
    return [];
  }
}

async function uploadToSupabase(rows) {
  const url = `${SUPABASE_URL}/rest/v1/aihub_legal_qa`;
  let success = 0;
  const batchSize = 500;

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

    if ((i + batchSize) % 10000 < batchSize) {
      console.log(`  업로드 진행: ${Math.min(i + batchSize, rows.length).toLocaleString()}/${rows.length.toLocaleString()}`);
    }
  }
  return success;
}

async function main() {
  console.log("=".repeat(60));
  console.log("AIHub 법률 LLM 데이터 → Supabase 업로드 (전체)");
  console.log("=".repeat(60));

  // tmp 디렉토리 초기화
  execSync(`rm -rf "${TMP_BASE}"; mkdir -p "${TMP_BASE}"`, { stdio: 'pipe' });

  let totalRows = [];

  for (const ds of DATASETS) {
    console.log(`\n[${ds.category}]`);

    if (!fs.existsSync(ds.base)) {
      console.log(`  디렉토리 없음`);
      continue;
    }

    for (const [relPath, docType, taskType] of ds.files) {
      const zipPath = path.join(ds.base, relPath);
      const label = `${docType}_${taskType}`;
      console.log(`  ${label} 처리중...`);

      const rows = processZip(zipPath, ds.category, docType, taskType);
      totalRows.push(...rows);
      console.log(`  → ${label}: ${rows.length.toLocaleString()}건 추출`);

      // 메모리 관리: 5만건 넘으면 중간 업로드
      if (totalRows.length >= 50000) {
        console.log(`\n  중간 업로드: ${totalRows.length.toLocaleString()}건...`);
        const success = await uploadToSupabase(totalRows);
        console.log(`  중간 업로드 완료: ${success.toLocaleString()}건`);
        totalRows = [];
      }
    }
  }

  console.log(`\n최종 남은 데이터: ${totalRows.length.toLocaleString()}건`);

  if (totalRows.length > 0) {
    console.log("Supabase 업로드 중...");
    const success = await uploadToSupabase(totalRows);
    console.log(`업로드 완료: ${success.toLocaleString()}건`);
  }

  // cleanup
  execSync(`rm -rf "${TMP_BASE}" 2>/dev/null || true`, { stdio: 'pipe' });

  console.log("\n완료!");
}

main().catch(console.error);
