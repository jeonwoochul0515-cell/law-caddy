#!/usr/bin/env node
/**
 * legal_commentary 테이블 생성 + HuggingFace 데이터 로딩 + 임베딩
 *
 * 사용법:
 *   # 1단계: 테이블 생성 확인 (없으면 SQL 출력)
 *   node scripts/22_setup_commentary.mjs setup
 *
 *   # 2단계: HuggingFace KICJ 데이터 로딩
 *   node scripts/22_setup_commentary.mjs load
 *
 *   # 3단계: 임베딩 생성
 *   node scripts/22_setup_commentary.mjs embed
 *
 *   # 4단계: 하이브리드 검색 테스트
 *   node scripts/22_setup_commentary.mjs test
 *
 *   # 전체 실행 (테이블 존재 확인 → 로딩 → 임베딩 → 테스트)
 *   node scripts/22_setup_commentary.mjs all
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Supabase 설정 ───
const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";
const VOYAGE_API_KEY = "pa-BykwxjnZQOFl-UtDjjD0uUstZT9HKDevyEbBVgDOfR0";
const VOYAGE_MODEL = "voyage-3";

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════
// Step 1: 테이블 존재 확인
// ═══════════════════════════════════════════

async function checkTable() {
  console.log("\n[Step 1] legal_commentary 테이블 확인...");

  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_commentary?select=id&limit=1`,
    { headers: HEADERS }
  );

  if (resp.status === 200) {
    console.log("  ✅ legal_commentary 테이블 존재 확인!");
    return true;
  }

  if (resp.status === 404) {
    console.log("  ❌ legal_commentary 테이블이 없습니다.\n");
    console.log("  아래 SQL을 Supabase Dashboard → SQL Editor에서 실행하세요:");
    console.log("  " + "=".repeat(56));

    try {
      const sqlPath = join(__dirname, "22_create_commentary_table.sql");
      const sql = readFileSync(sqlPath, "utf8");
      console.log(sql);
    } catch {
      console.log("  (SQL 파일을 찾을 수 없습니다: scripts/22_create_commentary_table.sql)");
    }

    console.log("  " + "=".repeat(56));
    console.log("\n  SQL 실행 후 이 스크립트를 다시 실행하세요.");
    return false;
  }

  const text = await resp.text();
  console.error("  예상치 못한 응답:", resp.status, text.slice(0, 200));
  return false;
}

// ═══════════════════════════════════════════
// Step 2: HuggingFace KICJ 데이터 로딩
// ═══════════════════════════════════════════

async function loadHuggingFaceData() {
  console.log("\n[Step 2] HuggingFace KICJ/legal_qa_ko 데이터 로딩...");

  // 1. 이미 로딩된 데이터 확인
  const countResp = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_commentary?select=id&source=eq.hf_kicj_legal_qa&limit=1`,
    { headers: { ...HEADERS, Prefer: "count=exact" } }
  );
  const range = countResp.headers.get("content-range") || "*/0";
  const existing = parseInt(range.split("/").pop()) || 0;

  if (existing > 0) {
    console.log(`  이미 ${existing}건 로딩됨. 건너뜁니다.`);
    return existing;
  }

  // 2. config 목록 가져오기
  console.log("  HuggingFace API에서 데이터셋 정보 조회...");
  const configsResp = await fetch(
    "https://huggingface.co/api/datasets/KICJ/legal_qa_ko/parquet"
  );
  if (!configsResp.ok) {
    throw new Error(`HuggingFace API 실패: ${configsResp.status}`);
  }
  const configs = await configsResp.json();
  const configNames = Object.keys(configs);
  console.log(`  ${configNames.length}개 연구보고서 발견`);

  // 3. 각 config에서 데이터 가져와서 변환
  let totalRows = 0;
  let allRows = [];

  for (let ci = 0; ci < configNames.length; ci++) {
    const configName = configNames[ci];
    const shortName = configName.slice(0, 60);
    process.stdout.write(`\r  [${ci + 1}/${configNames.length}] ${shortName}...`);

    // rows API로 데이터 가져오기 (각 config당 최대 500건)
    let offset = 0;
    const pageSize = 100;

    while (true) {
      const url = `https://datasets-server.huggingface.co/rows?dataset=KICJ/legal_qa_ko&config=${encodeURIComponent(configName)}&split=train&offset=${offset}&length=${pageSize}`;

      let data;
      for (let retry = 0; retry < 3; retry++) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) {
            if (resp.status === 429) {
              console.log(`\n  Rate limit, 10초 대기...`);
              await sleep(10000);
              continue;
            }
            throw new Error(`HTTP ${resp.status}`);
          }
          data = await resp.json();
          break;
        } catch (e) {
          if (retry === 2) throw e;
          await sleep(3000);
        }
      }

      if (!data?.rows?.length) break;

      for (const item of data.rows) {
        const row = item.row;
        const question = (row.Question || "").trim();
        const answer = (row.Answer || "").trim();
        const context = (row["Chunk Context"] || "").trim();

        if (!question || !answer) continue;

        allRows.push({
          source: "hf_kicj_legal_qa",
          source_id: `kicj_${configName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50)}_${row["Chunk Number"] || offset}_${totalRows}`,
          category: "형사정책",
          title: question,
          content: answer,
          summary: context.slice(0, 2000) || null,
          author: "한국형사·법무정책연구원",
          published_date: null,
          doc_type: "qa_pair",
          related_statutes: null,
          related_cases: null,
          metadata: { report_name: configName, chunk_number: row["Chunk Number"] },
        });
        totalRows++;
      }

      if (data.rows.length < pageSize) break;
      offset += pageSize;
      await sleep(500); // rate limit 방지
    }

    await sleep(300); // config 간 딜레이
  }

  console.log(`\n  총 ${allRows.length}건 변환 완료`);

  // 4. Supabase에 배치 업로드
  if (allRows.length === 0) {
    console.log("  로딩할 데이터가 없습니다.");
    return 0;
  }

  console.log("  Supabase에 업로드 중...");
  const batchSize = 50;
  let uploaded = 0;
  let errors = 0;

  for (let i = 0; i < allRows.length; i += batchSize) {
    const batch = allRows.slice(i, i + batchSize);

    for (let retry = 0; retry < 3; retry++) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/legal_commentary`, {
          method: "POST",
          headers: {
            ...HEADERS,
            Prefer: "return=minimal,resolution=ignore-duplicates",
          },
          body: JSON.stringify(batch),
        });

        if (resp.ok || resp.status === 201) {
          uploaded += batch.length;
          break;
        }

        // 배치 실패 시 개별 삽입
        if (retry === 2) {
          for (const row of batch) {
            try {
              const r2 = await fetch(`${SUPABASE_URL}/rest/v1/legal_commentary`, {
                method: "POST",
                headers: {
                  ...HEADERS,
                  Prefer: "return=minimal,resolution=ignore-duplicates",
                },
                body: JSON.stringify(row),
              });
              if (r2.ok || r2.status === 201) uploaded++;
              else errors++;
            } catch {
              errors++;
            }
          }
        }
      } catch (e) {
        if (retry === 2) {
          console.error(`\n  배치 업로드 실패:`, e.message);
          errors += batch.length;
        }
        await sleep(2000);
      }
    }

    process.stdout.write(
      `\r  업로드: ${uploaded}/${allRows.length} (에러: ${errors})  `
    );
  }

  console.log(`\n  ✅ 업로드 완료: ${uploaded}건 (에러: ${errors}건)`);
  return uploaded;
}

// ═══════════════════════════════════════════
// Step 3: 임베딩 생성
// ═══════════════════════════════════════════

async function runEmbeddings() {
  console.log("\n[Step 3] legal_commentary 임베딩 생성...");

  // 임베딩 안된 건수 확인
  const countResp = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_commentary?select=id&embedding=is.null&limit=1`,
    { headers: { ...HEADERS, Prefer: "count=exact" } }
  );
  const range = countResp.headers.get("content-range") || "*/0";
  const pending = parseInt(range.split("/").pop()) || 0;

  if (pending === 0) {
    console.log("  ✅ 모든 데이터 임베딩 완료!");
    return;
  }

  console.log(`  ${pending}건 임베딩 필요`);

  const BATCH_SIZE = 20;
  const CONCURRENCY = 4; // 안전하게 4개로 제한
  const FETCH_LIMIT = 200;
  const MAX_TEXT_LENGTH = 10000;

  let processed = 0;
  let embedErrors = 0;
  const startTime = Date.now();
  const skippedIds = new Set();

  while (true) {
    // 임베딩 안된 행 가져오기
    const fetchResp = await fetch(
      `${SUPABASE_URL}/rest/v1/legal_commentary?select=id,title,content,summary&embedding=is.null&order=id&limit=${FETCH_LIMIT}`,
      { headers: HEADERS }
    );

    if (!fetchResp.ok) {
      console.error("  데이터 조회 실패:", fetchResp.status);
      break;
    }

    const rows = await fetchResp.json();
    const newRows = rows.filter((r) => !skippedIds.has(r.id));
    if (newRows.length === 0) break;

    // 텍스트 추출
    const items = [];
    for (const row of newRows) {
      const parts = [row.title, row.content, row.summary].filter(Boolean);
      let text = parts.join("\n\n");
      if (!text || text.length < 5) {
        skippedIds.add(row.id);
        continue;
      }
      if (text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH);
      items.push({ id: row.id, text });
    }

    if (items.length === 0) break;

    // 배치로 나누기
    const batches = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    // 동시 처리
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const concurrent = batches.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        concurrent.map(async (batch) => {
          // Voyage API 호출
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${VOYAGE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: VOYAGE_MODEL,
                  input: batch.map((b) => b.text),
                  input_type: "document",
                }),
              });

              if (resp.status === 429) {
                const wait = Math.min(60, 5 * (attempt + 1));
                console.log(`\n  Rate limit! ${wait}초 대기...`);
                await sleep(wait * 1000);
                continue;
              }

              if (!resp.ok) {
                const errText = await resp.text();
                console.error(`\n  Voyage ${resp.status}: ${errText.slice(0, 100)}`);
                return { success: 0, errors: batch.length };
              }

              const data = await resp.json();
              const embeddings = data.data.map((d) => d.embedding);

              if (embeddings.length !== batch.length) {
                return { success: 0, errors: batch.length };
              }

              // DB 업데이트
              let ok = 0;
              for (let j = 0; j < batch.length; j++) {
                const updateResp = await fetch(
                  `${SUPABASE_URL}/rest/v1/legal_commentary?id=eq.${batch[j].id}`,
                  {
                    method: "PATCH",
                    headers: { ...HEADERS, Prefer: "return=minimal" },
                    body: JSON.stringify({
                      embedding: JSON.stringify(embeddings[j]),
                    }),
                  }
                );
                if (updateResp.ok || updateResp.status === 204) ok++;
              }

              return { success: ok, errors: batch.length - ok };
            } catch (e) {
              if (attempt === 4) return { success: 0, errors: batch.length };
              await sleep(3000);
            }
          }
          return { success: 0, errors: batch.length };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          processed += r.value.success;
          embedErrors += r.value.errors;
        } else {
          embedErrors += BATCH_SIZE;
        }
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed > 0 ? (processed / elapsed).toFixed(1) : "0";
      const eta =
        processed > 0
          ? (((pending - processed) / (processed / elapsed)) / 60).toFixed(0)
          : "?";
      process.stdout.write(
        `\r  임베딩: ${processed}/${pending} (${rate}/초, ETA ${eta}분, err:${embedErrors})  `
      );

      await sleep(200); // rate limit 방지
    }
  }

  console.log(
    `\n  ✅ 임베딩 완료: ${processed}건 (에러: ${embedErrors}건)`
  );
}

