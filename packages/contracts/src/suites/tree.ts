export function descendantSuiteIds(nodes: { id: string; parentId: string | null }[], root: string) {
  const children = new Map<string, string[]>();

  for (const node of nodes)
    if (node.parentId) {
      const siblings = children.get(node.parentId) ?? [];

      siblings.push(node.id);
      children.set(node.parentId, siblings);
    }

  const ids = new Set<string>();
  const pending = [root];

  while (pending.length) {
    const id = pending.pop()!;

    if (ids.has(id)) continue;
    ids.add(id);
    pending.push(...(children.get(id) ?? []));
  }

  return ids;
}

export function suiteFolderPath(
  nodes: { id: string; parentId: string | null; name: string }[],
  id: string,
) {
  const names: string[] = [];
  const visited = new Set<string>();
  let current: string | null = id;

  while (current && !visited.has(current)) {
    visited.add(current);
    const folder = nodes.find((node) => node.id === current);

    if (!folder) break;
    names.unshift(folder.name);
    current = folder.parentId;
  }

  return names.join(' / ');
}
