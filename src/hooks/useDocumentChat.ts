// 문서 AI 채팅 훅
// 생성된 법률 문서에 대해 질문, 수정 요청, 법률 근거 검색
// 수정안은 채팅에 표시하지 않고 왼쪽 문서 패널에 자동 적용

import { useState, useCallback, useRef } from "react";
import { callClaudeChat, type ChatMessage } from "../services/claude";
import { buildDocumentChatPrompt } from "../services/prompts";
import type { DocType } from "../types/document";

/** 채팅 메시지 (UI용) */
export interface DocChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 수정안이 문서에 자동 적용되었는지 여부 */
  editApplied?: boolean;
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
 * @param onDocumentUpdate - 문서 수정안 자동 적용 콜백
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
  // 자동 리뷰 진행 중 플래그 (무한 루프 방지)
  const isAutoReviewingRef = useRef(false);

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
          content: m.content,
        }));

        const response = await callClaudeChat(systemPrompt, apiMessages);
        const { displayContent, suggestedEdit } = parseSuggestedEdit(response);

        // 수정안이 있으면 왼쪽 문서 패널에 자동 적용
        let editApplied = false;
        if (suggestedEdit && onDocumentUpdateRef.current) {
          onDocumentUpdateRef.current(suggestedEdit);
          editApplied = true;
        }

        const assistantMsg: DocChatMessage = {
          id: `msg-${++messageCounter}`,
          role: "assistant",
          content: editApplied
            ? `${displayContent}\n\n✅ 수정안이 문서에 적용되었습니다.`
            : displayContent,
          editApplied,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // 수정안이 적용된 경우, 자동으로 후속 리뷰 실행
        if (editApplied && !isAutoReviewingRef.current) {
          isAutoReviewingRef.current = true;
          // 약간의 딜레이 후 자동 리뷰 (문서 상태 업데이트 대기)
          setTimeout(() => {
            isAutoReviewingRef.current = false;
            // sendFollowUpReview는 아래에서 별도 호출
          }, 500);
        }
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

  /** 수정 적용 후 자동 후속 리뷰 */
  const sendFollowUpReview = useCallback(
    async () => {
      if (isLoading) return;
      isAutoReviewingRef.current = true;

      const reviewMsg: DocChatMessage = {
        id: `msg-${++messageCounter}`,
        role: "user",
        content: "[자동 검토 요청]",
      };
      setMessages((prev) => [...prev, reviewMsg]);
      setIsLoading(true);

      try {
        const systemPrompt = buildDocumentChatPrompt(docType, documentRef.current);
        const allMessages: DocChatMessage[] = [...messages, reviewMsg];
        const apiMessages: ChatMessage[] = allMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await callClaudeChat(systemPrompt, apiMessages);
        const { displayContent } = parseSuggestedEdit(response);

        const assistantMsg: DocChatMessage = {
          id: `msg-${++messageCounter}`,
          role: "assistant",
          content: displayContent,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        // 자동 리뷰 실패는 무시
      } finally {
        setIsLoading(false);
        isAutoReviewingRef.current = false;
      }
    },
    [docType, messages, isLoading],
  );

  /** 문서 생성 완료 시 자동 검토 */
  const startAutoReview = useCallback(() => {
    if (messages.length > 0 || isLoading) return;
    sendMessage(
      "이 문서 초안을 검토해 주세요. 다음 형식으로 답변해 주세요:\n" +
      "1. 전체적인 완성도 한줄 평가\n" +
      "2. 수정이 필요한 부분 3가지 (구체적으로 어디를, 왜, 어떻게)\n" +
      "3. 각 수정 제안에 대해 \"수정해 주세요\"라고 말하면 바로 적용할 수 있도록 구체적으로 제시\n" +
      "간결하게 핵심만 답변하세요.",
    );
  }, [messages.length, isLoading, sendMessage]);

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isLoading, sendMessage, sendFollowUpReview, startAutoReview, clearHistory };
}
