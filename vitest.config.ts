import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 테스트는 한국 시간대에서 돈다.
//
// 이 제품은 한국 법률사무소만 쓴다. 날짜 계산(D-Day·법정기간·장부 날짜)이 전부
// 한국 시간 기준이므로 검증도 같은 시간대에서 해야 의미가 있다.
//
// (2026-09-19) 고정하지 않았더니 개발 기계(KST)에서는 통과한 테스트가 CI(UTC)에서
// 깨졌다. "toISOString은 로컬과 다를 수 있다"는 주장 자체가 UTC 환경에서는 성립하지
// 않기 때문이다. 시간대에 따라 결과가 달라지는 테스트는 아무것도 보증하지 못한다.
process.env.TZ = 'Asia/Seoul';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // 보안 규칙 테스트는 Firestore 에뮬레이터가 있어야 돈다. `npm run test:rules`로 따로 실행한다.
    exclude: ['**/node_modules/**', 'src/__tests__/rules/**'],
    env: { TZ: 'Asia/Seoul' },
  },
});
