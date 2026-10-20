import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('writes JSON with execution context and error stacks, respecting the configured level', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
        import { logger } from ${JSON.stringify(new URL('./logger.ts', import.meta.url).href)};
        const log = logger.child({ runId: 'run', workerId: 'worker', resourceId: 'resource' });
        log.info('hidden');
        log.error({ err: new Error('execution failed') }, 'Run failed');
      `,
    ],
    { encoding: 'utf8', env: { ...process.env, TESTDOG_LOG_LEVEL: 'warn' } },
  );
  const records = output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    level: 50,
    name: 'testdog',
    runId: 'run',
    workerId: 'worker',
    resourceId: 'resource',
    msg: 'Run failed',
    err: { type: 'Error', message: 'execution failed', stack: expect.stringContaining('at ') },
  });
});
