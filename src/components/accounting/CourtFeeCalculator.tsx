import { useState, useMemo, useCallback, useEffect } from "react";
import { X, Calculator, ChevronDown, ChevronUp, Zap, Info } from "lucide-react";
import type { CaseExpense, CaseExpenseCategory } from "../../types/accounting";
import {
  calculateTotalCourtFees,
  formatKoreanWon,
  getSmallClaimThreshold,
  getDefaultRounds,
  getDefaultUnitCost,
} from "../../services/courtFeeCalculator";
import type { CourtLevel } from "../../services/courtFeeCalculator";

// ─── Props ───────────────────────────────────────

interface CourtFeeCalculatorProps {
  /** 계산된 비용을 사건비용으로 등록하는 콜백 */
  onAddExpense: (data: Omit<CaseExpense, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  caseId: string;
  ownerId: string;
  clientName: string;
  /** 패널 닫기 */
  onClose: () => void;
}

// ─── 상수 ─────────────────────────────────────────

const COURT_LEVELS: { value: CourtLevel; label: string }[] = [
  { value: "1심", label: "1심" },
  { value: "항소심", label: "항소심" },
  { value: "상고심", label: "상고심" },
];

// ─── 컴포넌트 ─────────────────────────────────────

export default function CourtFeeCalculator({
  onAddExpense,
  caseId,
  ownerId,
  clientName,
  onClose,
}: CourtFeeCalculatorProps) {
  // 입력 상태
  const [claimAmountStr, setClaimAmountStr] = useState("");
  const [level, setLevel] = useState<CourtLevel>("1심");
  const [isSmallClaim, setIsSmallClaim] = useState(false);
  const [isElectronic, setIsElectronic] = useState(true);
  const [partyCount, setPartyCount] = useState(2);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [registering, setRegistering] = useState<"stamp" | "service" | null>(null);

  // 금액 파싱
  const claimAmount = useMemo(() => {
    const digits = claimAmountStr.replace(/[^0-9]/g, "");
    return parseInt(digits, 10) || 0;
  }, [claimAmountStr]);

  // 소액사건 자동 체크
  useEffect(() => {
    setIsSmallClaim(claimAmount > 0 && claimAmount <= getSmallClaimThreshold());
  }, [claimAmount]);

  // 계산
  const result = useMemo(() => {
    if (claimAmount <= 0) return null;
    return calculateTotalCourtFees({
      claimAmount,
      partyCount,
      level,
      isSmallClaim,
      isElectronic,
    });
  }, [claimAmount, partyCount, level, isSmallClaim, isElectronic]);

  // 금액 입력 핸들러
  const handleClaimAmountChange = useCallback((value: string) => {
    const digits = value.replace(/[^0-9]/g, "");
    if (!digits) {
      setClaimAmountStr("");
      return;
    }
    setClaimAmountStr(Number(digits).toLocaleString("ko-KR"));
  }, []);

  // 당사자 수 변경
  const handlePartyCountChange = useCallback((value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= 100) {
      setPartyCount(num);
    }
  }, []);

