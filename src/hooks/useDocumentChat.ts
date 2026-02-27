// 문서 AI 채팅 훅
// 생성된 법률 문서에 대해 질문, 수정 요청, 법률 근거 검색

import { useState, useCallback, useRef } from "react";
import { callClaudeChat, type ChatMessage } from "../services/claude";
import { buildDocumentChatPrompt } from "../services/prompts";
import { isDemoMode } from "../config/demo";
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

const useChatDemoMode =
  isDemoMode || !import.meta.env.VITE_ANTHROPIC_API_KEY;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        if (useChatDemoMode) {
          await delay(1500);
          const demoResponse: DocChatMessage = {
            id: `msg-${++messageCounter}`,
            role: "assistant",
            content: `좋은 질문입니다.\n\n이 "${docType}" 문서에서 해당 부분은 관련 법조문에 근거하여 작성되었습니다. 구체적으로 살펴보면:\n\n1. **법적 근거**: 민법 관련 조항에 의거\n2. **실무 관행**: 법원 판례 동향과 일치\n3. **개선 방향**: 더 구체적인 사실관계 기재 권장\n\n추가로 궁금한 점이 있으시면 말씀해 주세요.`,
          };
          setMessages((prev) => [...prev, demoResponse]);
          return;
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
