import { useState } from "react";
import {
  MessageSquare, Copy, Check, Loader2, Trash2,
  Phone, TrendingUp, FileOutput, Flag,
} from "lucide-react";
import useClientCare from "../../hooks/useClientCare";
import type { MessageStage } from "../../types/clientCare";
import type { Case } from "../../types/case";
import type { LegalDocument } from "../../types/document";
import type { Recording } from "../../types/recording";

interface ClientCareTabProps {
  caseData: Case;
  documents: LegalDocument[];
  recordings: Recording[];
  ownerId: string;
  firmName: string;
  lawyerName: string;
}

const STAGE_CONFIG: {
  stage: MessageStage;
  label: string;
  desc: string;
  icon: React.ElementType;
  psychology: string;
}[] = [
  {
    stage: "post_consult",
    label: "상담 후 안내",
    desc: "상담 내용 요약 + 다음 단계 안내",
    icon: Phone,
    psychology: "투명성 효과 — 진행 상황을 알면 신뢰 증가",
  },
  {
    stage: "progress_update",
    label: "진행 상황 안내",
    desc: "수행 작업 목록 + 현재 단계 안내",
    icon: TrendingUp,
    psychology: "노동 환상 — 구체적 작업량이 가치를 높임",
  },
  {
    stage: "doc_delivery",
    label: "문서 전달 안내",
    desc: "문서 설명 + 투입 노력 가시화",
    icon: FileOutput,
    psychology: "IKEA 효과 — 투입된 노력을 보면 가치 상승",
  },
  {
    stage: "case_closure",
    label: "사건 종결 안내",
    desc: "최종 보고서 + 감사 메시지",
    icon: Flag,
    psychology: "Peak-End Rule — 마지막 인상이 전체를 결정",
  },
];

