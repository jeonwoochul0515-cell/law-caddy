#!/usr/bin/env node
/**
 * 법제처 법령용어사전 웹 스크래핑 → Supabase legal_terms 테이블 적재
 *
 * 법제처 DRF API의 lsTrmSch 타겟이 비활성 상태이므로,
 * 국가법령정보센터 웹 AJAX 엔드포인트를 사용하여 용어 데이터를 수집합니다.
 *
 * 1) POST lsTrmScListR.do → 용어 목록 (term + seq)
 * 2) POST lsTrmInfoR.do   → 용어 상세 (정의, 출처 등)
 *
 * 분야별 키워드 검색으로 주요 법률 용어를 수집하여
 * Supabase legal_terms 테이블에 적재합니다.
 *
 * 사용법: node scripts/17_load_legal_terms_extra.mjs
 */

import https from "https";
import http from "http";

// ============================================================
// 설정
// ============================================================

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const BATCH_SIZE = 100;
const API_DELAY_MS = 1000; // API 호출 간 1초 딜레이
const DETAIL_DELAY_MS = 500; // 상세 조회 간 0.5초 딜레이

const BASE_URL = "https://www.law.go.kr";
const LIST_ENDPOINT = "/LSW/lsTrmScListR.do";
const DETAIL_ENDPOINT = "/LSW/lsTrmInfoR.do";

// ============================================================
// 분야별 검색 키워드
// ============================================================

const KEYWORDS = {
  민사: ["채권", "물권", "계약", "손해배상", "불법행위", "소멸시효", "담보", "저당", "질권", "유치권"],
  형사: ["범죄", "형벌", "공소", "구속", "보석", "기소", "불기소", "수사", "체포", "구류"],
  가사: ["이혼", "양육권", "친권", "상속", "유언", "후견", "입양", "혼인"],
  행정: ["허가", "인가", "특허", "취소", "철회", "행정처분", "과징금", "과태료"],
  노동: ["해고", "퇴직", "임금", "근로계약", "단체협약", "쟁의행위"],
  부동산: ["등기", "소유권", "임대차", "전세", "지상권", "분양"],
};

// ============================================================
// HTTP 유틸리티
// ============================================================

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * HTTPS POST 요청
 */
function httpsPost(urlPath, formData) {
  return new Promise((resolve, reject) => {
    const body = formData;
    const options = {
      hostname: "www.law.go.kr",
      port: 443,
      path: urlPath,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "Mozilla/5.0 (compatible; LawCaddy/1.0)",
        Referer: "https://www.law.go.kr/lsTrmSc.do",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("Request timeout"));
    });
    req.write(body);
    req.end();
  });
}

// ============================================================
// 용어 목록 파싱
// ============================================================

/**
 * lsTrmScListR.do 응답 HTML에서 용어 목록 추출
 * @returns {{ term: string, seq: string }[]}
 */
function parseTermList(html) {
  const terms = [];
  // lsTrmView('idx', 'termName', 'seqId') 패턴 추출
  const regex = /lsTrmView\s*\(\s*'[0-9]+'\s*,\s*'([^']+)'\s*,\s*'([0-9]+)'\s*\)/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    terms.push({ term: match[1], seq: match[2] });
  }
  return terms;
}

/**
 * lsTrmScListR.do 응답에서 총 건수 추출
 */
function parseTotalCount(html) {
  const match = html.match(/총\s*(\d+)\s*건/);
  return match ? parseInt(match[1], 10) : 0;
}

// ============================================================
// 용어 상세 파싱
// ============================================================

/**
 * HTML 태그 제거 + 공백 정리
 */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * lsTrmInfoR.do 응답 HTML에서 정의 추출
 * @returns {{ definition: string, dictType: string, hanja: string }}
 */
function parseTermDetail(html) {
  const result = { definition: "", dictType: "", hanja: "" };

  // 사전 유형 추출 (법령용어사전, 법령정의사전, 생활용어사전, 법령한영사전)
  const dictMatch = html.match(/<h3[^>]*class="h_dic"[^>]*>([^<]+)</);
  if (dictMatch) {
    result.dictType = dictMatch[1].trim();
  }

  // 한자 추출
  const hanjaMatch = html.match(/\(([一-龥\u3400-\u4DBF\u4E00-\u9FFF·\s]+)\)/);
  if (hanjaMatch) {
    result.hanja = hanjaMatch[1].trim();
  }

  // 정의 추출: <dd> 태그 내용
  const ddMatch = html.match(/<dd>([\s\S]*?)<\/dd>/);
  if (ddMatch) {
    const raw = stripHtml(ddMatch[1]);
    // 영어만 있는 경우 (법령한영사전)는 definition에 넣되 표시
    if (raw.length > 0) {
      result.definition = raw;
    }
  }

  return result;
}

