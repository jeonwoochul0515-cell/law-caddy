-- Step 1: legal_terms 테이블에 FTS 컬럼 추가
-- ⏱️ 24만행 처리, 약 1~3분 소요
-- Supabase SQL Editor에서 실행

SET statement_timeout = '600s';

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
