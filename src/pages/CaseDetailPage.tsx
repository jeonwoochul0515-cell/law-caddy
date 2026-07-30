import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutGrid, Clock, Heart, Loader2, Mic, Calculator, CalendarClock, X, FileDown, FileStack, Sparkles } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import useCaseDetail from "../hooks/useCaseDetail";
import CaseHeader from "../components/cases/CaseHeader";
import OverviewTab from "../components/cases/OverviewTab";
import UnifiedTimelineTab from "../components/cases/UnifiedTimelineTab";
import ClientCareTab from "../components/cases/ClientCareTab";
import CaseRecordsTab from "../components/cases/CaseRecordsTab";
import CaseAssistantTab from "../components/cases/CaseAssistantTab";
import FeeManagementTab from "../components/accounting/FeeManagementTab";
import CaseExpenseTab from "../components/accounting/CaseExpenseTab";
import DepositManagementTab from "../components/accounting/DepositManagementTab";
import ScheduleTab from "../components/cases/ScheduleTab";
import ContractGenerateModal from "../components/cases/ContractGenerateModal";
import type { LegalDocument } from "../types/document";
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
import { sendClientSms } from "../services/notify";
import { updateCase } from "../services/firebase/firestore";
import type { FeePaymentType } from "../services/autoRevenue";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../config/firebase";

