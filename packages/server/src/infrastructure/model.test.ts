import { afterEach, expect, it, vi } from 'vitest';
import { modelClient } from './model';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('@testdog/engine/llm/deepseek', () => ({ deepseekClient: { generate } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  generate.mockReset();
});

it('routes ordinary model calls to the existing LLM adapter', async () => {
  const params = { messages: [] };

  generate.mockResolvedValue({ content: { text: 'plan' } });
  expect(await modelClient.generate(params)).toEqual({ content: { text: 'plan' } });
  expect(generate).toHaveBeenCalledWith(params);
});

it('routes Choice to TypeSafe with its configured model and preserves usage', async () => {
  vi.stubEnv('JEV_API_KEY', 'test-key');
  vi.stubEnv('JEV_MODEL', 'jev-1.14.0');
  vi.stubEnv('JEV_ENDPOINT', 'https://typesafe.test/v1/systemone');
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        model: 'jev-1.14.0',
        answers: {
          target: { type: 'choice', choice: 'e1', confidence: 1, probabilities: { e1: 1 } },
        },
        usage: { input_tokens: 12, output_tokens: 3 },
      }),
    ),
  );

  vi.stubGlobal('fetch', request);
  const result = await modelClient.generate({
    provider: 'jev',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: JSON.stringify({
            model: 'ignored',
            state: { goal: 'Issues' },
            questions: {
              target: { type: 'choice', instructions: 'Select', criteria: { e1: 'Issues' } },
            },
          }),
        },
      },
    ],
  });

  expect(request.mock.calls[0][0]).toBe('https://typesafe.test/v1/systemone');
  expect(JSON.parse(request.mock.calls[0][1]!.body as string).model).toBe('jev-1.14.0');
  expect(result).toMatchObject({
    model: 'jev-1.14.0',
    usage: { inputTokens: 12, outputTokens: 3 },
  });
  expect(generate).not.toHaveBeenCalled();
});

it('retains HTTP status for the shared budget retry policy', async () => {
  vi.stubEnv('JEV_API_KEY', 'test-key');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
  await expect(
    modelClient.generate({
      provider: 'jev',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: JSON.stringify({ state: {}, questions: {} }),
          },
        },
      ],
    }),
  ).rejects.toMatchObject({ status: 429 });
});
