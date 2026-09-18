// Firebase Storage 서비스
// 파일 업로드 및 다운로드 URL 관리

import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../../config/firebase";

/** Storage 오류 코드를 한국어 문장으로 바꾼다 */
function describeStorageError(error: unknown, action: string): Error {
  if (error instanceof Error) {
    const storageError = error as Error & { code?: string };
    switch (storageError.code) {
      case "storage/unauthorized":
        return new Error(`${action} 권한이 없습니다. 로그인 상태를 확인하세요.`);
      case "storage/canceled":
        return new Error(`${action}이 취소되었습니다.`);
      case "storage/quota-exceeded":
        return new Error("저장 용량이 초과되었습니다. 관리자에게 문의하세요.");
      case "storage/invalid-argument":
        return new Error("잘못된 파일입니다. 다른 파일을 선택하세요.");
      case "storage/retry-limit-exceeded":
        return new Error(`${action} 재시도 횟수를 초과했습니다. 네트워크를 확인 후 다시 시도하세요.`);
      case "storage/object-not-found":
        return new Error("파일이 이미 지워졌거나 찾을 수 없습니다.");
      default:
        return new Error(`${action} 실패: ${error.message}`);
    }
  }
  return new Error(`${action} 중 알 수 없는 오류가 발생했습니다.`);
}

/**
 * 녹음 파일을 Firebase Storage에 업로드합니다.
 *
 * 저장 경로: recordings/{ownerId}/{caseId}/{filename}
 *
 * @param file - 업로드할 음성 파일
 * @param ownerId - 변호사 UID
 * @param caseId - 사건 ID
 * @param onProgress - 진행률(0~100) 콜백 — 큰 파일에서 "업로드 중..."만 보이던 것을 고친다(r1-03-10)
 * @returns 업로드된 파일의 다운로드 URL
 * @throws 업로드 실패 시 에러
 */
export async function uploadRecordingFile(
  file: File,
  ownerId: string,
  caseId: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  try {
    // 파일명에 타임스탬프를 추가하여 충돌 방지
    const timestamp = Date.now();
    const safeFileName = `${timestamp}_${file.name}`;
    const storagePath = `recordings/${ownerId}/${caseId}/${safeFileName}`;
    const storageRef = ref(storage!, storagePath);
    const metadata = { contentType: file.type || "application/octet-stream" };

    if (!onProgress) {
      const snapshot = await uploadBytes(storageRef, file, metadata);
      return await getDownloadURL(snapshot.ref);
    }

    const task = uploadBytesResumable(storageRef, file, metadata);
    await new Promise<void>((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          if (snap.totalBytes > 0) {
            onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
          }
        },
        reject,
        () => resolve(),
      );
    });
    return await getDownloadURL(task.snapshot.ref);
  } catch (error: unknown) {
    throw describeStorageError(error, "파일 업로드");
  }
}

/**
 * Storage에 올린 녹음·첨부 파일을 지웁니다.
 * 다운로드 URL(https://firebasestorage...) 그대로 넘기면 된다.
 * 이미 없는 파일이면 성공으로 본다 — Firestore 문서만 남아 있던 경우를 위해.
 */
export async function deleteRecordingFile(fileUrl: string): Promise<void> {
  if (!fileUrl) return;
  try {
    await deleteObject(ref(storage!, fileUrl));
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === "storage/object-not-found") return;
    throw describeStorageError(error, "파일 삭제");
  }
}

/**
 * 상대방 서면 파일을 Firebase Storage에 업로드합니다.
 *
 * 저장 경로: opponent-docs/{ownerId}/{caseId}/{filename}
 */
export async function uploadOpponentDocFile(
  file: File,
  ownerId: string,
  caseId: string
): Promise<string> {
  try {
    const timestamp = Date.now();
    const safeFileName = `${timestamp}_${file.name}`;
    const storagePath = `opponent-docs/${ownerId}/${caseId}/${safeFileName}`;
    const storageRef = ref(storage!, storagePath);

    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || "application/octet-stream",
    });

    return await getDownloadURL(snapshot.ref);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`상대방 서면 업로드 실패: ${error.message}`);
    }
    throw new Error("상대방 서면 업로드 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 사건기록 PDF를 Firebase Storage에 업로드합니다.
 *
 * 저장 경로: case-records/{ownerId}/{caseId}/{timestamp}_{filename}
 *
 * 업로드 후 반환된 downloadUrl 을 createCaseRecord 의 storageUrl 필드에 넣어
 * Firestore `case_records` 문서를 생성한다. (분리된 두 단계)
 */
export async function uploadCaseRecordFile(
  file: File,
  ownerId: string,
  caseId: string,
): Promise<string> {
  try {
    const timestamp = Date.now();
    const safeFileName = `${timestamp}_${file.name}`;
    const storagePath = `case-records/${ownerId}/${caseId}/${safeFileName}`;
    const storageRef = ref(storage!, storagePath);

    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || "application/pdf",
    });

    return await getDownloadURL(snapshot.ref);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`사건기록 업로드 실패: ${error.message}`);
    }
    throw new Error("사건기록 업로드 중 알 수 없는 오류가 발생했습니다.");
  }
}
