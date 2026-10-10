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
    files: ['src/components/**/*.{ts,tsx}', 'src/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '(?:^|/)(?:db(?:/.*)?|workspace/server(?:/.*)?|automation/(?:llm(?:/.*)?|platform/web/(?:browserSession|executor|observer|pageReadiness|webPlanner|webActions|webLocator)|platform/native/nativePlanner|compiler/textCompiler))(?:\\.[cm]?[jt]sx?)?$',
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
