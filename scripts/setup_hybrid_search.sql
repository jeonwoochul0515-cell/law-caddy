-- ============================================================
-- LAW-CADDY: 하이브리드 검색 (키워드 + 시맨틱) + Re-ranking SQL 함수
-- Supabase SQL Editor에서 실행하세요.
--
-- 사전 요구사항:
--   - pgvector 확장 활성화
--   - 4개 테이블에 embedding vector(1024) 컬럼 존재
-- ============================================================

-- pgvector 확장 (이미 있으면 무시)
CREATE EXTENSION IF NOT EXISTS vector;

-- ════════════════════════════════════════════════
-- 1. Full-Text Search (FTS) 컬럼 및 인덱스 설정
--    한국어 형태소 분석기가 없으므로 'simple' config 사용
--    (공백 기준 토큰 분리, 한국어 키워드 매칭에 적합)
-- ════════════════════════════════════════════════

-- ────────────────────────────────────────────
-- 1-1. legal_forms FTS
-- ────────────────────────────────────────────
ALTER TABLE legal_forms
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(title, '') || ' ' ||
      coalesce(content, '') || ' ' ||
      coalesce(form_type, '') || ' ' ||
      coalesce(case_category, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS legal_forms_fts_idx
  ON legal_forms USING gin(fts);

-- ────────────────────────────────────────────
-- 1-2. easy_law FTS
-- ────────────────────────────────────────────
ALTER TABLE easy_law
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(title, '') || ' ' ||
      coalesce(topic, '') || ' ' ||
      coalesce(content, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS easy_law_fts_idx
  ON easy_law USING gin(fts);

-- ────────────────────────────────────────────
-- 1-3. statutes FTS
-- ────────────────────────────────────────────
ALTER TABLE statutes
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(statute_name, '') || ' ' ||
      coalesce(article_number, '') || ' ' ||
      coalesce(article_title, '') || ' ' ||
      coalesce(article_content, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS statutes_fts_idx
  ON statutes USING gin(fts);

-- ────────────────────────────────────────────
-- 1-4. aihub_legal_qa FTS
-- ────────────────────────────────────────────
ALTER TABLE aihub_legal_qa
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(category, '') || ' ' ||
      coalesce(question, '') || ' ' ||
      coalesce(answer, '') || ' ' ||
      coalesce(source_info, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS aihub_legal_qa_fts_idx
  ON aihub_legal_qa USING gin(fts);


-- ────────────────────────────────────────────
-- 1-5. legal_judgments FTS (판결문)
-- ────────────────────────────────────────────
ALTER TABLE legal_judgments
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(doc_id, '') || ' ' ||
      coalesce(court, '') || ' ' ||
      coalesce(case_name, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(content, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS legal_judgments_fts_idx
  ON legal_judgments USING gin(fts);

-- ────────────────────────────────────────────
-- 1-6. legal_mrc FTS (기계독해 QA)
-- ────────────────────────────────────────────
ALTER TABLE legal_mrc
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(doc_title, '') || ' ' ||
      coalesce(question, '') || ' ' ||
      coalesce(answer, '') || ' ' ||
      coalesce(context, '') || ' ' ||
      coalesce(qa_type, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS legal_mrc_fts_idx
  ON legal_mrc USING gin(fts);

-- ────────────────────────────────────────────
-- 1-7. legal_terms FTS (법령용어 사전)
-- ────────────────────────────────────────────
ALTER TABLE legal_terms
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(term, '') || ' ' ||
      coalesce(definition, '') || ' ' ||
      coalesce(related_terms, '') || ' ' ||
      coalesce(source_statute, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS legal_terms_fts_idx
  ON legal_terms USING gin(fts);

-- ────────────────────────────────────────────
-- 1-8. legal_knowledge FTS (법령지식)
-- ────────────────────────────────────────────
ALTER TABLE legal_knowledge
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(topic, '') || ' ' ||
      coalesce(title, '') || ' ' ||
      coalesce(content, '') || ' ' ||
      coalesce(related_statutes, '') || ' ' ||
      coalesce(category, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS legal_knowledge_fts_idx
  ON legal_knowledge USING gin(fts);


-- ════════════════════════════════════════════════
-- 2. 벡터 검색 인덱스 (ivfflat, cosine distance)
--    데이터가 1000행 이상일 때 효과적
-- ════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_legal_forms_embedding
  ON legal_forms USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_easy_law_embedding
  ON easy_law USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_statutes_embedding
  ON statutes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_aihub_legal_qa_embedding
  ON aihub_legal_qa USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_legal_judgments_embedding
  ON legal_judgments USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_legal_mrc_embedding
  ON legal_mrc USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_legal_terms_embedding
  ON legal_terms USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_legal_knowledge_embedding
  ON legal_knowledge USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);


-- ════════════════════════════════════════════════
-- 3. 하이브리드 검색 RPC 함수
--    시맨틱 (cosine similarity) + 키워드 (ts_rank)
--    combined_score = semantic * weight + keyword * weight
-- ════════════════════════════════════════════════

-- ────────────────────────────────────────────
-- 3-1. hybrid_search_legal_forms
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_legal_forms(
  query_text text,
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  keyword_weight float DEFAULT 0.3,
  semantic_weight float DEFAULT 0.7
)
RETURNS TABLE (
  id int,
  form_type text,
  case_category text,
  title text,
  content text,
  writing_guide text,
  source text,
  semantic_score float,
  keyword_score float,
  combined_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT
      lf.id,
      (1 - (lf.embedding <=> query_embedding))::float AS score
    FROM legal_forms lf
    WHERE lf.embedding IS NOT NULL
    ORDER BY lf.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT
      lf.id,
      ts_rank(lf.fts, websearch_to_tsquery('simple', query_text))::float AS score
    FROM legal_forms lf
    WHERE lf.fts @@ websearch_to_tsquery('simple', query_text)
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      coalesce(s.id, k.id) AS id,
      coalesce(s.score, 0.0)::float AS sem_score,
      coalesce(k.score, 0.0)::float AS kw_score,
      (coalesce(s.score, 0.0) * semantic_weight +
       coalesce(k.score, 0.0) * keyword_weight)::float AS comb_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT
    lf.id,
    lf.form_type,
    lf.case_category,
    lf.title,
    lf.content,
    lf.writing_guide,
    lf.source,
    c.sem_score AS semantic_score,
    c.kw_score AS keyword_score,
    c.comb_score AS combined_score
  FROM combined c
  JOIN legal_forms lf ON lf.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 3-2. hybrid_search_easy_law
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_easy_law(
  query_text text,
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  keyword_weight float DEFAULT 0.3,
  semantic_weight float DEFAULT 0.7
)
RETURNS TABLE (
  id int,
  topic text,
  title text,
  content text,
  related_statutes text,
  semantic_score float,
  keyword_score float,
  combined_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT
      el.id,
      (1 - (el.embedding <=> query_embedding))::float AS score
    FROM easy_law el
    WHERE el.embedding IS NOT NULL
    ORDER BY el.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT
      el.id,
      ts_rank(el.fts, websearch_to_tsquery('simple', query_text))::float AS score
    FROM easy_law el
    WHERE el.fts @@ websearch_to_tsquery('simple', query_text)
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      coalesce(s.id, k.id) AS id,
      coalesce(s.score, 0.0)::float AS sem_score,
      coalesce(k.score, 0.0)::float AS kw_score,
      (coalesce(s.score, 0.0) * semantic_weight +
       coalesce(k.score, 0.0) * keyword_weight)::float AS comb_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT
    el.id,
    el.topic,
    el.title,
    el.content,
    el.related_statutes::text,
    c.sem_score AS semantic_score,
    c.kw_score AS keyword_score,
    c.comb_score AS combined_score
  FROM combined c
  JOIN easy_law el ON el.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 3-3. hybrid_search_statutes
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_statutes(
  query_text text,
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  keyword_weight float DEFAULT 0.3,
  semantic_weight float DEFAULT 0.7
)
RETURNS TABLE (
  id int,
  statute_name text,
  article_number text,
  article_title text,
  article_content text,
  semantic_score float,
  keyword_score float,
  combined_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT
      st.id,
      (1 - (st.embedding <=> query_embedding))::float AS score
    FROM statutes st
    WHERE st.embedding IS NOT NULL
    ORDER BY st.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT
      st.id,
      ts_rank(st.fts, websearch_to_tsquery('simple', query_text))::float AS score
    FROM statutes st
    WHERE st.fts @@ websearch_to_tsquery('simple', query_text)
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      coalesce(s.id, k.id) AS id,
      coalesce(s.score, 0.0)::float AS sem_score,
      coalesce(k.score, 0.0)::float AS kw_score,
      (coalesce(s.score, 0.0) * semantic_weight +
       coalesce(k.score, 0.0) * keyword_weight)::float AS comb_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT
    st.id,
    st.statute_name,
    st.article_number,
    st.article_title,
    st.article_content,
    c.sem_score AS semantic_score,
    c.kw_score AS keyword_score,
    c.comb_score AS combined_score
  FROM combined c
  JOIN statutes st ON st.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 3-4. hybrid_search_aihub_qa
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_aihub_qa(
  query_text text,
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  keyword_weight float DEFAULT 0.3,
  semantic_weight float DEFAULT 0.7
)
RETURNS TABLE (
  id int,
  category text,
  doc_type text,
  task_type text,
  question text,
  answer text,
  source_info text,
  semantic_score float,
  keyword_score float,
  combined_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT
      qa.id,
      (1 - (qa.embedding <=> query_embedding))::float AS score
    FROM aihub_legal_qa qa
    WHERE qa.embedding IS NOT NULL
    ORDER BY qa.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT
      qa.id,
      ts_rank(qa.fts, websearch_to_tsquery('simple', query_text))::float AS score
    FROM aihub_legal_qa qa
    WHERE qa.fts @@ websearch_to_tsquery('simple', query_text)
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      coalesce(s.id, k.id) AS id,
      coalesce(s.score, 0.0)::float AS sem_score,
      coalesce(k.score, 0.0)::float AS kw_score,
      (coalesce(s.score, 0.0) * semantic_weight +
       coalesce(k.score, 0.0) * keyword_weight)::float AS comb_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT
    qa.id,
    qa.category,
    qa.doc_type,
    qa.task_type,
    qa.question,
    qa.answer,
    qa.source_info,
    c.sem_score AS semantic_score,
    c.kw_score AS keyword_score,
    c.comb_score AS combined_score
  FROM combined c
  JOIN aihub_legal_qa qa ON qa.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$$;


-- ────────────────────────────────────────────
-- 3-5. hybrid_search_legal_judgments (판결문)
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_legal_judgments(
  query_text text,
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  keyword_weight float DEFAULT 0.3,
  semantic_weight float DEFAULT 0.7
)
RETURNS TABLE (
  id bigint,
  doc_id text,
  court text,
  case_name text,
  case_type text,
  category text,
  doc_type text,
  content text,
  summary text,
  semantic_score float,
  keyword_score float,
  combined_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT
      lj.id,
      (1 - (lj.embedding <=> query_embedding))::float AS score
    FROM legal_judgments lj
    WHERE lj.embedding IS NOT NULL
    ORDER BY lj.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT
      lj.id,
      ts_rank(lj.fts, websearch_to_tsquery('simple', query_text))::float AS score
    FROM legal_judgments lj
    WHERE lj.fts @@ websearch_to_tsquery('simple', query_text)
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      coalesce(s.id, k.id) AS id,
      coalesce(s.score, 0.0)::float AS sem_score,
      coalesce(k.score, 0.0)::float AS kw_score,
      (coalesce(s.score, 0.0) * semantic_weight +
       coalesce(k.score, 0.0) * keyword_weight)::float AS comb_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT
    lj.id,
    lj.doc_id,
    lj.court,
    lj.case_name,
    lj.case_type,
    lj.category,
    lj.doc_type,
    lj.content,
    lj.summary,
    c.sem_score AS semantic_score,
    c.kw_score AS keyword_score,
    c.comb_score AS combined_score
  FROM combined c
  JOIN legal_judgments lj ON lj.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 3-6. hybrid_search_legal_mrc (기계독해 QA)
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_legal_mrc(
  query_text text,
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  keyword_weight float DEFAULT 0.3,
  semantic_weight float DEFAULT 0.7
)
RETURNS TABLE (
  id int,
  doc_title text,
  doc_source text,
  doc_class text,
  qa_type text,
  question text,
  answer text,
  context text,
  semantic_score float,
  keyword_score float,
  combined_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT
      mrc.id,
      (1 - (mrc.embedding <=> query_embedding))::float AS score
    FROM legal_mrc mrc
    WHERE mrc.embedding IS NOT NULL
    ORDER BY mrc.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT
      mrc.id,
      ts_rank(mrc.fts, websearch_to_tsquery('simple', query_text))::float AS score
    FROM legal_mrc mrc
    WHERE mrc.fts @@ websearch_to_tsquery('simple', query_text)
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      coalesce(s.id, k.id) AS id,
      coalesce(s.score, 0.0)::float AS sem_score,
      coalesce(k.score, 0.0)::float AS kw_score,
      (coalesce(s.score, 0.0) * semantic_weight +
       coalesce(k.score, 0.0) * keyword_weight)::float AS comb_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT
    mrc.id,
    mrc.doc_title,
    mrc.doc_source,
    mrc.doc_class,
    mrc.qa_type,
    mrc.question,
    mrc.answer,
    mrc.context,
    c.sem_score AS semantic_score,
    c.kw_score AS keyword_score,
    c.comb_score AS combined_score
  FROM combined c
  JOIN legal_mrc mrc ON mrc.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 3-7. hybrid_search_legal_terms (법령용어 사전)
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_legal_terms(
  query_text text,
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  keyword_weight float DEFAULT 0.3,
  semantic_weight float DEFAULT 0.7
)
RETURNS TABLE (
  id int,
  term text,
  definition text,
  related_terms text,
  source_statute text,
  semantic_score float,
  keyword_score float,
  combined_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT
      lt.id,
      (1 - (lt.embedding <=> query_embedding))::float AS score
    FROM legal_terms lt
    WHERE lt.embedding IS NOT NULL
    ORDER BY lt.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT
      lt.id,
      ts_rank(lt.fts, websearch_to_tsquery('simple', query_text))::float AS score
    FROM legal_terms lt
    WHERE lt.fts @@ websearch_to_tsquery('simple', query_text)
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      coalesce(s.id, k.id) AS id,
      coalesce(s.score, 0.0)::float AS sem_score,
      coalesce(k.score, 0.0)::float AS kw_score,
      (coalesce(s.score, 0.0) * semantic_weight +
       coalesce(k.score, 0.0) * keyword_weight)::float AS comb_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT
    lt.id,
    lt.term,
    lt.definition,
    lt.related_terms,
    lt.source_statute,
    c.sem_score AS semantic_score,
    c.kw_score AS keyword_score,
    c.comb_score AS combined_score
  FROM combined c
  JOIN legal_terms lt ON lt.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$$;

-- ────────────────────────────────────────────
-- 3-8. hybrid_search_legal_knowledge (법령지식)
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_legal_knowledge(
  query_text text,
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  keyword_weight float DEFAULT 0.3,
  semantic_weight float DEFAULT 0.7
)
RETURNS TABLE (
  id int,
  topic text,
  title text,
  content text,
  related_statutes text,
  category text,
  semantic_score float,
  keyword_score float,
  combined_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT
      lk.id,
      (1 - (lk.embedding <=> query_embedding))::float AS score
    FROM legal_knowledge lk
    WHERE lk.embedding IS NOT NULL
    ORDER BY lk.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT
      lk.id,
      ts_rank(lk.fts, websearch_to_tsquery('simple', query_text))::float AS score
    FROM legal_knowledge lk
    WHERE lk.fts @@ websearch_to_tsquery('simple', query_text)
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      coalesce(s.id, k.id) AS id,
      coalesce(s.score, 0.0)::float AS sem_score,
      coalesce(k.score, 0.0)::float AS kw_score,
      (coalesce(s.score, 0.0) * semantic_weight +
       coalesce(k.score, 0.0) * keyword_weight)::float AS comb_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT
    lk.id,
    lk.topic,
    lk.title,
    lk.content,
    lk.related_statutes,
    lk.category,
    c.sem_score AS semantic_score,
    c.kw_score AS keyword_score,
    c.comb_score AS combined_score
  FROM combined c
  JOIN legal_knowledge lk ON lk.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$$;


-- ════════════════════════════════════════════════
-- 4. 통합 하이브리드 검색 (모든 테이블 동시 검색)
--    source 컬럼으로 출처 구분
-- ════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION hybrid_search_all(
  query_text text,
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  keyword_weight float DEFAULT 0.3,
  semantic_weight float DEFAULT 0.7
)
RETURNS TABLE (
  id int,
  source_table text,
  title text,
  content text,
  metadata jsonb,
  semantic_score float,
  keyword_score float,
  combined_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY

  -- 법률 서식
  SELECT
    lf.id,
    'legal_forms'::text AS source_table,
    lf.title,
    lf.content,
    jsonb_build_object(
      'form_type', lf.form_type,
      'case_category', lf.case_category,
      'source', lf.source
    ) AS metadata,
    r.semantic_score,
    r.keyword_score,
    r.combined_score
  FROM hybrid_search_legal_forms(query_text, query_embedding, match_count, keyword_weight, semantic_weight) r
  JOIN legal_forms lf ON lf.id = r.id

  UNION ALL

  -- 생활법률
  SELECT
    el.id,
    'easy_law'::text,
    el.title,
    el.content,
    jsonb_build_object('topic', el.topic, 'related_statutes', el.related_statutes),
    r.semantic_score,
    r.keyword_score,
    r.combined_score
  FROM hybrid_search_easy_law(query_text, query_embedding, match_count, keyword_weight, semantic_weight) r
  JOIN easy_law el ON el.id = r.id

  UNION ALL

  -- 법령 조문
  SELECT
    st.id,
    'statutes'::text,
    (st.statute_name || ' ' || st.article_number)::text,
    st.article_content,
    jsonb_build_object(
      'statute_name', st.statute_name,
      'article_number', st.article_number,
      'article_title', st.article_title
    ),
    r.semantic_score,
    r.keyword_score,
    r.combined_score
  FROM hybrid_search_statutes(query_text, query_embedding, match_count, keyword_weight, semantic_weight) r
  JOIN statutes st ON st.id = r.id

  UNION ALL

  -- AI Hub 법률 QA
  SELECT
    qa.id,
    'aihub_legal_qa'::text,
    qa.question,
    qa.answer,
    jsonb_build_object(
      'category', qa.category,
      'doc_type', qa.doc_type,
      'task_type', qa.task_type,
      'source_info', qa.source_info
    ),
    r.semantic_score,
    r.keyword_score,
    r.combined_score
  FROM hybrid_search_aihub_qa(query_text, query_embedding, match_count, keyword_weight, semantic_weight) r
  JOIN aihub_legal_qa qa ON qa.id = r.id

  UNION ALL

  -- 판결문
  SELECT
    lj.id,
    'legal_judgments'::text,
    (lj.case_number || ' (' || coalesce(lj.court, '') || ')')::text,
    coalesce(lj.summary, lj.full_text),
    jsonb_build_object(
      'case_number', lj.case_number,
      'court', lj.court,
      'case_date', lj.case_date,
      'category', lj.category
    ),
    r.semantic_score,
    r.keyword_score,
    r.combined_score
  FROM hybrid_search_legal_judgments(query_text, query_embedding, match_count, keyword_weight, semantic_weight) r
  JOIN legal_judgments lj ON lj.id = r.id

  UNION ALL

  -- 기계독해 QA
  SELECT
    mrc.id,
    'legal_mrc'::text,
    mrc.question,
    mrc.answer,
    jsonb_build_object(
      'document_title', mrc.document_title,
      'category', mrc.category,
      'context_passage', mrc.context_passage
    ),
    r.semantic_score,
    r.keyword_score,
    r.combined_score
  FROM hybrid_search_legal_mrc(query_text, query_embedding, match_count, keyword_weight, semantic_weight) r
  JOIN legal_mrc mrc ON mrc.id = r.id

  UNION ALL

  -- 법령용어 사전
  SELECT
    lt.id,
    'legal_terms'::text,
    lt.term,
    lt.definition,
    jsonb_build_object(
      'related_terms', lt.related_terms,
      'source_statute', lt.source_statute
    ),
    r.semantic_score,
    r.keyword_score,
    r.combined_score
  FROM hybrid_search_legal_terms(query_text, query_embedding, match_count, keyword_weight, semantic_weight) r
  JOIN legal_terms lt ON lt.id = r.id

  UNION ALL

  -- 법령지식 (실생활 법률)
  SELECT
    lk.id,
    'legal_knowledge'::text,
    coalesce(lk.title, lk.topic),
    lk.content,
    jsonb_build_object(
      'topic', lk.topic,
      'category', lk.category,
      'related_statutes', lk.related_statutes
    ),
    r.semantic_score,
    r.keyword_score,
    r.combined_score
  FROM hybrid_search_legal_knowledge(query_text, query_embedding, match_count, keyword_weight, semantic_weight) r
  JOIN legal_knowledge lk ON lk.id = r.id

  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;
