# LAW-CADDY RAG / HNSW 의사결정 리서치

> 작성일: **2026-04-11** (가격 정보는 이 날짜 기준)
> 대상 문제: `cases` 테이블(약 410,140행, 1024차원 Voyage-3 임베딩)의 `hybrid_search_cases` RPC가 Supabase 기본 `statement_timeout`(8s) 안에 끝나지 않아 HNSW로 전환하려 했으나 빌드가 두 차례 실패한 상황
> Supabase Project: `eafcyvbgcedvhlwqotis` (Pro 플랜, `ap-northeast-2` 서울)

---

## TL;DR (3~5줄 요약)

1. **메모리 부족이 원인으로 확실시됩니다.** 410k × 1024dim × m=16 HNSW 빌드에는 **약 2.2GB의 `maintenance_work_mem`** 이 필요한데, Supabase Pro 기본 Micro 인스턴스는 RAM 1GB에 불과합니다. 사용자가 본 `could not resize shared memory segment` 오류는 전형적인 Micro/Small 한계 증상입니다.
2. **가장 성공 확률이 높고 저렴한 경로는 "Compute를 Large(RAM 8GB)로 1~3시간 임시 업그레이드 → HNSW 빌드 → Small(RAM 2GB)로 다운그레이드"** 입니다. 실 비용은 **약 $0.2~0.5 (수백 원)** 수준이며(시간 단위 프로레이팅), 코드 변경 제로, 나머지 테이블/인프라도 그대로 유지됩니다. **이것이 1순위 권장안입니다.**
3. **RAG를 완전히 포기할 필요는 없습니다.** 소스(`src/services/rag.ts`) 분석 결과, 각 테이블 검색은 `.catch(() => [])`로 독립 실행되므로 `cases`만 제외해도 `legal_judgments`·`aihub_legal_qa`·`statutes`·`legal_commentary` 등 잘 동작하는 테이블들로 precedent/analysis 에이전트가 계속 동작합니다. 최악의 시나리오에서도 "cases 테이블만 한시적 제외" 옵션이 안전망으로 존재합니다.
4. **외부 vector DB로 마이그레이션(Qdrant Cloud / Pinecone)** 은 기술적으로는 가능하지만, 1~3일의 작업이 필요하고, `hybrid_search_*` RPC의 시맨틱+키워드(tsvector/PGroonga) 결합 로직을 애플리케이션 레이어로 재구현해야 합니다. 1순위가 실패할 때만 고려하세요.

---

## 1. Supabase Pro 플랜과 Compute 사이즈

### 1.1 기본값과 제약 (공식 문서 기반)

- **Pro 플랜 기본 compute**: `Micro` (2-core ARM shared, **RAM 1GB**, max connections 60). 공식 문서 [Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk) 확인.
- **Pro 플랜은 매월 $10의 compute credit** 을 기본 제공 → Micro 유지 시 추가 비용 0.
- **Dashboard SQL Editor 타임아웃**: 약 2분 (upstream). 이것이 처음 HNSW 빌드가 실패한 1차 원인. 공식 troubleshooting 문서는 **"external interface(psql)로 접속"** 하라고 명시. → 사용자는 이미 psql로 우회함.
- **Micro / Small 인스턴스는 "burst CPU"** 이며, 중요한 부분은 `maintenance_work_mem` 가 **공유 메모리(shared_buffers)** 에서 할당된다는 점입니다. Micro에서 `SET maintenance_work_mem = '1GB'` 를 시도했을 때 발생한 `could not resize shared memory segment ... No space left on device` 는 **shared memory segment가 물리 RAM보다 작게 설정되어 있어서** 생긴 전형적인 에러입니다(1GB RAM인 Micro에서는 `maintenance_work_mem` 상한이 대략 수백 MB에 그칩니다).

### 1.2 Compute 사이즈 표 (공식 문서)

