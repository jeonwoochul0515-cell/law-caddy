// 문서 AI 채팅 훅
// 법무의 제안을 개별 파싱하여 선택 적용 가능
// 선택 적용은 "현재 → 수정안" 구간만 바꾸고, 그게 안 될 때만 AI에게 전체를 맡긴다
// 적용 후 자동 재검토는 켜고 끌 수 있다

import { useState, useCallback, useRef } from "react";
import { callClaudeChat, type ChatMessage } from "../services/claude";
import { buildDocumentChatPrompt } from "../services/prompts";
import { extractAllPdfTexts } from "../services/pdf";
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
  /** AI가 보낸 전체 수정안인데 자동 적용을 보류한 것 (본문이 크게 짧아지는 등) — 변호사가 직접 적용 */
  pendingEdit?: string;
  /** 보류 사유 (화면 안내용) */
  pendingReason?: string;
}

/** useDocumentChat 옵션 */
export interface UseDocumentChatOptions {
  /** 제안 적용 뒤 자동으로 다시 검토를 요청할지 (기본 true) */
  autoReReview?: boolean;
}

/** useDocumentChat 반환 타입 */
interface UseDocumentChatReturn {
  messages: DocChatMessage[];
  isLoading: boolean;
  sendMessage: (text: string, files?: File[]) => Promise<void>;
  /** 선택된 제안들을 적용 요청 */
  applySuggestions: (suggestionIds: number[]) => Promise<void>;
  /** 보류된 전체 수정안을 변호사가 확인하고 적용 */
  applyPendingEdit: (messageId: string) => void;
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
export function parseSuggestions(content: string): Suggestion[] {
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

/** 인용부호·공백 차이를 눌러 "현재:" 인용문을 본문에서 찾기 쉽게 정규화 */
function normalizeQuote(text: string): string {
  return text
    .replace(/^["'“”‘’「」]+|["'“”‘’「」]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 제안의 "현재" 구간만 "수정안"으로 바꾼다 — 문서 전체를 AI에게 다시 쓰게 하지 않는다.
 * 모든 제안이 본문에서 정확히 한 번 발견될 때만 적용하고, 하나라도 못 찾으면 null을 돌려준다
 * (그 경우 호출부가 AI 경로로 넘긴다).
 */
export function applySuggestionsLocally(
  document: string,
  suggestions: Suggestion[],
): string | null {
  if (suggestions.length === 0) return null;
  let next = document;
  for (const s of suggestions) {
    const current = normalizeQuote(s.current);
    const revised = s.revised.trim();
    if (!current || !revised) return null;

    // 1차: 원문 그대로 / 2차: 공백을 유연하게 맞춘 정규식
    let idx = next.indexOf(current);
    let matchLen = current.length;
    if (idx === -1) {
      const escaped = current
        .split(" ")
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s+");
      const re = new RegExp(escaped);
      const m = re.exec(next);
      if (!m) return null;
      idx = m.index;
      matchLen = m[0].length;
    }
    // 같은 문장이 두 번 이상 있으면 어디를 바꿀지 알 수 없다 → AI 경로
    if (next.indexOf(current, idx + 1) !== -1) return null;

    next = next.slice(0, idx) + revised + next.slice(idx + matchLen);
  }
  return next;
}

/** AI 전체 수정안이 본문을 지나치게 줄였는지 (문단 누락 방어) — 30% 넘게 짧아지면 보류 */
export function isSuspiciousShrink(before: string, after: string): boolean {
  const b = before.trim().length;
  const a = after.trim().length;
  if (b < 200) return false;
  return a < b * 0.7;
}

let messageCounter = 0;

/**
 * 문서 AI 채팅 훅
 */
export default function useDocumentChat(
  docType: DocType,
  document: string,
  onDocumentUpdate?: (newDoc: string) => void,
  options: UseDocumentChatOptions = {},
): UseDocumentChatReturn {
  const [messages, setMessages] = useState<DocChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const documentRef = useRef(document);
  documentRef.current = document;
  const onDocumentUpdateRef = useRef(onDocumentUpdate);
  onDocumentUpdateRef.current = onDocumentUpdate;
  const autoReReviewRef = useRef(options.autoReReview ?? true);
  autoReReviewRef.current = options.autoReReview ?? true;

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

  /** 전체 수정안을 안전 검사 뒤 적용. 적용했으면 true, 보류했으면 false */
  const tryApplyWholeEdit = useCallback(
    (suggestedEdit: string): { applied: boolean; reason?: string } => {
      if (!onDocumentUpdateRef.current) return { applied: false };
      if (isSuspiciousShrink(documentRef.current, suggestedEdit)) {
        return {
          applied: false,
          reason: "AI가 보낸 수정안이 지금 문서보다 30% 넘게 짧습니다. 문단이 빠졌을 수 있어 자동으로 넣지 않았습니다. 내용을 확인한 뒤 직접 적용해 주세요.",
        };
      }
      onDocumentUpdateRef.current(suggestedEdit);
      return { applied: true };
    },
    [],
  );

  /** 적용 뒤 자동 재검토 요청 (옵션이 켜져 있을 때만) */
  const requestReReview = useCallback(
    (baseMessages: DocChatMessage[]) => {
      if (!autoReReviewRef.current) return;
      setTimeout(async () => {
        const reviewMsg: DocChatMessage = {
          id: `msg-${++messageCounter}`,
          role: "user",
          content: "[자동 검토 요청]",
        };
        setMessages((prev) => [...prev, reviewMsg]);
        setIsLoading(true);

        try {
          const reviewResponse = await callChat([...baseMessages, reviewMsg]);
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
          // 자동 리뷰 실패는 조용히 넘긴다 — 본문에는 영향 없음
        } finally {
          setIsLoading(false);
        }
      }, 800);
    },
    [callChat],
  );

  const sendMessage = useCallback(
    async (text: string, files?: File[]) => {
      // 첨부 파일이 있으면 텍스트 추출하여 메시지에 포함
      let messageContent = text;
      if (files && files.length > 0) {
        const pdfFiles = files.filter((f) =>
          f.type === "application/pdf" || !!f.name?.match(/\.pdf$/i),
        );
        const nonPdfFiles = files.filter((f) =>
          f.type !== "application/pdf" && !f.name?.match(/\.pdf$/i),
        );

        const parts: string[] = [text];
        if (pdfFiles.length > 0) {
          try {
            const pdfResult = await extractAllPdfTexts(pdfFiles);
            parts.push(`\n\n[첨부 PDF 내용]\n${pdfResult.text}`);
          } catch {
            parts.push(`\n\n[첨부 PDF ${pdfFiles.length}건 — 텍스트 추출 실패]`);
          }
        }
        if (nonPdfFiles.length > 0) {
          const fileNames = nonPdfFiles.map((f) => f.name).join(", ");
          parts.push(`\n\n[기타 첨부 파일: ${fileNames}]`);
        }
        messageContent = parts.join("");
      }

      const userMsg: DocChatMessage = {
        id: `msg-${++messageCounter}`,
        role: "user",
        content: messageContent,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const allMessages: DocChatMessage[] = [...messages, userMsg];
        const response = await callChat(allMessages);
        const { displayContent, suggestedEdit } = parseSuggestedEdit(response);

        // 수정안 블록이 있으면 적용 (변호사가 직접 수정 요청한 경우) — 단, 크게 짧아지면 보류
        let editApplied = false;
        let pendingEdit: string | undefined;
        let pendingReason: string | undefined;
        if (suggestedEdit) {
          const result = tryApplyWholeEdit(suggestedEdit);
          editApplied = result.applied;
          if (!result.applied && result.reason) {
            pendingEdit = suggestedEdit;
            pendingReason = result.reason;
          }
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
          pendingEdit,
          pendingReason,
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
    [messages, callChat, tryApplyWholeEdit],
  );

  /** 선택된 제안들을 적용 → 문서 업데이트 → (옵션) 자동 재검토 */
  const applySuggestions = useCallback(
    async (suggestionIds: number[]) => {
      if (isLoading || suggestionIds.length === 0) return;

      // 최근 제안 메시지에서 선택된 제안 객체를 찾는다
      const lastWithSuggestions = [...messages].reverse().find((m) => m.suggestions && m.suggestions.length > 0);
      const selected = (lastWithSuggestions?.suggestions ?? []).filter((s) => suggestionIds.includes(s.id));

      const requestText = suggestionIds.length === 1
        ? `제안${suggestionIds[0]}을 적용해 주세요.`
        : `제안${suggestionIds.join(", 제안")}을 적용해 주세요.`;

      const userMsg: DocChatMessage = {
        id: `msg-${++messageCounter}`,
        role: "user",
        content: requestText,
      };

      // 1) 구간 교체 — "현재" 인용문을 찾아 그 자리만 "수정안"으로 바꾼다 (AI 호출 없음)
      const local = selected.length === suggestionIds.length
        ? applySuggestionsLocally(documentRef.current, selected)
        : null;
      if (local !== null && onDocumentUpdateRef.current) {
        onDocumentUpdateRef.current(local);
        const assistantMsg: DocChatMessage = {
          id: `msg-${++messageCounter}`,
          role: "assistant",
          content: `선택한 제안 ${selected.length}건의 해당 구간만 바꿨습니다. 나머지 본문은 그대로입니다.\n\n✅ 선택한 제안이 문서에 적용되었습니다.`,
          editApplied: true,
        };
        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        requestReReview([...messages, userMsg, assistantMsg]);
        return;
      }

      // 2) 구간을 못 찾으면 AI에게 전체 수정안을 요청 (기존 경로)
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const allMessages: DocChatMessage[] = [...messages, userMsg];
        const response = await callChat(allMessages);
        const { displayContent, suggestedEdit } = parseSuggestedEdit(response);

        let editApplied = false;
        let pendingEdit: string | undefined;
        let pendingReason: string | undefined;
        if (suggestedEdit) {
          const result = tryApplyWholeEdit(suggestedEdit);
          editApplied = result.applied;
          if (!result.applied && result.reason) {
            pendingEdit = suggestedEdit;
            pendingReason = result.reason;
          }
        }

        const assistantMsg: DocChatMessage = {
          id: `msg-${++messageCounter}`,
          role: "assistant",
          content: editApplied
            ? `${displayContent}\n\n✅ 선택한 제안이 문서에 적용되었습니다.`
            : displayContent,
          editApplied,
          pendingEdit,
          pendingReason,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setIsLoading(false);

        if (editApplied) {
          requestReReview([...allMessages, assistantMsg]);
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
    [messages, isLoading, callChat, tryApplyWholeEdit, requestReReview],
  );

  /** 보류된 전체 수정안을 변호사가 확인 후 적용 */
  const applyPendingEdit = useCallback((messageId: string) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target?.pendingEdit || !onDocumentUpdateRef.current) return;
    onDocumentUpdateRef.current(target.pendingEdit);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, editApplied: true, pendingEdit: undefined, pendingReason: undefined }
          : m,
      ),
    );
  }, [messages]);

  /** 문서 생성 완료 시 자동 검토 */
  const startAutoReview = useCallback(() => {
    if (messages.length > 0 || isLoading) return;
    sendMessage(
      "이 문서 초안을 검토해 주세요. [제안N] 형식으로 수정이 필요한 부분을 1~3가지 제시해 주세요. 각 제안은 독립적으로 적용 가능해야 합니다.",
    );
  }, [messages.length, isLoading, sendMessage]);

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isLoading, sendMessage, applySuggestions, applyPendingEdit, startAutoReview, clearHistory };
}
