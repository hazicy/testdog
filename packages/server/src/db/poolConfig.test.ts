import { expect, it } from 'vitest';
import { poolConfig } from './poolConfig';

it('sets bounded waits and permits an independent background statement budget', () => {
  expect(poolConfig({})).toMatchObject({
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    lock_timeout: 5000,
    idle_in_transaction_session_timeout: 30000,
  });
  expect(
    poolConfig({ TESTDOG_DB_STATEMENT_TIMEOUT_MS: '60000', TESTDOG_DB_LOCK_TIMEOUT_MS: '2000' }),
  ).toMatchObject({ statement_timeout: 60000, lock_timeout: 2000 });
});
it.each(['0', '-1', 'NaN', '', '1.5', '2147483648'])('rejects an invalid timeout %s', (value) => {
  expect(() => poolConfig({ TESTDOG_DB_CONNECTION_TIMEOUT_MS: value })).toThrow(
    'TESTDOG_DB_CONNECTION_TIMEOUT_MS',
  );
});
