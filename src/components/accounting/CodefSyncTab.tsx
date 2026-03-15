/**
 * CODEF 자동 수집 탭 컴포넌트
 *
 * FinancePage에 탭으로 통합되어 사용됩니다.
 * - 연결된 계좌/카드/홈택스 관리
 * - AI 거래 매칭 대기 목록
 * - 경비 분류 대기 목록
 * - 동기화 기록
 */

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  CreditCard,
  FileText,
  RefreshCw,
  Settings,
  Plus,
  Check,
  X,
  Loader2,
  Clock,
  ArrowDownLeft,
  Tag,
  History,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Link2Off,
} from "lucide-react";
import CodefAccountSetup from "./CodefAccountSetup";

// ─── Types ──────────────────────────────────

interface LinkedAccount {
  id: string;
  type: "bank" | "card" | "hometax";
  institutionName: string;
  accountNumberMasked: string; // ****1234
  nickname: string;
  lastSyncAt: string | null; // ISO timestamp
  status: "active" | "error" | "expired";
}

interface PendingMatch {
  id: string;
  date: string;
  amount: number;
  senderName: string;
  description: string;
  aiSuggestion: {
    caseId: string;
    caseLabel: string;
    feeType: string; // 착수금, 성공보수 등
    confidence: number; // 0~100
  } | null;
}

interface PendingClassification {
  id: string;
  date: string;
  merchantName: string;
  amount: number;
  aiCategory: string;
  aiCategoryType: "사무소 경비" | "사건 경비" | "개인";
  confidence: number; // 0~100
}

interface SyncLog {
  id: string;
  timestamp: string;
  source: string;
  collectedCount: number;
  matchedCount: number;
  classifiedCount: number;
  status: "success" | "error";
  errorMessage?: string;
}

// ─── Props ──────────────────────────────────

interface CodefSyncTabProps {
  ownerId: string;
}

// ─── 유틸리티 ────────────────────────────────

/** 금액 포맷: 1234567 → "1,234,567원" */
function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 상대 시간 표시 */
function relativeTime(isoString: string | null): string {
  if (!isoString) return "동기화 없음";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  return `${days}일 전`;
}

/** 신뢰도에 따른 색상 클래스 */
function confidenceColor(confidence: number): string {
  if (confidence >= 85) return "text-success";
  if (confidence >= 50) return "text-warning";
  return "text-error";
}

