-- cases_precedents 테이블 생성
-- Supabase Dashboard > SQL Editor에서 실행하세요
-- https://supabase.com/dashboard/project/eafcyvbgcedvhlwqotis/sql/new

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
