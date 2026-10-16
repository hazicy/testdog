import { afterEach, expect, it, vi } from 'vitest';
import { Workbook } from 'exceljs';
import { executePlugin, type PluginContext, type PluginNode } from './api';
import { excelAcceptance } from './excelAcceptance';
import { runPluginNodes } from './runAdapter';
import type { TestRun } from '@testdog/contracts/runs/types';

const node: PluginNode = {
  id: 'shot',
  type: 'screenshot',
  title: '=UI',
  input: { goal: 'Check UI' },
  output: { status: 'passed' },
  assets: [{ id: 'image', kind: 'screenshot', contentType: 'image/png' }],
};
const context = (): PluginContext => ({
  nodes: [structuredClone(node)],
  groups: [
    { id: 'g1', name: 'UI / mobile', nodeIds: ['shot'] },
    { id: 'g2', name: 'UI / mobile', nodeIds: ['shot'] },
  ],
  readAsset: vi.fn(
    async () =>
      new Blob(
        [
          Uint8Array.from(
            Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
              'base64',
            ),
          ),
        ],
        { type: 'image/png' },
      ),
  ),
});

afterEach(() => vi.unstubAllGlobals());

it('exports genuine XLSX sheets with embedded images, unique names and blank acceptance fields', async () => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }));
  const result = await executePlugin(excelAcceptance, context());
  const file = result.files![0];
  const workbook = new Workbook();

  await workbook.xlsx.load(await file.blob.arrayBuffer());
  expect(workbook.worksheets).toHaveLength(2);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
    'UI   mobile',
    'UI   mobile (1)',
  ]);
  const sheet = workbook.worksheets[0];

  expect(sheet.getCell('A2').value).toBe('=UI');
  expect(sheet.getCell('B2').value).toContain('Check UI');
  expect(sheet.getCell('E2').value).toBe('');
  expect(sheet.getImages()).toHaveLength(1);
});

it('rejects stale selections and propagates missing evidence errors', async () => {
  const stale = context();

  stale.groups[0].nodeIds = ['deleted'];
  await expect(executePlugin(excelAcceptance, stale)).rejects.toThrow('Unsupported node');
  const broken = context();

  broken.readAsset = async () => {
    throw new Error('Evidence missing');
  };

  await expect(executePlugin(excelAcceptance, broken)).rejects.toThrow('Evidence missing');
});

it('protects host data from plugin changes and supports non-screenshot plugins', async () => {
  const original = context();

  await executePlugin(
    {
      id: 'transform',
      accepts: () => true,
      execute: async ({ nodes, groups }) => {
        groups[0].name = 'changed';
        (nodes[0].input as Record<string, unknown>).goal = 'changed';

        return { data: { processed: true } };
      },
    },
    original,
  );
  expect(original.groups[0].name).toBe('UI / mobile');
  expect(original.nodes[0].input.goal).toBe('Check UI');
});

it('associates artifacts through execution identities without mixing other nodes', () => {
  const run = {
    plan: {
      rootId: 'shot',
      nodes: { shot: { id: 'shot', kind: 'task', actionType: 'screenshot', goal: 'UI' } },
    },
    steps: [
      { id: 's1', planNodeId: 'shot' },
      {
        id: 's2',
        title: 'Recorded',
        kind: 'action',
        action: { platform: 'web', action: { type: 'screenshot' } },
      },
    ],
    artifacts: [
      { id: 'a1', stepId: 's1', kind: 'screenshot' },
      { id: 'a2', stepId: 's2', kind: 'screenshot' },
      { id: 'unrelated', kind: 'screenshot' },
    ],
  } as unknown as TestRun;
  const nodes = runPluginNodes(run);

  expect(nodes.map((item) => [item.id, item.type, item.assets.map((asset) => asset.id)])).toEqual([
    ['shot', 'screenshot', ['a1']],
    ['s2', 'screenshot', ['a2']],
  ]);
});

it('exports only grouped screenshots in selection order with isolated evidence and acceptance columns', async () => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1920, height: 1080, close() {} }));
  const fixture = context();
  const nodes: PluginNode[] = ['login', 'order', 'payment', 'unselected'].map((id) => ({
    id,
    type: 'screenshot',
    title: `${id} screenshot`,
    input: { goal: `Capture ${id}` },
    output: { evidence: `${id} captured`, status: 'passed' },
    assets: [{ id: `${id}-image`, kind: 'screenshot', contentType: 'image/png' }],
  }));
  const readAsset = vi.fn(fixture.readAsset);
  const result = await executePlugin(excelAcceptance, {
    nodes: [...nodes, { ...node, id: 'action', type: 'click', title: 'Click submit' }],
    groups: [
      { id: 'checkout', name: '下单验收', nodeIds: ['order', 'login'] },
      { id: 'payment', name: '支付验收', nodeIds: ['payment'] },
    ],
    readAsset,
  });
  const workbook = new Workbook();

  await workbook.xlsx.load(await result.files![0].blob.arrayBuffer());
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['下单验收', '支付验收']);
  expect(readAsset.mock.calls.map(([id]) => id)).toEqual([
    'order-image',
    'login-image',
    'payment-image',
  ]);

  const [checkout, payment] = workbook.worksheets;

  expect(checkout.rowCount).toBe(3);
  expect(checkout.getCell('A2').value).toBe('order screenshot');
  expect(checkout.getCell('A3').value).toBe('login screenshot');
  expect(JSON.parse(String(checkout.getCell('B2').value))).toEqual({ goal: 'Capture order' });
  expect(JSON.parse(String(checkout.getCell('C2').value))).toEqual({
    evidence: 'order captured',
    status: 'passed',
  });
  expect(checkout.getImages()).toHaveLength(2);
  expect(payment.rowCount).toBe(2);
  expect(payment.getCell('A2').value).toBe('payment screenshot');
  expect(payment.getImages()).toHaveLength(1);

  for (const sheet of workbook.worksheets) {
    expect(sheet.getCell('E1').value).toBe('验收结果 / Acceptance');
    expect(sheet.getCell('F1').value).toBe('备注 / Notes');
    for (let row = 2; row <= sheet.rowCount; row++) {
      expect(sheet.getCell(`E${row}`).value).toBe('');
      expect(sheet.getCell(`F${row}`).value).toBe('');
      expect(sheet.getCell(`E${row}`).dataValidation).toMatchObject({
        type: 'list',
        formulae: ['"通过 / Pass,不通过 / Fail"'],
      });
    }
  }
});
