#!/usr/bin/env node
/**
 * cases_precedents 테이블 생성 스크립트
 *
 * 사용법:
 *   node scripts/07_setup_table.mjs
 *
 * 환경변수 (선택):
 *   DATABASE_URL: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 *
 * DATABASE_URL이 없으면 Supabase REST API로 테이블 존재 여부만 확인하고
 * 없으면 생성 SQL을 출력합니다.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://eafcyvbgcedvhlwqotis.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZmN5dmJnY2Vkdmhsd3FvdGlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4NjI0NiwiZXhwIjoyMDg3NjYyMjQ2fQ.MFQ39uy3DWI2BSnnYBqDgiH24eTc9Hwtsq9lE0cC8og";

const CREATE_TABLE_SQL = `
-- 판례 데이터 테이블 생성
CREATE TABLE IF NOT EXISTS cases_precedents (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'unknown',
    precedent_number TEXT,
    case_number TEXT,
    case_name TEXT,
    case_type TEXT,
    court_name TEXT,
    sentence_date TEXT,
    judgement_type TEXT,
    jdgmn TEXT,
    jdgmn_info JSONB,
    summary TEXT,
    summary_passage TEXT,
    keywords TEXT[],
    reference_rules TEXT,
    reference_court_case TEXT,
    class_name TEXT,
    instance_name TEXT,
    judgement_abstract TEXT,
    judgement_note TEXT,
    precedent_text TEXT,
    ref_article TEXT,
    ref_precedent TEXT,
    pan_si_sahang TEXT,
    pan_gyul_yoji TEXT,
    chamjo_jomun TEXT,
    chamjo_panrye TEXT,
    panrye_naeyong TEXT,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source, case_number)
);

CREATE INDEX IF NOT EXISTS idx_cp_case_number ON cases_precedents(case_number);
CREATE INDEX IF NOT EXISTS idx_cp_case_type ON cases_precedents(case_type);
CREATE INDEX IF NOT EXISTS idx_cp_source ON cases_precedents(source);
CREATE INDEX IF NOT EXISTS idx_cp_court_name ON cases_precedents(court_name);
CREATE INDEX IF NOT EXISTS idx_cp_sentence_date ON cases_precedents(sentence_date);
`;

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. 테이블 존재 확인
  const { data, error } = await sb
    .from("cases_precedents")
    .select("id")
    .limit(1);

  if (error && error.code === "PGRST205") {
    console.log("cases_precedents 테이블이 존재하지 않습니다.\n");

    // 2. DATABASE_URL이 있으면 pg로 직접 생성
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      console.log("DATABASE_URL 발견 — pg로 테이블 생성 시도...");
      try {
        const pg = await import("pg");
        const pool = new pg.default.Pool({
          connectionString: dbUrl,
          ssl: { rejectUnauthorized: false },
        });
        await pool.query(CREATE_TABLE_SQL);
        console.log("테이블 생성 완료!");
        await pool.end();
        return;
      } catch (e) {
        console.error("pg 연결 실패:", e.message);
      }
    }

    // 3. SQL 출력
    console.log("아래 SQL을 Supabase Dashboard > SQL Editor에서 실행하세요:\n");
    console.log("=" .repeat(60));
    console.log(CREATE_TABLE_SQL);
    console.log("=" .repeat(60));
    console.log(
      "\n실행 후 이 스크립트를 다시 실행하여 확인하세요."
    );
    process.exit(1);
  } else if (error) {
    console.error("확인 오류:", error.message);
    process.exit(1);
  } else {
    console.log("cases_precedents 테이블 확인 완료!");
  }
}

main().catch(console.error);
