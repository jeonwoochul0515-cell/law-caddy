# Supabase DB 전체 검토 보고서

> 검토일: 2026-04-08
> 프로젝트: law-caddy-db (eafcyvbgcedvhlwqotis)
> 총 데이터: 약 231만건, 임베딩 100% 완료

---

## 1. 테이블별 현황

### 1.1 cases (410,830건) — 판례

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| case_number | text | 사건번호 (65% 실제 사건번호, 35% lbox_* 내부ID) |
| court | text | 법원명 |
| case_date | date | 판결일 |
| category | text | 분류 (민사, 형사, 행정 등) — 38% 미분류 |
| summary | text | 요약/주문 |
| key_issues | text[] | 주요 쟁점 (대부분 null) |
| statutes | text[] | 관련 법령 (대부분 null) |
| full_text | text | 판결문 원문 (94.5% 보유, 평균 2,945자) |
| raw_json | jsonb | 원본 JSON |
| source | text | 출처 |
| fts | tsvector | 전문검색 |
| embedding | vector(1024) | 임베딩 (100%) |

**출처 분포**: lbox_open(108,840), kb_precedent(75,863), aihub_115(46,237), aihub_115_source(43,000), knowledge_panrye(39,420), 115_panrye(37,912), lbox(34,593), law_go_kr_prec(6,387) 등 20개 소스

**품질 이슈**:
- 38% 미분류 ("미분류" 122,136건 + "unclassified" 34,593건)
- key_issues, statutes 배열 대부분 null — 구조화 메타데이터 부족
- 사건번호 35%가 lbox_* 형태 내부 ID

---

### 1.2 legal_judgments (176,876건) — 판결문/결정례

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | bigint | PK |
| doc_id | text | 문서ID (예: criminal_결정례_179903) |
| court | text | 법원명 (대부분 null) |
| case_name | text | 사건명 (대부분 null) |
| case_type | text | 사건유형 (criminal 등) |
| category | text | 분류 (형사법 등) |
| doc_type | text | 문서유형 (결정례, 판례 등) |
| content | text | 원문 내용 (100% 보유, 100자 이상) |
| summary | text | 요약 |
| embedding | vector(1024) | 임베딩 (100%) |
| fts | tsvector | 전문검색 |

**품질**: content에 실제 결정문/판결문 원문 포함. court, case_name은 대부분 null이지만 doc_id에서 유형 파악 가능.

---

### 1.3 statutes (256,803건) — 법령 조문

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer | PK |
| statute_name | text | 법률명 (예: 민법) |
| statute_mst | text | 법령 마스터ID |
| article_number | text | 조문번호 (예: 제85조) |
| article_title | text | 조문 제목 |
| article_content | text | 조문 원문 |
| embedding | vector(1024) | 임베딩 (100%) |
| fts | tsvector | 전문검색 |

**품질**: 조문 원문이 잘 정비되어 있음. "민법 제85조(해산등기)" 등 article_content에 조문 전문 수록.

---

### 1.4 easy_law (533,041건) — 생활법률/법령용어

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer | PK |
| topic | text | 주제 (예: 법령용어) |
| title | text | 제목 |
| content | text | 내용 |
| related_statutes | text[] | 관련 법령 |
| embedding | vector(1024) | 임베딩 (100%) |
| fts | tsvector | 전문검색 |

---

### 1.5 legal_mrc (359,845건) — 기계독해 Q&A

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer | PK |
| doc_id, doc_title, doc_source, doc_class | text | 문서 메타정보 |
| qa_type | text | QA 유형 (정답경계 추출형, 절차형 등) |
| context | text | 문맥 |
| question | text | 질문 |
| answer | text | 답변 |
| embedding | vector(1024) | 임베딩 (100%) |
| fts | tsvector | 전문검색 |

---

### 1.6 aihub_legal_qa (270,023건) — AI Hub 법률 QA

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer | PK |
| category | text | 분류 (민사법 등) |
| doc_type | text | 문서유형 (판결문 등) |
| task_type | text | 태스크유형 |
| question | text | 질문 |
| answer | text | 답변 |
| source_info | text | 출처 (예: 서울중앙지방법원-2016가단157694) — 실제 사건번호 포함 |
| embedding | vector(1024) | 임베딩 (100%) |
| fts | tsvector | 전문검색 |

---

### 1.7 legal_terms (247,478건) — 법률용어

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer | PK |
| term | text | 용어 |
| related_terms | text[] | 관련용어 |
| synonyms | text[] | 유의어 |
| hypernyms | text[] | 상위어 |
| definition | text | 정의 |
| source_uri | text | 출처URI |
| embedding | vector(1024) | 임베딩 (100%) |
| fts | tsvector | 전문검색 |

**품질 이슈**: **95%가 실제 정의 없음** (관련어 나열만). 실질 정의가 있는 건 12,404건(5%)뿐 — "[법령정의사전]" 태그가 붙은 항목만 양질.

---

### 1.8 legal_knowledge (52,076건) — 법률 지식

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer | PK |
| category | text | 분류 (창업인허가 등) |
| title | text | 제목 |
| content | text | 내용 |
| source, source_uri | text | 출처정보 |
| statute_name | text | 관련 법률명 |
| article_name | text | 관련 조문 |
| related_laws | text[] | 관련 법률 |
| entry_type | text | 항목유형 (Article, Paragraph 등) |
| embedding | vector(1024) | 임베딩 (100%) |
| fts | tsvector | 전문검색 |

---

