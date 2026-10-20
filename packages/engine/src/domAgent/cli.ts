import { createServer } from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { runDOMAgent } from './agent';
import { createChatPlanner, createJevChooser } from './clients';
import { planSchema, type Chooser, type Planner } from './types';

export const demoHTML = `<!doctype html><html lang="en"><title>DOM Agent demo</title>
<main><h1>Issues</h1><label>Search issues <input id="search"></label>
<table><tbody>
<tr><td>Order #1111</td><td><button onclick="document.querySelector('h1').textContent='Wrong order'">Details</button></td></tr>
<tr><td>Order #1234</td><td><button onclick="document.querySelector('h1').textContent='Order #1234 details';history.pushState({},'', '/orders/1234')">Details</button></td></tr>
</tbody></table></main></html>`;

export const demoPlanner: Planner = async () =>
  planSchema.parse({
    steps: [
      {
        goal: 'Search for bugs',
        action: { kind: 'fill', target: { name: 'Search issues', role: 'textbox' }, value: 'bug' },
        expected: {
          kind: 'value',
          target: { name: 'Search issues', role: 'textbox' },
          value: 'bug',
        },
      },
      // No exact name match forces the Choice layer to resolve repeated buttons using row context.
      {
        goal: 'Open details for Order #1234',
        action: {
          kind: 'click',
          target: {
            name: 'Order details',
            role: 'button',
            keywords: ['Details'],
            context: ['#1234'],
          },
        },
        expected: { kind: 'url', contains: '/orders/1234' },
      },
    ],
    completion: [
      { kind: 'url', contains: '/orders/1234' },
      { kind: 'value', target: { name: 'Search issues', role: 'textbox' }, value: 'bug' },
    ],
  });

// Fixture oracle only: exercises the Choice interface without pretending to measure Jev accuracy.
export const demoChooser: Chooser = async (_step, candidates) => {
  const candidate = candidates.find(
    (item) => item.role === 'button' && item.context.includes('#1234'),
  );

  return candidate ? { kind: 'element', id: candidate.id } : { kind: 'fallback', reason: 'none' };
};

async function main() {
  // Shell variables take precedence; local configuration takes precedence over .env.
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) process.loadEnvFile(file);
  }

  const live = process.argv.includes('--live');

  if (live) {
    const missing = [
      'DOM_AGENT_URL',
      'DOM_AGENT_TASK',
      'DOM_AGENT_ALLOWED_ORIGINS',
      'DOM_AGENT_LLM_KEY',
      'DOM_AGENT_LLM_ENDPOINT',
      'DOM_AGENT_LLM_MODEL',
      'JEV_API_KEY',
    ].filter((name) => !process.env[name]?.trim());

    if (missing.length)
      throw new Error(
        `Missing live configuration: ${missing.join(', ')}\nSet these variables in .env.local or export them in your shell.\nSee packages/engine/src/domAgent/README.md.\nFor the no-key demo, run: pnpm dom-agent --headed`,
      );
  }

  const server = live
    ? undefined
    : createServer((_request, response) => {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(demoHTML);
      });

  if (server) {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
  }

  let browser;

  try {
    const address = server?.address();
    const url = live
      ? required('DOM_AGENT_URL')
      : `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    const task = live ? required('DOM_AGENT_TASK') : 'Search bugs and open details for Order #1234';
    const allowedOrigins = live
      ? required('DOM_AGENT_ALLOWED_ORIGINS')
          .split(',')
          .map((value) => new URL(value.trim()).origin)
      : [new URL(url).origin];
    const planner = live
      ? createChatPlanner({
          apiKey: required('DOM_AGENT_LLM_KEY'),
          endpoint: required('DOM_AGENT_LLM_ENDPOINT'),
          model: required('DOM_AGENT_LLM_MODEL'),
        })
      : demoPlanner;
    const chooser = live
      ? createJevChooser({
          apiKey: required('JEV_API_KEY'),
          endpoint: process.env.JEV_ENDPOINT,
          model: process.env.JEV_MODEL,
        })
      : demoChooser;

    browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    if (!allowedOrigins.includes(new URL(url).origin))
      throw new Error('Initial URL is outside allowed origins');
    await page.goto(url);
    const result = await runDOMAgent(page, task, {
      planner,
      chooser,
      allowedOrigins,
      // Live execution requires a host-maintained allowlist; page/model text cannot grant permission.
      authorize: async ({ action, candidate }) =>
        !live ||
        action.kind === 'wait' ||
        action.kind === 'scroll' ||
        action.kind === 'navigate' ||
        Boolean(
          candidate &&
          JSON.parse(process.env.DOM_AGENT_ALLOWED_TARGETS ?? '[]').includes(
            `${action.kind}:${candidate.role}:${candidate.name}`,
          ),
        ),
      onEvent: (event) => console.log(JSON.stringify(event)),
    });

    console.log(JSON.stringify(result));
  } finally {
    await browser?.close();
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  }
}

function required(name: string) {
  const value = process.env[name];

  if (!value) throw new Error(`Missing ${name}`);

  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
