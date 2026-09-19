// 분석 결과 캐시 — 키 생성과 복원 판정
//
// 이 캐시가 안 되면 돈이 샌다. 분석 화면에 다시 들어올 때마다 AI 넷이 처음부터
// 다시 돌고, 그때마다 요금이 다시 나가고 월 한도를 더 먹는다. 실제로 저장할 때
// 키를 안 넣어 **구조적으로 한 번도 복원되지 않고 있었다.**
//
// 반대로 잘못 복원하면 더 나쁘다. 다른 사건의 분석 결과를 이 사건 것으로 보여
// 주게 된다. 그래서 "언제 되살리고 언제 되살리면 안 되는지"를 양쪽 다 고정한다.
import { describe, it, expect } from "vitest";
import {
  buildAgentCacheKey,
  canRestoreAgentCache,
  AGENT_CACHE_TTL_MS,
  type AgentsCacheData,
} from "../../services/agentCache";

const 기본입력 = {
  caseId: "case-1",
  clientName: "김철수",
  caseDesc: "임대차 보증금 반환 청구",
  typedNotes: "계약서 사본 있음",
  previousTranscripts: "지난 상담 내용",
  files: [{ name: "녹음.webm", size: 1024 }],
};

/** 복원 가능한 캐시 한 벌 */
function 캐시(key: string, over: Partial<AgentsCacheData> = {}): AgentsCacheData {
  return {
    agents: {
      precedent: { id: "precedent", status: "completed", result: "판례" },
      legal: { id: "legal", status: "completed", result: "적법성" },
    },
    classifiedCaseType: "민사",
    clientName: "김철수",
    cacheKey: key,
    timestamp: Date.now(),
    ...over,
  } as AgentsCacheData;
}

describe("캐시 키", () => {
  it("같은 입력이면 같은 키", () => {
    expect(buildAgentCacheKey(기본입력)).toBe(buildAgentCacheKey({ ...기본입력 }));
  });

  it("사건이 다르면 다른 키", () => {
    expect(buildAgentCacheKey({ ...기본입력, caseId: "case-2" })).not.toBe(
      buildAgentCacheKey(기본입력),
    );
  });

  it("같은 이름의 다른 사건을 섞지 않는다", () => {
    // 의뢰인 이름만 키로 쓰던 시절의 결함(r2-05-04)
    const 사건A = { ...기본입력, caseId: "case-A", caseDesc: "임대차" };
    const 사건B = { ...기본입력, caseId: "case-B", caseDesc: "대여금" };
    expect(buildAgentCacheKey(사건A)).not.toBe(buildAgentCacheKey(사건B));
  });

  it("메모를 고치면 다시 분석한다", () => {
    expect(buildAgentCacheKey({ ...기본입력, typedNotes: "다른 메모" })).not.toBe(
      buildAgentCacheKey(기본입력),
    );
  });

  it("첨부를 더하면 다시 분석한다", () => {
    const 추가 = {
      ...기본입력,
      files: [...기본입력.files, { name: "계약서.pdf", size: 2048 }],
    };
    expect(buildAgentCacheKey(추가)).not.toBe(buildAgentCacheKey(기본입력));
  });

  it("같은 파일을 다른 순서로 담아도 같은 키 — 순서는 자료가 아니다", () => {
    const a = { ...기본입력, files: [{ name: "a.pdf", size: 1 }, { name: "b.pdf", size: 2 }] };
    const b = { ...기본입력, files: [{ name: "b.pdf", size: 2 }, { name: "a.pdf", size: 1 }] };
    expect(buildAgentCacheKey(a)).toBe(buildAgentCacheKey(b));
  });

  it("같은 이름이라도 내용이 바뀌면(크기가 다르면) 다시 분석한다", () => {
    const 수정본 = { ...기본입력, files: [{ name: "녹음.webm", size: 9999 }] };
    expect(buildAgentCacheKey(수정본)).not.toBe(buildAgentCacheKey(기본입력));
  });

  it("선택 항목이 없어도 키를 만든다", () => {
    expect(buildAgentCacheKey({ clientName: "김철수", caseDesc: "상담" })).toBeTruthy();
  });
});

describe("복원 판정", () => {
  const key = buildAgentCacheKey(기본입력);

  it("같은 키면 되살린다", () => {
    expect(canRestoreAgentCache(캐시(key), key)).toBe(true);
  });

  it("키가 없으면 안 되살린다 — 예전 버전이 저장한 캐시다", () => {
    expect(canRestoreAgentCache(캐시(key, { cacheKey: undefined }), key)).toBe(false);
  });

  it("키가 다르면 안 되살린다", () => {
    expect(canRestoreAgentCache(캐시("다른키"), key)).toBe(false);
  });

  it("캐시가 없으면 안 되살린다", () => {
    expect(canRestoreAgentCache(null, key)).toBe(false);
  });

  it("오래된 결과는 버린다", () => {
    const 오래됨 = 캐시(key, { timestamp: Date.now() - AGENT_CACHE_TTL_MS - 1 });
    expect(canRestoreAgentCache(오래됨, key)).toBe(false);
  });

  it("유효기간 안이면 되살린다", () => {
    const 아슬아슬 = 캐시(key, { timestamp: Date.now() - AGENT_CACHE_TTL_MS + 1000 });
    expect(canRestoreAgentCache(아슬아슬, key)).toBe(true);
  });

  it("돌아가는 중이던 결과는 안 되살린다 — 화면이 영원히 「분석 중」이 된다", () => {
    const 진행중 = 캐시(key, {
      agents: {
        precedent: { id: "precedent", status: "completed", result: "판례" },
        legal: { id: "legal", status: "running", result: "" },
      },
    } as Partial<AgentsCacheData>);
    expect(canRestoreAgentCache(진행중, key)).toBe(false);
  });

  it("실패한 결과는 되살린다 — 그 하나만 재시도할 수 있다", () => {
    const 일부실패 = 캐시(key, {
      agents: {
        precedent: { id: "precedent", status: "completed", result: "판례" },
        legal: { id: "legal", status: "error", result: "", error: "호출 실패" },
      },
    } as Partial<AgentsCacheData>);
    expect(canRestoreAgentCache(일부실패, key)).toBe(true);
  });

  it("빈 결과는 안 되살린다", () => {
    expect(canRestoreAgentCache(캐시(key, { agents: {} } as Partial<AgentsCacheData>), key)).toBe(
      false,
    );
  });
});