  // 비용 등록 핸들러
  const handleRegister = useCallback(
    async (category: CaseExpenseCategory) => {
      if (!result) return;

      const isStamp = category === "인지대";
      const amount = isStamp ? result.stampFee : result.serviceFee;
      if (amount <= 0) return;

      setRegistering(isStamp ? "stamp" : "service");
      try {
        const levelLabel = level;
        const description = isStamp
          ? `소가 ${formatKoreanWon(claimAmount)} 기준 ${levelLabel} 인지대${isElectronic ? " (전자소송)" : ""}${isSmallClaim ? " (소액사건)" : ""}`
          : `당사자 ${partyCount}명 x ${getDefaultRounds(level)}회분 ${levelLabel} 송달료`;

        await onAddExpense({
          caseId,
          ownerId,
          clientName,
          category,
          description,
          amount,
          date: new Date().toISOString().slice(0, 10),
          bearer: "의뢰인",
          reimbursed: false,
          paymentMethod: "계좌이체",
          paidBy: clientName,
          evidenceType: "없음",
          attachments: [],
          memo: `실비 자동 계산기에서 등록\n${result.breakdown}`,
        });

        alert(`${category} ${formatKoreanWon(amount)}이 등록되었습니다.`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "등록 실패";
        alert(`${category} 등록 실패: ${message}`);
      } finally {
        setRegistering(null);
      }
    },
    [result, level, claimAmount, isElectronic, isSmallClaim, partyCount, onAddExpense, caseId, ownerId, clientName]
  );

  return (
    <div className="bg-surface border border-gold/20 rounded-2xl backdrop-blur-sm overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-semibold text-text-primary">
            실비 자동 계산기
          </h3>
          <span className="px-2 py-0.5 text-[10px] bg-gold-dim text-gold rounded-full border border-gold/20">
            인지대 + 송달료
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-text-dim hover:text-text-primary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* 소가 입력 */}
        <div>
          <label className="block text-xs text-text-dim mb-1.5">
            소가 (청구금액)
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={claimAmountStr}
              onChange={(e) => handleClaimAmountChange(e.target.value)}
              placeholder="청구금액을 입력하세요"
              className="w-full px-3 py-2.5 pr-8 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-dim">
              원
            </span>
          </div>
          {claimAmount > 0 && (
            <p className="mt-1 text-[10px] text-text-dim">
              {formatKoreanWon(claimAmount)}
            </p>
          )}
        </div>

        {/* 심급 선택 */}
        <div>
          <label className="block text-xs text-text-dim mb-1.5">심급</label>
          <div className="flex gap-2">
            {COURT_LEVELS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setLevel(value)}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                  level === value
                    ? "border-gold/50 bg-gold-dim text-gold"
                    : "border-border text-text-dim hover:border-gold/30"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 옵션 체크박스 */}
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={isSmallClaim}
              onChange={(e) => setIsSmallClaim(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-navy-light text-gold focus:ring-gold accent-[#C8A961]"
            />
            <span className="text-xs text-text-dim group-hover:text-text-primary transition-colors">
              소액사건 (x0.5)
            </span>
            {claimAmount > 0 && claimAmount <= getSmallClaimThreshold() && (
              <span className="px-1.5 py-0.5 text-[9px] bg-blue-500/15 text-blue-400 rounded border border-blue-500/20">
                자동 적용
              </span>
            )}
          </label>

          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={isElectronic}
              onChange={(e) => setIsElectronic(e.target.checked)}
              className="w-4 h-4 rounded border-border bg-navy-light text-gold focus:ring-gold accent-[#C8A961]"
            />
            <span className="text-xs text-text-dim group-hover:text-text-primary transition-colors">
              전자소송 (-10%)
            </span>
          </label>
        </div>

        {/* 당사자 수 */}
        <div>
          <label className="block text-xs text-text-dim mb-1.5">
            당사자 수 (송달료 계산용)
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPartyCount(Math.max(1, partyCount - 1))}
              className="w-8 h-8 flex items-center justify-center border border-border rounded-lg text-text-dim hover:border-gold/30 hover:text-gold transition-colors"
            >
              -
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={partyCount}
              onChange={(e) => handlePartyCountChange(e.target.value)}
              className="w-16 text-center px-2 py-1.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary focus:border-gold focus:outline-none"
            />
            <button
              onClick={() => setPartyCount(Math.min(100, partyCount + 1))}
              className="w-8 h-8 flex items-center justify-center border border-border rounded-lg text-text-dim hover:border-gold/30 hover:text-gold transition-colors"
            >
              +
            </button>
            <span className="text-xs text-text-dim ml-1">명</span>
          </div>
          <p className="mt-1 text-[10px] text-text-dim">
            기본 {getDefaultRounds(level)}회분 x {formatKoreanWon(getDefaultUnitCost())}/회
          </p>
        </div>

        {/* 계산 결과 */}
        {result && (
          <div className="rounded-xl border border-gold/20 bg-gold-dim/30 overflow-hidden">
            {/* 합계 */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-gold" />
                <span className="text-xs font-medium text-gold">계산 결과</span>
              </div>

              <div className="space-y-2.5">
                {/* 인지대 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-dim">인지대</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">
                      {formatKoreanWon(result.stampFee)}
                    </span>
                    <button
                      onClick={() => handleRegister("인지대")}
                      disabled={registering !== null || result.stampFee <= 0}
                      className="px-2.5 py-1 text-[10px] font-medium text-white bg-gradient-to-r from-gold to-gold-bright rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {registering === "stamp" ? "등록 중..." : "등록"}
                    </button>
                  </div>
                </div>

                {/* 송달료 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-dim">송달료</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">
                      {formatKoreanWon(result.serviceFee)}
                    </span>
                    <button
                      onClick={() => handleRegister("송달료")}
                      disabled={registering !== null || result.serviceFee <= 0}
                      className="px-2.5 py-1 text-[10px] font-medium text-white bg-gradient-to-r from-gold to-gold-bright rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {registering === "service" ? "등록 중..." : "등록"}
                    </button>
                  </div>
                </div>

                {/* 구분선 */}
                <div className="h-px bg-gold/20" />

                {/* 합계 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gold">합계</span>
                  <span className="text-base font-bold text-gold">
                    {formatKoreanWon(result.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* 상세 내역 토글 */}
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="w-full flex items-center justify-center gap-1 px-4 py-2 border-t border-gold/15 text-[10px] text-text-dim hover:text-gold transition-colors"
            >
              <Info className="w-3 h-3" />
              계산 상세 내역
              {showBreakdown ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            {showBreakdown && (
              <div className="px-4 pb-4 border-t border-gold/10">
                <pre className="mt-3 text-[10px] leading-relaxed text-text-dim whitespace-pre-wrap font-mono">
                  {result.breakdown}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* 안내 문구 */}
        <p className="text-[10px] text-text-dim/60 leading-relaxed">
          * 민사소송 등 인지법 기준 계산입니다. 실제 납부액은 법원 및 사건 유형에 따라 다를 수 있습니다.
          송달료 단가는 2025년 기준 {formatKoreanWon(getDefaultUnitCost())}입니다.
        </p>
      </div>
    </div>
  );
}
