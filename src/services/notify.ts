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
