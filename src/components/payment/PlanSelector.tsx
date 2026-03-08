import { Check, X, Star } from "lucide-react";

interface PlanSelectorProps {
  currentPlan: string;
  onSelectPlan: (planId: string) => void;
}

interface PlanDef {
  id: string;
  name: string;
  price: string;
  priceNote: string;
  recommended: boolean;
  features: {
    recordings: string;
    documents: string;
    agents: string;
    clientMessage: boolean;
    caseManagement: boolean;
    teamSharing: boolean;
    adminPanel: boolean;
  };
}

const PLAN_DEFS: PlanDef[] = [
  {
    id: "starter",
    name: "Starter",
    price: "₩49,000",
    priceNote: "/월",
    recommended: false,
    features: {
      recordings: "5건/월",
      documents: "3건/월",
      agents: "3개",
      clientMessage: false,
      caseManagement: true,
      teamSharing: false,
      adminPanel: false,
    },
  },
  {
    id: "pro",
    name: "Pro",
    price: "₩89,000",
    priceNote: "/월",
    recommended: true,
    features: {
      recordings: "무제한",
      documents: "무제한",
      agents: "6개",
      clientMessage: true,
      caseManagement: true,
      teamSharing: false,
      adminPanel: false,
    },
  },
  {
    id: "team",
    name: "Team",
    price: "₩69,000",
    priceNote: "/인",
    recommended: false,
    features: {
      recordings: "무제한",
      documents: "무제한",
      agents: "6개",
      clientMessage: true,
      caseManagement: true,
      teamSharing: true,
      adminPanel: true,
    },
  },
];

const PLAN_ORDER = ["starter", "pro", "team"];

interface FeatureRowDef {
  label: string;
  key: keyof PlanDef["features"];
  type: "text" | "bool";
}

const FEATURE_ROWS: FeatureRowDef[] = [
  { label: "녹음", key: "recordings", type: "text" },
  { label: "문서 생성", key: "documents", type: "text" },
  { label: "AI 에이전트", key: "agents", type: "text" },
  { label: "의뢰인 메시지", key: "clientMessage", type: "bool" },
  { label: "케이스 관리", key: "caseManagement", type: "bool" },
  { label: "팀 공유", key: "teamSharing", type: "bool" },
  { label: "관리자 기능", key: "adminPanel", type: "bool" },
];

function FeatureCell({ value, type }: { value: string | boolean; type: "text" | "bool" }) {
  if (type === "bool") {
    return value ? (
      <Check className="w-4 h-4 text-emerald-400 mx-auto" />
    ) : (
      <X className="w-4 h-4 text-text-dim/30 mx-auto" />
    );
  }
  return <span className="text-sm text-text-primary">{String(value)}</span>;
}

export default function PlanSelector({ currentPlan, onSelectPlan }: PlanSelectorProps) {
  const currentIndex = PLAN_ORDER.indexOf(currentPlan);

  function getButtonState(planId: string) {
    if (planId === currentPlan) return "current" as const;
    const planIndex = PLAN_ORDER.indexOf(planId);
    if (planIndex > currentIndex) return "upgrade" as const;
    return "downgrade" as const;
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6">
      <h3 className="font-semibold text-text-primary mb-6">요금제 선택</h3>

      {/* 카드 그리드 (모바일에서는 세로) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {PLAN_DEFS.map((plan) => {
          const state = getButtonState(plan.id);
          const isCurrent = state === "current";
          const isPro = plan.recommended;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-5 border transition-colors ${
                isPro
                  ? "bg-gold/5 border-gold/30 shadow-lg shadow-gold/5"
                  : isCurrent
                    ? "bg-surface border-gold/20"
                    : "bg-surface border-border hover:border-border-hover"
              }`}
            >
              {/* 배지들 */}
              <div className="flex items-center gap-2 mb-3 min-h-[24px]">
                {isPro && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gold text-navy text-xs font-semibold rounded-full">
                    <Star className="w-3 h-3" />
                    추천
                  </span>
                )}
                {isCurrent && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gold-dim text-gold text-xs font-semibold rounded-full">
                    현재 플랜
                  </span>
                )}
              </div>

              <h4 className="text-lg font-semibold text-text-primary">{plan.name}</h4>
              <div className="mt-2 mb-4">
                <span className="text-2xl font-bold text-gold">{plan.price}</span>
                <span className="text-sm text-text-dim">{plan.priceNote}</span>
              </div>

              {/* 주요 기능 미리보기 */}
              <ul className="space-y-2 mb-5">
                {FEATURE_ROWS.slice(0, 4).map((row) => {
                  const val = plan.features[row.key];
                  const enabled = row.type === "bool" ? !!val : true;
                  return (
                    <li key={row.key} className="flex items-center gap-2 text-sm">
                      {enabled ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-text-dim/30 flex-shrink-0" />
                      )}
                      <span className={enabled ? "text-text-primary" : "text-text-dim/50"}>
                        {row.label}{row.type === "text" ? `: ${String(val)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* 버튼 */}
              {isCurrent ? (
                <div className="w-full py-2.5 bg-gold-dim text-gold text-center rounded-xl text-sm font-medium">
                  현재 플랜
                </div>
              ) : state === "upgrade" ? (
                <button
                  onClick={() => onSelectPlan(plan.id)}
                  className="w-full py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-gold/20 active:scale-[0.98] transition-all"
                >
                  업그레이드
                </button>
              ) : (
                <button
                  onClick={() => onSelectPlan(plan.id)}
                  className="w-full py-2.5 border border-border text-text-dim rounded-xl text-sm font-medium hover:border-gold/30 hover:text-gold transition-colors"
                >
                  다운그레이드
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 기능 비교 테이블 */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-white/[0.02] border-b border-border">
          <h4 className="text-sm font-medium text-text-primary">기능 비교</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-text-dim font-medium w-1/4">기능</th>
                {PLAN_DEFS.map((plan) => (
                  <th
                    key={plan.id}
                    className={`text-center px-4 py-3 font-medium w-1/4 ${
                      plan.id === currentPlan ? "text-gold" : "text-text-primary"
                    }`}
                  >
                    {plan.name}
                    {plan.id === currentPlan && (
                      <span className="ml-1.5 text-[10px] text-gold/70">(현재)</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row, i) => (
                <tr
                  key={row.key}
                  className={`border-b border-border last:border-0 ${
                    i % 2 === 0 ? "" : "bg-white/[0.01]"
                  }`}
                >
                  <td className="px-4 py-3 text-text-dim">{row.label}</td>
                  {PLAN_DEFS.map((plan) => (
                    <td
                      key={plan.id}
                      className={`px-4 py-3 text-center ${
                        plan.id === currentPlan ? "bg-gold/[0.03]" : ""
                      }`}
                    >
                      <FeatureCell value={plan.features[row.key]} type={row.type} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