// ============================================================
// 키워드별 용어 수집
// ============================================================

/**
 * 하나의 키워드에 대해 모든 페이지의 용어를 수집
 */
async function fetchTermsForKeyword(keyword) {
  const allTerms = [];
  const PER_PAGE = 50;

  // 첫 페이지로 총 건수 확인
  const formData = `q=${encodeURIComponent(keyword)}&outmax=${PER_PAGE}&pg=1&fsort=10`;
  let html;
  try {
    html = await httpsPost(LIST_ENDPOINT, formData);
  } catch (e) {
    console.error(`    [오류] 목록 조회 실패 (${keyword}): ${e.message}`);
    return allTerms;
  }

  const totalCount = parseTotalCount(html);
  if (totalCount === 0) {
    return allTerms;
  }

  const totalPages = Math.ceil(totalCount / PER_PAGE);
  console.log(`    "${keyword}" → 총 ${totalCount}건, ${totalPages}페이지`);

  // 첫 페이지 결과 파싱
  const firstPageTerms = parseTermList(html);
  allTerms.push(...firstPageTerms);

  // 나머지 페이지
  for (let pg = 2; pg <= totalPages; pg++) {
    await sleep(API_DELAY_MS);
    try {
      const pgFormData = `q=${encodeURIComponent(keyword)}&outmax=${PER_PAGE}&pg=${pg}&fsort=10`;
      const pgHtml = await httpsPost(LIST_ENDPOINT, pgFormData);
      const pgTerms = parseTermList(pgHtml);
      allTerms.push(...pgTerms);
    } catch (e) {
      console.error(`    [오류] 페이지 ${pg} 조회 실패: ${e.message}`);
    }
  }

  return allTerms;
}

/**
 * 용어 상세 정보 조회
 */
async function fetchTermDetail(term, seq) {
  try {
    const formData = `seq=${seq}&lsTrm=${encodeURIComponent(term)}`;
    const html = await httpsPost(DETAIL_ENDPOINT, formData);
    return parseTermDetail(html);
  } catch (e) {
    return { definition: "", dictType: "", hanja: "" };
  }
}

// ============================================================
// Supabase 업로드
// ============================================================

async function uploadBatch(rows) {
  const url = `${SUPABASE_URL}/rest/v1/legal_terms`;
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
        body: JSON.stringify(rows),
      });

      if (resp.ok) {
        return rows.length;
      }

      const text = await resp.text();
      // UNIQUE 제약 위반은 무시 (이미 존재하는 용어)
      if (resp.status === 409 || text.includes("duplicate")) {
        // 개별 삽입으로 폴백
        let inserted = 0;
        for (const row of rows) {
          try {
            const singleResp = await fetch(url, {
              method: "POST",
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal,resolution=ignore-duplicates",
              },
              body: JSON.stringify([row]),
            });
            if (singleResp.ok) inserted++;
          } catch (_) {
            // 무시
          }
        }
        return inserted;
      }

      console.error(`    업로드 에러: ${resp.status} - ${text.slice(0, 200)}`);
      retries--;
      if (retries > 0) await sleep(2000);
    } catch (e) {
      retries--;
      if (retries > 0) await sleep(2000);
      else console.error(`    업로드 실패: ${e.message}`);
    }
  }
  return 0;
}

// ============================================================
// 메인
// ============================================================

