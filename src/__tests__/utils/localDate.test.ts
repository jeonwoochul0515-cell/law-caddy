// 날짜 문자열이 로컬(한국) 기준인지
//
// new Date().toISOString().slice(0, 10)은 UTC라서 한국시간 0시~8시59분에는
// 전날 날짜가 나온다. 김 변호사는 출근 직후 8시대에 정산을 본다 — 정확히 그
// 구간이다. 그 시간에 「납부완료」를 누르면 장부에 어제 날짜가 박힌다.
import { describe, it, expect } from "vitest";
import { localDateStr, formatKst, formatKstTime } from "../../utils/localDate";
import { toYmd, computeDueDate, calcDDay, calcStatus } from "../../types/deadline";

describe("시간대 전제", () => {
  it("테스트는 한국 시간대에서 돌아야 한다", () => {
    // 아래 검증들은 "로컬이 UTC와 다르다"는 전제 위에 서 있다.
    // 이 줄이 깨지면 아래 테스트들은 통과해도 아무것도 보증하지 못한다.
    // vitest.config.ts가 TZ를 Asia/Seoul로 고정한다.
    expect(new Date(2026, 8, 19, 8, 0, 0).getTimezoneOffset()).toBe(-540);
  });
});

describe("localDateStr", () => {
  it("로컬 기준 날짜를 돌려준다 — UTC로 밀리지 않는다", () => {
    // 한국시간 2026-09-19 오전 8시 = UTC 2026-09-18 23:00
    const 오전8시 = new Date(2026, 8, 19, 8, 0, 0);
    expect(localDateStr(오전8시)).toBe("2026-09-19");
    // 같은 순간을 UTC로 읽으면 하루 밀린다 — 이게 고친 대상이다
    expect(오전8시.toISOString().slice(0, 10)).not.toBe("2026-09-19");
  });

  it("자정 직후도 그날 날짜다", () => {
    expect(localDateStr(new Date(2026, 0, 1, 0, 30, 0))).toBe("2026-01-01");
  });

  it("월·일을 두 자리로 채운다", () => {
    expect(localDateStr(new Date(2026, 2, 5))).toBe("2026-03-05");
  });

  it("deadline.ts의 toYmd는 같은 함수다 — 구현이 갈리지 않는다", () => {
    expect(toYmd).toBe(localDateStr);
  });
});

describe("formatKst", () => {
  it("빈 시각(epoch 0)은 빈 문자열", () => {
    expect(formatKst(new Date(0))).toBe("");
    expect(formatKstTime(new Date(0))).toBe("");
  });

  it("한국 표기로 날짜를 낸다", () => {
    const out = formatKst(new Date(2026, 8, 19, 14, 2), { dateOnly: true });
    expect(out).toContain("2026");
    expect(out).toContain("9");
  });
});

describe("법정기간 계산", () => {
  it("초일불산입 — 기산일 다음날부터 센다 (민법 §157)", () => {
    // 2026-09-01 송달, 14일 → 2026-09-15
    expect(computeDueDate("2026-09-01", 14).rawDueDate).toBe("2026-09-15");
  });

  it("말일이 토·일이면 다음 평일로 넘긴다 (민법 §161)", () => {
    // 2026-09-04(금) + 14일 = 2026-09-18(금) — 넘기지 않는다
    const 평일 = computeDueDate("2026-09-04", 14);
    expect(평일.rolledOver).toBe(false);

    // 말일이 토요일이 되는 경우
    const 토요일마감 = computeDueDate("2026-09-05", 14); // 2026-09-19(토)
    expect(토요일마감.rawDueDate).toBe("2026-09-19");
    expect(토요일마감.dueDate).toBe("2026-09-21"); // 월요일
    expect(토요일마감.rolledOver).toBe(true);
  });

  it("기산일이 잘못되면 알려준다", () => {
    expect(() => computeDueDate("어제", 14)).toThrow();
  });
});

describe("D-Day", () => {
  it("마감일 당일은 0", () => {
    expect(calcDDay("2026-09-19", new Date(2026, 8, 19, 8, 0))).toBe(0);
  });

  it("오전 8시에 봐도 오늘 기준이다 — 하루 밀리지 않는다", () => {
    expect(calcDDay("2026-09-20", new Date(2026, 8, 19, 8, 0))).toBe(-1);
    expect(calcDDay("2026-09-18", new Date(2026, 8, 19, 8, 0))).toBe(1);
  });

  it("완료 처리한 기한은 날짜와 무관하게 done", () => {
    expect(calcStatus(30, true)).toBe("done");
    expect(calcStatus(30, false)).toBe("overdue");
  });

  it("7일 이내는 임박, 30일 이내는 예정", () => {
    expect(calcStatus(-3)).toBe("imminent");
    expect(calcStatus(-20)).toBe("upcoming");
    expect(calcStatus(-60)).toBe("comfortable");
  });
});
