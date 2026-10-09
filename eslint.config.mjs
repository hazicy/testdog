import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Disable formatting rules that conflict with Prettier.
  prettier,
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/db',
                '@/db/*',
                '@/workspace/store',
                '@/workspace/run',
                '@/workspace/runLifecycle',
                '@/workspace/recorder',
                '@/automation/browser',
                '@/automation/executor',
              ],
              message: '浏览器组件通过 API 访问服务端功能；共享类型请使用 import type。',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'test-results/**',
    'playwright-report/**',
  ]),
]);

export default eslintConfig;
