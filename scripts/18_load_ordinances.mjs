#!/usr/bin/env node
/**
 * 전국 자치법규(조례/규칙) 수집 -> Supabase statutes 테이블 적재
 *
 * 법제처 Open API (target=ordin)를 사용하여 주요 분야 조례/규칙을 수집합니다.
 * 전체 158,000+ 건 중 주요 분야 키워드로 필터하여 수집합니다.
 *
 * 사용법:
 *   node scripts/18_load_ordinances.mjs                    # 전체 키워드 수집
 *   node scripts/18_load_ordinances.mjs --dry-run          # API만 테스트 (업로드 안 함)
 *   node scripts/18_load_ordinances.mjs --resume 5         # 5번째 키워드부터 재개
 *   node scripts/18_load_ordinances.mjs --max-per-keyword 100  # 키워드당 최대 100건
 */

import { parseString } from "xml2js";
import { promisify } from "util";
import fs from "fs";

const parseXml = promisify(parseString);

// ============================================================
// 설정
// ============================================================
const OC = "jeonwoochul0515";
const LIST_URL = "http://www.law.go.kr/DRF/lawSearch.do";
const DETAIL_URL = "http://www.law.go.kr/DRF/lawService.do";
const DISPLAY = 100;

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal,resolution=ignore-duplicates",
};

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "text/xml, application/xml, */*",
  "Accept-Language": "ko-KR,ko;q=0.9",
  Connection: "keep-alive",
};

// 주요 분야 키워드 (법률 실무에서 자주 사용되는 자치법규 분야)
const KEYWORDS = [
  "주택",
  "건축",
  "도시계획",
  "주차",
  "환경",
  "복지",
  "교통",
  "소방",
  "위생",
  "안전",
  "임대",
  "아동",
  "노인",
  "장애인",
  "교육",
  "토지",
  "수도",
  "하수",
  "폐기물",
  "소음",
  "공원",
  "문화재",
  "식품",
  "영업",
  "과태료",
];

// CLI 인자 파싱
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RESUME_IDX = args.includes("--resume")
  ? parseInt(args[args.indexOf("--resume") + 1], 10) || 0
  : 0;
const MAX_PER_KEYWORD = args.includes("--max-per-keyword")
  ? parseInt(args[args.indexOf("--max-per-keyword") + 1], 10) || 500
  : 500;

// ============================================================
// 유틸리티
// ============================================================
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(60000),
      });
      if (resp.ok) {
        return await resp.text();
      }
      console.error(
        `  HTTP ${resp.status} for ${url.substring(0, 120)}... (retry ${i + 1})`
      );
    } catch (err) {
      console.error(
        `  Fetch error: ${err.message.substring(0, 100)} (retry ${i + 1})`
      );
    }
    await sleep(2000 * (i + 1));
  }
  return null;
}

function extractText(val) {
  if (!val) return "";
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val)) return extractText(val[0]);
  if (typeof val === "object" && val._) return val._.trim();
  return String(val).trim();
}

// ============================================================
// 1단계: 키워드별 자치법규 목록 수집
// ============================================================
async function fetchOrdinanceList(keyword) {
  const firstUrl = `${LIST_URL}?OC=${OC}&target=ordin&type=XML&display=${DISPLAY}&page=1&query=${encodeURIComponent(keyword)}`;
  const firstXml = await fetchWithRetry(firstUrl);
  if (!firstXml) {
    console.error(`  "${keyword}" 목록 API 실패`);
    return [];
  }

  let firstData;
  try {
    firstData = await parseXml(firstXml);
  } catch (e) {
    console.error(`  "${keyword}" 목록 XML 파싱 실패: ${e.message.substring(0, 80)}`);
    return [];
  }

  const totalCnt = parseInt(extractText(firstData?.OrdinSearch?.totalCnt), 10);
  if (!totalCnt || totalCnt === 0) {
    console.log(`  "${keyword}" 검색 결과 없음`);
    return [];
  }

  const maxToFetch = Math.min(totalCnt, MAX_PER_KEYWORD);
  const totalPages = Math.ceil(maxToFetch / DISPLAY);
  console.log(`  "${keyword}" 총 ${totalCnt}건, 최대 ${maxToFetch}건 수집 (${totalPages}페이지)`);

  const allOrdinances = [];

  // 첫 페이지 파싱
  parseOrdinListPage(firstData, allOrdinances);

  // 나머지 페이지
  for (let page = 2; page <= totalPages; page++) {
    await sleep(500);
    const url = `${LIST_URL}?OC=${OC}&target=ordin&type=XML&display=${DISPLAY}&page=${page}&query=${encodeURIComponent(keyword)}`;
    const xml = await fetchWithRetry(url);
    if (!xml) {
      console.error(`  페이지 ${page} 수집 실패, 건너뜀`);
      continue;
    }
    try {
      const data = await parseXml(xml);
      parseOrdinListPage(data, allOrdinances);
    } catch (e) {
      console.error(`  페이지 ${page} XML 파싱 실패`);
    }

    if (allOrdinances.length >= maxToFetch) break;
  }

  return allOrdinances.slice(0, maxToFetch);
}

