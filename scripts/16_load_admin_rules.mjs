#!/usr/bin/env node
/**
 * 법제처 Open API → Supabase 적재
 *
 * 1. 행정규칙 (훈령, 예규, 고시) → legal_knowledge 테이블
 * 2. 법령해석례 → legal_knowledge 테이블
 *
 * 사용법: node scripts/16_load_admin_rules.mjs
 */

// ============================================================
// 설정
// ============================================================

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const OC = "jeonwoochul0515";
const BASE = "http://www.law.go.kr/DRF";
const BATCH_SIZE = 100;
const DISPLAY = 100; // 법제처 API 페이지당 건수
const DELAY_MS = 1000;
const DETAIL_DELAY_MS = 200; // 상세 조회 간 딜레이
const CONCURRENCY = 5; // 동시 상세 조회 수

// ============================================================
// 유틸리티
// ============================================================

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 간단한 XML 태그 값 추출 (CDATA 포함)
 * 중첩 없는 단순 태그에만 사용
 */
function xmlVal(xml, tag) {
  // <tag><![CDATA[value]]></tag> 또는 <tag>value</tag>
  const re = new RegExp(
    `<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    "i"
  );
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

/**
 * XML에서 반복 요소를 배열로 추출
 */
function xmlList(xml, tag) {
  const results = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]);
  }
  return results;
}

/**
 * 조문내용 태그를 모두 추출하여 합침
 */
function xmlAllVals(xml, tag) {
  const results = [];
  const re = new RegExp(
    `<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    "gi"
  );
  let m;
  while ((m = re.exec(xml)) !== null) {
    const v = m[1].trim();
    if (v) results.push(v);
  }
  return results;
}

async function fetchText(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      return await resp.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`  재시도 ${i + 1}/${retries}: ${err.message}`);
      await sleep(2000);
    }
  }
}

/**
 * 이미 적재된 source_uri 집합을 조회 (중복 방지 / 재개용)
 */
