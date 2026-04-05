/**
 * CODEF 자동 수집 탭 컴포넌트
 *
 * FinancePage에 탭으로 통합되어 사용됩니다.
 * - 연결된 계좌/카드 관리 (Firestore)
 * - 동기화 실행 (CODEF API)
 * - AI 입금 매칭 대기 목록
 * - AI 카드 경비 분류 대기 목록
 */

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  CreditCard,
  FileText,
  RefreshCw,
  Plus,
  Check,
  X,
  Loader2,
  Clock,
  ArrowDownLeft,
  Tag,
  AlertCircle,
  Link2Off,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import CodefAccountSetup from "./CodefAccountSetup";

// ─── Services ──────────────────────────────
import {
  syncBankTransactions,
  syncCardTransactions,
} from "../../services/codefApi";
import {
  getCodefAccountsByOwner,
  updateCodefAccount,
  createBankTransaction,
  createCardTransaction,
  getPendingMatchesByOwner,
  updatePendingMatch,
  updateBankTransaction,
  getUnclassifiedCardTransactions,
  updateCardTransaction,
} from "../../services/firebase/codef";
import type {
  CodefAccount,
  PendingMatch,
  CardTransaction,
} from "../../types/codef";
import { serverTimestamp } from "firebase/firestore";

// ─── Props ──────────────────────────────────

interface CodefSyncTabProps {
  ownerId: string;
}

// ─── 유틸리티 ────────────────────────────────

