/**
 * LAW-CADDY 판례 임베딩 스크립트 (병렬 최적화 버전)
 * voyage-4-large로 cases.full_text 임베딩
 *
 * 실행: node scripts/embed-cases.cjs
 * 재시작 안전: embedding이 null인 건만 처리
 */

const { createClient } = require("@supabase/supabase-js");

const CONFIG = {
  supabaseUrl: "https://eafcyvbgcedvhlwqotis.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og",
  voyageApiKey: "pa-BykwxjnZQOFl-UtDjjD0uUstZT9HKDevyEbBVgDOfR0",
  voyageModel: "voyage-4-large",
  fetchSize: 1000,
  maxBatchTokens: 100000,  // 배치당 토큰 (120K 제한, 여유 확보)
  maxTokensPerText: 30000,
  concurrency: 5,          // 동시 API 호출 수
  delayMs: 100,
  maxRetries: 3,
};

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

function estimateTokens(text) { return text.length * 2; }

function truncateText(text, maxTokens) {
  const charLimit = Math.floor(maxTokens / 2);
  return text.length <= charLimit ? text : text.substring(0, charLimit);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getEmbeddings(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CONFIG.voyageApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: CONFIG.voyageModel, input_type: "document" }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { embeddings: data.data.map(d => d.embedding), tokens: data.usage.total_tokens };
}

async function withRetry(fn, retries = CONFIG.maxRetries) {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === retries) throw err;
      const wait = Math.pow(2, i) * 1000 + Math.random() * 500;
      await sleep(wait);
    }
  }
}

// 토큰 기준 동적 배치 분할
function splitIntoBatches(rows) {
  const batches = [];
  let batch = [], batchTokens = 0;

  for (const row of rows) {
    const text = truncateText(row.full_text || row.summary || "", CONFIG.maxTokensPerText);
    if (!text.trim()) continue;
    const tokens = estimateTokens(text);

    if (batchTokens + tokens > CONFIG.maxBatchTokens && batch.length > 0) {
      batches.push(batch);
      batch = [];
      batchTokens = 0;
    }
    batch.push({ ...row, _text: text, _tokens: tokens });
    batchTokens += tokens;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

// 단일 배치 처리
async function processBatch(batch) {
  const texts = batch.map(r => r._text);
  const { embeddings, tokens } = await withRetry(() => getEmbeddings(texts));

  // DB 병렬 업데이트
  const results = await Promise.all(
    batch.map((row, i) =>
      supabase.from("cases").update({ embedding: JSON.stringify(embeddings[i]) }).eq("id", row.id)
    )
  );
  const dbErrors = results.filter(r => r.error).length;
  return { count: batch.length, tokens, dbErrors };
}

async function main() {
  const { count: totalCount } = await supabase
    .from("cases").select("id", { count: "exact", head: true });
  const { count: doneCount } = await supabase
    .from("cases").select("id", { count: "exact", head: true })
    .not("embedding", "is", null);
  const remaining = totalCount - doneCount;

  console.log("========================================");
  console.log(`판례 임베딩 | voyage-4-large | 동시 ${CONFIG.concurrency}개`);
  console.log(`전체: ${totalCount.toLocaleString()} | 완료: ${doneCount.toLocaleString()} | 남은: ${remaining.toLocaleString()}`);
  console.log("========================================\n");

  if (remaining === 0) { console.log("모든 임베딩 완료!"); return; }

  let processed = 0, totalTokens = 0, errorCount = 0;
  const startTime = Date.now();

  while (true) {
    const { data: rows, error } = await supabase
      .from("cases").select("id, full_text, summary")
      .is("embedding", null).order("id").limit(CONFIG.fetchSize);

    if (error) { console.error("DB 에러:", error.message); await sleep(5000); continue; }
    if (!rows || rows.length === 0) break;

    const batches = splitIntoBatches(rows);

    // 동시에 concurrency개씩 배치 처리
    for (let i = 0; i < batches.length; i += CONFIG.concurrency) {
      const chunk = batches.slice(i, i + CONFIG.concurrency);
      const results = await Promise.allSettled(chunk.map(b => processBatch(b)));

      for (const r of results) {
        if (r.status === "fulfilled") {
          processed += r.value.count;
          totalTokens += r.value.tokens;
          errorCount += r.value.dbErrors;
        } else {
          const failCount = chunk.reduce((s, b) => s + b.length, 0) / chunk.length;
          errorCount += Math.round(failCount);
          console.error(`\n배치 실패:`, r.reason.message);
        }
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const speed = processed / elapsed;
      const eta = remaining > processed ? (remaining - processed) / speed : 0;
      const pct = (((doneCount + processed) / totalCount) * 100).toFixed(1);
      const cost = (totalTokens / 1e6 * 0.12).toFixed(2);
      process.stdout.write(
        `\r[${pct}%] ${(doneCount + processed).toLocaleString()}/${totalCount.toLocaleString()} | ` +
        `${speed.toFixed(1)}건/초 | ETA: ${fmtTime(eta)} | $${cost} | 에러: ${errorCount}   `
      );

      await sleep(CONFIG.delayMs);
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  const cost = (totalTokens / 1e6 * 0.12).toFixed(2);
  console.log(`\n\n========================================`);
  console.log(`완료! ${processed.toLocaleString()}건 | $${cost} | ${fmtTime(elapsed)} | 에러: ${errorCount}`);
  console.log(`========================================`);
}

function fmtTime(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

main().catch(e => { console.error("\n치명적 에러:", e); process.exit(1); });
