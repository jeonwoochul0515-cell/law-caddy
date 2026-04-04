// 전자 서명 요청 Firestore CRUD 서비스

import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  query,
  where,
  getDocs,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import type { SigningRequest } from "../../types/signing";

const COLLECTION = "signing_requests";

// ──────────────────────────────────────────────
// 서명 요청 생성
// ──────────────────────────────────────────────

/**
 * 서명 요청을 생성합니다.
 *
 * @param data - 서명 요청 데이터 (id, createdAt 자동 생성)
 * @returns 생성된 문서 ID
 */
export async function createSigningRequest(
  data: Omit<SigningRequest, "id" | "createdAt">
): Promise<string> {
  try {
    const docRef = doc(collection(db!, COLLECTION));
    await setDoc(docRef, {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`서명 요청 생성 실패: ${error.message}`);
    }
    throw new Error("서명 요청 생성 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// 토큰으로 서명 요청 조회 (공개)
// ──────────────────────────────────────────────

/**
 * 토큰으로 서명 요청을 조회합니다 (서명 페이지에서 사용).
 * 만료된 요청은 null을 반환합니다.
 *
 * @param token - 고유 서명 URL 토큰
 * @returns 서명 요청 데이터 또는 null
 */
export async function getSigningRequestByToken(
  token: string
): Promise<SigningRequest | null> {
  try {
    const q = query(
      collection(db!, COLLECTION),
      where("token", "==", token)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];
    const data = { ...docSnap.data(), id: docSnap.id } as SigningRequest;

    // 만료 확인
    if (data.expiresAt && data.expiresAt.toMillis() < Date.now()) {
      // 만료된 경우 상태 업데이트
      if (data.status === "pending") {
        await updateDoc(doc(db!, COLLECTION, docSnap.id), {
          status: "expired",
        });
      }
      return null;
    }

    return data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`서명 요청 조회 실패: ${error.message}`);
    }
    throw new Error("서명 요청 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// 서명 완료 처리
// ──────────────────────────────────────────────

/**
 * 서명을 완료 처리합니다.
 *
 * @param id - 서명 요청 문서 ID
 * @param signatureDataUrl - 서명 이미지 Data URL
 * @param auditData - 감사 추적 데이터 (IP, User-Agent)
 */
export async function completeSigningRequest(
  id: string,
  signatureDataUrl: string,
  auditData: { ip: string; userAgent: string }
): Promise<void> {
  try {
    const docRef = doc(db!, COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("서명 요청을 찾을 수 없습니다.");
    }

    const existing = docSnap.data();
    const now = new Date().toISOString();

    await updateDoc(docRef, {
      status: "signed",
      signedAt: Timestamp.now(),
      signatureDataUrl,
      auditTrail: {
        ...(existing.auditTrail ?? {}),
        signedAt: now,
        signerIp: auditData.ip,
        signerUserAgent: auditData.userAgent,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`서명 완료 처리 실패: ${error.message}`);
    }
    throw new Error("서명 완료 처리 중 알 수 없는 오류가 발생했습니다.");
  }
}

// ──────────────────────────────────────────────
// 사건별 서명 요청 목록 조회
// ──────────────────────────────────────────────

/**
 * 특정 사건의 서명 요청 목록을 조회합니다.
 *
 * @param caseId - 사건 ID
 * @param ownerId - 변호사 UID (Firestore 보안 규칙 충족용)
 * @returns 서명 요청 목록 (최신순)
 */
export async function getSigningRequestsByCase(
  caseId: string,
  ownerId: string
): Promise<SigningRequest[]> {
  try {
    const q = query(
      collection(db!, COLLECTION),
      where("caseId", "==", caseId),
      where("ownerId", "==", ownerId)
    );
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as SigningRequest[];

    // 복합 인덱스 없이 메모리에서 최신순 정렬
    return results.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`서명 요청 목록 조회 실패: ${error.message}`);
    }
    throw new Error("서명 요청 목록 조회 중 알 수 없는 오류가 발생했습니다.");
  }
}
