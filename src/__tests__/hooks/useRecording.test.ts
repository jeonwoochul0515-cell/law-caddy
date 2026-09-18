// @vitest-environment jsdom
//
// 녹음이 강제로 끊겼을 때 자료가 살아남는지 검증한다.
//
// 이 훅에는 사고 이력이 있다. 마이크를 빼앗긴 순간 훅이 파일을 만들어
// interruptedFile에 넣고 곧바로 IndexedDB 조각을 지웠는데, 화면이 그 파일을
// 가져가지 않아 메모리 사본과 디스크 사본이 한꺼번에 사라졌다. 화면에는
// "저장되었습니다"라고 떴다. 그래서 여기서 지키는 것은 순서다.
//   끊긴다 → 조각은 디스크에 남아 있다 → 화면이 파일을 받아간다 → 그때 지운다
import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { renderHook, act, waitFor } from "@testing-library/react";
import useRecording, { describeMicError } from "../../hooks/useRecording";
import { getSavedSession, clearSession } from "../../services/recordingStore";

/** MediaRecorder를 대신하는 최소 구현. 조각을 언제 흘릴지 테스트가 직접 정한다. */
class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static last: FakeMediaRecorder | null = null;

  constructor() {
    FakeMediaRecorder.last = this;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.onstop?.();
  }

  /** 테스트가 조각 하나를 흘려보낸다 */
  emit(text: string) {
    this.ondataavailable?.({ data: new Blob([text], { type: "audio/webm" }) });
  }
}

/** 마이크 트랙 — onended로 "전화가 왔다"를 흉내낸다 */
class FakeTrack {
  onended: (() => void) | null = null;
  stop = vi.fn();
}

let track: FakeTrack;

beforeEach(async () => {
  await clearSession();
  track = new FakeTrack();
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
});

describe("녹음이 강제로 끊겼을 때", () => {
  it("디스크 조각을 남긴 채 파일을 화면에 넘긴다", async () => {
    const { result } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      FakeMediaRecorder.last!.emit("상담 앞부분");
    });
    await waitFor(async () => {
      expect(await getSavedSession()).not.toBeNull();
    });

    // 전화가 온다 — 마이크를 빼앗긴다
    act(() => {
      track.onended!();
    });

    await waitFor(() => {
      expect(result.current.interruptedFile).not.toBeNull();
      expect(result.current.interrupted).toBe(true);
    });

    // 화면이 아직 받아가지 않았다. 디스크 사본이 살아 있어야 한다.
    expect(await getSavedSession()).not.toBeNull();
    // jsdom의 File에는 text()가 없다. 내용이 들어 있는지만 크기로 확인한다.
    expect(result.current.interruptedFile!.size).toBeGreaterThan(0);
    expect(result.current.interruptedFile!.name).toMatch(/\.webm$/);
  });

  it("화면이 파일을 받아간 뒤에야 디스크 조각을 지운다", async () => {
    const { result } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      FakeMediaRecorder.last!.emit("상담 앞부분");
    });
    await waitFor(async () => {
      expect(await getSavedSession()).not.toBeNull();
    });
    act(() => {
      track.onended!();
    });
    await waitFor(() => expect(result.current.interruptedFile).not.toBeNull());

    let taken: File | null = null;
    act(() => {
      taken = result.current.takeInterruptedFile();
    });

    expect(taken).not.toBeNull();
    await waitFor(async () => {
      expect(await getSavedSession()).toBeNull();
    });
    expect(result.current.interruptedFile).toBeNull();
  });

  it("받아간 파일이 없으면 디스크를 건드리지 않는다", async () => {
    const { result } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      FakeMediaRecorder.last!.emit("남아 있어야 하는 녹음");
    });
    await waitFor(async () => {
      expect(await getSavedSession()).not.toBeNull();
    });

    // 끊기지 않은 상태에서 호출 — 가져갈 파일이 없다
    act(() => {
      expect(result.current.takeInterruptedFile()).toBeNull();
    });

    expect(await getSavedSession()).not.toBeNull();
  });
});

describe("마이크 오류 문구", () => {
  it("권한 거부는 다음에 할 일까지 한국어로 알려준다", () => {
    const err = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    const msg = describeMicError(err);
    expect(msg).toMatch(/[가-힣]/);
    expect(msg).not.toMatch(/NotAllowedError/);
  });

  it("마이크를 못 찾으면 그 사실을 말한다", () => {
    const err = Object.assign(new Error("not found"), { name: "NotFoundError" });
    expect(describeMicError(err)).toMatch(/[가-힣]/);
  });
});
