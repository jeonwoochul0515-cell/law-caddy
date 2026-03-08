import { describe, it, expect } from 'vitest';
import { formatTranscript } from '../../services/rtzr';
import type { Utterance } from '../../types/recording';

describe('formatTranscript', () => {
  it('returns placeholder text for empty utterances array', () => {
    const result = formatTranscript([]);
    expect(result).toBe('[대화록 없음]');
  });

  it('formats a single utterance with default speaker labels', () => {
    const utterances: Utterance[] = [
      { startAt: 0, duration: 3000, spk: 0, msg: '안녕하세요, 어떤 사건인가요?' },
    ];
    const result = formatTranscript(utterances);
    expect(result).toBe('[00:00] 변호사: 안녕하세요, 어떤 사건인가요?');
  });

  it('formats multiple utterances with two speakers', () => {
    const utterances: Utterance[] = [
      { startAt: 0, duration: 5000, spk: 0, msg: '상담 시작합니다.' },
      { startAt: 5000, duration: 8000, spk: 1, msg: '네, 감사합니다.' },
      { startAt: 13000, duration: 4000, spk: 0, msg: '사건 개요를 말씀해 주세요.' },
    ];
    const result = formatTranscript(utterances);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('[00:00] 변호사: 상담 시작합니다.');
    expect(lines[1]).toBe('[00:05] 의뢰인: 네, 감사합니다.');
    expect(lines[2]).toBe('[00:13] 변호사: 사건 개요를 말씀해 주세요.');
  });

  it('uses custom speaker labels when provided', () => {
    const utterances: Utterance[] = [
      { startAt: 60000, duration: 3000, spk: 0, msg: '진술합니다.' },
    ];
    const customSpeakers: Record<number, string> = { 0: '증인' };
    const result = formatTranscript(utterances, customSpeakers);
    expect(result).toBe('[01:00] 증인: 진술합니다.');
  });

  it('falls back to generic speaker label for unknown speaker numbers', () => {
    const utterances: Utterance[] = [
      { startAt: 0, duration: 2000, spk: 5, msg: '저도 참석했습니다.' },
    ];
    const result = formatTranscript(utterances);
    expect(result).toContain('화자6:');
  });
});
