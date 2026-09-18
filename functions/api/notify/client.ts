// 의뢰인에게 문자(SMS/LMS)를 발송하는 엔드포인트 — 서명 링크·케어 메시지 전달용
//
// POST /api/notify/client
// Body: { caseId: string, text: string }
// Auth: Firebase JWT (미들웨어에서 검증) + 유료 플랜 필수 (발송 비용 발생)
//
// ⚠️ 수신번호는 클라이언트가 정하지 않는다.
//
// (2026-09-19) 예전에는 body.to를 그대로 받아 형식과 길이만 보고 보냈다.
// "이 번호가 이 사건의 의뢰인인가"를 아무도 묻지 않았다. 발신번호는 모든
// 사무소가 함께 쓰는 하나뿐이라, 악용으로 그 번호가 정지되면 전체 사무소의
// 문자가 한꺼번에 멈춘다. 같은 제품의 승인 문자(notify/approved.ts)는
// 이미 서버가 번호를 직접 조회하며 "릴레이 악용 방지"라고 적어 두었는데
// 이쪽만 빠져 있었다.
//
// 지금은 caseId를 받아 서버가 (1) 그 사건이 호출자 소유인지 확인하고
// (2) 사건에 저장된 clientPhone으로만 보낸다. 번호를 바꾸려면 화면에서
// 사건 정보를 먼저 고쳐야 하고, 그 수정은 firestore.rules가 소유자로 막는다.

import type { Env } from "../_shared/types";
import { firestoreGetDocument, readString } from "../_shared/firestore";
import { sendSms } from "../_shared/solapi";
import { requirePaidPlan } from "../_shared/plan";

/** 한국 휴대폰 번호 (숫자만, 010/011/016/017/018/019) */
const PHONE_RE = /^01[016789]\d{7,8}$/;

/** LMS 한도(2,000바이트·한글 약 1,000자)를 넘지 않도록 여유를 둔 상한 */
const MAX_TEXT_LENGTH = 900;

// per-isolate 남용 방지: uid당 시간당 발송 상한
const HOURLY_LIMIT = 30;
const WINDOW_MS = 60 * 60 * 1000;
const sendLog = new Map<string, number[]>();

function checkSendLimit(uid: string): boolean {
  const now = Date.now();
  const timestamps = (sendLog.get(uid) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= HOURLY_LIMIT) return false;
  timestamps.push(now);
  sendLog.set(uid, timestamps);
  return true;
}

interface NotifyClientRequest {
  caseId?: string;
  text?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const uid = (context.data as Record<string, unknown>).uid as string | undefined;
  if (!uid) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const denied = await requirePaidPlan(context.env, uid);
  if (denied) return denied;

  let body: NotifyClientRequest;
  try {
    body = (await context.request.json()) as NotifyClientRequest;
  } catch {
    return Response.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const caseId = (body.caseId ?? "").trim();
  const text = (body.text ?? "").trim();

  if (!caseId) {
    return Response.json({ error: "사건을 찾을 수 없습니다." }, { status: 400 });
  }
  if (!text) {
    return Response.json({ error: "발송할 내용이 없습니다." }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      { error: `문자 내용이 너무 깁니다. (최대 ${MAX_TEXT_LENGTH}자, 현재 ${text.length}자)` },
      { status: 400 },
    );
  }
  if (!checkSendLimit(uid)) {
    return Response.json(
      { error: "발송 한도를 초과했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  // 사건을 서버에서 직접 읽어 소유권과 수신번호를 확인한다
  const caseDoc = await firestoreGetDocument(context.env, `cases/${caseId}`);
  if (!caseDoc) {
    return Response.json({ error: "사건을 찾을 수 없습니다." }, { status: 404 });
  }
  if (readString(caseDoc.fields?.ownerId) !== uid) {
    return Response.json({ error: "이 사건에 문자를 보낼 권한이 없습니다." }, { status: 403 });
  }

  const to = (readString(caseDoc.fields?.clientPhone) ?? "").replace(/\D/g, "");
  if (!PHONE_RE.test(to)) {
    return Response.json(
      { error: "사건에 저장된 의뢰인 휴대폰 번호가 없거나 형식이 올바르지 않습니다. 사건 정보에서 번호를 먼저 저장해 주세요." },
      { status: 400 },
    );
  }

  try {
    await sendSms(context.env, to, text);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[notify/client] 발송 실패:", err);
    return Response.json({ error: "문자 발송에 실패했습니다." }, { status: 502 });
  }
};
