// 에이전트 분석 결과 캐시 — 키 생성과 복원 가능 판정
//
// (2026-09-19) 캐시가 구조적으로 절대 복원되지 않고 있었다.
// 복원할 때는 의뢰인 이름을 키로 넘기고, 저장할 때는 아무것도 안 넘겨
// 저장된 키가 항상 undefined였다. 분석 화면에 다시 들어올 때마다 AI 넷이
// 처음부터 다시 돌았고, 그때마다 요금이 다시 나가고 월 한도를 더 먹었다.
//
// 저장하는 쪽(useAgents)과 복원하는 쪽(AgentsPage)이 같은 규칙을 쓰도록
// 키 생성을 여기 한 곳에 둔다. 한쪽만 고치면 다시 어긋난다.

import type { AgentState, CaseType } from "../types/agent";

/** 캐시가 유효한 기간 — 이보다 오래된 결과는 버린다 */
export const AGENT_CACHE_TTL_MS = 30 * 60 * 1000;

/** sessionStorage 키 */
export const AGENTS_CACHE_STORAGE_KEY = "law-caddy-agents-results";

/** 캐시 키를 만들 때 보는 입력들 */
export interface AgentCacheKeyInput {
  /** 사건 문서 ID (새 상담이면 빈 문자열) */
  caseId?: string;
  clientName: string;
  caseDesc: string;
  typedNotes?: string;
  /** 이전 상담 전사문 — 전문 대신 길이만 본다(키가 지나치게 길어지지 않게) */
  previousTranscripts?: string;
  /** 첨부 파일 목록 */
  files?: Array<{ name: string; size: number }>;
}

/**
 * 분석 결과 캐시 키.
 *
 * 의뢰인 이름만 쓰면 같은 이름의 다른 사람이나 새로 적은 메모를 무시한다(r2-05-04).
 * 사건·개요·메모·첨부를 모두 섞어, 입력이 하나라도 바뀌면 다른 키가 되게 한다.
 * 파일은 이름과 크기로만 식별한다 — 내용을 읽으면 캐시 판정이 분석만큼 비싸진다.
 */
export function buildAgentCacheKey(input: AgentCacheKeyInput): string {
  const fileSig = (input.files ?? [])
    .map((f) => `${f.name}:${f.size}`)
    .sort()
    .join(",");
  return JSON.stringify([
    input.caseId ?? "",
    input.clientName,
    input.caseDesc,
    input.typedNotes ?? "",
    input.previousTranscripts?.length ?? 0,
    fileSig,
  ]);
}

/** sessionStorage에 담기는 캐시 한 벌 */
export interface AgentsCacheData {
  agents: Record<string, AgentState>;
  classifiedCaseType: CaseType | null;
  clientName: string;
  cacheKey?: string;
  caseRefs?: unknown[];
  searchInfo?: unknown;
  timestamp: number;
}

/**
 * 이 캐시를 복원해도 되는지.
 *
 * 돌아가는 중인 결과(running·pending)는 복원하지 않는다. 화면이 "분석 중"에서
 * 영원히 멈춘 것처럼 보이기 때문이다. 실패(error)는 복원한다 — 재시도 버튼으로
 * 그 하나만 다시 돌릴 수 있다.
 */
export function canRestoreAgentCache(
  data: AgentsCacheData | null,
  expectedKey: string,
  now: number = Date.now(),
): boolean {
  if (!data) return false;
  if (!data.cacheKey || data.cacheKey !== expectedKey) return false;
  if (now - data.timestamp > AGENT_CACHE_TTL_MS) return false;
  const states = Object.values(data.agents ?? {});
  if (states.length === 0) return false;
  return states.every((a) => a.status === "completed" || a.status === "error");
}
