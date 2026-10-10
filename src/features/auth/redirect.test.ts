import { expect, test } from 'vitest';
import { safeCallbackURL } from './redirect';

test('preserves local destinations and rejects external URLs and auth loops', () => {
  expect(safeCallbackURL('/runs/abc?tab=logs')).toBe('/runs/abc?tab=logs');
  for (const value of [
    undefined,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/login',
    '/register?next=x',
    '/api/runs',
    '/\n/evil.example',
  ])
    expect(safeCallbackURL(value)).toBe('/cases');
});
