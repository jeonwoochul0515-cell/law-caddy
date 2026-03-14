#!/usr/bin/env node
/**
 * 전체 한국 법령 조문 수집 → Supabase statutes 테이블 적재
 *
 * 법제처 Open API를 사용하여 모든 법률 + 시행령(대통령령) 조문을 수집합니다.
 * - 법령 목록 API: display=100 페이지네이션으로 전체 법령 MST 번호 수집
 * - 법령 상세 API: 각 법령의 조문(XML)을 파싱
 * - Supabase statutes 테이블에 100건 단위 배치 업로드
 *
 * 사용법:
 *   node scripts/13_load_all_statutes.mjs                    # 전체 (법률 + 시행령)
 *   node scripts/13_load_all_statutes.mjs --laws-only        # 법률만
 *   node scripts/13_load_all_statutes.mjs --resume 150       # 150번째 법령부터 재개
 *   node scripts/13_load_all_statutes.mjs --dry-run          # API만 테스트 (업로드 안 함)
 */

import { parseString } from "xml2js";
import { promisify } from "util";

const parseXml = promisify(parseString);

// ============================================================
// 설정
// ============================================================
const OC = "jeonwoochul0515";
const LAW_LIST_URL = "http://www.law.go.kr/DRF/lawSearch.do";
const LAW_DETAIL_URL = "http://www.law.go.kr/DRF/lawService.do";
const DISPLAY = 100; // 페이지당 법령 수

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

// CLI 인자 파싱
const args = process.argv.slice(2);
const LAWS_ONLY = args.includes("--laws-only");
const DRY_RUN = args.includes("--dry-run");
const RESUME_IDX = args.includes("--resume")
  ? parseInt(args[args.indexOf("--resume") + 1], 10) || 0
  : 0;

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

// CDATA와 태그 사이의 텍스트 추출
function extractText(val) {
  if (!val) return "";
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val)) return extractText(val[0]);
  if (typeof val === "object" && val._) return val._.trim();
  return String(val).trim();
}

// ============================================================
// 1단계: 법령 목록 전체 수집
// ============================================================
async function fetchAllLawList() {
  console.log("=" .repeat(60));
  console.log("1단계: 법령 목록 수집");
  console.log("=" .repeat(60));

  // 첫 페이지로 totalCnt 확인
  const firstUrl = `${LAW_LIST_URL}?OC=${OC}&target=law&type=XML&display=${DISPLAY}&page=1`;
  const firstXml = await fetchWithRetry(firstUrl);
  if (!firstXml) {
    throw new Error("법제처 API 연결 실패");
  }

  const firstData = await parseXml(firstXml);
  const totalCnt = parseInt(
    extractText(firstData?.LawSearch?.totalCnt),
    10
  );
  const totalPages = Math.ceil(totalCnt / DISPLAY);
  console.log(`총 ${totalCnt}개 법령, ${totalPages} 페이지`);

  const allLaws = [];

  // 첫 페이지 결과 처리
  parseLawListPage(firstData, allLaws);
  console.log(`  페이지 1/${totalPages} - 누적 ${allLaws.length}건`);

  // 나머지 페이지
  for (let page = 2; page <= totalPages; page++) {
    await sleep(500);
    const url = `${LAW_LIST_URL}?OC=${OC}&target=law&type=XML&display=${DISPLAY}&page=${page}`;
    const xml = await fetchWithRetry(url);
    if (!xml) {
      console.error(`  페이지 ${page} 수집 실패, 건너뜀`);
      continue;
    }
    try {
      const data = await parseXml(xml);
      parseLawListPage(data, allLaws);
    } catch (e) {
      console.error(`  페이지 ${page} XML 파싱 실패: ${e.message.substring(0, 80)}`);
    }
    if (page % 10 === 0) {
      console.log(`  페이지 ${page}/${totalPages} - 누적 ${allLaws.length}건`);
    }
  }

  console.log(`\n법령 목록 수집 완료: ${allLaws.length}건`);

  // 법률과 시행령 분류
  const laws = allLaws.filter((l) => l.type === "법률");
  const decrees = allLaws.filter((l) => l.type === "대통령령");
  const others = allLaws.filter(
    (l) => l.type !== "법률" && l.type !== "대통령령"
  );
  console.log(
    `  법률: ${laws.length}건, 대통령령: ${decrees.length}건, 기타(부령 등): ${others.length}건`
  );

  if (LAWS_ONLY) {
    console.log("--laws-only 모드: 법률만 처리합니다.");
    return laws;
  }

  // 법률 먼저, 그 다음 시행령
  return [...laws, ...decrees];
}

