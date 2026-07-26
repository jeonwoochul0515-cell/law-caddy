// 전자 서명 요청 Firestore CRUD 서비스

// 의뢰인(미인증) 측 조회·서명은 여기 없다. /api/signing/{token} 서버 엔드포인트가
// 서비스 계정으로 처리한다. Firestore 규칙에서 미인증 접근을 막았기 때문에
// 클라이언트에서 토큰으로 조회하던 코드는 이제 동작하지 않는다.

import {
  collection,
  doc,
  setDoc,
  query,
  where,
  getDocs,
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
