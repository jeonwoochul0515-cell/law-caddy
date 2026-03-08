import { ArrowUpRight, Mic, FileText, Calendar } from "lucide-react";

interface UsageSummaryProps {
  plan: string;
  recordingsUsed: number;
  recordingsLimit: number;
  docsUsed: number;
  docsLimit: number;
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  team: "Team",
  free: "Free",
};

function ProgressBar({ used, limit }: { used: number; limit: number }) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const nearLimit = !isUnlimited && pct >= 80;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-text-dim">
          {used}{isUnlimited ? "건 사용" : ` / ${limit}건`}
        </span>
        {!isUnlimited && (
          <span className={nearLimit ? "text-amber-400 font-medium" : "text-text-dim"}>
            {Math.round(pct)}%
          </span>
        )}
        {isUnlimited && (
          <span className="text-text-dim">무제한</span>
        )}
      </div>
      <div className="h-2 bg-navy-light rounded-full overflow-hidden">
        {isUnlimited ? (
          <div className="h-full w-full bg-gradient-to-r from-gold/20 to-gold/10 rounded-full" />
        ) : (
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              nearLimit
                ? "bg-gradient-to-r from-amber-500 to-amber-400"
                : "bg-gradient-to-r from-gold to-gold-bright"
            }`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

export default function UsageSummary({
  plan,
  recordingsUsed,
  recordingsLimit,
  docsUsed,
  docsLimit,
}: UsageSummaryProps) {
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const now = new Date();
  const billingStart = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const billingEnd = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${lastDay}`;

  const nearRecordingLimit = recordingsLimit !== -1 && recordingsUsed / recordingsLimit >= 0.8;
  const nearDocLimit = docsLimit !== -1 && docsUsed / docsLimit >= 0.8;
  const showUpgradeHint = nearRecordingLimit || nearDocLimit;

  return (
    <div className="bg-surface border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-text-primary">이번 달 사용량</h3>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gold-dim text-gold text-xs font-semibold rounded-full">
            {planLabel}
          </span>
          <span className="flex items-center gap-1 text-xs text-text-dim">
            <Calendar className="w-3 h-3" />
            {billingStart} ~ {billingEnd}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Mic className="w-4 h-4 text-gold" />
            녹음
          </div>
          <ProgressBar used={recordingsUsed} limit={recordingsLimit} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <FileText className="w-4 h-4 text-gold" />
            문서 생성
          </div>
          <ProgressBar used={docsUsed} limit={docsLimit} />
        </div>
      </div>

      {showUpgradeHint && (
        <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <ArrowUpRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-sm text-amber-300">
            사용량이 한도에 가까워지고 있습니다. 업그레이드를 고려해 보세요.
          </span>
        </div>
      )}
    </div>
  );
}
