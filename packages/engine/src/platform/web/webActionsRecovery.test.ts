import { beforeEach, expect, it, vi } from 'vitest';
import type { Page } from 'playwright';
import { executeWebAction } from '@testdog/engine/platform/web/webActions';
import { ReplanRequiredError } from '@testdog/engine/replanning';

const { click } = vi.hoisted(() => ({ click: vi.fn() }));

vi.mock('@testdog/engine/platform/web/webLocator', () => ({
  locateWebElement: () => ({ click }),
}));

beforeEach(() => {
  click.mockReset();
});

it.each([
  'click action done\nwaiting for scheduled navigations to finish',
  'performing click action',
  'performing tap action',
])('does not recover if the call log indicates input might have been sent: %s', async (log) => {
  const error = Object.assign(new Error(`Timeout\nintercepts pointer events\n${log}`), {
    name: 'TimeoutError',
  });

  click.mockRejectedValue(error);
  await expect(
    executeWebAction({} as Page, {
      type: 'click',
      target: { kind: 'css', value: '#submit', name: '' },
      value: '',
    }),
  ).rejects.toBe(error);
  expect(error).not.toBeInstanceOf(ReplanRequiredError);
});

it('does not recover ordinary locator timeouts', async () => {
  const error = Object.assign(new Error('Timeout waiting for locator'), { name: 'TimeoutError' });

  click.mockRejectedValue(error);
  await expect(
    executeWebAction({} as Page, {
      type: 'click',
      target: { kind: 'css', value: '#submit', name: '' },
      value: '',
    }),
  ).rejects.toBe(error);
});