// ═══════════════════════════════════════════
// Step 4: 하이브리드 검색 테스트
// ═══════════════════════════════════════════

async function testHybridSearch() {
  console.log("\n[Step 4] 하이브리드 검색 테스트...");

  // 테이블에 임베딩된 데이터가 있는지 확인
  const countResp = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_commentary?select=id&embedding=not.is.null&limit=1`,
    { headers: { ...HEADERS, Prefer: "count=exact" } }
  );
  const range = countResp.headers.get("content-range") || "*/0";
  const embedded = parseInt(range.split("/").pop()) || 0;

  if (embedded === 0) {
    console.log("  ⚠️ 임베딩된 데이터가 없어 검색 테스트를 건너뜁니다.");
    return false;
  }

  console.log(`  임베딩된 데이터: ${embedded}건`);

  // 테스트 쿼리
  const testQueries = [
    "형사소송에서 검사의 입증책임",
    "소년범죄 재범방지 대책",
    "디지털 성범죄 처벌",
  ];

  for (const query of testQueries) {
    console.log(`\n  🔍 검색: "${query}"`);

    try {
      // 1. 임베딩 생성
      const embResp = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VOYAGE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: VOYAGE_MODEL,
          input: [query],
          input_type: "query",
        }),
      });

      if (!embResp.ok) {
        console.log("  ❌ 임베딩 생성 실패:", embResp.status);
        continue;
      }

      const embData = await embResp.json();
      const queryEmbedding = embData.data[0].embedding;

      // 2. 하이브리드 검색 RPC 호출
      const searchResp = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/hybrid_search_legal_commentary`,
        {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify({
            query_text: query,
            query_embedding: queryEmbedding,
            match_count: 3,
            keyword_weight: 0.3,
            semantic_weight: 0.7,
          }),
        }
      );

      if (!searchResp.ok) {
        const errText = await searchResp.text();
        console.log(`  ❌ 하이브리드 검색 실패 (${searchResp.status}):`, errText.slice(0, 200));
        console.log("  ⚠️ hybrid_search_legal_commentary RPC 함수가 없을 수 있습니다.");
        console.log("  → scripts/22_create_commentary_table.sql의 하이브리드 검색 함수 부분도 실행하세요.");
        return false;
      }

      const results = await searchResp.json();

      if (results.length === 0) {
        console.log("  (결과 없음)");
      } else {
        results.forEach((r, i) => {
          const title = (r.title || "").slice(0, 60);
          const score = ((r.combined_score || 0) * 100).toFixed(1);
          console.log(`  ${i + 1}. [${score}%] ${title}`);
        });
      }
    } catch (e) {
      console.log("  ❌ 검색 에러:", e.message);
      return false;
    }
  }

  // 3. match_legal_commentary (시맨틱 전용) 테스트
  console.log("\n  🔍 시맨틱 검색 (match_legal_commentary) 테스트...");
  try {
    const embResp2 = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: ["범죄 예방 정책"],
        input_type: "query",
      }),
    });

    const embData2 = await embResp2.json();

    const matchResp = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/match_legal_commentary`,
      {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          query_embedding: embData2.data[0].embedding,
          match_threshold: 0.3,
          match_count: 3,
        }),
      }
    );

    if (matchResp.ok) {
      const matchResults = await matchResp.json();
      console.log(`  ✅ match_legal_commentary 정상: ${matchResults.length}건 반환`);
      matchResults.forEach((r, i) => {
        console.log(`  ${i + 1}. [유사도 ${((r.similarity || 0) * 100).toFixed(1)}%] ${(r.title || "").slice(0, 60)}`);
      });
    } else {
      const errText = await matchResp.text();
      console.log(`  ❌ match_legal_commentary 실패: ${errText.slice(0, 200)}`);
      return false;
    }
  } catch (e) {
    console.log("  ❌ 시맨틱 검색 에러:", e.message);
    return false;
  }

  console.log("\n  ✅ 모든 검색 테스트 통과!");
  return true;
}

// ═══════════════════════════════════════════
// 메인
// ═══════════════════════════════════════════

async function main() {
  const command = process.argv[2] || "all";

  console.log("═".repeat(60));
  console.log("LAW-CADDY: legal_commentary 데이터 파이프라인");
  console.log("═".repeat(60));

  if (command === "setup" || command === "all") {
    const exists = await checkTable();
    if (!exists) {
      process.exit(1);
    }
  }

  if (command === "load" || command === "all") {
    const tableExists = await checkTable();
    if (!tableExists) {
      process.exit(1);
    }
    await loadHuggingFaceData();
  }

  if (command === "embed" || command === "all") {
    await runEmbeddings();
  }

  if (command === "test" || command === "all") {
    const success = await testHybridSearch();
    if (!success) {
      console.log("\n⚠️ 검색 테스트 실패. 위의 에러를 확인하세요.");
      process.exit(1);
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("✅ 완료!");
  console.log("═".repeat(60));
}

main().catch((e) => {
  console.error("\n❌ 치명적 오류:", e.message);
  process.exit(1);
});
