-- ============================================================
-- LAW-CADDY: Supabase 벡터 검색 RPC 함수 설정 (9개 테이블)
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ────────────────────────────────────────────
-- 1. match_legal_forms: 법률 서식 벡터 검색
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_legal_forms(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id int,
  title text,
  category text,
  content text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT lf.id, lf.title, lf.category, lf.content,
    (1 - (lf.embedding <=> query_embedding))::float AS similarity
  FROM legal_forms lf
  WHERE lf.embedding IS NOT NULL
    AND 1 - (lf.embedding <=> query_embedding) > match_threshold
  ORDER BY lf.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 2. match_easy_law: 생활법률 + 법령용어/지식 벡터 검색
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_easy_law(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id int,
  topic text,
  content text,
  related_statutes text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT el.id, el.topic, el.content, el.related_statutes,
    (1 - (el.embedding <=> query_embedding))::float AS similarity
  FROM easy_law el
  WHERE el.embedding IS NOT NULL
    AND 1 - (el.embedding <=> query_embedding) > match_threshold
  ORDER BY el.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 3. match_statutes: 법령 조문 벡터 검색
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_statutes(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id int,
  law_name text,
  article_number text,
  article_title text,
  article_content text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.law_name, s.article_number, s.article_title, s.article_content,
    (1 - (s.embedding <=> query_embedding))::float AS similarity
  FROM statutes s
  WHERE s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 4. match_aihub_legal_qa: AI Hub 법률 QA 벡터 검색
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_aihub_legal_qa(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id int,
  category text,
  doc_type text,
  task_type text,
  question text,
  answer text,
  source_info text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT qa.id, qa.category, qa.doc_type, qa.task_type,
    qa.question, qa.answer, qa.source_info,
    (1 - (qa.embedding <=> query_embedding))::float AS similarity
  FROM aihub_legal_qa qa
  WHERE qa.embedding IS NOT NULL
    AND 1 - (qa.embedding <=> query_embedding) > match_threshold
  ORDER BY qa.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 5. match_legal_judgments: 판결문 벡터 검색
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_legal_judgments(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id bigint,
  doc_id text,
  court text,
  case_name text,
  case_type text,
  category text,
  doc_type text,
  summary text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT lj.id, lj.doc_id, lj.court, lj.case_name, lj.case_type,
    lj.category, lj.doc_type, lj.summary,
    (1 - (lj.embedding <=> query_embedding))::float AS similarity
  FROM legal_judgments lj
  WHERE lj.embedding IS NOT NULL
    AND 1 - (lj.embedding <=> query_embedding) > match_threshold
  ORDER BY lj.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 6. match_legal_mrc: 기계독해 QA 벡터 검색
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_legal_mrc(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id int,
  doc_title text,
  doc_class text,
  qa_type text,
  context text,
  question text,
  answer text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT mrc.id, mrc.doc_title, mrc.doc_class, mrc.qa_type,
    mrc.context, mrc.question, mrc.answer,
    (1 - (mrc.embedding <=> query_embedding))::float AS similarity
  FROM legal_mrc mrc
  WHERE mrc.embedding IS NOT NULL
    AND 1 - (mrc.embedding <=> query_embedding) > match_threshold
  ORDER BY mrc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 7. match_legal_terms: 법령용어 벡터 검색
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_legal_terms(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id int,
  term text,
  definition text,
  related_terms text[],
  synonyms text[],
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT lt.id, lt.term, lt.definition, lt.related_terms, lt.synonyms,
    (1 - (lt.embedding <=> query_embedding))::float AS similarity
  FROM legal_terms lt
  WHERE lt.embedding IS NOT NULL
    AND 1 - (lt.embedding <=> query_embedding) > match_threshold
  ORDER BY lt.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 8. match_legal_knowledge: 법령지식 벡터 검색
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_legal_knowledge(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id int,
  category text,
  title text,
  content text,
  statute_name text,
  entry_type text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT lk.id, lk.category, lk.title, lk.content,
    lk.statute_name, lk.entry_type,
    (1 - (lk.embedding <=> query_embedding))::float AS similarity
  FROM legal_knowledge lk
  WHERE lk.embedding IS NOT NULL
    AND 1 - (lk.embedding <=> query_embedding) > match_threshold
  ORDER BY lk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 9. match_cases: 판례 벡터 검색
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_cases(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id bigint,
  case_number text,
  court text,
  case_date text,
  category text,
  summary text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.case_number, c.court, c.case_date,
    c.category, c.summary,
    (1 - (c.embedding <=> query_embedding))::float AS similarity
  FROM cases c
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- ivfflat 인덱스 (벡터 검색 성능 최적화)
-- 임베딩 데이터가 있는 테이블에만 적용
-- ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_legal_forms_embedding
  ON legal_forms USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_easy_law_embedding
  ON easy_law USING ivfflat (embedding vector_cosine_ops) WITH (lists = 200);

CREATE INDEX IF NOT EXISTS idx_statutes_embedding
  ON statutes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_aihub_legal_qa_embedding
  ON aihub_legal_qa USING ivfflat (embedding vector_cosine_ops) WITH (lists = 200);

CREATE INDEX IF NOT EXISTS idx_legal_judgments_embedding
  ON legal_judgments USING ivfflat (embedding vector_cosine_ops) WITH (lists = 150);

CREATE INDEX IF NOT EXISTS idx_legal_mrc_embedding
  ON legal_mrc USING ivfflat (embedding vector_cosine_ops) WITH (lists = 200);

CREATE INDEX IF NOT EXISTS idx_legal_terms_embedding
  ON legal_terms USING ivfflat (embedding vector_cosine_ops) WITH (lists = 200);

CREATE INDEX IF NOT EXISTS idx_legal_knowledge_embedding
  ON legal_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_cases_embedding
  ON cases USING ivfflat (embedding vector_cosine_ops) WITH (lists = 200);
