// Claude SSE 스트림 파서 테스트
//
// 실제 API 호출 없이 파싱 로직만 검증한다.
// 특히 "이벤트가 청크 경계에서 잘리는 경우"가 실전에서 깨지는 지점이라 반드시 덮는다.

import { describe, it, expect, vi } from 'vitest';
import { readClaudeStream } from '../../services/claude';

/** 문자열 조각들을 순서대로 흘려보내는 Response를 만든다. */
function streamOf(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

/** SSE 한 이벤트를 만든다 (data: ... 뒤에 빈 줄) */
function sse(obj: unknown): string {
  return `event: x\ndata: ${JSON.stringify(obj)}\n\n`;
}

const MESSAGE_START = {
  type: 'message_start',
  message: {
    usage: {
      input_tokens: 1200,
      cache_creation_input_tokens: 300,
      cache_read_input_tokens: 900,
    },
  },
};

const textDelta = (text: string) => ({
  type: 'content_block_delta',
  delta: { type: 'text_delta', text },
});

const messageDelta = (stopReason: string, outputTokens: number) => ({
  type: 'message_delta',
  delta: { stop_reason: stopReason },
  usage: { output_tokens: outputTokens },
});

describe('readClaudeStream', () => {
  it('텍스트 델타를 순서대로 누적한다', async () => {
    const response = streamOf([
      sse(MESSAGE_START),
      sse(textDelta('소장')),
      sse(textDelta('을 작성')),
      sse(textDelta('합니다.')),
      sse(messageDelta('end_turn', 42)),
    ]);

    const result = await readClaudeStream(response);
    expect(result.text).toBe('소장을 작성합니다.');
    expect(result.stopReason).toBe('end_turn');
  });

  it('message_start와 message_delta에서 사용량을 뽑는다', async () => {
    const response = streamOf([
      sse(MESSAGE_START),
      sse(textDelta('본문')),
      sse(messageDelta('end_turn', 777)),
    ]);

    const result = await readClaudeStream(response);
    expect(result.usage.input_tokens).toBe(1200);
    expect(result.usage.cache_creation_input_tokens).toBe(300);
    expect(result.usage.cache_read_input_tokens).toBe(900);
    expect(result.usage.output_tokens).toBe(777);
  });

  it('여러 이벤트가 한 청크에 뭉쳐 와도 모두 처리한다', async () => {
    const response = streamOf([
      sse(MESSAGE_START) + sse(textDelta('가')) + sse(textDelta('나')) + sse(textDelta('다')),
      sse(messageDelta('end_turn', 3)),
    ]);

    const result = await readClaudeStream(response);
    expect(result.text).toBe('가나다');
  });

  it('이벤트가 청크 경계에서 잘려 와도 복원한다', async () => {
    // 실제 네트워크에서 가장 흔한 형태 — JSON 한가운데가 끊긴다
    const full = sse(textDelta('잘린 조각도 이어붙여야 한다'));
    const cut = Math.floor(full.length / 2);

    const response = streamOf([
      sse(MESSAGE_START),
      full.slice(0, cut),
      full.slice(cut),
      sse(messageDelta('end_turn', 10)),
    ]);

    const result = await readClaudeStream(response);
    expect(result.text).toBe('잘린 조각도 이어붙여야 한다');
  });

  it('max_tokens로 끝나면 stop_reason에 그대로 담긴다', async () => {
    const response = streamOf([
      sse(MESSAGE_START),
      sse(textDelta('여기서 잘림')),
      sse(messageDelta('max_tokens', 32000)),
    ]);

    const result = await readClaudeStream(response);
    expect(result.stopReason).toBe('max_tokens');
    expect(result.text).toBe('여기서 잘림');
  });

  it('onDelta 콜백으로 진행 중 텍스트를 흘려준다', async () => {
    const seen: string[] = [];
    const response = streamOf([
      sse(MESSAGE_START),
      sse(textDelta('첫')),
      sse(textDelta('둘')),
      sse(messageDelta('end_turn', 2)),
    ]);

    await readClaudeStream(response, (chunk) => seen.push(chunk));
    expect(seen).toEqual(['첫', '둘']);
  });

  it('error 이벤트를 만나면 예외를 던진다', async () => {
    const response = streamOf([
      sse(MESSAGE_START),
      sse({ type: 'error', error: { message: '과부하입니다' } }),
    ]);

    await expect(readClaudeStream(response)).rejects.toThrow('과부하입니다');
  });

  it('깨진 JSON은 무시하고 나머지를 계속 처리한다', async () => {
    const response = streamOf([
      sse(MESSAGE_START),
      'event: x\ndata: {깨진 JSON\n\n',
      sse(textDelta('그래도 살아남음')),
      sse(messageDelta('end_turn', 5)),
    ]);

    const result = await readClaudeStream(response);
    expect(result.text).toBe('그래도 살아남음');
  });

  it('본문이 없는 스트림은 빈 문자열을 돌려준다 (예외는 상위에서 판단)', async () => {
    const response = streamOf([sse(MESSAGE_START), sse(messageDelta('end_turn', 0))]);

    const result = await readClaudeStream(response);
    expect(result.text).toBe('');
  });

  it('body가 없는 응답은 예외를 던진다', async () => {
    const response = new Response(null);
    await expect(readClaudeStream(response)).rejects.toThrow('스트림을 열 수 없습니다');
  });
});

describe('readClaudeStream — 사용량 로그', () => {
  it('콘솔 경고 없이 정상 스트림을 처리한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = streamOf([
      sse(MESSAGE_START),
      sse(textDelta('정상')),
      sse(messageDelta('end_turn', 1)),
    ]);

    await readClaudeStream(response);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
