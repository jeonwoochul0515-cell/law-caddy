-- Step 3: 누락된 2개 함수 생성 + hybrid_search_all 수정
-- ⚠️ Step 1, 2가 완료된 후에 실행해야 합니다 (fts 컬럼 필요)

-- ────────────────────────────────────────────
-- 3-1. hybrid_search_legal_terms
-- ────────────────────────────────────────────
-- DB 실제 컬럼: term, definition, related_terms(text[]), source_uri
-- rag.ts 기대: term, definition, related_terms(string), source_statute(string)
-- → array_to_string + AS alias로 호환

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
-- 3-2. hybrid_search_legal_knowledge
-- ────────────────────────────────────────────
-- DB 실제 컬럼: category, title, content, entry_type, related_laws(text[])
-- rag.ts 기대: topic(string), title, content, related_statutes(string), category
-- → entry_type AS topic, array_to_string(related_laws) AS related_statutes

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
-- 3-3. hybrid_search_all (컬럼 참조 수정)
-- ────────────────────────────────────────────

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

  -- 판결문 (수정: doc_id, case_name 사용, case_date/full_text 제거)
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

  -- 기계독해 QA (수정: doc_title, doc_class, context 사용)
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

  -- 법령용어 사전 (수정: source_uri, array_to_string 사용)
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

  -- 법령지식 (수정: entry_type, related_laws, array_to_string 사용)
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


-- PostgREST 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
