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

/** 문서 생성 단계 */
type DocumentStatus =
  | "idle"
  | "generating_document"
  | "generating_message"
  | "completed"
  | "error";

/** Claude API 사용 가능 여부 (호출 시점에 확인) */
function hasAnthropicKey(): boolean {
  return !!import.meta.env.VITE_ANTHROPIC_API_KEY;
}

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
    throw new Error("체크포인트 질문 응답에서 JSON 배열을 찾을 수 없습니다.");
  }

  const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1);
  const parsed: unknown = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) {
    throw new Error("체크포인트 응답이 배열 형식이 아닙니다.");
  }

  // 각 항목의 구조 검증
  return parsed.map((item: unknown, index: number) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("question" in item) ||
      !("why" in item) ||
      !("category" in item)
    ) {
      throw new Error(`체크포인트 질문 ${index + 1}번의 형식이 올바르지 않습니다.`);
    }

    const obj = item as Record<string, unknown>;
    return {
      id: typeof obj.id === "number" ? obj.id : index + 1,
      question: String(obj.question),
      why: String(obj.why),
      category: String(obj.category) as CheckQuestion["category"],
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
      console.log("[useDocument] generateDocument 시작", { docType: context.docType, hasKey: hasAnthropicKey });
      setStatus("generating_document");
      setError(null);

      try {
        if (!hasAnthropicKey()) {
          throw new Error("Anthropic API 키가 설정되지 않았습니다. .env 파일을 확인하세요.");
        }

        // 체크포인트 상세 응답을 컨텍스트에 포함
        const contextWithAnswers: AgentContext = {
          ...context,
          checkQuestions: questions,
          checkpointAnswers: answers,
        };

        const prompt = buildPrompt("docgen", contextWithAnswers);
        const userMessage = `체크포인트 응답을 반영하여 "${context.docType}" 초안을 작성해 주세요.`;
        console.log("[useDocument] Claude API 호출 시작, 프롬프트 길이:", prompt.length);

        const document = await callClaude(prompt, userMessage);
        console.log("[useDocument] 문서 생성 성공, 길이:", document.length);
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
        if (!hasAnthropicKey()) {
          throw new Error("Anthropic API 키가 설정되지 않았습니다. .env 파일을 확인하세요.");
        }

        const prompt = buildClientMessagePrompt(context);
        const userMessage = "의뢰인에게 보낼 카카오톡 메시지를 작성해 주세요.";

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
