import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDOMAgent, PolicyDenied } from './agent';
import { createJevChooser } from './clients';
import { demoChooser, demoHTML, demoPlanner } from './cli';
import { extractDOM } from './dom';
import { recall } from './recall';
import { planSchema, targetSchema, type Candidate } from './types';

const base: Candidate = {
  id: 'e1',
  name: 'Refund',
  tag: 'button',
  role: 'button',
  text: 'Refund',
  context: 'Order #1111',
  href: '',
  inputType: 'text',
  editable: false,
  enabled: true,
  inViewport: true,
  frameUrl: 'https://example.test',
};

describe('candidate recall', () => {
  it('recalls a late repeated button by row context before truncating', () => {
    const target = targetSchema.parse({ name: 'Refund', context: ['#1234'] });
    const candidates = Array.from({ length: 500 }, (_, index) => ({ ...base, id: `e${index}` }));

    candidates[499].context = 'Order #1234';
    expect(recall(target, { kind: 'click', target }, candidates, 20)[0].id).toBe('e499');
  });

  it('hard filters disabled and incompatible elements', () => {
    const target = targetSchema.parse({ name: 'Refund' });

    expect(recall(target, { kind: 'fill', target, value: 'x' }, [base])).toEqual([]);
    expect(recall(target, { kind: 'click', target }, [{ ...base, enabled: false }])).toEqual([]);
  });
});

describe('Jev contract', () => {
  it('pins the official model ID and validates IDs and confidence', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: {
            target: { type: 'choice', choice: 'e1', confidence: 0.9, probabilities: { e1: 1 } },
          },
        }),
      ),
    );
    const choose = createJevChooser({ apiKey: 'test', fetch: request });
    const step = (
      await demoPlanner(
        { task: '', url: '', candidates: [], history: [] },
        new AbortController().signal,
      )
    ).steps[1];
    const candidates = [{ ...base, score: 1 }];

    expect(
      await choose(step, candidates, 'https://example.test', new AbortController().signal),
    ).toEqual({ kind: 'element', id: 'e1' });
    expect(JSON.parse(request.mock.calls[0][1]!.body as string).model).toBe('jev-1.14.0');
    request.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          answers: {
            target: {
              type: 'choice',
              choice: 'invented',
              confidence: 1,
              probabilities: { invented: 1 },
            },
          },
        }),
      ),
    );
    await expect(
      choose(step, candidates, 'https://example.test', new AbortController().signal),
    ).rejects.toThrow('unknown ID');
    request.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          answers: {
            target: { type: 'choice', choice: 'e1', confidence: 0.1, probabilities: { e1: 1 } },
          },
        }),
      ),
    );
    expect(
      await choose(step, candidates, 'https://example.test', new AbortController().signal),
    ).toEqual({ kind: 'fallback', reason: 'uncertain' });
  });
});

