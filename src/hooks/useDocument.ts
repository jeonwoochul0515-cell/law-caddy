// 문서 생성 워크플로우 훅
// 체크포인트 질문 생성 → 변호사 응답 → 최종 문서 생성 → 의뢰인 메시지

import { useState, useCallback } from "react";
import { callClaude } from "../services/claude";
import {
  buildPrompt,
  buildClientMessagePrompt,
  type AgentContext,
  type ClientMessageContext,
} from "../services/prompts";
import type { CheckQuestion, CheckpointAnswer } from "../types/document";
import { calculateClaim, type FactMasterAmount } from "../services/claim-calculator";
import { postProcessDocument } from "../services/post-processor";
import { findRelevantTextbooks, formatTextbooksForPrompt } from "../config/textbook-citations";
import { createEvidenceRegistry, formatEvidenceForPrompt } from "../services/evidence-registry";

/** 문서 생성 단계 */
type DocumentStatus =
  | "idle"
  | "generating_document"
  | "generating_message"
  | "completed"
  | "error";


/** useDocument 반환 타입 */
interface UseDocumentReturn {
  /** 최종 생성된 문서 */
  finalDocument: string;
  /** 의뢰인 카카오톡 메시지 */
  clientMessage: string;
  /** 현재 상태 */
  status: DocumentStatus;
  /** 에러 메시지 */
  error: string | null;
  /** 최종 문서 생성 (체크포인트 상세 응답 포함) */
  generateDocument: (
    context: AgentContext,
    checkQuestions: CheckQuestion[],
    checkpointAnswers: CheckpointAnswer[],
  ) => Promise<void>;
  /** 의뢰인 카카오톡 메시지 생성 */
  generateClientMessage: (context: ClientMessageContext) => Promise<void>;
  /** 채팅에서 수정안 적용 시 문서 업데이트 */
  updateFinalDocument: (doc: string) => void;
  /** 상태 초기화 */
  reset: () => void;
}

/**
 * Claude 응답에서 JSON 배열을 파싱합니다.
 * 응답이 마크다운 코드블록으로 감싸져 있는 경우도 처리합니다.
 */
export function parseCheckQuestionsResponse(response: string): CheckQuestion[] {
  // 마크다운 코드블록 제거 (```json ... ``` 또는 ``` ... ```)
  let cleaned = response.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // JSON 배열 부분만 추출 (앞뒤 텍스트 제거)
  const jsonStart = cleaned.indexOf("[");
  const jsonEnd = cleaned.lastIndexOf("]");
  if (jsonStart === -1 || jsonEnd === -1) {
    console.warn("[parseCheckQuestions] JSON 배열을 찾을 수 없음. 응답 앞 200자:", cleaned.slice(0, 200));
    return [];
  }

  let parsed: unknown;
  try {
    const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1);
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.warn("[parseCheckQuestions] JSON 파싱 실패:", err);
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  // 유연한 구조 검증 — question 필드만 있으면 허용
  return parsed
    .filter((item: unknown) => typeof item === "object" && item !== null && "question" in item)
    .map((item: unknown, index: number) => {
      const obj = item as Record<string, unknown>;
      return {
        id: typeof obj.id === "number" ? obj.id : index + 1,
        question: String(obj.question),
        why: String(obj.why ?? obj.reason ?? ""),
        category: String(obj.category ?? "사실관계") as CheckQuestion["category"],
      hints: Array.isArray(obj.hints)
        ? obj.hints.map((h: unknown) => String(h))
        : undefined,
    };
  });
}

/**
 * 문서 생성 워크플로우 훅
 *
 * 워크플로우:
 * 1. generateCheckQuestions → 체크포인트 질문 8~15개 생성
 * 2. 변호사가 각 질문에 텍스트 + 파일 + 녹음으로 상세 응답
 * 3. generateDocument → 응답 반영하여 최종 문서 생성
 * 4. generateClientMessage → 의뢰인 카카오톡 메시지 생성
 */
