import { useState, useRef, useCallback, useMemo } from "react";
import {
  Plus,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Wallet,
  Building2,
  UserCheck,
  AlertCircle,
  Upload,
  Paperclip,
  Trash2,
  Calendar,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import type {
  CaseExpense,
  CaseExpenseCategory,
  ExpenseBearer,
  PaymentMethodType,
  EvidenceType,
  Attachment,
} from "../../types/accounting";

// ─── 상수 ────────────────────────────────────────

const CATEGORIES: CaseExpenseCategory[] = [
  "인지대",
  "송달료",
  "감정료",
  "번역료",
  "출장비",
  "등기비용",
  "공증비용",
  "탐정조사비",
  "복사/출력비",
  "증인여비",
  "보증보험료",
  "기타",
];

const QUICK_PRESETS: CaseExpenseCategory[] = ["인지대", "송달료", "감정료"];

const BEARERS: { value: ExpenseBearer; label: string }[] = [
  { value: "의뢰인", label: "의뢰인 부담" },
  { value: "사무소", label: "사무소 부담" },
  { value: "선납후정산", label: "선납 후 정산" },
];

const PAYMENT_METHODS: PaymentMethodType[] = [
  "계좌이체",
  "카드",
  "현금",
  "수표",
  "기타",
];

const EVIDENCE_TYPES: EvidenceType[] = [
  "세금계산서",
  "현금영수증",
  "카드매출전표",
  "간이영수증",
  "거래명세서",
  "없음",
];

const CATEGORY_COLORS: Record<CaseExpenseCategory, string> = {
  인지대: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  송달료: "bg-sky-500/15 text-sky-400 border-sky-500/20",
  감정료: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  번역료: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  출장비: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  등기비용: "bg-teal-500/15 text-teal-400 border-teal-500/20",
  공증비용: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  탐정조사비: "bg-rose-500/15 text-rose-400 border-rose-500/20",
  "복사/출력비": "bg-gray-500/15 text-gray-400 border-gray-500/20",
  증인여비: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  보증보험료: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
  기타: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const BEARER_COLORS: Record<ExpenseBearer, string> = {
  의뢰인: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  사무소: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  선납후정산: "bg-purple-500/15 text-purple-400 border-purple-500/20",
};

type FilterType = "전체" | "의뢰인부담" | "사무소부담" | "미정산";

const ACCEPT_TYPES = ".jpg,.jpeg,.png,.pdf";

// ─── Props ───────────────────────────────────────

interface CaseExpenseTabProps {
  expenses: CaseExpense[];
  onAdd: (data: Omit<CaseExpense, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  onUpdate: (id: string, data: Partial<CaseExpense>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUploadReceipt: (file: File) => Promise<string>;
  caseId: string;
  ownerId: string;
  clientName: string;
}

// ─── 폼 상태 타입 ────────────────────────────────

interface ExpenseFormState {
  category: CaseExpenseCategory;
  description: string;
  amount: string;
  date: string;
  bearer: ExpenseBearer;
  paymentMethod: PaymentMethodType;
  evidenceType: EvidenceType;
  memo: string;
  attachments: Attachment[];
}

function createInitialFormState(): ExpenseFormState {
  return {
    category: "인지대",
    description: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    bearer: "의뢰인",
    paymentMethod: "계좌이체",
    evidenceType: "없음",
    memo: "",
    attachments: [],
  };
}

// ─── 컴포넌트 ────────────────────────────────────

export default function CaseExpenseTab({
  expenses,
  onAdd,
  onUpdate,
  onDelete,
  onUploadReceipt,
  caseId,
  ownerId,
  clientName,
}: CaseExpenseTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(createInitialFormState());
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("전체");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyExpenseId, setBusyExpenseId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── 계산값 ──────────────────────────────────

  const summary = useMemo(() => {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const firmBorne = expenses
      .filter((e) => e.bearer === "사무소")
      .reduce((s, e) => s + e.amount, 0);
    const clientBorne = expenses
      .filter((e) => e.bearer === "의뢰인" || e.bearer === "선납후정산")
      .reduce((s, e) => s + e.amount, 0);
    const reimbursed = expenses
      .filter((e) => (e.bearer === "의뢰인" || e.bearer === "선납후정산") && e.reimbursed)
      .reduce((s, e) => s + (e.reimbursedAmount ?? e.amount), 0);
    const unreimbursed = clientBorne - reimbursed;

    return { total, firmBorne, clientBorne, reimbursed, unreimbursed };
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    switch (filter) {
      case "의뢰인부담":
        return expenses.filter((e) => e.bearer === "의뢰인" || e.bearer === "선납후정산");
      case "사무소부담":
        return expenses.filter((e) => e.bearer === "사무소");
      case "미정산":
        return expenses.filter(
          (e) => (e.bearer === "의뢰인" || e.bearer === "선납후정산") && !e.reimbursed
        );
      default:
        return expenses;
    }
  }, [expenses, filter]);

  // ─── 금액 포맷 ──────────────────────────────

  const formatAmount = (value: string): string => {
    const digits = value.replace(/[^0-9]/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString();
  };

  const parseAmount = (value: string): number => {
    return parseInt(value.replace(/[^0-9]/g, ""), 10) || 0;
  };

  // ─── 파일 업로드 ────────────────────────────

  const handleFileUpload = useCallback(
    async (file: File) => {
      const validTypes = ["image/jpeg", "image/png", "application/pdf"];
      if (!validTypes.includes(file.type)) {
        alert("JPG, PNG, PDF 파일만 업로드할 수 있습니다.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("파일 크기는 10MB 이하만 가능합니다.");
        return;
      }

      setUploading(true);
      try {
        const fileUrl = await onUploadReceipt(file);
        const attachment: Attachment = {
          fileName: file.name,
          fileUrl,
          fileSizeMB: Math.round((file.size / (1024 * 1024)) * 100) / 100,
          uploadedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as Attachment["uploadedAt"],
          description: "영수증",
        };
        setForm((prev) => ({
          ...prev,
          attachments: [...prev.attachments, attachment],
        }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "업로드 실패";
        alert(`영수증 업로드 실패: ${message}`);
      } finally {
        setUploading(false);
      }
    },
    [onUploadReceipt]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
      e.target.value = "";
    },
    [handleFileUpload]
  );

  const removeAttachment = (index: number) => {
    setForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  // ─── 폼 제출 ────────────────────────────────

  const handleSubmit = async () => {
    const amount = parseAmount(form.amount);
    if (!form.description.trim() || amount <= 0) return;

    setSubmitting(true);
    try {
      await onAdd({
        caseId,
        ownerId,
        clientName,
        category: form.category,
        description: form.description.trim(),
        amount,
        date: form.date,
        bearer: form.bearer,
        reimbursed: false,
        paymentMethod: form.paymentMethod,
        paidBy: form.bearer === "사무소" ? "사무소" : clientName,
        evidenceType: form.evidenceType,
        attachments: form.attachments,
        memo: form.memo.trim() || undefined,
      });
      setForm(createInitialFormState());
      setShowForm(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "등록 실패";
      alert(`비용 등록 실패: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleReimbursed = async (expense: CaseExpense) => {
    if (busyExpenseId) return;
    setBusyExpenseId(expense.id);
    try {
      const newReimbursed = !expense.reimbursed;
      await onUpdate(expense.id, {
        reimbursed: newReimbursed,
        reimbursedDate: newReimbursed ? new Date().toISOString().slice(0, 10) : undefined,
        reimbursedAmount: newReimbursed ? expense.amount : undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "정산 상태 변경 실패";
      alert(`정산 처리 실패: ${message}`);
    } finally {
      setBusyExpenseId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (busyExpenseId) return;
    setBusyExpenseId(id);
    try {
      await onDelete(id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "삭제 실패";
      alert(`비용 삭제 실패: ${message}`);
    } finally {
      setBusyExpenseId(null);
    }
    setConfirmDeleteId(null);
  };

  // ─── 프리셋 클릭 ───────────────────────────

  const handlePresetClick = (preset: CaseExpenseCategory) => {
    setForm((prev) => ({
      ...prev,
      category: preset,
      description: prev.description || preset,
    }));
  };

  // ─── 파일 아이콘 ───────────────────────────

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return <FileText className="w-4 h-4 text-red-400" />;
    return <ImageIcon className="w-4 h-4 text-blue-400" />;
  };

  // ─── 렌더링 ─────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── 비용 요약 카드 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Wallet className="w-4 h-4 text-gold" />}
          label="총 비용"
          amount={summary.total}
          color="text-text-primary"
        />
        <SummaryCard
          icon={<Building2 className="w-4 h-4 text-blue-400" />}
          label="사무소 부담"
          amount={summary.firmBorne}
          color="text-blue-400"
        />
        <SummaryCard
          icon={<UserCheck className="w-4 h-4 text-amber-400" />}
          label="의뢰인 부담"
          amount={summary.clientBorne}
          color="text-amber-400"
        />
        <SummaryCard
          icon={<AlertCircle className="w-4 h-4 text-error" />}
          label="미정산"
          amount={summary.unreimbursed}
          color={summary.unreimbursed > 0 ? "text-error" : "text-success"}
        />
      </div>

      {/* ── 비용 등록 폼 ── */}
      <div className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full flex items-center justify-between p-5"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-gold" />
            <span className="text-sm font-semibold text-text-primary">비용 등록</span>
          </div>
          {showForm ? (
            <ChevronUp className="w-4 h-4 text-text-dim" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-dim" />
          )}
        </button>

        {showForm && (
          <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
            {/* 빠른 프리셋 */}
            <div>
              <label className="block text-xs text-text-dim mb-2">빠른 선택</label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handlePresetClick(preset)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      form.category === preset
                        ? "border-gold/40 bg-gold-dim text-gold"
                        : "border-border text-text-dim hover:border-gold/30 hover:text-text-primary"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* 카테고리 + 설명 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-dim mb-1.5">비용 항목</label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      category: e.target.value as CaseExpenseCategory,
                    }))
                  }
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary focus:border-gold focus:outline-none"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-dim mb-1.5">상세 내역</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="예: 서울중앙지법 인지대"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                />
              </div>
            </div>

            {/* 금액 + 날짜 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-dim mb-1.5">금액 (원)</label>
                <input
                  type="text"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, amount: formatAmount(e.target.value) }))
                  }
                  placeholder="0"
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-dim mb-1.5">발생일</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-dim pointer-events-none" />
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary focus:border-gold focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 부담 주체 */}
            <div>
              <label className="block text-xs text-text-dim mb-1.5">부담 주체</label>
              <div className="flex gap-2">
                {BEARERS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setForm((prev) => ({ ...prev, bearer: value }))}
                    className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                      form.bearer === value
                        ? "border-gold/50 bg-gold-dim text-gold"
                        : "border-border text-text-dim hover:border-gold/30"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 결제수단 + 증빙 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-dim mb-1.5">결제 수단</label>
                <select
                  value={form.paymentMethod}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      paymentMethod: e.target.value as PaymentMethodType,
                    }))
                  }
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary focus:border-gold focus:outline-none"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-dim mb-1.5">증빙 유형</label>
                <select
                  value={form.evidenceType}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      evidenceType: e.target.value as EvidenceType,
                    }))
                  }
                  className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary focus:border-gold focus:outline-none"
                >
                  {EVIDENCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 영수증 첨부 */}
            <div>
              <label className="block text-xs text-text-dim mb-1.5">영수증 첨부</label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-gold bg-gold-dim"
                    : "border-border hover:border-gold/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_TYPES}
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-text-dim">업로드 중...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-6 h-6 text-text-dim" />
                    <p className="text-xs text-text-dim">
                      영수증 첨부
                    </p>
                    <p className="text-[10px] text-text-dim/60">
                      클릭 또는 드래그하여 업로드 (JPG, PNG, PDF)
                    </p>
                  </div>
                )}
              </div>

              {/* 첨부파일 미리보기 */}
              {form.attachments.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {form.attachments.map((att, idx) => (
                    <div
                      key={`${att.fileName}-${idx}`}
                      className="flex items-center gap-2 p-2 bg-navy-light rounded-lg"
                    >
                      {getFileIcon(att.fileName)}
                      <span className="flex-1 text-xs text-text-primary truncate">
                        {att.fileName}
                      </span>
                      <span className="text-[10px] text-text-dim shrink-0">
                        {att.fileSizeMB}MB
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAttachment(idx);
                        }}
                        className="text-text-dim hover:text-error transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 메모 */}
            <div>
              <label className="block text-xs text-text-dim mb-1.5">메모 (선택)</label>
              <textarea
                value={form.memo}
                onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))}
                placeholder="추가 메모 사항"
                rows={2}
                className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none resize-none"
              />
            </div>

            {/* 등록 버튼 */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setForm(createInitialFormState());
                  setShowForm(false);
                }}
                className="px-4 py-2 text-xs text-text-dim border border-border rounded-lg hover:border-gold/30 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  submitting || !form.description.trim() || parseAmount(form.amount) <= 0
                }
                className="px-5 py-2 text-xs font-medium text-white bg-gradient-to-r from-gold to-gold-bright rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "등록 중..." : "비용 등록"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 비용 목록 ── */}
      <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">비용 내역</h3>
          <span className="text-xs text-text-dim">{filteredExpenses.length}건</span>
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(["전체", "의뢰인부담", "사무소부담", "미정산"] as FilterType[]).map((f) => {
            const labelMap: Record<FilterType, string> = {
              전체: "전체",
              의뢰인부담: "의뢰인 부담",
              사무소부담: "사무소 부담",
              미정산: "미정산",
            };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  filter === f
                    ? "border-gold/40 bg-gold-dim text-gold"
                    : "border-border text-text-dim hover:border-gold/30"
                }`}
              >
                {labelMap[f]}
              </button>
            );
          })}
        </div>

        {/* 목록 */}
        {filteredExpenses.length === 0 ? (
          <p className="text-sm text-text-dim text-center py-8">
            등록된 비용이 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {filteredExpenses.map((expense) => {
              const isExpanded = expandedId === expense.id;
              const isUnreimbursed =
                (expense.bearer === "의뢰인" || expense.bearer === "선납후정산") &&
                !expense.reimbursed;

              return (
                <div
                  key={expense.id}
                  className={`rounded-xl border transition-colors ${
                    isUnreimbursed
                      ? "border-warning/30 bg-warning/5"
                      : "border-border bg-navy-light"
                  }`}
                >
                  {/* 요약 행 */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : expense.id)}
                    className="w-full flex items-center gap-3 p-3 text-left"
                  >
                    {/* 카테고리 뱃지 */}
                    <span
                      className={`shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full border ${
                        CATEGORY_COLORS[expense.category]
                      }`}
                    >
                      {expense.category}
                    </span>

                    {/* 설명 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">
                        {expense.description}
                      </p>
                      <p className="text-[10px] text-text-dim">{expense.date}</p>
                    </div>

                    {/* 부담 주체 뱃지 */}
                    <span
                      className={`shrink-0 px-2 py-0.5 text-[10px] rounded-full border ${
                        BEARER_COLORS[expense.bearer]
                      }`}
                    >
                      {expense.bearer}
                    </span>

                    {/* 정산 상태 */}
                    {(expense.bearer === "의뢰인" || expense.bearer === "선납후정산") && (
                      <span
                        className={`shrink-0 text-[10px] font-medium ${
                          expense.reimbursed ? "text-success" : "text-warning"
                        }`}
                      >
                        {expense.reimbursed ? "정산완료" : "미정산"}
                      </span>
                    )}

                    {/* 금액 */}
                    <span className="shrink-0 text-sm font-semibold text-text-primary">
                      {expense.amount.toLocaleString()}원
                    </span>

                    {/* 펼침 아이콘 */}
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-text-dim shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-text-dim shrink-0" />
                    )}
                  </button>

                  {/* 상세 내용 */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-border/50 pt-3 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <DetailItem label="결제 수단" value={expense.paymentMethod} />
                        <DetailItem label="증빙 유형" value={expense.evidenceType} />
                        <DetailItem label="납부자" value={expense.paidBy} />
                        {expense.reimbursedDate && (
                          <DetailItem label="정산일" value={expense.reimbursedDate} />
                        )}
                        {expense.reimbursedAmount != null && expense.reimbursedAmount > 0 && (
                          <DetailItem
                            label="정산 금액"
                            value={`${expense.reimbursedAmount.toLocaleString()}원`}
                          />
                        )}
                      </div>

                      {/* 첨부파일 */}
                      {expense.attachments.length > 0 && (
                        <div>
                          <p className="text-[10px] text-text-dim mb-1">첨부파일</p>
                          <div className="space-y-1">
                            {expense.attachments.map((att, idx) => (
                              <a
                                key={`${att.fileName}-${idx}`}
                                href={att.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 bg-surface rounded-lg hover:bg-gold-dim/30 transition-colors"
                              >
                                <Paperclip className="w-3 h-3 text-text-dim shrink-0" />
                                <span className="text-xs text-gold truncate">
                                  {att.fileName}
                                </span>
                                <span className="text-[10px] text-text-dim shrink-0">
                                  {att.fileSizeMB}MB
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 메모 */}
                      {expense.memo && (
                        <div>
                          <p className="text-[10px] text-text-dim mb-1">메모</p>
                          <p className="text-xs text-text-primary">{expense.memo}</p>
                        </div>
                      )}

                      {/* 액션 버튼 */}
                      <div className="flex items-center justify-between pt-2">
                        {/* 정산 토글 */}
                        {(expense.bearer === "의뢰인" || expense.bearer === "선납후정산") && (
                          <button
                            onClick={() => handleToggleReimbursed(expense)}
                            disabled={busyExpenseId === expense.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-40 ${
                              expense.reimbursed
                                ? "border-success/30 bg-success/10 text-success"
                                : "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20"
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            {expense.reimbursed ? "정산 완료" : "정산 처리"}
                          </button>
                        )}

                        {/* 삭제 */}
                        {confirmDeleteId === expense.id ? (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <span className="text-[10px] text-text-dim">삭제하시겠습니까?</span>
                            <button
                              onClick={() => handleDelete(expense.id)}
                              className="px-2.5 py-1 text-xs text-error border border-error/30 rounded-lg hover:bg-error/10 transition-colors"
                            >
                              삭제
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 text-xs text-text-dim border border-border rounded-lg hover:border-gold/30 transition-colors"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(expense.id)}
                            className="ml-auto flex items-center gap-1 px-2.5 py-1 text-xs text-text-dim hover:text-error border border-border rounded-lg hover:border-error/30 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            삭제
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

      {/* ── 의뢰인 정산 요약 ── */}
      {summary.clientBorne > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck className="w-4 h-4 text-gold" />
            <h3 className="text-sm font-semibold text-text-primary">
              의뢰인 정산 현황 ({clientName})
            </h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-dim">의뢰인 부담 총액</span>
              <span className="text-sm font-medium text-text-primary">
                {summary.clientBorne.toLocaleString()}원
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-dim">정산 완료</span>
              <span className="text-sm font-medium text-success">
                {summary.reimbursed.toLocaleString()}원
              </span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-dim">미정산 잔액</span>
              <span
                className={`text-sm font-bold ${
                  summary.unreimbursed > 0 ? "text-error" : "text-success"
                }`}
              >
                {summary.unreimbursed.toLocaleString()}원
              </span>
            </div>

            {/* 정산 진행률 바 */}
            {summary.clientBorne > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-text-dim">정산 진행률</span>
                  <span className="text-[10px] text-text-dim">
                    {Math.round((summary.reimbursed / summary.clientBorne) * 100)}%
                  </span>
                </div>
                <div className="h-1.5 bg-navy-light rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-gold to-gold-bright rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((summary.reimbursed / summary.clientBorne) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 서브 컴포넌트 ─────────────────────────────

function SummaryCard({
  icon,
  label,
  amount,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  amount: number;
  color: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2">{icon}</div>
      <p className={`text-lg font-bold ${color}`}>
        {amount.toLocaleString()}
        <span className="text-xs font-normal text-text-dim ml-0.5">원</span>
      </p>
      <p className="text-[10px] text-text-dim mt-1">{label}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-text-dim mb-0.5">{label}</p>
      <p className="text-xs text-text-primary">{value}</p>
    </div>
  );
}
