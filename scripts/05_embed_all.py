"""
Step 5: legal_forms, easy_law, statutes 테이블 Voyage 임베딩
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


def fetch_rows_without_embedding(table: str, text_column: str, limit: int = 500) -> list[dict]:
    """임베딩이 없는 행 조회"""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    params = {
        "select": f"id,{text_column}",
        "embedding": "is.null",
        "order": "id",
        "limit": limit,
    }
    resp = requests.get(url, headers=SUPABASE_HEADERS, params=params, timeout=30)
    if resp.status_code == 200:
        return resp.json()
    else:
        print(f"  조회 에러 ({table}): {resp.status_code}")
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
    """Supabase 행의 embedding 업데이트"""
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}"
    headers = {**SUPABASE_HEADERS, "Prefer": "return=minimal"}
    payload = {"embedding": json.dumps(embedding)}
    resp = requests.patch(url, headers=headers, json=payload, timeout=30)
    return resp.status_code in (200, 204)


def process_table(table: str, text_column: str):
    """테이블의 모든 행에 임베딩 생성"""

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

    while True:
        rows = fetch_rows_without_embedding(table, text_column, limit=200)
        if not rows:
            break

        # 동적 배치 구성
        batch_texts = []
        batch_ids = []
        batch_tokens = 0

        for row in rows:
            text = row.get(text_column, "") or ""
            if not text or len(text) < 5:
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
        ("legal_forms", "content"),
        ("easy_law", "content"),
        ("statutes", "article_content"),
    ]

    for table, text_col in tables:
        print(f"\n{'─' * 40}")
        print(f"테이블: {table} (텍스트 컬럼: {text_col})")
        print(f"{'─' * 40}")
        process_table(table, text_col)

    print("\n" + "=" * 60)
    print("전체 임베딩 완료!")
    print("=" * 60)


if __name__ == "__main__":
    main()
