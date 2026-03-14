#!/usr/bin/env node
/**
 * 법원 실무준칙/예규/규칙 수집 -> Supabase legal_knowledge 적재
 *
 * 법제처 행정규칙 API (target=admrul, org=9740000)로 대법원 소관 현행 규정만 수집
 * 종류: 재판예규, 등기예규, 행정예규, 가족관계등록예규
 *
 * 적재 테이블: legal_knowledge
 *   category="실무준칙", source="court_practice"
 *
 * 사용법: node scripts/21_load_court_practice.mjs
 */

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const OC = "jeonwoochul0515";
const BASE = "http://www.law.go.kr/DRF";
const DISPLAY = 100;
const BATCH_SIZE = 100;
const COURT_ORG = "9740000";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── XML 파서 ──

function xmlVal(xml, tag) {
  const re = new RegExp(
    `<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    "i"
  );
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function xmlList(xml, tag) {
  const results = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

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

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "[$1]")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchText(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(2000 * (i + 1));
    }
  }
}

// ── Supabase 배치 업로드 ──

async function uploadBatch(rows) {
  if (!rows.length) return 0;
  const url = `${SUPABASE_URL}/rest/v1/legal_knowledge`;
  let success = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
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
      } else {
        const text = await resp.text();
        console.log(`  업로드 에러 ${resp.status}: ${text.slice(0, 200)}`);
        // 개별 삽입 폴백
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
      }
    } catch (err) {
      console.log(`  네트워크 에러: ${err.message}`);
    }
  }
  return success;
}

// ── 1단계: 목록 수집 ──

async function fetchAllCourtRules() {
  console.log("\n[1] 대법원 소관 행정규칙 목록 수집 (org=9740000, 현행만)");

  const firstUrl = `${BASE}/lawSearch.do?OC=${OC}&target=admrul&type=XML&display=${DISPLAY}&page=1&org=${COURT_ORG}`;
  const firstXml = await fetchText(firstUrl);
  const totalCnt = parseInt(xmlVal(firstXml, "totalCnt"), 10);
  const totalPages = Math.ceil(totalCnt / DISPLAY);
  console.log(`  총 ${totalCnt}건, ${totalPages} 페이지`);

  const items = new Map();

  for (let page = 1; page <= totalPages; page++) {
    const url = `${BASE}/lawSearch.do?OC=${OC}&target=admrul&type=XML&display=${DISPLAY}&page=${page}&org=${COURT_ORG}`;
    try {
      const xml = page === 1 ? firstXml : await fetchText(url);
      const entries = xmlList(xml, "admrul");

      for (const entry of entries) {
        if (xmlVal(entry, "현행연혁구분") !== "현행") continue;
        const serialNo = xmlVal(entry, "행정규칙일련번호");
        const name = xmlVal(entry, "행정규칙명");
        const kind = xmlVal(entry, "행정규칙종류");
        if (serialNo && name) {
          items.set(serialNo, { serialNo, name, kind });
        }
      }

      if (page % 5 === 0 || page === totalPages) {
        console.log(`  ${page}/${totalPages} 페이지 (현행 ${items.size}건)`);
      }
    } catch (err) {
      console.log(`  페이지 ${page} 에러: ${err.message}`);
    }
    if (page < totalPages) await sleep(800);
  }

  const result = Array.from(items.values());

  // 타입별 통계
  const typeCounts = {};
  for (const item of result) {
    typeCounts[item.kind] = (typeCounts[item.kind] || 0) + 1;
  }
  console.log(`\n  현행 ${result.length}건 수집 완료. 타입별:`);
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}건`);
  }

  return result;
}

// ── 2단계: 상세 조회 + 적재 ──

function mapEntryType(kind) {
  if (!kind) return "예규";
  if (kind.includes("재판")) return "재판예규";
  if (kind.includes("등기")) return "등기예규";
  if (kind.includes("가족")) return "가족관계등록예규";
  if (kind.includes("행정") && kind.includes("예규")) return "행정예규";
  if (kind.includes("송무")) return "송무예규";
  if (kind.includes("규칙")) return "규칙";
  if (kind.includes("훈령")) return "훈령";
  return kind;
}

