import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createId } from './id';

afterEach(() => vi.unstubAllGlobals());

it('uses the native UUID method when available', () => {
  const randomUUID = vi.fn(() => '8bf1c22b-23a7-4ff2-a2f5-c49bb718af51');

  vi.stubGlobal('crypto', { randomUUID });
  expect(createId()).toBe('8bf1c22b-23a7-4ff2-a2f5-c49bb718af51');
  expect(randomUUID).toHaveBeenCalledOnce();
});

it('generates distinct valid v4 UUIDs without randomUUID', () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);

  vi.stubGlobal('crypto', { getRandomValues });
  const ids = Array.from({ length: 256 }, createId);

  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) {
    expect(z.uuidv4().safeParse(id).success).toBe(true);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  }
});
