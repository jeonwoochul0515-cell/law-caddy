// 내 데이터 전체 백업 — 소유 데이터를 JSON + 문서 텍스트로 묶어 ZIP 다운로드
// 변호사의 기록 보존 의무 + "내 데이터는 언제든 가져갈 수 있다"는 신뢰 장치.
import JSZip from "jszip";
import { collection, getDocs, query, where, type Timestamp } from "firebase/firestore";
import { db } from "../config/firebase";

/** ownerId로 필터되는 내보내기 대상 루트 컬렉션 */
const OWNED_COLLECTIONS = [
  "cases",
  "documents",
  "recordings",
  "fees",
  "case_expenses",
  "deposits",
  "transactions",
  "office_expenses",
  "monthly_summary",
  "deadlines",
  "opponentDocs",
  "case_records",
] as const;

/** Firestore Timestamp를 ISO 문자열로 바꿔 JSON에 안전하게 담는다 */
function serialize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const ts = value as Timestamp;
  if (typeof ts.toDate === "function" && typeof ts.seconds === "number") {
    return ts.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(serialize);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serialize(v)]),
  );
}

/** 파일명에 못 쓰는 문자 제거 */
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
}

export interface BackupProgress {
  step: string;
  done: number;
  total: number;
}

/**
 * 소유 데이터 전체를 ZIP으로 만들어 다운로드합니다.
 * @returns 내보낸 문서(레코드) 총 개수
 */
export async function exportAllData(
  ownerId: string,
  onProgress?: (p: BackupProgress) => void,
): Promise<number> {
  const zip = new JSZip();
  const dataFolder = zip.folder("data")!;
  const total = OWNED_COLLECTIONS.length;
  let recordCount = 0;

  const summary: Record<string, number> = {};
  const caseNames: Record<string, string> = {};
  let documentRows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < OWNED_COLLECTIONS.length; i++) {
    const name = OWNED_COLLECTIONS[i];
    onProgress?.({ step: name, done: i, total });
    const snap = await getDocs(
      query(collection(db!, name), where("ownerId", "==", ownerId)),
    );
    const rows: Array<Record<string, unknown>> = snap.docs.map((d) => ({
      id: d.id,
      ...(serialize(d.data()) as Record<string, unknown>),
    }));
    summary[name] = rows.length;
    recordCount += rows.length;
    dataFolder.file(`${name}.json`, JSON.stringify(rows, null, 2));

    if (name === "cases") {
      for (const r of rows) caseNames[r.id as string] = (r.clientName as string) ?? "";
    }
    if (name === "documents") documentRows = rows;
  }

  // 생성 문서는 사람이 바로 읽을 수 있게 텍스트 파일로도 저장
  const docsFolder = zip.folder("documents-text")!;
  for (const d of documentRows) {
    const text = (d.finalDocument as string) ?? "";
    if (!text) continue;
    const client = safeName(caseNames[d.caseId as string] ?? "무명");
    const date = typeof d.createdAt === "string" ? d.createdAt.slice(0, 10) : "";
    docsFolder.file(`${client}_${safeName((d.docType as string) ?? "문서")}_${date}_${(d.id as string).slice(0, 6)}.txt`, text);
  }

  const now = new Date();
  zip.file(
    "README.txt",
    [
      `Law-Caddy 데이터 백업`,
      `내보낸 시각: ${now.toLocaleString("ko-KR")}`,
      ``,
      `구성:`,
      `- data/*.json — 컬렉션별 원본 데이터 (Timestamp는 ISO 문자열로 변환)`,
      `- documents-text/*.txt — 생성 문서 본문 (바로 열람용)`,
      ``,
      `컬렉션별 건수:`,
      ...Object.entries(summary).map(([k, v]) => `- ${k}: ${v}건`),
      ``,
      `참고: 녹음 파일·첨부 파일 원본(Storage)과 분할납부 상세는 포함되지 않습니다.`,
    ].join("\n"),
  );

  onProgress?.({ step: "압축", done: total, total });
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  a.href = url;
  a.download = `law-caddy-backup-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  return recordCount;
}
