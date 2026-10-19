import { redisKey } from '@testdog/server/shared/redis';

export const notificationReadyChannel = () => redisKey('notifications:ready');
