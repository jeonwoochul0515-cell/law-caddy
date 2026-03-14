#!/usr/bin/env node
/**
 * 행정심판·심결례 수집 → Supabase cases 테이블 적재
 *
 * 2단계 수집:
 *   Phase 1: 법제처 판례(prec) API에서 행정심판 관련 검색어로 수집
 *   Phase 2: 법제처 결정례(detc) API에서 헌재결정례 전체 수집
 *
 * source 값:
 *   - ftc_심결례: 공정거래위원회 관련
 *   - patent_심결례: 특허심판원 관련
 *   - simpan_재결례: 중앙행정심판위원회 관련
 *   - rights_결정례: 국민권익위원회 관련
 *   - tax_결정례: 조세심판원 관련
 *   - detc_결정례: 헌재결정례
 *
 * 사용법: node scripts/19_load_tribunal_decisions.mjs
 */

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const OC = "jeonwoochul0515";
const BASE_URL = "http://www.law.go.kr/DRF";
const BATCH_SIZE = 100;
const DELAY_MS = 1000;

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Phase 1: 판례(prec) API 검색어 ───

const PREC_QUERIES = [
  // 공정거래위원회 심결례
  { query: "과징금", label: "ftc" },
  { query: "시정명령", label: "ftc" },
  { query: "공정거래위원회", label: "ftc" },
  { query: "부당공동행위", label: "ftc" },
  { query: "불공정거래", label: "ftc" },
  // 특허심판원 심결례
  { query: "심결", label: "patent" },
  { query: "특허무효", label: "patent" },
  { query: "거절결정", label: "patent" },
  { query: "등록무효", label: "patent" },
  // 중앙행정심판위원회 재결례
  { query: "재결", label: "simpan" },
  { query: "행정심판", label: "simpan" },
  // 국민권익위원회 결정례
  { query: "국민권익위원회", label: "rights" },
  { query: "고충민원", label: "rights" },
  // 조세심판원 결정례
  { query: "조세심판원", label: "tax" },
  { query: "심판청구", label: "tax" },
];

// ─── XML 파싱 헬퍼 ───

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
  while ((m = re.exec(xml)) !== null) blocks.push(m[1]);
  return blocks;
}

function stripHtml(html) {
  if (!html) return null;
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() || null;
}

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(/\./g, "").replace(/-/g, "");
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  const m = dateStr.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

function parseStatutes(chamjoJomun) {
  if (!chamjoJomun) return null;
  const cleaned = stripHtml(chamjoJomun);
  if (!cleaned) return null;
  const parts = cleaned
    .split(/[/,;\n]/)
    .map((s) => s.replace(/^\s*\[\d+\]\s*/, "").trim())
    .filter((s) => s.length > 0 && s.length < 200);
  return parts.length > 0 ? parts : null;
}

// ─── source 분류 로직 ───

function classifySource(item, detail, searchLabel) {
  const allText = [
    item.caseName, item.caseTypeName, item.courtName,
    detail?.panGyulYoji, detail?.panSiSahang
  ].filter(Boolean).join(" ");

  if (
    item.caseTypeName === "특허" ||
    /특허심판|특허무효|거절결정|등록무효|실용신안|디자인|상표/.test(allText) ||
    /\d{4}후\d+/.test(item.caseNumber || "") ||
    /특허법원/.test(item.courtName || "")
  ) return "patent_심결례";

  if (
    item.caseTypeName === "세무" ||
    /조세심판|국세|지방세|부가가치세|법인세|소득세|상속세|증여세/.test(allText)
  ) return "tax_결정례";

  if (
    /공정거래|과징금|시정명령|부당공동행위|불공정거래|시장지배|독점규제/.test(allText)
  ) return "ftc_심결례";

  if (/국민권익|고충민원|부패방지|권익위/.test(allText)) return "rights_결정례";

  if (
    /재결|행정심판|처분취소|면허취소|영업정지|허가취소/.test(allText) ||
    item.caseTypeName === "일반행정"
  ) return "simpan_재결례";

  const labelMap = {
    ftc: "ftc_심결례", patent: "patent_심결례", simpan: "simpan_재결례",
    rights: "rights_결정례", tax: "tax_결정례",
  };
  return labelMap[searchLabel] || "simpan_재결례";
}

