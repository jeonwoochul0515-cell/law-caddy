import type { Env } from "./_shared/types";
import { requireUsageQuota } from "./_shared/plan";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
/** 비스트리밍 상한 — 이 이상은 응답 대기 중 연결이 끊길 수 있다 */
const MAX_TOKENS = 16384;
/**
 * 스트리밍 상한.
 *
 * max_tokens는 생각(thinking) 토큰과 본문을 **함께** 덮는다. Sonnet 5는 thinking을
 * 지정하지 않으면 effort=high로 생각이 켜지므로, 16384로는 긴 서면에서 본문이 잘린다.
 * 스트리밍은 연결이 계속 살아있어 상한을 올려도 안전하다.
 */
const MAX_TOKENS_STREAM = 32000;
const API_VERSION = "2023-06-01";
const ANTHROPIC_BETA = "context-1m-2025-08-07";

/** 텍스트 또는 Vision(이미지+텍스트) content를 지원하는 메시지 타입 */
interface ChatMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

interface ClaudeRequest {
  systemPrompt: string;
  userMessage?: string;
  messages?: ChatMessage[];
  /** Phase 2 Prompt Caching: 에이전트가 공유하는 큰 공통 prefix (선택). */
  sharedPrefix?: string;
  /** true면 SSE 스트리밍으로 응답한다 (긴 문서 생성 시 연결 끊김 방지). */
  stream?: boolean;
  /** 생각 깊이. 미지정 시 모델 기본값(high). 분류·요약 같은 기계적 호출은 low로 내린다. */
  effort?: string;
}

/** 허용된 effort 값 — 클라이언트가 보낸 값을 그대로 Anthropic에 넘기지 않는다 */
const VALID_EFFORT = ["low", "medium", "high", "xhigh", "max"];

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const apiKey = context.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "Anthropic API 키가 설정되지 않았습니다." },
        { status: 503 },
      );
    }

    // 사용량 확인 — 무료 플랜도 한도 안에서는 쓸 수 있고, 초과분만 막는다
    const uid = (context.data as Record<string, unknown>).uid as string | undefined;
    const denied = await requireUsageQuota(context.env, uid);
    if (denied) return denied;

    const body = (await context.request.json()) as ClaudeRequest;

    if (!body.systemPrompt || (!body.userMessage && !body.messages)) {
      return Response.json(
        { error: "systemPrompt와 userMessage 또는 messages가 필요합니다." },
        { status: 400 },
      );
    }

    const messages: ChatMessage[] = body.messages ?? [
      { role: "user", content: body.userMessage! },
    ];

    // Phase 2 Prompt Caching:
    //  - sharedPrefix 있으면: [공통 prefix(캐시), persona(캐시 안 함)] 두 블록 → 에이전트 간 prefix 공유로 ~90% 할인
    //  - sharedPrefix 없으면: 단일 system 블록 (Phase 1 폴백, 기존 동작)
    const systemBlocks = body.sharedPrefix
      ? [
          {
            type: "text",
            text: body.sharedPrefix,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: body.systemPrompt,
          },
        ]
      : [
          {
            type: "text",
            text: body.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ];

    const wantsStream = body.stream === true;

    // 원본 요청의 컨텍스트를 완전히 격리한 새 Request 생성
    const anthropicRequest = new Request(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-beta": ANTHROPIC_BETA,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: wantsStream ? MAX_TOKENS_STREAM : MAX_TOKENS,
        system: systemBlocks,
        messages,
        ...(wantsStream ? { stream: true } : {}),
        ...(body.effort && VALID_EFFORT.includes(body.effort)
          ? { output_config: { effort: body.effort } }
          : {}),
      }),
    });

    const response = await fetch(anthropicRequest);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = JSON.parse(errorText) as {
          error?: { type?: string; message?: string };
        };
        errorMessage = errorBody?.error?.message ?? errorMessage;
      } catch { /* non-JSON */ }
      return Response.json(
        {
          error: "Claude API 호출 실패",
          detail: errorMessage,
          status: response.status,
          apiKeyPrefix: apiKey.slice(0, 12) + "...",
        },
        { status: response.status },
      );
    }

    // 스트리밍: SSE 본문을 그대로 흘려보낸다.
    // Workers는 response.body를 버퍼링 없이 통과시키므로 연결이 계속 살아있다.
    if (wantsStream) {
      return new Response(response.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      {
        error: "Claude API 프록시 오류",
        detail:
          error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
