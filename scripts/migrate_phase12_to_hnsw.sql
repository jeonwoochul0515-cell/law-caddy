-- ============================================================
-- LAW-CADDY: Phase 1+2 HNSW 마이그레이션
-- 대상: easy_law, legal_terms, legal_judgments, legal_knowledge
--
-- 목적: Small 다운그레이드 후에도 timeout 안 나도록 예방
-- 기반: DB에서 직접 추출한 함수 body + HNSW ef_search 설정 추가
--
-- 실행 방법:
--   ⚠️ Supabase Compute 2XL 상태에서만 실행 권장.
--   psql로 직접 접속: -f 옵션
--
-- 예상 시간: 20~40분 (4개 테이블 합쳐서)
-- ============================================================

-- 세션 설정
SET statement_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET maintenance_work_mem = '4GB';
SET max_parallel_maintenance_workers = 4;

-- ═══════════════════════════════════════════════════════════
-- PART 1: easy_law (533,041 rows — 가장 큰 테이블)
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_easy_law_embedding_hnsw
  ON easy_law USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

DO $$
DECLARE
  idx_name TEXT;
BEGIN
  FOR idx_name IN
    SELECT i.indexname
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_am am ON am.oid = c.relam
    WHERE i.tablename = 'easy_law' AND am.amname = 'ivfflat'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
    RAISE NOTICE 'Dropped ivfflat index: %', idx_name;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.hybrid_search_easy_law(
  query_text text,
  query_embedding vector,
  match_count integer DEFAULT 5,
  keyword_weight double precision DEFAULT 0.3,
  semantic_weight double precision DEFAULT 0.7
)
RETURNS TABLE(
  id integer,
  topic text,
  title text,
  content text,
  related_statutes text,
  semantic_score double precision,
  keyword_score double precision,
  combined_score double precision
)
LANGUAGE plpgsql
AS $function$
BEGIN
  SET LOCAL hnsw.ef_search = 60;
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
$function$;

-- ═══════════════════════════════════════════════════════════
-- PART 2: legal_terms (247,478 rows)
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_legal_terms_embedding_hnsw
  ON legal_terms USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

DO $$
DECLARE
  idx_name TEXT;
BEGIN
  FOR idx_name IN
    SELECT i.indexname
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_am am ON am.oid = c.relam
    WHERE i.tablename = 'legal_terms' AND am.amname = 'ivfflat'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
    RAISE NOTICE 'Dropped ivfflat index: %', idx_name;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.hybrid_search_legal_terms(
  query_text text,
  query_embedding vector,
  match_count integer DEFAULT 5,
  keyword_weight double precision DEFAULT 0.3,
  semantic_weight double precision DEFAULT 0.7
)
RETURNS TABLE(
  id integer,
  term text,
  definition text,
  related_terms text,
  source_statute text,
  semantic_score double precision,
  keyword_score double precision,
  combined_score double precision
)
LANGUAGE plpgsql
AS $function$
BEGIN
  SET LOCAL hnsw.ef_search = 60;
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
    array_to_string(lt.related_terms, ', ')::text AS related_terms,
    lt.source_uri AS source_statute,
    c.sem_score AS semantic_score,
    c.kw_score AS keyword_score,
    c.comb_score AS combined_score
  FROM combined c
  JOIN legal_terms lt ON lt.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$function$;

-- ═══════════════════════════════════════════════════════════
-- PART 3: legal_judgments (176,876 rows)
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_legal_judgments_embedding_hnsw
  ON legal_judgments USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

DO $$
DECLARE
  idx_name TEXT;
BEGIN
  FOR idx_name IN
    SELECT i.indexname
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_am am ON am.oid = c.relam
    WHERE i.tablename = 'legal_judgments' AND am.amname = 'ivfflat'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
    RAISE NOTICE 'Dropped ivfflat index: %', idx_name;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.hybrid_search_legal_judgments(
  query_text text,
  query_embedding vector,
  match_count integer DEFAULT 5,
  keyword_weight double precision DEFAULT 0.3,
  semantic_weight double precision DEFAULT 0.7
)
RETURNS TABLE(
  id bigint,
  doc_id text,
  court text,
  case_name text,
  case_type text,
  category text,
  doc_type text,
  content text,
  summary text,
  semantic_score double precision,
  keyword_score double precision,
  combined_score double precision
)
LANGUAGE plpgsql
AS $function$
BEGIN
  SET LOCAL hnsw.ef_search = 60;
  RETURN QUERY
  WITH semantic AS (
    SELECT lj.id, (1 - (lj.embedding <=> query_embedding))::float AS score
    FROM legal_judgments lj
    WHERE lj.embedding IS NOT NULL
    ORDER BY lj.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT lj.id, ts_rank(lj.fts, websearch_to_tsquery('simple', query_text))::float AS score
    FROM legal_judgments lj
    WHERE lj.fts @@ websearch_to_tsquery('simple', query_text)
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT coalesce(s.id, k.id) AS id,
      coalesce(s.score, 0.0)::float AS sem_score,
      coalesce(k.score, 0.0)::float AS kw_score,
      (coalesce(s.score, 0.0) * semantic_weight + coalesce(k.score, 0.0) * keyword_weight)::float AS comb_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT lj.id, lj.doc_id, lj.court, lj.case_name, lj.case_type, lj.category, lj.doc_type, lj.content, lj.summary,
    c.sem_score, c.kw_score, c.comb_score
  FROM combined c
  JOIN legal_judgments lj ON lj.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$function$;

-- ═══════════════════════════════════════════════════════════
-- PART 4: legal_knowledge (52,076 rows)
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_legal_knowledge_embedding_hnsw
  ON legal_knowledge USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

DO $$
DECLARE
  idx_name TEXT;
BEGIN
  FOR idx_name IN
    SELECT i.indexname
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_am am ON am.oid = c.relam
    WHERE i.tablename = 'legal_knowledge' AND am.amname = 'ivfflat'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
    RAISE NOTICE 'Dropped ivfflat index: %', idx_name;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.hybrid_search_legal_knowledge(
  query_text text,
  query_embedding vector,
  match_count integer DEFAULT 5,
  keyword_weight double precision DEFAULT 0.3,
  semantic_weight double precision DEFAULT 0.7
)
RETURNS TABLE(
  id integer,
  topic text,
  title text,
  content text,
  related_statutes text,
  category text,
  semantic_score double precision,
  keyword_score double precision,
  combined_score double precision
)
LANGUAGE plpgsql
AS $function$
BEGIN
  SET LOCAL hnsw.ef_search = 60;
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
    lk.entry_type AS topic,
    lk.title,
    lk.content,
    array_to_string(lk.related_laws, ', ')::text AS related_statutes,
    lk.category,
    c.sem_score AS semantic_score,
    c.kw_score AS keyword_score,
    c.comb_score AS combined_score
  FROM combined c
  JOIN legal_knowledge lk ON lk.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$function$;
