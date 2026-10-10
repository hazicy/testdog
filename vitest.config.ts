import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Live services require an explicit process-level opt-in, never an .env default.
  const liveCompiler = process.env.RUN_LIVE_TESTS === 'true';
  const liveWorkspace = process.env.RUN_WORKSPACE_LIVE_TESTS === 'true';
  loadDotenv({
    path: [`.env.${mode}.local`, `.env.${mode}`, '.env.local', '.env'],
  });
  process.env.RUN_LIVE_TESTS = String(liveCompiler);
  process.env.RUN_WORKSPACE_LIVE_TESTS = String(liveWorkspace);

  return {
    test: {
      maxWorkers: 4,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  };
});
