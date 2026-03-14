#!/usr/bin/env node
/**
 * 법제처 판례 Open API → Supabase cases 테이블 적재
 *
 * Phase 1: 목록 API로 전체 판례 적재 (병렬 업로드)
 * Phase 2: 대법원 출처 판례만 상세 API로 보강
 *
 * 핵심: Supabase REST 연결풀이 단일 요청에서 8s timeout 발생.
 * 동시 병렬 요청(10+개)을 보내면 300ms 이내로 성공.
 * 따라서 모든 업로드는 반드시 병렬로 처리.
 *
 * source: "law_go_kr_prec"
 * 사용법: node scripts/14_load_supreme_court.mjs
 */

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const OC = "jeonwoochul0515";
const LIST_URL = `http://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=prec&type=XML&display=100`;
const DETAIL_URL = `http://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=prec&type=XML`;
const SOURCE = "law_go_kr_prec";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal,resolution=ignore-duplicates",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── XML 파싱 ───

function getTag(xml, tag) {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`);
  const m = xml.match(re);
  if (!m) return null;
  let val = m[1].trim();
  if (val.startsWith("<![CDATA[")) val = val.slice(9);
  if (val.endsWith("]]>")) val = val.slice(0, -3);
  return val || null;
}

function getAllBlocks(xml, tag) {
  const blocks = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  let m;
  while ((m = re.exec(xml)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

function stripHtml(html) {
  if (!html) return null;
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() || null;
}

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(/\./g, "").replace(/-/g, "");
  if (cleaned.length === 8)
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  const m = dateStr.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

// ─── 목록 페이지 조회 ───

async function fetchListPage(page) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${LIST_URL}&page=${page}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();
    const totalCnt = parseInt(getTag(xml, "totalCnt") || "0", 10);
    const precs = getAllBlocks(xml, "prec");
    const items = precs.map((block) => ({
      precSeq: getTag(block, "판례일련번호"),
      caseName: getTag(block, "사건명"),
      caseNumber: getTag(block, "사건번호"),
      date: getTag(block, "선고일자"),
      courtName: getTag(block, "법원명"),
      caseTypeName: getTag(block, "사건종류명"),
      caseTypeCode: getTag(block, "사건종류코드"),
      judgmentType: getTag(block, "판결유형"),
      songo: getTag(block, "선고"),
      dataSource: getTag(block, "데이터출처명"),
    }));
    return { totalCnt, items };
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ─── 상세 조회 ───

async function fetchDetail(precSeq) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(`${DETAIL_URL}&ID=${precSeq}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const xml = await resp.text();
    if (xml.includes("일치하는 판례가 없습니다")) return null;
    return {
      panSiSahang: getTag(xml, "판시사항"),
      panGyulYoji: getTag(xml, "판결요지"),
      chamjoJomun: getTag(xml, "참조조문"),
      chamjoPanrye: getTag(xml, "참조판례"),
      panryeNaeyong: getTag(xml, "판례내용"),
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ─── 목록 데이터로 행 생성 ───

function buildRowFromList(item) {
  const caseNum = item.caseNumber || item.precSeq;
  if (!caseNum) return null;
  const caseNumber = `lawgo_${caseNum.replace(/\s+/g, "")}`;
  const categoryMap = {
    민사: "민사", 형사: "형사", 일반행정: "행정",
    세무: "세무", 특허: "특허", 가사: "가사", 군사: "군사",
  };
  const category = categoryMap[item.caseTypeName] || item.caseTypeName || "기타";
  let court = item.courtName || null;
  if (!court && caseNum) {
    if (caseNum.startsWith("대법원") || /^\d{4}다\d+/.test(caseNum)) court = "대법원";
    else {
      const cm = caseNum.match(/^([가-힣]+(?:법원|지원))/);
      if (cm) court = cm[1];
    }
  }
  return {
    case_number: caseNumber,
    court: court || "미상",
    case_date: normalizeDate(item.date),
    category,
    summary: item.caseName || null,
    key_issues: null,
    statutes: null,
    full_text: null,
    raw_json: {
      precSeq: item.precSeq, caseName: item.caseName,
      caseNumber: item.caseNumber, courtName: item.courtName,
      caseTypeName: item.caseTypeName, caseTypeCode: item.caseTypeCode,
      judgmentType: item.judgmentType, songo: item.songo,
      dataSource: item.dataSource,
    },
    source: SOURCE,
  };
}

// ─── 병렬 업로드 (핵심: 반드시 10+ 동시 요청) ───
//
// Supabase 연결풀 특성상 단일 요청은 8s timeout 발생.
// 10개 이상 동시 요청 시 300ms 이내 성공.
// 따라서 각 업로드 배치를 1행씩 분리하여 10개씩 동시 전송.

async function uploadRowsParallel(rows) {
  const url = `${SUPABASE_URL}/rest/v1/cases`;
  const warmUrl = `${SUPABASE_URL}/rest/v1/cases?select=id&limit=1`;
  const warmHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  let success = 0;
  let failed = 0;

  // 연결풀 워밍업: 더미 SELECT로 cold connection 제거 (2초 대기)
  await fetch(warmUrl, { headers: warmHeaders }).then((r) => r.text()).catch(() => null);

  // 배치 크기 10 (ivfflat 인덱스로 인해 20+ 행은 8s timeout 발생)
  const BATCH = 10;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);

    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 12000);
      const resp = await fetch(url, {
        method: "POST",
        headers: SUPABASE_HEADERS,
        body: JSON.stringify(chunk),
        signal: c.signal,
      });
      clearTimeout(t);

      if (resp.ok) {
        success += chunk.length;
      } else {
        const text = await resp.text();
        if (text.includes("duplicate") || text.includes("unique")) {
          // 배치 중 중복 → 개별 삽입
          for (const row of chunk) {
            try {
              const r2 = await fetch(url, {
                method: "POST",
                headers: SUPABASE_HEADERS,
                body: JSON.stringify([row]),
              });
              if (r2.ok) success++;
            } catch {}
          }
        } else if (text.includes("timeout")) {
          // 타임아웃 → 워밍업 후 개별 재시도
          await fetch(warmUrl, { headers: warmHeaders }).then((r) => r.text()).catch(() => null);
          for (const row of chunk) {
            try {
              const r2 = await fetch(url, {
                method: "POST",
                headers: SUPABASE_HEADERS,
                body: JSON.stringify([row]),
              });
              if (r2.ok) success++;
              else failed++;
            } catch {
              failed++;
            }
          }
        } else {
          failed += chunk.length;
        }
      }
    } catch {
      // 네트워크 에러 → 워밍업 후 재시도
      await fetch(warmUrl, { headers: warmHeaders }).then((r) => r.text()).catch(() => null);
      for (const row of chunk) {
        try {
          const r2 = await fetch(url, {
            method: "POST",
            headers: SUPABASE_HEADERS,
            body: JSON.stringify([row]),
          });
          if (r2.ok) success++;
          else failed++;
        } catch {
          failed++;
        }
      }
    }
  }

  return { success, failed };
}

