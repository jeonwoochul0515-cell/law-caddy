// 추출된 텍스트를 Firebase Storage에 .txt로 저장
// PDF/이미지 OCR 완료 후 호출 — 사건 상세의 첨부파일에서 확인 가능

import { getAuth } from "firebase/auth";

/**
 * 추출된 텍스트를 Firebase Storage에 저장하고 Firestore recordings에 기록합니다.
 * caseId가 없어도 항상 저장하여 나중에 확인 가능.
 */
export async function saveExtractedText(
  text: string,
  clientName: string,
  caseId?: string,
): Promise<string | null> {
  try {
    const auth = getAuth();
    const uid = auth.currentUser?.uid;
    if (!uid || !text.trim()) return null;

    const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
    const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
    const { storage, db } = await import("../config/firebase");
    if (!storage || !db) return null;

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const fileName = `${clientName}_OCR추출_${dateStr}.txt`;

    // 헤더 + 본문
    const header = [
      `=== LAW-CADDY OCR 추출 텍스트 ===`,
      `의뢰인: ${clientName}`,
      `추출일시: ${now.toLocaleString("ko-KR")}`,
      caseId ? `사건 ID: ${caseId}` : "",
      `==================================`,
      "",
    ].filter(Boolean).join("\n");

    const fullText = header + text;
    const blob = new Blob([fullText], { type: "text/plain; charset=utf-8" });

    // Firebase Storage 업로드
    const path = caseId
      ? `extracted-texts/${uid}/${caseId}/${fileName}`
      : `extracted-texts/${uid}/${fileName}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    const downloadUrl = await getDownloadURL(storageRef);

    // Firestore recordings에 항상 기록 (사건 상세 첨부파일에서 확인 가능)
    await addDoc(collection(db, "recordings"), {
      caseId: caseId || null,
      ownerId: uid,
      fileName,
      fileUrl: downloadUrl,
      fileSizeMB: +(blob.size / (1024 * 1024)).toFixed(2),
      fileType: "ocr-text",
      sttStatus: "completed",
      transcript: text.slice(0, 1000) + (text.length > 1000 ? "\n... (이하 생략)" : ""),
      createdAt: serverTimestamp(),
    });

    console.log(`[파일 저장] ${fileName} → ${downloadUrl}`);
    return downloadUrl;
  } catch (err) {
    console.error("[파일 저장] 실패:", err);
    return null;
  }
}
