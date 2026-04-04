import { useState, useEffect, useCallback } from "react";
import { callClaude } from "../services/claude";
import {
  buildPostConsultPrompt,
  buildProgressUpdatePrompt,
  buildDocDeliveryPrompt,
  buildCaseClosurePrompt,
} from "../services/prompts";
import {
  createClientCareMessage,
  getClientCareMessages,
  deleteClientCareMessage,
} from "../services/firebase/firestore";
import { addTimelineEvent } from "../services/firebase/firestore";
import type { MessageStage, ClientCareMessage, ClientCarePromptContext, WorkBreakdownItem } from "../types/clientCare";
import type { Case } from "../types/case";
import type { LegalDocument } from "../types/document";
import type { Recording } from "../types/recording";

interface UseClientCareParams {
  caseData: Case | null;
  documents: LegalDocument[];
  recordings: Recording[];
  ownerId: string;
  firmName: string;
  lawyerName: string;
}

const STAGE_LABELS: Record<MessageStage, string> = {
  post_consult: "상담 후 안내",
  progress_update: "진행 상황 안내",
  doc_delivery: "문서 전달 안내",
  case_closure: "사건 종결 안내",
};

function buildWorkBreakdown(
  documents: LegalDocument[],
  recordings: Recording[],
  timeline: Case["timeline"],
): WorkBreakdownItem[] {
  const items: WorkBreakdownItem[] = [];
  if (recordings.length > 0) {
    items.push({ label: "상담 녹음 분석", count: recordings.length });
  }
  if (documents.length > 0) {
    items.push({ label: "법률 문서 작성", count: documents.length });
  }
  // 에이전트 분석 횟수 추정 (문서당 6개 에이전트)
  const agentRuns = documents.length * 6;
  if (agentRuns > 0) {
    items.push({ label: "AI 에이전트 분석", count: agentRuns });
  }
  const timelineLen = timeline?.length ?? 0;
  if (timelineLen > 0) {
    items.push({ label: "타임라인 기록", count: timelineLen });
  }
  return items;
}

function buildTimelineSummary(timeline: Case["timeline"]): string {
  if (!timeline || timeline.length === 0) return "";
  return timeline
    .map((e) => {
      const dateStr = e.date?.toDate?.()
        ? e.date.toDate().toLocaleDateString("ko-KR")
        : "";
      return `- [${dateStr}] ${e.label}: ${e.detail}`;
    })
    .join("\n");
}

function buildDocumentsSummary(documents: LegalDocument[]): string {
  if (documents.length === 0) return "";
  return documents
    .map((d) => `- ${d.docType}: ${d.status === "completed" ? "완료" : d.status}`)
    .join("\n");
}

export default function useClientCare({
  caseData,
  documents,
  recordings,
  ownerId,
  firmName,
  lawyerName,
}: UseClientCareParams) {
  const [messages, setMessages] = useState<ClientCareMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingStage, setGeneratingStage] = useState<MessageStage | null>(null);

  // 메시지 목록 조회
  useEffect(() => {
    if (!caseData?.id || !ownerId) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await getClientCareMessages(caseData.id, ownerId);
        if (!cancelled) setMessages(result);
      } catch (err) {
        console.error("의뢰인 케어 메시지 조회 실패:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [caseData?.id, ownerId]);

  // 메시지 생성
  const generateMessage = useCallback(async (stage: MessageStage) => {
    if (!caseData || generatingStage) return;
    setGeneratingStage(stage);

    try {
      const timeline = caseData.timeline ?? [];
      const workBreakdown = buildWorkBreakdown(documents, recordings, timeline);

      const ctx: ClientCarePromptContext = {
        firmName,
        lawyerName,
        clientName: caseData.clientName,
        caseType: caseData.caseType,
        caseDesc: caseData.description,
        timelineSummary: buildTimelineSummary(timeline),
        documentsSummary: buildDocumentsSummary(documents),
        workBreakdown,
      };

      // 상담 후 단계면 최신 녹음의 대화록 포함
      if (stage === "post_consult" && recordings.length > 0) {
        const latestRec = recordings[0];
        if (latestRec.transcript) {
          ctx.transcript = latestRec.transcript.slice(0, 3000);
        }
      }

      let prompt: string;
      switch (stage) {
        case "post_consult":
          prompt = buildPostConsultPrompt(ctx);
          break;
        case "progress_update":
          prompt = buildProgressUpdatePrompt(ctx);
          break;
        case "doc_delivery":
          prompt = buildDocDeliveryPrompt(ctx);
          break;
        case "case_closure":
          prompt = buildCaseClosurePrompt(ctx);
          break;
      }

      const content = await callClaude(
        prompt,
        `${STAGE_LABELS[stage]} 카카오톡 메시지를 작성해 주세요.`,
      );

      // Firestore에 저장
      const id = await createClientCareMessage({
        caseId: caseData.id,
        ownerId,
        stage,
        content,
        metadata: { workBreakdown },
      });

      const newMsg: ClientCareMessage = {
        id,
        caseId: caseData.id,
        ownerId,
        stage,
        content,
        metadata: { workBreakdown },
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as ClientCareMessage["createdAt"],
      };
      setMessages((prev) => [newMsg, ...prev]);

      // 타임라인에 기록
      await addTimelineEvent(caseData.id, {
        type: "client_care",
        label: STAGE_LABELS[stage],
        detail: `의뢰인 케어 메시지 생성 (${STAGE_LABELS[stage]})`,
      });
    } catch (err) {
      console.error(`의뢰인 케어 메시지 생성 실패 (${stage}):`, err);
      throw err;
    } finally {
      setGeneratingStage(null);
    }
  }, [caseData, documents, recordings, ownerId, firmName, lawyerName, generatingStage]);

  // 메시지 삭제
  const removeMessage = useCallback(async (messageId: string) => {
    if (!caseData) return;
    try {
      await deleteClientCareMessage(caseData.id, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      console.error("의뢰인 케어 메시지 삭제 실패:", err);
      throw err;
    }
  }, [caseData]);

  return {
    messages,
    loading,
    generatingStage,
    generateMessage,
    removeMessage,
    stageLabels: STAGE_LABELS,
  };
}
