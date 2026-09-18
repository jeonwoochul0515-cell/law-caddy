// 관리자 페이지 — 승인 대기·등록번호 확인·거절 회원 관리와 불편 신고 처리
import { useEffect, useMemo, useRef, useState } from "react";
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
  Bug,
  Clock,
  RotateCcw,
  FileText,
  X,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import {
  getPendingUsers,
  getUnverifiedUsers,
  getRejectedUsers,
  approveUser,
  verifyUser,
  rejectUser,
  restoreUserToPending,
  getBugReports,
  updateBugReportStatus,
} from "../services/firebase/firestore";
import { notifyApproved } from "../services/notify";
import { isDemoMode, DEMO_ADMIN_PENDING_USERS } from "../config/demo";
import type { User } from "../types/user";
import type { BugReport } from "../types/bugReport";

type AdminTab = "pending" | "unverified" | "rejected" | "bugs";
type SortKey = "newest" | "oldest" | "name";

/** 확인 대화상자에 넘길 동작 */
interface PendingAction {
  kind: "approve" | "verify" | "reject" | "suspend" | "restore";
  user: User;
}

const ACTION_COPY: Record<PendingAction["kind"], { title: string; description: string; confirm: string; danger: boolean; needReason: boolean }> = {
  approve: {
    title: "가입을 승인합니다",
    description: "승인하면 바로 이용할 수 있고, 등록된 휴대폰으로 승인 문자가 나갑니다. 변호사 등록번호를 대한변협에서 먼저 대조해 주세요.",
    confirm: "승인하고 문자 보내기",
    danger: false,
    needReason: false,
  },
  verify: {
    title: "등록번호 확인 완료로 표시합니다",
    description: "이미 이용 중인 회원입니다. 문자는 나가지 않고, 이 목록에서만 빠집니다.",
    confirm: "확인 완료",
    danger: false,
    needReason: false,
  },
  reject: {
    title: "가입을 거절합니다",
    description: "사유는 본인 로그인 화면에 그대로 보입니다. 본인이 서류를 고쳐 다시 신청할 수 있고, 여기서 '대기로 되돌리기'도 됩니다. 계정과 파일이 지워지는 것은 아닙니다.",
    confirm: "거절",
    danger: true,
    needReason: true,
  },
  suspend: {
    title: "이용을 중지합니다",
    description: "이용 중인 회원의 접속을 막습니다. 사유는 본인 로그인 화면에 그대로 보입니다. 되돌리려면 '거절·중지' 탭에서 '대기로 되돌리기'를 누르세요.",
    confirm: "이용 중지",
    danger: true,
    needReason: true,
  },
  restore: {
    title: "승인 대기로 되돌립니다",
    description: "거절 사유가 지워지고 '승인 대기' 탭으로 돌아갑니다. 거기서 다시 승인하면 문자가 나갑니다.",
    confirm: "되돌리기",
    danger: false,
    needReason: false,
  },
};

