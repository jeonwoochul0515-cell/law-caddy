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
  Timestamp,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import type { Case } from "../../types/case";
import type { Recording } from "../../types/recording";
import type { LegalDocument } from "../../types/document";
import type { User } from "../../types/user";

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
 * @returns 녹음 목록 (최신순)
 */
export async function getRecordings(caseId: string): Promise<Recording[]> {
  try {
    const q = query(
      collection(db!, "recordings"),
      where("caseId", "==", caseId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as Recording[];
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
 * @returns 문서 목록 (최신순)
 */
export async function getDocuments(caseId: string): Promise<LegalDocument[]> {
  try {
    const q = query(
      collection(db!, "documents"),
      where("caseId", "==", caseId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as LegalDocument[];
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

// ──────────────────────────────────────────────
// Admin (관리자 기능)
// ──────────────────────────────────────────────

/**
 * 등록번호 미검증 사용자 목록을 조회합니다 (approved 상태, 검증 미완료).
 *
 * @returns 미검증 사용자 목록 (가입순)
 */
export async function getUnverifiedUsers(): Promise<User[]> {
  try {
    const q = query(
      collection(db!, "users"),
      where("status", "==", "approved"),
      where("role", "==", "lawyer"),
      orderBy("createdAt", "asc")
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
    })) as User[];
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사용자 조회 실패: ${error.message}`);
    }
    throw new Error("사용자 조회 중 알 수 없는 오류가 발생했습니다.");
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
 * 등록번호 불일치 → 사용자 탈퇴 (status: "rejected")
 */
export async function deactivateUser(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db!, "users", uid), {
      status: "rejected" as const,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사용자 탈퇴 실패: ${error.message}`);
    }
    throw new Error("사용자 탈퇴 중 알 수 없는 오류가 발생했습니다.");
  }
}