/** 금액 포맷: 1234567 → "1,234,567원" */
function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** CODEF 날짜 형식 (YYYYMMDD) */
function formatCodefDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** YYYYMMDD → YYYY-MM-DD */
function formatDateDisplay(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** Firestore Timestamp 또는 undefined → 상대 시간 */
function relativeTime(
  ts: { seconds: number; nanoseconds: number } | undefined,
): string {
  if (!ts) return "동기화 없음";
  const diff = Date.now() - ts.seconds * 1000;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  return `${days}일 전`;
}

/** 신뢰도에 따른 색상 클래스 (0~1 → 퍼센트 환산) */
function confidenceColor(confidence: number): string {
  const pct = confidence <= 1 ? confidence * 100 : confidence;
  if (pct >= 85) return "text-success";
  if (pct >= 50) return "text-warning";
  return "text-error";
}

function confidenceBg(confidence: number): string {
  const pct = confidence <= 1 ? confidence * 100 : confidence;
  if (pct >= 85) return "bg-success/15";
  if (pct >= 50) return "bg-warning/15";
  return "bg-error/15";
}

/** 신뢰도 표시 (0~1 → 퍼센트) */
function confidencePercent(confidence: number): number {
  return confidence <= 1
    ? Math.round(confidence * 100)
    : Math.round(confidence);
}

/** 계좌 유형 아이콘 */
function accountTypeIcon(type: "bank" | "card" | "hometax") {
  switch (type) {
    case "bank":
      return Building2;
    case "card":
      return CreditCard;
    case "hometax":
      return FileText;
  }
}

/** 간단한 해시 생성 (중복 방지용) */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ─── 컴포넌트 ────────────────────────────────

export default function CodefSyncTab({ ownerId }: CodefSyncTabProps) {
  // 데이터 상태
  const [accounts, setAccounts] = useState<CodefAccount[]>([]);
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [unclassifiedCards, setUnclassifiedCards] = useState<CardTransaction[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  // UI 상태
  const [showAccountSetup, setShowAccountSetup] = useState(false);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [expandedMatches, setExpandedMatches] = useState(true);
  const [expandedCards, setExpandedCards] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // 에러
  const [syncError, setSyncError] = useState<string | null>(null);

  // 토스트
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    },
    [],
  );

  // ─── 데이터 로드 ───

  const loadAccounts = useCallback(async () => {
    try {
      const result = await getCodefAccountsByOwner(ownerId);
      setAccounts(result);
    } catch (err) {
      console.error("계좌 목록 로드 실패:", err);
    }
  }, [ownerId]);

  const loadPendingMatches = useCallback(async () => {
    try {
      const result = await getPendingMatchesByOwner(ownerId);
      setPendingMatches(result);
    } catch (err) {
      console.error("매칭 대기 로드 실패:", err);
    }
  }, [ownerId]);

  const loadUnclassifiedCards = useCallback(async () => {
    try {
      const result = await getUnclassifiedCardTransactions(ownerId);
      setUnclassifiedCards(result);
    } catch (err) {
      console.error("미분류 카드 로드 실패:", err);
    }
  }, [ownerId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadAccounts(),
        loadPendingMatches(),
        loadUnclassifiedCards(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [loadAccounts, loadPendingMatches, loadUnclassifiedCards]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ─── 동기화 ───

  const handleSync = useCallback(
    async (account: CodefAccount) => {
      setSyncingAccountId(account.id);
      setSyncError(null);

      try {
        // 상태를 syncing으로 갱신
        await updateCodefAccount(account.id, { syncStatus: "syncing" });
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === account.id ? { ...a, syncStatus: "syncing" as const } : a,
          ),
        );

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const startStr = formatCodefDate(startDate);
        const endStr = formatCodefDate(endDate);

        if (account.type === "bank") {
          // 은행 거래내역 동기화
          const transactions = await syncBankTransactions({
            connectedId: account.connectedId,
            organization: account.institutionCode,
            account: account.accountNumber ?? "",
            startDate: startStr,
            endDate: endStr,
          });

          // Firestore에 저장
          for (const tx of transactions) {
            const hashInput = `${tx.transactionDate}${tx.transactionTime}${tx.amount}${tx.balance}${tx.counterpartyName}`;
            const transactionHash = simpleHash(hashInput);

            await createBankTransaction({
              ownerId,
              codefAccountId: account.id,
              transactionDate: tx.transactionDate,
              transactionTime: tx.transactionTime,
              type: tx.type as "입금" | "출금",
              amount: tx.amount,
              balance: tx.balance,
              counterpartyName: tx.counterpartyName,
              memo: tx.memo,
              transactionHash,
              matchStatus: "unmatched",
            });
          }

          // 동기화 완료 상태 갱신
          await updateCodefAccount(account.id, {
            syncStatus: "idle",
            lastSyncAt: serverTimestamp() as unknown as undefined,
          });

          showToast(
            `${account.institutionName} 동기화 완료 (${transactions.length}건)`,
            "success",
          );
        } else if (account.type === "card") {
          // 카드 거래내역 동기화
          const transactions = await syncCardTransactions({
            connectedId: account.connectedId,
            organization: account.institutionCode,
            cardNumber: account.accountNumber ?? "",
            startDate: startStr,
            endDate: endStr,
          });

          // Firestore에 저장
          for (const tx of transactions) {
            await createCardTransaction({
              ownerId,
              codefAccountId: account.id,
              approvalDate: tx.approvalDate,
              approvalTime: tx.approvalTime,
              approvalNumber: tx.approvalNumber,
              merchantName: tx.merchantName,
              merchantCategory: tx.merchantCategory,
              amount: tx.amount,
              cardNumberMasked: tx.cardNumberMasked,
              classificationStatus: "unclassified",
            });
          }

          await updateCodefAccount(account.id, {
            syncStatus: "idle",
            lastSyncAt: serverTimestamp() as unknown as undefined,
          });

          showToast(
            `${account.institutionName} 동기화 완료 (${transactions.length}건)`,
            "success",
          );
        }

        // 데이터 리로드
        await Promise.all([
          loadAccounts(),
          loadPendingMatches(),
          loadUnclassifiedCards(),
        ]);
      } catch (err) {
        console.error("동기화 실패:", err);
        const msg =
          err instanceof Error ? err.message : "동기화에 실패했습니다.";
        setSyncError(msg);
        showToast("동기화에 실패했습니다. 다시 시도해 주세요.", "error");

        // 에러 상태 기록
        try {
          await updateCodefAccount(account.id, {
            syncStatus: "error",
            errorMessage: msg,
          });
          setAccounts((prev) =>
            prev.map((a) =>
              a.id === account.id
                ? { ...a, syncStatus: "error" as const, errorMessage: msg }
                : a,
            ),
          );
        } catch {
          // 무시
        }
      } finally {
        setSyncingAccountId(null);
      }
    },
    [
      ownerId,
      showToast,
      loadAccounts,
      loadPendingMatches,
      loadUnclassifiedCards,
    ],
  );

  // ─── 매칭 확인/무시 ───

  const handleConfirmMatch = useCallback(
    async (match: PendingMatch) => {
      if (actionInProgress) return;
      setActionInProgress(match.id);

      try {
        const topCandidate = match.candidates[0];

        await updatePendingMatch(match.id, {
          status: "confirmed",
          confirmedCaseId: topCandidate?.caseId,
          confirmedFeeId: topCandidate?.feeId,
        });

        await updateBankTransaction(match.bankTransactionId, {
          matchStatus: "auto_matched",
          matchedCaseId: topCandidate?.caseId,
          matchedFeeId: topCandidate?.feeId,
          matchConfidence: topCandidate?.confidence,
          matchReason: topCandidate?.reason,
        });

        setPendingMatches((prev) => prev.filter((m) => m.id !== match.id));
        showToast("거래가 사건에 매칭되었습니다.", "success");
      } catch (err) {
        console.error("매칭 확인 실패:", err);
        showToast("매칭 확인에 실패했습니다.", "error");
      } finally {
        setActionInProgress(null);
      }
    },
    [actionInProgress, showToast],
  );

  const handleIgnoreMatch = useCallback(
    async (match: PendingMatch) => {
      if (actionInProgress) return;
      setActionInProgress(match.id);

      try {
        await updatePendingMatch(match.id, { status: "rejected" });
        await updateBankTransaction(match.bankTransactionId, {
          matchStatus: "ignored",
        });

        setPendingMatches((prev) => prev.filter((m) => m.id !== match.id));
      } catch (err) {
        console.error("매칭 무시 실패:", err);
        showToast("처리에 실패했습니다.", "error");
      } finally {
        setActionInProgress(null);
      }
    },
    [actionInProgress, showToast],
  );

  // ─── 카드 분류 확인/무시 ───

  const handleConfirmClassification = useCallback(
    async (card: CardTransaction) => {
      if (actionInProgress) return;
      setActionInProgress(card.id);

      try {
        await updateCardTransaction(card.id, {
          classificationStatus: "auto_classified",
          classifiedAs: card.classifiedAs,
          classifiedCategory: card.classifiedCategory,
          classificationConfidence: card.classificationConfidence,
          classificationReason: card.classificationReason,
        });

        setUnclassifiedCards((prev) => prev.filter((c) => c.id !== card.id));
        showToast("경비가 분류되었습니다.", "success");
      } catch (err) {
        console.error("분류 확인 실패:", err);
        showToast("분류 확인에 실패했습니다.", "error");
      } finally {
        setActionInProgress(null);
      }
    },
    [actionInProgress, showToast],
  );

  const handleIgnoreClassification = useCallback(
    async (card: CardTransaction) => {
      if (actionInProgress) return;
      setActionInProgress(card.id);

      try {
        await updateCardTransaction(card.id, {
          classificationStatus: "ignored",
        });

        setUnclassifiedCards((prev) => prev.filter((c) => c.id !== card.id));
      } catch (err) {
        console.error("분류 무시 실패:", err);
        showToast("처리에 실패했습니다.", "error");
      } finally {
        setActionInProgress(null);
      }
    },
    [actionInProgress, showToast],
  );

  // ─── 계좌 연결 성공 ───

  const handleAccountSetupSuccess = useCallback(() => {
    setShowAccountSetup(false);
    loadAccounts();
    showToast("계좌가 연결되었습니다.", "success");
  }, [loadAccounts, showToast]);

  // ── 로딩 ──
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-dim">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <p className="text-sm">데이터를 불러오는 중...</p>
      </div>
    );
  }

  const hasNoAccounts = accounts.length === 0;

  return (
    <div className="space-y-6">
      {/* ── 토스트 알림 ── */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2 ${
            toast.type === "success"
              ? "bg-success/15 border-success/30 text-success"
              : "bg-error/15 border-error/30 text-error"
          }`}
        >
          {toast.type === "success" ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* ── 섹션 1: 연결된 계좌 ── */}
      <section className="bg-surface border border-border rounded-2xl backdrop-blur-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gold" />
            <h3 className="font-semibold text-text-primary">연결된 계좌</h3>
            <span className="text-sm text-text-dim">
              ({accounts.length}개)
            </span>
          </div>
        </div>

        <div className="divide-y divide-border">
          {hasNoAccounts ? (
            <div className="p-8 text-center">
              <Link2Off className="w-10 h-10 text-text-dim mx-auto mb-3" />
              <p className="text-text-dim text-sm mb-1">
                연결된 계좌가 없습니다.
              </p>
              <p className="text-text-dim/60 text-xs">
                계좌를 연결하여 자동 수집을 시작하세요
              </p>
            </div>
          ) : (
            accounts.map((account) => {
              const Icon = accountTypeIcon(account.type);
              const isSyncing = syncingAccountId === account.id;

              return (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-4 hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-gold-dim rounded-xl flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-gold" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary text-sm truncate">
                          {account.institutionName}
                        </span>
                        {account.accountNumber && (
                          <span className="text-xs text-text-dim">
                            {account.accountNumber}
                          </span>
                        )}
                        {account.syncStatus === "error" && (
                          <span className="text-xs text-error px-1.5 py-0.5 bg-error/15 rounded">
                            오류
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {account.alias && (
                          <span className="text-xs text-text-dim/60 truncate">
                            {account.alias}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-text-dim">
                          <Clock className="w-3 h-3" />
                          {relativeTime(
                            account.lastSyncAt as
                              | { seconds: number; nanoseconds: number }
                              | undefined,
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <button
                      onClick={() => handleSync(account)}
                      disabled={isSyncing || syncingAccountId !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gold bg-gold-dim rounded-lg hover:bg-gold/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSyncing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      {isSyncing ? "동기화 중" : "동기화"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 동기화 에러 메시지 */}
        {syncError && (
          <div className="mx-4 mb-4 flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-xl">
            <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
            <p className="text-sm text-error">{syncError}</p>
          </div>
        )}

        {/* 계좌 추가 버튼 */}
        <div className="p-4 border-t border-border">
          <button
            onClick={() => setShowAccountSetup(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gold border border-gold/20 rounded-xl hover:bg-gold-dim transition-colors"
          >
            <Plus className="w-4 h-4" />
            계좌 연결
          </button>
        </div>
      </section>

      {/* ── 섹션 2: 입금 매칭 대기 ── */}
      {pendingMatches.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl backdrop-blur-sm overflow-hidden">
          <button
            onClick={() => setExpandedMatches((p) => !p)}
            className="w-full flex items-center justify-between p-5 border-b border-border"
          >
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="w-5 h-5 text-info" />
              <h3 className="font-semibold text-text-primary">
                입금 매칭 대기
              </h3>
              <span className="px-2 py-0.5 bg-gold-dim text-gold text-xs font-bold rounded-full">
                {pendingMatches.length}건
              </span>
            </div>
            {expandedMatches ? (
              <ChevronUp className="w-5 h-5 text-text-dim" />
            ) : (
              <ChevronDown className="w-5 h-5 text-text-dim" />
            )}
          </button>

          {expandedMatches && (
            <div className="divide-y divide-border">
              {pendingMatches.map((match) => {
                const topCandidate =
                  match.candidates.length > 0 ? match.candidates[0] : null;
                const isProcessing = actionInProgress === match.id;

                return (
                  <div key={match.id} className="p-4 space-y-3">
                    {/* 거래 요약 */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-text-primary">
                          {match.bankTransactionSummary}
                        </p>
                      </div>
                    </div>

                    {/* AI 추천 */}
                    {topCandidate ? (
                      <div className="flex items-center justify-between gap-3 p-3 bg-surface border border-border rounded-xl">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-text-dim">
                              AI 추천:
                            </span>
                            <span className="text-sm text-text-primary truncate">
                              {topCandidate.clientName}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 bg-info/15 text-info rounded">
                              {topCandidate.paymentType}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`text-xs font-medium px-1.5 py-0.5 rounded ${confidenceBg(topCandidate.confidence)} ${confidenceColor(topCandidate.confidence)}`}
                            >
                              {confidencePercent(topCandidate.confidence)}%
                            </span>
                            {topCandidate.reason && (
                              <span className="text-xs text-text-dim truncate">
                                {topCandidate.reason}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleConfirmMatch(match)}
                            disabled={isProcessing}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-success/15 text-success rounded-lg hover:bg-success/25 transition-colors disabled:opacity-50"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            확인
                          </button>
                          <button
                            onClick={() => handleIgnoreMatch(match)}
                            disabled={isProcessing}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 p-3 bg-surface border border-border rounded-xl">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-text-dim" />
                          <span className="text-xs text-text-dim">
                            AI 추천: 매칭 가능한 사건이 없습니다
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleIgnoreMatch(match)}
                            disabled={isProcessing}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── 섹션 3: 카드 경비 분류 대기 ── */}
      {unclassifiedCards.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl backdrop-blur-sm overflow-hidden">
          <button
            onClick={() => setExpandedCards((p) => !p)}
            className="w-full flex items-center justify-between p-5 border-b border-border"
          >
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-warning" />
              <h3 className="font-semibold text-text-primary">
                카드 비용 분류 대기
              </h3>
              <span className="px-2 py-0.5 bg-gold-dim text-gold text-xs font-bold rounded-full">
                {unclassifiedCards.length}건
              </span>
            </div>
            {expandedCards ? (
              <ChevronUp className="w-5 h-5 text-text-dim" />
            ) : (
              <ChevronDown className="w-5 h-5 text-text-dim" />
            )}
          </button>

          {expandedCards && (
            <div className="divide-y divide-border">
              {unclassifiedCards.map((card) => {
                const isProcessing = actionInProgress === card.id;

                return (
                  <div key={card.id} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* 거래 정보 */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-text-dim">
                            {formatDateDisplay(card.approvalDate)}
                          </span>
                          <span className="text-sm text-text-primary truncate">
                            {card.merchantName}
                          </span>
                          <span className="font-medium text-text-primary text-sm">
                            {formatWon(card.amount)}
                          </span>
                        </div>

                        {/* AI 분류 결과 (있는 경우) */}
                        {card.classifiedCategory && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-text-dim">
                              AI 분류:
                            </span>
                            <span className="text-xs px-1.5 py-0.5 bg-gold-dim text-gold rounded">
                              {card.classifiedCategory}
                            </span>
                            {card.classificationConfidence != null && (
                              <span
                                className={`text-xs font-medium px-1.5 py-0.5 rounded ${confidenceBg(card.classificationConfidence)} ${confidenceColor(card.classificationConfidence)}`}
                              >
                                {confidencePercent(
                                  card.classificationConfidence,
                                )}
                                %
                              </span>
                            )}
                          </div>
                        )}

                        {/* 카테고리 없으면 가맹점 카테고리 표시 */}
                        {!card.classifiedCategory && card.merchantCategory && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-text-dim">
                              가맹점 분류:
                            </span>
                            <span className="text-xs text-text-dim/60">
                              {card.merchantCategory}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex items-center gap-2 shrink-0">
                        {card.classifiedCategory && (
                          <button
                            onClick={() => handleConfirmClassification(card)}
                            disabled={isProcessing}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-success/15 text-success rounded-lg hover:bg-success/25 transition-colors disabled:opacity-50"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            확인
                          </button>
                        )}
                        <button
                          onClick={() => handleIgnoreClassification(card)}
                          disabled={isProcessing}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── 매칭/분류 대기 항목 없을 때 ── */}
      {!hasNoAccounts &&
        pendingMatches.length === 0 &&
        unclassifiedCards.length === 0 && (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center backdrop-blur-sm">
            <Check className="w-10 h-10 text-success mx-auto mb-3" />
            <p className="text-text-primary text-sm font-medium">
              모든 거래가 처리되었습니다
            </p>
            <p className="text-text-dim text-xs mt-1">
              새로운 거래가 수집되면 여기에 표시됩니다
            </p>
          </div>
        )}

      {/* ── 계좌 연결 모달 ── */}
      {showAccountSetup && (
        <CodefAccountSetup
          ownerId={ownerId}
          onClose={() => setShowAccountSetup(false)}
          onSuccess={handleAccountSetupSuccess}
        />
      )}
    </div>
  );
}
