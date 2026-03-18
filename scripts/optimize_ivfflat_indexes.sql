-- ============================================================
-- IVFFlat 벡터 인덱스 최적화 스크립트
-- ============================================================
--
-- 목적: 모든 테이블의 IVFFlat 인덱스를 최적 파라미터로 재생성
--
-- [최적화 근거]
-- - lists 파라미터: sqrt(행 수) 공식 적용 (pgvector 공식 권장)
--   * 1M 미만 테이블에 적합한 기준
--   * lists가 너무 작으면 recall 저하, 너무 크면 빌드 시간/메모리 낭비
-- - probes 파라미터: 인덱스 빌드 시 설정 불가, 쿼리 실행 시 세션 변수로 설정
--   * RPC 함수 내에서 SET ivfflat.probes = 10; 을 쿼리 앞에 선언하세요
--   * probes 기본값은 1 (매우 낮음). 10이면 정확도/속도 균형이 좋음
-- - 1024-dim 임베딩: voyage-3 모델 (모든 테이블 동일)
-- - 인덱스에 WHERE embedding IS NOT NULL 조건 적용 → NULL 행 제외로 크기 절감
--
-- [현재 행 수 기준 lists 값]
--   cases            410,140행 → lists=640
--   easy_law         533,041행 → lists=730
--   legal_mrc        359,845행 → lists=600
--   aihub_legal_qa   270,023행 → lists=520
--   statutes         256,769행 → lists=507
--   legal_terms      247,699행 → lists=498
--   legal_judgments  176,876행 → lists=420
--   legal_knowledge   52,076행 → lists=228
--   legal_commentary   6,341행 → lists=80
--   legal_forms        2,324행 → lists=48
--
-- [실행 방법]
-- Supabase Dashboard SQL Editor에서 블록 단위로 실행
-- CONCURRENTLY 옵션 사용 시 테이블 락 없이 빌드 가능 (운영 중 실행 안전)
-- 작은 테이블부터 실행하여 타임아웃을 방지하세요
-- ============================================================


-- ============================================================
-- SECTION 0: probes 권장 설정 (참고용 주석 — 쿼리 실행 시 적용)
-- ============================================================
-- RPC 함수 또는 쿼리 시작 시 아래를 실행하세요:
--   SET ivfflat.probes = 10;
-- 예시 (match_cases RPC 함수 내부):
--   SET LOCAL ivfflat.probes = 10;
--   SELECT ... FROM cases ORDER BY embedding <=> query_embedding LIMIT 10;
-- ============================================================


-- ============================================================
-- SECTION 1: IVFFlat 벡터 인덱스 재생성 (작은 테이블 → 큰 테이블 순)
-- ============================================================

-- ── 1. legal_forms (2,324행, lists=48) ──────────────────────
DROP INDEX IF EXISTS idx_legal_forms_embedding;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_forms_embedding
  ON legal_forms USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 48)
  WHERE embedding IS NOT NULL;

-- ── 2. legal_commentary (6,341행, lists=80) ─────────────────
DROP INDEX IF EXISTS idx_legal_commentary_embedding;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_commentary_embedding
  ON legal_commentary USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 80)
  WHERE embedding IS NOT NULL;

-- ── 3. legal_knowledge (52,076행, lists=228) ────────────────
DROP INDEX IF EXISTS idx_legal_knowledge_embedding;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_knowledge_embedding
  ON legal_knowledge USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 228)
  WHERE embedding IS NOT NULL;

-- ── 4. legal_judgments (176,876행, lists=420) ───────────────
DROP INDEX IF EXISTS idx_legal_judgments_embedding;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_judgments_embedding
  ON legal_judgments USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 420)
  WHERE embedding IS NOT NULL;

-- ── 5. legal_terms (247,699행, lists=498) ───────────────────
DROP INDEX IF EXISTS idx_legal_terms_embedding;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_terms_embedding
  ON legal_terms USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 498)
  WHERE embedding IS NOT NULL;

