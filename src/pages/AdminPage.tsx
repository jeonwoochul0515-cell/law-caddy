import { useEffect, useState } from "react";
import { Check, X, ExternalLink, Loader2 } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { getPendingUsers, approveUser, rejectUser } from "../services/firebase/firestore";
import { isDemoMode, DEMO_ADMIN_PENDING_USERS } from "../config/demo";
import type { User } from "../types/user";

export default function AdminPage() {
  const currentUser = useAuth((s) => s.user);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    // 데모 모드: 목 대기 사용자 목록 사용
    if (isDemoMode) {
      setPendingUsers([...DEMO_ADMIN_PENDING_USERS]);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      try {
        const users = await getPendingUsers();
        setPendingUsers(users);
      } catch (err) {
        console.error("대기 사용자 로딩 실패:", err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const handleApprove = async (uid: string) => {
    if (!currentUser) return;
    setProcessing(uid);
    try {
      if (isDemoMode) {
        // 데모 모드: 로컬 상태에서만 제거
        setPendingUsers((prev) => prev.filter((u) => u.uid !== uid));
      } else {
        await approveUser(uid, currentUser.uid);
        setPendingUsers((prev) => prev.filter((u) => u.uid !== uid));
      }
    } catch (err) {
      console.error("승인 실패:", err);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (uid: string) => {
    setProcessing(uid);
    try {
      if (isDemoMode) {
        // 데모 모드: 로컬 상태에서만 제거
        setPendingUsers((prev) => prev.filter((u) => u.uid !== uid));
      } else {
        await rejectUser(uid);
        setPendingUsers((prev) => prev.filter((u) => u.uid !== uid));
      }
    } catch (err) {
      console.error("거부 실패:", err);
    } finally {
      setProcessing(null);
    }
  };

  if (currentUser?.role !== "admin") {
    return (
      <AppLayout title="관리자" subtitle="">
        <div className="text-center py-16 text-text-dim">관리자 권한이 필요합니다.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="관리자" subtitle="가입 승인 관리">
      <div className="max-w-3xl">
        <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-text-primary">승인 대기 ({pendingUsers.length})</h3>
            <a
              href="https://m.koreanbar.or.kr/pages/search/search.asp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-gold hover:text-gold-bright transition-colors"
            >
              대한변협 조회
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {loading ? (
            <div className="p-8 text-center text-text-dim">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              로딩 중...
            </div>
          ) : pendingUsers.length === 0 ? (
            <div className="p-8 text-center text-text-dim">
              대기 중인 가입 요청이 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pendingUsers.map((u) => (
                <div key={u.uid} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-text-primary font-medium">{u.name}</p>
                    <p className="text-sm text-text-dim">
                      {u.firmName} · 등록번호: {u.barLicenseNumber}
                    </p>
                    <p className="text-xs text-text-dim mt-0.5">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {processing === u.uid ? (
                      <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
                    ) : (
                      <>
                        <button
                          onClick={() => handleApprove(u.uid)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 text-success border border-success/30 rounded-lg text-sm hover:bg-success/20 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          승인
                        </button>
                        <button
                          onClick={() => handleReject(u.uid)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 text-error border border-error/30 rounded-lg text-sm hover:bg-error/20 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          거부
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
