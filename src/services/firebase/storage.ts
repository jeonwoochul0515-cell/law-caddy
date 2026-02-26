// Firebase Storage 서비스
// 녹음 파일 업로드 및 다운로드 URL 관리

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../config/firebase";

/**
 * 녹음 파일을 Firebase Storage에 업로드합니다.
 *
 * 저장 경로: recordings/{ownerId}/{caseId}/{filename}
 *
 * @param file - 업로드할 음성 파일
 * @param ownerId - 변호사 UID
 * @param caseId - 사건 ID
 * @returns 업로드된 파일의 다운로드 URL
 * @throws 업로드 실패 시 에러
 */
export async function uploadRecordingFile(
  file: File,
  ownerId: string,
  caseId: string
): Promise<string> {
  try {
    // 파일명에 타임스탬프를 추가하여 충돌 방지
    const timestamp = Date.now();
    const safeFileName = `${timestamp}_${file.name}`;
    const storagePath = `recordings/${ownerId}/${caseId}/${safeFileName}`;
    const storageRef = ref(storage!, storagePath);

    // 파일 업로드
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || "audio/webm",
    });

    // 다운로드 URL 생성
    const downloadUrl = await getDownloadURL(snapshot.ref);

    return downloadUrl;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const storageError = error as Error & { code?: string };
      switch (storageError.code) {
        case "storage/unauthorized":
          throw new Error(
            "파일 업로드 권한이 없습니다. 로그인 상태를 확인하세요."
          );
        case "storage/canceled":
          throw new Error("파일 업로드가 취소되었습니다.");
        case "storage/quota-exceeded":
          throw new Error(
            "저장 용량이 초과되었습니다. 관리자에게 문의하세요."
          );
        case "storage/invalid-argument":
          throw new Error("잘못된 파일입니다. 다른 파일을 선택하세요.");
        case "storage/retry-limit-exceeded":
          throw new Error(
            "업로드 재시도 횟수를 초과했습니다. 네트워크를 확인 후 다시 시도하세요."
          );
        default:
          throw new Error(`파일 업로드 실패: ${error.message}`);
      }
    }
    throw new Error("파일 업로드 중 알 수 없는 오류가 발생했습니다.");
  }
}
