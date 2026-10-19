/** Server-side timeouts cancel work as well as bounding connection acquisition. */
export function poolConfig(env: NodeJS.ProcessEnv = process.env) {
  const milliseconds = (name: string, fallback: number) => {
    const value = env[name] === undefined ? fallback : Number(env[name]);

    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
      throw new Error(`${name} must be a positive millisecond integer`);

    return value;
  };

  const statementTimeout = milliseconds('TESTDOG_DB_STATEMENT_TIMEOUT_MS', 15000);

  return {
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: milliseconds('TESTDOG_DB_CONNECTION_TIMEOUT_MS', 5000),
    statement_timeout: statementTimeout,
    query_timeout: Math.min(statementTimeout + 5000, 2147483647),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    lock_timeout: milliseconds('TESTDOG_DB_LOCK_TIMEOUT_MS', 5000),
    idle_in_transaction_session_timeout: milliseconds(
      'TESTDOG_DB_IDLE_TRANSACTION_TIMEOUT_MS',
      30000,
    ),
  };
}