function parseOrdinListPage(data, result) {
  let entries = data?.OrdinSearch?.law;
  if (!entries) return;
  if (!Array.isArray(entries)) entries = [entries];

  for (const entry of entries) {
    const name = extractText(entry["자치법규명"]);
    const mst = extractText(entry["자치법규일련번호"]);
    const type = extractText(entry["자치법규종류"]);
    const org = extractText(entry["지자체기관명"]);

    if (!name || !mst) continue;

    result.push({ name, mst, type, org });
  }
}

// ============================================================
// 2단계: 기존 데이터 확인 (중복 방지)
// ============================================================
async function fetchExistingKeys() {
  console.log("\n기존 statutes 테이블 자치법규 확인 중...");

  const existing = new Set();
  let offset = 0;
  const limit = 1000;

  // 자치법규는 statute_name에 지자체명이 포함되므로 "조례" 또는 "규칙" 포함된 것만 조회
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/statutes?select=statute_name,article_number&statute_name=like.*조례*&offset=${offset}&limit=${limit}`;
    let resp;
    try {
      resp = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });
    } catch {
      break;
    }

    if (!resp.ok) break;
    const rows = await resp.json();
    if (rows.length === 0) break;

    for (const row of rows) {
      existing.add(`${row.statute_name}||${row.article_number}`);
    }
    offset += limit;
    if (rows.length < limit) break;
  }

  // 규칙도 조회
  offset = 0;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/statutes?select=statute_name,article_number&statute_name=like.*규칙*&offset=${offset}&limit=${limit}`;
    let resp;
    try {
      resp = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });
    } catch {
      break;
    }

    if (!resp.ok) break;
    const rows = await resp.json();
    if (rows.length === 0) break;

    for (const row of rows) {
      existing.add(`${row.statute_name}||${row.article_number}`);
    }
    offset += limit;
    if (rows.length < limit) break;
  }

  console.log(`  기존 자치법규 조문: ${existing.size}건`);
  return existing;
}

// ============================================================
// 3단계: 자치법규 상세 조문 파싱
// ============================================================
async function fetchOrdinanceArticles(mst, ordinName) {
  const url = `${DETAIL_URL}?OC=${OC}&target=ordin&MST=${mst}&type=XML`;
  const xml = await fetchWithRetry(url);
  if (!xml) return [];

  try {
    const data = await parseXml(xml);
    return parseArticlesFromXml(data, ordinName, mst);
  } catch (e) {
    // XML 파싱 실패 시 정규식 폴백
    return parseArticlesRegex(xml, ordinName, mst);
  }
}

function parseArticlesFromXml(data, ordinName, mst) {
  const articles = [];

  // 자치법규 XML 구조: LawService > 조문 > 조[]
  const root = data["LawService"] || data[Object.keys(data)[0]];
  if (!root) return articles;

  // 조문 찾기
  let joSection = root["조문"];
  if (!joSection) return articles;

  // xml2js는 배열로 래핑할 수 있음
  if (Array.isArray(joSection)) joSection = joSection[0];

  // 조문 > 조[] 또는 조문단위[]
  let joUnits = joSection["조"] || joSection["조문단위"];
  if (!joUnits) return articles;
  if (!Array.isArray(joUnits)) joUnits = [joUnits];

  for (const unit of joUnits) {
    const article = parseOneArticle(unit, ordinName, mst);
    if (article) articles.push(article);
  }

  return articles;
}

function parseOneArticle(unit, ordinName, mst) {
  const numberRaw = extractText(unit["조문번호"]);
  const title = extractText(unit["조제목"]);
  let content = extractText(unit["조내용"]);

  if (!content || content.length < 3) return null;

  // 조문번호 포맷 (000100 -> 제1조)
  let articleNumber = "";
  if (numberRaw) {
    const num = parseInt(numberRaw, 10);
    if (!isNaN(num)) {
      const mainNum = Math.floor(num / 100);
      const subNum = num % 100;
      articleNumber = subNum > 0 ? `제${mainNum}조의${subNum}` : `제${mainNum}조`;
    } else if (numberRaw.startsWith("제")) {
      articleNumber = numberRaw;
    } else {
      articleNumber = `제${numberRaw}조`;
    }
  }

  // 항(paragraph) 내용 합치기
  const hangContent = collectHangContent(unit["항"]);
  if (hangContent) {
    content = content + "\n" + hangContent;
  }

  return {
    statute_name: ordinName,
    statute_mst: mst,
    article_number: articleNumber,
    article_title: title || "",
    article_content: content.substring(0, 8000),
  };
}