/** 신뢰도 배경 색상 */
function confidenceBg(confidence: number): string {
  if (confidence >= 85) return "bg-success/15";
  if (confidence >= 50) return "bg-warning/15";
  return "bg-error/15";
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

// ─── 데모 데이터 ─────────────────────────────

function getDemoAccounts(): LinkedAccount[] {
  return [
    {
      id: "acc-1",
      type: "bank",
      institutionName: "국민은행",
      accountNumberMasked: "****1234",
      nickname: "사무소 운영 계좌",
      lastSyncAt: new Date(Date.now() - 3 * 60000).toISOString(),
      status: "active",
    },
    {
      id: "acc-2",
      type: "card",
      institutionName: "신한카드",
      accountNumberMasked: "****5678",
      nickname: "업무용 카드",
      lastSyncAt: new Date(Date.now() - 60 * 60000).toISOString(),
      status: "active",
    },
    {
      id: "acc-3",
      type: "hometax",
      institutionName: "홈택스",
      accountNumberMasked: "",
      nickname: "",
      lastSyncAt: new Date(Date.now() - 24 * 60 * 60000).toISOString(),
      status: "active",
    },
  ];
}

function getDemoPendingMatches(): PendingMatch[] {
  return [
    {
      id: "pm-1",
      date: "2026-03-15",
      amount: 5000000,
      senderName: "김OO",
      description: "법률수임료",
      aiSuggestion: {
        caseId: "case-123",
        caseLabel: "민사 사건 #123 (김OO vs 박OO)",
        feeType: "착수금",
        confidence: 95,
      },
    },
    {
      id: "pm-2",
      date: "2026-03-14",
      amount: 3000000,
      senderName: "박OO",
      description: "입금",
      aiSuggestion: null,
    },
    {
      id: "pm-3",
      date: "2026-03-13",
      amount: 1500000,
      senderName: "이OO",
      description: "착수금",
      aiSuggestion: {
        caseId: "case-456",
        caseLabel: "형사 사건 #456 (이OO)",
        feeType: "착수금",
        confidence: 72,
      },
    },
  ];
}

function getDemoPendingClassifications(): PendingClassification[] {
  return [
    {
      id: "pc-1",
      date: "2026-03-15",
      merchantName: "GS주유소",
      amount: 50000,
      aiCategory: "교통비",
      aiCategoryType: "사무소 경비",
      confidence: 88,
    },
    {
      id: "pc-2",
      date: "2026-03-14",
      merchantName: "교보문고",
      amount: 35000,
      aiCategory: "도서/자료비",
      aiCategoryType: "사무소 경비",
      confidence: 92,
    },
  ];
}

function getDemoSyncLogs(): SyncLog[] {
  return [
    {
      id: "log-1",
      timestamp: "2026-03-15T14:30:00Z",
      source: "은행",
      collectedCount: 12,
      matchedCount: 3,
      classifiedCount: 0,
      status: "success",
    },
    {
      id: "log-2",
      timestamp: "2026-03-15T14:30:00Z",
      source: "카드",
      collectedCount: 8,
      matchedCount: 0,
      classifiedCount: 6,
      status: "success",
    },
    {
      id: "log-3",
      timestamp: "2026-03-14T09:00:00Z",
      source: "홈택스",
      collectedCount: 2,
      matchedCount: 0,
      classifiedCount: 0,
      status: "success",
    },
  ];
}

// ─── 컴포넌트 ────────────────────────────────

export default function CodefSyncTab({ ownerId }: CodefSyncTabProps) {
  // 데이터 상태
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [pendingClassifications, setPendingClassifications] = useState<
    PendingClassification[]
  >([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  // UI 상태
  const [showAccountSetup, setShowAccountSetup] = useState(false);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState(false);

  // 알림 토스트
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  /** 토스트 표시 */
  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    },
    []
  );

  /** 데이터 로드 */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: Firestore에서 실제 데이터 로드
      // 현재는 데모 데이터 사용
      await new Promise((resolve) => setTimeout(resolve, 500));
      setAccounts(getDemoAccounts());
      setPendingMatches(getDemoPendingMatches());
      setPendingClassifications(getDemoPendingClassifications());
      setSyncLogs(getDemoSyncLogs());
    } catch (err: unknown) {
      console.error("데이터 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** 계좌 동기화 */
  const handleSync = async (accountId: string) => {
    setSyncingAccountId(accountId);
    try {
      // TODO: 실제 CODEF 동기화 API 호출
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 동기화 시간 갱신
      setAccounts((prev) =>
        prev.map((acc) =>
          acc.id === accountId
            ? { ...acc, lastSyncAt: new Date().toISOString() }
            : acc
        )
      );
      showToast("동기화가 완료되었습니다.", "success");
    } catch {
      showToast("동기화에 실패했습니다. 다시 시도해 주세요.", "error");
    } finally {
      setSyncingAccountId(null);
    }
  };

  /** 매칭 확인 */
  const handleConfirmMatch = (matchId: string) => {
    setPendingMatches((prev) => prev.filter((m) => m.id !== matchId));
    showToast("거래가 사건에 매칭되었습니다.", "success");
  };

  /** 매칭 무시 */
  const handleIgnoreMatch = (matchId: string) => {
    setPendingMatches((prev) => prev.filter((m) => m.id !== matchId));
  };

  /** 경비 분류 확인 */
  const handleConfirmClassification = (classificationId: string) => {
    setPendingClassifications((prev) =>
      prev.filter((c) => c.id !== classificationId)
    );
    showToast("경비가 분류되었습니다.", "success");
  };

  /** 경비 분류 무시 */
  const handleIgnoreClassification = (classificationId: string) => {
    setPendingClassifications((prev) =>
      prev.filter((c) => c.id !== classificationId)
    );
  };

  /** 계좌 연결 성공 */
  const handleAccountSetupSuccess = () => {
    setShowAccountSetup(false);
    loadData();
    showToast("계좌가 연결되었습니다.", "success");
  };

  /** 날짜 포맷 (03-15 14:30) */
  const formatLogTimestamp = (iso: string): string => {
    const d = new Date(iso);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${month}-${day} ${hours}:${mins}`;
  };

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
                        {account.accountNumberMasked && (
                          <span className="text-xs text-text-dim">
                            {account.accountNumberMasked}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {account.nickname && (
                          <span className="text-xs text-text-dim/60 truncate">
                            {account.nickname}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-text-dim">
                          <Clock className="w-3 h-3" />
                          {relativeTime(account.lastSyncAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <button
                      onClick={() => handleSync(account.id)}
                      disabled={isSyncing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gold bg-gold-dim rounded-lg hover:bg-gold/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSyncing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      {isSyncing ? "동기화 중" : "동기화"}
                    </button>
                    <button className="w-8 h-8 flex items-center justify-center rounded-lg text-text-dim hover:text-text-primary hover:bg-surface transition-colors">
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

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

      {/* ── 섹션 2: 매칭 대기 ── */}
      {pendingMatches.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 p-5 border-b border-border">
            <ArrowDownLeft className="w-5 h-5 text-info" />
            <h3 className="font-semibold text-text-primary">매칭 대기</h3>
            <span className="px-2 py-0.5 bg-gold-dim text-gold text-xs font-bold rounded-full">
              {pendingMatches.length}건
            </span>
          </div>

          <div className="divide-y divide-border">
            {pendingMatches.map((match) => (
              <div key={match.id} className="p-4 space-y-3">
                {/* 거래 정보 */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-text-dim">
                        {match.date}
                      </span>
                      <span className="font-medium text-text-primary text-sm">
                        {formatWon(match.amount)}
                      </span>
                      <span className="text-sm text-text-dim truncate">
                        {match.senderName}
                      </span>
                    </div>
                    {match.description && (
                      <p className="text-xs text-text-dim/60 mt-0.5">
                        {match.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* AI 추천 */}
                {match.aiSuggestion ? (
                  <div className="flex items-center justify-between gap-3 p-3 bg-surface border border-border rounded-xl">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-dim">
                          AI 추천:
                        </span>
                        <span className="text-sm text-text-primary truncate">
                          {match.aiSuggestion.caseLabel}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 bg-info/15 text-info rounded">
                          {match.aiSuggestion.feeType}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span
                          className={`text-xs font-medium px-1.5 py-0.5 rounded ${confidenceBg(match.aiSuggestion.confidence)} ${confidenceColor(match.aiSuggestion.confidence)}`}
                        >
                          {match.aiSuggestion.confidence}%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleConfirmMatch(match.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-success/15 text-success rounded-lg hover:bg-success/25 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        확인
                      </button>
                      <button className="px-3 py-1.5 text-xs font-medium text-text-dim hover:text-text-primary bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors">
                        다른 사건
                      </button>
                      <button
                        onClick={() => handleIgnoreMatch(match.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-error hover:bg-error/10 transition-colors"
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
                      <button className="px-3 py-1.5 text-xs font-medium text-gold bg-gold-dim rounded-lg hover:bg-gold/20 transition-colors">
                        사건 직접 선택
                      </button>
                      <button
                        onClick={() => handleIgnoreMatch(match.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-error hover:bg-error/10 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 섹션 3: 경비 분류 대기 ── */}
      {pendingClassifications.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 p-5 border-b border-border">
            <Tag className="w-5 h-5 text-warning" />
            <h3 className="font-semibold text-text-primary">경비 분류 대기</h3>
            <span className="px-2 py-0.5 bg-gold-dim text-gold text-xs font-bold rounded-full">
              {pendingClassifications.length}건
            </span>
          </div>

          <div className="divide-y divide-border">
            {pendingClassifications.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* 거래 정보 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-text-dim">{item.date}</span>
                      <span className="text-sm text-text-primary truncate">
                        {item.merchantName}
                      </span>
                      <span className="font-medium text-text-primary text-sm">
                        {formatWon(item.amount)}
                      </span>
                    </div>

                    {/* AI 분류 결과 */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-text-dim">AI 분류:</span>
                      <span className="text-xs px-1.5 py-0.5 bg-gold-dim text-gold rounded">
                        {item.aiCategory}
                      </span>
                      <span className="text-xs text-text-dim">
                        ({item.aiCategoryType})
                      </span>
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded ${confidenceBg(item.confidence)} ${confidenceColor(item.confidence)}`}
                      >
                        {item.confidence}%
                      </span>
                    </div>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleConfirmClassification(item.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-success/15 text-success rounded-lg hover:bg-success/25 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      확인
                    </button>
                    <button className="px-3 py-1.5 text-xs font-medium text-text-dim hover:text-text-primary bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors">
                      수정
                    </button>
                    <button
                      onClick={() => handleIgnoreClassification(item.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-error hover:bg-error/10 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 섹션 4: 최근 동기화 기록 ── */}
      {syncLogs.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl backdrop-blur-sm overflow-hidden">
          <button
            onClick={() => setExpandedLogs((p) => !p)}
            className="w-full flex items-center justify-between p-5"
          >
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-text-dim" />
              <h3 className="font-semibold text-text-primary">
                최근 동기화 기록
              </h3>
            </div>
            {expandedLogs ? (
              <ChevronUp className="w-5 h-5 text-text-dim" />
            ) : (
              <ChevronDown className="w-5 h-5 text-text-dim" />
            )}
          </button>

          {expandedLogs && (
            <div className="border-t border-border divide-y divide-border">
              {syncLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 px-5 py-3 text-sm"
                >
                  <span className="text-text-dim text-xs shrink-0">
                    {formatLogTimestamp(log.timestamp)}
                  </span>
                  <span className="text-text-primary">
                    {log.source} 동기화:
                  </span>
                  <span className="text-text-dim">
                    {log.collectedCount}건 수집
                    {log.matchedCount > 0 && `, ${log.matchedCount}건 매칭`}
                    {log.classifiedCount > 0 &&
                      `, ${log.classifiedCount}건 분류`}
                  </span>
                  {log.status === "error" && (
                    <span className="text-xs text-error">
                      {log.errorMessage ?? "오류 발생"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 매칭/분류 대기 항목 없을 때 ── */}
      {!hasNoAccounts &&
        pendingMatches.length === 0 &&
        pendingClassifications.length === 0 && (
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