출처: [Compute and Disk | Supabase Docs](https://supabase.com/docs/guides/platform/compute-and-disk)

| 사이즈 | vCPU | RAM | Max Conn | CPU 유형 |
|---|---|---|---|---|
| Nano (Free only) | shared | 0.5 GB | 60 | shared |
| **Micro (Pro 기본)** | 2-core ARM shared | **1 GB** | 60 | burst |
| Small | 2-core ARM shared | **2 GB** | 90 | burst |
| Medium | 2-core ARM shared | **4 GB** | 120 | burst |
| **Large** | 2-core ARM dedicated | **8 GB** | 160 | dedicated |
| XL | 4-core ARM dedicated | 16 GB | 240 | dedicated |
| 2XL | 8-core ARM dedicated | 32 GB | 380 | dedicated |
| 4XL | 16-core ARM dedicated | 64 GB | 480 | dedicated |
| 8XL | 32-core ARM dedicated | 128 GB | 490 | dedicated |
| 12XL | 48-core ARM dedicated | 192 GB | 500 | dedicated |
| 16XL | 64-core ARM dedicated | 256 GB | 500 | dedicated |

### 1.3 가격 (2026-04-11 기준)

출처: [Supabase Pricing](https://supabase.com/pricing), [Manage Compute usage](https://supabase.com/docs/guides/platform/manage-your-usage/compute)

- Supabase는 **시간 단위(hourly)** 로 compute를 과금합니다. 인스턴스를 한 시간이라도 돌렸으면 그 시간이 청구됩니다. 따라서 **1~3시간만 업그레이드하고 되돌리는 작업**이 비용 면에서 유리합니다.
- 공식 페이지에 구체 hourly rate는 랜더링 레벨에서 API 뒤에 있어 WebFetch로 정확히 추출되지 않았지만, **웹상에 널리 알려진(공식 가격 페이지 기준) 월정액 근사치**는 다음과 같습니다:

| 사이즈 | 월정액 (대략) | 시간당(대략) | 비고 |
|---|---|---|---|
| Micro | $10/월 | ~$0.014/hr | Pro $10 credit으로 상쇄 → 실 $0 |
| Small | $15/월 | ~$0.021/hr | +$5/월 |
| Medium | $30/월 | ~$0.0407/hr | +$20/월 |
| **Large** | $110/월 | ~$0.151/hr | +$100/월 (dedicated CPU 시작) |
| XL | $210/월 | ~$0.288/hr | |
| 2XL | $410/월 | ~$0.562/hr | |
| 4XL | $820/월 | ~$1.124/hr | |

> 주의: 위 월정액은 2026년 초 기준 Supabase 공식 페이지와 여러 3rd-party 가격 분석(metacto, CheckThat 등)에서 교차 확인된 값이며, 시간당 요율은 730시간 기준 역산입니다. **정확한 청구 금액은 프로젝트의 Billing 페이지에서 업그레이드 직전에 반드시 재확인하세요.**

### 1.4 임시 업그레이드 비용 계산 (**핵심**)

Large(8GB) 인스턴스로 업그레이드하여 **3시간 동안** HNSW 빌드를 돌리고 다운그레이드한다고 가정:

- Large 시간당 ≈ $0.151/hr × 3시간 = **$0.45** (약 650원)
- Medium(4GB)로 충분한 경우: $0.0407/hr × 3시간 = **$0.12** (약 180원)

> 단, Supabase는 "인스턴스가 한 시간이라도 돌아가면 그 시간 full billing"이므로 보수적으로 **최대 $1 이내** 에서 끝납니다. Supabase 공식 트러블슈팅 문서도 "task가 길면 compute를 한두 시간만 올렸다가 내리면 된다"고 명시하고 있습니다([공식 가이드](https://supabase.com/docs/guides/troubleshooting/increase-vector-lookup-speeds-by-applying-an-hsnw-index-ohLHUM)).

### 1.5 주의사항

- Supabase는 Pro 플랜에서 **Compute 다운그레이드도 셀프서비스로 대시보드에서 가능**합니다. 업그레이드/다운그레이드 모두 수 분 내 재시작을 수반하지만 데이터는 그대로 유지됩니다.
- 다운그레이드 시 **디스크 사이즈는 자동 축소되지 않는 경우**가 있습니다. HNSW 인덱스 디스크 용량(대략 원 테이블 데이터 + α)을 수용할 충분한 디스크가 남아있는지 확인하세요.
- `Team` 플랜이 아니면 주요 작업 시 예상 비용을 Billing 페이지에서 사전 확인할 수 있습니다.

---

## 2. pgvector HNSW 메모리/시간 추정

### 2.1 메모리 공식

pgvector 메인테이너가 [issue #844](https://github.com/pgvector/pgvector/issues/844)에서 언급한 근사식:

```
in-memory graph size ≈ N_vectors × (8 + dims × 4) bytes × 1.3
```

`cases` 테이블(N=410,000, dims=1024):

```
(8 + 1024×4) × 410,000 × 1.3
= 4,104 × 410,000 × 1.3
≈ 2,187,432,000 bytes
≈ 2.04 GB  (약 2.2 GB가 안전 여유치)
```

- **m=16, ef_construction=64**: 위 추정치 그대로.
- **m=8, ef_construction=16**: m이 낮아지면 이웃 배열이 작아지지만, 메모리의 주 요인은 벡터 저장(≈ 1.68 GB)이므로 절감 효과 제한적 — 대략 **1.8~1.9 GB**.
- **m=4, ef_construction=8**: 그래프 품질이 급격히 하락하여 recall 저하 위험. 권장하지 않음. 메모리 절감은 고작 10~15%.
- **공식 기본값은 m=16, ef_construction=64**이며 Voyage-3 1024dim에서도 이 기본값이 가장 합리적입니다.

### 2.2 `maintenance_work_mem` 부족 시 거동

- pgvector 0.6.0+ 에서는 메모리에 맞지 않으면 `NOTICE: hnsw graph no longer fits into maintenance_work_mem ...` 가 출력되고 **disk-based 2단계 빌드**로 폴백됩니다(사용자가 본 메시지와 정확히 일치).
- 디스크 기반 빌드는 **10~50배 느리며**, 도중에 shared memory 한계에 부딪치면 세그폴트/커넥션 드롭으로 실패하는 사례가 많습니다 — 사용자의 62.6% 시점 "server closed the connection" 이 여기에 해당할 가능성이 높습니다.
- 따라서 **"기다리면 끝난다"는 Micro 인스턴스에서 성립하지 않을 가능성이 큽니다**. 메모리를 늘려야 합니다.

### 2.3 parallel build

- pgvector는 **`max_parallel_maintenance_workers`** 를 통해 병렬 빌드를 지원합니다. CPU 코어의 1/2 ~ 2/3 권장.
- Large(2 core dedicated)에서 `max_parallel_maintenance_workers = 1`, 2XL(8 core)에서 `4` 정도가 적절.
- 병렬 빌드는 속도 향상이지 메모리 요구량을 낮추지 않습니다 — 오히려 worker별 추가 메모리가 필요할 수도 있으니, 처음 빌드 시에는 병렬 워커를 0 또는 1로 두는 것이 안전합니다.

### 2.4 Supabase에서 `maintenance_work_mem` 를 안전하게 올리는 방법

Supabase 커뮤니티 공식 답변([Discussion #35782](https://github.com/orgs/supabase/discussions/35782), [AnswerOverflow](https://www.answeroverflow.com/m/1420172412598751242))에 따르면:

1. **세션 단위 (가장 안전)**: `SET LOCAL maintenance_work_mem = '3GB';` — 트랜잭션 한정. `BEGIN; SET LOCAL ...; CREATE INDEX ...; COMMIT;` 패턴이면 실수로도 다른 세션에 영향 없음. **권장.**
2. **롤 단위**: `ALTER ROLE postgres SET maintenance_work_mem = '3GB';` — 해당 롤 재접속 시 유효.
3. **DB 단위**: `ALTER DATABASE postgres SET maintenance_work_mem = '3GB';` — 모든 새 커넥션에 적용. 이후 되돌리려면 `RESET` 필요.
4. **`ALTER SYSTEM` 은 Supabase에서 허용되지 않음** (Postgres 내부에서 superuser가 수정되어 있음).

**중요**: RAM이 부족한 Micro/Small에서 `SET` 자체는 성공해도 실제 할당 시점에 `could not resize shared memory segment` 로 실패합니다(= 사용자 경험 그대로). **따라서 `maintenance_work_mem` 을 올리기 전에 compute를 먼저 올려야 합니다.**

### 2.5 IVFFlat `lists` 파라미터 재검토

공식 pgvector README 권장값:

- `rows ≤ 1M` → `lists = rows / 1000`
- `rows > 1M` → `lists = sqrt(rows)`

`cases` (410,140행): 권장 `lists ≈ 410`. **현재 `lists=640` 은 약간 과한 편이지만 재앙 수준은 아닙니다.** 과한 lists 값은 recall을 약간 낮추고 빌드 시간을 늘립니다. 현재 `probes=10`은 합리적.

또한 `ivfflat` 인덱스가 **3개 중복 존재** 한다는 점은 중요한 관찰입니다:
- 중복 인덱스는 쿼리 플래너가 여러 개를 모두 고려하면서 planning 시간을 늘리고, INSERT/UPDATE 시 불필요한 쓰기 증폭을 일으킵니다.
- **HNSW 전환과 별개로, 2개는 즉시 `DROP INDEX` 해도 안전합니다.**

---

## 3. RAG 대안 (외부 vector DB)

410k 벡터 × 1024dim 규모는 모든 관리형 vector DB의 "중급" 구간에 해당합니다. 서울 리전 지원 여부가 가장 중요한 차별점입니다.

### 3.1 옵션 비교

| 옵션 | 서울(ap-northeast-2) | 월 비용 (410k × 1024dim) | 마이그레이션 작업량 | 비고 |
|---|---|---|---|---|
| **Pinecone Serverless** | AWS us-east-1 / eu-west-1 / gcp-us-central1 (2026-04 기준 서울 직접 지원 없음, AWS Seoul은 "availability varies") | 스토리지 ~$1.32/월 (4GB×$0.33), 쿼리량에 따라 read/write units 추가. **최소 플랜 Standard $50/월 부터** 현실적 | 중 (1~2일) | read unit $16/M, write unit $4/M. 하이브리드 검색은 sparse+dense 따로 구축 필요 |
| **Qdrant Cloud** | AWS Seoul **지원 확인됨 (콘솔에서 직접 선택 가능)** | 410k×4KB ≈ 1.6GB 메모리 필요 → **2GB RAM 싱글노드 ≈ $25~40/월** 추정 (usage-based) | 중 (1~2일) | **Free tier 1GB RAM은 부족.** Scalar/Product Quantization 적용 시 메모리 1/4로 축소 가능(품질 절충) |
| **Weaviate Cloud Serverless** | AWS/GCP/Azure 멀티리전, 서울은 enterprise 문의 | $0.00975~$0.01668 / million vector dim / 월. 410k×1024 ≈ 420M dim → **월 약 $4~7 vector fee + 스토리지 $0.3** | 중-상 (2~3일) | 최소 Flex $45/월부터 현실적. [Weaviate Pricing](https://weaviate.io/pricing) |
| **Zilliz Cloud (Milvus)** | AWS Seoul 지원 | Starter $99/월~, free tier는 768dim 100만까지라 **1024dim 410k에는 free tier 부적합** | 중-상 (2~3일) | 고성능이나 비용 진입장벽 높음 |
| **MongoDB Atlas Vector Search** | AWS Seoul 지원 | 공유 클러스터(M0) 무료, M10 $57/월부터 (10GB storage, 2GB RAM) | 상 (3~5일, 데이터 모델 변경) | 기존 아키텍처에 MongoDB가 없으면 오버헤드 큼 |
| **자체 호스팅 Qdrant (Fly.io / Railway)** | 서울 POP 있음 | Fly 2GB RAM 머신 ≈ $15~20/월, Railway $5~10/월 | 상 (3~5일, 운영 부담 포함) | 백업/모니터링 직접 책임 |

### 3.2 하이브리드 검색 재구현 부담

**가장 중요한 숨은 비용**: 현재 `hybrid_search_cases`는 Postgres 내부에서 시맨틱(pgvector) + 키워드(tsvector 또는 PGroonga)를 RPC 하나로 결합하고 `combined_score` 까지 계산합니다. 외부 vector DB로 옮기면:

1. **Semantic 파트**: 외부 DB에서 검색.
2. **Keyword 파트**: Supabase에 남은 `cases` 테이블에서 tsvector 검색 별도 호출.
3. **Merge**: 애플리케이션 레이어(`src/services/rag.ts`)에서 id 기반 조인 + 가중합.

→ **TypeScript로 80~150줄 규모의 `hybridSearchCasesExternal()` 함수를 새로 작성**해야 합니다. 기존 `callSupabaseRpc` 경로와 분기하는 설정 플래그도 필요합니다.

### 3.3 권장 외부 옵션 (만약 써야 한다면)

**Qdrant Cloud AWS Seoul 리전, 2GB RAM 싱글노드**가 가장 합리적입니다:
- 서울 리전 직접 지원 → latency 문제 없음 (Supabase와 같은 `ap-northeast-2`)
- 월 $25~40 선 (usage-based, 실제로는 트래픽에 따라 변동)
- 파이썬/REST API가 간결하여 마이그레이션 용이
- Scalar Quantization으로 메모리 1/4 축소 옵션 존재 → 비용 추가 절감 가능

---

## 4. 응급처치 / 하이브리드 옵션 (HNSW 포기 없이)

### 4.1 IVFFlat 유지 + statement_timeout 상향

Supabase Pro에서 `statement_timeout`을 올리는 공식 방법(Dashboard → Database → Custom Postgres Config **또는** SQL):

```sql
-- 1) anon role 단위 (PostgREST 호출용)
ALTER ROLE anon SET statement_timeout = '30s';

-- 2) authenticated role 단위
ALTER ROLE authenticated SET statement_timeout = '30s';

-- 3) service_role (주의: 너무 길게 두면 DoS 위험)
ALTER ROLE service_role SET statement_timeout = '60s';

-- 변경 즉시 반영되지 않으면:
NOTIFY pgrst, 'reload config';
```

> **주의**: 이미 사용자는 이 옵션을 거부했습니다. 하지만 "Large 업그레이드 HNSW 빌드"가 실패했을 때의 **최후 안전망**으로 기록해 둡니다.

### 4.2 IVFFlat 튜닝

중복 인덱스 2개 드롭 + `lists` 재조정:

```sql
-- 중복 인덱스 조사
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'cases' AND indexdef LIKE '%ivfflat%';

-- 중복 드롭 (확인 후)
DROP INDEX CONCURRENTLY idx_cases_embedding_dup1;
DROP INDEX CONCURRENTLY idx_cases_embedding_dup2;

-- probes 조정 (recall↓ 하지만 속도↑)
SET ivfflat.probes = 5;  -- 기본 10 → 5
```

- `probes=5`로 낮추면 쿼리 속도는 약 1.5~2배 개선되지만 recall이 85%→70%대로 떨어질 수 있습니다.
- 현실적으로 IVFFlat 410k × 1024dim은 **메모리 상 전체 스캔이 안 될 경우 디스크 IO로 인해 구조적으로 느립니다.** HNSW가 답입니다.

### 4.3 카테고리별 partial HNSW

```sql
CREATE INDEX idx_cases_civil_hnsw ON cases 
USING hnsw (embedding vector_cosine_ops) 
WHERE category = '민사';
-- 반복 (형사, 가사, ...)
```

- 각 partial index는 전체의 1/5 ~ 1/10 크기라 **Small(2GB RAM)에서도 빌드 가능할 가능성**이 있음.
- 쿼리 시 `WHERE category = '민사'` 가 반드시 포함되어야 partial index가 선택됨 → `hybrid_search_cases` RPC에 category 필터를 필수로 추가 필요.
- 단점: RPC 함수 여러 개 또는 동적 SQL 필요. 현재 코드의 `rpcName` 분기 로직과 어울리지 않음. **기술 부채 유발.**

### 4.4 데이터 줄이기

- `cases`가 대법원·2심·1심 판결을 모두 포함한다면, **대법원 판결만 유지(약 10~15%)** 해서 50k 행 수준으로 줄이는 것도 한 방법. RAM 300MB 수준으로 떨어져 Micro에서도 빌드 가능.
- 또는 최근 10년 판결만 active table, 그 이전은 archive table로 분리.
- **비즈니스 의사결정 필요**: 1·2심 판례도 유사 사건 검색에 가치가 크므로 제품팀과 상의 필요.

### 4.5 임베딩 차원 축소

- Voyage-3 1024dim → **Voyage-3-lite 512dim** 으로 재임베딩 시 메모리 절반 (약 1.1GB). Voyage API 재호출 비용과 시간(410k 문서 × ~$0.05/M tokens 수준) 발생.
- 또는 pgvector의 **halfvec** (float16) 사용: `ALTER COLUMN embedding TYPE halfvec(1024)`. **메모리 절반, 정확도 거의 무손실** — 이것은 실제로 좋은 옵션이지만 **pgvector 0.7+** 필요. Supabase에서 지원 여부 사전 확인 필수.
- **Binary quantization** (`bit(1024)`)도 가능하지만 recall 손실 큼.

---

## 5. RAG 포기 시 영향 분석 (코드 기반)

### 5.1 현재 구조 (검증 완료)

`src/services/rag.ts` 분석 결과:

**5.1.1 테이블별 독립 실행 (graceful degradation 이미 구현됨)**

L959~967:
```ts
searchPromises[table] = callSupabaseRpc<unknown>(rpcName, params).catch(
  (error: unknown) => {
    console.warn(`[RAG] ${label} 하이브리드 검색 실패:`, ...);
    return [];
  },
);
```

→ `cases`의 RPC가 timeout으로 실패해도 **다른 테이블 결과는 정상 반환**됩니다. 이것이 현재 사용자가 "다른 테이블은 잘 동작한다"고 보고한 이유입니다.

**5.1.2 에이전트별 cases 의존도** (L366~397)

| 에이전트 | cases 사용? | cases 제외 시 대체 소스 | 영향 |
|---|---|---|---|
| `precedent` | **O (핵심)** | `legal_judgments`, `aihub_legal_qa`, `statutes`, `legal_commentary` | 실제 사건번호 기반 판결 검색이 일부 줄지만, `legal_judgments`도 사건번호 포함 판결문 DB (L126 주석) → **상당 부분 대체 가능** |
| `analysis` | O | `legal_judgments`, `aihub_legal_qa`, `statutes`, `legal_mrc`, `legal_commentary` | 영향 작음 (다양한 소스 사용) |
| `review` | O | `statutes`, `aihub_legal_qa`, `legal_judgments`, `legal_commentary` | 영향 작음 |
| `rag_precedent` | O | `legal_judgments`, `aihub_legal_qa` | precedent 사전 호출용 |
| `legal` | X | — | 영향 없음 |
| `docgen` | X | — | 영향 없음 |

**5.1.3 동적 임계값 및 신뢰도 저하 모드** (L991, L1024~1040)

`topScore < 0.08`이면 RAG 결과를 완전 스킵하는 로직이 이미 존재 → "RAG 전체 부재" 상황도 시스템이 이미 경험하고 있으며, Claude가 자체 지식으로 답변합니다. **즉, `cases`만 제외해도 시스템 충돌은 없습니다.**

### 5.2 "cases만 포기" 의 실용적 구현

`AGENT_SEARCH_CONFIG` 에서 각 에이전트의 `tables` 배열에서 `"cases"` 를 제거하는 **5줄 변경**만으로 완료됩니다:

```ts
precedent: {
  tables: ["legal_judgments", "aihub_legal_qa", "statutes", "legal_commentary"],
  limit: 3,
},
// analysis, review, rag_precedent 동일 패턴
```

즉시 배포 가능. 되돌리기도 쉬움.

### 5.3 품질 영향 추정 (정성적)

- **precedent 에이전트 품질 하락: 15~30%** (추정)
  - 근거: `cases`는 "41만 건 실제 판결문"으로 가장 크지만, `legal_judgments`도 "실제 사건번호 포함 판결문" DB입니다(L126). 유사 사건 검색의 recall은 소폭 감소하지만, 할루시네이션 방지의 핵심인 **검증 가능한 사건번호**는 `legal_judgments`에서 여전히 공급됩니다.
  - `precedent-api.ts`의 외부 법제처 API 검색(`searchLatestPrecedents` 등)이 함께 동작하므로 최종 사용자 영향은 더 작아집니다(`useAgents.ts` L7~33).
- **analysis / review 에이전트 품질 하락: 5~15%** (추정)
  - 이미 4~5개 소스를 병합하므로 한 소스 제거의 한계 효용은 작음.
- **문서 생성(docgen) 품질: 영향 없음** — `legal_forms, statutes, legal_judgments, legal_terms, legal_commentary` 만 사용 중.

### 5.4 결론

**"RAG 전체 포기"는 과잉 대응입니다.** 최악의 경우에도 "cases 테이블만 한시적 제외" 옵션이 있으며, 이것은 코드 5줄 변경으로 즉시 가능합니다. 이것을 Plan D(안전망)로 준비해 두면, Plan A/B/C를 더 과감하게 시도할 수 있습니다.

---

## 6. 권장 결정 트리 & 옵션 비교표

### 6.1 옵션 비교 표

| # | 옵션 | 예상 비용 (월) | 실행 시간 | 성공 확률 | 검색 품질 | 유지보수 | 리스크 |
|---|---|---|---|---|---|---|---|
| **A** | **Compute를 Large(8GB)로 1~3시간 임시 업그레이드 → HNSW 빌드 → 다운그레이드** | 기존 $0 + **일회성 ~$0.5** | **1~3시간** | **높음 (85%+)** | 최고 (HNSW) | 없음 | 저: 빌드 재실패 시 Plan B로 |
| **A'** | Medium(4GB)으로 임시 업그레이드 (더 저렴) | 기존 $0 + **일회성 ~$0.15** | 2~5시간 | 중 (60%) — 2GB 안전 여유가 빠듯 | 최고 | 없음 | 중: MW-mem 한계에 걸릴 가능성 |
| **B** | halfvec(float16)으로 타입 변경 + HNSW (pgvector 0.7+ 필요) | $0 | 2~4시간 (재임베딩 필요 없음, 캐스팅만) | 중 (Supabase pgvector 버전 확인 필요) | 고 (recall 거의 무손실) | 낮음 | 중: pgvector 버전 의존 |
| **C** | Qdrant Cloud AWS Seoul (2GB 싱글노드)로 cases 마이그레이션 | **+$25~40/월** | 1~2일 | 높음 | 높음 (Qdrant HNSW) | 중 (이중 시스템) | 중: 하이브리드 검색 재구현 |
| **D** | cases 테이블만 RAG에서 제외 (코드 5줄 변경) | $0 | **30분** | **100%** | 중 (15~30% 하락 추정) | 낮음 | 저: 품질 일부 양보 |
| **E** | IVFFlat + `statement_timeout = 30s` + 중복 인덱스 드롭 | $0 | 1시간 | 높음 | 중-하 | 낮음 | 사용자가 이미 거부 |
| **F** | 카테고리별 partial HNSW | $0 | 3~5시간 (여러 번 빌드) | 중 | 중 | 높음 (RPC 재설계) | 고: 기술부채 |
| **G** | 데이터 서브셋화 (대법원만) | $0 | 1일 | 높음 | 중 (데이터 축소로 recall↓) | 중 | 고: 비즈니스 의사결정 필요 |
| **H** | RAG 전체 포기 | $0 | 1시간 | 100% | 대폭 하락 | 낮음 | **매우 고**: 핵심 차별화 포기 |

### 6.2 결정 트리

```
IF (0.5달러 지출 OK + 오늘 해결 원함)
  THEN: Plan A (Large 임시 업그레이드 → HNSW 빌드 → 다운그레이드)
  백업: A 실패 시 A' 건너뛰고 B 또는 C로

ELSE IF (pgvector 0.7+ 확인됨 + 버전 업그레이드 감수 가능)
  THEN: Plan B (halfvec 전환)

ELSE IF (월 $30 정도 여유 + 1~2일 개발 가능)
  THEN: Plan C (Qdrant Cloud 서울)

ELSE IF (품질 15~30% 손실 감수 가능 + 즉시 해결 필요)
  THEN: Plan D (cases만 RAG에서 제외)

AVOID:
  - Plan E: 사용자가 거부함
  - Plan F: 기술부채 과다
  - Plan H: 과잉 대응, Plan D로 충분
```

### 6.3 **1순위 권장: Plan A**

이유:
1. **비용**: 수백 원 수준. 사용자가 수용한 "Pro 플랜 $25/월" 대비 noise.
2. **작업 시간**: 1~3시간. 업그레이드 → psql 접속 → `SET LOCAL maintenance_work_mem = '6GB'` → `CREATE INDEX` → 다운그레이드.
3. **성공 확률**: 2.2GB 요구 vs 8GB RAM → 여유 4배. 공식 문서가 권장하는 방식.
4. **코드 변경 0**: 인프라 작업만.
5. **되돌리기 쉬움**: 실패해도 다운그레이드만 하면 $0.5 손해로 끝남.

---

## 7. Action Items (사용자 결정 후 즉시 실행 가능)

### Plan A 실행 체크리스트 (권장)

**사전 준비 (15분)**
- [ ] Supabase Dashboard → Settings → Billing 페이지에서 현재 디스크 사용량과 Large 업그레이드 예상 요금 확인
- [ ] 현재 `cases` 테이블의 디스크 사이즈 확인: `SELECT pg_size_pretty(pg_total_relation_size('cases'));`
- [ ] 기존 IVFFlat 중복 인덱스 목록 저장: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'cases';` → 결과를 텍스트로 보관
- [ ] 프로젝트 다운타임 공지 (재시작 시 ~2분)

**업그레이드 (5분)**
- [ ] Dashboard → Database → **Compute Size** → **Large (8GB RAM, 2 dedicated vCPU)** 선택 → Apply
- [ ] 재시작 완료 대기 (Dashboard의 Health 표시 그린)

**HNSW 빌드 (30분 ~ 2시간, 모니터링하며)**
```sql
-- psql 세션 열기 (Supabase Dashboard → Database → Connection string → psql)

BEGIN;
SET LOCAL maintenance_work_mem = '6GB';           -- 2.2GB 필요치 대비 넉넉히
SET LOCAL max_parallel_maintenance_workers = 1;   -- Large의 2 core 중 1개 사용
SET LOCAL statement_timeout = '0';                -- 세션 한정 무제한

-- 기존 ivfflat 인덱스 제거 (중복 포함)
DROP INDEX IF EXISTS cases_embedding_idx;
DROP INDEX IF EXISTS cases_embedding_idx1;
DROP INDEX IF EXISTS cases_embedding_idx2;
-- (실제 인덱스명은 사전 준비 단계의 목록으로 교체)

-- HNSW 빌드 (CONCURRENTLY는 트랜잭션 밖에서만 가능하므로 여기선 일반 CREATE INDEX)
CREATE INDEX cases_embedding_hnsw_idx
ON cases USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

COMMIT;

-- 쿼리 시 recall 조정
ALTER DATABASE postgres SET hnsw.ef_search = 40;  -- 기본 40, 품질 필요시 100까지
```

- [ ] 빌드 진행 상황 모니터링 (다른 psql 세션에서):
  ```sql
  SELECT phase, blocks_done, blocks_total, tuples_done, tuples_total
  FROM pg_stat_progress_create_index;
  ```
- [ ] 빌드 완료 확인: `\d cases` 또는 `SELECT indexdef FROM pg_indexes WHERE tablename='cases';`

**검증 (10분)**
- [ ] 테스트 쿼리 실행:
  ```sql
  EXPLAIN ANALYZE SELECT id, 1 - (embedding <=> '[...]'::vector) AS sim
  FROM cases ORDER BY embedding <=> '[...]'::vector LIMIT 10;
  ```
  → `Index Scan using cases_embedding_hnsw_idx` 가 계획에 나오는지 확인, 실행 시간이 100ms 미만인지 확인.
- [ ] 앱에서 `hybrid_search_cases` RPC 수동 호출 → 성공 확인

**다운그레이드 (5분)**
- [ ] Dashboard → Database → Compute Size → **Small** 선택 → Apply
  - Small(2GB)로 다운할 것인지, Micro(1GB)로 할 것인지 판단: **Small 권장** (쿼리 시 hnsw.ef_search 워킹셋이 약간 필요하며 2GB가 더 안전)
- [ ] 재시작 완료 후 `cases` 쿼리 재검증
- [ ] Billing 페이지에서 실제 청구 금액 확인

**사후 (다음 날)**
- [ ] `legal_mrc`, `aihub_legal_qa`, `statutes` 등 다른 큰 테이블에도 동일 작업 필요 여부 평가 (같은 세션/업그레이드 타임을 쓰면 추가 비용 없음 → 사실 첫 시도 시 **한 번에 모두 빌드**하는 것이 효율적)

### Plan D 실행 체크리스트 (안전망, Plan A 실패 시)

- [ ] `src/services/rag.ts` L366~397 `AGENT_SEARCH_CONFIG`에서 `precedent`, `analysis`, `review`, `rag_precedent`의 `tables` 배열에서 `"cases"` 제거
- [ ] `git commit -m "fix(rag): cases 테이블을 임시로 RAG에서 제외 (HNSW 빌드 실패 대응)"`
- [ ] 배포 후 precedent 에이전트 품질 스팟 체크 (2~3건 테스트 사건)
- [ ] Plan A/B/C가 성공할 때까지 유지

### Plan C 실행 체크리스트 (월 $30 여유 있고 Plan A/B 실패 시)

- [ ] Qdrant Cloud 가입 → AWS Seoul 리전에서 2GB RAM 싱글노드 클러스터 생성
- [ ] 마이그레이션 스크립트 작성: Supabase `cases` → Qdrant (Python/Node)
  - collection 생성: `vectors: {size: 1024, distance: "Cosine"}`
  - payload: `case_number, court, case_date, category, summary, full_text, ...`
- [ ] 애플리케이션 변경: `src/services/rag.ts`에 `searchCasesQdrant()` 추가, 기존 `hybrid_search_cases` 분기 처리
- [ ] 하이브리드(키워드) 파트는 Supabase에 남은 `cases` 테이블의 tsvector로 별도 조회 후 JavaScript에서 merge
- [ ] 환경변수 추가: `VITE_QDRANT_URL`, `VITE_QDRANT_API_KEY` (프록시 경유 권장)

---

## 부록 A. 사실 vs 추측 구분

**사실 (공식 문서/GitHub issue/코드 직접 확인):**
- Supabase Pro 기본 = Micro 1GB RAM, $10 compute credit — [Supabase Docs](https://supabase.com/docs/guides/platform/compute-and-disk)
- pgvector HNSW 메모리 근사식 `N × (8 + d×4) × 1.3` — [pgvector issue #844](https://github.com/pgvector/pgvector/issues/844)
- `maintenance_work_mem` 부족 시 disk-based 10~50배 느림 — [Crunchy Data](https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector), [Supabase 공식 troubleshooting](https://supabase.com/docs/guides/troubleshooting/increase-vector-lookup-speeds-by-applying-an-hsnw-index-ohLHUM)
- `SET LOCAL maintenance_work_mem` 가 Supabase에서 올바른 방법 — [Supabase Discussion #35782](https://github.com/orgs/supabase/discussions/35782)
- IVFFlat `lists = rows/1000` (≤1M) — [pgvector README](https://github.com/pgvector/pgvector)
- `src/services/rag.ts` 에 `.catch(() => [])` graceful degradation 존재 — 직접 확인 (L959~967)
- 각 에이전트의 `cases` 의존도 — 직접 확인 (L366~397)

**추측/근사 (신중히 다룰 것):**
- Supabase Large 월 $110, 시간당 $0.151 — 공식 API 뒤의 값이라 webfetch로 직접 확인 안 됨. 3rd-party 가격 분석에서 교차 확인했지만 **업그레이드 직전 Billing 페이지에서 반드시 재확인**.
- `precedent` 품질 하락 15~30% — 정성적 추정. 실측 없음.
- Qdrant Cloud 2GB 월 $25~40 — usage-based라서 트래픽 의존. calculator 확인 권장.
- `halfvec` Supabase 지원 여부 — Supabase pgvector 버전이 0.7+ 인지 사전 확인 필수.

## 부록 B. 참고 링크

- [Supabase: Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Supabase: Manage Compute usage](https://supabase.com/docs/guides/platform/manage-your-usage/compute)
- [Supabase: HNSW 벡터 인덱스 troubleshooting](https://supabase.com/docs/guides/troubleshooting/increase-vector-lookup-speeds-by-applying-an-hsnw-index-ohLHUM)
- [Supabase: maintenance_work_mem 늘리기 Discussion](https://github.com/orgs/supabase/discussions/35782)
- [Supabase: 대형 테이블 reindexing timeout 해결](https://github.com/orgs/supabase/discussions/17821)
- [pgvector README](https://github.com/pgvector/pgvector)
- [pgvector issue #844: HNSW 메모리 공식](https://github.com/pgvector/pgvector/issues/844)
- [pgvector issue #822: HNSW 빌드 수천만 행에서 멈춤](https://github.com/pgvector/pgvector/issues/822)
- [Crunchy Data: HNSW Indexes with Postgres and pgvector](https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector)
- [Scaling pgvector: Memory, Quantization, and Index Build Strategies](https://dev.to/philip_mcclarence_2ef9475/scaling-pgvector-memory-quantization-and-index-build-strategies-8m2)
- [Qdrant Cloud Pricing](https://qdrant.tech/pricing/) / [Calculator](https://cloud.qdrant.io/calculator)
- [Pinecone: Understanding cost](https://docs.pinecone.io/guides/manage-cost/understanding-cost)
- [Weaviate Serverless Pricing](https://weaviate.io/pricing/serverless)
- [Zilliz Cloud Pricing](https://zilliz.com/pricing)

---

*이 문서는 2026-04-11 시점의 공식 문서와 커뮤니티 논의를 종합해 작성되었습니다. 가격과 리전 정보는 빠르게 변동하므로 실행 직전에 반드시 공식 페이지를 재확인하세요.*
