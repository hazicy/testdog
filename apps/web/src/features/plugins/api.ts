/** Host-neutral plugin contract. Inputs and outputs are snapshots, never mutable run records. */
export type PluginAsset = { id: string; kind: string; contentType: string };
export type PluginNode = {
  id: string;
  type: string;
  title: string;
  input: Readonly<Record<string, unknown>>;
  output: Readonly<Record<string, unknown>>;
  assets: readonly PluginAsset[];
};
export type PluginGroup = { id: string; name: string; nodeIds: string[] };
export type PluginFile = { name: string; blob: Blob };
export type PluginResult = { data?: unknown; files?: PluginFile[] };
export type PluginContext = {
  nodes: readonly PluginNode[];
  groups: readonly PluginGroup[];
  readAsset: (id: string) => Promise<Blob>;
};
export type NodePlugin = {
  id: string;
  accepts: (node: PluginNode) => boolean;
  execute: (context: PluginContext) => Promise<PluginResult>;
};

export async function executePlugin(plugin: NodePlugin, context: PluginContext) {
  if (!context.groups.length) throw new Error('No groups selected');
  const nodes = new Map(context.nodes.map((node) => [node.id, node]));

  for (const group of context.groups) {
    if (!group.name.trim() || !group.nodeIds.length) throw new Error('Empty group');
    for (const id of group.nodeIds) {
      const node = nodes.get(id);

      if (!node || !plugin.accepts(node)) throw new Error(`Unsupported node: ${id}`);
    }
  }

  return plugin.execute({
    ...context,
    nodes: structuredClone(context.nodes),
    groups: structuredClone(context.groups),
  });
}
