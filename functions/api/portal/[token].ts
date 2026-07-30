// 의뢰인 포털 — 공개 엔드포인트 (인증 불요, 토큰으로만 접근, 읽기 전용)
//
// 변호사가 사건별로 발급한 포털 링크로 의뢰인이 진행 상황을 열람한다.
// 서명 페이지(signing)와 같은 원칙: 서비스 계정으로 서버에서만 조회하고,
// 화면에 필요한 최소 필드만 내려준다. 쓰기 경로는 없다.
//
// GET /api/portal/{token} → { state, clientName, caseType, status, firmName,
//                             lawyerName, upcoming[], recentActivity[], careMessage }

import type { Env } from "../_shared/types";
import {
  firestoreQueryByField,
  firestoreGetDocument,
  firestoreDocumentId,
  readString,
  type FirestoreDocument,
  type FirestoreValue,
} from "../_shared/firestore";

function readBool(value: FirestoreValue | undefined): boolean {
  return !!value && "booleanValue" in value && value.booleanValue === true;
}

function readTimestampMs(value: FirestoreValue | undefined): number | null {
  if (!value || !("timestampValue" in value)) return null;
  const ms = Date.parse(value.timestampValue);
  return Number.isNaN(ms) ? null : ms;
}

/** 사건 문서의 timeline 배열에서 최근 활동 라벨만 추출 (내부 메모 detail은 노출하지 않음) */
function readTimelineLabels(
  value: FirestoreValue | undefined,
  count: number,
): Array<{ label: string; dateMs: number | null }> {
  if (!value || !("arrayValue" in value)) return [];
  const items = value.arrayValue.values ?? [];
  const parsed = items
    .map((item) => {
      if (!("mapValue" in item)) return null;
      const f = item.mapValue.fields ?? {};
      const label = readString(f.label);
      if (!label) return null;
      return { label, dateMs: readTimestampMs(f.date) };
    })
    .filter((v): v is { label: string; dateMs: number | null } => v !== null);
  return parsed.slice(-count).reverse();
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const token = context.params.token as string | undefined;
  // 토큰 형식 검증 (발급 형식: 32자 이상 hex)
  if (!token || !/^[a-f0-9]{32,64}$/.test(token)) {
    return Response.json({ state: "not-found" }, { status: 404 });
  }

  try {
    const docs = await firestoreQueryByField(
      context.env,
      "cases",
      "portalToken",
      { stringValue: token },
      1,
    );
    const caseDoc: FirestoreDocument | undefined = docs[0];
    const fields = caseDoc?.fields;
    if (!caseDoc || !fields || !readBool(fields.portalEnabled)) {
      return Response.json({ state: "not-found" }, { status: 404 });
    }

    const caseId = firestoreDocumentId(caseDoc);
    const ownerId = readString(fields.ownerId);

    // 변호사 정보 + 다가오는 기한을 병렬 조회
    // (케어 메시지는 cases 서브컬렉션이라 v1에서는 타임라인 라벨로 대신한다)
    const [userDoc, deadlineDocs] = await Promise.all([
      ownerId ? firestoreGetDocument(context.env, `users/${ownerId}`) : Promise.resolve(null),
      firestoreQueryByField(context.env, "deadlines", "caseId", { stringValue: caseId }, 50),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const upcoming = deadlineDocs
      .map((d) => ({
        title: readString(d.fields?.title) ?? "",
        dueDate: readString(d.fields?.dueDate) ?? "",
        category: readString(d.fields?.category) ?? "",
      }))
      .filter((d) => d.title && d.dueDate >= todayStr)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 3);

    return Response.json({
      state: "ok",
      clientName: readString(fields.clientName) ?? "",
      caseType: readString(fields.caseType) ?? "",
      status: readString(fields.status) ?? "진행중",
      caseNumber: readString(fields.caseNumber) ?? null,
      courtName: readString(fields.courtName) ?? null,
      firmName: readString(userDoc?.fields?.firmName) ?? "",
      lawyerName: readString(userDoc?.fields?.name) ?? "",
      upcoming,
      recentActivity: readTimelineLabels(fields.timeline, 5),
    });
  } catch (err) {
    console.error("[portal] 조회 실패:", err);
    return Response.json({ state: "error" }, { status: 500 });
  }
};
