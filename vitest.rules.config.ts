// 보안 규칙 테스트 전용 설정 — Firestore 에뮬레이터가 떠 있어야 한다.
// `npm run test:rules`가 firebase emulators:exec로 감싸서 실행한다.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/rules/**/*.test.ts"],
    // 에뮬레이터 왕복이 있어 기본 5초로는 모자라다
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
