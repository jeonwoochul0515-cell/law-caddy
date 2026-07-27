import { describe, it, expect } from 'vitest';
import { buildPrompt, buildClientMessagePrompt, buildAgentCachePrefix } from '../../services/prompts';
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

  it('returns non-empty prompt for rag_precedent agent', () => {
    const prompt = buildPrompt('rag_precedent', baseContext);
    expect(prompt).toContain('판례');
  });

  it('includes anti-hallucination rules in legal agent prompt', () => {
    // 페르소나 개편(윤율무)으로 '필수 준수 사항' 섹션은 '[판례 인용 규칙]' 블록으로 대체됨
    const prompt = buildPrompt('legal', baseContext);
    expect(prompt).toContain('[판례 인용 규칙]');
    expect(prompt).toContain('시효 도과');
  });

  it('includes transcript in docgen_questions prompt when provided', () => {
    const prompt = buildPrompt('docgen_questions', baseContext);
    expect(prompt).toContain('[실제 STT 대화록]');
    expect(prompt).toContain('JSON');
  });
});

describe('buildAgentCachePrefix — 캐시 프리픽스 불변식', () => {
  // 프롬프트 캐시는 프리픽스가 바이트 단위로 같아야 걸린다.
  // 에이전트별로 달라지는 검색 필드가 프리픽스에 새어 들어가는 순간
  // 4개 호출의 프리픽스가 어긋나 캐시가 통째로 무효화된다.
  it('에이전트별 검색 필드가 달라도 프리픽스는 바이트 단위로 동일하다', () => {
    const forPrecedent: AgentContext = {
      ...baseContext,
      latestPrecedents: '대법원 2017다241819 판결 ...',
      constitutionalDecisions: '헌재 2020헌마123 ...',
      ragContext: '판례 검색 결과 A',
    };
    const forLegal: AgentContext = {
      ...baseContext,
      legalInterpretations: '법제처 해석례 ...',
      statuteResults: '민법 제750조 ...',
      ragContext: '판례 검색 결과 B (다른 테이블)',
    };
    expect(buildAgentCachePrefix(forPrecedent)).toBe(buildAgentCachePrefix(forLegal));
  });

  it('공통 자료(대화록·사건개요)는 프리픽스에 들어간다', () => {
    const prefix = buildAgentCachePrefix(baseContext);
    expect(prefix).toContain('임대차 보증금 반환 청구 사건');
    expect(prefix).toContain('[실제 STT 대화록]');
    expect(prefix).toContain('LAW-CADDY'); // 운영 규칙 포함
  });

  it('공통 자료가 바뀌면 프리픽스도 바뀐다 (다른 사건이 캐시를 공유하면 안 됨)', () => {
    const otherCase: AgentContext = { ...baseContext, caseDesc: '전혀 다른 사건' };
    expect(buildAgentCachePrefix(otherCase)).not.toBe(buildAgentCachePrefix(baseContext));
  });
});

describe('buildPrompt — omitCommonContext (캐시 분리 모드)', () => {
  it('생략 모드에서는 공통 자료가 빠지고 검색 결과만 남는다', () => {
    const ctx: AgentContext = { ...baseContext, latestPrecedents: '대법원 2017다241819' };
    const prompt = buildPrompt('precedent', ctx, { omitCommonContext: true });
    // 공통 자료는 캐시 프리픽스에 있으므로 여기 있으면 이중 전송이다
    expect(prompt).not.toContain('임대차 보증금 반환 청구 사건');
    expect(prompt).not.toContain('[실제 STT 대화록]');
    // 에이전트별 검색 결과는 남아야 한다
    expect(prompt).toContain('대법원 2017다241819');
  });

  it('기본 모드는 기존과 동일하게 모든 컨텍스트를 포함한다', () => {
    const prompt = buildPrompt('docgen_questions', baseContext);
    expect(prompt).toContain('임대차 보증금 반환 청구 사건');
    expect(prompt).toContain('[실제 STT 대화록]');
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
