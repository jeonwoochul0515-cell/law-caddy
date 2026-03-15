-- ============================================================
-- LAW-CADDY: IVFFlat 인덱스 최적화 (lists = sqrt(row_count))
-- Supabase SQL Editor에서 실행하세요.
--
-- 기존 인덱스는 lists=50~200 고정값으로 생성되어 있었음.
-- 최적 lists 값 = round(sqrt(row_count)) 로 재생성하여
-- 검색 정확도와 속도를 모두 개선.
--
-- 추가 개선:
--   - WHERE embedding IS NOT NULL (부분 인덱스) → 인덱스 크기 절감
--   - SET ivfflat.probes = round(sqrt(lists)) → 검색 시 최적 프로브 수
--
-- 벡터 차원: 1024 (vector_cosine_ops)
-- 실행 일시: 2026-03-15
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- STEP 1: 기존 IVFFlat 인덱스 삭제
-- ════════════════════════════════════════════════════════════

-- cases (410,097행) — 기존 lists=200
DROP INDEX IF EXISTS idx_cases_embedding;

-- aihub_legal_qa (270,118행) — 기존 lists=200
DROP INDEX IF EXISTS idx_aihub_legal_qa_embedding;

-- legal_mrc (358,806행) — 기존 lists=200
DROP INDEX IF EXISTS idx_legal_mrc_embedding;

-- legal_judgments (176,876행) — 기존 lists=150
DROP INDEX IF EXISTS idx_legal_judgments_embedding;

-- statutes (256,364행) — 기존 lists=50
DROP INDEX IF EXISTS idx_statutes_embedding;

-- easy_law (533,326행) — 기존 lists=200
DROP INDEX IF EXISTS idx_easy_law_embedding;

-- legal_terms (247,478행) — 기존 lists=200
DROP INDEX IF EXISTS idx_legal_terms_embedding;

-- legal_knowledge (52,076행) — 기존 lists=50
DROP INDEX IF EXISTS idx_legal_knowledge_embedding;

-- legal_forms (2,324행) — 기존 lists=50
DROP INDEX IF EXISTS idx_legal_forms_embedding;

-- legal_commentary (6,341행) — 인덱스 없었음 (신규 생성)


-- ════════════════════════════════════════════════════════════
-- STEP 2: 최적화된 IVFFlat 인덱스 재생성
--         lists = round(sqrt(row_count))
--         WHERE embedding IS NOT NULL (부분 인덱스)
--
-- 주의: 대용량 테이블은 인덱스 생성에 수 분 소요될 수 있음
-- ════════════════════════════════════════════════════════════

-- easy_law: 533,326행 → lists=730 (기존 200 → 3.65x 세분화)
CREATE INDEX idx_easy_law_embedding
  ON easy_law USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 730)
  WHERE embedding IS NOT NULL;

-- cases: 410,097행 → lists=640 (기존 200 → 3.2x 세분화)
CREATE INDEX idx_cases_embedding
  ON cases USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 640)
  WHERE embedding IS NOT NULL;

-- legal_mrc: 358,806행 → lists=599 (기존 200 → 3x 세분화)
CREATE INDEX idx_legal_mrc_embedding
  ON legal_mrc USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 599)
  WHERE embedding IS NOT NULL;

-- aihub_legal_qa: 270,118행 → lists=520 (기존 200 → 2.6x 세분화)
CREATE INDEX idx_aihub_legal_qa_embedding
  ON aihub_legal_qa USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 520)
  WHERE embedding IS NOT NULL;

-- statutes: 256,364행 → lists=506 (기존 50 → 10.1x 세분화)
CREATE INDEX idx_statutes_embedding
  ON statutes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 506)
  WHERE embedding IS NOT NULL;

-- legal_terms: 247,478행 → lists=497 (기존 200 → 2.5x 세분화)
CREATE INDEX idx_legal_terms_embedding
  ON legal_terms USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 497)
  WHERE embedding IS NOT NULL;

