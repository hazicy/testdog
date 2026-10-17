import { ownershipValues, ownedBy, type UserScope } from '@testdog/server/shared/ownership';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@testdog/server/db';
import { pluginSettings } from '@testdog/server/db/schema';
import { WorkspaceError } from '@testdog/server/shared/errors';
import {
  VolcengineSettingsSchema,
  VolcengineSelectionSchema,
  resolveExecutionPlugin,
  type PluginInvocation,
} from '@testdog/contracts/plugins/execution';
import type { Plan, PlanNode } from '@testdog/contracts/automation/compiler/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const pluginId = 'volcengine-abtest';

export async function readPluginSettings(userId: UserScope, tx: Tx | typeof db = db) {
  const [row] = await tx
    .select()
    .from(pluginSettings)
    .where(and(ownedBy(pluginSettings, userId), eq(pluginSettings.pluginId, pluginId)));

  return {
    settings: [
      {
        id: pluginId,
        config: VolcengineSettingsSchema.parse(row?.config ?? {}),
        version: row?.version ?? 0,
      },
    ],
  };
}

export async function savePluginSettings(id: string, raw: unknown, userId: UserScope) {
  if (id !== pluginId) throw new WorkspaceError('插件不存在', 404);
  const parsed = z
    .strictObject({ version: z.number().int().nonnegative(), config: VolcengineSettingsSchema })
    .safeParse(raw);

  if (!parsed.success) throw new WorkspaceError(parsed.error.issues[0]?.message || '插件配置无效');
  try {
    return await db.transaction(async (tx) => {
      const values = {
        config: parsed.data.config,
        version: parsed.data.version + 1,
        updatedAt: new Date().toISOString(),
      };

      if (parsed.data.version === 0) {
        await tx
          .insert(pluginSettings)
          .values({ ...values, ...ownershipValues(userId), pluginId: id });
      } else {
        const updated = await tx
          .update(pluginSettings)
          .set(values)
          .where(
            and(
              ownedBy(pluginSettings, userId),
              eq(pluginSettings.pluginId, id),
              eq(pluginSettings.version, parsed.data.version),
            ),
          )
          .returning({ id: pluginSettings.id });

        if (!updated.length) throw new WorkspaceError('插件配置已更新，请刷新后重试', 409);
      }

      return readPluginSettings(userId, tx);
    });
  } catch (error) {
    const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : error;

    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505')
      throw new WorkspaceError('插件配置已更新，请刷新后重试', 409);
    throw error;
  }
}

export async function resolvePluginInvocations(
  invocations: PluginInvocation[],
  userId: UserScope,
  tx: Tx | typeof db,
) {
  if (!invocations.length) return [];
  const requiresSettings = invocations.some(
    (invocation) => VolcengineSelectionSchema.safeParse(invocation.config).success,
  );
  const settings = requiresSettings
    ? (await readPluginSettings(userId, tx)).settings[0].config
    : undefined;

  try {
    return invocations.map((invocation) => resolveExecutionPlugin(invocation, settings));
  } catch (error) {
    throw new WorkspaceError(error instanceof Error ? error.message : '插件配置无效');
  }
}

export async function resolvePlanPlugins(
  plan: Plan,
  userId: UserScope,
  tx: Tx | typeof db,
): Promise<Plan> {
  const nodes = Object.values(plan.nodes).filter(
    (node): node is Extract<PlanNode, { kind: 'task' }> =>
      node.kind === 'task' && node.actionType === 'plugin' && Boolean(node.plugin),
  );

  if (!nodes.length) return plan;
  const plugins = await resolvePluginInvocations(
    nodes.map((node) => node.plugin!),
    userId,
    tx,
  );
  const resolved = structuredClone(plan);

  nodes.forEach((node, index) => {
    const target = resolved.nodes[node.id];

    if (target.kind === 'task') target.plugin = plugins[index];
  });

  return resolved;
}