async function getExistingUris(prefix) {
  const uris = new Set();
  let offset = 0;
  const limit = 1000;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/legal_knowledge?select=source_uri&source_uri=like.${prefix}*&limit=${limit}&offset=${offset}`;
    try {
      const resp = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });
      if (!resp.ok) break;
      const data = await resp.json();
      if (data.length === 0) break;
      for (const row of data) uris.add(row.source_uri);
      offset += limit;
    } catch {
      break;
    }
  }
  return uris;
}

/**
 * items 배열을 CONCURRENCY 개씩 동시 처리
 */
async function processInParallel(items, handler, label) {
  let fetched = 0;
  let skipped = 0;
  const rows = [];

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((item) => handler(item)));

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        rows.push(r.value);
        fetched++;
      } else {
        skipped++;
      }
    }

    // 진행률 출력
    const done = Math.min(i + CONCURRENCY, items.length);
    if (done % 500 < CONCURRENCY || done === items.length) {
      console.log(
        `  [${label}] ${done}/${items.length} (성공: ${fetched}, 스킵: ${skipped})`
      );
    }

    // 배치 업로드 (1000건마다)
    if (rows.length >= 1000) {
      console.log(`  -> ${rows.length}건 배치 업로드 중...`);
      const uploaded = await uploadBatch(rows);
      console.log(`  -> ${uploaded}건 업로드 완료`);
      rows.length = 0;
    }

    await sleep(DETAIL_DELAY_MS);
  }

  // 잔여분 업로드
  if (rows.length > 0) {
    console.log(`  -> 잔여 ${rows.length}건 배치 업로드 중...`);
    const uploaded = await uploadBatch(rows);
    console.log(`  -> ${uploaded}건 업로드 완료`);
  }

  console.log(`\n${label} 완료: 총 ${items.length}건 중 ${fetched}건 적재, ${skipped}건 스킵`);
}

// ============================================================
// Supabase 배치 업로드
// ============================================================

async function uploadBatch(rows) {
  const url = `${SUPABASE_URL}/rest/v1/legal_knowledge?on_conflict=source,source_uri`;
  let success = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
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
        }

        const text = await resp.text();
        if (
          resp.status === 409 ||
          text.includes("duplicate") ||
          text.includes("unique")
        ) {
          // 중복 → 개별 업로드
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
            } catch {
              // skip
            }
          }
          break;
        }

        console.warn(`  배치 업로드 실패 (${resp.status}): ${text.slice(0, 200)}`);
        retries--;
        if (retries > 0) await sleep(2000);
      } catch (err) {
        console.warn(`  네트워크 에러: ${err.message}`);
        retries--;
        if (retries > 0) await sleep(2000);
      }
    }
  }

  return success;
}

// ============================================================
// 1. 행정규칙 수집
// ============================================================

async function fetchAdminRulesList() {
  console.log("\n========================================");
  console.log("1. 행정규칙 목록 수집 시작");
  console.log("========================================");

  // 첫 페이지에서 totalCnt 확인
  const firstUrl = `${BASE}/lawSearch.do?OC=${OC}&target=admrul&type=XML&display=${DISPLAY}&page=1`;
  const firstXml = await fetchText(firstUrl);
  const totalCnt = parseInt(xmlVal(firstXml, "totalCnt"), 10);
  const totalPages = Math.ceil(totalCnt / DISPLAY);
  console.log(`총 ${totalCnt}건, ${totalPages} 페이지`);

  const items = [];

  for (let page = 1; page <= totalPages; page++) {
    const url = `${BASE}/lawSearch.do?OC=${OC}&target=admrul&type=XML&display=${DISPLAY}&page=${page}`;
    try {
      const xml = await fetchText(url);
      const entries = xmlList(xml, "admrul");

      for (const entry of entries) {
        const serialNo = xmlVal(entry, "행정규칙일련번호");
        const name = xmlVal(entry, "행정규칙명");
        const kind = xmlVal(entry, "행정규칙종류"); // 훈령, 예규, 고시
        const dept = xmlVal(entry, "소관부처명");
        const issueDateStr = xmlVal(entry, "발령일자");

        if (serialNo && name) {
          items.push({ serialNo, name, kind, dept, issueDateStr });
        }
      }

      if (page % 10 === 0 || page === totalPages) {
        console.log(`  목록 ${page}/${totalPages} 페이지 (누적 ${items.length}건)`);
      }
    } catch (err) {
      console.error(`  페이지 ${page} 에러: ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`행정규칙 목록 총 ${items.length}건 수집 완료`);
  return items;
}

async function fetchAdminRuleDetail(serialNo) {
  const url = `${BASE}/lawService.do?OC=${OC}&target=admrul&ID=${serialNo}&type=XML`;
  const xml = await fetchText(url);

  if (xml.includes("일치하는 행정규칙이 없습니다")) {
    return null;
  }

  const name = xmlVal(xml, "행정규칙명");
  const kind = xmlVal(xml, "행정규칙종류");
  const dept = xmlVal(xml, "소관부처명");

  // 조문내용 전부 수집
  const articles = xmlAllVals(xml, "조문내용");
  const content = articles.join("\n\n");

  return { name, kind, dept, content };
}

async function loadAdminRules() {
  const items = await fetchAdminRulesList();
  if (items.length === 0) {
    console.log("행정규칙 없음, 스킵");
    return;
  }

  // 이미 적재된 항목 필터링 (재개용)
  console.log("  기존 적재 데이터 확인 중...");
  const existing = await getExistingUris("admrul_");
  const todo = items.filter((it) => !existing.has(`admrul_${it.serialNo}`));
  console.log(`  이미 적재: ${existing.size}건, 신규 대상: ${todo.length}건`);

  if (todo.length === 0) {
    console.log("행정규칙 모두 이미 적재됨, 스킵");
    return;
  }

  console.log("\n행정규칙 상세 조회 및 적재 시작...");

  await processInParallel(
    todo,
    async (item) => {
      const detail = await fetchAdminRuleDetail(item.serialNo);
      if (!detail || !detail.content) return null;
      const entryType = detail.kind || item.kind || "행정규칙";
      return {
        category: "행정규칙",
        entry_type: entryType,
        title: detail.name || item.name,
        content: detail.content.slice(0, 50000),
        source: "법제처",
        source_uri: `admrul_${item.serialNo}`,
        statute_name: detail.name || item.name,
        article_name: null,
        related_laws: null,
      };
    },
    "행정규칙"
  );
}

