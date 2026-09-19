// 영어 오류를 한국어로 바꾸는 유틸
//
// 김 변호사는 개발자가 아니다. "Missing or insufficient permissions."가 뜨면
// 읽지도 못하고 전화로 설명하지도 못한다. 반대로 멀쩡한 한국어 안내를 추측
// 문구로 덮어써 버리면 무슨 일이 있었는지 알 길이 사라진다.
import { describe, it, expect } from "vitest";
import { friendlyError, rawErrorText } from "../../utils/friendlyError";

describe("영어 오류를 한국어로", () => {
  it("Firebase 권한 오류", () => {
    const out = friendlyError({ code: "permission-denied" }, "사건을 열지 못했습니다.");
    expect(out).toContain("사건을 열지 못했습니다.");
    expect(out).toContain("권한");
    expect(out).not.toMatch(/permission/i);
  });

  it("메시지 본문에 박힌 Firebase 코드도 잡는다", () => {
    const out = friendlyError(new Error("Firebase: Error (auth/wrong-password)."), "로그인하지 못했습니다.");
    expect(out).toContain("비밀번호");
    expect(out).not.toMatch(/auth\//);
  });

  it("영어 관용구도 잡는다", () => {
    const out = friendlyError(new Error("Missing or insufficient permissions."), "불러오지 못했습니다.");
    expect(out).toContain("권한");
    expect(out).not.toMatch(/[A-Za-z]{6,}/);
  });

  it("알 수 없는 영어 오류는 기본 문장만 돌려준다 — 원문을 화면에 내보내지 않는다", () => {
    const out = friendlyError(new Error("TypeError: undefined is not a function"), "저장하지 못했습니다.");
    expect(out).toBe("저장하지 못했습니다.");
  });
});

describe("HTTP 상태 번호", () => {
  it("상태 코드를 가리키는 말 옆의 숫자는 잡는다", () => {
    expect(friendlyError(new Error("storage HTTP 413"), "올리지 못했습니다.")).toContain("너무 큽니다");
    expect(friendlyError(new Error("status: 429"), "요청 실패.")).toContain("잦습니다");
    expect(friendlyError(new Error("응답 503"), "실패.")).toContain("서버");
  });

  it("괄호 안의 상태 코드도 잡는다", () => {
    expect(friendlyError(new Error("request failed (404)"), "실패.")).toContain("찾을 수 없습니다");
  });

  it("금액을 상태 코드로 읽지 않는다", () => {
    // 법률 업무는 금액이 본문에 흔하다. 이게 "서버에서 문제가 생겼습니다"로
    // 둔갑하면 무슨 일이 있었는지 알 수 없게 된다.
    const out = friendlyError(new Error("보증금 500만원 처리에 실패했습니다"), "처리하지 못했습니다.");
    expect(out).toContain("보증금");
    expect(out).not.toContain("서버에서 문제");
  });

  it("법정 호수를 상태 코드로 읽지 않는다", () => {
    const out = friendlyError(new Error("301호 법정 기일 저장에 실패했습니다"), "저장하지 못했습니다.");
    expect(out).toContain("301호");
  });
});

describe("이미 한국어인 안내", () => {
  it("그대로 내보낸다", () => {
    const msg = "사건에 저장된 의뢰인 휴대폰 번호가 없습니다.";
    expect(friendlyError(new Error(msg), "실패.")).toBe(msg);
  });

  it("영어가 섞인 \"X 실패: 영문\"은 앞부분만 쓴다", () => {
    const out = friendlyError(
      new Error("녹음 파일을 올리지 못했습니다: Unexpected token < in JSON"),
      "실패.",
    );
    expect(out).toContain("녹음 파일을 올리지 못했습니다");
    expect(out).not.toContain("Unexpected token");
  });
});

describe("rawErrorText", () => {
  it("Error·문자열·객체에서 원문을 뽑는다", () => {
    expect(rawErrorText(new Error("boom"))).toBe("boom");
    expect(rawErrorText("boom")).toBe("boom");
    expect(rawErrorText({ message: "boom" })).toBe("boom");
  });

  it("null·undefined에도 터지지 않는다", () => {
    expect(rawErrorText(null)).toBe("");
    expect(rawErrorText(undefined)).toBe("");
  });
});
