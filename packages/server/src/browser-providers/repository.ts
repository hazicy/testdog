import {
  ownershipValues,
  rowScope,
  ownedBy,
  type UserScope,
} from '@testdog/server/shared/ownership';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WebTarget } from '@testdog/contracts/execution/target';
import { db } from '@testdog/server/db';
import { browserProviderIntegrations as integrations, testRuns } from '@testdog/server/db/schema';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { encryptSecret, decryptSecret } from '@testdog/server/infrastructure/secrets';
import type { BrowserProviderIntegration } from '@testdog/contracts/integrations/types';
import {
  browserProviderDefinitions,
  browserProviderDefinition,
  type BrowserProviderDefinition,
} from '@testdog/server/browser-providers/registry';

const saveInput = z.object({ version: z.number().int().min(0), enabled: z.boolean() });

function decode(row: typeof integrations.$inferSelect, definition: BrowserProviderDefinition) {
  return definition.decodeConfig(decryptSecret(row.encryptedConfig, rowScope(row), row.provider));
}

function view(
  definition: BrowserProviderDefinition,
  row?: typeof integrations.$inferSelect,
): BrowserProviderIntegration {
  const result = {
    provider: definition.adapter.id,
    name: definition.name,
    description: definition.description,
    supportedBrowsers: definition.adapter.supportedBrowsers,
    version: row?.version ?? 0,
    enabled: row?.enabled ?? false,
    configured: !!row,
    hasCredentials: false,
  };

  if (!row) return result;
  try {
    return { ...result, ...definition.publicDetails(decode(row, definition)) };
  } catch {
    return {
      ...result,
      configured: false,
      configurationError: '浏览器服务配置无法解密，请重新填写完整配置后保存。',
    };
  }
}

export async function readBrowserProviders(userId: UserScope) {
  const rows = await db.select().from(integrations).where(ownedBy(integrations, userId));

  return browserProviderDefinitions.map((definition) =>
    view(
      definition,
      rows.find((row) => row.provider === definition.adapter.id),
    ),
  );
}

export async function saveBrowserProvider(provider: string, raw: unknown, userId: UserScope) {
  const definition = browserProviderDefinition(provider);
  const parsed = saveInput.safeParse(raw);

  if (!parsed.success) throw new WorkspaceError('浏览器服务配置无效。');
  const input = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(integrations)
        .where(and(eq(integrations.provider, provider), ownedBy(integrations, userId)))
        .for('update');

      if ((row?.version ?? 0) !== input.version)
        throw new WorkspaceError('浏览器服务配置已更新，请刷新页面后重试。', 409);
      let previous: unknown;

      if (row) {
        try {
          previous = decode(row, definition);
        } catch {
          /* A full replacement can repair unreadable credentials. */
        }
      }

      let config: unknown;

      try {
        config = definition.prepareConfig(raw, previous);
      } catch {
        throw new WorkspaceError(
          '浏览器服务配置无效，请检查地址和凭据；配置无法解密时请重新填写完整配置。',
        );
      }

      // Only one remote provider may be active per owner. Unique indexes guard concurrent saves.
      if (input.enabled)
        await tx
          .update(integrations)
          .set({
            enabled: false,
            version: sql`${integrations.version} + 1`,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              ownedBy(integrations, userId),
              ne(integrations.provider, provider),
              eq(integrations.enabled, true),
            ),
          );
      const values = {
        enabled: input.enabled,
        version: input.version + 1,
        encryptedConfig: encryptSecret(config, userId, provider),
        updatedAt: new Date().toISOString(),
      };
      const [saved] = row
        ? await tx.update(integrations).set(values).where(eq(integrations.id, row.id)).returning()
        : await tx
            .insert(integrations)
            .values({ ...values, provider, ...ownershipValues(userId) })
            .onConflictDoNothing()
            .returning();

      if (!saved) throw new WorkspaceError('浏览器服务配置已更新，请刷新页面后重试。', 409);

      return view(definition, saved);
    });
  } catch (error) {
    const code =
      (error as { code?: string; cause?: { code?: string } })?.code ??
      (error as { cause?: { code?: string } })?.cause?.code;

    if (code === '23505' || code === '40P01')
      throw new WorkspaceError('浏览器服务配置已更新，请刷新页面后重试。', 409);
    throw error;
  }
}

export async function savedBrowserProvider(provider: string, userId: UserScope) {
  const definition = browserProviderDefinition(provider);
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.provider, provider), ownedBy(integrations, userId)));

  if (!row) throw new WorkspaceError('请先保存浏览器服务配置。');
  try {
    return { definition, config: decode(row, definition) };
  } catch {
    throw new WorkspaceError('浏览器服务配置无法解密，请重新填写完整配置后保存。');
  }
}

export async function browserProviderForRun(runId: string, browser: WebTarget['browser']) {
  const [run] = await db
    .select({ userId: testRuns.userId, teamId: testRuns.teamId })
    .from(testRuns)
    .where(eq(testRuns.id, runId));

  if (!run) throw new WorkspaceError('执行记录不存在。', 404);
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(ownedBy(integrations, rowScope(run)), eq(integrations.enabled, true)));

  if (!row) return undefined;
  const definition = browserProviderDefinition(row.provider);

  if (!definition.adapter.supportedBrowsers.includes(browser)) return undefined;
  try {
    return { definition, config: decode(row, definition) };
  } catch {
    throw new WorkspaceError('浏览器服务配置无法解密，请重新填写完整配置后保存。');
  }
}
