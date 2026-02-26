// Anthropic Claude API 서비스
// claude-sonnet-4-20250514 모델을 사용하여 법률 AI 에이전트 처리

/** Claude API 응답 content 블록 타입 */
interface ContentBlock {
  type: "text";
  text: string;
}

/** Claude API 응답 타입 */
interface ClaudeApiResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence";
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/** Claude API 에러 응답 타입 */
interface ClaudeApiError {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const API_VERSION = "2023-06-01";

/**
 * Anthropic Claude API를 호출하여 응답을 받습니다.
 *
 * @param systemPrompt - 시스템 프롬프트 (에이전트 역할 정의)
 * @param userMessage - 사용자 메시지 (사건 정보 등)
 * @returns AI 응답 텍스트
 * @throws API 호출 실패 시 에러
 */
export async function callClaude(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

  if (!apiKey || typeof apiKey !== "string") {
    throw new Error(
      "Anthropic API 키가 설정되지 않았습니다. VITE_ANTHROPIC_API_KEY 환경변수를 확인하세요."
    );
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = (await response.json()) as ClaudeApiError;
      const errorMessage =
        errorBody?.error?.message ?? `HTTP ${response.status} ${response.statusText}`;
      throw new Error(`Claude API 호출 실패: ${errorMessage}`);
    }

    const data = (await response.json()) as ClaudeApiResponse;

    if (!data.content || data.content.length === 0) {
      throw new Error("Claude API에서 빈 응답을 반환했습니다.");
    }

    // 텍스트 블록만 추출하여 합침
    const textContent = data.content
      .filter((block): block is ContentBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    if (!textContent) {
      throw new Error("Claude API 응답에 텍스트가 포함되지 않았습니다.");
    }

    return textContent;
  } catch (error: unknown) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(
        "Claude API에 연결할 수 없습니다. 네트워크 연결을 확인하세요."
      );
    }
    // 이미 처리된 에러는 그대로 전파
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Claude API 호출 중 알 수 없는 오류가 발생했습니다.");
  }
}
