import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutGrid, Clock, Heart, Loader2, Mic, Calculator, CalendarClock } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import useCaseDetail from "../hooks/useCaseDetail";
import CaseHeader from "../components/cases/CaseHeader";
import OverviewTab from "../components/cases/OverviewTab";
import UnifiedTimelineTab from "../components/cases/UnifiedTimelineTab";
import ClientCareTab from "../components/cases/ClientCareTab";
import FeeManagementTab from "../components/accounting/FeeManagementTab";
import CaseExpenseTab from "../components/accounting/CaseExpenseTab";
import DepositManagementTab from "../components/accounting/DepositManagementTab";
import ScheduleTab from "../components/cases/ScheduleTab";
import type { Fee, Installment, CaseExpense, Deposit } from "../types/accounting";
import {
  getFeesByCase,
  createFee,
  updateFee,
  getInstallments,
  createInstallment,
  updateInstallment,
  deleteInstallment,
  getCaseExpenses,
  createCaseExpense,
  updateCaseExpense,
  deleteCaseExpense,
  getDepositsByCase,
  createDeposit,
  updateDeposit,
  deleteDeposit,
  recalculateFeeTotals,
} from "../services/firebase/accounting";
import { autoDeductFromDeposit } from "../services/depositAutoDeduct";
import { createRevenueFromFeePayment } from "../services/autoRevenue";
import type { FeePaymentType } from "../services/autoRevenue";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../config/firebase";

