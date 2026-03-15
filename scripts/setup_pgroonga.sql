-- ============================================================
-- LAW-CADDY: PGroonga 기반 하이브리드 검색 (보충용)
-- Supabase SQL Editor에서 실행하세요.
--
-- ⚠️ 주의사항:
--   - 기존 GIN/tsvector 인덱스 및 함수는 변경하지 않습니다.
--   - PGroonga 인덱스는 기존 GIN 인덱스와 공존합니다.
--   - 기존 hybrid_search_* 함수도 그대로 유지됩니다.
--   - v2 함수로 전환하려면 rag.ts의 TABLE_RPC_MAP을 변경하세요.
--
-- PGroonga 장점 (한국어 검색):
--   - CJK 바이그램 토크나이저 내장 → 형태소 분석기 없이 한국어 검색
--   - 'simple' tsvector 대비 부분 문자열 매칭 성능 우수
--   - 예: "손해배상" 검색 시 "손해배상청구" 도 매칭
--
-- 전환 방법:
--   rag.ts의 TABLE_RPC_MAP에서 아래와 같이 변경:
--     legal_judgments: "hybrid_search_legal_judgments_v2",
--     statutes: "hybrid_search_statutes_v2",
--     aihub_legal_qa: "hybrid_search_aihub_qa_v2",
--     legal_commentary: "hybrid_search_legal_commentary_v2",
-- ============================================================


-- ════════════════════════════════════════════════
-- 1. PGroonga 확장 활성화
-- ════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgroonga;


-- ════════════════════════════════════════════════
-- 2. PGroonga 인덱스 생성 (기존 GIN 인덱스와 공존)
--    CJK 바이그램 토크나이저가 자동 적용되어
--    한국어 부분 문자열 매칭이 가능합니다.
-- ════════════════════════════════════════════════

-- ────────────────────────────────────────────
-- 2-1. legal_judgments (판결문) — summary + content
-- ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_legal_judgments_pgroonga
  ON legal_judgments
  USING pgroonga ((ARRAY[coalesce(summary,''), coalesce(content,'')]));

-- ────────────────────────────────────────────
-- 2-2. statutes (법령 조문) — article_content
-- ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_statutes_pgroonga
  ON statutes
  USING pgroonga ((ARRAY[coalesce(article_content,'')]));

-- ────────────────────────────────────────────
-- 2-3. aihub_legal_qa (AI Hub 법률 QA) — question + answer
-- ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_aihub_legal_qa_pgroonga
  ON aihub_legal_qa
  USING pgroonga ((ARRAY[coalesce(question,''), coalesce(answer,'')]));

-- ────────────────────────────────────────────
-- 2-4. legal_commentary (법학 해설) — title + content
-- ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_legal_commentary_pgroonga
  ON legal_commentary
  USING pgroonga ((ARRAY[coalesce(title,''), coalesce(content,'')]));


-- ════════════════════════════════════════════════
-- 3. PGroonga 기반 하이브리드 검색 v2 함수
--    기존 함수와 동일한 시그니처, 키워드 매칭만 PGroonga로 교체
--    pgroonga_score(tableoid, ctid)로 관련도 점수 산출
-- ════════════════════════════════════════════════

