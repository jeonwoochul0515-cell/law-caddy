// 성공보수 청구 모달 — 결과 금액 입력 → 약정대로 자동 산정 → 청구서 생성 → 복사/문자 발송
import { useMemo, useState } from "react";
import { X, Loader2, Copy, Check, Send, Calculator } from "lucide-react";
import { sendClientSms } from "../../services/notify";
import type { SuccessFeeInfo } from "../../types/accounting";

interface SuccessFeeClaimModalProps {
  successFee: SuccessFeeInfo;
  clientName: string;
  /** 의뢰인 휴대폰 번호 (사건에 저장된 값, 없으면 입력받음) */
  clientPhone?: string;
  firmName: string;
  lawyerName: string;
  /** 청구서에 표기할 사건 설명 (사건번호 또는 개요 요약) */
  caseLabel: string;
  onClose: () => void;
  /** 청구 확정 시 — 부모가 successFee 상태를 청구완료로 저장 */
  onClaimed: (claimedAmount: number) => Promise<void>;
}

/**
 * 약정 유형별 성공보수 산정.
 * 구간별(tiered)은 초과 누진 방식: 각 구간 경계까지는 해당 구간 비율,
 * 마지막 경계 초과분은 마지막 구간 비율을 적용한다.
 */
function calcSuccessFee(successFee: SuccessFeeInfo, base: number): number {
  if (successFee.type === "fixed") return successFee.fixedAmount ?? 0;
  if (successFee.type === "tiered" && successFee.tiers?.length) {
    const tiers = [...successFee.tiers].sort((a, b) => a.threshold - b.threshold);
    let total = 0;
    let prev = 0;
    for (const tier of tiers) {
      const slice = Math.min(base, tier.threshold) - prev;
      if (slice <= 0) break;
      total += slice * (tier.percent / 100);
      prev = tier.threshold;
    }
    if (base > tiers[tiers.length - 1].threshold) {
      total += (base - tiers[tiers.length - 1].threshold) * (tiers[tiers.length - 1].percent / 100);
    }
    return Math.round(total);
  }
  return Math.round(base * ((successFee.percent ?? 0) / 100));
}

/** 약정 내용을 사람이 읽는 한 줄로 */
function describeAgreement(sf: SuccessFeeInfo): string {
  let desc: string;
  if (sf.type === "fixed") desc = `정액 ${(sf.fixedAmount ?? 0).toLocaleString()}원`;
  else if (sf.type === "tiered" && sf.tiers?.length) {
    desc = [...sf.tiers]
      .sort((a, b) => a.threshold - b.threshold)
      .map((t) => `${(t.threshold / 10000).toLocaleString()}만원까지 ${t.percent}%`)
      .join(", ") + " (초과분은 마지막 구간 비율)";
  } else desc = `승소 금액의 ${sf.percent ?? 0}%`;
  return sf.condition ? `${desc} — 조건: ${sf.condition}` : desc;
}

const inputCls =
  "w-full bg-navy-light border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40 transition-colors";
const labelCls = "block text-xs text-text-dim mb-1.5";

