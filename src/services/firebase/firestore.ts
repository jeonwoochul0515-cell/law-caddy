// Firestore CRUD 서비스
// 사건(Cases), 녹음(Recordings), 문서(Documents), 관리자(Admin) 관련 CRUD

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  arrayUnion,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import type {
  Case,
  TimelineEvent,
  OpponentDoc,
} from "../../types/case";
import type { CaseRecord } from "../../types/caseRecord";
import type { CaseDeadline } from "../../types/deadline";
import type { ClientCareMessage } from "../../types/clientCare";
import type { Recording } from "../../types/recording";
import type { LegalDocument } from "../../types/document";
import type { User } from "../../types/user";
import type { BugReport } from "../../types/bugReport";

// ──────────────────────────────────────────────
// Cases (사건)
// ──────────────────────────────────────────────

/** 사건 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateCaseData = Omit<Case, "id" | "createdAt" | "updatedAt">;

/**
 * 새 사건을 생성합니다.
 *
 * @param data - 사건 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 사건 문서 ID
 */
export async function createCase(data: CreateCaseData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "cases"), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건 생성 실패: ${error.message}`);
    }
    throw new Error("사건 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 변호사의 사건 목록을 조회합니다.
 *
 * @param ownerId - 변호사 UID
 * @returns 사건 목록 (최신순)
 */
export async function getCases(ownerId: string): Promise<Case[]> {
  try {
    const q = query(
      collection(db!, "cases"),
      where("ownerId", "==", ownerId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Case[];
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건 목록 조회 실패: ${error.message}`);
    }
    throw new Error("사건 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 사건을 조회합니다.
 *
 * @param id - 사건 문서 ID
 * @returns 사건 데이터 또는 null
 */
export async function getCase(id: string): Promise<Case | null> {
  try {
    const docSnap = await getDoc(doc(db!, "cases", id));
    if (!docSnap.exists()) {
      return null;
    }
    return { ...docSnap.data(), id: docSnap.id } as Case;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건 조회 실패: ${error.message}`);
    }
    throw new Error("사건 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사건 정보를 업데이트합니다.
 *
 * @param id - 사건 문서 ID
 * @param data - 업데이트할 필드
 */
export async function updateCase(
  id: string,
  data: Partial<Omit<Case, "id" | "createdAt">>
): Promise<void> {
  try {
    await updateDoc(doc(db!, "cases", id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건 업데이트 실패: ${error.message}`);
    }
    throw new Error("사건 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사건 타임라인에 이벤트를 추가합니다.
 *
 * @param caseId - 사건 문서 ID
 * @param event - 타임라인 이벤트 (date 제외, 자동 생성)
 */
export async function addTimelineEvent(
  caseId: string,
  event: Omit<TimelineEvent, "date">
): Promise<void> {
  try {
    const eventWithDate = {
      ...event,
      date: Timestamp.now(),
    };
    await updateDoc(doc(db!, "cases", caseId), {
      timeline: arrayUnion(eventWithDate),
      updatedAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`타임라인 이벤트 추가 실패: ${error.message}`);
    }
    throw new Error("타임라인 이벤트 추가 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Recordings (녹음)
// ──────────────────────────────────────────────

/** 녹음 생성 시 필요한 데이터 */
type CreateRecordingData = Omit<Recording, "id" | "createdAt">;

/**
 * 새 녹음을 생성합니다.
 *
 * @param data - 녹음 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 녹음 문서 ID
 */
export async function createRecording(
  data: CreateRecordingData
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "recordings"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`녹음 생성 실패: ${error.message}`);
    }
    throw new Error("녹음 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 사건의 녹음 목록을 조회합니다.
 *
 * @param caseId - 사건 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 * @returns 녹음 목록 (최신순)
 */
export async function getRecordings(caseId: string, ownerId: string): Promise<Recording[]> {
  try {
    const q = query(
      collection(db!, "recordings"),
      where("caseId", "==", caseId),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Recording[];
    // 복합 인덱스 없이 메모리에서 최신순 정렬
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`녹음 목록 조회 실패: ${error.message}`);
    }
    throw new Error("녹음 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 녹음 정보를 업데이트합니다.
 *
 * @param id - 녹음 문서 ID
 * @param data - 업데이트할 필드
 */
export async function updateRecording(
  id: string,
  data: Partial<Omit<Recording, "id" | "createdAt">>
): Promise<void> {
  try {
    await updateDoc(doc(db!, "recordings", id), { ...data });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`녹음 업데이트 실패: ${error.message}`);
    }
    throw new Error("녹음 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 녹음 한 건을 조회합니다. 없거나 권한이 없으면 null.
 */
export async function getRecording(id: string): Promise<Recording | null> {
  try {
    const snap = await getDoc(doc(db!, "recordings", id));
    if (!snap.exists()) return null;
    return { ...snap.data(), id: snap.id } as Recording;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`녹음 조회 실패: ${error.message}`);
    }
    throw new Error("녹음 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 녹음 문서를 지웁니다. Storage 파일은 services/firebase/storage.ts의
 * deleteRecordingFile로 따로 지운다 (두 단계 — 파일 삭제가 규칙에 막혀도 문서는 정리되게).
 */
export async function deleteRecording(id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "recordings", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`녹음 삭제 실패: ${error.message}`);
    }
    throw new Error("녹음 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 녹음을 다른 사건으로 옮깁니다 (caseId만 바꾼다 — Storage 경로는 그대로 둔다).
 */
export async function moveRecordingToCase(id: string, caseId: string): Promise<void> {
  await updateRecording(id, { caseId });
}

/**
 * 음성 변환이 끝나지 않은 채 남아 있는 녹음 목록 (사건 기준).
 * 화면 재진입 때 이어서 확인할 대상을 찾는 데 쓴다 (r1-03-05).
 */
export async function getPendingTranscriptions(caseId: string, ownerId: string): Promise<Recording[]> {
  const all = await getRecordings(caseId, ownerId);
  return all.filter((r) => r.sttStatus === "processing" && r.rtzrTranscribeId);
}

// ──────────────────────────────────────────────
// Documents (법률 문서)
// ──────────────────────────────────────────────

/** 문서 생성 시 필요한 데이터 */
type CreateDocumentData = Omit<LegalDocument, "id" | "createdAt">;

/**
 * 새 법률 문서를 생성합니다.
 *
 * @param data - 문서 데이터 (id, 타임스탬프 자동 생성)
 * @returns 생성된 문서 ID
 */
export async function createDocument(
  data: CreateDocumentData
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "documents"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`문서 생성 실패: ${error.message}`);
    }
    throw new Error("문서 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 사건의 문서 목록을 조회합니다.
 *
 * @param caseId - 사건 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 * @returns 문서 목록 (최신순)
 */
/**
 * 소유자의 전체 문서를 조회합니다 (문서고용 — 사건 구분 없이).
 */
export async function getAllDocuments(ownerId: string): Promise<LegalDocument[]> {
  try {
    const q = query(
      collection(db!, "documents"),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as LegalDocument[];
    return results.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`전체 문서 조회 실패: ${error.message}`);
    }
    throw new Error("전체 문서 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

export async function getDocuments(caseId: string, ownerId: string): Promise<LegalDocument[]> {
  try {
    const q = query(
      collection(db!, "documents"),
      where("caseId", "==", caseId),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as LegalDocument[];
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`문서 목록 조회 실패: ${error.message}`);
    }
    throw new Error("문서 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 문서를 조회합니다.
 *
 * @param id - 문서 ID
 * @returns 문서 데이터 또는 null
 */
export async function getDocument(id: string): Promise<LegalDocument | null> {
  try {
    const docSnap = await getDoc(doc(db!, "documents", id));
    if (!docSnap.exists()) {
      return null;
    }
    return { ...docSnap.data(), id: docSnap.id } as LegalDocument;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`문서 조회 실패: ${error.message}`);
    }
    throw new Error("문서 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 문서 정보를 업데이트합니다.
 *
 * @param id - 문서 ID
 * @param data - 업데이트할 필드
 */
export async function updateDocument(
  id: string,
  data: Partial<Omit<LegalDocument, "id" | "createdAt">>
): Promise<void> {
  try {
    await updateDoc(doc(db!, "documents", id), { ...data });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`문서 업데이트 실패: ${error.message}`);
    }
    throw new Error("문서 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 문서 제목을 바꿉니다. 빈 제목이면 필드를 지워 docType이 다시 제목이 된다.
 */
export async function renameDocument(id: string, title: string): Promise<void> {
  try {
    const { deleteField } = await import("firebase/firestore");
    const trimmed = title.trim();
    await updateDoc(doc(db!, "documents", id), {
      title: trimmed ? trimmed : deleteField(),
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`문서 제목 변경 실패: ${error.message}`);
    }
    throw new Error("문서 제목 변경 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 문서를 삭제합니다. (Firestore 규칙은 소유자 삭제를 허용한다)
 */
export async function deleteDocument(id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "documents", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`문서 삭제 실패: ${error.message}`);
    }
    throw new Error("문서 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Opponent Docs (상대방 서면)
// ──────────────────────────────────────────────

type CreateOpponentDocData = Omit<OpponentDoc, "id" | "createdAt">;

/**
 * 상대방 서면을 등록합니다.
 */
export async function createOpponentDoc(
  data: CreateOpponentDocData
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "opponentDocs"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`상대방 서면 등록 실패: ${error.message}`);
    }
    throw new Error("상대방 서면 등록 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 사건의 상대방 서면 목록을 조회합니다.
 *
 * @param caseId - 사건 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 */
export async function getOpponentDocs(caseId: string, ownerId: string): Promise<OpponentDoc[]> {
  try {
    const q = query(
      collection(db!, "opponentDocs"),
      where("caseId", "==", caseId),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as OpponentDoc[];
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`상대방 서면 조회 실패: ${error.message}`);
    }
    throw new Error("상대방 서면 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 상대방 서면을 삭제합니다.
 */
export async function deleteOpponentDoc(id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "opponentDocs", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`상대방 서면 삭제 실패: ${error.message}`);
    }
    throw new Error("상대방 서면 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Deadlines (사건 기한)
// ──────────────────────────────────────────────

/** 기한 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateDeadlineData = Omit<CaseDeadline, "id" | "createdAt">;

/**
 * 사건 기한을 등록합니다.
 */
export async function createDeadline(data: CreateDeadlineData): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "deadlines"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`기한 등록 실패: ${error.message}`);
    }
    throw new Error("기한 등록 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 사건의 기한 목록을 조회합니다.
 *
 * @param caseId - 사건 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 */
export async function getDeadlines(caseId: string, ownerId: string): Promise<CaseDeadline[]> {
  try {
    const q = query(
      collection(db!, "deadlines"),
      where("caseId", "==", caseId),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as CaseDeadline[];
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`기한 조회 실패: ${error.message}`);
    }
    throw new Error("기한 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 소유자의 전체 기한을 조회합니다 (통합 캘린더용 — 사건 구분 없이).
 */
export async function getAllDeadlines(ownerId: string): Promise<CaseDeadline[]> {
  try {
    const q = query(
      collection(db!, "deadlines"),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as CaseDeadline[];
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`전체 기한 조회 실패: ${error.message}`);
    }
    throw new Error("전체 기한 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사건 기한을 수정합니다.
 */
export async function updateDeadline(
  id: string,
  data: Partial<Omit<CaseDeadline, "id" | "caseId" | "ownerId" | "createdAt">>,
): Promise<void> {
  try {
    await updateDoc(doc(db!, "deadlines", id), { ...data });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`기한 수정 실패: ${error.message}`);
    }
    throw new Error("기한 수정 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사건 기한을 삭제합니다.
 */
export async function deleteDeadline(id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "deadlines", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`기한 삭제 실패: ${error.message}`);
    }
    throw new Error("기한 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Case Records (사건기록)
// ──────────────────────────────────────────────
//
// 컬렉션: case_records
// 보안 규칙: ownerId == request.auth.uid
// 관련 타입: src/types/caseRecord.ts (CaseRecord)
// 업로드 흐름: uploadCaseRecordFile(Storage) → createCaseRecord(메타) → parse API → analyze API

/** 사건기록 생성 시 필요한 데이터 (id, 타임스탬프 제외) */
type CreateCaseRecordData = Omit<CaseRecord, "id" | "uploadedAt" | "updatedAt">;

/**
 * 새 사건기록 문서를 생성합니다.
 * Storage 업로드(uploadCaseRecordFile) 직후에 호출하며, ocrStatus 는 "pending" 으로 시작.
 */
export async function createCaseRecord(
  data: CreateCaseRecordData,
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db!, "case_records"), {
      ...data,
      uploadedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건기록 등록 실패: ${error.message}`);
    }
    throw new Error("사건기록 등록 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 특정 사건의 사건기록 목록을 조회합니다.
 *
 * @param caseId - 사건 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 */
export async function getCaseRecords(
  caseId: string,
  ownerId: string,
): Promise<CaseRecord[]> {
  try {
    const q = query(
      collection(db!, "case_records"),
      where("caseId", "==", caseId),
      where("ownerId", "==", ownerId),
    );
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as CaseRecord[];
    return results.sort((a, b) => {
      const ta = a.uploadedAt?.seconds ?? 0;
      const tb = b.uploadedAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건기록 조회 실패: ${error.message}`);
    }
    throw new Error("사건기록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 단일 사건기록을 조회합니다.
 */
export async function getCaseRecord(id: string): Promise<CaseRecord | null> {
  try {
    const snap = await getDoc(doc(db!, "case_records", id));
    if (!snap.exists()) return null;
    return { ...snap.data(), id: snap.id } as CaseRecord;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건기록 조회 실패: ${error.message}`);
    }
    throw new Error("사건기록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사건기록을 부분 업데이트합니다.
 * 파싱 완료(parsedText, ocrStatus="parsed"), 분석 완료(analyzedAt, analysisSummaryId) 등에 사용.
 * updatedAt 은 서버 타임스탬프로 자동 갱신.
 */
export async function updateCaseRecord(
  id: string,
  updates: Partial<Omit<CaseRecord, "id" | "uploadedAt">>,
): Promise<void> {
  try {
    await updateDoc(doc(db!, "case_records", id), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건기록 업데이트 실패: ${error.message}`);
    }
    throw new Error("사건기록 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사건기록을 삭제합니다. (Storage 원본 파일은 호출 측에서 별도 삭제)
 */
export async function deleteCaseRecord(id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "case_records", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건기록 삭제 실패: ${error.message}`);
    }
    throw new Error("사건기록 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사건을 삭제합니다.
 *
 * (2026-09-19) 예전에는 사건 문서만 지웠다. Firestore는 문서를 지워도 그 아래
 * 서브컴렉션을 같이 지우지 않는다. 의뢰인 이름과 사건 내용이 담긴 케어 메시지가
 * 그대로 남았고, 규칙이 부모 사건을 찾지 못해 **변호사 본인도 영영 못 읽고
 * 못 지우는** 상태가 됐다. 지우려고 누른 것이 지울 수 없는 유령을 만들었다.
 * 서브컴렉션을 먼저 비우고 사건을 지운다.
 */
export async function deleteCase(caseId: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc, getDocs, collection: fsCollection } = await import(
      "firebase/firestore"
    );
    const caseRef = doc(db!, "cases", caseId);

    // 의뢰인 케어 메시지(서브컴렉션) 먼저 정리
    const careSnap = await getDocs(fsCollection(caseRef, "clientCareMessages"));
    await Promise.all(careSnap.docs.map((d) => firestoreDeleteDoc(d.ref)));

    await firestoreDeleteDoc(caseRef);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건 삭제 실패: ${error.message}`);
    }
    throw new Error("사건 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Client Care Messages (의뢰인 케어 메시지)
// ──────────────────────────────────────────────

type CreateClientCareData = Omit<ClientCareMessage, "id" | "createdAt">;

export async function createClientCareMessage(
  data: CreateClientCareData
): Promise<string> {
  try {
    const docRef = await addDoc(collection(doc(db!, "cases", data.caseId), "clientCareMessages"), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`의뢰인 케어 메시지 생성 실패: ${error.message}`);
    }
    throw new Error("의뢰인 케어 메시지 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

export async function getClientCareMessages(
  caseId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ownerId: string
): Promise<ClientCareMessage[]> {
  try {
    // 서브컬렉션 경로: /cases/{caseId}/clientCareMessages
    // ownerId 쿼리 제거 — 서브컬렉션이 이미 caseId로 격리되어 있고,
    // firestore.rules에서 사건 소유자만 접근 가능하므로 별도 필터 불필요
    const colRef = collection(doc(db!, "cases", caseId), "clientCareMessages");
    const snapshot = await getDocs(colRef);
    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as ClientCareMessage[];
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`의뢰인 케어 메시지 조회 실패: ${error.message}`);
    }
    throw new Error("의뢰인 케어 메시지 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

export async function deleteClientCareMessage(caseId: string, id: string): Promise<void> {
  try {
    const { deleteDoc: firestoreDeleteDoc } = await import("firebase/firestore");
    await firestoreDeleteDoc(doc(db!, "cases", caseId, "clientCareMessages", id));
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`의뢰인 케어 메시지 삭제 실패: ${error.message}`);
    }
    throw new Error("의뢰인 케어 메시지 삭제 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Admin (관리자 기능)
// ──────────────────────────────────────────────

/** users 컬렉션에서 status·role로 변호사 목록을 가입순으로 읽는다 (복합 색인 status+role+createdAt 사용) */
async function getLawyersByStatus(status: User["status"]): Promise<User[]> {
  const q = query(
    collection(db!, "users"),
    where("status", "==", status),
    where("role", "==", "lawyer"),
    orderBy("createdAt", "asc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({ ...docSnap.data() })) as User[];
}

/**
 * 등록번호 미검증 사용자 목록을 조회합니다 (approved 상태이면서 관리자 대조(verified)가 아직 안 된 회원).
 * verified는 색인 없이 클라이언트에서 거른다(회원 수가 적어 충분하다).
 *
 * @returns 미검증 사용자 목록 (가입순)
 */
export async function getUnverifiedUsers(): Promise<User[]> {
  try {
    const users = await getLawyersByStatus("approved");
    return users.filter((u) => u.verified !== true);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사용자 조회 실패: ${error.message}`);
    }
    throw new Error("사용자 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 승인 대기(pending) 사용자 목록 — 사업자등록증으로 변호사업이 확인되지 않았거나
 * 사업자등록증 없이 접수한 회원. 관리자가 사람이 확인해 승인·거절한다.
 */
export async function getPendingUsers(): Promise<User[]> {
  try {
    return await getLawyersByStatus("pending");
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`승인 대기 목록 조회 실패: ${error.message}`);
    }
    throw new Error("승인 대기 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/** 거절(이용 중지)된 사용자 목록 — 되돌리기용 */
export async function getRejectedUsers(): Promise<User[]> {
  try {
    return await getLawyersByStatus("rejected");
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`거절 목록 조회 실패: ${error.message}`);
    }
    throw new Error("거절 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 승인 대기 → 승인 (status: "approved"). 승인 문자는 호출부에서 이 전환 때만 보낸다.
 */
export async function approveUser(uid: string, approvedBy: string): Promise<void> {
  try {
    await updateDoc(doc(db!, "users", uid), {
      status: "approved" as const,
      approvedAt: Timestamp.now(),
      approvedBy,
      rejectedReason: null,
      rejectedAt: null,
      rejectedBy: null,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`승인 처리 실패: ${error.message}`);
    }
    throw new Error("승인 처리 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 등록번호 검증 완료 처리 (verified 필드 추가)
 */
export async function verifyUser(
  uid: string,
  verifiedBy: string
): Promise<void> {
  try {
    await updateDoc(doc(db!, "users", uid), {
      verified: true,
      verifiedAt: Timestamp.now(),
      verifiedBy,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사용자 검증 실패: ${error.message}`);
    }
    throw new Error("사용자 검증 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 가입 거절 또는 이용 중지 (status: "rejected") — 사유는 본인 로그인 화면에 그대로 보인다.
 * 계정·파일을 지우는 것이 아니다. 되돌리려면 restoreUserToPending을 쓴다.
 */
export async function rejectUser(uid: string, reason: string, rejectedBy: string): Promise<void> {
  try {
    await updateDoc(doc(db!, "users", uid), {
      status: "rejected" as const,
      rejectedReason: reason,
      rejectedAt: Timestamp.now(),
      rejectedBy,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`거절 처리 실패: ${error.message}`);
    }
    throw new Error("거절 처리 중 알 수 없는 오류가 발생했습니다.");
  }
}

/** 거절 되돌리기 — 다시 승인 대기(pending)로. 사유는 지운다. */
export async function restoreUserToPending(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db!, "users", uid), {
      status: "pending" as const,
      rejectedReason: null,
      rejectedAt: null,
      rejectedBy: null,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`되돌리기 실패: ${error.message}`);
    }
    throw new Error("되돌리기 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// Bug Reports (버그 리포트 — 관리자 조회)
// ──────────────────────────────────────────────

/** 버그 리포트 목록을 최신순으로 조회합니다. (관리자 전용) */
export async function getBugReports(): Promise<BugReport[]> {
  try {
    const snapshot = await getDocs(
      query(collection(db!, "bug_reports"), orderBy("createdAt", "desc")),
    );
    return snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as BugReport[];
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`버그 리포트 조회 실패: ${error.message}`);
    }
    throw new Error("버그 리포트 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

/** 버그 리포트 처리 상태를 변경합니다. (관리자 전용) */
export async function updateBugReportStatus(
  reportId: string,
  status: BugReport["status"],
): Promise<void> {
  try {
    await updateDoc(doc(db!, "bug_reports", reportId), { status });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`버그 리포트 상태 변경 실패: ${error.message}`);
    }
    throw new Error("버그 리포트 상태 변경 중 알 수 없는 오류가 발생했습니다.");
  }
}