export default function ClientCareTab({
  caseData,
  documents,
  recordings,
  ownerId,
  firmName,
  lawyerName,
}: ClientCareTabProps) {
  const {
    messages,
    loading,
    generatingStage,
    generateMessage,
    removeMessage,
  } = useClientCare({
    caseData,
    documents,
    recordings,
    ownerId,
    firmName,
    lawyerName,
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [errorStage, setErrorStage] = useState<MessageStage | null>(null);

  const handleGenerate = async (stage: MessageStage) => {
    setErrorStage(null);
    try {
      await generateMessage(stage);
    } catch {
      setErrorStage(stage);
    }
  };

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* clipboard fail */ }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await removeMessage(id);
    } finally {
      setRemovingId(null);
    }
  };

  // 각 단계별 가장 최근 메시지
  const latestByStage = STAGE_CONFIG.reduce<Record<string, typeof messages[0]>>((acc, cfg) => {
    const found = messages.find((m) => m.stage === cfg.stage);
    if (found) acc[cfg.stage] = found;
    return acc;
  }, {});

  // 현재 사건 상태에 따라 추천 단계 하이라이트
  const suggestedStage = getSuggestedStage(caseData, documents, recordings, messages.map((m) => m.stage));

  if (loading) {
    return (
      <div className="flex items-center gap-3 justify-center py-16 text-text-dim">
        <Loader2 className="w-5 h-5 animate-spin" />
        로딩 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 안내 */}
      <div className="bg-[#FEE500]/5 border border-[#FEE500]/15 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <MessageSquare className="w-5 h-5 text-[#FEE500] mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-text-primary mb-1">
              의뢰인 케어 메시지
            </p>
            <p className="text-xs text-text-dim leading-relaxed">
              사건 진행 단계마다 의뢰인에게 보낼 카카오톡 메시지를 자동 생성합니다.
              변호사님의 노력을 의뢰인이 체감할 수 있도록 설계되었습니다.
            </p>
          </div>
        </div>
      </div>

      {/* 4단계 카드 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {STAGE_CONFIG.map((cfg) => {
          const isGenerating = generatingStage === cfg.stage;
          const isSuggested = suggestedStage === cfg.stage;
          const hasMessage = !!latestByStage[cfg.stage];
          const hasError = errorStage === cfg.stage;

          return (
            <div
              key={cfg.stage}
              className={`bg-surface border rounded-2xl p-5 transition-colors ${
                isSuggested && !hasMessage
                  ? "border-gold/40 ring-1 ring-gold/20"
                  : "border-border"
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`p-2 rounded-lg ${
                  hasMessage ? "bg-green/10 text-green" : "bg-gold-dim text-gold"
                }`}>
                  <cfg.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-text-primary">
                      {cfg.label}
                    </h4>
                    {isSuggested && !hasMessage && (
                      <span className="px-1.5 py-0.5 bg-gold-dim text-gold text-[10px] font-medium rounded">
                        추천
                      </span>
                    )}
                    {hasMessage && (
                      <span className="px-1.5 py-0.5 bg-green/10 text-green text-[10px] font-medium rounded">
                        생성됨
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-dim mt-0.5">{cfg.desc}</p>
                  <p className="text-[10px] text-text-dim/60 mt-1 italic">
                    {cfg.psychology}
                  </p>
                </div>
              </div>

              {/* 생성 버튼 */}
              <button
                onClick={() => handleGenerate(cfg.stage)}
                disabled={isGenerating}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                  hasMessage
                    ? "bg-surface border border-border text-text-dim hover:border-gold/30 hover:text-gold"
                    : "bg-gradient-to-r from-gold to-gold-bright text-navy hover:opacity-90"
                }`}
              >
                {isGenerating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 메시지 생성 중...</>
                ) : hasMessage ? (
                  <><MessageSquare className="w-4 h-4" /> 다시 생성</>
                ) : (
                  <><MessageSquare className="w-4 h-4" /> 메시지 생성</>
                )}
              </button>

              {hasError && (
                <p className="text-xs text-error mt-2">메시지 생성에 실패했습니다. 다시 시도해 주세요.</p>
              )}
            </div>
          );
        })}
      </div>

      {/* 생성된 메시지 목록 */}
      {messages.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            생성된 메시지 ({messages.length})
          </h3>
          <div className="space-y-3">
            {messages.map((msg) => {
              const stageCfg = STAGE_CONFIG.find((c) => c.stage === msg.stage);
              const dateStr = msg.createdAt?.toDate?.()
                ? msg.createdAt.toDate().toLocaleDateString("ko-KR", {
                    month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })
                : "";

              return (
                <div
                  key={msg.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden"
                >
                  {/* 헤더 */}
                  <div className="p-4 flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-[#FEE500]/10">
                      {stageCfg && <stageCfg.icon className="w-3.5 h-3.5 text-[#FEE500]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary font-medium">
                        {stageCfg?.label ?? msg.stage}
                      </p>
                      {dateStr && (
                        <p className="text-xs text-text-dim">{dateStr}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-dim hover:text-gold transition-colors rounded-lg hover:bg-gold-dim"
                      >
                        {copiedId === msg.id ? (
                          <><Check className="w-3.5 h-3.5" /> 복사됨</>
                        ) : (
                          <><Copy className="w-3.5 h-3.5" /> 복사</>
                        )}
                      </button>
                      <button
                        onClick={() => handleRemove(msg.id)}
                        disabled={removingId === msg.id}
                        className="p-1.5 text-text-dim hover:text-error transition-colors rounded-lg hover:bg-error/10 disabled:opacity-40"
                      >
                        {removingId === msg.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 카카오톡 스타일 메시지 */}
                  <div className="border-t border-border p-4">
                    <div className="bg-[#FEE500]/5 border border-[#FEE500]/15 rounded-xl p-4">
                      <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                    {/* 작업량 요약 */}
                    {msg.metadata?.workBreakdown && msg.metadata.workBreakdown.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.metadata.workBreakdown.map((w, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 bg-gold-dim text-gold text-[10px] font-medium rounded-full"
                          >
                            {w.label} {w.count}건
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** 사건 상태에 따라 적절한 단계를 추천 */
function getSuggestedStage(
  caseData: Case,
  documents: LegalDocument[],
  recordings: Recording[],
  existingStages: MessageStage[],
): MessageStage | null {
  if (caseData.status === "완료" && !existingStages.includes("case_closure")) {
    return "case_closure";
  }
  const hasCompletedDocs = documents.some((d) => d.status === "completed");
  if (hasCompletedDocs && !existingStages.includes("doc_delivery")) {
    return "doc_delivery";
  }
  const hasAnalysis = documents.some((d) => d.agentResults?.analysis);
  if (hasAnalysis && !existingStages.includes("progress_update")) {
    return "progress_update";
  }
  if (recordings.length > 0 && !existingStages.includes("post_consult")) {
    return "post_consult";
  }
  return null;
}
