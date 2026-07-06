-- ============================================================
-- LAW-CADDY: statutes 테이블 벡터 인덱스를 IVFFlat → HNSW로 마이그레이션
--
-- 목적: hybrid_search_statutes RPC가 statement timeout(57014) 나는 문제 해결
-- 기반: migrate_cases_to_hnsw.sql 과 동일한 패턴
--
-- 실행 방법:
--   psql로 직접 접속해서 -f 옵션으로 실행하세요. (Supabase SQL Editor는 2분 제한)
--   ⚠️ Supabase Compute 2XL (32GB RAM) 상태에서만 실행 권장.
--
-- 전제 조건:
--   - statutes.embedding vector(1024) 컬럼 존재
--   - statutes.fts tsvector 컬럼 존재 (GENERATED)
-- ============================================================

-- 세션 설정: 인덱스 빌드 동안 타임아웃 제거 + 메모리 활용
-- 주의: maintenance_work_mem은 shared memory 한계 때문에 4GB 이하로 설정
-- (이전 시도: 24GB → shared memory resize 실패)
SET statement_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET maintenance_work_mem = '4GB';
SET max_parallel_maintenance_workers = 4;

-- ════════════════════════════════════════════════
-- 1. HNSW 인덱스 생성
--    m              = 16  (그래프 연결도, 권장 기본값)
--    ef_construction = 64  (빌드 품질, 높을수록 정확하지만 느림)
-- ════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_statutes_embedding_hnsw
  ON statutes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ════════════════════════════════════════════════
-- 2. 기존 IVFFlat 인덱스 제거 (존재할 경우에만)
--    statutes 테이블의 embedding 컬럼에 걸린 모든 ivfflat 인덱스
-- ════════════════════════════════════════════════
DO $$
DECLARE
  idx_name TEXT;
BEGIN
  FOR idx_name IN
    SELECT i.indexname
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_am am ON am.oid = c.relam
    WHERE i.tablename = 'statutes'
      AND am.amname = 'ivfflat'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx_name);
    RAISE NOTICE 'Dropped ivfflat index: %', idx_name;
  END LOOP;
END $$;

-- ════════════════════════════════════════════════
-- 3. hybrid_search_statutes 함수 재생성 (HNSW 최적화)
--    - hnsw.ef_search 설정 추가
--    - 함수 시그니처는 기존과 동일하게 유지 (호환성)
-- ════════════════════════════════════════════════
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
  -- HNSW 검색 품질 (60 권장)
  SET LOCAL hnsw.ef_search = 60;

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
