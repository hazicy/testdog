import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  loadDotenv({
    path: [`.env.${mode}.local`, `.env.${mode}`, '.env.local', '.env'],
  });

  return {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  };
});
