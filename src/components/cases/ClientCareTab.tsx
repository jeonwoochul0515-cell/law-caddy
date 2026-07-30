import { useEffect, useState } from "react";
import {
  MessageSquare, Copy, Check, Loader2, Trash2,
  Phone, TrendingUp, FileOutput, Flag, Send, Link2, Globe,
} from "lucide-react";
import useClientCare from "../../hooks/useClientCare";
import { sendClientSms } from "../../services/notify";
import { updateCase } from "../../services/firebase/firestore";
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

  // 문자 발송
  const [smsPhone, setSmsPhone] = useState(caseData.clientPhone ?? "");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [smsError, setSmsError] = useState<string | null>(null);

  // 사건에 저장된 번호가 뒤늦게 로드되면 입력란에 반영
  useEffect(() => {
    if (caseData.clientPhone) setSmsPhone((prev) => prev || caseData.clientPhone!);
  }, [caseData.clientPhone]);

  // 의뢰인 포털 (읽기 전용 공유 링크)
  const [portalEnabled, setPortalEnabled] = useState(!!caseData.portalEnabled && !!caseData.portalToken);
  const [portalToken, setPortalToken] = useState(caseData.portalToken ?? "");
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);
  const [portalSent, setPortalSent] = useState(false);
  const portalUrl = portalToken ? `${window.location.origin}/portal/${portalToken}` : "";

  async function handlePortalToggle() {
    setPortalBusy(true);
    try {
      if (portalEnabled) {
        await updateCase(caseData.id, { portalEnabled: false });
        setPortalEnabled(false);
      } else {
        // 기존 토큰 재사용, 없으면 새로 발급 (32자 hex)
        let token = portalToken;
        if (!token) {
          const bytes = new Uint8Array(16);
          crypto.getRandomValues(bytes);
          token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
          setPortalToken(token);
        }
        await updateCase(caseData.id, { portalToken: token, portalEnabled: true });
        setPortalEnabled(true);
      }
    } catch {
      /* 실패 시 상태 유지 */
    } finally {
      setPortalBusy(false);
    }
  }

  async function handlePortalCopy() {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setPortalCopied(true);
      setTimeout(() => setPortalCopied(false), 2000);
    } catch { /* 무시 */ }
  }

  async function handlePortalSms() {
    const normalized = smsPhone.replace(/\D/g, "");
    setSendingId("__portal__");
    setSmsError(null);
    try {
      await sendClientSms(
        normalized,
        `[${firmName}] ${caseData.clientName}님, 사건 진행 상황을 확인하실 수 있는 페이지입니다.\n${portalUrl}\n진행 내역과 다가오는 일정이 업데이트됩니다. 궁금하신 점은 편하게 연락 주세요.\n${firmName} ${lawyerName} 변호사`,
      );
      if (normalized !== caseData.clientPhone) {
        updateCase(caseData.id, { clientPhone: normalized }).catch(() => {});
      }
      setPortalSent(true);
      setTimeout(() => setPortalSent(false), 3000);
    } catch (err) {
      setSmsError(err instanceof Error ? err.message : "문자 발송에 실패했습니다.");
    } finally {
      setSendingId(null);
    }
  }

  const handleSendSms = async (id: string, content: string) => {
    const normalized = smsPhone.replace(/\D/g, "");
    setSendingId(id);
    setSmsError(null);
    try {
      await sendClientSms(normalized, content);
      if (normalized !== caseData.clientPhone) {
        updateCase(caseData.id, { clientPhone: normalized }).catch(() => {});
      }
      setSentId(id);
      setTimeout(() => setSentId(null), 3000);
    } catch (err) {
      setSmsError(err instanceof Error ? err.message : "문자 발송에 실패했습니다.");
    } finally {
      setSendingId(null);
    }
  };

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
      {/* 의뢰인 포털 (읽기 전용 공유 링크) */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${portalEnabled ? "bg-success/10 text-success" : "bg-surface border border-border text-text-dim"}`}>
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary mb-1">의뢰인 포털</p>
              <p className="text-xs text-text-dim leading-relaxed max-w-md">
                의뢰인이 로그인 없이 진행 상황·다가오는 일정을 열람하는 전용 페이지입니다.
                "사건 어떻게 되고 있나요" 전화를 줄여줍니다.
              </p>
            </div>
          </div>
          <button
            onClick={handlePortalToggle}
            disabled={portalBusy}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
              portalEnabled
                ? "border border-border text-text-dim hover:text-error hover:border-error/30"
                : "bg-gradient-to-r from-gold to-gold-bright text-navy hover:shadow-lg hover:shadow-gold/20"
            }`}
          >
            {portalBusy ? "처리 중..." : portalEnabled ? "포털 비활성화" : "포털 링크 만들기"}
          </button>
        </div>

        {/* 문자 발송 대상 번호 (한 번 입력하면 사건에 저장 — 포털·케어 메시지 발송 공용) */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <Phone className="w-4 h-4 text-text-dim shrink-0" />
          <input
            type="tel"
            value={smsPhone}
            onChange={(e) => setSmsPhone(e.target.value)}
            placeholder="의뢰인 휴대폰 번호 (예: 010-1234-5678)"
            className="flex-1 max-w-xs px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40"
          />
          <span className="text-[11px] text-text-dim">발송한 번호는 사건에 저장됩니다</span>
        </div>
        {smsError && <p className="text-xs text-error mt-2">{smsError}</p>}

        {portalEnabled && portalUrl && (
          <div className="mt-4 flex gap-2 flex-wrap">
            <input
              readOnly
              value={portalUrl}
              className="flex-1 min-w-[200px] px-3 py-2 bg-navy-light border border-border rounded-lg text-xs text-text-dim font-mono truncate"
            />
            <button
              onClick={handlePortalCopy}
              className="flex items-center gap-1.5 px-3 py-2 border border-border text-text-dim rounded-lg text-xs font-medium hover:border-gold/30 hover:text-gold transition-colors"
            >
              {portalCopied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              {portalCopied ? "복사됨" : "복사"}
            </button>
            <button
              onClick={handlePortalSms}
              disabled={sendingId === "__portal__" || smsPhone.replace(/\D/g, "").length < 10}
              title={smsPhone.replace(/\D/g, "").length < 10 ? "아래 의뢰인 번호를 먼저 입력하세요" : "포털 링크를 문자로 발송"}
              className="flex items-center gap-1.5 px-3 py-2 bg-gold-dim text-gold rounded-lg text-xs font-medium hover:bg-gold/20 transition-colors disabled:opacity-40"
            >
              {sendingId === "__portal__" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : portalSent ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {portalSent ? "발송됨" : "문자로 보내기"}
            </button>
          </div>
        )}
      </div>

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
                        onClick={() => handleSendSms(msg.id, msg.content)}
                        disabled={sendingId === msg.id || smsPhone.replace(/\D/g, "").length < 10}
                        title={smsPhone.replace(/\D/g, "").length < 10 ? "위에 의뢰인 번호를 먼저 입력하세요" : "문자로 발송"}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-dim hover:text-gold transition-colors rounded-lg hover:bg-gold-dim disabled:opacity-40"
                      >
                        {sendingId === msg.id ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 발송 중</>
                        ) : sentId === msg.id ? (
                          <><Check className="w-3.5 h-3.5" /> 발송됨</>
                        ) : (
                          <><Send className="w-3.5 h-3.5" /> 문자 발송</>
                        )}
                      </button>
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
