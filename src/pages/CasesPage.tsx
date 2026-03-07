import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, FolderOpen, ChevronRight, FileSignature,
  Banknote, Trophy, Receipt, CheckCircle2, XCircle, CreditCard,
  Wallet, Building2, ReceiptText,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import { getCases, updateCase } from "../services/firebase/firestore";
import { CASE_TYPES } from "../config/constants";
import { isDemoMode } from "../config/demo";
import type { Case, ContractPayment, PaymentMethod } from "../types/case";

const CASE_TYPE_COLORS: Record<string, string> = {
  "민사": "bg-info/15 text-info",
  "형사": "bg-error/15 text-error",
  "가사": "bg-success/15 text-success",
  "행정": "bg-warning/15 text-warning",
  "노동": "bg-gold-dim text-gold",
  "부동산": "bg-info/15 text-info",
  "채권·채무": "bg-warning/15 text-warning",
  "손해배상": "bg-error/15 text-error",
  "기타": "bg-surface text-text-dim",
};

const STATUS_STYLES: Record<string, string> = {
  "진행중": "bg-success/15 text-success",
  "완료": "bg-text-dim/15 text-text-dim",
  "보류": "bg-warning/15 text-warning",
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { value: "카드", label: "카드", icon: CreditCard },
  { value: "현금", label: "현금", icon: Wallet },
  { value: "계좌이체", label: "이체", icon: Building2 },
];

