import { expect, it } from 'vitest';
import { ariaCandidates } from './ariaCandidates';

it('builds repeated-control candidates with nearest row context and disabled state', () => {
  const result = ariaCandidates(
    [
      { role: 'row', name: 'Order #1234', children: [{ role: 'button', name: 'Bug', ref: 'e1' }] },
      { role: 'group', disabled: true, children: [{ role: 'button', name: 'Bug', ref: 'e2' }] },
      { role: 'heading', name: 'Issues', ref: 'e3' },
    ],
    'https://example.test',
  );

  expect(result).toHaveLength(2);
  expect(result[0].context).toContain('#1234');
  expect(result[1].enabled).toBe(false);
});

it('only allows editable input controls to receive fill', () => {
  const candidates = ariaCandidates(
    [
      { role: 'combobox', name: 'Search', ref: 'e1', editable: true },
      { role: 'combobox', name: 'Choose', ref: 'e2' },
      { role: 'textbox', name: 'Read only', ref: 'e3', readonly: true },
    ],
    'https://example.test',
  );

  expect(candidates).toMatchObject([
    { id: 'e1', editable: true, enabled: true },
    { id: 'e2', editable: false, enabled: true },
    { id: 'e3', editable: true, enabled: false },
  ]);
});
