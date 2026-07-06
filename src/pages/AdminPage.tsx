import { useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  ShieldCheck,
  ShieldX,
  Search,
  Users,
  CheckCircle,
  Copy,
  Check,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { getUnverifiedUsers, verifyUser, deactivateUser } from "../services/firebase/firestore";
import { notifyApproved } from "../services/notify";
import { isDemoMode, DEMO_ADMIN_PENDING_USERS } from "../config/demo";
import type { User } from "../types/user";

export default function AdminPage() {
  const currentUser = useAuth((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

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
        // 승인 완료 문자 알림 (fire-and-forget — 실패해도 승인은 유지)
        notifyApproved(uid);
      }
      setVerifiedCount((c) => c + 1);
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

  const handleCopyLicense = async (license: string, uid: string) => {
    try {
      await navigator.clipboard.writeText(license);
      setCopiedUid(uid);
      setTimeout(() => setCopiedUid(null), 2000);
    } catch {
      // 복사 실패 무시
    }
  };

  const searchLower = search.toLowerCase();
  const filtered = users.filter((u) =>
    (u.name ?? "").toLowerCase().includes(searchLower) ||
    (u.firmName ?? "").toLowerCase().includes(searchLower) ||
    (u.barLicenseNumber ?? "").includes(search) ||
    (u.email ?? "").toLowerCase().includes(searchLower)
  );

  if (currentUser?.role !== "admin") {
    return (
      <AppLayout title="관리자" subtitle="">
        <div className="text-center py-16 text-text-dim">관리자 권한이 필요합니다.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="관리자" subtitle="변호사 등록번호 검증">
      <div className="max-w-3xl space-y-6">
        {/* 통계 카드 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface border border-border rounded-2xl p-4">
            <Users className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-text-primary">{users.length}</p>
            <p className="text-xs text-text-dim">미검증 사용자</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-4">
            <CheckCircle className="w-5 h-5 text-success mb-2" />
            <p className="text-2xl font-bold text-text-primary">{verifiedCount}</p>
            <p className="text-xs text-text-dim">이번 세션 검증 완료</p>
          </div>
        </div>

        {/* 안내 배너 */}
        <div className="bg-gold-dim border border-gold/20 rounded-xl p-4">
          <p className="text-sm text-gold-bright mb-2">
            회원가입 시 즉시 서비스 이용이 가능합니다. 관리자는 변호사 등록번호를 확인 후
            검증 완료하거나, 등록번호가 일치하지 않는 경우 탈퇴 처리합니다.
          </p>
          <p className="text-xs text-gold/70">
            등록번호를 복사한 뒤 대한변협 조회 페이지에서 검색하세요.
          </p>
        </div>

        {/* 검색 + 대한변협 링크 */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 사무소, 등록번호, 이메일 검색"
              className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none transition-colors"
            />
          </div>
          <a
            href="https://m.koreanbar.or.kr/pages/search/search.asp"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gold-dim text-gold border border-gold/30 rounded-lg text-sm font-medium hover:bg-gold/15 transition-colors whitespace-nowrap"
          >
            대한변협 조회
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* 사용자 목록 */}
        <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
          <div className="p-5 border-b border-border">
            <h3 className="font-semibold text-text-primary">
              미검증 사용자 ({filtered.length}{search ? ` / ${users.length}` : ""})
            </h3>
          </div>

          {loading ? (
            <div className="p-8 text-center text-text-dim">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              로딩 중...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-text-dim">
              {search
                ? `"${search}" 검색 결과가 없습니다.`
                : "미검증 사용자가 없습니다. 모든 사용자가 검증 완료되었습니다."}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((u) => (
                <div key={u.uid} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-text-primary font-medium">{u.name}</p>
                        <span className="text-xs text-text-dim bg-navy-light px-2 py-0.5 rounded">{u.firmName}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-text-dim">등록번호:</span>
                        <span className="text-gold font-mono text-sm">{u.barLicenseNumber}</span>
                        <button
                          onClick={() => handleCopyLicense(u.barLicenseNumber, u.uid)}
                          className="text-text-dim hover:text-gold transition-colors"
                          title="등록번호 복사"
                        >
                          {copiedUid === u.uid ? (
                            <Check className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-text-dim">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {processing === u.uid ? (
                        <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
                      ) : (
                        <>
                          <button
                            onClick={() => handleVerify(u.uid)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-success/10 text-success border border-success/30 rounded-lg text-sm hover:bg-success/20 transition-colors"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            검증
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
