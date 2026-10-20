import { queueWakeup } from '@testdog/server/infrastructure/queueWakeup';
import { redisKey } from '@testdog/server/infrastructure/redis';

export const taskReadyChannel = () => redisKey('tasks:ready');

export function taskWakeup(signal: AbortSignal) {
  return queueWakeup(signal, taskReadyChannel(), 1000);
}