type TabKey = "overview" | "timeline" | "schedule" | "clientcare" | "finance" | "records" | "assistant";

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
    caseRecords,
    loading,
    error,
    updateStatus,
    updateInfo,
    addNote,
    uploadOpponentDoc,
    removeOpponentDoc,
    uploadCaseRecord,
    removeCaseRecord,
    analyzeCaseRecord,
    generateRebuttalDraft,
    generateClientRecordSummary,
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
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [contractResult, setContractResult] = useState<{
    contractText: string;
    signingToken: string;
    documentText: string;
  } | null>(null);
  const [signingRequests, setSigningRequests] = useState<import("../types/signing").SigningRequest[]>([]);

  // 서명 링크 문자 발송
  const [smsPhone, setSmsPhone] = useState("");
  const [smsSending, setSmsSending] = useState(false);

  const uid = user?.uid ?? "";

  // 사건에 저장된 의뢰인 번호를 발송 입력란에 미리 채움
  useEffect(() => {
    if (caseData?.clientPhone) setSmsPhone((prev) => prev || caseData.clientPhone!);
  }, [caseData?.clientPhone]);

  /** 의뢰인에게 문자 발송 + 번호를 사건에 저장 (공통 헬퍼) */
  const sendSmsToClient = useCallback(
    async (text: string) => {
      if (!caseData) return;
      const normalized = smsPhone.replace(/\D/g, "");
      setSmsSending(true);
      try {
        await sendClientSms(normalized, text);
        if (normalized !== caseData.clientPhone) {
          updateCase(caseData.id, { clientPhone: normalized }).catch(() => {});
        }
        setToast("문자를 발송했습니다");
      } catch (err) {
        setToast(err instanceof Error ? err.message : "문자 발송에 실패했습니다");
      } finally {
        setSmsSending(false);
        setTimeout(() => setToast(null), 3000);
      }
    },
    [caseData, smsPhone],
  );

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

  // 서명 요청 로딩
  useEffect(() => {
    if (!id || !uid) return;
    import("../services/firebase/signing").then(({ getSigningRequestsByCase }) => {
      getSigningRequestsByCase(id, uid).then(setSigningRequests).catch(console.error);
    });
  }, [id, uid, contractResult]); // contractResult 변경 시 재조회

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

  const handleNavigateToDocument = useCallback((doc: LegalDocument) => {
    if (!caseData || !user) return;
    navigate("/record/document", {
      state: {
        existingDocument: true,
        existingFinalDocument: doc.finalDocument,
        documentId: doc.id,
        caseId: caseData.id,
        clientName: caseData.clientName,
        caseType: caseData.caseType,
        caseDesc: caseData.description,
        docType: doc.docType,
        ownerId: user.uid,
        firmName: user.firmName ?? "",
        lawyerName: user.name ?? "",
        barLicenseNumber: user.barLicenseNumber ?? "",
        businessAddress: user.businessAddress ?? "",
        lawyerPhone: user.phone ?? "",
        agentResults: doc.agentResults ?? {
          precedent: "", legal: "", stt: "", analysis: "", docgen: "", review: "",
        },
        checkQuestions: doc.checkQuestions ?? [],
        checkpointAnswers: [],
      },
    });
  }, [caseData, user, navigate]);

  const handleCreateContract = useCallback(() => {
    setContractModalOpen(true);
  }, []);

  const handleContractComplete = useCallback(async (result: {
    contractText: string;
    signingToken: string;
    documentText: string;
    fees: import("../types/signing").ContractFees;
  }) => {
    setContractModalOpen(false);
    setContractResult(result);

    // 계약·수임료 현황 자동 업데이트
    if (caseData) {
      const { fees } = result;
      const updatedPayment = {
        ...(caseData.contractPayment ?? { contractSigned: false, retainerPaid: false, successFeeAgreed: false }),
        contractSigned: true,
        retainerAmount: fees.retainerAmount,
        successFeeAgreed: fees.successFeeType !== "none",
        successFeeType: fees.successFeeType === "percent" ? "percent" as const : fees.successFeeType === "fixed" ? "fixed" as const : undefined,
        successFeePercent: fees.successFeePercent,
        successFeeAmount: fees.successFeeAmount,
      };
      updateContractPayment(updatedPayment).catch(console.error);
    }
  }, [caseData, updateContractPayment]);

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
    { key: "records", label: "사건기록", count: caseRecords.length, icon: FileStack },
    { key: "assistant", label: "AI 비서", icon: Sparkles },
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
        onUpdateInfo={updateInfo}
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
          onNavigateToDocument={handleNavigateToDocument}
          onCreateContract={handleCreateContract}
          signingRequests={signingRequests}
        />
      )}

      {tab === "schedule" && id && (
        <ScheduleTab caseId={id} />
      )}

      {tab === "records" && (
        <CaseRecordsTab
          caseRecords={caseRecords}
          onUpload={uploadCaseRecord}
          onRemove={removeCaseRecord}
          onAnalyze={analyzeCaseRecord}
          onGenerateRebuttal={generateRebuttalDraft}
          onClientSummary={generateClientRecordSummary}
        />
      )}

      {tab === "assistant" && caseData && (
        <CaseAssistantTab
          caseData={caseData}
          recordings={recordings}
          documents={documents}
          caseRecords={caseRecords}
          fee={fee}
          installments={installments}
          caseExpenses={caseExpenses}
          deposits={deposits}
        />
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
            claimContext={{
              clientPhone: caseData.clientPhone,
              firmName: user?.firmName ?? "법률사무소",
              lawyerName: user?.name ?? "담당",
              caseLabel: caseData.caseNumber
                ? `${caseData.courtName ?? ""} ${caseData.caseNumber}`.trim()
                : caseData.description.slice(0, 40) || caseData.caseType,
            }}
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
      {/* 수임계약서 생성 모달 */}
      <ContractGenerateModal
        isOpen={contractModalOpen}
        onClose={() => setContractModalOpen(false)}
        caseData={caseData}
        user={user!}
        onComplete={handleContractComplete}
      />

      {/* 계약서 생성 완료 패널 */}
      {contractResult && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy-light border border-border rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-primary">수임계약서 완성</h3>
              <button onClick={() => setContractResult(null)} className="text-text-dim hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-text-dim">
              카카오톡으로 아래 2가지를 의뢰인에게 보내주세요.
            </p>

            {/* 1. 계약서 다운로드 */}
            <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-text-primary">1️⃣ 계약서 파일 (의뢰인이 읽어볼 용도)</p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      const { exportToDocx } = await import("../services/docxExport");
                      await exportToDocx(contractResult.documentText, {
                        docType: caseData.caseType === "형사" ? "사건위임계약서(형사)" : "사건위임계약서",
                        clientName: caseData.clientName,
                        date: new Date().toISOString().slice(0, 10),
                      });
                    } catch (err) { console.error("DOCX 내보내기 실패:", err); }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text-primary hover:border-gold transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  Word 다운로드
                </button>
                <button
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    printWindow.document.write(`
                      <!DOCTYPE html>
                      <html><head>
                        <title>사건위임계약서</title>
                        <style>
                          body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; font-size: 12pt; line-height: 1.8; padding: 40px; max-width: 800px; margin: 0 auto; color: #000; }
                          pre { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: inherit; line-height: inherit; }
                          @media print { body { padding: 20px; } }
                        </style>
                      </head><body>
                        <pre>${contractResult.documentText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                      </body></html>
                    `);
                    printWindow.document.close();
                    printWindow.onload = () => { printWindow.print(); };
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text-primary hover:border-gold transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  PDF 다운로드
                </button>
              </div>
            </div>

            {/* 2. 서명 링크 복사 */}
            <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-text-primary">2️⃣ 서명 링크 (의뢰인이 서명할 페이지)</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={`${window.location.origin}/sign/${contractResult.signingToken}`}
                  className="flex-1 px-3 py-2 bg-navy-light border border-border rounded-lg text-xs text-text-dim font-mono truncate"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/sign/${contractResult.signingToken}`);
                    setToast("서명 링크가 복사되었습니다");
                    setTimeout(() => setToast(null), 2000);
                  }}
                  className="px-3 py-2 bg-gold-dim text-gold rounded-lg text-sm font-medium hover:bg-gold/20 transition-colors whitespace-nowrap"
                >
                  복사
                </button>
              </div>
              {/* 의뢰인에게 문자로 바로 보내기 */}
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={smsPhone}
                  onChange={(e) => setSmsPhone(e.target.value)}
                  placeholder="의뢰인 휴대폰 번호 (예: 010-1234-5678)"
                  className="flex-1 px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40"
                />
                <button
                  onClick={() =>
                    sendSmsToClient(
                      `[${user?.firmName ?? "법률사무소"}] ${caseData?.clientName ?? "의뢰인"}님, 사건위임계약서 전자서명 링크입니다.\n${window.location.origin}/sign/${contractResult.signingToken}\n링크는 24시간 동안 유효합니다. 확인 후 서명 부탁드립니다.`,
                    )
                  }
                  disabled={smsSending || smsPhone.replace(/\D/g, "").length < 10}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gold-dim text-gold rounded-lg text-sm font-medium hover:bg-gold/20 transition-colors whitespace-nowrap disabled:opacity-40"
                >
                  {smsSending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  문자로 보내기
                </button>
              </div>
              <p className="text-[11px] text-text-dim">⏰ 서명 링크는 24시간 유효합니다 · 발송한 번호는 사건에 저장됩니다</p>
            </div>

            {/* 닫기 */}
            <button
              onClick={() => setContractResult(null)}
              className="w-full py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity"
            >
              완료
            </button>
          </div>
        </div>
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
