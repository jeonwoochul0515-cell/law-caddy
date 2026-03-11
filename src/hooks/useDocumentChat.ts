// 문서 AI 채팅 훅
// 법무의 제안을 개별 파싱하여 선택 적용 가능
// 적용 후 자동 재검토 사이클

import { useState, useCallback, useRef } from "react";
import { callClaudeChat, type ChatMessage } from "../services/claude";
import { buildDocumentChatPrompt } from "../services/prompts";
import type { DocType } from "../types/document";

/** 개별 수정 제안 */
export interface Suggestion {
  id: number;
  title: string;
  description: string;
  current: string;
  revised: string;
}

/** 채팅 메시지 (UI용) */
export interface DocChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 구조화된 수정 제안 목록 */
  suggestions?: Suggestion[];
  /** 수정안이 문서에 적용되었는지 여부 */
  editApplied?: boolean;
}

/** useDocumentChat 반환 타입 */
interface UseDocumentChatReturn {
  messages: DocChatMessage[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  /** 선택된 제안들을 적용 요청 */
  applySuggestions: (suggestionIds: number[]) => Promise<void>;
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

/** 응답에서 [제안N] 블록들을 파싱 */
function parseSuggestions(content: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  // [제안1] ~ [제안N] 패턴 매칭
  const pattern = /\[제안(\d+)\]\s*(.+?)(?:\n|$)([\s\S]*?)(?=\[제안\d+\]|$)/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const id = parseInt(match[1], 10);
    const title = match[2].trim();
    const body = match[3].trim();

    // 설명, 현재, 수정안 추출
    const descMatch = body.match(/설명:\s*([\s\S]*?)(?=현재:|수정안:|$)/);
    const currentMatch = body.match(/현재:\s*([\s\S]*?)(?=수정안:|$)/);
    const revisedMatch = body.match(/수정안:\s*([\s\S]*?)$/);

    suggestions.push({
      id,
      title,
      description: descMatch?.[1]?.trim() ?? "",
      current: currentMatch?.[1]?.trim() ?? "",
      revised: revisedMatch?.[1]?.trim() ?? "",
    });
  }

  return suggestions;
}

let messageCounter = 0;

/**
 * 문서 AI 채팅 훅
 */
export default function useDocumentChat(
  docType: DocType,
  document: string,
  onDocumentUpdate?: (newDoc: string) => void,
): UseDocumentChatReturn {
  const [messages, setMessages] = useState<DocChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const documentRef = useRef(document);
  documentRef.current = document;
  const onDocumentUpdateRef = useRef(onDocumentUpdate);
  onDocumentUpdateRef.current = onDocumentUpdate;

  /** Claude API 호출 공통 로직 */
  const callChat = useCallback(
    async (allMessages: DocChatMessage[]): Promise<string> => {
      const systemPrompt = buildDocumentChatPrompt(docType, documentRef.current);
      const apiMessages: ChatMessage[] = allMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      return callClaudeChat(systemPrompt, apiMessages);
    },
    [docType],
  );

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
        const allMessages: DocChatMessage[] = [...messages, userMsg];
        const response = await callChat(allMessages);
        const { displayContent, suggestedEdit } = parseSuggestedEdit(response);

        // 수정안 블록이 있으면 자동 적용 (변호사가 직접 수정 요청한 경우)
        let editApplied = false;
        if (suggestedEdit && onDocumentUpdateRef.current) {
          onDocumentUpdateRef.current(suggestedEdit);
          editApplied = true;
        }

        // [제안N] 구조화된 제안 파싱
        const suggestions = parseSuggestions(displayContent);

        const assistantMsg: DocChatMessage = {
          id: `msg-${++messageCounter}`,
          role: "assistant",
          content: editApplied
            ? `${displayContent}\n\n✅ 수정안이 문서에 적용되었습니다.`
            : displayContent,
          suggestions: suggestions.length > 0 ? suggestions : undefined,
          editApplied,
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
    [messages, callChat],
  );

  /** 선택된 제안들을 적용 요청 → 문서 업데이트 → 자동 재검토 */
  const applySuggestions = useCallback(
    async (suggestionIds: number[]) => {
      if (isLoading || suggestionIds.length === 0) return;

      const requestText = suggestionIds.length === 1
        ? `제안${suggestionIds[0]}을 적용해 주세요.`
        : `제안${suggestionIds.join(", 제안")}을 적용해 주세요.`;

      const userMsg: DocChatMessage = {
        id: `msg-${++messageCounter}`,
        role: "user",
        content: requestText,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const allMessages: DocChatMessage[] = [...messages, userMsg];
        const response = await callChat(allMessages);
        const { displayContent, suggestedEdit } = parseSuggestedEdit(response);

        // 수정안 적용
        let editApplied = false;
        if (suggestedEdit && onDocumentUpdateRef.current) {
          onDocumentUpdateRef.current(suggestedEdit);
          editApplied = true;
        }

        const assistantMsg: DocChatMessage = {
          id: `msg-${++messageCounter}`,
          role: "assistant",
          content: editApplied
            ? `${displayContent}\n\n✅ 선택한 제안이 문서에 적용되었습니다.`
            : displayContent,
          editApplied,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // 적용 후 자동 재검토
        if (editApplied) {
          setTimeout(async () => {
            const reviewMsg: DocChatMessage = {
              id: `msg-${++messageCounter}`,
              role: "user",
              content: "[자동 검토 요청]",
            };
            setMessages((prev) => [...prev, reviewMsg]);
            setIsLoading(true);

            try {
              const reviewMessages: DocChatMessage[] = [...allMessages, assistantMsg, reviewMsg];
              const reviewResponse = await callChat(reviewMessages);
              const { displayContent: reviewContent } = parseSuggestedEdit(reviewResponse);
              const newSuggestions = parseSuggestions(reviewContent);

              const reviewAssistantMsg: DocChatMessage = {
                id: `msg-${++messageCounter}`,
                role: "assistant",
                content: reviewContent,
                suggestions: newSuggestions.length > 0 ? newSuggestions : undefined,
              };
              setMessages((prev) => [...prev, reviewAssistantMsg]);
            } catch {
              // 자동 리뷰 실패 무시
            } finally {
              setIsLoading(false);
            }
          }, 800);
        }
      } catch {
        const errorMsg: DocChatMessage = {
          id: `msg-${++messageCounter}`,
          role: "assistant",
          content: "죄송합니다. 수정 적용 중 오류가 발생했습니다.",
        };
        setMessages((prev) => [...prev, errorMsg]);
        setIsLoading(false);
      }
    },
    [messages, isLoading, callChat],
  );

  /** 문서 생성 완료 시 자동 검토 */
  const startAutoReview = useCallback(() => {
    if (messages.length > 0 || isLoading) return;
    sendMessage(
      "이 문서 초안을 검토해 주세요. [제안N] 형식으로 수정이 필요한 부분을 3~5가지 제시해 주세요. 각 제안은 독립적으로 적용 가능해야 합니다.",
    );
  }, [messages.length, isLoading, sendMessage]);

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isLoading, sendMessage, applySuggestions, startAutoReview, clearHistory };
}
