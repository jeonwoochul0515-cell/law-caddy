// 문서 AI 채팅 훅
// 생성된 법률 문서에 대해 질문, 수정 요청, 법률 근거 검색

import { useState, useCallback, useRef } from "react";
import { callClaudeChat, type ChatMessage } from "../services/claude";
import { buildDocumentChatPrompt } from "../services/prompts";
import type { DocType } from "../types/document";

/** 채팅 메시지 (UI용) */
export interface DocChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestedEdit?: string;
}

/** useDocumentChat 반환 타입 */
interface UseDocumentChatReturn {
  messages: DocChatMessage[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  /** 문서 생성 완료 시 자동 검토 시작 */
  startAutoReview: () => void;
  clearHistory: () => void;
}

/** 응답에서 수정안 블록 파싱 */
function parseSuggestedEdit(content: string): {
  displayContent: string;
  suggestedEdit?: string;
} {
  const editMatch = content.match(/===수정안===([\s\S]*?)===끝===/);
  if (!editMatch) {
    return { displayContent: content };
  }

  const suggestedEdit = editMatch[1].trim();
  const displayContent = content.replace(/===수정안===[\s\S]*?===끝===/, "").trim();
  return { displayContent, suggestedEdit };
}

let messageCounter = 0;

/**
 * 문서 AI 채팅 훅
 *
 * @param docType - 문서 유형
 * @param document - 현재 문서 내용 (수정 시 자동 반영)
 */
export default function useDocumentChat(
  docType: DocType,
  document: string,
): UseDocumentChatReturn {
  const [messages, setMessages] = useState<DocChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const documentRef = useRef(document);
  documentRef.current = document;

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: DocChatMessage = {
        id: `msg-${++messageCounter}`,
        role: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        // 시스템 프롬프트 (현재 문서 내용 반영)
        const systemPrompt = buildDocumentChatPrompt(docType, documentRef.current);

        // 전체 대화 히스토리 → API messages 변환
        const allMessages: DocChatMessage[] = [...messages, userMsg];
        const apiMessages: ChatMessage[] = allMessages.map((m) => ({
          role: m.role,
          content: m.role === "assistant" && m.suggestedEdit
            ? `${m.content}\n\n===수정안===\n${m.suggestedEdit}\n===끝===`
            : m.content,
        }));

        const response = await callClaudeChat(systemPrompt, apiMessages);
        const { displayContent, suggestedEdit } = parseSuggestedEdit(response);

        const assistantMsg: DocChatMessage = {
          id: `msg-${++messageCounter}`,
          role: "assistant",
          content: displayContent,
          suggestedEdit,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        const errorMsg: DocChatMessage = {
          id: `msg-${++messageCounter}`,
          role: "assistant",
          content: "죄송합니다. 응답 생성 중 오류가 발생했습니다. 다시 시도해 주세요.",
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [docType, messages],
  );

  /** 문서 생성 완료 시 자동 검토 */
  const startAutoReview = useCallback(() => {
    if (messages.length > 0 || isLoading) return;
    sendMessage(
      "이 문서 초안을 검토해 주세요. 다음 형식으로 답변해 주세요:\n" +
      "1. 전체적인 완성도 한줄 평가\n" +
      "2. 수정이 필요한 부분 2~3가지 (구체적으로 어디를, 왜, 어떻게)\n" +
      "3. 보강하면 좋을 점 1~2가지\n" +
      "간결하게 핵심만 답변하세요.",
    );
  }, [messages.length, isLoading, sendMessage]);

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isLoading, sendMessage, startAutoReview, clearHistory };
}
