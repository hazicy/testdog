import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
import stylistic from '@stylistic/eslint-plugin';

const functionStatements = [
  'function',
  {
    selector:
      ':matches(ExportNamedDeclaration, ExportDefaultDeclaration)[declaration.type="FunctionDeclaration"]',
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Disable formatting rules that conflict with Prettier.
  prettier,
  {
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        { blankLine: 'always', prev: '*', next: functionStatements },
        { blankLine: 'always', prev: functionStatements, next: '*' },
        { blankLine: 'always', prev: ['const', 'let'], next: 'expression' },
        { blankLine: 'always', prev: '*', next: 'return' },
      ],
    },
  },
  {
    files: [
      'src/automation/compiler/textCompiler.ts',
      'src/automation/evaluator.ts',
      'src/automation/platform/web/webPlanner.ts',
      'src/automation/platform/web/executor.ts',
      'src/automation/platform/native/nativePlanner.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^openai(?:/|$)|(?:^|/)llm/(?!contracts(?:\\.[cm]?[jt]sx?)?$)|(?:^|/)workspace/server(?:/|$)',
              message: '模型消费者依赖 ModelClient；具体模型和 SDK 由装配层选择并注入。',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/automation/platform/web/playwrightSession.ts',
      'src/automation/platform/web/recordingLocator.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(?:^|/)(?:workspace/server|db)(?:/.*)?$',
              message: 'Web 会话和录制定位依赖平台能力，不直接依赖工作台服务端或数据库。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/automation/planRunner.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(?:^|/)(?:llm|workspace|db|platform/(?:web|native))(?:/.*)?$',
              allowTypeImports: true,
              message: 'PlanRunner 通过注入接口编排执行，不直接依赖平台驱动、模型或工作台存储。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '(?:^|/)(?:db(?:/.*)?|workspace/server(?:/.*)?|automation/(?:planRunner|evaluator|llm(?:/.*)?|platform/web/(?:browserSession|executor|observer|pageReadiness|webPlanner|webActions|webLocator|recordingLocator|replay)|platform/native/nativePlanner|compiler/textCompiler))(?:\\.[cm]?[jt]sx?)?$',
              allowTypeImports: true,
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
