-- ============================================================
-- 법률 지식베이스 테이블 생성 SQL
-- Supabase Dashboard > SQL Editor에서 실행하세요:
-- https://supabase.com/dashboard/project/eafcyvbgcedvhlwqotis/sql/new
-- ============================================================

-- 1. 법령용어 테이블
CREATE TABLE IF NOT EXISTS legal_terms (
  id SERIAL PRIMARY KEY,
  term TEXT NOT NULL,
  related_terms TEXT[],
  synonyms TEXT[],
  hypernyms TEXT[],
  definition TEXT,
  source_uri TEXT,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(term)
);

CREATE INDEX IF NOT EXISTS idx_legal_terms_term ON legal_terms(term);

-- 2. 법령지식 테이블
CREATE TABLE IF NOT EXISTS legal_knowledge (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  source TEXT,
  source_uri TEXT,
  statute_name TEXT,
  article_name TEXT,
  related_laws TEXT[],
  entry_type TEXT,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, source_uri)
);

CREATE INDEX IF NOT EXISTS idx_legal_knowledge_category ON legal_knowledge(category);
CREATE INDEX IF NOT EXISTS idx_legal_knowledge_source ON legal_knowledge(source);
CREATE INDEX IF NOT EXISTS idx_legal_knowledge_statute ON legal_knowledge(statute_name);
CREATE INDEX IF NOT EXISTS idx_legal_knowledge_entry_type ON legal_knowledge(entry_type);

-- 3. FTS 인덱스 추가 (한국어 검색용)
ALTER TABLE legal_terms ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(term, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_legal_terms_fts ON legal_terms USING gin(fts);

ALTER TABLE legal_knowledge ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_legal_knowledge_fts ON legal_knowledge USING gin(fts);
