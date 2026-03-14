#!/usr/bin/env node
/**
 * 법제처 Open API → 헌법재판소 결정례 → Supabase cases 테이블 적재
 *
 * 목록 API: http://www.law.go.kr/DRF/lawSearch.do?OC=jeonwoochul0515&target=detc&type=XML&display=100&page={page}
 * 상세 API: http://www.law.go.kr/DRF/lawService.do?OC=jeonwoochul0515&target=detc&ID={일련번호}&type=XML
 *
 * 사용법: node scripts/15_load_constitutional.mjs
 */

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const OC = "jeonwoochul0515";
const LIST_URL = `http://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=detc&type=XML&display=100`;
const DETAIL_URL = `http://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=detc&type=XML`;
const SOURCE = "law_go_kr_detc";
const BATCH_SIZE = 5; // 대형 테이블(350K+)에서 timeout 방지
const CONCURRENCY = 5; // 동시 상세 조회 수

// ── XML 파싱 유틸 (외부 의존성 없이) ──

/**
 * 간단한 XML 태그 값 추출. CDATA 포함 처리.
 */
function xmlValue(xml, tag) {
  // <tag>...</tag> 또는 <tag><![CDATA[...]]></tag>
  const re = new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  const raw = (m[1] ?? m[2] ?? "").trim();
  // HTML 엔티티 디코딩
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * 목록 XML에서 모든 <Detc> 블록 추출
 */
function parseListXml(xml) {
  const items = [];
  const re = /<Detc[^>]*>([\s\S]*?)<\/Detc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const serial = xmlValue(block, "헌재결정례일련번호");
    const caseNumber = xmlValue(block, "사건번호");
    const caseName = xmlValue(block, "사건명");
    const date = xmlValue(block, "종국일자");
    if (serial) {
      items.push({ serial, caseNumber, caseName, date });
    }
  }
  return items;
}

/**
 * 총 건수 추출
 */
function parseTotalCount(xml) {
  const v = xmlValue(xml, "totalCnt");
  return parseInt(v, 10) || 0;
}

/**
 * 상세 XML → cases 테이블 행 변환
 */
function parseDetailXml(xml, listItem) {
  const caseNumber = xmlValue(xml, "사건번호") || listItem.caseNumber;
  if (!caseNumber) return null;

  const caseName = xmlValue(xml, "사건명") || listItem.caseName || "";
  const rawDate = xmlValue(xml, "종국일자") || listItem.date || "";
  const caseTypeName = xmlValue(xml, "사건종류명") || "";

  // 결정요지 + 판시사항을 summary로
  const decisionSummary = xmlValue(xml, "결정요지");
  const holdings = xmlValue(xml, "판시사항");
  const summaryParts = [];
  if (holdings) summaryParts.push(`[판시사항]\n${holdings}`);
  if (decisionSummary) summaryParts.push(`[결정요지]\n${decisionSummary}`);
  const summary = summaryParts.join("\n\n").slice(0, 50000) || null;

  // 전문 (full text)
  const fullText = xmlValue(xml, "전문").slice(0, 200000) || null;

  // 참조조문
  const refStatutes = xmlValue(xml, "참조조문") || null;
  // 참조판례
  const refPrecedents = xmlValue(xml, "참조판례") || null;
  // 심판대상조문
  const reviewTarget = xmlValue(xml, "심판대상조문") || null;

  // 결정유형 분류 (사건종류명 기반)
  const category = classifyDecisionType(caseTypeName, caseName, decisionSummary, fullText);

  // 날짜 포맷: "20111229" → "2011-12-29" 또는 "2022.09.20" → "2022-09-20"
  const caseDate = formatDate(rawDate);

  // statutes 배열
  const statutes = [];
  if (refStatutes) {
    const parts = refStatutes
      .split(/[,;\/\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    statutes.push(...parts);
  }
  if (reviewTarget) {
    statutes.push(reviewTarget.trim());
  }

  // key_issues: 사건명을 넣음
  const keyIssues = caseName ? [caseName] : null;

  return {
    case_number: caseNumber,
    court: "헌법재판소",
    case_date: caseDate,
    category,
    summary,
    full_text: fullText,
    key_issues: keyIssues,
    statutes: statutes.length > 0 ? statutes : null,
    source: SOURCE,
  };
}

/**
 * 결정유형 분류
 */
function classifyDecisionType(caseTypeName, caseName, summary, fullText) {
  const text = `${caseTypeName} ${caseName} ${(summary || "").slice(0, 2000)} ${(fullText || "").slice(0, 3000)}`;

  if (/위헌결정|위헌으로\s*결정|위헌이라\s*할|위헌임을\s*선언/.test(text)) return "위헌";
  if (/헌법불합치|헌법에\s*합치되지\s*아니/.test(text)) return "헌법불합치";
  if (/한정합헌/.test(text)) return "한정합헌";
  if (/한정위헌/.test(text)) return "한정위헌";
  if (/합헌|헌법에\s*위반되지\s*아니/.test(text)) return "합헌";
  if (/각하/.test(text)) return "각하";
  if (/기각/.test(text)) return "기각";
  if (/인용/.test(text)) return "인용";
  if (/취소/.test(text)) return "취소";

  // 사건종류명 기반 기본값
  if (caseTypeName === "헌가") return "위헌법률심판";
  if (caseTypeName === "헌바") return "헌법소원(위헌심사형)";
  if (caseTypeName === "헌마") return "헌법소원(권리구제형)";
  if (caseTypeName === "헌나") return "탄핵";
  if (caseTypeName === "헌라") return "권한쟁의";
  if (caseTypeName === "헌사") return "가처분";

  return caseTypeName || "기타";
}

/**
 * 날짜 포맷 정규화
 */
function formatDate(raw) {
  if (!raw || raw.trim() === "0" || raw.trim() === "") return null;
  // "20111229" → "2011-12-29"
  const d1 = raw.replace(/\s/g, "");
  if (/^\d{8}$/.test(d1)) {
    return `${d1.slice(0, 4)}-${d1.slice(4, 6)}-${d1.slice(6, 8)}`;
  }
  // "2022.09.20" → "2022-09-20"
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(d1)) {
    return d1.replace(/\./g, "-");
  }
  return raw.trim() || null;
}

/**
 * HTTP GET with retry
 */
async function httpGet(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        return await resp.text();
      }
      console.log(`  HTTP ${resp.status} for ${url.slice(0, 100)}... (retry ${i + 1}/${retries})`);
    } catch (e) {
      console.log(`  요청 실패: ${e.message?.slice(0, 80)} (retry ${i + 1}/${retries})`);
    }
    await sleep(2000);
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 기존 데이터 조회 (중복 방지) ──

