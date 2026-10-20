export type AriaNode = {
  role: string;
  name?: string;
  text?: string;
  ref?: string;
  children?: AriaNode[];
  [key: string]: unknown;
};

export function findAriaNode(tree: unknown, ref: string): AriaNode | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const match = findAriaNode(child, ref);

      if (match) return match;
    }

    return;
  }

  if (!tree || typeof tree !== 'object') return;
  const node = tree as AriaNode;

  return node.ref === ref ? node : findAriaNode(node.children, ref);
}

function summarize(node: AriaNode): AriaNode {
  const overview: AriaNode = { ...node };
  const children = node.children;

  delete overview.children;

  for (const key of ['name', 'text'] as const) {
    const value = overview[key];

    if (value && value.length > 160) {
      overview[key] = value.slice(0, 160);
      overview.truncated = true;
    }
  }

  if (!children?.length) return overview;
  let rows = 0;
  const retained = children.filter((child) => {
    // Preserve table structure and headers while making repeated data explicit
    // and expandable through the rowgroup's real ref.
    if (
      node.role !== 'rowgroup' ||
      !node.ref ||
      child.role !== 'row' ||
      child.children?.some((cell) => cell.role === 'columnheader')
    )
      return true;

    return ++rows <= 2;
  });

  if (retained.length !== children.length)
    overview.omittedChildren = children.length - retained.length;
  overview.children = retained.map(summarize);

  return overview;
}

// This projection only compresses representation. The model chooses which
// subtree to expand; no role, CSS class or stacking rule chooses it on its behalf.
export function observationView(tree: AriaNode[], ref?: string) {
  const overview = tree.map(summarize);

  if (!ref) return { tree: overview };
  const region = findAriaNode(tree, ref);

  if (!region) return { tree: overview, missingRegion: ref };

  return { tree: [region], overview, region: ref };
}
