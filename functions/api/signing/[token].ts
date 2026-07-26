// 전자계약 서명 — 공개 엔드포인트 (인증 불요, 토큰으로만 접근)
//
// 왜 서버로 옮겼는가:
//   이전에는 브라우저가 Firestore를 직접 쿼리했고, 규칙이 `allow read, update: if true`였다.
//   토큰 검증은 앱 코드(where("token","==",...))에만 있었으므로, Firestore REST API를
//   직접 치면 signing_requests 컬렉션 전체를 읽고 수정할 수 있었다.
//   수임계약서 전문·의뢰인 정보가 노출되고, 제3자가 남의 계약을 서명 완료 처리할 수도 있었다.
//
//   이제 서비스 계정으로 서버에서만 조회/수정하고, 클라이언트에는 화면에 필요한 필드만 준다.
//   규칙에서는 소유 변호사와 관리자 외 접근을 전부 막는다.
//
// GET  /api/signing/{token}  → 계약서 조회
// POST /api/signing/{token}  → 서명 완료 { signatureDataUrl, userAgent }

import type { Env } from "../_shared/types";
import {
  firestoreQueryByField,
  firestoreGetDocument,
  firestorePatchDocument,
  firestoreDocumentId,
  readString,
  readMap,
  type FirestoreDocument,
  type FirestoreValue,
} from "../_shared/firestore";

/** 서명 이미지 상한 (data URL 기준) — 과도한 페이로드 차단 */
const MAX_SIGNATURE_BYTES = 2_000_000;

function readTimestampMs(value: FirestoreValue | undefined): number | null {
  if (!value || !("timestampValue" in value)) return null;
  const ms = Date.parse(value.timestampValue);
  return Number.isNaN(ms) ? null : ms;
}

/** 토큰으로 서명 요청 문서를 찾습니다. */
async function findByToken(
  env: Env,
  token: string,
): Promise<FirestoreDocument | null> {
  const docs = await firestoreQueryByField(
    env,
    "signing_requests",
    "token",
    { stringValue: token },
    1,
  );
  return docs[0] ?? null;
}

/** 변호사 이름/사무소명을 조회합니다 (서명 페이지 표시용). */
async function readLawyerInfo(
  env: Env,
  ownerId: string | undefined,
): Promise<{ firmName: string; lawyerName: string }> {
  if (!ownerId) return { firmName: "", lawyerName: "" };
  try {
    const userDoc = await firestoreGetDocument(env, `users/${ownerId}`);
    const fields = userDoc?.fields ?? {};
    return {
      firmName: readString(fields.firmName) ?? "",
      lawyerName: readString(fields.name) ?? "",
    };
  } catch {
    return { firmName: "", lawyerName: "" };
  }
}

// ──────────────────────────────────────────────
// GET — 계약서 조회
// ──────────────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const token = context.params.token as string | undefined;
  if (!token) {
    return Response.json({ state: "not-found" }, { status: 404 });
  }

  try {
    const doc = await findByToken(context.env, token);
    if (!doc) {
      return Response.json({ state: "not-found" }, { status: 404 });
    }

    const fields = doc.fields ?? {};
    const status = readString(fields.status) ?? "pending";
    const expiresAtMs = readTimestampMs(fields.expiresAt);
    const signedAtMs = readTimestampMs(fields.signedAt);
    const ownerId = readString(fields.ownerId);

    const expired =
      status === "expired" || (expiresAtMs !== null && expiresAtMs < Date.now());

    // 만료됐는데 아직 pending이면 상태를 정리해 둔다
    if (expired && status === "pending") {
      await firestorePatchDocument(context.env, `signing_requests/${firestoreDocumentId(doc)}`, {
        status: { stringValue: "expired" },
      }).catch(() => { /* 정리 실패는 조회를 막지 않는다 */ });
    }

    const { firmName, lawyerName } = await readLawyerInfo(context.env, ownerId);

    // 서명 완료·만료 상태에서는 계약서 본문을 굳이 내려주지 않는다
    const state = status === "signed" ? "already-signed" : expired ? "expired" : "ready";

    return Response.json({
      state,
      clientName: readString(fields.clientName) ?? "",
      contractText: state === "ready" ? readString(fields.contractText) ?? "" : "",
      signedAt: signedAtMs !== null ? new Date(signedAtMs).toISOString() : null,
      firmName,
      lawyerName,
    });
  } catch (error) {
    return Response.json(
      {
        state: "error",
        error: "계약서 조회 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};

// ──────────────────────────────────────────────
// POST — 서명 완료
// ──────────────────────────────────────────────

interface SignRequestBody {
  signatureDataUrl?: string;
  userAgent?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const token = context.params.token as string | undefined;
  if (!token) {
    return Response.json({ error: "유효하지 않은 서명 링크입니다." }, { status: 404 });
  }

  try {
    const body = (await context.request.json()) as SignRequestBody;
    const signatureDataUrl = body.signatureDataUrl ?? "";

    if (!signatureDataUrl.startsWith("data:image/")) {
      return Response.json({ error: "서명 이미지가 올바르지 않습니다." }, { status: 400 });
    }
    if (signatureDataUrl.length > MAX_SIGNATURE_BYTES) {
      return Response.json({ error: "서명 이미지가 너무 큽니다." }, { status: 413 });
    }

    const doc = await findByToken(context.env, token);
    if (!doc) {
      return Response.json({ error: "유효하지 않은 서명 링크입니다." }, { status: 404 });
    }

    const fields = doc.fields ?? {};
    const status = readString(fields.status) ?? "pending";
    const expiresAtMs = readTimestampMs(fields.expiresAt);

    if (status === "signed") {
      return Response.json({ error: "이미 서명이 완료된 계약서입니다." }, { status: 409 });
    }
    if (status === "expired" || (expiresAtMs !== null && expiresAtMs < Date.now())) {
      return Response.json({ error: "서명 기한이 만료되었습니다." }, { status: 410 });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    // Cloudflare가 넣어주는 실제 접속 IP — 클라이언트가 보낸 값을 믿지 않는다
    const ip = context.request.headers.get("CF-Connecting-IP") ?? "unknown";
    const userAgent = (body.userAgent ?? "").slice(0, 500);

    // 기존 auditTrail을 보존하며 병합 (patch는 map 전체를 덮어쓰므로 직접 합친다)
    const existingAudit = readMap(fields.auditTrail);
    const mergedAudit: Record<string, FirestoreValue> = {
      ...existingAudit,
      signedAt: { stringValue: nowIso },
      signerIp: { stringValue: ip },
      signerUserAgent: { stringValue: userAgent },
    };

    await firestorePatchDocument(
      context.env,
      `signing_requests/${firestoreDocumentId(doc)}`,
      {
        status: { stringValue: "signed" },
        signedAt: { timestampValue: nowIso },
        signatureDataUrl: { stringValue: signatureDataUrl },
        auditTrail: { mapValue: { fields: mergedAudit } },
      },
    );

    return Response.json({ success: true, signedAt: nowIso });
  } catch (error) {
    return Response.json(
      {
        error: "서명 처리 중 오류가 발생했습니다.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
