import { useEffect, useState } from "react";
import { ExternalLink, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { getUnverifiedUsers, verifyUser, deactivateUser } from "../services/firebase/firestore";
import { isDemoMode, DEMO_ADMIN_PENDING_USERS } from "../config/demo";
import type { User } from "../types/user";

export default function AdminPage() {
  const currentUser = useAuth((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      setUsers([...DEMO_ADMIN_PENDING_USERS]);
      setLoading(false);
      return;
    }

    const fetchUsers = async () => {
      try {
        const result = await getUnverifiedUsers();
        setUsers(result);
      } catch (err) {
        console.error("사용자 목록 로딩 실패:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const handleVerify = async (uid: string) => {
    if (!currentUser) return;
    setProcessing(uid);
    try {
      if (isDemoMode) {
        setUsers((prev) => prev.filter((u) => u.uid !== uid));
      } else {
        await verifyUser(uid, currentUser.uid);
        setUsers((prev) => prev.filter((u) => u.uid !== uid));
      }
    } catch (err) {
      console.error("검증 실패:", err);
    } finally {
      setProcessing(null);
    }
  };

  const handleDeactivate = async (uid: string) => {
    if (!confirm("등록번호가 확인되지 않는 사용자입니다. 탈퇴 처리하시겠습니까?")) return;
    setProcessing(uid);
    try {
      if (isDemoMode) {
        setUsers((prev) => prev.filter((u) => u.uid !== uid));
      } else {
        await deactivateUser(uid);
        setUsers((prev) => prev.filter((u) => u.uid !== uid));
      }
    } catch (err) {
      console.error("탈퇴 실패:", err);
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
    <AppLayout title="관리자" subtitle="변호사 등록번호 검증">
      <div className="max-w-3xl">
        {/* 안내 배너 */}
        <div className="bg-gold-dim border border-gold/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-gold-bright">
            회원가입 시 즉시 서비스 이용이 가능합니다. 관리자는 변호사 등록번호를 확인 후
            검증 완료하거나, 등록번호가 일치하지 않는 경우 탈퇴 처리합니다.
          </p>
        </div>

        <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-text-primary">미검증 사용자 ({users.length})</h3>
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
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-text-dim">
              미검증 사용자가 없습니다. 모든 사용자가 검증 완료되었습니다.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {users.map((u) => (
                <div key={u.uid} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-text-primary font-medium">{u.name}</p>
                    <p className="text-sm text-text-dim">
                      {u.firmName} · 등록번호: <span className="text-gold font-mono">{u.barLicenseNumber}</span>
                    </p>
                    <p className="text-xs text-text-dim mt-0.5">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {processing === u.uid ? (
                      <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
                    ) : (
                      <>
                        <button
                          onClick={() => handleVerify(u.uid)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 text-success border border-success/30 rounded-lg text-sm hover:bg-success/20 transition-colors"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          검증 완료
                        </button>
                        <button
                          onClick={() => handleDeactivate(u.uid)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 text-error border border-error/30 rounded-lg text-sm hover:bg-error/20 transition-colors"
                        >
                          <ShieldX className="w-4 h-4" />
                          탈퇴
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
