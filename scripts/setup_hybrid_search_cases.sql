-- ============================================================
-- LAW-CADDY: cases 테이블 하이브리드 검색 RPC 함수
-- Supabase SQL Editor에서 실행하세요.
--
-- 대상 테이블: cases (410,140행)
--   컬럼: id (UUID), case_number, court, case_date, category,
--         summary, key_issues, statutes, full_text, raw_json,
--         source, created_at, fts (tsvector, 기생성), embedding (vector 1024)
--
-- 사전 요구사항:
--   - pgvector 확장 활성화
--   - cases.embedding vector(1024) 컬럼 존재
--   - cases.fts tsvector 컬럼 존재 (GENERATED ALWAYS AS ... STORED)
-- ============================================================

-- ════════════════════════════════════════════════
-- 1. GIN 인덱스 (FTS) — fts 컬럼이 이미 생성된 경우 중복 없이 추가
-- ════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS cases_fts_idx
  ON cases USING gin(fts);

-- ════════════════════════════════════════════════
-- 2. IVFFlat 벡터 인덱스
--    lists = sqrt(410,140) ≈ 640
--    데이터가 충분히 임베딩된 후 실행 권장 (빌드 시간 수 분 소요)
-- ════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_cases_embedding
  ON cases USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 640);

-- ════════════════════════════════════════════════
-- 3. hybrid_search_cases RPC 함수
--    시맨틱 (cosine similarity) + 키워드 (ts_rank) 하이브리드
--    combined_score = semantic_score * semantic_weight
--                   + keyword_score  * keyword_weight
--
--    선택적 파라미터:
--      category_filter TEXT — NULL이면 전체 카테고리 검색,
--                             값을 주면 해당 category만 필터링
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
  key_issues      TEXT,
  statutes        TEXT,
  full_text       TEXT,
  semantic_score  FLOAT,
  keyword_score   FLOAT,
  combined_score  FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- IVFFlat probes 설정: 기본값(1)보다 높이면 recall 향상 (속도와 트레이드오프)
  SET LOCAL ivfflat.probes = 10;

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
    c.case_date,
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