// ─── prec 목록 API ───

async function fetchPrecList(query, page) {
  const url = `${BASE_URL}/lawSearch.do?OC=${OC}&target=prec&type=XML&display=100&page=${page}&query=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) { await sleep(3000 * (attempt + 1)); continue; }
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
      await sleep(3000 * (attempt + 1));
    }
  }
  return { totalCnt: 0, items: [] };
}

// ─── prec 상세 API ───

async function fetchPrecDetail(precSeq) {
  const url = `${BASE_URL}/lawService.do?OC=${OC}&target=prec&type=XML&ID=${precSeq}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) { await sleep(2000 * (attempt + 1)); continue; }
      const xml = await resp.text();
      if (xml.includes("일치하는 판례가 없습니다")) return null;
      return {
        panSiSahang: getTag(xml, "판시사항"),
        panGyulYoji: getTag(xml, "판결요지"),
        chamjoJomun: getTag(xml, "참조조문"),
        chamjoPanrye: getTag(xml, "참조판례"),
        panryeNaeyong: getTag(xml, "판례내용"),
      };
    } catch { await sleep(2000 * (attempt + 1)); }
  }
  return null;
}

// ─── prec -> cases 행 빌드 ───

function buildPrecRow(item, detail, source) {
  const caseNum = item.caseNumber || item.precSeq;
  if (!caseNum) return null;

  const caseNumber = `tribunal_${caseNum.replace(/\s+/g, "")}`;

  const summaryParts = [];
  if (detail?.panSiSahang) summaryParts.push(stripHtml(detail.panSiSahang));
  if (detail?.panGyulYoji) summaryParts.push(stripHtml(detail.panGyulYoji));
  if (summaryParts.length === 0 && item.caseName) summaryParts.push(item.caseName);
  const summary = summaryParts.filter(Boolean).join("\n\n").slice(0, 50000) || null;

  const fullText = detail?.panryeNaeyong
    ? stripHtml(detail.panryeNaeyong)?.slice(0, 100000) || null : null;
  const statutes = parseStatutes(detail?.chamjoJomun);
  const keyIssues = detail?.chamjoPanrye
    ? [stripHtml(detail.chamjoPanrye)].filter(Boolean) : null;

  let court = item.courtName || null;
  if (!court) {
    const cn = item.caseNumber || "";
    if (/^\d{4}[다두]\d+/.test(cn)) court = "대법원";
    else if (/특허법원/.test(cn)) court = "특허법원";
    else { const m = cn.match(/^([가-힣]+(?:법원|지원))/); if (m) court = m[1]; }
  }

  const categoryMap = {
    "ftc_심결례": "공정거래", "patent_심결례": "특허", "simpan_재결례": "행정심판",
    "rights_결정례": "권익구제", "tax_결정례": "조세",
  };

  return {
    case_number: caseNumber,
    court: court || "미상",
    case_date: normalizeDate(item.date),
    category: categoryMap[source] || item.caseTypeName || "행정",
    summary,
    key_issues: keyIssues,
    statutes,
    full_text: fullText,
    raw_json: {
      precSeq: item.precSeq, caseName: item.caseName, caseNumber: item.caseNumber,
      courtName: item.courtName, caseTypeName: item.caseTypeName,
      judgmentType: item.judgmentType, dataSource: item.dataSource, tribunalSource: source,
      ...(detail ? {
        panSiSahang: stripHtml(detail.panSiSahang),
        panGyulYoji: stripHtml(detail.panGyulYoji),
        chamjoJomun: stripHtml(detail.chamjoJomun),
      } : {}),
    },
    source,
  };
}

// ─── detc 목록 API ───

