import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
import stylistic from '@stylistic/eslint-plugin';

const serverImportPattern = '^@testdog/server(?:/|$)|^(?:@/|(?:\\.{1,2}/)+(?:src/)?)server(?:/|$)';

// 函数声明（包括 export function 和 export default function）
const functionStatements = [
  'function',
  {
    selector:
      ':matches(ExportNamedDeclaration, ExportDefaultDeclaration)[declaration.type="FunctionDeclaration"]',
  },
];

// 通用空行规则
const paddingRules = [
  // import 语句与其他语句之间空一行
  { blankLine: 'always', prev: 'import', next: '*' },

  // 连续 import 不强制空行
  { blankLine: 'any', prev: 'import', next: 'import' },

  // directive 之后空一行（如 'use client'）
  { blankLine: 'always', prev: 'directive', next: '*' },

  // 连续 directive 不强制空行
  { blankLine: 'any', prev: 'directive', next: 'directive' },

  // 函数声明前后空一行
  { blankLine: 'always', prev: '*', next: functionStatements },
  { blankLine: 'always', prev: functionStatements, next: '*' },

  // 变量声明之后空一行
  {
    blankLine: 'always',
    prev: ['const', 'let'],
    next: '*',
  },

  // 连续变量声明保持紧凑
  {
    blankLine: 'any',
    prev: ['const', 'let'],
    next: ['const', 'let'],
  },

  // 代码块之后空一行（if、for、while 等）
  {
    blankLine: 'always',
    prev: 'block-like',
    next: '*',
  },

  // return 前空一行
  {
    blankLine: 'always',
    prev: '*',
    next: 'return',
  },
];

const eslintConfig = defineConfig([
  // Next.js + TypeScript
  ...nextVitals,
  ...nextTs,

  { settings: { next: { rootDir: 'apps/web/' } } },

  // 关闭与 Prettier 冲突的格式化规则
  prettier,

  // 代码空行规范
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/padding-line-between-statements': ['error', ...paddingRules],
    },
  },

  {
    files: ['packages/contracts/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@testdog/(?:engine|server)/|^@/|^next(?:/|$)|^react(?:/|$)',
              message: '共享协议不能依赖应用、执行实现或服务端。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/engine/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@testdog/server/|^@/',
              message: '执行引擎通过接口使用存储和业务能力，不依赖服务端。',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['packages/server/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@/|^next(?:/|$)|^better-auth(?:/|$)|^@better-auth/',
              message: '共享后端不能依赖 Web 应用、Next.js 或用户会话实现。',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['packages/server/src/runs/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@/|^next(?:/|$)|^better-auth(?:/|$)|^@better-auth/',
              message: '共享后端不能依赖 Web 应用、Next.js 或用户会话实现。',
            },
            {
              regex: '^@testdog/server/execution(?:/|$)|(?:^|/)execution(?:/|$)',
              message: '执行记录业务不能依赖执行器；取消请求通过数据库传递。',
            },
          ],
        },
      ],
    },
  },

  // 模型消费者依赖限制
  {
    files: [
      'packages/engine/src/compiler/textCompiler.ts',
      'packages/engine/src/evaluator.ts',
      'packages/engine/src/platform/web/webPlanner.ts',
      'packages/engine/src/platform/native/nativePlanner.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^openai(?:/|$)|^@testdog/engine/llm/(?!contracts)|(?:^|/)llm/(?!contracts(?:\\.[cm]?[jt]sx?)?$)|${serverImportPattern}`,
              message: '模型消费者依赖 ModelClient；具体模型和 SDK 由装配层选择并注入。',
            },
          ],
        },
      ],
    },
  },

  // Web 会话和录制定位依赖限制
  {
    files: [
      'packages/engine/src/platform/web/playwrightSession.ts',
      'packages/engine/src/platform/web/recordingLocator.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `(?:^|/)db(?:/.*)?$|^@testdog/server/|${serverImportPattern}`,
              message: 'Web 会话和录制定位依赖平台能力，不直接依赖工作台服务端或数据库。',
            },
          ],
        },
      ],
    },
  },

  // PlanRunner 依赖限制
  {
    files: ['packages/engine/src/planRunner.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^@testdog/(?:server|contracts/(?!automation/)|engine/(?:llm|platform/(?:web|native)))|(?:^|/)(?:llm|features|db|platform/(?:web|native))(?:/.*)?$|${serverImportPattern}`,
              allowTypeImports: true,
              message: 'PlanRunner 通过注入接口编排执行，不直接依赖平台驱动、模型或工作台存储。',
            },
          ],
        },
      ],
    },
  },

  // 浏览器组件依赖限制
  {
    files: [
      'apps/web/src/components/**/*.{ts,tsx}',
      'apps/web/src/features/**/*.{ts,tsx}',
      'apps/web/src/client/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^@testdog/server/|^@testdog/engine/|(?:^|/)(?:db(?:/.*)?|engine/(?:planRunner|evaluator|llm(?:/.*)?|platform/web/(?:browserSession|observer|pageReadiness|webPlanner|webActions|webLocator|recordingLocator|replay)|platform/native/nativePlanner|compiler/textCompiler))(?:\\.[cm]?[jt]sx?)?$|${serverImportPattern}`,
              allowTypeImports: true,
              message: '浏览器组件通过 API 访问服务端功能；共享类型请使用 import type。',
            },
          ],
        },
      ],
    },
  },

  // 忽略文件
  globalIgnores([
    '**/.next/**',
    '**/dist/**',
    'out/**',
    'build/**',
    '**/next-env.d.ts',
    'test-results/**',
    'playwright-report/**',
  ]),
]);

export default eslintConfig;
