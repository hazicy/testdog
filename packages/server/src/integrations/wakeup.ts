import { redisKey } from '@testdog/server/infrastructure/redis';

export const notificationReadyChannel = () => redisKey('notifications:ready');