-- legal_judgments: 176,876행 → lists=421 (기존 150 → 2.8x 세분화)
CREATE INDEX idx_legal_judgments_embedding
  ON legal_judgments USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 421)
  WHERE embedding IS NOT NULL;

-- legal_knowledge: 52,076행 → lists=228 (기존 50 → 4.6x 세분화)
CREATE INDEX idx_legal_knowledge_embedding
  ON legal_knowledge USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 228)
  WHERE embedding IS NOT NULL;

-- legal_commentary: 6,341행 → lists=80 (신규 인덱스)
CREATE INDEX idx_legal_commentary_embedding
  ON legal_commentary USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 80)
  WHERE embedding IS NOT NULL;

-- legal_forms: 2,324행 → lists=48 (기존 50과 유사, 부분 인덱스 추가)
CREATE INDEX idx_legal_forms_embedding
  ON legal_forms USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 48)
  WHERE embedding IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- STEP 3: 세션 기본 probes 값 설정
--         probes = round(sqrt(lists))
--
-- 이 값은 세션 수준 설정이므로, 실제 운영에서는
-- 각 RPC 함수 내부 또는 연결 풀 초기화에서 설정해야 합니다.
--
-- 테이블별 최적 probes 참고표:
--   easy_law:          lists=730  → probes=27
--   cases:             lists=640  → probes=25
--   legal_mrc:         lists=599  → probes=24
--   aihub_legal_qa:    lists=520  → probes=23
--   statutes:          lists=506  → probes=22
--   legal_terms:       lists=497  → probes=22
--   legal_judgments:    lists=421  → probes=21
--   legal_knowledge:   lists=228  → probes=15
--   legal_commentary:  lists=80   → probes=9
--   legal_forms:       lists=48   → probes=7
--
-- 모든 테이블을 하나의 세션에서 검색할 때는
-- 가장 큰 probes 값(27)을 사용하면 안전합니다.
-- 다만 probes가 높을수록 느려지므로, 단일 테이블 검색 시
-- 해당 테이블의 최적값을 사용하는 것이 좋습니다.
-- ════════════════════════════════════════════════════════════

-- 통합 검색용 세션 기본값 (가장 큰 lists 기준)
SET ivfflat.probes = 27;


-- ════════════════════════════════════════════════════════════
-- STEP 4: 개별 테이블 검색 시 최적 probes 설정 헬퍼 함수
--         RPC 함수 내부에서 호출하여 테이블별 최적값 사용
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_ivfflat_probes(table_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  CASE table_name
    WHEN 'easy_law'          THEN PERFORM set_config('ivfflat.probes', '27', true);
    WHEN 'cases'             THEN PERFORM set_config('ivfflat.probes', '25', true);
    WHEN 'legal_mrc'         THEN PERFORM set_config('ivfflat.probes', '24', true);
    WHEN 'aihub_legal_qa'    THEN PERFORM set_config('ivfflat.probes', '23', true);
    WHEN 'statutes'          THEN PERFORM set_config('ivfflat.probes', '22', true);
    WHEN 'legal_terms'       THEN PERFORM set_config('ivfflat.probes', '22', true);
    WHEN 'legal_judgments'   THEN PERFORM set_config('ivfflat.probes', '21', true);
    WHEN 'legal_knowledge'   THEN PERFORM set_config('ivfflat.probes', '15', true);
    WHEN 'legal_commentary'  THEN PERFORM set_config('ivfflat.probes', '9', true);
    WHEN 'legal_forms'       THEN PERFORM set_config('ivfflat.probes', '7', true);
    ELSE PERFORM set_config('ivfflat.probes', '27', true);  -- 기본값: 최대
  END CASE;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- 검증: 인덱스 생성 확인 쿼리
-- 아래 쿼리로 모든 IVFFlat 인덱스가 올바르게 생성되었는지 확인
-- ════════════════════════════════════════════════════════════

-- SELECT
--   indexname,
--   tablename,
--   indexdef
-- FROM pg_indexes
-- WHERE indexdef LIKE '%ivfflat%'
-- ORDER BY tablename;