// ─── 기존 데이터 로드 ───

async function loadExistingIds() {
  const ids = new Set();
  let offset = 0;
  while (true) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/cases?select=case_number&source=eq.${SOURCE}&offset=${offset}&limit=1000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!resp.ok) break;
    const data = await resp.json();
    if (data.length === 0) break;
    for (const row of data) ids.add(row.case_number);
    offset += 1000;
    if (data.length < 1000) break;
  }
  return ids;
}

// ─── Phase 1 ───

async function phase1() {
  console.log("\n--- Phase 1: 목록 API 일괄 적재 ---\n");

  const existingIds = await loadExistingIds();
  console.log(`기존 데이터: ${existingIds.size.toLocaleString()}건`);

  const firstPage = await fetchListPage(1);
  const totalCnt = firstPage.totalCnt;
  const totalPages = Math.ceil(totalCnt / 100);
  console.log(`전체 판례: ${totalCnt.toLocaleString()}건 (${totalPages} 페이지)\n`);

  let totalProcessed = 0;
  let totalNew = 0;
  let totalSkipped = 0;
  let totalUploaded = 0;
  let totalFailed = 0;
  let pendingRows = [];
  const detailCandidates = [];

  function processPage(pageData) {
    for (const item of pageData.items) {
      totalProcessed++;
      const testKey = `lawgo_${(item.caseNumber || item.precSeq || "").replace(/\s+/g, "")}`;
      if (existingIds.has(testKey)) {
        totalSkipped++;
        continue;
      }
      const row = buildRowFromList(item);
      if (row) {
        pendingRows.push(row);
        existingIds.add(row.case_number);
        totalNew++;
        if (item.dataSource === "대법원" && item.precSeq) {
          detailCandidates.push({ precSeq: item.precSeq, caseNumber: row.case_number });
        }
      }
    }
  }

  async function flushPending() {
    if (pendingRows.length === 0) return;
    const batch = pendingRows.splice(0);
    const { success, failed } = await uploadRowsParallel(batch);
    totalUploaded += success;
    totalFailed += failed;
  }

  processPage(firstPage);

  // 3페이지씩 병렬 수집
  const PAGE_PARALLEL = 3;
  let uploadTask = Promise.resolve();

  for (let ps = 2; ps <= totalPages; ps += PAGE_PARALLEL) {
    const pe = Math.min(ps + PAGE_PARALLEL - 1, totalPages);

    // 페이지 수집 + 이전 업로드 동시 진행
    const [pages] = await Promise.all([
      Promise.all(
        Array.from({ length: pe - ps + 1 }, (_, i) =>
          fetchListPage(ps + i).catch(() =>
            sleep(2000).then(() =>
              fetchListPage(ps + i).catch(() => ({ totalCnt: 0, items: [] }))
            )
          )
        )
      ),
      uploadTask,
    ]);

    for (const pd of pages) processPage(pd);

    // 60건 이상 쌓이면 업로드
    if (pendingRows.length >= 60) {
      uploadTask = flushPending();
    }

    // API rate limit: 3페이지당 500ms
    await sleep(500);

    // 진행률 (15페이지마다)
    if (pe % 15 === 0 || pe >= totalPages) {
      await uploadTask;
      const pct = ((pe / totalPages) * 100).toFixed(1);
      console.log(
        `  [${pct}%] p${pe}/${totalPages} | ` +
        `처리: ${totalProcessed.toLocaleString()} | ` +
        `신규: ${totalNew.toLocaleString()} | ` +
        `업로드: ${totalUploaded.toLocaleString()} | ` +
        `실패: ${totalFailed} | ` +
        `대법원: ${detailCandidates.length}`
      );
    }
  }

  await uploadTask;
  await flushPending();

  console.log(
    `\nPhase 1 완료: 업로드 ${totalUploaded.toLocaleString()}건, ` +
    `스킵 ${totalSkipped.toLocaleString()}건, 실패 ${totalFailed}건`
  );
  console.log(`대법원 상세 보강 후보: ${detailCandidates.length}건\n`);

  return detailCandidates;
}

