-- legal_mrc 테이블 생성 (금융/법률 문서 기계독해 데이터)
-- Supabase Dashboard > SQL Editor에서 실행:
-- https://supabase.com/dashboard/project/eafcyvbgcedvhlwqotis/sql/new

CREATE TABLE IF NOT EXISTS legal_mrc (
  id SERIAL PRIMARY KEY,
  doc_id TEXT,
  doc_title TEXT,
  doc_source TEXT,
  doc_class TEXT,
  qa_type TEXT,
  context TEXT,
  question TEXT,
  answer TEXT,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_mrc_qa_type ON legal_mrc(qa_type);
CREATE INDEX IF NOT EXISTS idx_legal_mrc_doc_id ON legal_mrc(doc_id);
