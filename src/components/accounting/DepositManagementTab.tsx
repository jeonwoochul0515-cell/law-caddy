import { useState, useMemo } from "react";
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Landmark,
  Wallet,
  ShieldCheck,
  Handshake,
  Archive,
  Clock,
  ArrowDownLeft,
  RotateCcw,
  CalendarDays,
  CreditCard,
  Building2,
  Banknote,
  CircleDollarSign,
} from "lucide-react";
import type {
  Deposit,
  DepositType,
  DepositStatus,
  DepositUsage,
  CourtDepositInfo,
  PaymentMethodType,
} from "../../types/accounting";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface DepositManagementTabProps {
  deposits: Deposit[];
  onAdd: (data: Omit<Deposit, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onUpdate: (id: string, data: Partial<Deposit>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  caseId?: string;
  ownerId: string;
}

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const DEPOSIT_TYPES: { value: DepositType; label: string; icon: React.ElementType }[] = [
  { value: "의뢰인예치금", label: "의뢰인예치금", icon: Wallet },
  { value: "법원공탁금", label: "법원공탁금", icon: Landmark },
  { value: "보증금", label: "보증금", icon: ShieldCheck },
  { value: "합의금예치", label: "합의금예치", icon: Handshake },
  { value: "기타보관금", label: "기타보관금", icon: Archive },
];

const STATUS_FILTERS: { value: DepositStatus | "전체"; label: string }[] = [
  { value: "전체", label: "전체" },
  { value: "보관중", label: "보관중" },
  { value: "일부사용", label: "일부사용" },
  { value: "전액사용", label: "전액사용" },
  { value: "반환완료", label: "반환완료" },
  { value: "공탁중", label: "공탁중" },
];

const PAYMENT_METHODS: { value: PaymentMethodType; label: string; icon: React.ElementType }[] = [
  { value: "계좌이체", label: "계좌이체", icon: Building2 },
  { value: "카드", label: "카드", icon: CreditCard },
  { value: "현금", label: "현금", icon: Banknote },
  { value: "수표", label: "수표", icon: CircleDollarSign },
  { value: "기타", label: "기타", icon: Wallet },
];

// ─────────────────────────────────────────────
// 유틸 함수
// ─────────────────────────────────────────────

function depositTypeBadgeClass(type: DepositType): string {
  switch (type) {
    case "의뢰인예치금":
      return "border-info/30 bg-info/10 text-info";
    case "법원공탁금":
      return "border-gold/30 bg-gold-dim text-gold";
    case "보증금":
      return "border-warning/30 bg-warning/10 text-warning";
    case "합의금예치":
      return "border-success/30 bg-success/10 text-success";
    case "기타보관금":
      return "border-border bg-navy-light text-text-dim";
  }
}

function statusBadgeClass(status: DepositStatus): string {
  switch (status) {
    case "보관중":
      return "border-info/30 bg-info/10 text-info";
    case "일부사용":
      return "border-warning/30 bg-warning/10 text-warning";
    case "전액사용":
      return "border-border bg-navy-light text-text-dim";
    case "반환완료":
      return "border-success/30 bg-success/10 text-success";
    case "공탁중":
      return "border-gold/30 bg-gold-dim text-gold";
  }
}

function calcDaysHeld(receivedDate: string): number {
  const ms = new Date(receivedDate).getTime();
  if (isNaN(ms)) return 0;
  const days = Math.ceil((Date.now() - ms) / (1000 * 60 * 60 * 24));
  return days < 0 ? 0 : days;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────
// 새 예수금 폼 초기 상태
// ─────────────────────────────────────────────

interface NewDepositForm {
  type: DepositType;
  clientName: string;
  description: string;
  amount: string;
  receivedDate: string;
  receivedMethod: PaymentMethodType;
  bankName: string;
  accountNumber: string;
  courtName: string;
  courtDepositNumber: string;
  courtDepositDate: string;
  courtDepositReason: string;
  memo: string;
}

function createInitialForm(): NewDepositForm {
  return {
    type: "의뢰인예치금",
    clientName: "",
    description: "",
    amount: "",
    receivedDate: today(),
    receivedMethod: "계좌이체",
    bankName: "",
    accountNumber: "",
    courtName: "",
    courtDepositNumber: "",
    courtDepositDate: "",
    courtDepositReason: "",
    memo: "",
  };
}

// ─────────────────────────────────────────────
// 사용 등록 미니 폼 상태
// ─────────────────────────────────────────────

interface UsageForm {
  date: string;
  amount: string;
  purpose: string;
}

function createInitialUsage(): UsageForm {
  return {
    date: today(),
    amount: "",
    purpose: "",
  };
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────

export default function DepositManagementTab({
  deposits,
  onAdd,
  onUpdate,
  onDelete,
  caseId,
  ownerId,
}: DepositManagementTabProps) {
  // 폼 상태
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewDepositForm>(createInitialForm());
  const [submitting, setSubmitting] = useState(false);

  // 필터
  const [statusFilter, setStatusFilter] = useState<DepositStatus | "전체">("전체");

  // 상세 열림 / 사용 등록 열림
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [usageFormId, setUsageFormId] = useState<string | null>(null);
  const [usageForm, setUsageForm] = useState<UsageForm>(createInitialUsage());

  // 반환 확인
  const [returningId, setReturningId] = useState<string | null>(null);

  // 삭제 확인
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 개별 항목 처리 중 (double-click 방지)
  const [busyDepositId, setBusyDepositId] = useState<string | null>(null);

  // ── 필터링 ──
  const filtered = useMemo(() => {
    let list = caseId ? deposits.filter((d) => d.caseId === caseId) : deposits;
    if (statusFilter !== "전체") {
      list = list.filter((d) => d.status === statusFilter);
    }
    return list;
  }, [deposits, caseId, statusFilter]);

  // ── 요약 계산 ──
  const activeDeposits = useMemo(
    () =>
      (caseId ? deposits.filter((d) => d.caseId === caseId) : deposits).filter(
        (d) => d.status !== "반환완료",
      ),
    [deposits, caseId],
  );

  const totalHolding = activeDeposits.reduce((s, d) => s + d.remainingAmount, 0);
  const totalUsed = activeDeposits.reduce((s, d) => s + d.usedAmount, 0);
  const totalRemaining = activeDeposits.reduce((s, d) => s + d.remainingAmount, 0);

  // ── 폼 핸들러 ──
  const updateForm = <K extends keyof NewDepositForm>(key: K, value: NewDepositForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    const parsedAmount = parseInt(form.amount.replace(/[^0-9]/g, ""), 10);
    if (!form.clientName.trim() || !form.description.trim() || isNaN(parsedAmount) || parsedAmount <= 0) return;

    setSubmitting(true);
    try {
      const courtDeposit: CourtDepositInfo | undefined =
        form.type === "법원공탁금" && form.courtName.trim()
          ? {
              courtName: form.courtName.trim(),
              depositNumber: form.courtDepositNumber.trim(),
              depositDate: form.courtDepositDate || form.receivedDate,
              depositReason: form.courtDepositReason.trim(),
            }
          : undefined;

      await onAdd({
        ownerId,
        caseId,
        clientName: form.clientName.trim(),
        type: form.type,
        description: form.description.trim(),
        originalAmount: parsedAmount,
        usedAmount: 0,
        remainingAmount: parsedAmount,
        status: form.type === "법원공탁금" ? "공탁중" : "보관중",
        receivedDate: form.receivedDate,
        receivedMethod: form.receivedMethod,
        bankName: form.bankName.trim() || undefined,
        accountNumber: form.accountNumber.trim() || undefined,
        usageHistory: [],
        courtDeposit,
        attachments: [],
        memo: form.memo.trim() || undefined,
      });

      setForm(createInitialForm());
      setShowForm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "등록 실패";
      alert(`예수금 등록 실패: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── 사용 등록 핸들러 ──
  const handleAddUsage = async (deposit: Deposit) => {
    if (busyDepositId) return;
    const parsedAmount = parseInt(usageForm.amount.replace(/[^0-9]/g, ""), 10);
    if (!usageForm.purpose.trim() || isNaN(parsedAmount) || parsedAmount <= 0) return;
    if (parsedAmount > deposit.remainingAmount) {
      alert(`잔여 금액(${deposit.remainingAmount.toLocaleString()}원)을 초과할 수 없습니다.`);
      return;
    }

    setBusyDepositId(deposit.id);

    const newUsage: DepositUsage = {
      date: usageForm.date,
      amount: parsedAmount,
      purpose: usageForm.purpose.trim(),
    };

    const newUsedAmount = deposit.usedAmount + parsedAmount;
    const newRemaining = deposit.originalAmount - newUsedAmount;

    let newStatus: DepositStatus = deposit.status;
    if (newRemaining === 0) {
      newStatus = "전액사용";
    } else if (newUsedAmount > 0) {
      newStatus = "일부사용";
    }

    try {
      await onUpdate(deposit.id, {
        usageHistory: [...deposit.usageHistory, newUsage],
        usedAmount: newUsedAmount,
        remainingAmount: newRemaining,
        status: newStatus,
      });
      setUsageForm(createInitialUsage());
      setUsageFormId(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "사용 등록 실패";
      alert(`사용 등록 실패: ${message}`);
    } finally {
      setBusyDepositId(null);
    }
  };

  // ── 반환 처리 핸들러 ──
  const handleReturn = async (deposit: Deposit) => {
    if (busyDepositId) return;
    setBusyDepositId(deposit.id);
    try {
      await onUpdate(deposit.id, {
        status: "반환완료",
        returnedDate: today(),
        returnedAmount: deposit.remainingAmount,
        returnedMethod: deposit.receivedMethod,
        remainingAmount: 0,
      });
      setReturningId(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "반환 처리 실패";
      alert(`반환 처리 실패: ${message}`);
    } finally {
      setBusyDepositId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* ─── 요약 카드 ─── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-2xl p-4 backdrop-blur-sm text-center">
          <p className="text-xs text-text-dim mb-1">총 보관액</p>
          <p className="text-lg font-bold text-info">
            {totalHolding.toLocaleString()}
            <span className="text-xs font-normal ml-0.5">원</span>
          </p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4 backdrop-blur-sm text-center">
          <p className="text-xs text-text-dim mb-1">사용된 금액</p>
          <p className="text-lg font-bold text-gold">
            {totalUsed.toLocaleString()}
            <span className="text-xs font-normal ml-0.5">원</span>
          </p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-4 backdrop-blur-sm text-center">
          <p className="text-xs text-text-dim mb-1">잔여 금액</p>
          <p
            className={`text-lg font-bold ${
              totalRemaining > totalHolding * 0.2 ? "text-success" : "text-warning"
            }`}
          >
            {totalRemaining.toLocaleString()}
            <span className="text-xs font-normal ml-0.5">원</span>
          </p>
        </div>
      </div>

      {/* ─── 헤더 + 추가 버튼 ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-semibold text-text-primary">예수금/보관금 관리</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-gold hover:text-gold-bright border border-gold/20 rounded-lg hover:border-gold/40 transition-colors"
        >
          {showForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {showForm ? "닫기" : "새 예수금 등록"}
        </button>
      </div>

      {/* ─── 새 예수금 등록 폼 ─── */}
      {showForm && (
        <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm space-y-4">
          <h4 className="text-sm font-semibold text-text-primary">새 예수금 등록</h4>

          {/* 유형 선택 */}
          <div>
            <label className="block text-xs text-text-dim mb-2">예수금 유형</label>
            <div className="flex flex-wrap gap-1.5">
              {DEPOSIT_TYPES.map((dt) => (
                <button
                  key={dt.value}
                  onClick={() => updateForm("type", dt.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    form.type === dt.value
                      ? "border-gold/40 bg-gold-dim text-gold"
                      : "border-border text-text-dim hover:border-border-hover"
                  }`}
                >
                  <dt.icon className="w-3 h-3" />
                  {dt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 의뢰인 / 설명 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-dim mb-1">의뢰인명</label>
              <input
                type="text"
                value={form.clientName}
                onChange={(e) => updateForm("clientName", e.target.value)}
                placeholder="예치인 이름"
                className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-text-dim mb-1">설명</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                placeholder="예수금 상세 설명"
                className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
              />
            </div>
          </div>

          {/* 금액 / 입금일 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-dim mb-1">금액 (원)</label>
              <input
                type="text"
                value={form.amount}
                onChange={(e) => updateForm("amount", e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-text-dim mb-1">입금일</label>
              <input
                type="date"
                value={form.receivedDate}
                onChange={(e) => updateForm("receivedDate", e.target.value)}
                className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary focus:border-gold focus:outline-none"
              />
            </div>
          </div>

          {/* 결제수단 */}
          <div>
            <label className="block text-xs text-text-dim mb-2">결제 수단</label>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => updateForm("receivedMethod", m.value)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border transition-colors ${
                    form.receivedMethod === m.value
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

          {/* 은행 / 계좌번호 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-dim mb-1">은행명 (선택)</label>
              <input
                type="text"
                value={form.bankName}
                onChange={(e) => updateForm("bankName", e.target.value)}
                placeholder="예: 국민은행"
                className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-text-dim mb-1">계좌 뒤 4자리 (선택)</label>
              <input
                type="text"
                value={form.accountNumber}
                onChange={(e) => updateForm("accountNumber", e.target.value.slice(0, 4))}
                placeholder="1234"
                maxLength={4}
                className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
              />
            </div>
          </div>

          {/* 법원공탁금 추가 필드 */}
          {form.type === "법원공탁금" && (
            <div className="p-4 bg-navy-light/50 rounded-lg border border-border/50 space-y-3">
              <p className="text-xs font-semibold text-gold">법원 공탁 정보</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-dim mb-1">법원명</label>
                  <input
                    type="text"
                    value={form.courtName}
                    onChange={(e) => updateForm("courtName", e.target.value)}
                    placeholder="예: 서울중앙지방법원"
                    className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-dim mb-1">공탁번호</label>
                  <input
                    type="text"
                    value={form.courtDepositNumber}
                    onChange={(e) => updateForm("courtDepositNumber", e.target.value)}
                    placeholder="공탁번호 입력"
                    className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-dim mb-1">공탁일</label>
                  <input
                    type="date"
                    value={form.courtDepositDate}
                    onChange={(e) => updateForm("courtDepositDate", e.target.value)}
                    className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary focus:border-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-dim mb-1">공탁 사유</label>
                  <input
                    type="text"
                    value={form.courtDepositReason}
                    onChange={(e) => updateForm("courtDepositReason", e.target.value)}
                    placeholder="공탁 사유 입력"
                    className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 메모 */}
          <div>
            <label className="block text-xs text-text-dim mb-1">메모 (선택)</label>
            <textarea
              value={form.memo}
              onChange={(e) => updateForm("memo", e.target.value)}
              placeholder="추가 메모 사항"
              rows={2}
              className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none resize-none"
            />
          </div>

          {/* 등록 버튼 */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setForm(createInitialForm());
                setShowForm(false);
              }}
              className="px-4 py-2 text-sm text-text-dim border border-border rounded-lg hover:border-border-hover transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                submitting ||
                !form.clientName.trim() ||
                !form.description.trim() ||
                !form.amount.trim()
              }
              className="px-4 py-2 text-sm bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors disabled:opacity-40"
            >
              {submitting ? "등록 중..." : "등록"}
            </button>
          </div>
        </div>
      )}

      {/* ─── 상태 필터 ─── */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((sf) => (
          <button
            key={sf.value}
            onClick={() => setStatusFilter(sf.value)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              statusFilter === sf.value
                ? "border-gold/40 bg-gold-dim text-gold"
                : "border-border text-text-dim hover:border-border-hover"
            }`}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {/* ─── 예수금 목록 ─── */}
      {filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 backdrop-blur-sm text-center">
          <Landmark className="w-8 h-8 text-text-dim/30 mx-auto mb-2" />
          <p className="text-sm text-text-dim">등록된 예수금이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((deposit) => {
            const isExpanded = expandedId === deposit.id;
            const daysHeld = calcDaysHeld(deposit.receivedDate);
            const progressPercent =
              deposit.originalAmount > 0
                ? Math.round(
                    (deposit.remainingAmount / deposit.originalAmount) * 100,
                  )
                : 0;

            return (
              <div
                key={deposit.id}
                className="bg-surface border border-border rounded-2xl backdrop-blur-sm overflow-hidden"
              >
                {/* 카드 헤더 */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : deposit.id)}
                  className="w-full p-4 flex items-start gap-3 text-left hover:bg-navy-light/30 transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* 배지 줄 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 text-[11px] rounded-full border ${depositTypeBadgeClass(
                          deposit.type,
                        )}`}
                      >
                        {deposit.type}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[11px] rounded-full border ${statusBadgeClass(
                          deposit.status,
                        )}`}
                      >
                        {deposit.status}
                      </span>
                    </div>

                    {/* 의뢰인 + 금액 */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {deposit.clientName}
                      </span>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-text-primary">
                          {deposit.originalAmount.toLocaleString()}원
                        </p>
                        {deposit.usedAmount > 0 && (
                          <p className="text-xs text-text-dim">
                            잔여 {deposit.remainingAmount.toLocaleString()}원
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 프로그레스 바 */}
                    <div className="w-full bg-navy-light rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          progressPercent > 50
                            ? "bg-success"
                            : progressPercent > 20
                              ? "bg-warning"
                              : progressPercent > 0
                                ? "bg-error"
                                : "bg-text-dim/30"
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    {/* 날짜 + 보관일수 */}
                    <div className="flex items-center gap-3 text-xs text-text-dim">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {deposit.receivedDate}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        보관 {daysHeld}일
                      </span>
                    </div>
                  </div>

                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-text-dim shrink-0 mt-1" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-text-dim shrink-0 mt-1" />
                  )}
                </button>

                {/* 상세 영역 */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border">
                    {/* 결제 정보 */}
                    <div className="pt-3 space-y-1.5">
                      <p className="text-xs font-semibold text-text-dim uppercase tracking-wide">
                        결제 정보
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between p-2 bg-navy-light rounded-lg">
                          <span className="text-text-dim">결제수단</span>
                          <span className="text-text-primary">{deposit.receivedMethod}</span>
                        </div>
                        {deposit.bankName && (
                          <div className="flex justify-between p-2 bg-navy-light rounded-lg">
                            <span className="text-text-dim">은행</span>
                            <span className="text-text-primary">{deposit.bankName}</span>
                          </div>
                        )}
                        {deposit.accountNumber && (
                          <div className="flex justify-between p-2 bg-navy-light rounded-lg">
                            <span className="text-text-dim">계좌 뒤 4자리</span>
                            <span className="text-text-primary">{deposit.accountNumber}</span>
                          </div>
                        )}
                        {deposit.description && (
                          <div className="flex justify-between p-2 bg-navy-light rounded-lg col-span-2">
                            <span className="text-text-dim">설명</span>
                            <span className="text-text-primary">{deposit.description}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 법원 공탁 정보 */}
                    {deposit.courtDeposit && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-gold uppercase tracking-wide">
                          법원 공탁 정보
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex justify-between p-2 bg-navy-light rounded-lg">
                            <span className="text-text-dim">법원</span>
                            <span className="text-text-primary">
                              {deposit.courtDeposit.courtName}
                            </span>
                          </div>
                          <div className="flex justify-between p-2 bg-navy-light rounded-lg">
                            <span className="text-text-dim">공탁번호</span>
                            <span className="text-text-primary">
                              {deposit.courtDeposit.depositNumber}
                            </span>
                          </div>
                          <div className="flex justify-between p-2 bg-navy-light rounded-lg">
                            <span className="text-text-dim">공탁일</span>
                            <span className="text-text-primary">
                              {deposit.courtDeposit.depositDate}
                            </span>
                          </div>
                          <div className="flex justify-between p-2 bg-navy-light rounded-lg">
                            <span className="text-text-dim">사유</span>
                            <span className="text-text-primary">
                              {deposit.courtDeposit.depositReason}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 메모 */}
                    {deposit.memo && (
                      <div className="text-xs text-text-dim bg-navy-light rounded-lg p-2">
                        <span className="font-semibold">메모:</span> {deposit.memo}
                      </div>
                    )}

                    {/* 사용 내역 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-text-dim uppercase tracking-wide">
                          사용 내역
                        </p>
                        {deposit.status !== "반환완료" && deposit.status !== "전액사용" && (
                          <button
                            onClick={() => {
                              setUsageFormId(
                                usageFormId === deposit.id ? null : deposit.id,
                              );
                              setUsageForm(createInitialUsage());
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-gold hover:text-gold-bright border border-gold/20 rounded hover:border-gold/40 transition-colors"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            사용 등록
                          </button>
                        )}
                      </div>

                      {/* 사용 등록 미니 폼 */}
                      {usageFormId === deposit.id && (
                        <div className="p-3 bg-navy-light/50 rounded-lg border border-border/50 space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="date"
                              value={usageForm.date}
                              onChange={(e) =>
                                setUsageForm((prev) => ({
                                  ...prev,
                                  date: e.target.value,
                                }))
                              }
                              className="px-2 py-1.5 bg-navy-light border border-border rounded-lg text-xs text-text-primary focus:border-gold focus:outline-none"
                            />
                            <input
                              type="text"
                              value={usageForm.amount}
                              onChange={(e) =>
                                setUsageForm((prev) => ({
                                  ...prev,
                                  amount: e.target.value,
                                }))
                              }
                              placeholder="금액 (원)"
                              className="px-2 py-1.5 bg-navy-light border border-border rounded-lg text-xs text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                            />
                            <input
                              type="text"
                              value={usageForm.purpose}
                              onChange={(e) =>
                                setUsageForm((prev) => ({
                                  ...prev,
                                  purpose: e.target.value,
                                }))
                              }
                              placeholder="용도"
                              className="px-2 py-1.5 bg-navy-light border border-border rounded-lg text-xs text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                            />
                          </div>
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setUsageFormId(null)}
                              className="px-2.5 py-1 text-[11px] text-text-dim border border-border rounded hover:border-border-hover transition-colors"
                            >
                              취소
                            </button>
                            <button
                              onClick={() => handleAddUsage(deposit)}
                              disabled={
                                !usageForm.purpose.trim() || !usageForm.amount.trim() || busyDepositId === deposit.id
                              }
                              className="px-2.5 py-1 text-[11px] text-gold bg-gold-dim rounded hover:bg-gold/20 transition-colors disabled:opacity-40"
                            >
                              {busyDepositId === deposit.id ? "등록 중..." : "추가"}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 사용 내역 리스트 */}
                      {deposit.usageHistory.length === 0 ? (
                        <p className="text-xs text-text-dim/60 text-center py-2">
                          사용 내역이 없습니다.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {deposit.usageHistory.map((usage, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 bg-navy-light rounded-lg text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <ArrowDownLeft className="w-3 h-3 text-warning" />
                                <span className="text-text-dim">{usage.date}</span>
                                <span className="text-text-primary">{usage.purpose}</span>
                              </div>
                              <span className="text-warning font-medium shrink-0">
                                -{usage.amount.toLocaleString()}원
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 하단 액션 버튼 */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                      {/* 반환 처리 */}
                      {deposit.status !== "반환완료" &&
                        deposit.status !== "전액사용" &&
                        (returningId === deposit.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-text-dim">
                              잔여 {deposit.remainingAmount.toLocaleString()}원 반환 처리?
                            </span>
                            <button
                              onClick={() => handleReturn(deposit)}
                              disabled={busyDepositId === deposit.id}
                              className="px-2.5 py-1 text-[11px] text-success border border-success/30 rounded hover:bg-success/10 transition-colors disabled:opacity-40"
                            >
                              {busyDepositId === deposit.id ? "처리 중..." : "확인"}
                            </button>
                            <button
                              onClick={() => setReturningId(null)}
                              className="px-2.5 py-1 text-[11px] text-text-dim border border-border rounded hover:border-border-hover transition-colors"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setReturningId(deposit.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-success border border-success/20 rounded-lg hover:border-success/40 hover:bg-success/5 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />
                            반환 처리
                          </button>
                        ))}

                      {/* 반환 완료 표시 */}
                      {deposit.status === "반환완료" && deposit.returnedDate && (
                        <span className="text-xs text-success flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" />
                          {deposit.returnedDate} 반환 완료
                          {deposit.returnedAmount !== undefined &&
                            ` (${deposit.returnedAmount.toLocaleString()}원)`}
                        </span>
                      )}

                      <div className="flex-1" />

                      {/* 삭제 */}
                      {deletingId === deposit.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={async () => {
                              if (busyDepositId) return;
                              setBusyDepositId(deposit.id);
                              try {
                                await onDelete(deposit.id);
                                setDeletingId(null);
                              } catch (err: unknown) {
                                const message = err instanceof Error ? err.message : "삭제 실패";
                                alert(`예수금 삭제 실패: ${message}`);
                              } finally {
                                setBusyDepositId(null);
                              }
                            }}
                            disabled={busyDepositId === deposit.id}
                            className="px-2.5 py-1 text-[11px] text-error border border-error/30 rounded hover:bg-error/10 transition-colors disabled:opacity-40"
                          >
                            삭제
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="px-2.5 py-1 text-[11px] text-text-dim border border-border rounded hover:border-border-hover transition-colors"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(deposit.id)}
                          className="text-text-dim hover:text-error transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
