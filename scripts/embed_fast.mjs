#!/usr/bin/env node
/**
 * 고속 병렬 Voyage 임베딩 스크립트
 * - voyage-3-lite (512차원, 6배 저렴)
 * - 10개 동시 배치 요청 (기존 대비 ~10배 빠름)
 * - 배치당 최대 128개 텍스트
 *
 * 사용법: node scripts/embed_fast.mjs <테이블명1> [테이블명2] ...
 * 예: node scripts/embed_fast.mjs legal_terms legal_knowledge
 */

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";
const VOYAGE_API_KEY = "pa-BykwxjnZQOFl-UtDjjD0uUstZT9HKDevyEbBVgDOfR0";
const VOYAGE_MODEL = "voyage-3";

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

// 병렬 설정
const CONCURRENCY = 8;          // 동시 Voyage API 요청 수
const BATCH_SIZE = 20;           // Voyage API 배치당 텍스트 수
const FETCH_LIMIT = 500;         // Supabase에서 한번에 가져올 행 수
const MAX_TEXT_LENGTH = 10000;   // 텍스트 최대 길이 (토큰 절약)
const UPDATE_CONCURRENCY = 20;  // 동시 Supabase 업데이트 수

const TABLE_CONFIGS = {
  legal_forms:     { columns: ["content"] },
  statutes:        { columns: ["article_content"] },
  legal_knowledge: { columns: ["title", "content"] },
  legal_terms:     { columns: ["term", "definition"] },
  easy_law:        { columns: ["content"] },
  legal_judgments:  { columns: ["summary", "content"] },
  legal_mrc:       { columns: ["question", "answer", "context"] },
  aihub_legal_qa:  { columns: ["question", "answer"] },
  cases:           { columns: ["summary", "full_text"] },
  legal_commentary: { columns: ["title", "content", "summary"] },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Supabase 헬퍼 ──

async function countPending(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id&embedding=is.null&limit=1`;
  const resp = await fetch(url, { headers: { ...HEADERS, Prefer: "count=exact" } });
  const range = resp.headers.get("content-range") || "*/0";
  return parseInt(range.split("/").pop()) || 0;
}

async function fetchRows(table, columns) {
  const sel = ["id", ...columns].join(",");
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${sel}&embedding=is.null&order=id&limit=${FETCH_LIMIT}`;
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await fetch(url, { headers: HEADERS });
      if (resp.ok) return resp.json();
      console.log(`  fetch 에러 ${resp.status}, 재시도 ${i + 1}/3`);
    } catch (e) { console.log(`  fetch 연결에러, 재시도 ${i + 1}/3`); }
    await sleep(2000 * (i + 1));
  }
  return [];
}

async function batchUpdate(table, updates) {
  // 동시에 여러 행 업데이트
  const chunks = [];
  for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
    chunks.push(updates.slice(i, i + UPDATE_CONCURRENCY));
  }
  let success = 0;
  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(({ id, embedding }) =>
        fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
          method: "PATCH",
          headers: { ...HEADERS, Prefer: "return=minimal" },
          body: JSON.stringify({ embedding: JSON.stringify(embedding) }),
        }).then((r) => r.ok || r.status === 204)
      )
    );
    success += results.filter((r) => r.status === "fulfilled" && r.value).length;
  }
  return success;
}

// ── Voyage API ──

async function getEmbeddings(texts) {
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
          input: texts,
          input_type: "document",
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        return data.data.map((d) => d.embedding);
      }

      if (resp.status === 429) {
        const wait = Math.min(60, 5 * (attempt + 1));
        console.log(`  Rate limit! ${wait}초 대기...`);
        await sleep(wait * 1000);
        continue;
      }

      const errText = await resp.text();
      console.log(`  Voyage ${resp.status}: ${errText.slice(0, 100)}`);
      return null;
    } catch (e) {
      console.log(`  Voyage 연결에러: ${e.message}`);
      await sleep(3000);
    }
  }
  return null;
}

// ── 메인 처리 ──

function extractText(row, columns) {
  const parts = columns.map((c) => row[c] || "").filter(Boolean);
  let text = parts.join("\n\n");
  if (!text || text.length < 5) return null;
  if (text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH);
  return text;
}

async function processTable(table, columns) {
  const total = await countPending(table);
  if (total === 0) {
    console.log(`  ${table}: 이미 완료`);
    return;
  }

  console.log(`  ${table}: ${total.toLocaleString()}건 임베딩 시작 (동시 ${CONCURRENCY}개)`);

  let processed = 0;
  let errors = 0;
  const startTime = Date.now();
  const skippedIds = new Set();

  while (true) {
    const rows = await fetchRows(table, columns);
    if (!rows || rows.length === 0) break;

    const newRows = rows.filter((r) => !skippedIds.has(r.id));
    if (newRows.length === 0) break;

    // 텍스트 추출 + 배치 분할
    const items = [];
    for (const row of newRows) {
      const text = extractText(row, columns);
      if (!text) { skippedIds.add(row.id); continue; }
      items.push({ id: row.id, text });
    }

    if (items.length === 0) break;

    // BATCH_SIZE씩 나누기
    const batches = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    // CONCURRENCY개씩 동시 처리
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const concurrentBatches = batches.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        concurrentBatches.map(async (batch) => {
          const texts = batch.map((b) => b.text);
          const embeddings = await getEmbeddings(texts);
          if (!embeddings || embeddings.length !== batch.length) {
            return { success: 0, errors: batch.length };
          }
          const updates = batch.map((b, idx) => ({ id: b.id, embedding: embeddings[idx] }));
          const ok = await batchUpdate(table, updates);
          return { success: ok, errors: batch.length - ok };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          processed += r.value.success;
          errors += r.value.errors;
        } else {
          errors += BATCH_SIZE;
        }
      }

      // 진행률 출력 (매 사이클)
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (processed / elapsed).toFixed(1);
      const eta = processed > 0 ? (((total - processed) / (processed / elapsed)) / 60).toFixed(0) : "?";
      process.stdout.write(`\r  ${table}: ${processed.toLocaleString()}/${total.toLocaleString()} (${rate}/초, ETA ${eta}분, err:${errors})  `);

      // 약간의 딜레이 (rate limit 방지)
      await sleep(100);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n  ${table} 완료: ${processed.toLocaleString()}건 (${elapsed}분, 에러:${errors})`);
}

async function main() {
  const targetTables = process.argv.slice(2);

  console.log("=".repeat(60));
  console.log(`고속 임베딩 (${VOYAGE_MODEL}, 동시 ${CONCURRENCY}개)`);
  console.log("=".repeat(60));

  const tables = targetTables.length > 0
    ? targetTables.filter((t) => TABLE_CONFIGS[t])
    : Object.keys(TABLE_CONFIGS);

  if (tables.length === 0) {
    console.log("사용 가능한 테이블:", Object.keys(TABLE_CONFIGS).join(", "));
    process.exit(1);
  }

  for (const table of tables) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`테이블: ${table}`);
    console.log("─".repeat(40));
    await processTable(table, TABLE_CONFIGS[table].columns);
  }

  console.log("\n" + "=".repeat(60));
  console.log("완료!");
}

main().catch(console.error);
