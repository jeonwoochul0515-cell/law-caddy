import { useState, useMemo } from "react";
import {
  FileSignature,
  Banknote,
  Trophy,
  CreditCard,
  Wallet,
  Building2,
  CalendarClock,
  Plus,
  Trash2,
  Check,
  X,
  Upload,
  AlertTriangle,
  TrendingUp,
  Calculator,
  ChevronDown,
  ChevronUp,
  Percent,
  Layers,
} from "lucide-react";
import type {
  Fee,
  Installment,
  PaymentMethodType,
  FeeContract,
  RetainerInfo,
  SuccessFeeInfo,
  VatInfo,
} from "../../types/accounting";
import SuccessFeeClaimModal from "./SuccessFeeClaimModal";

// ─── Props ───────────────────────────────────

/** 성공보수 청구서 생성·발송에 필요한 사건·사무소 정보 */
export interface SuccessFeeClaimContext {
  clientPhone?: string;
  firmName: string;
  lawyerName: string;
  /** 청구서에 표기할 사건 설명 (사건번호 또는 개요 요약) */
  caseLabel: string;
}

interface FeeManagementTabProps {
  fee: Fee | null;
  installments: Installment[];
  onCreateFee: (data: Omit<Fee, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onUpdateFee: (data: Partial<Fee>) => Promise<void>;
  onCreateInstallment: (data: Omit<Installment, "id">) => Promise<void>;
  onUpdateInstallment: (id: string, data: Partial<Installment>) => Promise<void>;
  onDeleteInstallment: (id: string) => Promise<void>;
  caseId: string;
  ownerId: string;
  clientName: string;
  /** 있으면 성공보수 섹션에 "청구서 만들기·발송" 버튼이 활성화된다 */
  claimContext?: SuccessFeeClaimContext;
}

// ─── 상수 ────────────────────────────────────

const PAYMENT_METHODS: { value: PaymentMethodType; label: string; icon: React.ElementType }[] = [
  { value: "계좌이체", label: "계좌이체", icon: Building2 },
  { value: "카드", label: "카드", icon: CreditCard },
  { value: "현금", label: "현금", icon: Wallet },
  { value: "수표", label: "수표", icon: Banknote },
];

const CONTRACT_TYPES: FeeContract["contractType"][] = ["서면", "전자", "구두"];

const SUCCESS_FEE_STATUS_COLORS: Record<SuccessFeeInfo["status"], string> = {
  "미확정": "bg-warning/15 text-warning",
  "청구가능": "bg-info/15 text-info",
  "청구완료": "bg-gold-dim text-gold",
  "입금완료": "bg-success/15 text-success",
  "해당없음": "bg-surface text-text-dim",
};

const FEE_STATUS_COLORS: Record<Fee["status"], string> = {
  "완납": "bg-success/15 text-success",
  "미완납": "bg-error/15 text-error",
  "초과납부": "bg-info/15 text-info",
  "면제": "bg-surface text-text-dim",
};

// ─── 유틸 ────────────────────────────────────

/** 숫자를 한국 원화 형식으로 포맷 */
function formatWon(amount: number): string {
  return `${amount.toLocaleString()}원`;
}

/** 문자열에서 숫자만 파싱 */
function parseAmount(value: string): number {
  const cleaned = value.replace(/[^0-9]/g, "");
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/** 오늘 날짜 YYYY-MM-DD */
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 예정일이 오늘보다 과거이고 미납인지 확인 */
function isOverdue(dueDate: string, paid: boolean): boolean {
  if (paid) return false;
  return dueDate < todayString();
}

/** 공급가액에서 부가세 자동 계산 (10%) */
function calculateVat(supplyAmount: number): VatInfo {
  const vatAmount = Math.round(supplyAmount * 0.1);
  return {
    supplyAmount,
    vatAmount,
    totalAmount: supplyAmount + vatAmount,
  };
}

// ─── 기본 Fee 생성 헬퍼 ──────────────────────

function buildDefaultFee(
  caseId: string,
  ownerId: string,
  clientName: string,
): Omit<Fee, "id" | "createdAt" | "updatedAt"> {
  return {
    caseId,
    ownerId,
    clientName,
    contract: {
      signed: false,
      contractType: "서면",
    },
    retainer: {
      amount: 0,
      paidAmount: 0,
      paid: false,
    },
    successFee: {
      agreed: false,
      status: "해당없음",
    },
    useInstallment: false,
    totalAgreedAmount: 0,
    totalPaidAmount: 0,
    totalOutstanding: 0,
    status: "미완납",
    evidenceType: "없음",
    evidenceIssued: false,
    attachments: [],
  };
}

// ─── 메인 컴포넌트 ───────────────────────────

export default function FeeManagementTab({
  fee,
  installments,
  onCreateFee,
  onUpdateFee,
  onCreateInstallment,
  onUpdateInstallment,
  onDeleteInstallment,
  caseId,
  ownerId,
  clientName,
  claimContext,
}: FeeManagementTabProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    contract: true,
    retainer: true,
    installment: true,
    successFee: true,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Fee가 없으면 생성 버튼 표시
  if (!fee) {
    return (
      <div className="space-y-6">
        <div className="bg-surface border border-border rounded-2xl p-8 backdrop-blur-sm text-center">
          <Banknote className="w-12 h-12 text-text-dim/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            수임료 관리를 시작하세요
          </h3>
          <p className="text-sm text-text-dim mb-6">
            수임 계약 정보, 착수금, 분할납부, 성공보수를 관리할 수 있습니다.
          </p>
          <button
            onClick={() => onCreateFee(buildDefaultFee(caseId, ownerId, clientName))}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm"
          >
            <Plus className="w-4 h-4" />
            수임료 관리 시작
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 요약 대시보드 */}
      <SummaryDashboard fee={fee} installments={installments} />

      {/* 수임 계약 정보 */}
      <CollapsibleSection
        title="수임 계약 정보"
        icon={FileSignature}
        iconColor="text-gold"
        expanded={expandedSections.contract}
        onToggle={() => toggleSection("contract")}
      >
        <ContractSection
          contract={fee.contract}
          onUpdate={(contract) => onUpdateFee({ contract })}
        />
      </CollapsibleSection>

      {/* 착수금 관리 */}
      <CollapsibleSection
        title="착수금 관리"
        icon={Banknote}
        iconColor="text-success"
        expanded={expandedSections.retainer}
        onToggle={() => toggleSection("retainer")}
        badge={fee.retainer.paid ? "납부완료" : "미납"}
        badgeColor={fee.retainer.paid ? "bg-success/15 text-success" : "bg-error/15 text-error"}
      >
        <RetainerSection
          retainer={fee.retainer}
          onUpdate={(retainer) => onUpdateFee({ retainer })}
        />
      </CollapsibleSection>

      {/* 분할납부 스케줄 */}
      <CollapsibleSection
        title="분할납부 스케줄"
        icon={CalendarClock}
        iconColor="text-info"
        expanded={expandedSections.installment}
        onToggle={() => toggleSection("installment")}
        badge={fee.useInstallment ? `${installments.length}회` : "미사용"}
        badgeColor={fee.useInstallment ? "bg-info/15 text-info" : "bg-surface text-text-dim"}
      >
        <InstallmentSection
          fee={fee}
          installments={installments}
          onUpdateFee={onUpdateFee}
          onCreateInstallment={onCreateInstallment}
          onUpdateInstallment={onUpdateInstallment}
          onDeleteInstallment={onDeleteInstallment}
        />
      </CollapsibleSection>

      {/* 성공보수 */}
      <CollapsibleSection
        title="성공보수"
        icon={Trophy}
        iconColor="text-gold"
        expanded={expandedSections.successFee}
        onToggle={() => toggleSection("successFee")}
        badge={fee.successFee.status}
        badgeColor={SUCCESS_FEE_STATUS_COLORS[fee.successFee.status]}
      >
        <SuccessFeeSection
          successFee={fee.successFee}
          onUpdate={(successFee) => onUpdateFee({ successFee })}
          clientName={clientName}
          claimContext={claimContext}
        />
      </CollapsibleSection>
    </div>
  );
}

// ─── 요약 대시보드 ───────────────────────────

function SummaryDashboard({
  fee,
  installments,
}: {
  fee: Fee;
  installments: Installment[];
}) {
  const overdueCount = installments.filter((inst) => isOverdue(inst.dueDate, inst.paid)).length;

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-semibold text-text-primary">수임료 요약</h3>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${FEE_STATUS_COLORS[fee.status]}`}>
          {fee.status}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-navy-light rounded-lg p-3 text-center">
          <p className="text-xs text-text-dim mb-1">총 약정 수임료</p>
          <p className="text-sm font-semibold text-text-primary">
            {formatWon(fee.totalAgreedAmount)}
          </p>
        </div>
        <div className="bg-navy-light rounded-lg p-3 text-center">
          <p className="text-xs text-text-dim mb-1">실수령액</p>
          <p className="text-sm font-semibold text-success">
            {formatWon(fee.totalPaidAmount)}
          </p>
        </div>
        <div className={`bg-navy-light rounded-lg p-3 text-center ${fee.totalOutstanding > 0 ? "ring-1 ring-error/30" : ""}`}>
          <p className="text-xs text-text-dim mb-1">미수금</p>
          <p className={`text-sm font-semibold ${fee.totalOutstanding > 0 ? "text-error" : "text-success"}`}>
            {formatWon(fee.totalOutstanding)}
          </p>
        </div>
      </div>

      {overdueCount > 0 && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-error/10 border border-error/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-error shrink-0" />
          <p className="text-xs text-error">
            연체된 분할납부가 {overdueCount}건 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 접이식 섹션 래퍼 ────────────────────────

function CollapsibleSection({
  title,
  icon: Icon,
  iconColor,
  expanded,
  onToggle,
  badge,
  badgeColor,
  children,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  expanded: boolean;
  onToggle: () => void;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 hover:bg-navy-light/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {badge && badgeColor && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-text-dim" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-dim" />
        )}
      </button>
      {expanded && (
        <div className="px-5 pb-5 border-t border-border/50">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── 수임 계약 정보 섹션 ─────────────────────

function ContractSection({
  contract,
  onUpdate,
}: {
  contract: FeeContract;
  onUpdate: (contract: FeeContract) => void;
}) {
  const safeUpdate = (updated: FeeContract) => {
    try {
      onUpdate(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "변경 실패";
      alert(`계약 정보 변경 실패: ${message}`);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      {/* 계약 체결 여부 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">계약 체결</span>
        <button
          onClick={() => safeUpdate({ ...contract, signed: !contract.signed })}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            contract.signed
              ? "border-success/40 bg-success/15 text-success"
              : "border-error/30 bg-error/10 text-error"
          }`}
        >
          {contract.signed ? "체결완료" : "미체결"}
        </button>
      </div>

      {/* 계약 형태 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">계약 형태</span>
        <div className="flex gap-1.5">
          {CONTRACT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => safeUpdate({ ...contract, contractType: type })}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                contract.contractType === type
                  ? "border-gold/40 bg-gold-dim text-gold"
                  : "border-border text-text-dim hover:border-border-hover"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* 계약 체결일 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">계약 체결일</span>
        <input
          type="date"
          value={contract.signedDate ?? ""}
          onChange={(e) => safeUpdate({ ...contract, signedDate: e.target.value || undefined })}
          className="px-3 py-1.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary focus:border-gold focus:outline-none"
        />
      </div>

      {/* 계약서 파일 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">계약서 파일</span>
        <div className="flex items-center gap-2">
          {contract.contractFileUrl ? (
            <span className="text-xs text-success">업로드 완료</span>
          ) : (
            <span className="text-xs text-text-dim">미등록</span>
          )}
          <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gold/20 rounded-lg text-xs text-gold hover:border-gold/40 hover:bg-gold-dim transition-colors">
            <Upload className="w-3 h-3" />
            업로드
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 착수금 관리 섹션 ────────────────────────

function RetainerSection({
  retainer,
  onUpdate,
}: {
  retainer: RetainerInfo;
  onUpdate: (retainer: RetainerInfo) => void;
}) {
  const [amountInput, setAmountInput] = useState(
    retainer.amount > 0 ? retainer.amount.toLocaleString() : "",
  );
  const [editingAmount, setEditingAmount] = useState(false);
  const [showVat, setShowVat] = useState(!!retainer.vat);
  const [busy, setBusy] = useState(false);

  const safeUpdate = (updated: RetainerInfo) => {
    try {
      onUpdate(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "변경 실패";
      alert(`착수금 정보 변경 실패: ${message}`);
    }
  };

  const handleAmountSubmit = () => {
    const amount = parseAmount(amountInput);
    if (amount > 0) {
      const updated: RetainerInfo = { ...retainer, amount };
      if (showVat) {
        updated.vat = calculateVat(amount);
      }
      safeUpdate(updated);
    }
    setEditingAmount(false);
  };

  const handleVatToggle = () => {
    const next = !showVat;
    setShowVat(next);
    if (next && retainer.amount > 0) {
      safeUpdate({ ...retainer, vat: calculateVat(retainer.amount) });
    } else {
      safeUpdate({ ...retainer, vat: undefined });
    }
  };

  return (
    <div className="space-y-4 pt-4">
      {/* 착수금 금액 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">착수금 금액</span>
        {editingAmount ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAmountSubmit()}
              placeholder="금액 입력"
              className="w-36 px-3 py-1.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary text-right placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
              autoFocus
            />
            <span className="text-xs text-text-dim">원</span>
            <button
              onClick={handleAmountSubmit}
              className="px-2 py-1 text-xs text-gold hover:text-gold-bright"
            >
              확인
            </button>
            <button
              onClick={() => setEditingAmount(false)}
              className="px-2 py-1 text-xs text-text-dim"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setAmountInput(retainer.amount > 0 ? retainer.amount.toLocaleString() : "");
              setEditingAmount(true);
            }}
            className="text-sm text-text-primary hover:text-gold transition-colors"
          >
            {retainer.amount > 0 ? formatWon(retainer.amount) : "금액 입력"}
          </button>
        )}
      </div>

      {/* 납부 상태 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">납부 상태</span>
        <button
          onClick={() => {
            if (busy) return;
            setBusy(true);
            const nextPaid = !retainer.paid;
            try {
              safeUpdate({
                ...retainer,
                paid: nextPaid,
                paidAmount: nextPaid ? retainer.amount : 0,
                paidDate: nextPaid ? todayString() : undefined,
              });
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 ${
            retainer.paid
              ? "border-success/40 bg-success/15 text-success"
              : "border-error/30 bg-error/10 text-error"
          }`}
        >
          {retainer.paid ? "납부완료" : "미납"}
        </button>
      </div>

      {/* 납부일 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">납부일</span>
        <input
          type="date"
          value={retainer.paidDate ?? ""}
          onChange={(e) => safeUpdate({ ...retainer, paidDate: e.target.value || undefined })}
          className="px-3 py-1.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary focus:border-gold focus:outline-none"
        />
      </div>

      {/* 결제 수단 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">결제 수단</span>
        <div className="flex gap-1.5">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => safeUpdate({ ...retainer, paymentMethod: m.value })}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                retainer.paymentMethod === m.value
                  ? "border-gold/40 bg-gold-dim text-gold"
                  : "border-border text-text-dim hover:border-border-hover"
              }`}
            >
              <m.icon className="w-3 h-3" />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* 부가세 토글 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">부가세 적용</span>
        <button
          onClick={handleVatToggle}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            showVat
              ? "border-gold/40 bg-gold-dim text-gold"
              : "border-border text-text-dim hover:border-border-hover"
          }`}
        >
          {showVat ? "적용중" : "미적용"}
        </button>
      </div>

      {/* 부가세 정보 */}
      {showVat && retainer.vat && (
        <div className="p-3 bg-navy-light/50 rounded-lg space-y-2 border border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-3.5 h-3.5 text-gold" />
            <span className="text-xs text-gold font-medium">부가세 내역</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-dim">공급가액</span>
            <span className="text-xs text-text-primary">
              {formatWon(retainer.vat.supplyAmount)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-dim">부가세 (10%)</span>
            <span className="text-xs text-text-primary">
              {formatWon(retainer.vat.vatAmount)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-border/50 pt-2">
            <span className="text-xs text-text-dim font-medium">합계</span>
            <span className="text-xs text-text-primary font-semibold">
              {formatWon(retainer.vat.totalAmount)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 분할납부 스케줄 섹션 ────────────────────

function InstallmentSection({
  fee,
  installments,
  onUpdateFee,
  onCreateInstallment,
  onUpdateInstallment,
  onDeleteInstallment,
}: {
  fee: Fee;
  installments: Installment[];
  onUpdateFee: (data: Partial<Fee>) => Promise<void>;
  onCreateInstallment: (data: Omit<Installment, "id">) => Promise<void>;
  onUpdateInstallment: (id: string, data: Partial<Installment>) => Promise<void>;
  onDeleteInstallment: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyInstallmentId, setBusyInstallmentId] = useState<string | null>(null);
  const [newDueDate, setNewDueDate] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedInstallments = useMemo(
    () => [...installments].sort((a, b) => a.seq - b.seq),
    [installments],
  );

  const totalScheduled = sortedInstallments.reduce((sum, inst) => sum + inst.amount, 0);
  const totalPaid = sortedInstallments.reduce((sum, inst) => sum + inst.paidAmount, 0);
  const paidCount = sortedInstallments.filter((inst) => inst.paid).length;
  const progressPercent = totalScheduled > 0 ? Math.min(100, Math.round((totalPaid / totalScheduled) * 100)) : 0;

  const handleToggleInstallment = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onUpdateFee({ useInstallment: !fee.useInstallment });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "변경 실패";
      alert(`분할납부 설정 실패: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddInstallment = async () => {
    const amount = parseAmount(newAmount);
    if (!newDueDate || amount <= 0 || submitting) return;

    const nextSeq = sortedInstallments.length > 0
      ? Math.max(...sortedInstallments.map((i) => i.seq)) + 1
      : 1;

    setSubmitting(true);
    try {
      await onCreateInstallment({
        feeId: fee.id,
        seq: nextSeq,
        dueDate: newDueDate,
        amount,
        paidAmount: 0,
        paid: false,
        overdue: isOverdue(newDueDate, false),
      });

      setNewDueDate("");
      setNewAmount("");
      setAdding(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "등록 실패";
      alert(`분할납부 등록 실패: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePaid = async (inst: Installment) => {
    if (busyInstallmentId) return;
    setBusyInstallmentId(inst.id);
    try {
      const nextPaid = !inst.paid;
      await onUpdateInstallment(inst.id, {
        paid: nextPaid,
        paidAmount: nextPaid ? inst.amount : 0,
        paidDate: nextPaid ? todayString() : undefined,
        overdue: !nextPaid && isOverdue(inst.dueDate, false),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "변경 실패";
      alert(`납부 상태 변경 실패: ${message}`);
    } finally {
      setBusyInstallmentId(null);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      {/* 분할납부 토글 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">분할납부 사용</span>
        <button
          onClick={handleToggleInstallment}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            fee.useInstallment
              ? "border-gold/40 bg-gold-dim text-gold"
              : "border-border text-text-dim hover:border-border-hover"
          }`}
        >
          {fee.useInstallment ? "사용중" : "미사용"}
        </button>
      </div>

      {fee.useInstallment && (
        <>
          {/* 분할납부 요약 + 진행 바 */}
          {sortedInstallments.length > 0 && (
            <div className="p-3 bg-navy-light/50 rounded-lg border border-border/50 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-[11px] text-text-dim">예정 총액</p>
                  <p className="text-xs font-semibold text-text-primary">
                    {formatWon(totalScheduled)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-text-dim">납부 완료</p>
                  <p className="text-xs font-semibold text-success">
                    {formatWon(totalPaid)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-text-dim">진행률</p>
                  <p className="text-xs font-semibold text-info">
                    {paidCount}/{sortedInstallments.length}회 ({progressPercent}%)
                  </p>
                </div>
              </div>

              {/* 프로그레스 바 */}
              <div className="w-full h-2 bg-navy-light rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold to-gold-bright rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* 분할납부 리스트 */}
          {sortedInstallments.length === 0 ? (
            <p className="text-sm text-text-dim text-center py-3">
              등록된 분할납부 스케줄이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {sortedInstallments.map((inst) => {
                const overdue = isOverdue(inst.dueDate, inst.paid);

                return (
                  <div
                    key={inst.id}
                    className={`flex items-center gap-3 p-3 rounded-lg group transition-colors ${
                      overdue
                        ? "bg-error/10 border border-error/20"
                        : "bg-navy-light"
                    }`}
                  >
                    {/* 납부 토글 */}
                    <button
                      onClick={() => handleTogglePaid(inst)}
                      disabled={busyInstallmentId === inst.id}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 ${
                        inst.paid
                          ? "border-success bg-success/20"
                          : overdue
                            ? "border-error/50 hover:border-error"
                            : "border-text-dim/30 hover:border-gold/50"
                      }`}
                    >
                      {inst.paid && <Check className="w-3 h-3 text-success" />}
                    </button>

                    {/* 회차 */}
                    <span className={`text-xs font-semibold shrink-0 w-10 ${
                      overdue ? "text-error" : "text-text-dim"
                    }`}>
                      {inst.seq}회차
                    </span>

                    {/* 예정일 */}
                    <span className={`text-xs shrink-0 ${
                      overdue ? "text-error font-medium" : "text-text-dim"
                    }`}>
                      {inst.dueDate}
                    </span>

                    {/* 연체 표시 */}
                    {overdue && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-error/20 text-error shrink-0">
                        연체
                      </span>
                    )}

                    {/* 금액 */}
                    <div className="flex-1 text-right">
                      <span className={`text-sm font-medium ${
                        inst.paid ? "text-success" : overdue ? "text-error" : "text-text-primary"
                      }`}>
                        {formatWon(inst.amount)}
                      </span>
                      {inst.paid && inst.paidAmount !== inst.amount && (
                        <span className="text-[11px] text-text-dim ml-1">
                          (실납부: {formatWon(inst.paidAmount)})
                        </span>
                      )}
                    </div>

                    {/* 삭제 */}
                    {confirmDeleteId === inst.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={async () => {
                            if (busyInstallmentId) return;
                            setBusyInstallmentId(inst.id);
                            try {
                              await onDeleteInstallment(inst.id);
                              setConfirmDeleteId(null);
                            } catch (err: unknown) {
                              const message = err instanceof Error ? err.message : "삭제 실패";
                              alert(`분할납부 삭제 실패: ${message}`);
                            } finally {
                              setBusyInstallmentId(null);
                            }
                          }}
                          disabled={busyInstallmentId === inst.id}
                          className="px-2 py-0.5 text-xs text-error border border-error/30 rounded hover:bg-error/10 transition-colors disabled:opacity-40"
                        >
                          삭제
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 text-xs text-text-dim border border-border rounded hover:border-border-hover transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(inst.id)}
                        className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-error transition-all shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 회차 추가 */}
          {adding ? (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[11px] text-text-dim mb-1 block">예정일</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-text-dim mb-1 block">예정금액 (원)</label>
                <input
                  type="text"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddInstallment()}
                  placeholder="1,000,000"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                />
              </div>
              <button
                onClick={handleAddInstallment}
                disabled={!newDueDate || !newAmount || submitting}
                className="px-3 py-2 bg-gold-dim text-gold rounded-lg text-sm hover:bg-gold/20 transition-colors disabled:opacity-40"
              >
                {submitting ? "등록 중..." : "추가"}
              </button>
              <button
                onClick={() => { setAdding(false); setNewDueDate(""); setNewAmount(""); }}
                className="p-2 text-text-dim hover:text-text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full flex items-center justify-center gap-1.5 p-2.5 border border-dashed border-border rounded-lg text-xs text-text-dim hover:border-gold/30 hover:text-gold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              회차 추가
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── 성공보수 섹션 ───────────────────────────

function SuccessFeeSection({
  successFee,
  onUpdate,
  clientName,
  claimContext,
}: {
  successFee: SuccessFeeInfo;
  onUpdate: (successFee: SuccessFeeInfo) => void;
  clientName: string;
  claimContext?: SuccessFeeClaimContext;
}) {
  const [claimOpen, setClaimOpen] = useState(false);
  const [editingPercent, setEditingPercent] = useState(false);
  const [percentInput, setPercentInput] = useState(String(successFee.percent ?? ""));
  const [editingFixed, setEditingFixed] = useState(false);
  const [fixedInput, setFixedInput] = useState(
    successFee.fixedAmount ? successFee.fixedAmount.toLocaleString() : "",
  );
  const [conditionInput, setConditionInput] = useState(successFee.condition ?? "");
  const [addingTier, setAddingTier] = useState(false);
  const [tierThreshold, setTierThreshold] = useState("");
  const [tierPercent, setTierPercent] = useState("");

  const feeType = successFee.type ?? "percent";
  const tiers = successFee.tiers ?? [];

  const handleToggleAgreed = () => {
    const nextAgreed = !successFee.agreed;
    onUpdate({
      ...successFee,
      agreed: nextAgreed,
      status: nextAgreed ? "미확정" : "해당없음",
      type: nextAgreed ? "percent" : undefined,
    });
  };

  const handleTypeChange = (type: SuccessFeeInfo["type"]) => {
    onUpdate({
      ...successFee,
      type,
      percent: undefined,
      fixedAmount: undefined,
      tiers: type === "tiered" ? [] : undefined,
    });
  };

  const handlePercentSubmit = () => {
    const val = parseFloat(percentInput);
    if (!isNaN(val) && val > 0) {
      onUpdate({ ...successFee, percent: val });
    }
    setEditingPercent(false);
  };

  const handleFixedSubmit = () => {
    const val = parseAmount(fixedInput);
    if (val > 0) {
      onUpdate({ ...successFee, fixedAmount: val });
    }
    setEditingFixed(false);
  };

  const handleAddTier = () => {
    const threshold = parseAmount(tierThreshold);
    const pct = parseFloat(tierPercent);
    if (threshold > 0 && !isNaN(pct) && pct > 0) {
      const newTiers = [...tiers, { threshold, percent: pct }].sort(
        (a, b) => a.threshold - b.threshold,
      );
      onUpdate({ ...successFee, tiers: newTiers });
      setTierThreshold("");
      setTierPercent("");
      setAddingTier(false);
    }
  };

  const handleRemoveTier = (index: number) => {
    const newTiers = tiers.filter((_, i) => i !== index);
    onUpdate({ ...successFee, tiers: newTiers });
  };

  const statusOptions: SuccessFeeInfo["status"][] = [
    "미확정",
    "청구가능",
    "청구완료",
    "입금완료",
  ];

  return (
    <div className="space-y-4 pt-4">
      {/* 성공보수 약정 토글 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-primary">성공보수 약정</span>
        <button
          onClick={handleToggleAgreed}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            successFee.agreed
              ? "border-gold/40 bg-gold-dim text-gold"
              : "border-border text-text-dim hover:border-border-hover"
          }`}
        >
          {successFee.agreed ? "약정됨" : "없음"}
        </button>
      </div>

      {successFee.agreed && (
        <>
          {/* 유형 선택 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary">보수 유형</span>
            <div className="flex gap-1.5">
              {([
                { value: "percent" as const, label: "비율(%)", icon: Percent },
                { value: "fixed" as const, label: "정액", icon: Banknote },
                { value: "tiered" as const, label: "구간별", icon: Layers },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleTypeChange(opt.value)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                    feeType === opt.value
                      ? "border-gold/40 bg-gold-dim text-gold"
                      : "border-border text-text-dim hover:border-border-hover"
                  }`}
                >
                  <opt.icon className="w-3 h-3" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 비율 입력 */}
          {feeType === "percent" && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-primary">비율</span>
              {editingPercent ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={percentInput}
                    onChange={(e) => setPercentInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePercentSubmit()}
                    placeholder="예: 10"
                    className="w-24 px-3 py-1.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary text-right placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                    autoFocus
                  />
                  <span className="text-xs text-text-dim">%</span>
                  <button onClick={handlePercentSubmit} className="px-2 py-1 text-xs text-gold hover:text-gold-bright">
                    확인
                  </button>
                  <button onClick={() => setEditingPercent(false)} className="px-2 py-1 text-xs text-text-dim">
                    취소
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setPercentInput(String(successFee.percent ?? ""));
                    setEditingPercent(true);
                  }}
                  className="text-sm text-text-primary hover:text-gold transition-colors"
                >
                  {successFee.percent ? `${successFee.percent}%` : "비율 입력"}
                </button>
              )}
            </div>
          )}

          {/* 정액 입력 */}
          {feeType === "fixed" && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-primary">금액</span>
              {editingFixed ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={fixedInput}
                    onChange={(e) => setFixedInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFixedSubmit()}
                    placeholder="금액 입력"
                    className="w-36 px-3 py-1.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary text-right placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                    autoFocus
                  />
                  <span className="text-xs text-text-dim">원</span>
                  <button onClick={handleFixedSubmit} className="px-2 py-1 text-xs text-gold hover:text-gold-bright">
                    확인
                  </button>
                  <button onClick={() => setEditingFixed(false)} className="px-2 py-1 text-xs text-text-dim">
                    취소
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setFixedInput(
                      successFee.fixedAmount ? successFee.fixedAmount.toLocaleString() : "",
                    );
                    setEditingFixed(true);
                  }}
                  className="text-sm text-text-primary hover:text-gold transition-colors"
                >
                  {successFee.fixedAmount
                    ? formatWon(successFee.fixedAmount)
                    : "금액 입력"}
                </button>
              )}
            </div>
          )}

          {/* 구간별 */}
          {feeType === "tiered" && (
            <div className="space-y-2">
              {tiers.length > 0 && (
                <div className="p-3 bg-navy-light/50 rounded-lg border border-border/50 space-y-2">
                  <p className="text-xs text-text-dim font-medium mb-1">구간별 보수</p>
                  {tiers.map((tier, idx) => (
                    <div key={`${tier.threshold}-${tier.percent}`} className="flex items-center justify-between group">
                      <span className="text-xs text-text-primary">
                        {formatWon(tier.threshold)} 이하
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gold font-medium">{tier.percent}%</span>
                        <button
                          onClick={() => handleRemoveTier(idx)}
                          className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-error transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {addingTier ? (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[11px] text-text-dim mb-1 block">기준 금액 (원)</label>
                    <input
                      type="text"
                      value={tierThreshold}
                      onChange={(e) => setTierThreshold(e.target.value)}
                      placeholder="100,000,000"
                      className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-[11px] text-text-dim mb-1 block">비율 (%)</label>
                    <input
                      type="text"
                      value={tierPercent}
                      onChange={(e) => setTierPercent(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTier()}
                      placeholder="10"
                      className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleAddTier}
                    className="px-3 py-2 bg-gold-dim text-gold rounded-lg text-sm hover:bg-gold/20 transition-colors"
                  >
                    추가
                  </button>
                  <button
                    onClick={() => { setAddingTier(false); setTierThreshold(""); setTierPercent(""); }}
                    className="p-2 text-text-dim hover:text-text-primary transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTier(true)}
                  className="w-full flex items-center justify-center gap-1.5 p-2.5 border border-dashed border-border rounded-lg text-xs text-text-dim hover:border-gold/30 hover:text-gold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  구간 추가
                </button>
              )}
            </div>
          )}

          {/* 성공 조건 */}
          <div>
            <label className="text-sm text-text-primary block mb-1.5">성공 조건</label>
            <input
              type="text"
              value={conditionInput}
              onChange={(e) => setConditionInput(e.target.value)}
              onBlur={() => {
                const val = conditionInput.trim() || undefined;
                if (val !== (successFee.condition ?? undefined)) {
                  onUpdate({ ...successFee, condition: val });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="예: 원고 승소 시, 합의금 수령 시 등"
              className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
            />
          </div>

          {/* 상태 변경 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary">진행 상태</span>
            <div className="flex gap-1.5 flex-wrap justify-end">
              {statusOptions.map((status) => (
                <button
                  key={status}
                  onClick={() => onUpdate({ ...successFee, status })}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors ${
                    successFee.status === status
                      ? SUCCESS_FEE_STATUS_COLORS[status] + " border-transparent"
                      : "border-border text-text-dim hover:border-border-hover"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* 청구액 표시 (청구 이후) */}
          {successFee.claimedAmount ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-dim">청구 금액</span>
              <span className="font-semibold text-gold">{formatWon(successFee.claimedAmount)}</span>
            </div>
          ) : null}

          {/* 청구서 만들기·발송 */}
          {claimContext && (successFee.status === "미확정" || successFee.status === "청구가능") && (
            <button
              onClick={() => setClaimOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-gold/20 active:scale-[0.98] transition-all"
            >
              <Trophy className="w-4 h-4" />
              성공보수 산정 · 청구서 발송
            </button>
          )}

          {claimOpen && claimContext && (
            <SuccessFeeClaimModal
              successFee={successFee}
              clientName={clientName}
              clientPhone={claimContext.clientPhone}
              firmName={claimContext.firmName}
              lawyerName={claimContext.lawyerName}
              caseLabel={claimContext.caseLabel}
              onClose={() => setClaimOpen(false)}
              onClaimed={async (claimedAmount) => {
                onUpdate({ ...successFee, status: "청구완료", claimedAmount });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
