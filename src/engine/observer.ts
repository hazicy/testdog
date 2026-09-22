import { Page } from 'playwright';

type AriaNode = {
  role: string;
  name?: string;
  text?: string;
  ref?: string;
  children?: AriaNode[];
  [key: string]: unknown;
};

type AriaTree = Record<string, AriaNode[]>;

const INTERACTIVE_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'treeitem',
]);

// These roles help an agent understand where it is, even when they have no ref.
const CONTEXT_ROLES = new Set([
  'alert',
  'alertdialog',
  'banner',
  'cell',
  'columnheader',
  'dialog',
  'grid',
  'heading',
  'list',
  'listitem',
  'main',
  'navigation',
  'region',
  'row',
  'rowheader',
  'status',
  'table',
  'tabpanel',
]);

const DECORATIVE_ROLES = new Set(['none', 'presentation']);

export class Observer {
  constructor() {}

  async observe(page: Page) {
    const rawTree = (await page.locator('body').ariaSnapshotJSON({
      mode: 'ai',
    })) as AriaTree;

    return { tree: this.filter(rawTree), rawTree };
  }

  /**
   * Removes ARIA nodes that only mirror DOM layout.  A node with a Playwright
   * ref is never removed: it may be the only reliable target for an action.
   * When an unhelpful container has useful descendants, its descendants are
   * promoted instead of being discarded.
   */
  filter(tree: AriaNode[]): AriaNode[];
  filter(tree: AriaTree): AriaTree;
  filter(tree: AriaNode[] | AriaTree): AriaNode[] | AriaTree {
    if (Array.isArray(tree)) return this.filterNodes(tree);

    return Object.fromEntries(
      Object.entries(tree).map(([key, nodes]) => [key, this.filterNodes(nodes)]),
    );
  }

  private filterNodes(nodes: AriaNode[]): AriaNode[] {
    return nodes.flatMap((node) => this.filterNode(node));
  }

  private filterNode(node: AriaNode): AriaNode[] {
    const children = node.children ? this.filterNodes(node.children) : [];
    const name = this.cleanText(node.name);
    const text = this.cleanText(node.text);
    const hasContent = Boolean(name || text);
    const hasRef = typeof node.ref === 'string' && node.ref.length > 0;
    const isUseful =
      hasRef ||
      INTERACTIVE_ROLES.has(node.role) ||
      CONTEXT_ROLES.has(node.role) ||
      (hasContent && !DECORATIVE_ROLES.has(node.role));

    // Drop empty presentation/layout wrappers, but keep their useful children.
    if (!isUseful) return children;

    const filtered: AriaNode = { ...node };
    if (name) filtered.name = name;
    else delete filtered.name;
    if (text) filtered.text = text;
    else delete filtered.text;
    if (children.length > 0) filtered.children = children;
    else delete filtered.children;

    return [filtered];
  }

  private cleanText(value: string | undefined): string | undefined {
    const text = value?.replace(/\s+/g, ' ').trim();
    return text || undefined;
  }
}
