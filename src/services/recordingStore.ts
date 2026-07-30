// 녹음 조각을 브라우저에 즉시 저장하는 창고 (IndexedDB)
//
// 왜 필요한가:
//   MediaRecorder가 모은 데이터를 메모리에만 들고 있으면, 폰에 전화가 와서 브라우저가
//   정리되는 순간 30분짜리 상담이 통째로 사라진다. 복구할 방법이 없다.
//   그래서 조각(chunk)이 나올 때마다 여기에 즉시 append 한다. 브라우저가 죽어도
//   마지막 조각까지는 디스크에 남아 있고, 다음 접속에서 이어붙일 수 있다.

const DB_NAME = "lawcaddy-recording";
const DB_VERSION = 1;
const STORE = "chunks";
/** 세션 메타(시작 시각·mimeType)를 담는 스토어 */
const META_STORE = "sessions";

export interface RecordingSessionMeta {
  id: string;
  startedAt: number;
  updatedAt: number;
  mimeType: string;
  /** 녹음된 총 길이(초) — 복구 화면에 보여준다 */
  duration: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // 자동 증가 키 — 조각 순서가 곧 재생 순서다
        db.createObjectStore(STORE, { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("녹음 저장소를 열 수 없습니다."));
  });
}

function tx<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("녹음 저장소 작업 실패"));
  });
}

/** 새 녹음 세션을 시작한다 (기존 조각은 지운다) */
export async function beginSession(mimeType: string): Promise<string> {
  const db = await openDb();
  await tx(db, STORE, "readwrite", (s) => s.clear());
  const id = `rec-${Date.now()}`;
  const meta: RecordingSessionMeta = {
    id,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    mimeType,
    duration: 0,
  };
  await tx(db, META_STORE, "readwrite", (s) => s.put(meta));
  db.close();
  return id;
}

/** 조각 하나를 즉시 저장한다. 실패해도 녹음 자체는 계속되어야 하므로 throw하지 않는다. */
export async function appendChunk(blob: Blob, duration: number): Promise<void> {
  try {
    const db = await openDb();
    await tx(db, STORE, "readwrite", (s) => s.add(blob));
    const metas = await tx<RecordingSessionMeta[]>(db, META_STORE, "readonly", (s) =>
      s.getAll() as IDBRequest<RecordingSessionMeta[]>,
    );
    const current = metas[metas.length - 1];
    if (current) {
      await tx(db, META_STORE, "readwrite", (s) =>
        s.put({ ...current, updatedAt: Date.now(), duration }),
      );
    }
    db.close();
  } catch (err) {
    console.warn("[recordingStore] 조각 저장 실패:", err);
  }
}

/** 저장된 세션 메타를 반환한다 (없으면 null) */
export async function getSavedSession(): Promise<RecordingSessionMeta | null> {
  try {
    const db = await openDb();
    const metas = await tx<RecordingSessionMeta[]>(db, META_STORE, "readonly", (s) =>
      s.getAll() as IDBRequest<RecordingSessionMeta[]>,
    );
    const count = await tx<number>(db, STORE, "readonly", (s) => s.count());
    db.close();
    if (count === 0) return null;
    return metas[metas.length - 1] ?? null;
  } catch {
    return null;
  }
}

/** 저장된 조각을 하나의 오디오 파일로 합친다 */
export async function buildSavedFile(): Promise<File | null> {
  try {
    const db = await openDb();
    const chunks = await tx<Blob[]>(db, STORE, "readonly", (s) => s.getAll() as IDBRequest<Blob[]>);
    const metas = await tx<RecordingSessionMeta[]>(db, META_STORE, "readonly", (s) =>
      s.getAll() as IDBRequest<RecordingSessionMeta[]>,
    );
    db.close();
    if (chunks.length === 0) return null;
    const meta = metas[metas.length - 1];
    const type = meta?.mimeType || "audio/webm";
    const blob = new Blob(chunks, { type });
    const ext = type.includes("mp4") ? "mp4" : "webm";
    return new File([blob], `recording_${meta?.startedAt ?? Date.now()}.${ext}`, { type });
  } catch (err) {
    console.warn("[recordingStore] 복구 파일 생성 실패:", err);
    return null;
  }
}

/** 저장된 조각과 메타를 모두 지운다 */
export async function clearSession(): Promise<void> {
  try {
    const db = await openDb();
    await tx(db, STORE, "readwrite", (s) => s.clear());
    await tx(db, META_STORE, "readwrite", (s) => s.clear());
    db.close();
  } catch (err) {
    console.warn("[recordingStore] 저장소 정리 실패:", err);
  }
}
