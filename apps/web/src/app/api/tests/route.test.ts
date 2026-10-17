import { afterAll, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@/server/shared/auth', () => ({ requireUserId: async () => null }));
vi.mock('@testdog/server/db', async () => {
  const result = await (await import('@testdog/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
import { POST, GET } from '@/app/api/tests/route';
import { PATCH as RENAME } from '@/app/api/tests/[id]/name/route';
import { PATCH, DELETE } from '@/app/api/tests/[id]/route';

afterAll(() => isolated.client?.close());

it('rejects removed input configuration without saving the case', async () => {
  const response = await POST(
    new Request('http://localhost/api/tests', {
      method: 'POST',
      body: JSON.stringify({
        name: 'References',
        goal: '填写姓名',
        target: { platform: 'web', url: 'https://example.com', inputs: {} },
        url: 'https://example.com',
      }),
    }),
  );

  expect(response.status).toBe(400);
  expect((await response.json()).message).toBeTruthy();
});

it.each(['ios', 'android'] as const)(
  'creates, edits, and lists a %s case without a website URL',
  async (platform) => {
    const target = {
      schemaVersion: 1,
      platform,
      appId: 'com.example.app',
      deviceProfileId: 'phone',
      resetPolicy: 'preserve',
    };
    const body = { name: 'Native case', goal: 'Open app', tags: [], target };
    const response = await POST(
      new Request('http://localhost/api/tests', { method: 'POST', body: JSON.stringify(body) }),
    );

    expect(response.status).toBe(201);
    const { test } = await response.json();

    expect(test.url).toBe('');
    expect(test.target).toMatchObject(target);
    const context = { params: Promise.resolve({ id: test.id }) };
    // Editing may submit either the UI payload or the normalized stored record.
    const updated = await PATCH(
      new Request('http://localhost/api/tests/' + test.id, {
        method: 'PATCH',
        body: JSON.stringify({ ...body, url: test.url, name: 'Edited native case' }),
      }),
      context,
    );

    expect(updated.status).toBe(200);
    expect((await updated.json()).test.name).toBe('Edited native case');
    expect((await (await GET(new Request('http://localhost/api/tests'))).json()).tests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: test.id, target: expect.objectContaining({ platform }) }),
      ]),
    );
    expect(
      (
        await DELETE(
          new Request('http://localhost/api/tests/' + test.id, { method: 'DELETE' }),
          context,
        )
      ).status,
    ).toBe(200);
  },
);

it.each(['', 'bad url', 'javascript:alert(1)'])(
  'returns validation errors rather than database errors for invalid web URL %j',
  async (url) => {
    const response = await POST(
      new Request('http://localhost/api/tests', {
        method: 'POST',
        body: JSON.stringify({ name: 'Invalid web', goal: 'Check', url }),
      }),
    );

    expect(response.status).toBe(400);
  },
);

it('renames a case without replacing its contents and rejects unrelated fields', async () => {
  const original = { name: 'Original', goal: 'Keep the newer steps', url: 'https://example.com' };
  const created = await POST(
    new Request('http://localhost/api/tests', { method: 'POST', body: JSON.stringify(original) }),
  );
  const { test } = await created.json();
  const context = { params: Promise.resolve({ id: test.id }) };
  const response = await RENAME(
    new Request('http://localhost/api/tests/' + test.id + '/name', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed' }),
    }),
    context,
  );

  expect(response.status).toBe(200);
  expect((await response.json()).test).toMatchObject({ name: 'Renamed', goal: original.goal });
  const invalid = await RENAME(
    new Request('http://localhost/api/tests/' + test.id + '/name', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Invalid', goal: 'Overwrite' }),
    }),
    context,
  );

  expect(invalid.status).toBe(400);
});