async function loadExistingCaseNumbers() {
  const existing = new Set();
  let offset = 0;
  while (true) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/cases?select=case_number&source=eq.${SOURCE}&offset=${offset}&limit=1000`,
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
    for (const row of data) existing.add(row.case_number);
    offset += 1000;
    if (data.length < 1000) break;
  }
  return existing;
}

// ── 배치 업로드 ──

async function uploadBatch(rows) {
  // on_conflict=case_number + merge-duplicates 로 upsert (insert-only 시 timeout 발생)
  const url = `${SUPABASE_URL}/rest/v1/cases?on_conflict=case_number`;
  let success = 0;

  // 배치 내 case_number 중복 제거 (같은 사건번호가 여러 일련번호에 있을 수 있음)
  const deduped = [];
  const seen = new Set();
  for (const row of rows) {
    if (!seen.has(row.case_number)) {
      seen.add(row.case_number);
      deduped.push(row);
    }
  }

  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    let retries = 3;

    while (retries > 0) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal,resolution=merge-duplicates",
          },
          body: JSON.stringify(batch),
        });

        if (resp.ok) {
          success += batch.length;
          break;
        } else {
          retries--;
          if (retries > 0) {
            await sleep(2000);
          } else {
            // 배치 실패 시 개별 삽입 시도
            for (const row of batch) {
              try {
                const r2 = await fetch(url, {
                  method: "POST",
                  headers: {
                    apikey: SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`,
                    "Content-Type": "application/json",
                    Prefer: "return=minimal,resolution=merge-duplicates",
                  },
                  body: JSON.stringify([row]),
                });
                if (r2.ok) success++;
                await sleep(500);
              } catch {}
            }
          }
        }
      } catch (e) {
        retries--;
        if (retries > 0) await sleep(2000);
        else {
          // 배치 실패 시 개별 삽입 시도
          for (const row of batch) {
            try {
              const r2 = await fetch(url, {
                method: "POST",
                headers: {
                  apikey: SUPABASE_KEY,
                  Authorization: `Bearer ${SUPABASE_KEY}`,
                  "Content-Type": "application/json",
                  Prefer: "return=minimal,resolution=merge-duplicates",
                },
                body: JSON.stringify([row]),
              });
              if (r2.ok) success++;
              await sleep(500);
            } catch {}
          }
        }
      }
    }
  }

  return success;
}

// ── 메인 ──