function parseLawListPage(data, allLaws) {
  let lawEntries = data?.LawSearch?.law;
  if (!lawEntries) return;
  if (!Array.isArray(lawEntries)) lawEntries = [lawEntries];

  for (const entry of lawEntries) {
    const name = extractText(entry["법령명한글"]);
    const mst = extractText(entry["법령일련번호"]);
    const type = extractText(entry["법령구분명"]);
    const statusCode = extractText(entry["현행연혁코드"]);

    // 현행 법률만 (현행연혁코드가 있으면 현행만)
    if (!name || !mst) continue;

    allLaws.push({ name, mst, type, statusCode });
  }
}

// ============================================================
// 2단계: 기존 법령 목록 확인 (중복 방지)
// ============================================================
async function fetchExistingStatuteNames() {
  console.log("\n기존 statutes 테이블 법령 확인 중...");

  const existing = new Set();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/statutes?select=statute_name&offset=${offset}&limit=${limit}`;
    const resp = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!resp.ok) {
      console.error(`  Supabase 조회 실패: ${resp.status}`);
      break;
    }

    const rows = await resp.json();
    if (rows.length === 0) break;

    for (const row of rows) {
      existing.add(row.statute_name);
    }
    offset += limit;
  }

  console.log(`  기존 법령 ${existing.size}개 (${offset}행 조회)`);
  return existing;
}

// ============================================================
// 3단계: 법령 상세 조문 파싱
// ============================================================
async function fetchArticles(mst, lawName) {
  const url = `${LAW_DETAIL_URL}?OC=${OC}&target=law&MST=${mst}&type=XML`;
  const xml = await fetchWithRetry(url);
  if (!xml) return [];

  try {
    const data = await parseXml(xml);
    return parseArticlesFromXml(data, lawName, mst);
  } catch (e) {
    // XML 파싱 실패 시 정규식 폴백
    return parseArticlesRegex(xml, lawName, mst);
  }
}

function parseArticlesFromXml(data, lawName, mst) {
  const articles = [];

  // XML 구조: 법령 > 조문 > 조문단위[]
  // xml2js가 최상위 키를 찾아야 함
  const root = data["법령"] || data["law"] || data[Object.keys(data)[0]];
  if (!root) return articles;

  // 조문 찾기
  let joList = root["조문"];
  if (!joList) {
    // 중첩 구조일 수 있음
    for (const key of Object.keys(root)) {
      if (typeof root[key] === "object" && root[key]?.["조문단위"]) {
        joList = [root[key]];
        break;
      }
    }
  }
  if (!joList) return articles;

  // 조문 배열
  let joContainer = Array.isArray(joList) ? joList[0] : joList;
  let joUnits = joContainer?.["조문단위"];
  if (!joUnits) return articles;
  if (!Array.isArray(joUnits)) joUnits = [joUnits];

  for (const unit of joUnits) {
    const article = parseOneArticle(unit, lawName, mst);
    if (article) articles.push(article);
  }

  return articles;
}

function parseOneArticle(unit, lawName, mst) {
  // 조문여부가 "전문"이면 편/장/절 제목이므로 건너뜀
  const yeobu = extractText(unit["조문여부"]);
  if (yeobu && yeobu !== "조문") return null;

  const numberRaw = extractText(unit["조문번호"]);
  const title = extractText(unit["조문제목"]);
  let content = extractText(unit["조문내용"]);

  if (!content || content.length < 3) return null;

  // 편/장/절 제목 패턴 필터링 (조문여부 없는 경우 대비)
  if (/^제\d+편\s/.test(content) || /^제\d+장\s/.test(content) || /^제\d+절\s/.test(content)) {
    return null;
  }

  // 조문번호 포맷
  let articleNumber = numberRaw;
  if (articleNumber && !articleNumber.startsWith("제")) {
    articleNumber = `제${articleNumber}조`;
  }

  // 항(paragraph) 내용 합치기
  const hangContent = collectHangContent(unit["항"]);
  if (hangContent) {
    content = content + "\n" + hangContent;
  }

  return {
    statute_name: lawName,
    statute_mst: mst,
    article_number: articleNumber || "",
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

// 정규식 폴백: XML 파싱 실패 시
function parseArticlesRegex(xml, lawName, mst) {
  const articles = [];

  // <조문단위> 블록 추출
  const blockRegex = /<조문단위[^>]*>([\s\S]*?)<\/조문단위>/g;
  let match;
  while ((match = blockRegex.exec(xml)) !== null) {
    const block = match[1];

    const numMatch = block.match(
      /<조문번호>\s*(?:<!\[CDATA\[)?\s*(\d+(?:의\d+)?)\s*(?:\]\]>)?\s*<\/조문번호>/
    );
    const titleMatch = block.match(
      /<조문제목>\s*(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?\s*<\/조문제목>/
    );
    const contentMatch = block.match(
      /<조문내용>\s*(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?\s*<\/조문내용>/
    );

    if (!contentMatch) continue;

    const content = contentMatch[1].trim();
    if (content.length < 3) continue;

    const num = numMatch ? numMatch[1] : "";
    const articleNumber = num && !num.startsWith("제") ? `제${num}조` : num;
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
      statute_name: lawName,
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
  if (DRY_RUN || articles.length === 0) return { success: articles.length, errors: 0 };

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
        // 409 = duplicate, which is fine with ignore-duplicates
        if (resp.status === 409) {
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
// 5단계: 진행 상황 저장/복구
// ============================================================
import fs from "fs";
import path from "path";

const PROGRESS_FILE = "/home/user/law-caddy/scripts/.statutes_progress.json";

function saveProgress(idx, stats) {
  try {
    fs.writeFileSync(
      PROGRESS_FILE,
      JSON.stringify({ lastIndex: idx, ...stats, savedAt: new Date().toISOString() })
    );
  } catch (_) {}
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
    }
  } catch (_) {}
  return null;
}

// ============================================================
// 메인 실행
// ============================================================
async function main() {
  console.log("=" .repeat(60));
  console.log("법제처 Open API - 전체 법령 조문 수집기");
  console.log(`모드: ${LAWS_ONLY ? "법률만" : "법률 + 시행령"} | ${DRY_RUN ? "DRY RUN" : "실제 업로드"}`);
  if (RESUME_IDX > 0) console.log(`재개 인덱스: ${RESUME_IDX}`);
  console.log("=" .repeat(60));

  // 1. 법령 목록 수집
  const lawList = await fetchAllLawList();

  // 2. 기존 법령 확인
  const existingNames = await fetchExistingStatuteNames();

  // 3. 필터링: 이미 수집된 법령 제외
  const toProcess = [];
  let skippedExisting = 0;
  for (const law of lawList) {
    if (existingNames.has(law.name)) {
      skippedExisting++;
    } else {
      toProcess.push(law);
    }
  }
  console.log(
    `\n처리 대상: ${toProcess.length}건 (기존 ${skippedExisting}건 건너뜀)`
  );

  // 4. 조문 수집 및 업로드
  let totalArticles = 0;
  let totalSuccess = 0;
  let totalErrors = 0;
  let processedLaws = 0;
  let failedLaws = 0;
  const startIdx = RESUME_IDX > 0 ? RESUME_IDX : 0;
  const startTime = Date.now();

  console.log("\n" + "=" .repeat(60));
  console.log("조문 수집 및 업로드 시작");
  console.log("=" .repeat(60));

  for (let i = startIdx; i < toProcess.length; i++) {
    const law = toProcess[i];
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const pct = (((i + 1) / toProcess.length) * 100).toFixed(1);

    // 조문 수집
    const articles = await fetchArticles(law.mst, law.name);

    if (articles.length === 0) {
      failedLaws++;
      if (i < 20 || i % 100 === 0) {
        console.log(
          `[${i + 1}/${toProcess.length}] ${pct}% | ${law.name} (${law.type}) - 조문 없음 | ${elapsed}분 경과`
        );
      }
      await sleep(500);
      continue;
    }

    // 업로드
    const result = await uploadBatch(articles);
    totalArticles += articles.length;
    totalSuccess += result.success;
    totalErrors += result.errors;
    processedLaws++;

    // 진행 상황 출력 (매 10건 또는 처음 20건)
    if (i < 20 || i % 10 === 0 || i === toProcess.length - 1) {
      console.log(
        `[${i + 1}/${toProcess.length}] ${pct}% | ${law.name} (${law.type}): ${articles.length}개 조문 | 누적 ${totalArticles}개 | ${elapsed}분`
      );
    }

    // 50건마다 진행 상황 저장
    if (i % 50 === 0) {
      saveProgress(i, {
        processedLaws,
        failedLaws,
        totalArticles,
        totalSuccess,
        totalErrors,
      });
    }

    // rate limit 방지
    await sleep(1000);
  }

  // 최종 보고
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log("\n" + "=" .repeat(60));
  console.log("수집 완료!");
  console.log("=" .repeat(60));
  console.log(`소요 시간: ${totalTime}분`);
  console.log(`처리 법령: ${processedLaws}건 (실패: ${failedLaws}건)`);
  console.log(`수집 조문: ${totalArticles}개`);
  console.log(`업로드 성공: ${totalSuccess}건, 실패: ${totalErrors}건`);
  console.log(
    `기존 건너뜀: ${skippedExisting}건`
  );

  // 진행 파일 삭제
  try {
    fs.unlinkSync(PROGRESS_FILE);
  } catch (_) {}
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
