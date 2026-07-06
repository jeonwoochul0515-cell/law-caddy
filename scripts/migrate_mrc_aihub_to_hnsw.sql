-- ============================================================
-- LAW-CADDY: legal_mrc + aihub_legal_qa 테이블 HNSW 마이그레이션
--
-- 목적: 2XL로는 동작하지만 Small로 돌아가면 다시 timeout 날 가능성 차단
-- 기반: migrate_cases_to_hnsw.sql, migrate_statutes_to_hnsw.sql 와 동일 패턴
--
-- 실행 방법:
--   psql로 직접 접속해서 -f 옵션으로 실행하세요.
--   ⚠️ Supabase Compute 2XL 상태에서만 실행 권장.
--
-- 전제 조건:
--   - legal_mrc.embedding vector(1024), legal_mrc.fts tsvector
--   - aihub_legal_qa.embedding vector(1024), aihub_legal_qa.fts tsvector
-- ============================================================

-- 세션 설정
SET statement_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET maintenance_work_mem = '4GB';
SET max_parallel_maintenance_workers = 4;

-- ════════════════════════════════════════════════
-- PART 1: legal_mrc 테이블
-- ════════════════════════════════════════════════

-- 1-1. HNSW 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_legal_mrc_embedding_hnsw
  ON legal_mrc USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 1-2. 기존 ivfflat 인덱스 자동 탐지 + 삭제
DO $$
DECLARE
  idx_name TEXT;
BEGIN
  FOR idx_name IN
    SELECT i.indexname
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_am am ON am.oid = c.relam
    WHERE i.tablename = 'legal_mrc'
      AND am.amname = 'ivfflat'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
    RAISE NOTICE 'Dropped ivfflat index: %', idx_name;
  END LOOP;
END $$;

-- 1-3. hybrid_search_legal_mrc 함수 재생성 (HNSW 최적화)
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
  SET LOCAL hnsw.ef_search = 60;

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

-- ════════════════════════════════════════════════
-- PART 2: aihub_legal_qa 테이블
-- ════════════════════════════════════════════════

-- 2-1. HNSW 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_aihub_legal_qa_embedding_hnsw
  ON aihub_legal_qa USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 2-2. 기존 ivfflat 인덱스 자동 탐지 + 삭제
DO $$
DECLARE
  idx_name TEXT;
BEGIN
  FOR idx_name IN
    SELECT i.indexname
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_am am ON am.oid = c.relam
    WHERE i.tablename = 'aihub_legal_qa'
      AND am.amname = 'ivfflat'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
    RAISE NOTICE 'Dropped ivfflat index: %', idx_name;
  END LOOP;
END $$;

-- 2-3. hybrid_search_aihub_qa 함수 재생성 (HNSW 최적화)
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
  SET LOCAL hnsw.ef_search = 60;

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
