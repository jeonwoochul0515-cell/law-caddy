import { describe, it, expect } from 'vitest';
import { extractText } from '../../services/claude';
import type { ClaudeApiResponse } from '../../services/claude';

function makeResponse(content: ClaudeApiResponse['content']): ClaudeApiResponse {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content,
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

describe('extractText', () => {
  it('extracts text from a single text block', () => {
    const response = makeResponse([{ type: 'text', text: '안녕하세요' }]);
    expect(extractText(response)).toBe('안녕하세요');
  });

  it('joins multiple text blocks with newline', () => {
    const response = makeResponse([
      { type: 'text', text: '첫 번째 문단' },
      { type: 'text', text: '두 번째 문단' },
    ]);
    expect(extractText(response)).toBe('첫 번째 문단\n두 번째 문단');
  });

  it('throws error when content array is empty', () => {
    const response = makeResponse([]);
    expect(() => extractText(response)).toThrow('빈 응답');
  });

  it('throws error when content is undefined', () => {
    const response = makeResponse(undefined as unknown as ClaudeApiResponse['content']);
    expect(() => extractText(response)).toThrow('빈 응답');
  });
});
