import { useState } from "react";
import {
  User as UserIcon,
  CreditCard,
  Info,
  Save,
  Lock,
  Loader2,
  Check,
  AlertCircle,
  Building,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { isDemoMode } from "../config/demo";
import { PLANS } from "../config/constants";

export default function SettingsPage() {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<"profile" | "plan" | "system">("profile");

  // 프로필 편집
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editFirmName, setEditFirmName] = useState(user?.firmName ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 비밀번호 변경
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleProfileSave = async () => {
    if (!user) return;
    if (!editName.trim() || !editFirmName.trim()) {
      setProfileMsg({ type: "error", text: "이름과 사무소명을 입력해 주세요." });
      return;
    }

    setProfileSaving(true);
    setProfileMsg(null);
    try {
      if (isDemoMode) {
        // 데모에서는 로컬만 업데이트
        await new Promise((r) => setTimeout(r, 500));
      } else {
        const { updateUserProfile } = await import("../services/firebase/auth");
        await updateUserProfile(user.uid, {
          name: editName.trim(),
          firmName: editFirmName.trim(),
        });
      }
      setProfileMsg({ type: "success", text: "프로필이 저장되었습니다." });
    } catch (err: unknown) {
      setProfileMsg({
        type: "error",
        text: err instanceof Error ? err.message : "프로필 저장에 실패했습니다.",
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPwMsg(null);
    if (!currentPw || !newPw || !confirmPw) {
      setPwMsg({ type: "error", text: "모든 필드를 입력해 주세요." });
      return;
    }
    if (newPw.length < 6) {
      setPwMsg({ type: "error", text: "새 비밀번호는 6자 이상이어야 합니다." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: "error", text: "새 비밀번호가 일치하지 않습니다." });
      return;
    }

    setPwSaving(true);
    try {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 500));
      } else {
        const { changePassword } = await import("../services/firebase/auth");
        await changePassword(currentPw, newPw);
      }
      setPwMsg({ type: "success", text: "비밀번호가 변경되었습니다." });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      setPwMsg({
        type: "error",
        text: err instanceof Error ? err.message : "비밀번호 변경에 실패했습니다.",
      });
    } finally {
      setPwSaving(false);
    }
  };

  const tabs = [
    { key: "profile" as const, label: "프로필", icon: UserIcon },
    { key: "plan" as const, label: "요금제", icon: CreditCard },
    { key: "system" as const, label: "시스템 정보", icon: Info },
  ];

  const inputClass =
    "w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none transition-colors";

  return (
    <AppLayout title="설정" subtitle="계정 및 시스템 관리">
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key
                ? "bg-gold-dim text-gold border border-gold/30"
                : "bg-surface text-text-dim border border-border hover:border-border-hover"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* 프로필 */}
      {tab === "profile" && user && (
        <div className="max-w-2xl space-y-6">
          {/* 기본 정보 편집 */}
          <div className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-text-primary mb-4">기본 정보</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-dim mb-1.5">이름</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1.5">법률사무소</label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim/50" />
                  <input
                    value={editFirmName}
                    onChange={(e) => setEditFirmName(e.target.value)}
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1.5">이메일</label>
                <p className="px-4 py-2.5 text-sm text-text-dim bg-navy-light/50 border border-border rounded-lg">{user.email}</p>
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1.5">변호사 등록번호</label>
                <p className="px-4 py-2.5 text-sm text-text-dim bg-navy-light/50 border border-border rounded-lg font-mono">{user.barLicenseNumber}</p>
              </div>
            </div>

            {profileMsg && (
              <div className={`flex items-center gap-2 mt-4 px-3 py-2 rounded-lg text-sm ${
                profileMsg.type === "success"
                  ? "bg-success/10 text-success"
                  : "bg-error/10 text-error"
              }`}>
                {profileMsg.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {profileMsg.text}
              </div>
            )}

            <button
              onClick={handleProfileSave}
              disabled={profileSaving}
              className="flex items-center gap-2 mt-4 px-5 py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {profileSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</>
              ) : (
                <><Save className="w-4 h-4" /> 저장</>
              )}
            </button>
          </div>

          {/* 비밀번호 변경 */}
          <div className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              비밀번호 변경
            </h3>
            <div className="space-y-3 max-w-md">
              <div>
                <label className="block text-sm text-text-dim mb-1.5">현재 비밀번호</label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="현재 비밀번호 입력"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1.5">새 비밀번호</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="6자 이상"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1.5">새 비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="새 비밀번호 다시 입력"
                  className={inputClass}
                />
              </div>
            </div>

            {pwMsg && (
              <div className={`flex items-center gap-2 mt-4 px-3 py-2 rounded-lg text-sm ${
                pwMsg.type === "success"
                  ? "bg-success/10 text-success"
                  : "bg-error/10 text-error"
              }`}>
                {pwMsg.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {pwMsg.text}
              </div>
            )}

            <button
              onClick={handlePasswordChange}
              disabled={pwSaving}
              className="flex items-center gap-2 mt-4 px-5 py-2.5 border border-border text-text-dim rounded-lg text-sm hover:border-gold/30 hover:text-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pwSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 변경 중...</>
              ) : (
                <><Lock className="w-4 h-4" /> 비밀번호 변경</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 요금제 */}
      {tab === "plan" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
          {PLANS.map((plan) => {
            const isCurrent = user?.plan === plan.id;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-6 border ${
                  plan.id === "pro"
                    ? "bg-gold/5 border-gold/30"
                    : "bg-surface border-border"
                }`}
              >
                {plan.id === "pro" && (
                  <span className="inline-block px-2 py-0.5 bg-gold text-navy text-xs font-semibold rounded-full mb-3">
                    추천
                  </span>
                )}
                <h3 className="text-lg font-semibold text-text-primary">{plan.name}</h3>
                <p className="text-2xl font-bold text-gold mt-2">{plan.price}</p>
                <p className="text-sm text-text-dim mt-2">{plan.features}</p>
                <button
                  disabled={isCurrent}
                  className={`w-full mt-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isCurrent
                      ? "bg-gold-dim text-gold cursor-default"
                      : "border border-border text-text-dim hover:border-gold hover:text-gold"
                  }`}
                >
                  {isCurrent ? "현재 플랜" : "변경하기"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 시스템 정보 */}
      {tab === "system" && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-text-primary mb-4">시스템 정보</h3>
            <div className="space-y-3 text-sm">
              {[
                ["서비스", "LAW-CADDY v1.0"],
                ["AI 모델", "Claude claude-sonnet-4-20250514"],
                ["STT 엔진", "RTZR Sommers (한국어)"],
                ["프레임워크", "React 18 + TypeScript + Vite"],
                ["백엔드", "Firebase (Auth + Firestore + Storage)"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-border last:border-0">
                  <span className="text-text-dim">{label}</span>
                  <span className="text-text-primary">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-text-primary mb-4">계정 정보</h3>
            <div className="space-y-3 text-sm">
              {[
                ["계정 상태", user?.status === "approved" ? "활성" : user?.status ?? "-"],
                ["역할", user?.role === "admin" ? "관리자" : "변호사"],
                ["요금제", PLANS.find((p) => p.id === user?.plan)?.name ?? user?.plan ?? "-"],
                ["가입일", user?.createdAt?.toDate?.() ? user.createdAt.toDate().toLocaleDateString("ko-KR") : "-"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-border last:border-0">
                  <span className="text-text-dim">{label}</span>
                  <span className="text-text-primary">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