type TabKey = "overview" | "timeline" | "schedule" | "clientcare" | "finance";

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("overview");
  const user = useAuth((s) => s.user);

  const {
    caseData,
    documents,
    recordings,
    opponentDocs,
    loading,
    error,
    updateStatus,
    addNote,
    uploadOpponentDoc,
    removeOpponentDoc,
    removeCase,
    updateContractPayment,
    addCostItem,
    updateCostItem,
    removeCostItem,
  } = useCaseDetail(id ?? "");

  // ── 재무 데이터 상태 ──
  const [fee, setFee] = useState<Fee | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [caseExpenses, setCaseExpenses] = useState<CaseExpense[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const uid = user?.uid ?? "";

  // 재무 데이터 로딩
  useEffect(() => {
    if (!id || !uid) return;
    const loadFinance = async () => {
      try {
        const [fees, exps, deps] = await Promise.all([
          getFeesByCase(id, uid),
          getCaseExpenses(id, uid),
          getDepositsByCase(id, uid),
        ]);
        const primaryFee = fees[0] ?? null;
        setFee(primaryFee);
        if (primaryFee) {
          const insts = await getInstallments(primaryFee.id);
          setInstallments(insts);
        }
        setCaseExpenses(exps);
        setDeposits(deps);
      } catch (err) {
        console.error("재무 데이터 로딩 실패:", err);
      }
    };
    loadFinance();
  }, [id, uid]);

  // 재무 핸들러
  const handleCreateFee = async (data: Omit<Fee, "id" | "createdAt" | "updatedAt">) => {
    try {
      const feeId = await createFee(data);
      const fees = await getFeesByCase(id!, uid);
      setFee(fees.find((f) => f.id === feeId) ?? null);
    } catch (err) {
      console.error("수임료 생성 실패:", err);
    }
  };

  /**
   * 수임료 집계(totalAgreedAmount, totalPaidAmount, totalOutstanding, status)를
   * 현재 Fee + Installments 기반으로 재계산하여 Firestore에 저장합니다.
   */
  const syncFeeTotals = async (currentFee: Fee, currentInstallments: Installment[]) => {
    const totals = recalculateFeeTotals(currentFee, currentInstallments);
    await updateFee(currentFee.id, totals);
    // 로컬 상태 갱신
    const fees = await getFeesByCase(id!, uid);
    setFee(fees.find((f) => f.id === currentFee.id) ?? fees[0] ?? null);
  };

  // 매출 자동 등록 헬퍼
  const tryAutoRevenue = async (paymentType: FeePaymentType, amount: number, feeId: string) => {
    if (!caseData || !fee || amount <= 0) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      await createRevenueFromFeePayment({
        ownerId: uid,
        caseId: id!,
        feeId,
        clientName: caseData.clientName,
        paymentType,
        amount,
        date: today,
        paymentMethod: "계좌이체",
      });
      setToast("매출이 자동으로 등록되었습니다");
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error("매출 자동 등록 실패:", err);
    }
  };

  const handleUpdateFee = async (data: Partial<Fee>) => {
    if (!fee) return;
    try {
      // 착수금 납부 감지: paid가 false→true
      const retainerPaidBefore = fee.retainer?.paid === true;
      const retainerPaidAfter = data.retainer?.paid === true;

      // 성공보수 입금 감지
      const successBefore = fee.successFee?.status;
      const successAfter = data.successFee?.status;

      await updateFee(fee.id, data);
      const fees = await getFeesByCase(id!, uid);
      const updatedFee = fees.find((f) => f.id === fee.id) ?? fees[0] ?? null;
      if (updatedFee) {
        setFee(updatedFee);
        await syncFeeTotals(updatedFee, installments);
      } else {
        setFee(null);
      }

      // 착수금 납부 완료 시 매출 자동 등록
      if (!retainerPaidBefore && retainerPaidAfter && data.retainer?.amount) {
        await tryAutoRevenue("착수금", data.retainer.amount, fee.id);
      }

      // 성공보수 입금완료 시 매출 자동 등록
      if (successBefore !== "입금완료" && successAfter === "입금완료" && data.successFee?.claimedAmount) {
        await tryAutoRevenue("성공보수", data.successFee.claimedAmount, fee.id);
      }
    } catch (err) {
      console.error("수임료 수정 실패:", err);
    }
  };

  const handleCreateInstallment = async (data: Omit<Installment, "id">) => {
    if (!fee) return;
    try {
      await createInstallment(fee.id, data);
      const insts = await getInstallments(fee.id);
      setInstallments(insts);
      // 분할납부 변경 시 집계 재계산
      const fees = await getFeesByCase(id!, uid);
      const currentFee = fees.find((f) => f.id === fee.id) ?? fee;
      await syncFeeTotals(currentFee, insts);
    } catch (err) {
      console.error("분할납부 생성 실패:", err);
    }
  };

  const handleUpdateInstallment = async (instId: string, data: Partial<Installment>) => {
    if (!fee) return;
    try {
      // 분할납부 납부 감지: paid가 false→true
      const prevInst = installments.find((i) => i.id === instId);
      const wasPaid = prevInst?.paid === true;
      const nowPaid = data.paid === true;

      await updateInstallment(fee.id, instId, data);
      const insts = await getInstallments(fee.id);
      setInstallments(insts);
      const fees = await getFeesByCase(id!, uid);
      const currentFee = fees.find((f) => f.id === fee.id) ?? fee;
      await syncFeeTotals(currentFee, insts);

      // 분할납부 완료 시 매출 자동 등록
      if (!wasPaid && nowPaid) {
        const paidAmount = data.paidAmount ?? data.amount ?? prevInst?.amount ?? 0;
        if (paidAmount > 0) {
          await tryAutoRevenue("분할납부", paidAmount, fee.id);
        }
      }
    } catch (err) {
      console.error("분할납부 수정 실패:", err);
    }
  };

  const handleDeleteInstallment = async (instId: string) => {
    if (!fee) return;
    try {
      await deleteInstallment(fee.id, instId);
      const insts = await getInstallments(fee.id);
      setInstallments(insts);
      // 분할납부 삭제 시 집계 재계산
      const fees = await getFeesByCase(id!, uid);
      const currentFee = fees.find((f) => f.id === fee.id) ?? fee;
      await syncFeeTotals(currentFee, insts);
    } catch (err) {
      console.error("분할납부 삭제 실패:", err);
    }
  };

  const handleAddExpense = async (data: Omit<CaseExpense, "id" | "createdAt" | "updatedAt">) => {
    try {
      const expenseId = await createCaseExpense(data);

      // 의뢰인 부담 또는 선납후정산인 경우 예수금 자동 차감 시도
      if (data.bearer === "의뢰인" || data.bearer === "선납후정산") {
        try {
          const result = await autoDeductFromDeposit({
            caseId: data.caseId,
            ownerId: data.ownerId,
            expenseId,
            amount: data.amount,
            purpose: data.description,
            date: data.date,
          });

          if (result.deducted) {
            // 예수금 목록 갱신
            setDeposits(await getDepositsByCase(id!, uid));

            const deducted = result.deductedAmount ?? 0;

            if (result.remainingExpense === 0) {
              // 전액 충당 → 정산 완료
              await updateCaseExpense(expenseId, {
                reimbursed: true,
                reimbursedDate: data.date,
                reimbursedAmount: data.amount,
              });
            } else if (deducted > 0) {
              // 부분 충당 → 부분 정산 금액 기록
              await updateCaseExpense(expenseId, {
                reimbursedAmount: deducted,
              });
            }

            const deductedFormatted = deducted.toLocaleString();
            const msg = result.remainingExpense === 0
              ? `예수금에서 ${deductedFormatted}원이 자동 차감되었습니다`
              : `예수금에서 ${deductedFormatted}원 부분 차감 (미충당 ${(result.remainingExpense ?? 0).toLocaleString()}원)`;
            setToast(msg);
            setTimeout(() => setToast(null), 4000);
          }
        } catch (deductErr) {
          console.error("예수금 자동 차감 실패 (비용 등록은 완료):", deductErr);
        }
      }

      setCaseExpenses(await getCaseExpenses(id!, uid));
    } catch (err) {
      console.error("사건비용 추가 실패:", err);
    }
  };

  const handleUpdateExpense = async (expId: string, data: Partial<CaseExpense>) => {
    try {
      await updateCaseExpense(expId, data);
      setCaseExpenses(await getCaseExpenses(id!, uid));
    } catch (err) {
      console.error("사건비용 수정 실패:", err);
    }
  };

  const handleDeleteExpense = async (expId: string) => {
    try {
      await deleteCaseExpense(expId);
      setCaseExpenses(await getCaseExpenses(id!, uid));
    } catch (err) {
      console.error("사건비용 삭제 실패:", err);
    }
  };

  const handleUploadReceipt = async (file: File): Promise<string> => {
    if (!storage) {
      throw new Error("Firebase Storage가 초기화되지 않았습니다. (데모 모드에서는 파일 업로드가 불가합니다)");
    }
    // 파일명에서 경로 구분자 및 특수문자 제거 (경로 순회 방지)
    const sanitizedName = file.name.replace(/[/\\:*?"<>|]/g, "_");
    // 고유 ID + 타임스탬프로 예측 불가능한 경로 생성
    const uniqueId = crypto.randomUUID();
    const path = `receipts/${uid}/${uniqueId}_${Date.now()}_${sanitizedName}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  };

  const handleAddDeposit = async (data: Omit<Deposit, "id" | "createdAt" | "updatedAt">) => {
    try {
      await createDeposit(data);
      setDeposits(await getDepositsByCase(id!, uid));
    } catch (err) {
      console.error("예수금 추가 실패:", err);
    }
  };

  const handleUpdateDeposit = async (depId: string, data: Partial<Deposit>) => {
    try {
      await updateDeposit(depId, data);
      setDeposits(await getDepositsByCase(id!, uid));
    } catch (err) {
      console.error("예수금 수정 실패:", err);
    }
  };

  const handleDeleteDeposit = async (depId: string) => {
    try {
      await deleteDeposit(depId);
      setDeposits(await getDepositsByCase(id!, uid));
    } catch (err) {
      console.error("예수금 삭제 실패:", err);
    }
  };

  const handleNavigateToRecord = () => {
    if (!caseData) return;
    navigate("/record", {
      state: {
        caseId: caseData.id,
        clientName: caseData.clientName,
        caseDesc: caseData.description,
      },
    });
  };

  const handleDeleteCase = async () => {
    await removeCase();
    navigate("/cases");
  };

  if (loading) {
    return (
      <AppLayout title="사건 상세" subtitle="">
        <div className="flex items-center gap-3 justify-center py-16 text-text-dim">
          <Loader2 className="w-5 h-5 animate-spin" />
          로딩 중...
        </div>
      </AppLayout>
    );
  }

  if (error || !caseData) {
    return (
      <AppLayout title="사건 상세" subtitle="">
        <div className="text-center py-16">
          <p className="text-text-dim mb-4">
            {error ?? "사건을 찾을 수 없습니다."}
          </p>
          <button
            onClick={() => navigate("/cases")}
            className="px-4 py-2 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors"
          >
            사건 목록으로
          </button>
        </div>
      </AppLayout>
    );
  }

  const timeline = caseData.timeline ?? [];
  const totalCount = timeline.length + documents.length + recordings.length + opponentDocs.length;

  const tabs: { key: TabKey; label: string; count?: number; icon: React.ElementType }[] = [
    { key: "overview", label: "개요", icon: LayoutGrid },
    { key: "schedule", label: "일정 관리", icon: CalendarClock },
    { key: "finance", label: "재무", icon: Calculator },
    { key: "timeline", label: "활동 기록", count: totalCount, icon: Clock },
    { key: "clientcare", label: "의뢰인 케어", icon: Heart },
  ];

  return (
    <AppLayout title={caseData.clientName} subtitle={caseData.caseType}>
      {/* 상단 네비 */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate("/cases")}
          className="flex items-center gap-2 text-text-dim hover:text-gold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">사건 목록</span>
        </button>
        <button
          onClick={handleNavigateToRecord}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-xs hover:opacity-90 transition-opacity"
        >
          <Mic className="w-3.5 h-3.5" />
          추가 자료 등록
        </button>
      </div>

      {/* 사건 헤더 */}
      <CaseHeader
        caseData={caseData}
        onStatusChange={updateStatus}
        onDelete={handleDeleteCase}
      />

      {/* 탭 네비게이션 */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key
                ? "bg-gold-dim text-gold border border-gold/30"
                : "bg-surface text-text-dim border border-border hover:border-border-hover"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1 ${tab === t.key ? "text-gold/70" : "text-text-dim/60"}`}>
                ({t.count})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {tab === "overview" && (
        <OverviewTab
          caseData={caseData}
          documents={documents}
          recordings={recordings}
          opponentDocs={opponentDocs}
          onNavigateToRecord={handleNavigateToRecord}
          onSwitchTab={(t) => setTab(t as TabKey)}
          onUpdateContractPayment={updateContractPayment}
          onAddCostItem={addCostItem}
          onUpdateCostItem={updateCostItem}
          onRemoveCostItem={removeCostItem}
        />
      )}

      {tab === "schedule" && id && (
        <ScheduleTab caseId={id} />
      )}

      {tab === "timeline" && (
        <UnifiedTimelineTab
          timeline={timeline}
          documents={documents}
          recordings={recordings}
          opponentDocs={opponentDocs}
          onAddNote={addNote}
          onNavigateToRecord={handleNavigateToRecord}
          onUploadOpponentDoc={uploadOpponentDoc}
          onRemoveOpponentDoc={removeOpponentDoc}
        />
      )}

      {tab === "finance" && caseData && (
        <div className="space-y-8">
          <FeeManagementTab
            fee={fee}
            installments={installments}
            onCreateFee={handleCreateFee}
            onUpdateFee={handleUpdateFee}
            onCreateInstallment={handleCreateInstallment}
            onUpdateInstallment={handleUpdateInstallment}
            onDeleteInstallment={handleDeleteInstallment}
            caseId={caseData.id}
            ownerId={uid}
            clientName={caseData.clientName}
          />
          <CaseExpenseTab
            expenses={caseExpenses}
            deposits={deposits}
            onAdd={handleAddExpense}
            onUpdate={handleUpdateExpense}
            onDelete={handleDeleteExpense}
            onUploadReceipt={handleUploadReceipt}
            caseId={caseData.id}
            ownerId={uid}
            clientName={caseData.clientName}
          />
          <DepositManagementTab
            deposits={deposits}
            onAdd={handleAddDeposit}
            onUpdate={handleUpdateDeposit}
            onDelete={handleDeleteDeposit}
            caseId={caseData.id}
            ownerId={uid}
          />
        </div>
      )}

      {tab === "clientcare" && (
        <ClientCareTab
          caseData={caseData}
          documents={documents}
          recordings={recordings}
          ownerId={user?.uid ?? ""}
          firmName={user?.firmName ?? ""}
          lawyerName={user?.name ?? ""}
        />
      )}
      {/* 토스트 알림 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-info/90 text-white text-sm font-medium rounded-xl shadow-lg backdrop-blur-sm animate-fade-in">
          {toast}
        </div>
      )}
    </AppLayout>
  );
}
