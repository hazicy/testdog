import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BrowserLog } from '@testdog/contracts/runs/types';

const transport = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/client/api', () => ({ api: { get: transport.get } }));
import { downloadRunReport } from '@/client/download';

let blob: Blob | undefined;
const click = vi.fn();
const log: BrowserLog = {
  id: 'console',
  kind: 'console',
  at: '2026-10-12T00:00:00Z',
  elapsedMs: 0,
  pageId: 'page-1',
  pageUrl: 'https://example.com',
  message: 'hello',
};

beforeEach(() => {
  vi.useFakeTimers();
  transport.get.mockReset();
  click.mockReset();
  blob = undefined;
  vi.stubGlobal('document', {
    body: { append: vi.fn() },
    createElement: () => ({ click, remove: vi.fn() }),
  });
  vi.spyOn(URL, 'createObjectURL').mockImplementation((content) => {
    blob = content as Blob;

    return 'blob:report';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const response = (data: unknown) => ({ json: async () => data });

it('exports all log pages in persistence order without requesting logs through details', async () => {
  const network: BrowserLog = { ...log, id: 'network', kind: 'network', status: 200 };

  transport.get
    .mockReturnValueOnce(response({ run: { id: 'run', steps: [] } }))
    .mockReturnValueOnce(response({ logs: [log], nextCursor: '100' }))
    .mockReturnValueOnce(response({ logs: [network], nextCursor: null }));
  await downloadRunReport('run');

  expect(transport.get.mock.calls.map(([url]) => url)).toEqual([
    '/api/runs/run',
    '/api/runs/run/logs?kind=all&limit=100',
    '/api/runs/run/logs?kind=all&limit=100&cursor=100',
  ]);
  expect(JSON.parse(await blob!.text())).toEqual({
    id: 'run',
    steps: [],
    browserLogs: [log, network],
  });
  expect(click).toHaveBeenCalledOnce();
});

it('fails without downloading a partial report when a later log page fails, and permits retry', async () => {
  transport.get
    .mockReturnValueOnce(response({ run: { id: 'run' } }))
    .mockReturnValueOnce(response({ logs: [log], nextCursor: '100' }))
    .mockReturnValueOnce({
      json: async () => {
        throw new Error('日志暂时不可用');
      },
    });
  await expect(downloadRunReport('run')).rejects.toThrow('日志暂时不可用');
  expect(click).not.toHaveBeenCalled();
  expect(blob).toBeUndefined();
  transport.get
    .mockReturnValueOnce(response({ run: { id: 'run' } }))
    .mockReturnValueOnce(response({ logs: [log], nextCursor: null }));
  await downloadRunReport('run');
  expect(JSON.parse(await blob!.text())).toEqual({ id: 'run', browserLogs: [log] });
});
