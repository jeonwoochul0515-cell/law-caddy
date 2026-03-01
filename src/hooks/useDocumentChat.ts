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
  clearHistory: () => void;
}

function hasAnthropicKey(): boolean {
  return !!import.meta.env.VITE_ANTHROPIC_API_KEY;
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
        if (!hasAnthropicKey()) {
          throw new Error("Anthropic API 키가 설정되지 않았습니다.");
        }

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

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isLoading, sendMessage, clearHistory };
}