function collectHangContent(hang) {
  if (!hang) return "";
  const parts = [];
  const items = Array.isArray(hang) ? hang : [hang];

  for (const h of items) {
    if (!h || typeof h !== "object") continue;

    const hangText = extractText(h["항내용"]);
    if (hangText) parts.push(hangText);

    // 호(sub-items) 내용도 수집
    const hoItems = h["호"];
    if (hoItems) {
      const hoList = Array.isArray(hoItems) ? hoItems : [hoItems];
      for (const ho of hoList) {
        const hoText = extractText(ho?.["호내용"]);
        if (hoText) parts.push("  " + hoText);
      }
    }

    // 목(sub-sub-items) 내용도 수집
    const mokItems = h["목"];
    if (mokItems) {
      const mokList = Array.isArray(mokItems) ? mokItems : [mokItems];
      for (const mok of mokList) {
        const mokText = extractText(mok?.["목내용"]);
        if (mokText) parts.push("    " + mokText);
      }
    }
  }

  return parts.join("\n");
}

// 정규식 폴백
function parseArticlesRegex(xml, ordinName, mst) {
  const articles = [];

  // <조 조문번호='...'> 블록 추출
  const blockRegex = /<조\s+조문번호='[^']*'>([\s\S]*?)<\/조>/g;
  let match;
  while ((match = blockRegex.exec(xml)) !== null) {
    const block = match[1];

    const numMatch = block.match(
      /<조문번호>\s*(?:<!\[CDATA\[)?\s*(\d+)\s*(?:\]\]>)?\s*<\/조문번호>/
    );
    const titleMatch = block.match(
      /<조제목>\s*(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?\s*<\/조제목>/
    );
    const contentMatch = block.match(
      /<조내용>\s*(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?\s*<\/조내용>/
    );

    if (!contentMatch) continue;

    const content = contentMatch[1].trim();
    if (content.length < 3) continue;

    let articleNumber = "";
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      if (!isNaN(num)) {
        const mainNum = Math.floor(num / 100);
        const subNum = num % 100;
        articleNumber = subNum > 0 ? `제${mainNum}조의${subNum}` : `제${mainNum}조`;
      }
    }

    const articleTitle = titleMatch ? titleMatch[1].trim() : "";

    // 항 내용 수집
    const hangParts = [];
    const hangRegex =
      /<항내용>\s*(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?\s*<\/항내용>/g;
    let hMatch;
    while ((hMatch = hangRegex.exec(block)) !== null) {
      hangParts.push(hMatch[1].trim());
    }

    const fullContent = hangParts.length
      ? content + "\n" + hangParts.join("\n")
      : content;

    articles.push({
      statute_name: ordinName,
      statute_mst: mst,
      article_number: articleNumber,
      article_title: articleTitle,
      article_content: fullContent.substring(0, 8000),
    });
  }

  return articles;
}

// ============================================================
// 4단계: Supabase 업로드
// ============================================================
async function uploadBatch(articles) {
  if (DRY_RUN || articles.length === 0)
    return { success: articles.length, errors: 0 };

  let success = 0;
  let errors = 0;

  for (let i = 0; i < articles.length; i += 100) {
    const batch = articles.slice(i, i + 100);
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/statutes`, {
        method: "POST",
        headers: SUPABASE_HEADERS,
        body: JSON.stringify(batch),
      });

      if (resp.ok || resp.status === 201) {
        success += batch.length;
      } else {
        const errText = await resp.text();
        if (resp.status === 409) {
          // 중복은 ignore-duplicates로 처리됨
          success += batch.length;
        } else {
          errors += batch.length;
          console.error(
            `  업로드 에러 ${resp.status}: ${errText.substring(0, 150)}`
          );
        }
      }
    } catch (err) {
      errors += batch.length;
      console.error(`  업로드 예외: ${err.message.substring(0, 100)}`);
    }
  }

  return { success, errors };
}

// ============================================================
// 진행 상황 저장/복구
// ============================================================
const PROGRESS_FILE = "/home/user/law-caddy/scripts/.ordinances_progress.json";

function saveProgress(kwIdx, stats) {
  try {
    fs.writeFileSync(
      PROGRESS_FILE,
      JSON.stringify({
        keywordIndex: kwIdx,
        ...stats,
        savedAt: new Date().toISOString(),
      })
    );
  } catch (_) {}
}

// ============================================================
// 메인 실행
// ============================================================
async function main() {
  console.log("=".repeat(60));
  console.log("법제처 Open API - 전국 자치법규(조례/규칙) 수집기");
  console.log(`키워드: ${KEYWORDS.length}개 | 키워드당 최대: ${MAX_PER_KEYWORD}건`);
  console.log(`모드: ${DRY_RUN ? "DRY RUN" : "실제 업로드"}`);
  if (RESUME_IDX > 0) console.log(`재개: ${RESUME_IDX}번째 키워드부터`);
  console.log("=".repeat(60));

  // 기존 데이터 확인 (중복 방지)
  const existingKeys = DRY_RUN ? new Set() : await fetchExistingKeys();

  // 이미 수집한 MST 번호 추적 (키워드 간 중복 방지)
  const processedMSTs = new Set();

  let totalOrdinances = 0;
  let totalArticles = 0;
  let totalSuccess = 0;
  let totalErrors = 0;
  let totalSkipped = 0;
  const startTime = Date.now();

  for (let kwIdx = RESUME_IDX; kwIdx < KEYWORDS.length; kwIdx++) {
    const keyword = KEYWORDS[kwIdx];
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log(`\n${"=".repeat(50)}`);
    console.log(`[${kwIdx + 1}/${KEYWORDS.length}] 키워드: "${keyword}" (${elapsed}분 경과)`);
    console.log("=".repeat(50));

    // 1. 자치법규 목록 수집
    const ordinances = await fetchOrdinanceList(keyword);
    if (ordinances.length === 0) continue;

    // 이미 처리한 MST 제외
    const newOrdinances = ordinances.filter((o) => !processedMSTs.has(o.mst));
    const dupCount = ordinances.length - newOrdinances.length;
    if (dupCount > 0) {
      console.log(`  키워드 중복 제외: ${dupCount}건`);
    }
    console.log(`  신규 처리 대상: ${newOrdinances.length}건`);
    totalOrdinances += newOrdinances.length;

    // 2. 각 자치법규 상세 조문 수집
    let kwArticles = 0;
    let kwSuccess = 0;
    let kwErrors = 0;
    let kwSkipped = 0;
    let buffer = [];

    for (let i = 0; i < newOrdinances.length; i++) {
      const ord = newOrdinances[i];
      processedMSTs.add(ord.mst);

      // 조문 수집
      const articles = await fetchOrdinanceArticles(ord.mst, ord.name);

      if (articles.length === 0) {
        if (i < 5) {
          console.log(`  [${i + 1}/${newOrdinances.length}] ${ord.name} - 조문 없음`);
        }
        await sleep(500);
        continue;
      }

      // 중복 필터링
      const newArticles = articles.filter((a) => {
        const key = `${a.statute_name}||${a.article_number}`;
        if (existingKeys.has(key)) {
          return false;
        }
        existingKeys.add(key);
        return true;
      });

      kwSkipped += articles.length - newArticles.length;
      kwArticles += newArticles.length;
      buffer.push(...newArticles);

      // 진행 표시 (처음 5건, 이후 20건마다)
      if (i < 5 || i % 20 === 0 || i === newOrdinances.length - 1) {
        console.log(
          `  [${i + 1}/${newOrdinances.length}] ${ord.name} (${ord.org}): ${newArticles.length}개 조문`
        );
      }

      // 500건 이상이면 중간 업로드
      if (buffer.length >= 500) {
        const result = await uploadBatch(buffer);
        kwSuccess += result.success;
        kwErrors += result.errors;
        console.log(`  중간 업로드: ${result.success}건 성공`);
        buffer = [];
      }

      // API rate limit 방지
      await sleep(1000);
    }

    // 남은 데이터 업로드
    if (buffer.length > 0) {
      const result = await uploadBatch(buffer);
      kwSuccess += result.success;
      kwErrors += result.errors;
    }

    totalArticles += kwArticles;
    totalSuccess += kwSuccess;
    totalErrors += kwErrors;
    totalSkipped += kwSkipped;

    console.log(
      `  "${keyword}" 완료: ${kwArticles}개 조문 수집, ${kwSuccess}건 업로드, ${kwSkipped}건 중복 스킵`
    );

    // 진행 상황 저장
    saveProgress(kwIdx, {
      totalOrdinances,
      totalArticles,
      totalSuccess,
      totalErrors,
      totalSkipped,
    });
  }

  // 최종 보고
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log("\n" + "=".repeat(60));
  console.log("자치법규 수집 완료!");
  console.log("=".repeat(60));
  console.log(`소요 시간: ${totalTime}분`);
  console.log(`처리 키워드: ${KEYWORDS.length}개`);
  console.log(`처리 자치법규: ${totalOrdinances}건 (MST 기준)`);
  console.log(`수집 조문: ${totalArticles}개`);
  if (!DRY_RUN) {
    console.log(`업로드 성공: ${totalSuccess}건`);
    console.log(`업로드 실패: ${totalErrors}건`);
    console.log(`중복 스킵: ${totalSkipped}건`);
  }
  console.log("=".repeat(60));

  // 진행 파일 삭제
  try {
    fs.unlinkSync(PROGRESS_FILE);
  } catch (_) {}
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
