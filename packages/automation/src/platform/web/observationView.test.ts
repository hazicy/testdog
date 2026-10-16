import { expect, it } from 'vitest';
import {
  findAriaNode,
  observationView,
  type AriaNode,
} from '@testdog/automation/platform/web/observationView';

const rows: AriaNode[] = Array.from({ length: 30 }, (_, index) => ({
  role: 'row',
  ref: `e${index + 10}`,
  children: [{ role: 'cell', name: `Label ${index}` }],
}));
const tree: AriaNode[] = [
  { role: 'navigation', ref: 'e1', children: [{ role: 'link', ref: 'e2', name: 'Chatbot' }] },
  {
    role: 'table',
    ref: 'e3',
    children: [
      {
        role: 'rowgroup',
        ref: 'e4',
        children: [{ role: 'row', children: [{ role: 'columnheader', name: 'Label' }] }],
      },
      { role: 'rowgroup', ref: 'e5', children: rows },
    ],
  },
  {
    role: 'generic',
    ref: 'e6',
    children: [
      { role: 'heading', name: 'Import' },
      { role: 'textbox', ref: 'e7', name: 'Label' },
      { role: 'button', ref: 'e8', name: 'Confirm' },
    ],
  },
];

it('provides an expandable overview without hiding unrelated regions or mutating the raw tree', () => {
  const view = observationView(tree);

  expect(findAriaNode(view.tree, 'e5')).toMatchObject({ omittedChildren: 28 });
  expect(findAriaNode(view.tree, 'e4')?.children?.[0].children?.[0].role).toBe('columnheader');
  expect(findAriaNode(view.tree, 'e6')).toBeDefined();
  expect(findAriaNode(view.tree, 'e1')).toBeDefined();
  expect(rows).toHaveLength(30);
  expect(findAriaNode(view.tree, 'e39')).toBeUndefined();
});

it('expands exactly the region chosen by the caller and includes the global overview', () => {
  const view = observationView(tree, 'e5');

  expect(view.region).toBe('e5');
  expect(view.tree).toEqual([tree[1].children![1]]);
  expect(view.tree[0].children).toHaveLength(30);
  expect(findAriaNode(view.overview, 'e6')).toBeDefined();
});

it('returns to the overview for an empty ref and reports a disappeared region using fresh refs', () => {
  expect(observationView(tree, '')).toEqual(observationView(tree));
  expect(observationView(tree, 'e99')).toMatchObject({
    missingRegion: 'e99',
    tree: observationView(tree).tree,
  });
});

it('marks shortened text so the model can request the complete region', () => {
  const long = [{ role: 'paragraph', ref: 'e1', text: 'a'.repeat(500) }];

  expect(observationView(long).tree[0]).toMatchObject({ text: 'a'.repeat(160), truncated: true });
  expect(observationView(long, 'e1').tree[0].text).toHaveLength(500);
});

it('preserves the ref of a region containing a single control', () => {
  const region = [{ role: 'generic', ref: 'e1', children: [{ role: 'textbox', ref: 'e2' }] }];

  expect(findAriaNode(observationView(region).tree, 'e1')).toEqual(region[0]);
});

it('does not omit rows from a group without an expandable ref', () => {
  const group = [{ role: 'rowgroup', children: rows }];

  expect(observationView(group).tree[0].children).toHaveLength(30);
});