// ─── Phase 2 ───

async function phase2(candidates) {
  if (candidates.length === 0) {
    console.log("--- Phase 2: 보강 대상 없음 ---");
    return;
  }

  console.log(`--- Phase 2: 대법원 상세 보강 (${candidates.length}건) ---\n`);

  let enriched = 0;
  let failed = 0;
  const url = `${SUPABASE_URL}/rest/v1/cases`;

  // 5개씩 병렬 상세조회 + 패치
  const DETAIL_PARALLEL = 5;

  for (let i = 0; i < candidates.length; i += DETAIL_PARALLEL) {
    const batch = candidates.slice(i, i + DETAIL_PARALLEL);

    const results = await Promise.allSettled(
      batch.map(async ({ precSeq, caseNumber }) => {
        const detail = await fetchDetail(precSeq);
        if (!detail) return false;

        const summaryParts = [];
        if (detail.panSiSahang) summaryParts.push(stripHtml(detail.panSiSahang));
        if (detail.panGyulYoji) summaryParts.push(stripHtml(detail.panGyulYoji));
        const summary = summaryParts.filter(Boolean).join("\n\n").slice(0, 50000) || null;
        const fullText = detail.panryeNaeyong
          ? stripHtml(detail.panryeNaeyong)?.slice(0, 15000) || null : null;
        const statutes = detail.chamjoJomun
          ? (() => {
              const c = stripHtml(detail.chamjoJomun);
              if (!c) return null;
              const p = c.split(/[/,;\n]/)
                .map((s) => s.replace(/^\s*\[\d+\]\s*/, "").trim())
                .filter((s) => s.length > 0 && s.length < 200);
              return p.length > 0 ? p : null;
            })() : null;
        const keyIssues = detail.chamjoPanrye
          ? [stripHtml(detail.chamjoPanrye)].filter(Boolean) : null;

        const updates = {};
        if (summary) updates.summary = summary;
        if (fullText) updates.full_text = fullText;
        if (statutes) updates.statutes = statutes;
        if (keyIssues && keyIssues.length > 0) updates.key_issues = keyIssues;

        if (Object.keys(updates).length === 0) return false;

        const patchUrl = `${url}?case_number=eq.${encodeURIComponent(caseNumber)}`;
        const resp = await fetch(patchUrl, {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(updates),
        });
        return resp.ok;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) enriched++;
      else failed++;
    }

    await sleep(1000);

    if ((i + DETAIL_PARALLEL) % 50 < DETAIL_PARALLEL || i + DETAIL_PARALLEL >= candidates.length) {
      const done = Math.min(i + DETAIL_PARALLEL, candidates.length);
      const pct = ((done / candidates.length) * 100).toFixed(1);
      console.log(
        `  [${pct}%] ${done}/${candidates.length} | 보강: ${enriched} | 실패: ${failed}`
      );
    }
  }

  console.log(`\nPhase 2 완료: 보강 ${enriched}건, 실패 ${failed}건`);
}

// ─── 메인 ───

async function main() {
  console.log("=".repeat(60));
  console.log("법제처 판례 Open API → Supabase cases 테이블");
  console.log("=".repeat(60));

  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/cases?select=id&limit=1`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!checkResp.ok) {
    console.error("cases 테이블 접근 실패:", await checkResp.text());
    process.exit(1);
  }
  console.log("cases 테이블 확인 완료");

  const detailCandidates = await phase1();
  await phase2(detailCandidates);

  // 최종 확인
  const countResp = await fetch(
    `${SUPABASE_URL}/rest/v1/cases?select=id&source=eq.${SOURCE}&limit=0`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "count=exact",
      },
    }
  );
  const range = countResp.headers.get("content-range");
  const total = range ? range.split("/")[1] : "?";

  console.log("\n" + "=".repeat(60));
  console.log(`Supabase cases 테이블 law_go_kr_prec 총 건수: ${total}`);
  console.log("=".repeat(60));
}

main().catch(console.error);
