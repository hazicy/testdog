import { afterEach, expect, it, vi } from 'vitest';

vi.mock('dotenv', () => ({
  config: () => {
    process.env.RUN_LIVE_TESTS ??= 'true';
    process.env.RUN_WORKSPACE_LIVE_TESTS ??= 'true';
  },
}));
import configure from '../vitest.config';

afterEach(() => vi.unstubAllEnvs());

it.each([
  [undefined, undefined, 'false', 'false'],
  ['false', 'false', 'false', 'false'],
  ['true', undefined, 'true', 'false'],
  [undefined, 'true', 'false', 'true'],
])(
  'live tests require explicit process opt-in (%s, %s)',
  (compiler, workspace, expectedCompiler, expectedWorkspace) => {
    vi.stubEnv('RUN_LIVE_TESTS', compiler);
    vi.stubEnv('RUN_WORKSPACE_LIVE_TESTS', workspace);
    configure({ mode: 'test', command: 'serve' });
    expect(process.env.RUN_LIVE_TESTS).toBe(expectedCompiler);
    expect(process.env.RUN_WORKSPACE_LIVE_TESTS).toBe(expectedWorkspace);
  },
);