-- ── 6. statutes (256,769행, lists=507) ──────────────────────
DROP INDEX IF EXISTS idx_statutes_embedding;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_statutes_embedding
  ON statutes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 507)
  WHERE embedding IS NOT NULL;

-- ── 7. aihub_legal_qa (270,023행, lists=520) ────────────────
DROP INDEX IF EXISTS idx_aihub_legal_qa_embedding;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_aihub_legal_qa_embedding
  ON aihub_legal_qa USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 520)
  WHERE embedding IS NOT NULL;

-- ── 8. legal_mrc (359,845행, lists=600) ─────────────────────
DROP INDEX IF EXISTS idx_legal_mrc_embedding;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_mrc_embedding
  ON legal_mrc USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 600)
  WHERE embedding IS NOT NULL;

-- ── 9. cases (410,140행, lists=640) ─────────────────────────
DROP INDEX IF EXISTS idx_cases_embedding;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_embedding
  ON cases USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 640)
  WHERE embedding IS NOT NULL;

-- ── 10. easy_law (533,041행, lists=730) ─────────────────────
DROP INDEX IF EXISTS idx_easy_law_embedding;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_easy_law_embedding
  ON easy_law USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 730)
  WHERE embedding IS NOT NULL;


-- ============================================================
-- SECTION 2: GIN 전문검색(FTS) 인덱스 — 누락된 테이블 보완
-- ============================================================
-- fts 컬럼이 있는 모든 테이블에 GIN 인덱스를 IF NOT EXISTS로 생성
-- 이미 존재하면 무시되므로 안전하게 실행 가능

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_fts
  ON cases USING gin (fts);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_mrc_fts
  ON legal_mrc USING gin (fts);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_easy_law_fts
  ON easy_law USING gin (fts);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_aihub_legal_qa_fts
  ON aihub_legal_qa USING gin (fts);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_statutes_fts
  ON statutes USING gin (fts);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_terms_fts
  ON legal_terms USING gin (fts);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_judgments_fts
  ON legal_judgments USING gin (fts);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_knowledge_fts
  ON legal_knowledge USING gin (fts);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_commentary_fts
  ON legal_commentary USING gin (fts);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_forms_fts
  ON legal_forms USING gin (fts);


-- ============================================================
-- SECTION 3: 부분 인덱스 — 임베딩 미완료 행 빠른 탐색
-- ============================================================
-- embedding IS NULL 인 행만 인덱싱하는 부분 인덱스
-- 향후 임베딩 작업(embedding job)에서 미처리 행을 빠르게 조회할 때 사용
-- 예: SELECT id FROM cases WHERE embedding IS NULL LIMIT 1000;
-- 위 쿼리가 이 인덱스를 타면 시퀀셜 스캔 없이 즉시 반환됨

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_embedding_null
  ON cases (id)
  WHERE embedding IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_mrc_embedding_null
  ON legal_mrc (id)
  WHERE embedding IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_easy_law_embedding_null
  ON easy_law (id)
  WHERE embedding IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_aihub_legal_qa_embedding_null
  ON aihub_legal_qa (id)
  WHERE embedding IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_statutes_embedding_null
  ON statutes (id)
  WHERE embedding IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_terms_embedding_null
  ON legal_terms (id)
  WHERE embedding IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_judgments_embedding_null
  ON legal_judgments (id)
  WHERE embedding IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_knowledge_embedding_null
  ON legal_knowledge (id)
  WHERE embedding IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_commentary_embedding_null
  ON legal_commentary (id)
  WHERE embedding IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_legal_forms_embedding_null
  ON legal_forms (id)
  WHERE embedding IS NULL;


-- ============================================================
-- SECTION 4: 인덱스 생성 확인 쿼리
-- ============================================================
-- 아래 쿼리로 생성된 인덱스 목록과 크기를 확인하세요:
--
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_stat_user_indexes
-- WHERE indexname LIKE 'idx_%embedding%'
--    OR indexname LIKE 'idx_%fts%'
--    OR indexname LIKE 'idx_%null%'
-- ORDER BY tablename, indexname;
-- ============================================================
