import { describe, it, expect } from 'vitest';
import { formatTranscript, computeMaxWaitMs, durationFromUtterances } from '../../services/rtzr';
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

// 음성 변환 대기 시간 — 90분짜리 상담이 6분 한도에 걸려 "실패"로 찍히던 일이 있었다(r1-03-06).
// 그걸 막으려고 만든 계산이라, 짧은 파일에도 충분히 기다리고 긴 파일에는 더 기다려야 한다.
describe('computeMaxWaitMs', () => {
  const 분 = 60 * 1000;

  it('길이를 모르면 10분을 기다린다', () => {
    expect(computeMaxWaitMs()).toBe(10 * 분);
    expect(computeMaxWaitMs(0)).toBe(10 * 분);
  });

  it('짧은 파일에도 최소 10분은 기다린다', () => {
    expect(computeMaxWaitMs(60)).toBe(10 * 분);
  });

  it('90분 상담은 상한인 30분까지 기다린다 — 6분이 아니다', () => {
    const ms = computeMaxWaitMs(90 * 60);
    expect(ms).toBe(30 * 분);
    expect(ms).toBeGreaterThan(6 * 분);
  });

  it('아무리 길어도 30분에서 멈춘다 — 무한정 붙잡고 있지 않는다', () => {
    expect(computeMaxWaitMs(10 * 60 * 60)).toBe(30 * 분);
  });

  it('길수록 더 기다린다', () => {
    expect(computeMaxWaitMs(40 * 60)).toBeGreaterThan(computeMaxWaitMs(20 * 60));
  });
});

describe('durationFromUtterances', () => {
  it('마지막 발화가 끝나는 시각을 초로 돌려준다', () => {
    expect(
      durationFromUtterances([
        { startAt: 0, duration: 3000, spk: 0, msg: '안녕하세요' },
        { startAt: 5000, duration: 2500, spk: 1, msg: '네' },
      ]),
    ).toBe(8);
  });

  it('발화가 없으면 0', () => {
    expect(durationFromUtterances([])).toBe(0);
  });

  it('순서가 뒤섞여 있어도 가장 늦게 끝나는 것을 본다', () => {
    expect(
      durationFromUtterances([
        { startAt: 9000, duration: 1000, spk: 0, msg: '나중' },
        { startAt: 0, duration: 2000, spk: 1, msg: '먼저' },
      ]),
    ).toBe(10);
  });
});
