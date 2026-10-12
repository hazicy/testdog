import type { UserScope } from '@testdog/server/shared/ownership';
import { encryptSecret, decryptSecret } from '@testdog/server/shared/secrets';
import type {
  NotificationChannel,
  NotificationConfig,
} from '@testdog/contracts/integrations/types';

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
