import type { Locator, Page } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { StagehandClient } from '../stagehand/client';

export interface AbilityOptions {
  page: Page;
  /**
   * The DOM boundary established by the preceding step. When present, every
   * semantic lookup and action is limited to this subtree.
   */
  locator?: Locator;
}

export class Abilities {
  constructor(private stage: StagehandClient) {}

  async assert(condition: string, options: AbilityOptions) {
    const deadline = Date.now() + 30_000;
    await options.page.waitForLoadState('domcontentloaded', 30_000);
    let message = '等待页面满足条件超时';

    while (Date.now() < deadline) {
      const result = await this.stage.client.extract(
        `Check whether this condition is satisfied on the current page: ${JSON.stringify(condition)}. ` +
          'Use only evidence from the current page. If evidence is missing or ambiguous, return passed=false. ' +
          'Explain the observed evidence in message. Do not assume a previous action succeeded.',
        z.object({
          passed: z.boolean(),
          message: z.string(),
        }),
        {
          page: options.page,
          ...(options.locator ? { locator: options.locator } : {}),
          cache: false,
          timeout: deadline - Date.now(),
        },
      );
      if (result.data.passed) return result;
      message = result.data.message;

      const remaining = deadline - Date.now();
      if (remaining > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1000, remaining)),
        );
      }
    }

    throw new Error(`断言失败：${condition}；${message}`);
  }

  async navigate(url: string, options: AbilityOptions) {
    const result = await options.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    });

    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve('');
      }, 3000);
    });

    return result;
  }

  async observe(instruction: string, options: AbilityOptions) {
    const result = await this.stage.client.observe(instruction, {
      page: options.page,
      ...(options.locator ? { locator: options.locator } : {}),
      timeout: 5000,
      // A recovery attempt must inspect the current DOM. Reusing an observation
      // can point at an element that disappeared after the previous attempt.
      cache: false,
    });

    if (result.data.length > 0 || !options.locator) return result;

    // Menus and listboxes are often rendered through a portal outside their
    // parent dialog. Retry only for a visible foreground overlay, never for a
    // similarly named control on the background page.
    return this.stage.client.observe(
      `${instruction}\nThe active region contained no match. Search only a visible foreground popup, menu, listbox, or overlay that may be rendered outside the active region. Never return a background-page element.`,
      {
        page: options.page,
        timeout: 5000,
        cache: false,
      },
    );
  }

  async fill(description: string, value: string, options: AbilityOptions) {
    const { data: actions } = await this.observe(
      `Find the input to fill described as ${JSON.stringify(description)}.`,
      options,
    );
    if (actions.length !== 1) {
      throw new Error(`填写失败：期望唯一目标，找到 ${actions.length} 个候选`);
    }

    const result = await this.stage.client.act(
      { ...actions[0], method: 'fill', arguments: [value] },
      {
        page: options.page,
        ...(options.locator ? { locator: options.locator } : {}),
      },
    );
    if (!result.data.success) {
      throw new Error(`填写失败：${result.data.message}`);
    }
    return result;
  }

  async press(description: string, key: string, options: AbilityOptions) {
    const { data: actions } = await this.observe(
      `Find the actual input or focusable control described as ${JSON.stringify(description)} to receive a keyboard key. Return the input itself, never a suggestion or icon.`, options,
    );
    if (actions.length !== 1) throw new Error(`按键失败：期望唯一目标，找到 ${actions.length} 个候选`);
    await options.page.locator(actions[0].selector).click();
    await options.page.keyPress(key);
  }

  async pages() {
    return this.stage.client.browser.context.pages();
  }

  async click(description: string, options: AbilityOptions) {
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve('');
      }, 3000);
    });

    const { data: actions } = await this.observe(
      `Click the element described as ${JSON.stringify(description)}. Return the semantic interactive control itself: a button, link, input, option, menuitem, or element with an interactive ARIA role. Never return a decorative or nested descendant such as svg, path, icon, span, div, or the button's icon. If this is a dropdown, listbox, or menu option, return the visible option itself (for example an option or menuitem) from the expanded list. Never return the combobox, input, trigger button, or a container when the requested target is an option.`,
      options,
    );
    if (actions.length !== 1) {
      throw new Error(`点击失败：期望唯一目标，找到 ${actions.length} 个候选`);
    }

    console.info('执行点击候选', {
      requested: description,
      observed: actions[0].description,
      selector: actions[0].selector,
    });

    const result = await this.stage.client.act(
      { ...actions[0], method: 'click', arguments: [] },
      {
        page: options.page,
        ...(options.locator ? { locator: options.locator } : {}),
      },
    );
    if (!result.data.success) {
      throw new Error(`点击失败：${result.data.message}`);
    }

    return result;
  }
}
