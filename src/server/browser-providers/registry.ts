import { browserlessInput } from '@/features/integrations/schemas';
import { browserlessConfigSchema } from '@/automation/platform/web/providers/browserlessConfig';
import { WorkspaceError } from '@/server/shared/errors';
import { browserlessProvider } from '@/automation/platform/web/providers/browserless';
import type { BrowserProvider } from '@/automation/platform/web/providers/contracts';

export interface BrowserProviderDefinition {
  adapter: BrowserProvider;
  name: string;
  description: string;
  prepareConfig(raw: unknown, previous?: unknown): unknown;
  decodeConfig(raw: unknown): unknown;
  publicDetails(config: unknown): { hasCredentials: boolean };
}
export const browserProviderDefinitions: readonly BrowserProviderDefinition[] = [
  {
    adapter: browserlessProvider,
    name: 'Browserless',
    description: '使用远程 Chromium 浏览器执行 Web 用例。',
    prepareConfig(raw, previous) {
      const input = browserlessInput.parse(raw);
      const old = previous ? browserlessConfigSchema.parse(previous) : undefined;
      const endpoint = input.endpoint ?? old?.endpoint;

      if (!endpoint) throw new WorkspaceError('请填写 Browserless WebSocket 地址。');
      const url = new URL(endpoint);
      const embeddedToken = url.searchParams.get('token') || undefined;

      url.searchParams.delete('token');

      return browserlessConfigSchema.parse({
        endpoint: url.toString(),
        token: input.clearToken ? undefined : (input.token ?? embeddedToken ?? old?.token),
      });
    },
    decodeConfig: (raw) => browserlessConfigSchema.parse(raw),
    publicDetails: (config) => ({ hasCredentials: !!browserlessConfigSchema.parse(config).token }),
  },
];

export function browserProviderDefinition(id: string) {
  const definition = browserProviderDefinitions.find((item) => item.adapter.id === id);

  if (!definition) throw new WorkspaceError('浏览器服务提供方不存在。', 404);

  return definition;
}
