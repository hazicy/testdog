import type { Candidate } from '@testdog/engine/domAgent/types';
import type { AriaNode } from './observationView';

const controls = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'slider',
  'spinbutton',
  'treeitem',
]);
const regions = new Set([
  'row',
  'listitem',
  'group',
  'article',
  'region',
  'dialog',
  'form',
  'navigation',
]);

function textOf(node: AriaNode): string {
  return [node.name, node.text, ...(node.children ?? []).map(textOf)]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 500);
}

/** Reuse Testdog's full DOM accessibility snapshot and current ref registry, before overview compression. */
export function ariaCandidates(tree: AriaNode[], url: string): Candidate[] {
  const result: Candidate[] = [];
  const visit = (nodes: AriaNode[], context = '', disabled = false) => {
    for (const node of nodes) {
      const unavailable = disabled || node.disabled === true;

      if (node.ref && controls.has(node.role))
        result.push({
          id: node.ref,
          role: node.role,
          name: (node.name ?? '').slice(0, 300),
          tag: node.role === 'link' ? 'a' : node.role === 'button' ? 'button' : 'input',
          text: (node.text ?? '').slice(0, 300),
          context,
          href: typeof node.url === 'string' ? node.url.slice(0, 500) : '',
          inputType: ['checkbox', 'radio'].includes(node.role) ? node.role : 'text',
          editable:
            ['textbox', 'searchbox', 'spinbutton'].includes(node.role) ||
            (node.role === 'combobox' && node.editable === true),
          enabled: !unavailable && node.readonly !== true,
          inViewport: true,
          frameUrl: url,
        });
      visit(node.children ?? [], regions.has(node.role) ? textOf(node) : context, unavailable);
    }
  };

  visit(tree);

  return result;
}
