-- legal_judgments 테이블 생성
-- Supabase Dashboard > SQL Editor에서 실행:
-- https://supabase.com/dashboard/project/eafcyvbgcedvhlwqotis/sql/new

CREATE TABLE IF NOT EXISTS legal_judgments (
  id bigserial PRIMARY KEY,
  doc_id text NOT NULL,
  court text,
  case_name text,
  case_type text,
  category text NOT NULL,
  doc_type text NOT NULL,
  content text NOT NULL,
  summary text,
  embedding vector(1024),
  created_at timestamptz DEFAULT now(),
  UNIQUE(doc_id)
);

CREATE INDEX IF NOT EXISTS idx_legal_judgments_doc_id ON legal_judgments(doc_id);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_category ON legal_judgments(category);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_doc_type ON legal_judgments(doc_type);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_case_type ON legal_judgments(case_type);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_court ON legal_judgments(court);

-- FTS (Full Text Search) 인덱스 (선택)
-- CREATE INDEX IF NOT EXISTS idx_legal_judgments_content_fts ON legal_judgments USING gin(to_tsvector('simple', content));