export default function SuccessFeeClaimModal({
  successFee,
  clientName,
  clientPhone,
  firmName,
  lawyerName,
  caseLabel,
  onClose,
  onClaimed,
}: SuccessFeeClaimModalProps) {
  const [baseInput, setBaseInput] = useState("");
  /** 산정액을 사용자가 직접 고쳤으면 자동 계산을 멈춘다 */
  const [amountOverride, setAmountOverride] = useState<string | null>(null);
  const [vatSeparate, setVatSeparate] = useState(true);
  const [phone, setPhone] = useState(clientPhone ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const base = Number(baseInput.replace(/\D/g, "")) || 0;
  const autoAmount = useMemo(() => calcSuccessFee(successFee, base), [successFee, base]);
  const amount = amountOverride !== null ? Number(amountOverride.replace(/\D/g, "")) || 0 : autoAmount;
  const vat = vatSeparate ? Math.round(amount * 0.1) : 0;
  const total = amount + vat;

  const defaultMessage = useMemo(
    () =>
      [
        `[${firmName}] ${clientName}님, 성공보수 청구 안내드립니다.`,
        ``,
        `진행해 드린 사건(${caseLabel})이 마무리되어, 위임계약에서 약정한 성공보수를 안내드립니다.`,
        ``,
        `· 약정 내용: ${describeAgreement(successFee)}`,
        base > 0 ? `· 산정 기준 금액: ${base.toLocaleString()}원` : null,
        `· 성공보수: ${amount.toLocaleString()}원${vatSeparate ? ` (부가세 별도)` : ` (부가세 포함)`}`,
        vatSeparate ? `· 부가세(10%): ${vat.toLocaleString()}원` : null,
        `· 청구 합계: ${total.toLocaleString()}원`,
        ``,
        `입금 계좌 등 자세한 사항은 별도로 안내드리겠습니다. 궁금하신 점은 편하게 연락 주세요.`,
        ``,
        `${firmName} ${lawyerName} 변호사`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    [firmName, lawyerName, clientName, caseLabel, successFee, base, amount, vat, total, vatSeparate],
  );

  const finalMessage = message ?? defaultMessage;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(finalMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard 실패 무시 */ }
  }

  async function handleSend() {
    const normalized = phone.replace(/\D/g, "");
    setSending(true);
    setError(null);
    try {
      await sendClientSms(normalized, finalMessage);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "문자 발송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  }

  async function handleConfirmClaim() {
    if (amount <= 0) {
      setError("청구 금액이 0원입니다. 결과 금액 또는 산정액을 확인해 주세요.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await onClaimed(total);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "청구 상태 저장에 실패했습니다.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-navy border border-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-navy z-10">
          <div>
            <h3 className="font-semibold text-text-primary">성공보수 청구</h3>
            <p className="text-xs text-text-dim mt-0.5">약정: {describeAgreement(successFee)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-dim hover:text-text-primary rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 1. 산정 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>결과 금액 (판결·합의액)</label>
              <input
                type="text"
                inputMode="numeric"
                value={baseInput}
                onChange={(e) => setBaseInput(e.target.value)}
                placeholder="55000000"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>산정된 성공보수</label>
              <input
                type="text"
                inputMode="numeric"
                value={amountOverride !== null ? amountOverride : amount ? amount.toLocaleString() : ""}
                onChange={(e) => setAmountOverride(e.target.value)}
                placeholder="자동 계산"
                className={`${inputCls} ${amountOverride !== null ? "border-gold/40" : ""}`}
              />
            </div>
            <div>
              <label className={labelCls}>청구 합계{vatSeparate ? " (VAT 포함)" : ""}</label>
              <div className="px-3 py-2.5 text-sm font-semibold text-gold bg-navy-light border border-border rounded-xl">
                {total.toLocaleString()}원
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={vatSeparate}
                onChange={(e) => setVatSeparate(e.target.checked)}
                className="w-4 h-4 accent-[#C8A961]"
              />
              부가세 10% 별도 청구
            </label>
            {amountOverride !== null && (
              <button
                onClick={() => setAmountOverride(null)}
                className="flex items-center gap-1 text-xs text-text-dim hover:text-gold transition-colors"
              >
                <Calculator className="w-3 h-3" />
                자동 계산으로 되돌리기
              </button>
            )}
          </div>

          {/* 2. 청구서 문구 */}
          <div>
            <label className={labelCls}>청구 안내문 (수정 가능)</label>
            <textarea
              value={finalMessage}
              onChange={(e) => setMessage(e.target.value)}
              rows={11}
              className={`${inputCls} resize-y font-normal leading-relaxed`}
            />
          </div>

          {/* 3. 발송 */}
          <div className="flex gap-2">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="의뢰인 휴대폰 번호"
              className={`${inputCls} flex-1`}
            />
            <button
              onClick={handleSend}
              disabled={sending || phone.replace(/\D/g, "").length < 10}
              className="flex items-center gap-1.5 px-4 py-2 bg-gold-dim text-gold rounded-xl text-sm font-medium hover:bg-gold/20 transition-colors whitespace-nowrap disabled:opacity-40"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {sent ? "발송됨" : "문자 발송"}
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 border border-border text-text-dim rounded-xl text-sm font-medium hover:border-gold/30 hover:text-gold transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "복사됨" : "복사"}
            </button>
          </div>

          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border sticky bottom-0 bg-navy">
          <p className="text-[11px] text-text-dim">청구 확정 시 상태가 "청구완료"로 바뀌고 미수금 추적이 시작됩니다</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={confirming}
              className="px-4 py-2 text-sm text-text-dim border border-border rounded-xl hover:border-border-hover transition-colors"
            >
              닫기
            </button>
            <button
              onClick={handleConfirmClaim}
              disabled={confirming || amount <= 0}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-gradient-to-r from-gold to-gold-bright text-navy rounded-xl hover:shadow-lg hover:shadow-gold/20 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
              {total.toLocaleString()}원 청구 확정
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
