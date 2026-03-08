import { describe, it, expect } from 'vitest';
import { buildPrompt, buildClientMessagePrompt } from '../../services/prompts';
import type { AgentContext, ClientMessageContext } from '../../services/prompts';

const baseContext: AgentContext = {
  clientName: '홍길동',
  caseType: '민사',
  caseDesc: '임대차 보증금 반환 청구 사건',
  docType: '소장',
  transcript: '[00:00] 변호사: 상담 시작합니다.',
};

describe('buildPrompt', () => {
  it('includes client name and case description for precedent agent', () => {
    const prompt = buildPrompt('precedent', baseContext);
    expect(prompt).toContain('홍길동');
    expect(prompt).toContain('임대차 보증금 반환 청구 사건');
    expect(prompt).toContain('판례');
  });

  it('includes case type and doc type in analysis agent prompt', () => {
    const prompt = buildPrompt('analysis', baseContext);
    expect(prompt).toContain('민사');
    expect(prompt).toContain('소장');
    expect(prompt).toContain('쟁점');
  });

  it('returns empty string for stt agent (handled by RTZR)', () => {
    const prompt = buildPrompt('stt', baseContext);
    expect(prompt).toBe('');
  });

  it('includes anti-hallucination rules in legal agent prompt', () => {
    const prompt = buildPrompt('legal', baseContext);
    expect(prompt).toContain('필수 준수 사항');
    expect(prompt).toContain('통신비밀보호법');
  });

  it('includes transcript in docgen_questions prompt when provided', () => {
    const prompt = buildPrompt('docgen_questions', baseContext);
    expect(prompt).toContain('[실제 STT 대화록]');
    expect(prompt).toContain('JSON');
  });
});

describe('buildClientMessagePrompt', () => {
  it('includes firm name, lawyer name, and doc type', () => {
    const ctx: ClientMessageContext = {
      firmName: '법무법인 테스트',
      lawyerName: '김변호사',
      docType: '내용증명',
      caseDesc: '매매대금 미지급 사건',
    };
    const prompt = buildClientMessagePrompt(ctx);
    expect(prompt).toContain('법무법인 테스트');
    expect(prompt).toContain('김변호사');
    expect(prompt).toContain('내용증명');
    expect(prompt).toContain('매매대금 미지급 사건');
  });
});
