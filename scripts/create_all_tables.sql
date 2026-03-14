-- ============================================================
-- LAW-CADDY: 신규 테이블 4개 + 인덱스 일괄 생성
-- Supabase Dashboard > SQL Editor에서 실행:
-- https://supabase.com/dashboard/project/eafcyvbgcedvhlwqotis/sql/new
-- ============================================================

-- pgvector 확장 (이미 있으면 무시)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. legal_judgments — 민사/행정/형사법 원천 판결문·법령·심결례·유권해석
-- ============================================================
CREATE TABLE IF NOT EXISTS legal_judgments (
  id BIGSERIAL PRIMARY KEY,
  doc_id TEXT NOT NULL,
  court TEXT,
  case_name TEXT,
  case_type TEXT,
  category TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doc_id)
);

CREATE INDEX IF NOT EXISTS idx_legal_judgments_doc_id ON legal_judgments(doc_id);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_category ON legal_judgments(category);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_doc_type ON legal_judgments(doc_type);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_case_type ON legal_judgments(case_type);
CREATE INDEX IF NOT EXISTS idx_legal_judgments_court ON legal_judgments(court);

-- ============================================================
-- 2. legal_mrc — 금융·법률 문서 기계독해 QA 데이터
-- ============================================================
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

-- ============================================================
-- 3. legal_terms — 법령용어 사전
-- ============================================================
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

-- ============================================================
-- 4. legal_knowledge — 법령지식 (교통사고·창업인허가·층간소음·법령·생활법령)
-- ============================================================
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

-- ============================================================
-- 완료! 4개 테이블 생성됨:
--   legal_judgments, legal_mrc, legal_terms, legal_knowledge
-- ============================================================