export default function useDocument(): UseDocumentReturn {
  const [finalDocument, setFinalDocument] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [status, setStatus] = useState<DocumentStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  /** 최종 문서 생성 (체크포인트 상세 응답 포함) */
  const generateDocument = useCallback(
    async (
      context: AgentContext,
      questions: CheckQuestion[],
      answers: CheckpointAnswer[],
    ): Promise<void> => {
      setStatus("generating_document");
      setError(null);

      try {
        // ─── Phase 1-3 서비스 연동: 추가 컨텍스트 생성 (Claude API 0회) ───

        // 1. 청구취지 자동 계산 (FactMaster amounts가 있으면)
        let claimCalculation: string | undefined;
        try {
          const amountsMatch = context.analysisResult?.match(/"amounts"\s*:\s*\[([\s\S]*?)\]/);
          if (amountsMatch) {
            const amounts = JSON.parse(`[${amountsMatch[1]}]`) as FactMasterAmount[];
            if (amounts.length > 0) {
              const calc = calculateClaim(context.caseType ?? "", amounts, context.docType);
              claimCalculation = calc.contextText;
            }
          }
        } catch { /* FactMaster 파싱 실패 시 무시 */ }

        // 2. 증거 레지스트리 (체크포인트 첨부 파일이 있으면)
        let evidenceRegistry: string | undefined;
        try {
          const allFiles = answers
            .filter((a) => a.files && a.files.length > 0)
            .flatMap((a) => a.files ?? []);
          if (allFiles.length > 0) {
            const items = createEvidenceRegistry(
              allFiles.map((f) => ({ name: typeof f === "string" ? f : f.name })),
            );
            evidenceRegistry = formatEvidenceForPrompt(items);
          }
        } catch { /* 무시 */ }

        // 3. 교과서 서지정보 (쟁점 키워드가 있으면)
        let relevantTextbooks: string | undefined;
        try {
          const issueKeywords = context.identifiedIssues?.map((i) => i.issue) ?? [];
          if (issueKeywords.length > 0) {
            const books = findRelevantTextbooks(issueKeywords);
            if (books.length > 0) {
              relevantTextbooks = formatTextbooksForPrompt(books);
            }
          }
        } catch { /* 무시 */ }

        // 체크포인트 상세 응답 + 추가 컨텍스트를 포함
        const contextWithAnswers: AgentContext = {
          ...context,
          checkQuestions: questions,
          checkpointAnswers: answers,
          claimCalculation,
          evidenceRegistry,
          relevantTextbooks,
        };

        const prompt = buildPrompt("docgen", contextWithAnswers);
        const userMessage = `체크포인트 응답을 반영하여 "${context.docType}" 초안을 작성해 주세요.`;

        let document = await callClaude(prompt, userMessage);

        // ─── 후처리: 플레이스홀더 검증 (Claude API 0회) ───
        try {
          const partiesMatch = context.analysisResult?.match(/"parties"\s*:\s*\[([\s\S]*?)\]/);
          const factMaster = partiesMatch
            ? { parties: JSON.parse(`[${partiesMatch[1]}]`) }
            : undefined;
          const processed = postProcessDocument(document, factMaster);
          document = processed.document;
          if (processed.warnings.length > 0) {
            console.warn("[후처리] 잔존 플레이스홀더:", processed.warnings.length, "건");
          }
        } catch { /* 후처리 실패 시 원본 유지 */ }

        setFinalDocument(document);
        setStatus("completed");
      } catch (err: unknown) {
        console.error("[useDocument] 문서 생성 실패:", err);
        const message =
          err instanceof Error
            ? err.message
            : "문서 생성에 실패했습니다.";
        setError(message);
        setStatus("error");
      }
    },
    [],
  );

  /** 의뢰인 카카오톡 메시지 생성 */
  const generateClientMessage = useCallback(
    async (context: ClientMessageContext): Promise<void> => {
      setStatus("generating_message");
      setError(null);

      try {
        const prompt = buildClientMessagePrompt(context);
        const userMessage = context.finalDocument
          ? `작성된 "${context.docType}" 문서 내용을 참고하여, 의뢰인이 이해할 수 있는 카카오톡 메시지를 작성해 주세요.`
          : "의뢰인에게 보낼 카카오톡 메시지를 작성해 주세요.";

        const message = await callClaude(prompt, userMessage);
        setClientMessage(message);
        setStatus("completed");
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "의뢰인 메시지 생성에 실패했습니다.";
        setError(message);
        setStatus("error");
      }
    },
    [],
  );

  /** 채팅에서 수정안 적용 */
  const updateFinalDocument = useCallback((doc: string) => {
    setFinalDocument(doc);
  }, []);

  /** 상태 초기화 */
  const reset = useCallback(() => {
    setFinalDocument("");
    setClientMessage("");
    setStatus("idle");
    setError(null);
  }, []);

  return {
    finalDocument,
    clientMessage,
    status,
    error,
    generateDocument,
    generateClientMessage,
    updateFinalDocument,
    reset,
  };
}
