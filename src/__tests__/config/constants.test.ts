import { describe, it, expect } from 'vitest';
import { CASE_TYPES, DOC_TYPES, AGENTS } from '../../config/constants';

describe('CASE_TYPES', () => {
  it('is a non-empty array', () => {
    expect(CASE_TYPES.length).toBeGreaterThan(0);
  });

  it('includes core case types', () => {
    expect(CASE_TYPES).toContain('민사');
    expect(CASE_TYPES).toContain('형사');
    expect(CASE_TYPES).toContain('가사');
  });
});

describe('DOC_TYPES', () => {
  it('is a non-empty array', () => {
    expect(DOC_TYPES.length).toBeGreaterThan(0);
  });

  it('includes essential document types', () => {
    expect(DOC_TYPES).toContain('소장');
    expect(DOC_TYPES).toContain('답변서');
    expect(DOC_TYPES).toContain('내용증명');
  });
});

describe('AGENTS', () => {
  it('has exactly 6 agents', () => {
    expect(AGENTS).toHaveLength(6);
  });

  it('each agent has required fields: id, name, icon, role', () => {
    for (const agent of AGENTS) {
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('icon');
      expect(agent).toHaveProperty('role');
      expect(typeof agent.id).toBe('string');
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.icon).toBe('string');
      expect(typeof agent.role).toBe('string');
    }
  });

  it('includes the precedent and docgen agents', () => {
    const ids = AGENTS.map((a) => a.id);
    expect(ids).toContain('precedent');
    expect(ids).toContain('docgen');
  });
});
