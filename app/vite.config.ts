import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// The app version shown in feedback mail; package.json and android versionName move together.
const appVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    'import.meta.env.VITE_ENABLE_TEST_TOOLS': JSON.stringify(mode === 'test' || mode === 'internal' ? 'true' : ''),
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    coverage: {
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 50,
        lines: 60,
      },
    },
  },
}));