async function fetchDetcList(page) {
  const url = `${BASE_URL}/lawSearch.do?OC=${OC}&target=detc&type=XML&display=100&page=${page}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) { await sleep(3000 * (attempt + 1)); continue; }
      const text = await resp.text();
      const totalMatch = text.match(/<totalCnt>(\d+)<\/totalCnt>/);
      const totalCnt = totalMatch ? parseInt(totalMatch[1]) : 0;
      const items = [];
      const regex = /<Detc\s[^>]*>[\s\S]*?<\/Detc>/gi;
      let m;
      while ((m = regex.exec(text)) !== null) {
        const block = m[0];
        const get = (tag) => {
          const r = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))
            || block.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`));
          return r ? r[1].trim() : "";
        };
        const id = get("헌재결정례일련번호");
        const title = get("사건명");
        const caseNum = get("사건번호");
        const date = get("종국일자");
        if (id) items.push({ id, title, caseNum, date });
      }
      return { totalCnt, items };
    } catch (e) {
      await sleep(3000 * (attempt + 1));
    }
  }
  return { totalCnt: 0, items: [] };
}

// ─── detc 상세 API ───

async function fetchDetcDetail(detcId) {
  const url = `${BASE_URL}/lawService.do?OC=${OC}&target=detc&type=XML&ID=${detcId}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) { await sleep(2000 * (attempt + 1)); continue; }
      const text = await resp.text();
      const get = (tag) => {
        const r = text.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))
          || text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
        return r ? r[1].trim() : "";
      };
      return {
        title: get("사건명"),
        caseNum: get("사건번호"),
        date: get("종국일자"),
        caseType: get("사건종류명"),
        opinion: get("판시사항"),
        summary: get("결정요지"),
        fullText: get("전문"),
        refArticles: get("참조조문"),
        refCases: get("참조판례"),
        targetArticles: get("심판대상조문"),
      };
    } catch { await sleep(2000 * (attempt + 1)); }
  }
  return null;
}

// ─── detc -> cases 행 빌드 ───

function buildDetcRow(item, detail) {
  const caseNum = detail?.caseNum || item.caseNum || item.id;
  if (!caseNum) return null;

  const caseNumber = `detc_${caseNum.replace(/\s+/g, "")}`;

  const summaryParts = [];
  if (detail?.opinion) summaryParts.push(stripHtml(detail.opinion));
  if (detail?.summary) summaryParts.push(stripHtml(detail.summary));
  if (summaryParts.length === 0 && (detail?.title || item.title))
    summaryParts.push(detail?.title || item.title);
  const summary = summaryParts.filter(Boolean).join("\n\n").slice(0, 50000) || null;

  let fullText = null;
  if (detail?.fullText) fullText = stripHtml(detail.fullText)?.slice(0, 100000) || null;

  const statutes = parseStatutes(detail?.refArticles);
  const keyIssues = detail?.refCases
    ? [stripHtml(detail.refCases)].filter(Boolean) : null;

  const dateStr = detail?.date || item.date;

  return {
    case_number: caseNumber,
    court: "헌법재판소",
    case_date: normalizeDate(dateStr),
    category: detail?.caseType || "헌법",
    summary,
    key_issues: keyIssues,
    statutes,
    full_text: fullText,
    raw_json: {
      detcId: item.id, title: detail?.title || item.title,
      caseNum: detail?.caseNum || item.caseNum,
      caseType: detail?.caseType,
      targetArticles: detail?.targetArticles ? stripHtml(detail.targetArticles) : null,
    },
    source: "detc_결정례",
  };
}

// ─── 배치 업로드 ───

async function uploadBatch(rows) {
  const url = `${SUPABASE_URL}/rest/v1/cases`;
  let success = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    let retries = 3;

    while (retries > 0) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { ...HEADERS, Prefer: "return=minimal,resolution=ignore-duplicates" },
          body: JSON.stringify(batch),
        });
        if (resp.ok) { success += batch.length; break; }
        const text = await resp.text();
        if (text.includes("duplicate") || text.includes("unique") || resp.status === 409) {
          for (const row of batch) {
            try {
              const r2 = await fetch(url, {
                method: "POST",
                headers: { ...HEADERS, Prefer: "return=minimal,resolution=ignore-duplicates" },
                body: JSON.stringify([row]),
              });
              if (r2.ok) success++;
            } catch {}
          }
          break;
        }
        console.log(`  업로드 에러 [${i}]: ${resp.status} - ${text.slice(0, 200)}`);
        retries--;
        if (retries > 0) await sleep(2000);
      } catch (e) {
        retries--;
        if (retries > 0) await sleep(2000);
        else console.log(`  업로드 실패: ${e.message?.slice(0, 100)}`);
      }
    }
  }
  return success;
}

// ─── 기존 case_number 로드 ───

async function loadExistingIds(sources) {
  const ids = new Set();
  for (const source of sources) {
    let offset = 0;
    while (true) {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/cases?select=case_number&source=eq.${encodeURIComponent(source)}&offset=${offset}&limit=1000`,
        { headers: HEADERS }
      );
      if (!resp.ok) break;
      const data = await resp.json();
      if (data.length === 0) break;
      for (const row of data) ids.add(row.case_number);
      offset += 1000;
      if (data.length < 1000) break;
    }
  }
  return ids;
}