-- ────────────────────────────────────────────
-- 3-1. hybrid_search_legal_judgments_v2 (판결문)
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_legal_judgments_v2(
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
      pgroonga_score(lj.tableoid, lj.ctid)::float AS score
    FROM legal_judgments lj
    WHERE ARRAY[coalesce(lj.summary,''), coalesce(lj.content,'')] &@~ query_text
    ORDER BY score DESC
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

COMMENT ON FUNCTION hybrid_search_legal_judgments_v2 IS
  'PGroonga 기반 하이브리드 검색 (판결문). 기존 hybrid_search_legal_judgments의 대체용 v2. TABLE_RPC_MAP에서 전환 가능.';


-- ────────────────────────────────────────────
-- 3-2. hybrid_search_statutes_v2 (법령 조문)
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_statutes_v2(
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
      pgroonga_score(st.tableoid, st.ctid)::float AS score
    FROM statutes st
    WHERE ARRAY[coalesce(st.article_content,'')] &@~ query_text
    ORDER BY score DESC
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

COMMENT ON FUNCTION hybrid_search_statutes_v2 IS
  'PGroonga 기반 하이브리드 검색 (법령 조문). 기존 hybrid_search_statutes의 대체용 v2. TABLE_RPC_MAP에서 전환 가능.';


-- ────────────────────────────────────────────
-- 3-3. hybrid_search_aihub_qa_v2 (AI Hub 법률 QA)
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_aihub_qa_v2(
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
      pgroonga_score(qa.tableoid, qa.ctid)::float AS score
    FROM aihub_legal_qa qa
    WHERE ARRAY[coalesce(qa.question,''), coalesce(qa.answer,'')] &@~ query_text
    ORDER BY score DESC
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

COMMENT ON FUNCTION hybrid_search_aihub_qa_v2 IS
  'PGroonga 기반 하이브리드 검색 (AI Hub 법률 QA). 기존 hybrid_search_aihub_qa의 대체용 v2. TABLE_RPC_MAP에서 전환 가능.';


-- ────────────────────────────────────────────
-- 3-4. hybrid_search_legal_commentary_v2 (법학 해설)
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hybrid_search_legal_commentary_v2(
  query_text text,
  query_embedding vector(1024),
  match_count int DEFAULT 5,
  keyword_weight float DEFAULT 0.3,
  semantic_weight float DEFAULT 0.7
)
RETURNS TABLE (
  id int,
  source text,
  category text,
  title text,
  content text,
  summary text,
  author text,
  doc_type text,
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
      lc.id,
      (1 - (lc.embedding <=> query_embedding))::float AS score
    FROM legal_commentary lc
    WHERE lc.embedding IS NOT NULL
    ORDER BY lc.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT
      lc.id,
      pgroonga_score(lc.tableoid, lc.ctid)::float AS score
    FROM legal_commentary lc
    WHERE ARRAY[coalesce(lc.title,''), coalesce(lc.content,'')] &@~ query_text
    ORDER BY score DESC
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
    lc.id,
    lc.source,
    lc.category,
    lc.title,
    lc.content,
    lc.summary,
    lc.author,
    lc.doc_type,
    c.sem_score AS semantic_score,
    c.kw_score AS keyword_score,
    c.comb_score AS combined_score
  FROM combined c
  JOIN legal_commentary lc ON lc.id = c.id
  ORDER BY c.comb_score DESC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION hybrid_search_legal_commentary_v2 IS
  'PGroonga 기반 하이브리드 검색 (법학 해설). 기존 hybrid_search_legal_commentary의 대체용 v2. TABLE_RPC_MAP에서 전환 가능.';


-- ════════════════════════════════════════════════
-- 4. 검증 쿼리 (선택 사항)
--    PGroonga 인덱스가 정상 작동하는지 확인합니다.
-- ════════════════════════════════════════════════

-- 아래 쿼리로 PGroonga 키워드 검색이 동작하는지 확인할 수 있습니다:
--
-- -- 판결문에서 "손해배상" 검색 (부분 매칭 포함)
-- SELECT id, substring(summary, 1, 100) AS summary_preview
-- FROM legal_judgments
-- WHERE ARRAY[coalesce(summary,''), coalesce(content,'')] &@~ '손해배상'
-- LIMIT 5;
--
-- -- 법령 조문에서 "근로기준법" 검색
-- SELECT id, statute_name, article_number, substring(article_content, 1, 80)
-- FROM statutes
-- WHERE ARRAY[coalesce(article_content,'')] &@~ '근로기준법'
-- LIMIT 5;
--
-- -- PGroonga 점수 확인
-- SELECT id, pgroonga_score(tableoid, ctid) AS score,
--        substring(question, 1, 80) AS q
-- FROM aihub_legal_qa
-- WHERE ARRAY[coalesce(question,''), coalesce(answer,'')] &@~ '이혼 위자료'
-- ORDER BY score DESC
-- LIMIT 5;
