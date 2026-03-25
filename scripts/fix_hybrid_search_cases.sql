-- hybrid_search_cases 리턴 타입 수정
-- 원인: key_issues, statutes 컬럼이 text[]인데 RETURNS TABLE에서 text로 선언됨
-- Supabase SQL Editor에서 실행하세요.

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