// ─── Phase 1: prec API 수집 ───

async function collectPrec(existingIds) {
  console.log("\n--- Phase 1: 판례(prec) API 행정심판 관련 검색어 수집 ---\n");

  const seenPrecSeqs = new Set();
  let allRows = [];
  let totalNew = 0;
  let totalSkip = 0;
  let totalDetail = 0;

  for (const { query, label } of PREC_QUERIES) {
    const first = await fetchPrecList(query, 1);
    await sleep(DELAY_MS);
    if (first.totalCnt === 0) {
      console.log(`  "${query}": 0건 (스킵)`);
      continue;
    }
    const totalPages = Math.ceil(first.totalCnt / 100);
    console.log(`  "${query}": ${first.totalCnt.toLocaleString()}건 (${totalPages}p)`);

    let newCount = 0;
    let skipCount = 0;

    for (let page = 1; page <= totalPages; page++) {
      let pageData;
      try {
        pageData = page === 1 ? first : await fetchPrecList(query, page);
        if (page > 1) await sleep(DELAY_MS);
      } catch {
        await sleep(3000);
        try { pageData = await fetchPrecList(query, page); await sleep(DELAY_MS); }
        catch { continue; }
      }

      for (const item of pageData.items) {
        if (seenPrecSeqs.has(item.precSeq)) { skipCount++; continue; }
        seenPrecSeqs.add(item.precSeq);

        const testId = `tribunal_${(item.caseNumber || item.precSeq || "").replace(/\s+/g, "")}`;
        if (existingIds.has(testId)) { skipCount++; continue; }

        let detail = null;
        if (item.dataSource === "대법원" && item.precSeq) {
          try {
            detail = await fetchPrecDetail(item.precSeq);
            if (detail) totalDetail++;
            await sleep(DELAY_MS);
          } catch {}
        }

        const source = classifySource(item, detail, label);
        const row = buildPrecRow(item, detail, source);
        if (row) {
          allRows.push(row);
          existingIds.add(row.case_number);
          newCount++;
        }
      }
    }

    totalNew += newCount;
    totalSkip += skipCount;
    console.log(`    -> 수집: ${newCount}건, 스킵: ${skipCount}건`);

    // 중간 업로드
    if (allRows.length >= 500) {
      console.log(`    [업로드] ${allRows.length}건...`);
      const up = await uploadBatch(allRows);
      console.log(`    완료: ${up}건`);
      allRows = [];
    }
  }

  // 남은 데이터 업로드
  if (allRows.length > 0) {
    console.log(`  [최종 업로드] ${allRows.length}건...`);
    const up = await uploadBatch(allRows);
    console.log(`  완료: ${up}건`);
  }

  console.log(`\n  Phase 1 합계: 신규 ${totalNew}건, 스킵 ${totalSkip}건, 상세 ${totalDetail}건`);
  return totalNew;
}