// ============================================================
// 2. 법령해석례 수집
// ============================================================

async function fetchExpcList() {
  console.log("\n========================================");
  console.log("2. 법령해석례 목록 수집 시작");
  console.log("========================================");

  const firstUrl = `${BASE}/lawSearch.do?OC=${OC}&target=expc&type=XML&display=${DISPLAY}&page=1`;
  const firstXml = await fetchText(firstUrl);
  const totalCnt = parseInt(xmlVal(firstXml, "totalCnt"), 10);
  const totalPages = Math.ceil(totalCnt / DISPLAY);
  console.log(`총 ${totalCnt}건, ${totalPages} 페이지`);

  const items = [];

  for (let page = 1; page <= totalPages; page++) {
    const url = `${BASE}/lawSearch.do?OC=${OC}&target=expc&type=XML&display=${DISPLAY}&page=${page}`;
    try {
      const xml = await fetchText(url);
      const entries = xmlList(xml, "expc");

      for (const entry of entries) {
        const id = xmlVal(entry, "법령해석례일련번호");
        const title = xmlVal(entry, "안건명");
        const caseNo = xmlVal(entry, "안건번호");

        if (id && title) {
          items.push({ id, title, caseNo });
        }
      }

      if (page % 10 === 0 || page === totalPages) {
        console.log(`  목록 ${page}/${totalPages} 페이지 (누적 ${items.length}건)`);
      }
    } catch (err) {
      console.error(`  페이지 ${page} 에러: ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`법령해석례 목록 총 ${items.length}건 수집 완료`);
  return items;
}

async function fetchExpcDetail(id) {
  const url = `${BASE}/lawService.do?OC=${OC}&target=expc&ID=${id}&type=XML`;
  const xml = await fetchText(url);

  const title = xmlVal(xml, "안건명");
  const caseNo = xmlVal(xml, "안건번호");
  const question = xmlVal(xml, "질의요지");
  const answer = xmlVal(xml, "회답");
  const reason = xmlVal(xml, "이유");
  const interpreterName = xmlVal(xml, "해석기관명");
  const askerName = xmlVal(xml, "질의기관명");
  const interpretDate = xmlVal(xml, "해석일자");

  // 내용 구성: 질의요지 + 회답 + 이유
  const parts = [];
  if (question) parts.push(`[질의요지]\n${question}`);
  if (answer) parts.push(`[회답]\n${answer}`);
  if (reason) parts.push(`[이유]\n${reason}`);

  const content = parts.join("\n\n");

  return {
    title: title || `해석례 ${caseNo}`,
    content,
    caseNo,
    interpreterName,
    askerName,
    interpretDate,
  };
}

async function loadExpc() {
  const items = await fetchExpcList();
  if (items.length === 0) {
    console.log("법령해석례 없음, 스킵");
    return;
  }

  // 이미 적재된 항목 필터링 (재개용)
  console.log("  기존 적재 데이터 확인 중...");
  const existing = await getExistingUris("expc_");
  const todo = items.filter((it) => !existing.has(`expc_${it.id}`));
  console.log(`  이미 적재: ${existing.size}건, 신규 대상: ${todo.length}건`);

  if (todo.length === 0) {
    console.log("법령해석례 모두 이미 적재됨, 스킵");
    return;
  }

  console.log("\n법령해석례 상세 조회 및 적재 시작...");

  await processInParallel(
    todo,
    async (item) => {
      const detail = await fetchExpcDetail(item.id);
      if (!detail || !detail.content) return null;
      return {
        category: "법령해석례",
        entry_type: "해석례",
        title: detail.title,
        content: detail.content.slice(0, 50000),
        source: "법제처",
        source_uri: `expc_${item.id}`,
        statute_name: detail.title,
        article_name: detail.caseNo || null,
        related_laws: null,
      };
    },
    "법령해석례"
  );
}

// ============================================================
// 메인
// ============================================================

async function main() {
  console.log("==============================================");
  console.log("법제처 행정규칙 & 법령해석례 → Supabase 적재");
  console.log("==============================================");

  const startTime = Date.now();

  await loadAdminRules();
  await loadExpc();

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n전체 완료! (소요시간: ${elapsed}분)`);
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
