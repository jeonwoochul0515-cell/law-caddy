-- ============================================================
-- LAW-CADDY: cases 테이블 HNSW 인덱스 — 빠른 빌드 버전
--
-- 목적: Supabase SQL Editor의 2분 타임아웃 안에 빌드 끝내기
-- 트레이드오프: 정확도 살짝 낮추는 대신 빌드 속도 대폭 향상
--
-- 변경점 (기존 migrate_cases_to_hnsw.sql 대비):
--   - m              16 → 8   (그래프 연결도 절반)
--   - ef_construction 64 → 16 (빌드 품질 1/4)
--   - maintenance_work_mem 1GB로 상향 (빌드 메모리 확장)
--   - max_parallel_maintenance_workers 4 (병렬 빌드)
--
-- 실행 방법:
--   Supabase SQL Editor에 전체 붙여넣고 Run.
--   2분 안에 끝나면 성공. 또 타임아웃 나면 다른 방법 필요.
-- ============================================================

-- 빌드 속도 최적화 파라미터 (현재 세션에만 적용)
-- 주의: maintenance_work_mem은 Supabase 플랜의 공유 메모리 한계 때문에 올리지 않음
SET max_parallel_maintenance_workers = 2;

-- ════════════════════════════════════════════════
-- 1. HNSW 인덱스 생성 (가벼운 설정)
-- ════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_cases_embedding_hnsw
  ON cases USING hnsw (embedding vector_cosine_ops)
  WITH (m = 8, ef_construction = 16);

-- ════════════════════════════════════════════════
-- 2. 기존 IVFFlat 인덱스 제거
-- ════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_cases_embedding;

-- ════════════════════════════════════════════════
-- 3. hybrid_search_cases 함수 재생성 (HNSW용)
-- ════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION hybrid_search_cases(
  query_text        TEXT,
  query_embedding   vector(1024),
  match_count       INT     DEFAULT 5,
  keyword_weight    FLOAT   DEFAULT 0.3,
  semantic_weight   FLOAT   DEFAULT 0.7,
  category_filter   TEXT    DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  case_number     TEXT,
  court           TEXT,
  case_date       TEXT,
  category        TEXT,
  summary         TEXT,
  key_issues      TEXT[],
  statutes        TEXT[],
  full_text       TEXT,
  semantic_score  FLOAT,
  keyword_score   FLOAT,
  combined_score  FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- HNSW 검색 품질 (가벼운 인덱스라 ef_search를 살짝 올려서 보완)
  SET LOCAL hnsw.ef_search = 80;

  RETURN QUERY
  WITH semantic AS (
    SELECT
      c.id,
      (1 - (c.embedding <=> query_embedding))::float AS score
    FROM cases c
    WHERE c.embedding IS NOT NULL
      AND (category_filter IS NULL OR c.category = category_filter)
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT
      c.id,
      ts_rank(c.fts, websearch_to_tsquery('simple', query_text))::float AS score
    FROM cases c
    WHERE c.fts @@ websearch_to_tsquery('simple', query_text)
      AND (category_filter IS NULL OR c.category = category_filter)
    LIMIT match_count * 3
  ),
  combined AS (
    SELECT
      coalesce(s.id, k.id)                                        AS id,
      coalesce(s.score, 0.0)::float                               AS sem_score,
      coalesce(k.score, 0.0)::float                               AS kw_score,
      (coalesce(s.score, 0.0) * semantic_weight
       + coalesce(k.score, 0.0) * keyword_weight)::float          AS comb_score
    FROM semantic s
    FULL OUTER JOIN keyword k ON s.id = k.id
  )
  SELECT
    c.id,
    c.case_number,
    c.court,
    c.case_date::text   AS case_date,
    c.category,
    c.summary,
    c.key_issues,
    c.statutes,
    c.full_text,
    comb.sem_score   AS semantic_score,
    comb.kw_score    AS keyword_score,
    comb.comb_score  AS combined_score
  FROM combined comb
  JOIN cases c ON c.id = comb.id
  ORDER BY comb.comb_score DESC
  LIMIT match_count;
END;
$$;
