import { useState } from "react";
import { X, ScrollText, Loader2, Zap, Sparkles } from "lucide-react";
import { Timestamp } from "firebase/firestore";
import type { Case } from "../../types/case";
import type { User } from "../../types/user";
import type { ContractFees } from "../../types/signing";
import { generateContractText } from "../../services/contractGenerator";
import { createSigningRequest } from "../../services/firebase/signing";

interface ContractGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: Case;
  user: User;
  onComplete: (result: { contractText: string; signingToken: string; documentText: string }) => void;
}

type SuccessFeeMode = "none" | "percent" | "fixed";

/** 숫자를 콤마 포맷 문자열로 변환 */
function formatWithCommas(value: string): string {
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
}

/** 콤마 문자열에서 숫자만 추출 */
function parseDigits(value: string): number {
  return parseInt(value.replace(/[^0-9]/g, ""), 10) || 0;
}

export default function ContractGenerateModal({
  isOpen,
  onClose,
  caseData,
  user,
  onComplete,
}: ContractGenerateModalProps) {
  const isCriminal = caseData.caseType === "형사";

  const [retainerDisplay, setRetainerDisplay] = useState("");
  const [successFeeMode, setSuccessFeeMode] = useState<SuccessFeeMode>(isCriminal ? "none" : "none");
  const [percentInput, setPercentInput] = useState("");
  const [fixedAmountDisplay, setFixedAmountDisplay] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const retainerAmount = parseDigits(retainerDisplay);
  const canSubmit = retainerAmount > 0 && !isGenerating;

  const handleRetainerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRetainerDisplay(formatWithCommas(e.target.value));
  };

  const handleFixedAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFixedAmountDisplay(formatWithCommas(e.target.value));
  };

  const handlePercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 숫자와 소수점만 허용
    const val = e.target.value.replace(/[^0-9.]/g, "");
    // 소수점 하나만 허용
    const parts = val.split(".");
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 1) return;
    setPercentInput(val);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsGenerating(true);
    setError(null);

    try {
      // 수수료 데이터 구성
      const fees: ContractFees = {
        retainerAmount,
        successFeeType: successFeeMode,
      };

      if (successFeeMode === "percent") {
        fees.successFeePercent = parseFloat(percentInput) || 0;
      } else if (successFeeMode === "fixed") {
        fees.successFeeAmount = parseDigits(fixedAmountDisplay);
      }

      // 계약서 텍스트 생성
      const contractText = generateContractText({ caseData, user, fees });

      // 서명 토큰 생성
      const signingToken = crypto.randomUUID();

      // 24시간 후 만료
      const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

      // 서명 요청 생성
      await createSigningRequest({
        caseId: caseData.id,
        ownerId: user.uid,
        contractText,
        clientName: caseData.clientName,
        token: signingToken,
        expiresAt,
        status: "pending",
        auditTrail: {
          sentAt: new Date().toISOString(),
        },
      });

      onComplete({
        contractText,
        signingToken,
        documentText: contractText,
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("계약서 생성 중 오류가 발생했습니다.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-light border border-border rounded-2xl w-full max-w-md relative overflow-hidden">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          disabled={isGenerating}
          className="absolute top-4 right-4 text-text-dim hover:text-text-primary transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          {/* 헤더 */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-1">
              <ScrollText className="w-5 h-5 text-gold" />
              <h2 className="text-lg font-semibold text-text-primary">수임계약서 작성</h2>
            </div>
            <p className="text-sm text-text-dim">
              {caseData.clientName} - {caseData.caseType}
            </p>
          </div>

          <div className="border-t border-border mb-5" />

          {/* 착수금 입력 */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-text-primary mb-2">
              착수금 (VAT 포함) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={retainerDisplay}
                onChange={handleRetainerChange}
                placeholder="3,000,000"
                className="w-full px-3 py-2.5 pr-10 bg-surface border border-border rounded-lg text-text-primary text-right focus:border-gold focus:outline-none transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-dim">원</span>
            </div>
          </div>

          {/* 성과보수 유형 선택 */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-text-primary mb-2">성과보수</label>
            <div className="flex gap-2">
              {(["none", "percent", "fixed"] as const).map((mode) => {
                const labels: Record<SuccessFeeMode, string> = {
                  none: "없음",
                  percent: "%",
                  fixed: "정액",
                };
                const isActive = successFeeMode === mode;
                const isDisabled = isCriminal && mode !== "none";

                return (
                  <button
                    key={mode}
                    onClick={() => !isDisabled && setSuccessFeeMode(mode)}
                    disabled={isDisabled}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      isActive
                        ? "border-gold/40 bg-gold-dim text-gold"
                        : isDisabled
                          ? "border-border/50 text-text-dim/30 cursor-not-allowed"
                          : "border-border text-text-dim hover:border-border-hover"
                    }`}
                  >
                    {labels[mode]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 퍼센트 입력 */}
          {successFeeMode === "percent" && (
            <div className="mb-5">
              <label className="block text-sm font-medium text-text-primary mb-2">
                승소 경제적 이익의
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={percentInput}
                  onChange={handlePercentChange}
                  placeholder="10"
                  className="w-full px-3 py-2.5 pr-10 bg-surface border border-border rounded-lg text-text-primary text-right focus:border-gold focus:outline-none transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-dim">%</span>
              </div>
            </div>
          )}

          {/* 정액 입력 */}
          {successFeeMode === "fixed" && (
            <div className="mb-5">
              <label className="block text-sm font-medium text-text-primary mb-2">
                성과보수 금액
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={fixedAmountDisplay}
                  onChange={handleFixedAmountChange}
                  placeholder="5,000,000"
                  className="w-full px-3 py-2.5 pr-10 bg-surface border border-border rounded-lg text-text-primary text-right focus:border-gold focus:outline-none transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-dim">원</span>
              </div>
            </div>
          )}

          <div className="border-t border-border mb-5" />

          {/* 형사 사건 안내 */}
          {isCriminal && (
            <div className="flex items-start gap-2 mb-5 p-3 bg-gold-dim/50 rounded-lg">
              <Zap className="w-4 h-4 text-gold mt-0.5 shrink-0" />
              <p className="text-xs text-text-dim leading-relaxed">
                <span className="text-gold font-medium">사건유형: 형사</span> → 형사 양식 자동 적용
                <br />
                <span className="text-text-dim/70">(성과보수 비활성, 변호사법 제33조)</span>
              </p>
            </div>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* 생성 버튼 */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
              canSubmit
                ? "bg-gradient-to-r from-gold to-gold-bright text-navy hover:opacity-90"
                : "bg-surface text-text-dim/40 cursor-not-allowed"
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                계약서 생성 중...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                계약서 생성 + 서명 요청
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
