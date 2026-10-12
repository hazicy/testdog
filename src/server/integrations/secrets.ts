import type { UserScope } from '@/server/shared/ownership';
import { encryptSecret, decryptSecret } from '@/server/shared/secrets';
import type { NotificationChannel, NotificationConfig } from '@/features/integrations/types';

export function encryptConfig(
  config: NotificationConfig,
  userId: UserScope,
  channel: NotificationChannel,
) {
  return encryptSecret(config, userId, channel);
}

export function decryptConfig(
  value: string,
  userId: UserScope,
  channel: NotificationChannel,
): NotificationConfig {
  return decryptSecret(value, userId, channel) as NotificationConfig;
}
