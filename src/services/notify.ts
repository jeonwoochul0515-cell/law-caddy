// 관리자 알림 서비스 (SOLAPI SMS)
import { authHeaders } from "./api-auth";
import { API_BASE } from "./apiBase";

/**
 * 신규 가입 완료를 관리자에게 문자로 알립니다.
 * fire-and-forget: 실패해도 회원가입 플로우를 막지 않도록 호출하는 쪽에서 await 없이 사용해도 됩니다.
 */
export async function notifySignup(params: { name?: string; firmName?: string }): Promise<void> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    await fetch(`${API_BASE}/api/notify/signup`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
  } catch {
    // 알림 실패는 무시 — 회원가입 자체는 이미 완료된 상태
  }
}

/**
 * 가입 승인 완료를 해당 사용자에게 문자로 알립니다. (관리자 전용 — 서버에서 role 재확인)
 * fire-and-forget: 실패해도 승인 처리 자체는 유지됩니다.
 */
export async function notifyApproved(uid: string): Promise<void> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    await fetch(`${API_BASE}/api/notify/approved`, {
      method: "POST",
      headers,
      body: JSON.stringify({ uid }),
    });
  } catch {
    // 알림 실패는 무시 — 승인 자체는 이미 완료된 상태
  }
}

/**
 * 플랜 만료 임박 문자 발송을 요청합니다. 발송 조건·중복 방지는 서버가 판정하므로
 * 만료 배너가 뜰 때 fire-and-forget으로 호출하면 됩니다.
 */
export async function notifyPlanExpiry(): Promise<void> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    await fetch(`${API_BASE}/api/notify/expiry`, { method: "POST", headers });
  } catch {
    // 알림 실패는 무시 — 배너는 계속 표시됨
  }
}

/**
 * 의뢰인에게 문자를 발송합니다 (서명 링크·케어 메시지 전달용).
 * 관리자 알림과 달리 사용자가 버튼으로 명시 발송하므로 실패를 그대로 throw합니다.
 * @param to 휴대폰 번호 (하이픈 있어도 됨 — 서버에서 정규화)
 */
export async function sendClientSms(to: string, text: string): Promise<void> {
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const resp = await fetch(`${API_BASE}/api/notify/client`, {
    method: "POST",
    headers,
    body: JSON.stringify({ to, text }),
  });
  if (!resp.ok) {
    const data = (await resp.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `문자 발송 실패 (HTTP ${resp.status})`);
  }
}

/**
 * 신규 버그 리포트 접수를 관리자에게 문자로 알립니다.
 * fire-and-forget: 실패해도 버그 리포트 저장 자체는 유지됩니다.
 */
export async function notifyBugReport(params: {
  page: string;
  reporterName?: string;
  snippet: string;
}): Promise<void> {
  try {
    const headers = await authHeaders({ "Content-Type": "application/json" });
    await fetch(`${API_BASE}/api/notify/bug`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
  } catch {
    // 알림 실패는 무시
  }
}
