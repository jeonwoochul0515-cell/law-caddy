// 녹음 조각 저장소 검증 — 전화로 녹음이 끊겨도 그때까지의 내용이 살아남는지
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  beginSession,
  appendChunk,
  getSavedSession,
  buildSavedFile,
  clearSession,
} from "../../services/recordingStore";

describe("녹음 조각 저장소", () => {
  beforeEach(async () => {
    await clearSession();
  });

  it("세션이 없으면 저장된 녹음도 없다", async () => {
    expect(await getSavedSession()).toBeNull();
    expect(await buildSavedFile()).toBeNull();
  });

  it("조각을 저장하면 세션 정보와 길이가 남는다", async () => {
    await beginSession("audio/webm");
    await appendChunk(new Blob(["aaa"], { type: "audio/webm" }), 5);
    await appendChunk(new Blob(["bbb"], { type: "audio/webm" }), 10);

    const meta = await getSavedSession();
    expect(meta).not.toBeNull();
    expect(meta!.duration).toBe(10);
    expect(meta!.mimeType).toBe("audio/webm");
  });

  it("저장된 조각을 순서대로 합쳐 하나의 파일로 만든다", async () => {
    await beginSession("audio/webm");
    await appendChunk(new Blob(["1"], { type: "audio/webm" }), 5);
    await appendChunk(new Blob(["2"], { type: "audio/webm" }), 10);
    await appendChunk(new Blob(["3"], { type: "audio/webm" }), 15);

    const file = await buildSavedFile();
    expect(file).not.toBeNull();
    expect(await file!.text()).toBe("123");
    expect(file!.name).toMatch(/\.webm$/);
  });

  it("새 세션을 시작하면 이전 조각은 버려진다", async () => {
    await beginSession("audio/webm");
    await appendChunk(new Blob(["old"], { type: "audio/webm" }), 5);

    await beginSession("audio/webm");
    await appendChunk(new Blob(["new"], { type: "audio/webm" }), 5);

    const file = await buildSavedFile();
    expect(await file!.text()).toBe("new");
  });

  it("정리하면 아무것도 남지 않는다", async () => {
    await beginSession("audio/webm");
    await appendChunk(new Blob(["x"], { type: "audio/webm" }), 5);
    await clearSession();

    expect(await getSavedSession()).toBeNull();
    expect(await buildSavedFile()).toBeNull();
  });

  it("mp4로 녹음한 경우(사파리) 확장자가 맞는다", async () => {
    await beginSession("audio/mp4");
    await appendChunk(new Blob(["m"], { type: "audio/mp4" }), 5);

    const file = await buildSavedFile();
    expect(file!.name).toMatch(/\.mp4$/);
    expect(file!.type).toBe("audio/mp4");
  });
});
