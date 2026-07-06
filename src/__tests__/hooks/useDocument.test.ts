import { describe, it, expect } from 'vitest';
import { parseCheckQuestionsResponse } from '../../hooks/useDocument';

describe('parseCheckQuestionsResponse', () => {
  it('parses a valid JSON array of checkpoint questions', () => {
    const response = JSON.stringify([
      { id: 1, question: '계약서가 있나요?', why: '증거 확보', category: '증거확보' },
      { id: 2, question: '금액은 얼마인가요?', why: '청구금액 산정', category: '사실관계' },
    ]);
    const result = parseCheckQuestionsResponse(response);
    expect(result).toHaveLength(2);
    expect(result[0].question).toBe('계약서가 있나요?');
    expect(result[1].category).toBe('사실관계');
  });

  it('parses JSON wrapped in markdown code blocks', () => {
    const response = '```json\n[{"id":1,"question":"증거가 있나요?","why":"필요","category":"증거확보"}]\n```';
    const result = parseCheckQuestionsResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe('증거가 있나요?');
  });

  it('extracts JSON array even with surrounding text', () => {
    const response = '아래는 체크포인트 질문입니다:\n[{"id":1,"question":"질문","why":"이유","category":"법리검토"}]\n이상입니다.';
    const result = parseCheckQuestionsResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('법리검토');
  });

  it('returns an empty array when no JSON array is found', () => {
    // throw 대신 빈 배열 폴백 — 파싱 실패가 문서 생성 플로우 전체를 막지 않도록 완화됨
    expect(parseCheckQuestionsResponse('이것은 JSON이 아닙니다.')).toEqual([]);
  });

  it('assigns sequential IDs when id field is missing', () => {
    const response = JSON.stringify([
      { question: '질문1', why: '이유1', category: '전략수립' },
      { question: '질문2', why: '이유2', category: '절차확인' },
    ]);
    const result = parseCheckQuestionsResponse(response);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });
});