### 1.9 legal_commentary (6,814건) — 법학 해설

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | bigint | PK |
| source | text | 출처 (hf_kicj_legal_qa 등) |
| source_id | text | 원본ID |
| category | text | 분류 |
| title | text | 제목 (질문 형태) |
| content | text | 답변 내용 |
| summary | text | 요약 |
| author | text | 저자 |
| related_statutes, related_cases | text[] | 관련 법령/판례 (대부분 null) |
| metadata | jsonb | 추가 메타데이터 |
| embedding | vector(1024) | 임베딩 (100%) |
| fts | tsvector | 전문검색 |

---

### 1.10 legal_forms (2,323건) — 법률 서식

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer | PK |
| form_type | text | 서식유형 (24종: 소장, 답변서, 계약서 등) |
| case_category | text | 사건분류 |
| title | text | 제목 |
| content | text | 서식 본문 |
| writing_guide | text | 작성 가이드 (대부분 null) |
| source | text | 출처 (법률구조공단, 법원 실무 양식) |
| embedding | vector(1024) | 임베딩 (100%) |
| fts | tsvector | 전문검색 |

**서식 유형 분포**: 기타(1,227), 신청서(417), 소장(135), 답변서(131), 계약서(108), 가압류신청서(88) 등

---

### 1.11 비어있는 테이블

| 테이블 | 건수 | 용도 |
|--------|------|------|
| case_chunks | 0 | 판례 청크 분할 (id, case_id, chunk_index, chunk_text, chunk_type, embedding) |
| case_citations | 0 | 판례 인용 관계 (citing_case_id, cited_case_id, citation_context) |

---

### 1.12 CARELAW 테이블 (LAW-CADDY와 무관)

| 테이블 | 건수 | 용도 |
|--------|------|------|
| carelaw_messages | 101 | 메시지 |
| carelaw_cases | 25 | 사건 |
| carelaw_invites | 7 | 초대 |
| carelaw_brands | 2 | 브랜드 |
| carelaw_subscriptions | 1 | 구독 |
| carelaw_franchisees | 1 | 가맹점 |
| carelaw_notifications | 0 | 알림 |
| carelaw_plan_limits | view | 요금제 한도 (SECURITY DEFINER) |

---

## 2. 임베딩 및 인덱스 현황

### 임베딩

| 테이블 | 벡터 차원 | 커버리지 |
|--------|----------|---------|
| 전 테이블 | 1024 | **100%** |

### 인덱스

- 모든 테이블에 **IVFFlat** 벡터 인덱스 + **GIN** FTS 인덱스 구성 완료
- cases 테이블: IVFFlat 인덱스 **3개 중복** (lists=50, 100, 200) — 정리 필요
- 인덱스 lists 파라미터: 테이블 크기에 따라 48~228 범위

---

## 3. hybrid_search 함수 현황

### 하이브리드 검색 (11개)

공통 파라미터:
```
query_text text,
query_embedding vector,
match_count integer DEFAULT 5,
keyword_weight double precision DEFAULT 0.3,
semantic_weight double precision DEFAULT 0.7
```

| 함수명 | 특이사항 |
|--------|---------|
| hybrid_search_cases | category_filter 파라미터 추가 |
| hybrid_search_statutes | - |
| hybrid_search_easy_law | - |
| hybrid_search_legal_judgments | - |
| hybrid_search_legal_mrc | - |
| hybrid_search_aihub_qa | - |
| hybrid_search_legal_terms | - |
| hybrid_search_legal_knowledge | - |
| hybrid_search_legal_forms | - |
| hybrid_search_legal_commentary | - |
| hybrid_search_all | **통합 검색** — 전 테이블 크로스 검색 |

### 시맨틱 검색 (10개)

공통 파라미터: `query_embedding vector, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 5`

모든 테이블에 대해 `match_*` 함수 존재.

### RLS 정책

법률 데이터 10개 테이블 모두 `anon_select_*` 정책으로 SELECT 허용 (2026-04-08 적용). carelaw_* 테이블은 변경 없음.

---

## 4. 에이전트별 활용 매핑

| 에이전트 | 핵심 테이블 | 보조 테이블 | 활용도 |
|----------|-----------|-----------|-------|
| 한판서 (판례) | cases, legal_judgments | - | 매우 높음 (58만건 판례) |
| 윤율무 (적법성) | statutes, legal_knowledge | easy_law, legal_commentary | 높음 |
| 서혜안 (쟁점) | aihub_legal_qa, legal_mrc | cases, statutes, legal_commentary | 매우 높음 |
| 조필묵 (문서) | legal_forms, statutes | cases | 중간 (작성가이드 부족) |
| 최감수 (검토) | statutes, cases | legal_commentary, aihub_legal_qa | 높음 |
| RAG 판례 (신규) | cases, legal_judgments | aihub_legal_qa | 매우 높음 |

---

## 5. 발견된 이슈

### 강점
1. 전 테이블 1024차원 임베딩 100% 완료 + FTS tsvector 완비
2. IVFFlat + GIN 인덱스 모두 구성 완료
3. hybrid_search 11개 + match 10개 + 통합검색 1개 = 22개 검색 함수 준비 완료
4. 총 231만건 대규모 법률 데이터

### 약점
1. **cases 중복 인덱스**: IVFFlat 인덱스 3개 중복 (lists=50, 100, 200) — 하나로 통합 권장
2. **cases 미분류 38%**: "미분류"/"unclassified" 재분류 필요
3. **legal_terms 품질**: 95%가 관련용어 나열뿐, 실제 정의 12,404건(5%)만
4. **case_chunks/case_citations 비어 있음**: 긴 판결문 청크 검색 불가, 판례 간 인용관계 미구축
5. **legal_forms writing_guide 대부분 null**: 문서 작성 가이드 부재
6. **cases key_issues/statutes 배열 대부분 null**: 구조화 메타데이터 부족