async function main() {
  console.log("=".repeat(60));
  console.log("헌법재판소 결정례 → Supabase cases 테이블 적재");
  console.log("=".repeat(60));

  // 1. cases 테이블 접근 확인
  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/cases?select=id&limit=1`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!checkResp.ok) {
    console.error("cases 테이블 접근 실패:", await checkResp.text());
    process.exit(1);
  }
  console.log("cases 테이블 접근 확인 완료\n");

  // 2. 기존 데이터 로드 (중복 방지)
  console.log("기존 헌재 결정례 데이터 확인 중...");
  const existingCaseNumbers = await loadExistingCaseNumbers();
  console.log(`  기존 데이터: ${existingCaseNumbers.size}건\n`);

  // 3. 첫 페이지에서 총 건수 파악
  console.log("목록 조회 시작...");
  const firstPageXml = await httpGet(`${LIST_URL}&page=1`);
  if (!firstPageXml) {
    console.error("첫 페이지 조회 실패");
    process.exit(1);
  }
  const totalCount = parseTotalCount(firstPageXml);
  const totalPages = Math.ceil(totalCount / 100);
  console.log(`  총 결정례: ${totalCount.toLocaleString()}건, ${totalPages}페이지\n`);

  // 4. 모든 페이지 순회하여 일련번호 수집
  console.log("목록 페이지네이션 조회 중...");
  const allListItems = [];

  // 첫 페이지 파싱
  const firstItems = parseListXml(firstPageXml);
  allListItems.push(...firstItems);

  for (let page = 2; page <= totalPages; page++) {
    const xml = await httpGet(`${LIST_URL}&page=${page}`);
    if (!xml) {
      console.log(`  [WARN] 페이지 ${page} 조회 실패, 스킵`);
      continue;
    }
    const items = parseListXml(xml);
    allListItems.push(...items);

    if (page % 10 === 0 || page === totalPages) {
      console.log(`  목록 진행: ${page}/${totalPages} 페이지 (${allListItems.length.toLocaleString()}건)`);
    }

    // 500ms 딜레이 (목록은 가벼움)
    await sleep(500);
  }

  console.log(`\n목록 수집 완료: ${allListItems.length.toLocaleString()}건`);

  // 5. 중복 제거 — 이미 DB에 있는 사건번호 스킵
  const newItems = allListItems.filter((item) => !existingCaseNumbers.has(item.caseNumber));
  console.log(`  신규 항목: ${newItems.length.toLocaleString()}건 (기존 ${allListItems.length - newItems.length}건 스킵)\n`);

  if (newItems.length === 0) {
    console.log("신규 데이터 없음. 종료.");
    return;
  }

  // 6. 상세 조회 + 변환 + 배치 업로드 (동시 CONCURRENCY건씩)
  console.log(`상세 조회 및 적재 시작 (동시 ${CONCURRENCY}건)...`);
  let totalSuccess = 0;
  let totalErrors = 0;
  let totalSkipped = 0;
  let totalDupes = 0;
  let buffer = [];
  const seenCaseNumbers = new Set();

  for (let i = 0; i < newItems.length; i += CONCURRENCY) {
    const chunk = newItems.slice(i, i + CONCURRENCY);

    // 동시 상세 조회
    const results = await Promise.all(
      chunk.map(async (item) => {
        const detailXml = await httpGet(`${DETAIL_URL}&ID=${item.serial}`);
        if (!detailXml) return { error: true };
        const record = parseDetailXml(detailXml, item);
        if (!record) return { skipped: true };
        return { record };
      })
    );

    for (const r of results) {
      if (r.error) { totalErrors++; continue; }
      if (r.skipped) { totalSkipped++; continue; }
      // 동일 사건번호 중복 방지 (다른 일련번호에서 같은 사건번호)
      if (seenCaseNumbers.has(r.record.case_number)) { totalDupes++; continue; }
      seenCaseNumbers.add(r.record.case_number);
      buffer.push(r.record);
    }

    // 100건 모이면 배치 업로드
    if (buffer.length >= BATCH_SIZE) {
      const success = await uploadBatch(buffer);
      totalSuccess += success;
      buffer = [];
    }

    // 진행률 표시 (200건마다)
    const processed = Math.min(i + CONCURRENCY, newItems.length);
    if (processed % 200 < CONCURRENCY || processed === newItems.length) {
      const pct = ((processed / newItems.length) * 100).toFixed(1);
      console.log(
        `  진행: ${processed.toLocaleString()}/${newItems.length.toLocaleString()} (${pct}%) | 성공: ${totalSuccess.toLocaleString()} | 에러: ${totalErrors} | 스킵: ${totalSkipped} | 중복: ${totalDupes}`
      );
    }

    // 1초 딜레이 (API 부하 방지)
    await sleep(1000);
  }

  // 남은 버퍼 업로드
  if (buffer.length > 0) {
    const success = await uploadBatch(buffer);
    totalSuccess += success;
  }

  console.log("\n" + "=".repeat(60));
  console.log("적재 완료!");
  console.log(`  총 조회: ${newItems.length.toLocaleString()}건`);
  console.log(`  성공: ${totalSuccess.toLocaleString()}건`);
  console.log(`  에러: ${totalErrors.toLocaleString()}건`);
  console.log(`  스킵: ${totalSkipped.toLocaleString()}건`);
  console.log("=".repeat(60));
}

main().catch(console.error);