describe('browser loop', () => {
  let browser: Browser;
  let page: Page;
  const origin = 'http://dom-agent.test';

  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  async function fixture(html = demoHTML) {
    const context = await browser.newContext({ serviceWorkers: 'block' });

    page = await context.newPage();
    await context.route(`${origin}/**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.goto(origin);

    return context;
  }

  it('runs deterministic fill, contextual Choice, and completion verification', async () => {
    const context = await fixture();
    const planner = vi.fn(demoPlanner);
    const chooser = vi.fn(demoChooser);

    try {
      const result = await runDOMAgent(page, 'demo', {
        planner,
        chooser,
        authorize: async () => true,
        allowedOrigins: [origin],
      });

      expect(result.completed).toBe(true);
      expect(planner).toHaveBeenCalledTimes(1);
      expect(chooser).toHaveBeenCalledTimes(1);
      expect(page.url()).toContain('/orders/1234');
    } finally {
      await context.close();
    }
  });

  it('refreshes candidates after abstention without replanning', async () => {
    const context = await fixture();
    const chooser = vi.fn(demoChooser).mockResolvedValueOnce({ kind: 'fallback', reason: 'none' });

    try {
      const result = await runDOMAgent(page, 'demo', {
        planner: demoPlanner,
        chooser,
        authorize: async () => true,
        allowedOrigins: [origin],
      });

      expect(result.replans).toBe(0);
      expect(chooser).toHaveBeenCalledTimes(2);
      expect(chooser.mock.calls[0][1][0].id).not.toBe(chooser.mock.calls[1][1][0].id);
    } finally {
      await context.close();
    }
  });

  it('extracts labels, open shadow DOM, and frames, omits hidden nodes', async () => {
    const context =
      await fixture(`<label for="q">Query</label><input id="q"><button hidden>Hidden</button>
      <div id="shadow"></div><iframe srcdoc="<button>Frame action</button>"></iframe>
      <script>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<button>Shadow action</button>'</script>`);

    try {
      const snapshot = await extractDOM(page);

      expect(snapshot.candidates.map((c) => c.name)).toEqual(
        expect.arrayContaining(['Query', 'Shadow action', 'Frame action']),
      );
      expect(snapshot.candidates.some((c) => c.name === 'Hidden')).toBe(false);
      const handle = snapshot.registry.get(
        snapshot.candidates.find((c) => c.name === 'Shadow action')!.id,
      )!;

      await page.locator('#shadow').evaluate((node) => {
        node.shadowRoot!.innerHTML = '<button>Replacement</button>';
      });
      expect(await handle.evaluate((node) => node.isConnected)).toBe(false);
      await snapshot.dispose();
    } finally {
      await context.close();
    }
  });

  it('rejects actions through host policy before clicking', async () => {
    const context = await fixture();

    try {
      await expect(
        runDOMAgent(page, 'demo', {
          planner: demoPlanner,
          chooser: demoChooser,
          authorize: async () => false,
          allowedOrigins: [origin],
        }),
      ).rejects.toBeInstanceOf(PolicyDenied);
      expect(await page.locator('input').inputValue()).toBe('');
    } finally {
      await context.close();
    }
  });

  it('does not repeat a dispatched click after verification failure', async () => {
    const context = await fixture(
      `<button onclick="this.dataset.clicks=String(Number(this.dataset.clicks||0)+1)">Send</button>`,
    );
    const planner = vi.fn(async () =>
      planSchema.parse({
        steps: [
          {
            goal: 'Send',
            action: { kind: 'click', target: { name: 'Send' } },
            expected: { kind: 'url', contains: '/sent' },
          },
        ],
        completion: [{ kind: 'url', contains: '/sent' }],
      }),
    );

    try {
      await expect(
        runDOMAgent(page, 'send', {
          planner,
          chooser: demoChooser,
          authorize: async () => true,
          allowedOrigins: [origin],
          verificationMs: 50,
        }),
      ).rejects.toThrow('unreconciled');
      expect(await page.locator('button').getAttribute('data-clicks')).toBe('1');
      expect(planner).toHaveBeenCalledTimes(2);
    } finally {
      await context.close();
    }
  });

  it('replans only after local exhaustion and preserves original completion', async () => {
    const context = await fixture();
    const planner = vi.fn(demoPlanner);
    const initial = await demoPlanner(
      { task: '', url: '', candidates: [], history: [] },
      new AbortController().signal,
    );
    const revised = {
      steps: [],
      completion: [{ kind: 'url' as const, contains: 'dom-agent.test' }],
    };
    const chooser = vi.fn(demoChooser).mockResolvedValue({ kind: 'fallback', reason: 'none' });

    planner.mockResolvedValueOnce(initial).mockResolvedValue(revised);
    try {
      await expect(
        runDOMAgent(page, 'demo', {
          planner,
          chooser,
          authorize: async () => true,
          allowedOrigins: [origin],
          localAttempts: 2,
          maxReplans: 1,
          verificationMs: 50,
        }),
      ).rejects.toThrow('DOM Agent failed');
      expect(chooser).toHaveBeenCalledTimes(2);
      expect(planner).toHaveBeenCalledTimes(2);
      expect(planner.mock.calls[1][0].completion).toEqual(initial.completion);
      expect(planner.mock.calls[1][0].failure).toContain('Local recovery exhausted');
    } finally {
      await context.close();
    }
  });
});
