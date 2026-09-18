import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // 보안 규칙 테스트는 Firestore 에뮬레이터가 있어야 돈다. `npm run test:rules`로 따로 실행한다.
    exclude: ['**/node_modules/**', 'src/__tests__/rules/**'],
  },
});
