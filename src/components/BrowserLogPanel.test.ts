import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { BrowserLogPanel } from './BrowserLogPanel';
import type { BrowserLog } from '@/workspace/types';

it('renders saved console and network records with expandable details', () => {
  const base = {
    at: '2026-10-10T00:00:00Z',
    elapsedMs: 1234,
    pageId: 'page-2',
    pageUrl: 'https://example.com',
  };
  const logs: BrowserLog[] = [
    { ...base, id: 'console', kind: 'console', level: 'error', message: 'Page crashed <script>' },
    {
      ...base,
      id: 'network',
      kind: 'network',
      method: 'POST',
      url: 'https://example.com/api',
      status: 503,
      durationMs: 42,
      failure: 'connection closed',
    },
  ];
  const console = renderToStaticMarkup(createElement(BrowserLogPanel, { logs, kind: 'console' }));
  expect(console).toContain('Page crashed &lt;script&gt;');
  expect(console).toContain('page-2');
  expect(console).not.toContain('https://example.com/api');
  const network = renderToStaticMarkup(createElement(BrowserLogPanel, { logs, kind: 'network' }));
  expect(network).toContain('503');
  expect(network).toContain('https://example.com/api');
  expect(network).toContain('connection closed');
  expect(network).toContain('<details');
});