async function main() {
  console.log("=".repeat(60));
  console.log("법제처 법령용어사전 → Supabase legal_terms");
  console.log("=".repeat(60));

  // 1. legal_terms 테이블 존재 확인
  console.log("\n[1] 테이블 확인...");
  const checkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_terms?select=id&limit=1`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  if (!checkResp.ok) {
    console.error("legal_terms 테이블이 존재하지 않습니다.");
    console.error("scripts/12_create_knowledge_tables.sql을 먼저 실행하세요.");
    process.exit(1);
  }
  console.log("  legal_terms 테이블 확인 완료");

  // 2. 기존 용어 수 확인
  const countResp = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_terms?select=id`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    }
  );
  const contentRange = countResp.headers.get("content-range");
  const existingCount = contentRange
    ? parseInt(contentRange.split("/")[1], 10)
    : 0;
  console.log(`  기존 용어 수: ${existingCount.toLocaleString()}건`);

  // 3. 키워드별 용어 수집
  console.log("\n[2] 법제처 법령용어사전에서 용어 수집...");

  // 전체 고유 용어 목록 (term → seq 매핑, 중복 제거)
  const termMap = new Map();
  const categories = Object.keys(KEYWORDS);

  for (const category of categories) {
    const keywords = KEYWORDS[category];
    console.log(`\n  ■ ${category} 분야 (${keywords.length}개 키워드)`);

    for (const keyword of keywords) {
      const terms = await fetchTermsForKeyword(keyword);

      let newCount = 0;
      for (const t of terms) {
        if (!termMap.has(t.term)) {
          termMap.set(t.term, { seq: t.seq, category });
          newCount++;
        }
      }

      console.log(
        `      수집: ${terms.length}건 (신규: ${newCount}건, 누적: ${termMap.size}건)`
      );
      await sleep(API_DELAY_MS);
    }
  }

  console.log(`\n  총 고유 용어: ${termMap.size}건`);

  if (termMap.size === 0) {
    console.log("수집된 용어가 없습니다.");
    process.exit(0);
  }

  // 4. 상세 정보 조회 + Supabase 적재
  console.log("\n[3] 용어 상세 조회 및 Supabase 적재...");

  const entries = Array.from(termMap.entries());
  let totalUploaded = 0;
  let totalProcessed = 0;
  const batch = [];

  for (let i = 0; i < entries.length; i++) {
    const [term, { seq, category }] = entries[i];
    totalProcessed++;

    // 상세 정보 조회
    const detail = await fetchTermDetail(term, seq);
    await sleep(DETAIL_DELAY_MS);

    // 레코드 생성
    const row = {
      term: term.slice(0, 500),
      definition: detail.definition ? detail.definition.slice(0, 10000) : null,
      related_terms: null,
      synonyms: null,
      source_uri: `law_go_kr_term_${seq}`,
    };

    // 한자가 있으면 related_terms에 추가
    if (detail.hanja) {
      row.related_terms = [detail.hanja];
    }

    // 사전 유형 정보를 definition 앞에 추가
    if (detail.dictType && detail.dictType !== "법령용어사전") {
      row.definition = detail.definition
        ? `[${detail.dictType}] ${row.definition}`
        : `[${detail.dictType}]`;
    }

    batch.push(row);

    // 배치 업로드
    if (batch.length >= BATCH_SIZE || i === entries.length - 1) {
      const uploaded = await uploadBatch([...batch]);
      totalUploaded += uploaded;
      batch.length = 0;

      const pct = ((totalProcessed / entries.length) * 100).toFixed(1);
      console.log(
        `  진행: ${totalProcessed.toLocaleString()}/${entries.length.toLocaleString()} (${pct}%) | 적재: ${totalUploaded.toLocaleString()}건`
      );
    }

    // 진행률 (배치 외 중간 출력)
    if (totalProcessed % 200 === 0 && batch.length > 0) {
      const pct = ((totalProcessed / entries.length) * 100).toFixed(1);
      process.stdout.write(
        `\r  조회 중: ${totalProcessed.toLocaleString()}/${entries.length.toLocaleString()} (${pct}%)`
      );
    }
  }

  // 5. 결과 요약
  console.log(`\n${"=".repeat(60)}`);
  console.log("법령용어사전 적재 완료");
  console.log(`  수집 키워드: ${Object.values(KEYWORDS).flat().length}개`);
  console.log(`  고유 용어: ${termMap.size.toLocaleString()}건`);
  console.log(`  신규 적재: ${totalUploaded.toLocaleString()}건`);

  // 최종 용어 수 확인
  const finalResp = await fetch(
    `${SUPABASE_URL}/rest/v1/legal_terms?select=id`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    }
  );
  const finalRange = finalResp.headers.get("content-range");
  const finalCount = finalRange
    ? parseInt(finalRange.split("/")[1], 10)
    : 0;
  console.log(`  테이블 총 용어: ${finalCount.toLocaleString()}건`);
  console.log("=".repeat(60));
}

main().catch((e) => {
  console.error("치명적 오류:", e);
  process.exit(1);
});
