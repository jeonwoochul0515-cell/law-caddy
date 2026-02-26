import { useState } from "react";
import { User as UserIcon, Building, CreditCard, Info } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { PLANS } from "../config/constants";

export default function SettingsPage() {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState<"profile" | "plan" | "system">("profile");

  const tabs = [
    { key: "profile" as const, label: "프로필", icon: UserIcon },
    { key: "plan" as const, label: "요금제", icon: CreditCard },
    { key: "system" as const, label: "시스템 정보", icon: Info },
  ];

  return (
    <AppLayout title="설정" subtitle="계정 및 시스템 관리">
      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
          <div className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-text-primary mb-4">기본 정보</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-dim mb-1">이름</label>
                <p className="text-text-primary">{user.name}</p>
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1">이메일</label>
                <p className="text-text-primary">{user.email}</p>
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1">법률사무소</label>
                <p className="text-text-primary flex items-center gap-2">
                  <Building className="w-4 h-4 text-text-dim" />
                  {user.firmName}
                </p>
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1">변호사 등록번호</label>
                <p className="text-text-primary">{user.barLicenseNumber}</p>
              </div>
            </div>
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
        <div className="max-w-2xl">
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
        </div>
      )}
    </AppLayout>
  );
}