// ─── Phase 2: detc API 수집 ───

async function collectDetc(existingIds) {
  console.log("\n--- Phase 2: 결정례(detc) API 헌재결정례 수집 ---\n");

  const first = await fetchDetcList(1);
  const totalCnt = first.totalCnt;
  const totalPages = Math.ceil(totalCnt / 100);
  console.log(`  전체 ${totalCnt.toLocaleString()}건, ${totalPages}페이지\n`);

  let loaded = 0;
  let skipped = 0;
  let emptyContent = 0;
  let allRows = [];
  const startTime = Date.now();

  for (let page = 1; page <= totalPages; page++) {
    const { items } = page === 1 ? first : await fetchDetcList(page);
    if (page > 1) await sleep(DELAY_MS);
    if (!items.length) continue;

    for (const item of items) {
      const testId = `detc_${(item.caseNum || item.id || "").replace(/\s+/g, "")}`;
      if (existingIds.has(testId)) { skipped++; continue; }

      await sleep(200);
      const detail = await fetchDetcDetail(item.id);
      if (!detail) { emptyContent++; continue; }

      const row = buildDetcRow(item, detail);
      if (!row || !row.summary) { emptyContent++; continue; }

      allRows.push(row);
      existingIds.add(row.case_number);
    }

    // 중간 업로드
    if (allRows.length >= BATCH_SIZE) {
      const up = await uploadBatch(allRows);
      loaded += up;
      allRows = [];
    }

    // 진행률
    if (page % 10 === 0 || page === totalPages) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(`  페이지 ${page}/${totalPages}: ${loaded}건 적재, ${skipped}건 중복, ${emptyContent}건 빈내용 (${elapsed}분)`);
    }
  }

  if (allRows.length > 0) {
    const up = await uploadBatch(allRows);
    loaded += up;
  }

  console.log(`\n  Phase 2 합계: 적재 ${loaded}건, 중복 ${skipped}건, 빈내용 ${emptyContent}건`);
  return loaded;
}

// ─── 메인 ───

async function main() {
  console.log("=".repeat(60));
  console.log("행정심판·심결례 수집 → Supabase cases 테이블");
  console.log("=".repeat(60));

  // 테이블 접근 확인
  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/cases?select=id&limit=1`, {
    headers: HEADERS,
  });
  if (!checkResp.ok) {
    console.error("cases 테이블 접근 실패:", await checkResp.text());
    process.exit(1);
  }
  console.log("cases 테이블 확인 완료");

  // 기존 데이터 확인
  const sources = [
    "ftc_심결례", "patent_심결례", "simpan_재결례",
    "rights_결정례", "tax_결정례", "detc_결정례",
  ];
  console.log("기존 데이터 확인 중...");
  const existingIds = await loadExistingIds(sources);
  console.log(`  기존 데이터: ${existingIds.size.toLocaleString()}건`);

  // Phase 1: prec API
  const precCount = await collectPrec(existingIds);

  // Phase 2: detc API
  const detcCount = await collectDetc(existingIds);

  // 최종 통계
  console.log("\n" + "=".repeat(60));
  console.log("적재 완료. source별 현황:\n");

  for (const source of sources) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/cases?select=id&source=eq.${encodeURIComponent(source)}`,
      { headers: { ...HEADERS, Prefer: "count=exact", Range: "0-0" } }
    );
    const range = resp.headers.get("content-range");
    const total = range ? range.split("/")[1] : "?";
    console.log(`  ${source}: ${total}건`);
  }

  console.log(`\n  이번 실행 합계: prec ${precCount}건 + detc ${detcCount}건 = ${precCount + detcCount}건`);
  console.log("=".repeat(60));
}

main().catch(console.error);