export default function CasesPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("전체");
  const [filterStatus, setFilterStatus] = useState<string>("전체");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (isDemoMode) {
      setCases([]);
      setLoading(false);
      return;
    }
    const fetch = async () => {
      try {
        const data = await getCases(user.uid);
        setCases(data);
      } catch (err) {
        console.error("사건 목록 로딩 실패:", err);
        setCases([]);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user]);

  const filtered = cases.filter((c) => {
    const matchSearch =
      c.clientName.includes(search) || c.description.includes(search);
    const matchType = filterType === "전체" || c.caseType === filterType;
    const matchStatus = filterStatus === "전체" || c.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  // 인라인 계약/수임료 업데이트
  const handleUpdatePayment = useCallback(
    async (caseId: string, data: ContractPayment) => {
      setCases((prev) =>
        prev.map((c) => c.id === caseId ? { ...c, contractPayment: data } : c),
      );
      if (!isDemoMode) {
        try {
          await updateCase(caseId, { contractPayment: data });
        } catch {
          // 실패 시 새로고침
          if (user) {
            const refreshed = await getCases(user.uid);
            setCases(refreshed);
          }
        }
      }
    },
    [user],
  );

  // 미납 부가비용 합계
  const getUnpaidCosts = (c: Case) => {
    if (!c.costs?.length) return 0;
    return c.costs.filter((item) => !item.paid).reduce((sum, item) => sum + item.amount, 0);
  };

  return (
    <AppLayout title="사건 관리" subtitle={`총 ${cases.length}건`}>
      {/* 검색 + 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="의뢰인 이름 또는 사건 내용 검색..."
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:border-gold focus:outline-none appearance-none"
        >
          <option value="전체">유형: 전체</option>
          {CASE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:border-gold focus:outline-none appearance-none"
        >
          <option value="전체">상태: 전체</option>
          <option value="진행중">진행중</option>
          <option value="완료">완료</option>
          <option value="보류">보류</option>
        </select>
      </div>

      {/* 사건 목록 */}
      {loading ? (
        <div className="text-center py-16 text-text-dim">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-12 h-12 text-text-dim mx-auto mb-4" />
          <p className="text-text-dim mb-4">
            {cases.length === 0 ? "아직 등록된 사건이 없습니다." : "검색 결과가 없습니다."}
          </p>
          {cases.length === 0 && (
            <button
              onClick={() => navigate("/record")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              첫 상담 시작하기
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => {
            const cp = c.contractPayment;
            const unpaid = getUnpaidCosts(c);
            const isExpanded = expandedId === c.id;
            const createdDate = c.createdAt?.toDate?.()
              ? c.createdAt.toDate().toLocaleDateString("ko-KR")
              : "";

            return (
              <div
                key={c.id}
                className="bg-surface border border-border rounded-xl overflow-hidden hover:border-border-hover transition-colors"
              >
                {/* 메인 행 */}
                <div className="flex items-center p-4 gap-3">
                  {/* 사건 유형 뱃지 */}
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${CASE_TYPE_COLORS[c.caseType] ?? CASE_TYPE_COLORS["기타"]}`}>
                    {c.caseType}
                  </span>

                  {/* 의뢰인 + 설명 */}
                  <button
                    onClick={() => navigate(`/cases/${c.id}`)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-text-primary font-medium">{c.clientName}</p>
                      {createdDate && (
                        <span className="text-[10px] text-text-dim/60">{createdDate}</span>
                      )}
                    </div>
                    <p className="text-sm text-text-dim truncate max-w-[500px]">{c.description}</p>
                  </button>

                  {/* 상태 뱃지들 */}
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    {/* 계약 */}
                    <span
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        cp?.contractSigned
                          ? "bg-success/10 text-success"
                          : "bg-surface text-text-dim/50"
                      }`}
                      title="계약 체결"
                    >
                      <FileSignature className="w-3 h-3" />
                      계약
                    </span>
                    {/* 착수금 */}
                    <span
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        cp?.retainerPaid
                          ? "bg-success/10 text-success"
                          : "bg-surface text-text-dim/50"
                      }`}
                      title="착수금 입금"
                    >
                      <Banknote className="w-3 h-3" />
                      착수금
                    </span>
                    {/* 미납 부가비용 */}
                    {unpaid > 0 && (
                      <span
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-error/10 text-error"
                        title="미납 부가비용"
                      >
                        <Receipt className="w-3 h-3" />
                        {unpaid.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* 진행 상태 */}
                  <span className={`text-xs px-2 py-1 rounded shrink-0 ${STATUS_STYLES[c.status] ?? ""}`}>
                    {c.status}
                  </span>

                  {/* 확장 토글 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedId(isExpanded ? null : c.id);
                    }}
                    className="p-1 text-text-dim hover:text-gold transition-colors shrink-0"
                  >
                    <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>
                </div>

                {/* 모바일: 상태 뱃지 */}
                <div className="sm:hidden flex items-center gap-1.5 px-4 pb-3 -mt-1">
                  <span
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      cp?.contractSigned ? "bg-success/10 text-success" : "bg-surface text-text-dim/50"
                    }`}
                  >
                    <FileSignature className="w-3 h-3" />계약
                  </span>
                  <span
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      cp?.retainerPaid ? "bg-success/10 text-success" : "bg-surface text-text-dim/50"
                    }`}
                  >
                    <Banknote className="w-3 h-3" />착수금
                  </span>
                  {unpaid > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-error/10 text-error">
                      <Receipt className="w-3 h-3" />{unpaid.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* 확장 패널: 인라인 수임료 관리 */}
                {isExpanded && (
                  <ExpandedPanel
                    caseData={c}
                    onUpdatePayment={(data) => handleUpdatePayment(c.id, data)}
                    onNavigate={() => navigate(`/cases/${c.id}`)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}

/** 확장 패널 — 계약/수임료 빠른 관리 + 부가비용 요약 */
function ExpandedPanel({
  caseData,
  onUpdatePayment,
  onNavigate,
}: {
  caseData: Case;
  onUpdatePayment: (data: ContractPayment) => void;
  onNavigate: () => void;
}) {
  const cp: ContractPayment = caseData.contractPayment ?? {
    contractSigned: false,
    retainerPaid: false,
    successFeeAgreed: false,
  };

  const costs = caseData.costs ?? [];
  const totalCost = costs.reduce((s, c) => s + c.amount, 0);
  const paidCost = costs.filter((c) => c.paid).reduce((s, c) => s + c.amount, 0);
  const unpaidCost = totalCost - paidCost;

  const toggle = (field: "contractSigned" | "retainerPaid" | "successFeeAgreed") => {
    const updated = { ...cp, [field]: !cp[field] };
    if (field === "retainerPaid" && !updated.retainerPaid) {
      updated.retainerAmount = undefined;
      updated.retainerDate = undefined;
      updated.retainerMethod = undefined;
      updated.receiptIssued = undefined;
    }
    if (field === "successFeeAgreed" && !updated.successFeeAgreed) {
      updated.successFeeAmount = undefined;
    }
    onUpdatePayment(updated);
  };

  const setMethod = (method: PaymentMethod) => {
    const updated = { ...cp, retainerMethod: method };
    if (method !== "현금") updated.receiptIssued = undefined;
    onUpdatePayment(updated);
  };

  return (
    <div className="border-t border-border bg-navy-light/30 px-4 py-4 space-y-4">
      {/* 계약/수임료 토글 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 계약 체결 */}
        <button
          onClick={() => toggle("contractSigned")}
          className="flex items-center justify-between p-3 bg-surface rounded-lg hover:bg-surface/80 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileSignature className={`w-4 h-4 ${cp.contractSigned ? "text-success" : "text-text-dim"}`} />
            <span className="text-xs text-text-primary">계약 체결</span>
          </div>
          {cp.contractSigned ? (
            <CheckCircle2 className="w-4 h-4 text-success" />
          ) : (
            <XCircle className="w-4 h-4 text-text-dim/40" />
          )}
        </button>

        {/* 착수금 입금 */}
        <button
          onClick={() => toggle("retainerPaid")}
          className="flex items-center justify-between p-3 bg-surface rounded-lg hover:bg-surface/80 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Banknote className={`w-4 h-4 ${cp.retainerPaid ? "text-success" : "text-text-dim"}`} />
            <span className="text-xs text-text-primary">착수금 입금</span>
            {cp.retainerAmount && (
              <span className="text-[10px] text-text-dim">
                ({cp.retainerAmount.toLocaleString()})
              </span>
            )}
          </div>
          {cp.retainerPaid ? (
            <CheckCircle2 className="w-4 h-4 text-success" />
          ) : (
            <XCircle className="w-4 h-4 text-text-dim/40" />
          )}
        </button>

        {/* 성공보수 약정 */}
        <button
          onClick={() => toggle("successFeeAgreed")}
          className="flex items-center justify-between p-3 bg-surface rounded-lg hover:bg-surface/80 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Trophy className={`w-4 h-4 ${cp.successFeeAgreed ? "text-gold" : "text-text-dim"}`} />
            <span className="text-xs text-text-primary">성공보수</span>
            {cp.successFeeAmount && (
              <span className="text-[10px] text-text-dim">
                ({cp.successFeeAmount.toLocaleString()})
              </span>
            )}
          </div>
          {cp.successFeeAgreed ? (
            <CheckCircle2 className="w-4 h-4 text-gold" />
          ) : (
            <XCircle className="w-4 h-4 text-text-dim/40" />
          )}
        </button>
      </div>

      {/* 착수금 상세 (입금 시) */}
      {cp.retainerPaid && (
        <div className="flex flex-wrap items-center gap-2 pl-1">
          {/* 결제 수단 */}
          <div className="flex gap-1">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors ${
                  cp.retainerMethod === m.value
                    ? "border-gold/40 bg-gold-dim text-gold"
                    : "border-border text-text-dim hover:border-border-hover"
                }`}
              >
                <m.icon className="w-3 h-3" />
                {m.label}
              </button>
            ))}
          </div>
          {/* 현금 계산서 */}
          {cp.retainerMethod === "현금" && (
            <button
              onClick={() => onUpdatePayment({ ...cp, receiptIssued: !cp.receiptIssued })}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors ${
                cp.receiptIssued
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-warning/30 bg-warning/10 text-warning"
              }`}
            >
              <ReceiptText className="w-3 h-3" />
              {cp.receiptIssued ? "계산서 발행완료" : "계산서 미발행"}
            </button>
          )}
          {/* 입금일 */}
          {cp.retainerDate && (
            <span className="text-[11px] text-text-dim">
              입금일: {cp.retainerDate}
            </span>
          )}
        </div>
      )}

      {/* 부가비용 요약 */}
      {costs.length > 0 && (
        <div className="flex items-center gap-4 pl-1">
          <div className="flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5 text-gold" />
            <span className="text-xs text-text-dim">부가비용</span>
          </div>
          <span className="text-xs text-text-primary">{totalCost.toLocaleString()}원</span>
          <span className="text-xs text-success">{paidCost.toLocaleString()} 납부</span>
          {unpaidCost > 0 && (
            <span className="text-xs text-error">{unpaidCost.toLocaleString()} 미납</span>
          )}
        </div>
      )}

      {/* 상세 보기 */}
      <div className="flex justify-end">
        <button
          onClick={onNavigate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gold hover:text-gold-bright transition-colors"
        >
          상세 보기
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
