import { queueWakeup } from '@testdog/server/shared/queueWakeup';
import { redisKey } from '@testdog/server/shared/redis';

export const taskReadyChannel = () => redisKey('tasks:ready');

export function taskWakeup(signal: AbortSignal) {
  return queueWakeup(signal, taskReadyChannel(), 1000);
}
