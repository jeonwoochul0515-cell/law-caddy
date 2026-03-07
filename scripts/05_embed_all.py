"""
Step 5: legal_forms, easy_law, statutes, aihub_legal_qa 테이블 Voyage 임베딩
모든 테이블의 embedding=null인 행에 대해 임베딩 생성
"""

import time
import json
import requests
from tqdm import tqdm
from config import SUPABASE_URL, SUPABASE_KEY, VOYAGE_API_KEY, VOYAGE_MODEL

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
VOYAGE_HEADERS = {
    "Authorization": f"Bearer {VOYAGE_API_KEY}",
    "Content-Type": "application/json",
}

# 설정
MAX_BATCH_TOKENS = 100000
MAX_TOKENS_PER_TEXT = 30000
BATCH_SIZE = 20
DELAY_MS = 200


def estimate_tokens(text: str) -> int:
    """한국어 텍스트 토큰 수 추정 (1자 ≈ 2토큰)"""
    return len(text) * 2


def fetch_rows_without_embedding(table: str, text_columns: list[str], limit: int = 500) -> list[dict]:
    """임베딩이 없는 행 조회 (재시도 포함)"""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    select_cols = ",".join(["id"] + text_columns)
    params = {
        "select": select_cols,
        "embedding": "is.null",
        "order": "id",
        "limit": limit,
    }
    for attempt in range(3):
        try:
            resp = requests.get(url, headers=SUPABASE_HEADERS, params=params, timeout=30)
            if resp.status_code == 200:
                return resp.json()
            else:
                print(f"  조회 에러 ({table}): {resp.status_code}")
                return []
        except requests.exceptions.ConnectionError as e:
            wait = 5 * (attempt + 1)
            print(f"  Supabase 연결 에러 (시도 {attempt+1}/3), {wait}초 대기: {e}")
            time.sleep(wait)
    print(f"  조회 실패 ({table}): 3회 재시도 후 포기")
    return []


def get_embedding_batch(texts: list[str]) -> list[list[float]]:
    """Voyage API로 배치 임베딩"""
    payload = {
        "model": VOYAGE_MODEL,
        "input": texts,
        "input_type": "document",
    }
    for attempt in range(3):
        try:
            resp = requests.post(VOYAGE_URL, headers=VOYAGE_HEADERS, json=payload, timeout=120)
            if resp.status_code == 200:
                data = resp.json()
                return [item["embedding"] for item in data["data"]]
            elif resp.status_code == 429:
                wait = min(30, 5 * (attempt + 1))
                print(f"  Rate limit, {wait}초 대기...")
                time.sleep(wait)
            else:
                print(f"  Voyage 에러: {resp.status_code} - {resp.text[:200]}")
                return []
        except Exception as e:
            print(f"  요청 에러: {e}")
            time.sleep(3)

    return []


def update_embedding(table: str, row_id: int, embedding: list[float]):
    """Supabase 행의 embedding 업데이트 (재시도 포함)"""
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}"
    headers = {**SUPABASE_HEADERS, "Prefer": "return=minimal"}
    payload = {"embedding": json.dumps(embedding)}
    for attempt in range(3):
        try:
            resp = requests.patch(url, headers=headers, json=payload, timeout=30)
            return resp.status_code in (200, 204)
        except requests.exceptions.ConnectionError as e:
            wait = 3 * (attempt + 1)
            print(f"  업데이트 연결 에러 (id={row_id}, 시도 {attempt+1}/3), {wait}초 대기")
            time.sleep(wait)
    return False


def process_table(table: str, text_columns: list[str]):
    """테이블의 모든 행에 임베딩 생성 (여러 텍스트 컬럼을 합칠 수 있음)"""

    # 총 건수 확인
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=id&embedding=is.null"
    headers = {**SUPABASE_HEADERS, "Prefer": "count=exact"}
    resp = requests.head(url, headers=headers, timeout=30)
    content_range = resp.headers.get("content-range", "*/0")
    total = int(content_range.split("/")[-1]) if "/" in content_range else 0

    if total == 0:
        print(f"  {table}: 임베딩할 행 없음 (이미 완료)")
        return

    print(f"  {table}: {total}건 임베딩 시작")

    processed = 0
    errors = 0

    skipped_ids: set[int] = set()  # 텍스트가 너무 짧아서 건너뛴 행 ID

    while True:
        rows = fetch_rows_without_embedding(table, text_columns, limit=200)
        if not rows:
            break

        # 모든 행이 이미 건너뛴 행이면 종료 (무한 루프 방지)
        new_rows = [r for r in rows if r["id"] not in skipped_ids]
        if not new_rows:
            print(f"  남은 {len(rows)}건은 텍스트가 너무 짧아 건너뜀")
            break

        # 동적 배치 구성
        batch_texts = []
        batch_ids = []
        batch_tokens = 0

        for row in rows:
            if row["id"] in skipped_ids:
                continue
            # 여러 컬럼을 "\n\n"으로 합침
            parts = []
            for col in text_columns:
                val = row.get(col, "") or ""
                if val:
                    parts.append(val)
            text = "\n\n".join(parts)
            if not text or len(text) < 5:
                skipped_ids.add(row["id"])
                continue

            tokens = estimate_tokens(text)
            if tokens > MAX_TOKENS_PER_TEXT:
                text = text[:15000]
                tokens = estimate_tokens(text)

            if batch_tokens + tokens > MAX_BATCH_TOKENS and batch_texts:
                # 배치 처리
                embeddings = get_embedding_batch(batch_texts)
                if embeddings and len(embeddings) == len(batch_ids):
                    for rid, emb in zip(batch_ids, embeddings):
                        if update_embedding(table, rid, emb):
                            processed += 1
                        else:
                            errors += 1
                else:
                    errors += len(batch_ids)

                batch_texts = []
                batch_ids = []
                batch_tokens = 0
                time.sleep(DELAY_MS / 1000)

            batch_texts.append(text)
            batch_ids.append(row["id"])
            batch_tokens += tokens

        # 남은 배치 처리
        if batch_texts:
            embeddings = get_embedding_batch(batch_texts)
            if embeddings and len(embeddings) == len(batch_ids):
                for rid, emb in zip(batch_ids, embeddings):
                    if update_embedding(table, rid, emb):
                        processed += 1
                    else:
                        errors += 1
            else:
                errors += len(batch_ids)

        print(f"  진행: {processed}/{total} (에러: {errors})")

    print(f"  {table} 완료: {processed}건 성공, {errors}건 실패")


def main():
    print("=" * 60)
    print("전체 테이블 Voyage 임베딩")
    print("=" * 60)

    tables = [
        ("legal_forms", ["content"]),
        ("statutes", ["article_content"]),
        ("legal_knowledge", ["title", "content"]),
        ("legal_terms", ["term", "definition"]),
        ("easy_law", ["content"]),
        ("legal_judgments", ["summary", "content"]),
        ("legal_mrc", ["question", "answer", "context"]),
        ("aihub_legal_qa", ["question", "answer"]),
        ("cases", ["summary", "full_text"]),
    ]

    for table, text_cols in tables:
        print(f"\n{'─' * 40}")
        print(f"테이블: {table} (텍스트 컬럼: {', '.join(text_cols)})")
        print(f"{'─' * 40}")
        process_table(table, text_cols)

    print("\n" + "=" * 60)
    print("전체 임베딩 완료!")
    print("=" * 60)


if __name__ == "__main__":
    main()
