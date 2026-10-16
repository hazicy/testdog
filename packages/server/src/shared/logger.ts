import pino from 'pino';

export const logger = pino({
  name: 'testdog',
  level: process.env.TESTDOG_LOG_LEVEL || 'info',
});