async function fetchAndLoad(items) {
  console.log(`\n[2] 상세 조회 및 적재 (${items.length}건)`);

  let rows = [];
  let fetched = 0;
  let empty = 0;
  let errors = 0;
  let uploaded = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    try {
      const url = `${BASE}/lawService.do?OC=${OC}&target=admrul&ID=${item.serialNo}&type=XML`;
      const xml = await fetchText(url);

      if (xml.includes("일치하는 행정규칙이 없습니다")) {
        errors++;
        continue;
      }

      const name = xmlVal(xml, "행정규칙명") || item.name;
      const kind = xmlVal(xml, "행정규칙종류") || item.kind;
      const issueNo = xmlVal(xml, "발령번호");
      const issueDate = xmlVal(xml, "발령일자");
      const effectDate = xmlVal(xml, "시행일자");
      const revision = xmlVal(xml, "제개정구분명");
      const deptName = xmlVal(xml, "담당부서기관명");

      // 조문내용 수집
      const articles = xmlAllVals(xml, "조문내용").map(stripHtml).filter(Boolean);
      const appendices = xmlAllVals(xml, "부칙내용").map(stripHtml).filter(Boolean);

      let content = articles.join("\n\n");
      if (appendices.length > 0) {
        content += "\n\n[부칙]\n" + appendices.join("\n\n");
      }

      const entryType = mapEntryType(kind);

      // 메타 헤더
      const meta = [
        issueNo ? `발령번호: ${issueNo}` : "",
        issueDate ? `발령일자: ${issueDate}` : "",
        effectDate && effectDate !== "99991231" ? `시행일자: ${effectDate}` : "",
        revision ? `${revision}` : "",
        deptName ? `담당: ${deptName}` : "",
      ].filter(Boolean).join(" | ");

      if (!content || content.length < 10) {
        // 메타만 적재
        content = `[${entryType}] ${name}\n${meta}`;
        empty++;
      } else {
        content = meta ? `[${meta}]\n\n${content}` : content;
      }

      rows.push({
        category: "실무준칙",
        title: name,
        content: content.slice(0, 50000),
        source: "court_practice",
        source_uri: `admrul_${item.serialNo}`,
        statute_name: name,
        article_name: issueNo ? `${entryType} 제${issueNo}호` : null,
        entry_type: entryType,
        related_laws: null,
      });
      fetched++;
    } catch (err) {
      errors++;
    }

    // 진행률
    if ((i + 1) % 50 === 0 || i + 1 === items.length) {
      console.log(`  ${i + 1}/${items.length} (성공: ${fetched}, 빈내용: ${empty}, 에러: ${errors})`);
    }

    // 배치 업로드
    if (rows.length >= 200) {
      const n = await uploadBatch(rows);
      uploaded += n;
      console.log(`  -> ${n}건 업로드`);
      rows = [];
    }

    await sleep(250);
  }

  // 잔여분
  if (rows.length > 0) {
    const n = await uploadBatch(rows);
    uploaded += n;
    console.log(`  -> 잔여 ${n}건 업로드`);
  }

  return { fetched, empty, errors, uploaded };
}

// ── 메인 ──

async function main() {
  console.log("=".repeat(56));
  console.log("법원 실무준칙(예규/규칙) -> Supabase legal_knowledge 적재");
  console.log("=".repeat(56));

  const t0 = Date.now();

  // glaw.scourt.go.kr 접근 확인
  console.log("\n[0] 대법원 종합법률정보 접근 확인");
  for (const u of ["https://glaw.scourt.go.kr", "https://www.scourt.go.kr"]) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      console.log(`  ${u}: HTTP ${r.status}`);
    } catch (e) {
      console.log(`  ${u}: 접근 불가 (${e.message.slice(0, 40)})`);
    }
  }

  // 법제처 API 수집
  const items = await fetchAllCourtRules();
  if (items.length === 0) {
    console.log("수집 대상 없음");
    return;
  }

  const result = await fetchAndLoad(items);

  const elapsed = ((Date.now() - t0) / 1000 / 60).toFixed(1);
  console.log("\n" + "=".repeat(56));
  console.log(`완료! (${elapsed}분)`);
  console.log(`  목록: ${items.length}건`);
  console.log(`  적재: ${result.uploaded}건 (내용있음: ${result.fetched - result.empty}, 메타만: ${result.empty})`);
  console.log(`  에러: ${result.errors}건`);
  console.log("=".repeat(56));

  console.log("\n[수집 결과 요약]");
  console.log("  수집 완료: 법제처 행정규칙 API (대법원 소관 현행 예규/규칙)");
  console.log("    - 재판예규, 등기예규, 행정예규, 가족관계등록예규");
  console.log("  접근 제한: 대법원 종합법률정보 (glaw.scourt.go.kr)");
  console.log("    - API 미공개, 웹 스크래핑 필요");
}

main().catch((err) => {
  console.error("치명적 에러:", err);
  process.exit(1);
});
