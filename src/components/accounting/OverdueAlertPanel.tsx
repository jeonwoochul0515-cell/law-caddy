// 분할납부 연체 알림 패널
// 대시보드에 표시되는 연체 항목 요약 카드

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, MessageSquare, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { getOverdueItems, type OverdueItem } from "../../services/overdueDetector";
import { buildOverdueReminderPrompt, type OverdueReminderContext } from "../../services/prompts";
import { callClaude } from "../../services/claude";
import useAuth from "../../hooks/useAuth";

interface OverdueAlertPanelProps {
  ownerId: string;
}

/** 각 항목별 메시지 생성 상태 */
interface MessageState {
  loading: boolean;
  message: string;
  copied: boolean;
  error: string;
}

export default function OverdueAlertPanel({ ownerId }: OverdueAlertPanelProps) {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [items, setItems] = useState<OverdueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [messageStates, setMessageStates] = useState<Record<string, MessageState>>({});

  // 표시할 최대 항목 수
  const MAX_DISPLAY = 5;

  useEffect(() => {
    if (!ownerId) return;

    const fetchOverdue = async () => {
      try {
        setLoading(true);
        setError("");
        const overdueItems = await getOverdueItems(ownerId);
        setItems(overdueItems);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "연체 항목 조회 실패";
        setError(msg);
        console.error("연체 항목 조회 실패:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOverdue();
  }, [ownerId]);

  /** 메시지 생성 키 (feeId + installmentId) */
  const getItemKey = (item: OverdueItem): string =>
    `${item.fee.id}_${item.installment.id}`;

  /** 카카오톡 알림 메시지 생성 */
  const generateMessage = useCallback(async (item: OverdueItem) => {
    const key = getItemKey(item);

    setMessageStates((prev) => ({
      ...prev,
      [key]: { loading: true, message: "", copied: false, error: "" },
    }));

    try {
      const context: OverdueReminderContext = {
        clientName: item.clientName,
        overdueAmount: item.overdueAmount,
        dueDate: item.installment.dueDate,
        totalRemaining: item.totalRemaining,
        firmName: user?.firmName ?? "",
        lawyerName: user?.name ?? "",
        installmentSeq: item.installment.seq,
      };

      const prompt = buildOverdueReminderPrompt(context);
      const message = await callClaude(
        prompt,
        `${item.clientName} 의뢰인에게 보낼 수임료 납부 안내 메시지를 작성해 주세요.`,
        undefined,
        "low", // 납부 안내 문자 — 법률 판단이 아니다
      );

      setMessageStates((prev) => ({
        ...prev,
        [key]: { loading: false, message, copied: false, error: "" },
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "메시지 생성 실패";
      setMessageStates((prev) => ({
        ...prev,
        [key]: { loading: false, message: "", copied: false, error: msg },
      }));
    }
  }, [user]);

  /** 클립보드 복사 */
  const copyMessage = useCallback(async (key: string) => {
    const state = messageStates[key];
    if (!state?.message) return;

    try {
      await navigator.clipboard.writeText(state.message);
      setMessageStates((prev) => ({
        ...prev,
        [key]: { ...prev[key], copied: true },
      }));
      // 2초 후 복사 상태 초기화
      setTimeout(() => {
        setMessageStates((prev) => ({
          ...prev,
          [key]: { ...prev[key], copied: false },
        }));
      }, 2000);
    } catch {
      // 클립보드 접근 실패 시 무시
    }
  }, [messageStates]);

  /** 연체일수에 따른 색상 */
  const getOverdueSeverity = (days: number): { bg: string; text: string; label: string } => {
    if (days >= 30) {
      return { bg: "bg-error/15", text: "text-error", label: "심각" };
    }
    if (days >= 14) {
      return { bg: "bg-error/10", text: "text-error", label: "주의" };
    }
    return { bg: "bg-warning/10", text: "text-warning", label: "경고" };
  };

  /** 금액 포맷 */
  const formatAmount = (amount: number): string => {
    if (amount >= 10000) {
      const man = Math.floor(amount / 10000);
      const remainder = amount % 10000;
      return remainder > 0
        ? `${man.toLocaleString("ko-KR")}만 ${remainder.toLocaleString("ko-KR")}원`
        : `${man.toLocaleString("ko-KR")}만원`;
    }
    return `${amount.toLocaleString("ko-KR")}원`;
  };

  // 로딩 중이거나 항목이 없으면 렌더링하지 않음
  if (loading) return null;
  if (error) return null;
  if (items.length === 0) return null;

  const displayItems = items.slice(0, MAX_DISPLAY);
  const hasMore = items.length > MAX_DISPLAY;
  const totalOverdueAmount = items.reduce((sum, item) => sum + item.overdueAmount, 0);

  return (
    <div className="bg-surface border border-error/20 rounded-2xl backdrop-blur-sm overflow-hidden">
      {/* 헤더 */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between p-5 hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-error/15 rounded-full flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-error" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-text-primary">
              연체 알림
              <span className="ml-2 px-2 py-0.5 bg-error/15 text-error text-xs font-bold rounded-full">
                {items.length}건
              </span>
            </h3>
            <p className="text-sm text-text-dim mt-0.5">
              미납 총액 {formatAmount(totalOverdueAmount)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate("/finance");
            }}
            className="text-sm text-gold hover:text-gold-bright transition-colors"
          >
            전체 보기
          </button>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-text-dim" />
          ) : (
            <ChevronDown className="w-5 h-5 text-text-dim" />
          )}
        </div>
      </button>

      {/* 연체 항목 리스트 */}
      {expanded && (
        <div className="divide-y divide-border">
          {displayItems.map((item) => {
            const key = getItemKey(item);
            const severity = getOverdueSeverity(item.overdueDays);
            const msgState = messageStates[key];

            return (
              <div key={key} className="p-4">
                {/* 항목 정보 */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-text-primary truncate">
                        {item.clientName}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severity.bg} ${severity.text}`}>
                        {item.overdueDays}일 연체
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-sm text-text-dim">
                      <span>
                        {item.installment.seq}회차
                      </span>
                      <span>
                        기한: {item.installment.dueDate}
                      </span>
                      <span className="text-error font-medium">
                        {formatAmount(item.overdueAmount)}
                      </span>
                    </div>
                  </div>

                  {/* 메시지 생성 버튼 */}
                  <button
                    onClick={() => generateMessage(item)}
                    disabled={msgState?.loading}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-gold-dim text-gold text-sm rounded-lg hover:bg-gold/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MessageSquare className="w-4 h-4" />
                    {msgState?.loading ? "생성 중..." : "메시지 생성"}
                  </button>
                </div>

                {/* 생성된 메시지 */}
                {msgState?.message && (
                  <div className="mt-3 p-3 bg-surface border border-border rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-text-dim">카카오톡 메시지</span>
                      <button
                        onClick={() => copyMessage(key)}
                        className="flex items-center gap-1 text-xs text-gold hover:text-gold-bright transition-colors"
                      >
                        {msgState.copied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            복사됨
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            복사
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                      {msgState.message}
                    </p>
                  </div>
                )}

                {/* 에러 메시지 */}
                {msgState?.error && (
                  <div className="mt-3 p-3 bg-error/10 border border-error/20 rounded-xl">
                    <p className="text-sm text-error">{msgState.error}</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* 더 많은 항목이 있을 때 */}
          {hasMore && (
            <div className="p-4 text-center">
              <button
                onClick={() => navigate("/finance")}
                className="text-sm text-gold hover:text-gold-bright transition-colors"
              >
                나머지 {items.length - MAX_DISPLAY}건 더 보기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
