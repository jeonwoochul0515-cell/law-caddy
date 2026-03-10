-- ══════════════════════════════════════════════════════════════
-- fix_hybrid_search.sql
--
-- 목적: legal_terms, legal_knowledge 테이블의 FTS 컬럼 추가 및
--       누락된 hybrid_search 함수 생성, hybrid_search_all 수정
--
-- 실행 전 주의사항:
--   - Supabase SQL Editor에서 실행
--   - 기존 데이터에 영향 없음 (ALTER TABLE ADD COLUMN, CREATE OR REPLACE)
--   - 실행 후 PostgREST 스키마 자동 새로고침 대기 (최대 ~1분)
-- ══════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────
-- 1. legal_terms 테이블에 FTS 컬럼 추가
-- ────────────────────────────────────────────
-- 실제 컬럼: term(text), definition(text), source_uri(text), related_terms(text[])
-- related_terms는 text[] 이므로 array_to_string으로 변환

ALTER TABLE legal_terms
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(term, '') || ' ' ||
      coalesce(definition, '') || ' ' ||
      coalesce(source_uri, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS legal_terms_fts_idx
  ON legal_terms USING gin(fts);


-- ────────────────────────────────────────────
-- 2. legal_knowledge 테이블에 FTS 컬럼 추가
-- ────────────────────────────────────────────
-- 실제 컬럼: category(text), title(text), content(text), source(text),
--           source_uri(text), statute_name(text), article_name(text),
--           related_laws(text[]), entry_type(text)
-- topic 컬럼은 존재하지 않음, related_statutes도 존재하지 않음

ALTER TABLE legal_knowledge
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(category, '') || ' ' ||
      coalesce(title, '') || ' ' ||
      coalesce(content, '') || ' ' ||
      coalesce(statute_name, '') || ' ' ||
      coalesce(entry_type, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS legal_knowledge_fts_idx
  ON legal_knowledge USING gin(fts);


-- ────────────────────────────────────────────
-- 3. hybrid_search_legal_terms 함수 생성
-- ────────────────────────────────────────────
-- 변경점 (원본 setup_hybrid_search.sql 대비):
--   - source_statute → source_uri (AS source_statute 별칭으로 rag.ts 호환)
--   - related_terms text[] → array_to_string()으로 text 변환
--   - lt.fts 참조 → 위에서 추가한 fts 컬럼 사용

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
$$;


-- ────────────────────────────────────────────
-- 4. hybrid_search_legal_knowledge 함수 생성
-- ────────────────────────────────────────────
-- 변경점 (원본 setup_hybrid_search.sql 대비):
--   - topic → entry_type (AS topic 별칭으로 rag.ts 호환)
--   - related_statutes → array_to_string(related_laws, ', ') (AS related_statutes 별칭)
--   - lk.fts 참조 → 위에서 추가한 fts 컬럼 사용

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
$$;


-- ────────────────────────────────────────────
-- 5. hybrid_search_all 함수 재생성 (컬럼 참조 수정)
-- ────────────────────────────────────────────
-- 변경점:
--   - legal_judgments: case_number→doc_id, case_date 제거, full_text→content
--   - legal_mrc: document_title→doc_title, category→doc_class, context_passage→context
--   - legal_terms: source_statute→source_uri, related_terms(text[]처리)
--   - legal_knowledge: topic→entry_type, related_statutes→related_laws(text[]처리)

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

  -- 판결문 (수정: case_number→doc_id, case_date 제거, full_text→content)
  SELECT
    lj.id::int,
    'legal_judgments'::text,
    (lj.doc_id || ' (' || coalesce(lj.court, '') || ')')::text,
    coalesce(lj.summary, lj.content),
    jsonb_build_object(
      'doc_id', lj.doc_id,
      'court', lj.court,
      'case_name', lj.case_name,
      'category', lj.category
    ),
    r.semantic_score,
    r.keyword_score,
    r.combined_score
  FROM hybrid_search_legal_judgments(query_text, query_embedding, match_count, keyword_weight, semantic_weight) r
  JOIN legal_judgments lj ON lj.id = r.id

  UNION ALL

  -- 기계독해 QA (수정: document_title→doc_title, category→doc_class, context_passage→context)
  SELECT
    mrc.id,
    'legal_mrc'::text,
    mrc.question,
    mrc.answer,
    jsonb_build_object(
      'doc_title', mrc.doc_title,
      'doc_class', mrc.doc_class,
      'context', mrc.context
    ),
    r.semantic_score,
    r.keyword_score,
    r.combined_score
  FROM hybrid_search_legal_mrc(query_text, query_embedding, match_count, keyword_weight, semantic_weight) r
  JOIN legal_mrc mrc ON mrc.id = r.id

  UNION ALL

  -- 법령용어 사전 (수정: source_statute→source_uri, related_terms text[]처리)
  SELECT
    lt.id,
    'legal_terms'::text,
    lt.term,
    lt.definition,
    jsonb_build_object(
      'related_terms', array_to_string(lt.related_terms, ', '),
      'source_uri', lt.source_uri
    ),
    r.semantic_score,
    r.keyword_score,
    r.combined_score
  FROM hybrid_search_legal_terms(query_text, query_embedding, match_count, keyword_weight, semantic_weight) r
  JOIN legal_terms lt ON lt.id = r.id

  UNION ALL

  -- 법령지식 (수정: topic→entry_type, related_statutes→related_laws)
  SELECT
    lk.id,
    'legal_knowledge'::text,
    coalesce(lk.title, lk.entry_type),
    lk.content,
    jsonb_build_object(
      'entry_type', lk.entry_type,
      'category', lk.category,
      'related_laws', array_to_string(lk.related_laws, ', ')
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


-- ────────────────────────────────────────────
-- 6. PostgREST 스키마 캐시 새로고침 알림
-- ────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
