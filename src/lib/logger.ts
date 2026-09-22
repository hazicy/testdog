import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pino } from 'pino';

const logDirectory = path.join(process.cwd(), 'logs');

mkdirSync(logDirectory, { recursive: true });

export const logger = pino({
  level: 'debug',
  transport: {
    targets: [
      // 写入本地文件：结构化 JSON，便于后续搜索或解析
      {
        target: 'pino/file',
        level: 'debug',
        options: {
          destination: path.join(logDirectory, 'app.log'),
        },
      },

      // 同时打印到终端：开发时可读性更好
      {
        target: 'pino-pretty',
        level: 'debug',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      },
    ],
  },
});
