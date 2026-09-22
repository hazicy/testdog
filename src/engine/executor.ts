import { randomUUID } from 'node:crypto';
import type { Locator, Page } from 'playwright';
import { jev } from '../ai/provider/jev';
import { RollingCaseCompiler, Target, type Flow, type Step } from './compiler';
import { Observer } from './observer';
import { logger } from '@/lib/logger';

export class Executor {
  constructor(private observer = new Observer()) {}

  async record(goal: string, page: Page, planner = new RollingCaseCompiler()): Promise<Flow> {
    const steps: Step[] = [];

    while (true) {
      const { tree, rawTree } = await this.observer.observe(page);

      const decision = await planner.planNext({
        goal,
        tree: rawTree,
        steps,
      });

      logger.info(decision);

      let { step } = decision;

      if (!step) {
        break;
      }

      page = await this.execute(page, step);

      await page.waitForTimeout(3000);
      steps.push(step);
    }

    return {
      version: 1,
      id: randomUUID(),
      goal,
      createdAt: new Date().toISOString(),
      steps,
      final: null,
    };
  }

  async execute(page: Page, step: Step): Promise<Page> {
    if (step.type === 'navigate') {
      await page.goto(step.value, { waitUntil: 'domcontentloaded' });
    } else if (step.type === 'click') {
      const target = this.locate(page, step.target);
      await target.click();
    } else if (step.type === 'fill') {
      const target = this.locate(page, step.target);
      await target.fill(step.value);
    } else if (step.type === 'press') {
      const target = this.locate(page, step.target);
      await target.press(step.value);
    }

    return page;
  }

  locate(page: Page, target: Target): Locator {
    const root = target?.scope ? page.locator(target?.scope) : page.locator(':root');
    let result: Locator;

    switch (target.kind) {
      case 'role':
        result = root.getByRole(
          target.value as Parameters<Page['getByRole']>[0],
          target.name ? { name: target.name, exact: true } : {},
        );
        break;
      case 'label':
        result = root.getByLabel(target.value, { exact: true });
        break;
      case 'placeholder':
        result = root.getByPlaceholder(target.value, { exact: true });
        break;
      case 'testId':
        result = root.getByTestId(target.value);
        break;
      case 'css':
        if (!target.value || /xpath=|^\/|nth-child|nth-of-type/.test(target.value))
          throw new Error('不接受绝对路径或 DOM 序号定位');
        result = root.locator(target.value);
        break;
      case 'ariaRef':
        result = page.locator(`aria-ref=${target.value}`);
        break;
    }
    return target.index < 0 ? result : result.nth(target.index);
  }
}