export default function AdminPage() {
  const currentUser = useAuth((s) => s.user);
  const [adminTab, setAdminTab] = useState<AdminTab>("pending");
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [unverifiedUsers, setUnverifiedUsers] = useState<User[]>([]);
  const [rejectedUsers, setRejectedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("oldest");
  const [doneCount, setDoneCount] = useState(0);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);

  // 버그 리포트
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [bugsLoading, setBugsLoading] = useState(false);
  const [bugsLoaded, setBugsLoaded] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [pending, unverified, rejected] = await Promise.all([
        getPendingUsers(),
        getUnverifiedUsers(),
        getRejectedUsers(),
      ]);
      setPendingUsers(pending);
      setUnverifiedUsers(unverified);
      setRejectedUsers(rejected);
    } catch (err) {
      setLoadError(
        `회원 목록을 불러오지 못했습니다. 새로고침해 주세요. (${err instanceof Error ? err.message : "알 수 없는 오류"})`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isDemoMode) {
      setPendingUsers([...DEMO_ADMIN_PENDING_USERS]);
      setLoading(false);
      return;
    }
    loadUsers();
  }, []);

  // 버그 탭 최초 진입 시 로드
  useEffect(() => {
    if (adminTab !== "bugs" || bugsLoaded || isDemoMode) return;
    let canceled = false;
    setBugsLoading(true);
    getBugReports()
      .then((result) => {
        if (!canceled) {
          setBugReports(result);
          setBugsLoaded(true);
        }
      })
      .catch((err) => {
        if (!canceled) setNotice({ type: "error", text: `불편 신고 목록을 불러오지 못했습니다. (${err instanceof Error ? err.message : "오류"})` });
      })
      .finally(() => {
        if (!canceled) setBugsLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [adminTab, bugsLoaded]);

  const handleToggleBugStatus = async (report: BugReport) => {
    const next: BugReport["status"] = report.status === "open" ? "resolved" : "open";
    setBugReports((prev) =>
      prev.map((b) => (b.id === report.id ? { ...b, status: next } : b)),
    );
    try {
      await updateBugReportStatus(report.id, next);
    } catch (err) {
      // 롤백 + 안내
      setBugReports((prev) =>
        prev.map((b) => (b.id === report.id ? { ...b, status: report.status } : b)),
      );
      setNotice({ type: "error", text: `상태를 바꾸지 못했습니다. (${err instanceof Error ? err.message : "오류"})` });
    }
  };

  /** 확인 대화상자에서 '확인'을 눌렀을 때 실제 처리 */
  const runAction = async (target: PendingAction, reason: string) => {
    if (!currentUser) return;
    const { kind, user } = target;
    setProcessing(user.uid);
    setNotice(null);
    try {
      if (isDemoMode) {
        setPendingUsers((prev) => prev.filter((u) => u.uid !== user.uid));
      } else if (kind === "approve") {
        await approveUser(user.uid, currentUser.uid);
        setPendingUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        // 승인 대기 → 승인 전환 때만 문자 (fire-and-forget)
        notifyApproved(user.uid);
        setUnverifiedUsers((prev) => [...prev, { ...user, status: "approved" }]);
        setNotice({ type: "ok", text: `${user.name}님을 승인했습니다. 승인 문자를 보냈습니다. 등록번호 대조가 아직이면 '등록번호 확인' 탭에서 마무리하세요.` });
      } else if (kind === "verify") {
        await verifyUser(user.uid, currentUser.uid);
        setUnverifiedUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        setNotice({ type: "ok", text: `${user.name}님의 등록번호 확인을 완료로 표시했습니다.` });
      } else if (kind === "reject" || kind === "suspend") {
        await rejectUser(user.uid, reason, currentUser.uid);
        setPendingUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        setUnverifiedUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        setRejectedUsers((prev) => [...prev, { ...user, status: "rejected", rejectedReason: reason }]);
        setNotice({ type: "ok", text: `${user.name}님을 ${kind === "reject" ? "거절" : "이용 중지"} 처리했습니다. 사유는 본인 로그인 화면에 보입니다. 되돌리려면 '거절·중지' 탭에서 할 수 있습니다.` });
      } else if (kind === "restore") {
        await restoreUserToPending(user.uid);
        setRejectedUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        setPendingUsers((prev) => [...prev, { ...user, status: "pending", rejectedReason: undefined }]);
        setNotice({ type: "ok", text: `${user.name}님을 승인 대기로 되돌렸습니다.` });
      }
      setDoneCount((c) => c + 1);
    } catch (err) {
      setNotice({ type: "error", text: `처리하지 못했습니다. 다시 눌러 주세요. (${err instanceof Error ? err.message : "알 수 없는 오류"})` });
    } finally {
      setProcessing(null);
      setAction(null);
    }
  };

  const handleCopyLicense = async (license: string, uid: string) => {
    try {
      await navigator.clipboard.writeText(license);
      setCopiedUid(uid);
      setTimeout(() => setCopiedUid(null), 2000);
    } catch {
      setNotice({ type: "error", text: "복사가 막혔습니다. 등록번호를 직접 드래그해 복사해 주세요." });
    }
  };

  const listForTab = useMemo<User[]>(
    () => (adminTab === "pending" ? pendingUsers : adminTab === "unverified" ? unverifiedUsers : adminTab === "rejected" ? rejectedUsers : []),
    [adminTab, pendingUsers, unverifiedUsers, rejectedUsers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // 검색어에서 숫자만 뽑는다. 숫자가 없으면 전화번호 대조를 건너뛴다 —
    // "".includes("")는 항상 참이라 그냥 넘기면 전원이 걸린다.
    const qDigits = q.replace(/\D/g, "");
    const matched = q
      ? listForTab.filter((u) =>
          (u.name ?? "").toLowerCase().includes(q) ||
          (u.firmName ?? "").toLowerCase().includes(q) ||
          (u.barLicenseNumber ?? "").includes(q) ||
          (u.email ?? "").toLowerCase().includes(q) ||
          (qDigits !== "" && (u.phone ?? "").replace(/\D/g, "").includes(qDigits)),
        )
      : [...listForTab];
    const ms = (u: User) => u.createdAt?.toMillis?.() ?? 0;
    matched.sort((a, b) => {
      if (sortKey === "name") return (a.name ?? "").localeCompare(b.name ?? "", "ko");
      return sortKey === "newest" ? ms(b) - ms(a) : ms(a) - ms(b);
    });
    return matched;
  }, [listForTab, search, sortKey]);

  if (currentUser?.role !== "admin") {
    return (
      <AppLayout title="관리자" subtitle="">
        <div className="text-center py-16 text-text-dim">관리자 권한이 필요합니다.</div>
      </AppLayout>
    );
  }

  const openBugCount = bugReports.filter((b) => b.status === "open").length;

  const tabButton = (key: AdminTab, label: string, Icon: typeof Users, badge?: number) => (
    <button
      onClick={() => setAdminTab(key)}
      className={`flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        adminTab === key
          ? "bg-gold-dim text-gold border border-gold/30"
          : "bg-surface text-text-dim border border-border hover:text-text-primary"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-error text-white text-[10px] font-bold">{badge}</span>
      )}
    </button>
  );

  const emptyText: Record<Exclude<AdminTab, "bugs">, string> = {
    pending: "승인을 기다리는 회원이 없습니다.",
    unverified: "등록번호 확인이 남은 회원이 없습니다.",
    rejected: "거절·이용 중지된 회원이 없습니다.",
  };

  return (
    <AppLayout title="관리자" subtitle="변호사 확인 · 불편 신고">
      <div className="max-w-3xl space-y-6">
        {/* 탭 */}
        <div className="flex gap-2 flex-wrap">
          {tabButton("pending", "승인 대기", Clock, pendingUsers.length)}
          {tabButton("unverified", "등록번호 확인", ShieldCheck, unverifiedUsers.length)}
          {tabButton("rejected", "거절·중지", ShieldX)}
          {tabButton("bugs", "불편 신고", Bug, bugsLoaded ? openBugCount : undefined)}
        </div>

        {notice && (
          <div
            role="status"
            className={`flex items-start justify-between gap-3 rounded-xl p-4 text-sm border ${
              notice.type === "ok" ? "bg-success/10 text-success border-success/30" : "bg-error/10 text-error border-error/30"
            }`}
          >
            <span className="leading-relaxed">{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="안내 닫기" className="shrink-0 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {adminTab !== "bugs" && (
        <>
        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface border border-border rounded-2xl p-4">
            <Clock className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-text-primary">{pendingUsers.length}</p>
            <p className="text-xs text-text-dim">승인 대기</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-4">
            <Users className="w-5 h-5 text-warning mb-2" />
            <p className="text-2xl font-bold text-text-primary">{unverifiedUsers.length}</p>
            <p className="text-xs text-text-dim">등록번호 확인 대기</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-4">
            <CheckCircle className="w-5 h-5 text-success mb-2" />
            <p className="text-2xl font-bold text-text-primary">{doneCount}</p>
            <p className="text-xs text-text-dim">오늘 이 화면에서 처리</p>
          </div>
        </div>

        {/* 안내 배너 */}
        <div className="bg-gold-dim border border-gold/20 rounded-xl p-4 text-sm text-gold-bright leading-relaxed">
          {adminTab === "pending" && (
            <p>
              사업자등록증에서 변호사업이 자동으로 읽히지 않았거나, 사업자등록증 없이(소속 변호사) 신청한 회원입니다.
              등록증을 열어 보고 등록번호를 대한변협에서 대조한 뒤 승인하세요. 승인하면 본인에게 문자가 나갑니다.
              신청자에게는 "영업일 1일 안에 확인"이라고 안내되어 있습니다.
            </p>
          )}
          {adminTab === "unverified" && (
            <p>
              사업자등록증으로 즉시 승인되어 이미 이용 중인 회원입니다. 등록번호를 대한변협에서 대조하고 '확인 완료'를 누르세요(문자는 나가지 않습니다).
              등록번호가 맞지 않으면 사유를 적어 '이용 중지'합니다.
            </p>
          )}
          {adminTab === "rejected" && (
            <p>
              거절·이용 중지된 회원입니다. 실수였거나 서류가 보완되면 '대기로 되돌리기'를 누르세요. 본인도 로그인 화면에서 서류를 고쳐 다시 신청할 수 있고, 그러면 승인 대기 탭에 다시 나타납니다.
            </p>
          )}
          <p className="text-xs text-gold/70 mt-2">등록번호를 복사한 뒤 대한변협 조회 페이지에서 검색하세요.</p>
        </div>

        {/* 검색 + 정렬 + 대한변협 링크 */}
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 사무소, 등록번호, 이메일, 휴대폰"
              className="w-full min-h-[44px] pl-9 pr-4 py-2.5 bg-surface border border-border rounded-lg text-base text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none transition-colors"
            />
          </div>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="정렬"
            className="min-h-[44px] px-3 py-2.5 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none"
          >
            <option value="oldest">오래된 신청부터</option>
            <option value="newest">최근 신청부터</option>
            <option value="name">이름순</option>
          </select>
          <a
            href="https://m.koreanbar.or.kr/pages/search/search.asp"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 bg-gold-dim text-gold border border-gold/30 rounded-lg text-sm font-medium hover:bg-gold/15 transition-colors whitespace-nowrap"
          >
            대한변협 조회
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* 사용자 목록 */}
        <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
          <div className="p-5 border-b border-border flex items-center justify-between gap-3">
            <h3 className="font-semibold text-text-primary">
              {adminTab === "pending" ? "승인 대기" : adminTab === "unverified" ? "등록번호 확인 대기" : "거절·이용 중지"} ({filtered.length}{search ? ` / ${listForTab.length}` : ""})
            </h3>
            {!isDemoMode && (
              <button onClick={loadUsers} disabled={loading} className="text-xs text-text-dim hover:text-text-primary min-h-[44px] px-2">
                목록 새로고침
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-text-dim">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              불러오는 중...
            </div>
          ) : loadError ? (
            <div className="p-8 text-center text-error text-sm">
              {loadError}
              <button onClick={loadUsers} className="block mx-auto mt-3 underline">다시 시도</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-text-dim">
              {search ? `"${search}" 검색 결과가 없습니다.` : emptyText[adminTab]}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((u) => (
                <UserCard
                  key={u.uid}
                  user={u}
                  tab={adminTab}
                  busy={processing === u.uid}
                  copied={copiedUid === u.uid}
                  onCopy={() => handleCopyLicense(u.barLicenseNumber, u.uid)}
                  onAction={(kind) => setAction({ kind, user: u })}
                />
              ))}
            </div>
          )}
        </div>
        </>
        )}

        {adminTab === "bugs" && (
          <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-text-primary">
                불편 신고 ({bugReports.length})
              </h3>
              {bugsLoaded && (
                <span className="text-xs text-text-dim">
                  미처리 {openBugCount} · 처리완료 {bugReports.length - openBugCount}
                </span>
              )}
            </div>

            {bugsLoading ? (
              <div className="p-8 text-center text-text-dim">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                불러오는 중...
              </div>
            ) : bugReports.length === 0 ? (
              <div className="p-8 text-center text-text-dim">접수된 불편 신고가 없습니다.</div>
            ) : (
              <div className="divide-y divide-border">
                {bugReports.map((b) => {
                  const dateStr = b.createdAt?.toDate?.()
                    ? b.createdAt.toDate().toLocaleString("ko-KR")
                    : "";
                  return (
                    <div key={b.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-md border ${
                                b.status === "open"
                                  ? "bg-error/10 text-error border-error/20"
                                  : "bg-success/10 text-success border-success/20"
                              }`}
                            >
                              {b.status === "open" ? "미처리" : "처리완료"}
                            </span>
                            <span className="text-xs text-text-dim font-mono">{b.page}</span>
                          </div>
                          <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
                            {b.description}
                          </p>
                          <p className="text-xs text-text-dim mt-1.5">
                            {b.reporterName ?? "익명"}
                            {b.reporterEmail ? ` · ${b.reporterEmail}` : ""}
                            {dateStr ? ` · ${dateStr}` : ""}
                            {b.screenSize ? ` · ${b.screenSize}` : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => handleToggleBugStatus(b)}
                          className={`shrink-0 flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                            b.status === "open"
                              ? "bg-success/10 text-success border-success/30 hover:bg-success/20"
                              : "bg-surface text-text-dim border-border hover:text-text-primary"
                          }`}
                        >
                          {b.status === "open" ? (
                            <>
                              <Check className="w-4 h-4" />
                              완료
                            </>
                          ) : (
                            "되돌리기"
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {action && (
        <ActionDialog
          action={action}
          busy={processing === action.user.uid}
          onClose={() => setAction(null)}
          onConfirm={(reason) => runAction(action, reason)}
        />
      )}
    </AppLayout>
  );
}

/** 회원 한 줄 — 신원·사업자 정보·등록증 보기·동작 버튼 */
function UserCard({
  user: u,
  tab,
  busy,
  copied,
  onCopy,
  onAction,
}: {
  user: User;
  tab: AdminTab;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onAction: (kind: PendingAction["kind"]) => void;
}) {
  const joined = u.createdAt?.toDate?.() ? u.createdAt.toDate().toLocaleDateString("ko-KR") : "";
  const bizNo = u.businessNumber ? u.businessNumber.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3") : "";
  const bizLine = [
    bizNo && `사업자번호 ${bizNo}`,
    (u.businessType || u.businessCategory) && `업태/종목 ${u.businessType || "-"} / ${u.businessCategory || "-"}`,
    u.businessVerified ? "변호사업 자동 확인됨" : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-text-primary font-medium">{u.name || "(이름 없음)"}</p>
            <span className="text-xs text-text-dim bg-navy-light px-2 py-0.5 rounded">{u.firmName || "(사무소 없음)"}</span>
            {u.noBusinessLicense && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md border bg-warning/10 text-warning border-warning/20">사업자등록증 없음 · 소속 변호사</span>
            )}
            {u.verified && tab !== "unverified" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md border bg-success/10 text-success border-success/20">등록번호 확인됨</span>
            )}
          </div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm text-text-dim">등록번호:</span>
            <span className="text-gold font-mono text-sm">{u.barLicenseNumber || "-"}</span>
            {u.barLicenseNumber && (
              <button
                onClick={onCopy}
                className="text-text-dim hover:text-gold transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -my-2"
                title="등록번호 복사"
                aria-label="등록번호 복사"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          <p className="text-xs text-text-dim">
            {u.email}
            {u.phone ? ` · ${u.phone}` : " · 휴대폰 없음(승인 문자 불가)"}
            {joined ? ` · 신청 ${joined}` : ""}
          </p>
          {bizLine && <p className="text-xs text-text-dim mt-1">{bizLine}</p>}
          {u.businessLicenseUrl ? (
            <a
              href={u.businessLicenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-xs text-gold underline min-h-[32px]"
            >
              <FileText className="w-3.5 h-3.5" />
              사업자등록증 보기 (새 창)
            </a>
          ) : (
            !u.noBusinessLicense && <p className="text-xs text-text-dim mt-1.5">사업자등록증 파일 없음</p>
          )}
          {tab === "rejected" && (
            <p className="text-xs text-error mt-1.5 whitespace-pre-wrap">사유: {u.rejectedReason?.trim() || "(기록 없음)"}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {busy ? (
            <Loader2 className="w-5 h-5 animate-spin text-text-dim" />
          ) : tab === "pending" ? (
            <>
              <button
                onClick={() => onAction("approve")}
                className="flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 bg-success/10 text-success border border-success/30 rounded-lg text-sm hover:bg-success/20 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                승인
              </button>
              <button
                onClick={() => onAction("reject")}
                className="flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 bg-error/10 text-error border border-error/30 rounded-lg text-sm hover:bg-error/20 transition-colors"
              >
                <ShieldX className="w-4 h-4" />
                거절
              </button>
            </>
          ) : tab === "unverified" ? (
            <>
              <button
                onClick={() => onAction("verify")}
                className="flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 bg-success/10 text-success border border-success/30 rounded-lg text-sm hover:bg-success/20 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                확인 완료
              </button>
              <button
                onClick={() => onAction("suspend")}
                className="flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 bg-error/10 text-error border border-error/30 rounded-lg text-sm hover:bg-error/20 transition-colors"
              >
                <ShieldX className="w-4 h-4" />
                이용 중지
              </button>
            </>
          ) : (
            <button
              onClick={() => onAction("restore")}
              className="flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 bg-surface text-text-primary border border-border rounded-lg text-sm hover:bg-surface-hover transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              대기로 되돌리기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 승인·거절·되돌리기 확인 대화상자 — 거절·중지는 사유 필수 */
function ActionDialog({
  action,
  busy,
  onClose,
  onConfirm,
}: {
  action: PendingAction;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const copy = ACTION_COPY[action.kind];
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const firstRef = useRef<HTMLTextAreaElement | HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const reasonOk = !copy.needReason || reason.trim().length >= 5;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-action-title"
        className="w-full max-w-md bg-[#f7f5ec] rounded-2xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="admin-action-title" className="text-lg font-semibold text-text-primary mb-1">{copy.title}</h3>
        <p className="text-sm text-text-dim mb-3">
          <span className="text-text-primary font-medium">{action.user.name || "(이름 없음)"}</span>
          {action.user.firmName ? ` · ${action.user.firmName}` : ""}
          {action.user.barLicenseNumber ? ` · 등록번호 ${action.user.barLicenseNumber}` : ""}
        </p>
        <p className="text-sm text-text-primary leading-relaxed mb-4">{copy.description}</p>

        {copy.needReason && (
          <div className="mb-4">
            <label htmlFor="admin-action-reason" className="block text-sm text-text-dim mb-1.5">
              사유 <span className="text-error">*</span> — 본인에게 그대로 보입니다
            </label>
            <textarea
              id="admin-action-reason"
              ref={firstRef as React.RefObject<HTMLTextAreaElement>}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              rows={3}
              className="w-full px-3 py-2 text-base bg-white border border-border rounded-lg text-text-primary focus:border-gold/40 focus:outline-none"
              placeholder="예: 변호사 등록번호가 대한변협 조회 결과와 일치하지 않습니다. 등록번호를 확인해 다시 신청해 주세요."
            />
            {touched && !reasonOk && (
              <p className="text-xs text-error mt-1">사유를 5자 이상 적어 주세요. 본인이 무엇을 고쳐야 하는지 알 수 있게 적습니다.</p>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[44px] px-4 py-2 rounded-lg text-sm border border-border text-text-dim hover:text-text-primary disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            ref={copy.needReason ? undefined : (firstRef as React.RefObject<HTMLButtonElement>)}
            onClick={() => { setTouched(true); if (reasonOk) onConfirm(reason.trim()); }}
            disabled={busy || !reasonOk}
            className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-50 ${
              copy.danger
                ? "bg-error/10 text-error border-error/30 hover:bg-error/20"
                : "bg-success/10 text-success border-success/30 hover:bg-success/20"
            }`}
          >
            {busy ? "처리 중..." : copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
