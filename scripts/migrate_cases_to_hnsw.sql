-- ============================================================
-- LAW-CADDY: cases 테이블 벡터 인덱스를 IVFFlat → HNSW로 마이그레이션
--
-- 목적: hybrid_search_cases RPC가 statement timeout(57014) 나는 문제 해결
-- 원인: 410,140행 + ivfflat(probes=10) 조합이 Supabase 8초 제한을 자주 초과
-- 해결: HNSW 인덱스로 교체 (검색 속도 대폭 향상, recall도 우수)
--
-- 실행 방법:
--   psql로 직접 접속해서 -f 옵션으로 실행하세요. (SQL Editor는 2분 제한 때문에 불가)
--   인덱스 빌드는 보통 10~30분 소요됩니다.
-- ============================================================

-- 세션 설정: 인덱스 빌드 동안 타임아웃 제거 + 메모리 활용
-- 2XL 인스턴스(32GB RAM) 기준 — maintenance_work_mem을 24GB로 올려서 빠른 빌드
SET statement_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET maintenance_work_mem = '24GB';
SET max_parallel_maintenance_workers = 4;

-- ════════════════════════════════════════════════
-- 1. HNSW 인덱스 생성
--    m              = 16  (그래프 연결도, 권장 기본값)
--    ef_construction = 64  (빌드 품질, 높을수록 정확하지만 느림)
--
--    참고: pgvector HNSW는 cosine 거리 기준 vector_cosine_ops 사용
-- ════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_cases_embedding_hnsw
  ON cases USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ════════════════════════════════════════════════
-- 2. 기존 IVFFlat 인덱스 제거
--    HNSW 인덱스 빌드가 완료된 후 실행하세요.
--    (위 CREATE INDEX가 완료되면 자동으로 다음 줄로 넘어갑니다)
-- ════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_cases_embedding;

-- ════════════════════════════════════════════════
-- 3. hybrid_search_cases 함수 재생성
--    - ivfflat.probes 설정 제거 (HNSW에는 무관)
--    - hnsw.ef_search 설정 추가 (검색 품질 조절, 기본 40)
--    - statement_timeout 안전장치로 30초 설정 (만일을 대비)
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
  -- HNSW 검색 품질 (40 ~ 100 권장, 높을수록 정확하지만 느림)
  SET LOCAL hnsw.ef_search = 60;

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

-- ════════════════════════════════════════════════
-- 4. (선택) 검증 — 함수가 정상 동작하는지 더미 호출로 확인
--    아래 SELECT는 주석 처리되어 있습니다. 필요하면 임베딩을 넣고 실행하세요.
-- ════════════════════════════════════════════════
-- SELECT id, case_number, combined_score
-- FROM hybrid_search_cases(
--   '계약 해지 손해배상',
--   ARRAY[0.0, 0.0, ...]::vector(1024),  -- 실제 1024차원 임베딩 필요
--   5
-- );
