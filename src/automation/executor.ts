import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import { Abilities } from './abilities';
import { RollingCaseCompiler, type Flow, type Step } from './compiler';
async function observe(page: Page) {
  const tree = await page.locator('body').ariaSnapshot();
  const elements = await page
    .locator('input,button,a,[role],[data-testid],video,iframe')
    .evaluateAll((nodes) =>
      nodes
        .filter((el) => el.getClientRects().length)
        .slice(0, 250)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 100),
          value:
            el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
              ? el.value
              : null,
          focused: el === document.activeElement,
          attributes: Object.fromEntries(
            [
              'id',
              'class',
              'role',
              'aria-label',
              'placeholder',
              'name',
              'type',
              'href',
              'target',
              'data-testid',
            ].map((name) => [name, el.getAttribute(name)]),
          ),
        })),
    );
  return { url: page.url(), tree: tree.slice(0, 40000), elements };
}
export class Executor {
  constructor(private abilities = new Abilities()) {}
  async replay(flow: Flow, page: Page) {
    for (const [index, step] of flow.steps.entries()) {
      try {
        page = await this.abilities.execute(page, step);
      } catch (error) {
        throw new Error(
          `重放第 ${index + 1} 步失败；流程未修改：${String(error)}`,
        );
      }
    }
    return { steps: flow.steps.length, url: page.url() };
  }
  async record(
    goal: string,
    page: Page,
    planner = new RollingCaseCompiler(),
    startUrl?: string,
  ): Promise<Flow> {
    const steps: Step[] = [];
    const intents = await planner.compileIntents(goal, startUrl);
    if (startUrl) {
      const initial: Step = {
        type: 'navigate',
        value: startUrl,
        target: { kind: 'css', value: '', name: '', scope: '', index: -1 },
        transition: 'navigation',
        expected: null,
      };
      page = await this.abilities.execute(page, initial);
      steps.push(initial);
    }
    for (const [turn, intent] of intents.entries()) {
      let detours = 0;
      while (true) {
        const decision = await planner.planNext({
          goal: intent.instruction,
          requiredType: intent.type,
          ...(await observe(page)),
          steps,
        });
        if (decision.done)
          throw new Error(
            `第 ${turn + 1} 项应执行 ${intent.type}，规划提前结束（${decision.reason}），已停止`,
          );
        if (JSON.stringify(decision.step) === JSON.stringify(steps.at(-1)))
          throw new Error('规划重复已成功动作，停止执行');
        console.info('Playwright 探索步骤', {
          turn: turn + 1,
          reason: decision.reason,
          step: decision.step,
        });
        const step: Step = {
          ...decision.step,
          expected:
            decision.step.type === 'assert' ? decision.step.expected : null,
        };
        let actual = step.transition;
        page = await this.abilities.execute(page, step, (transition) => {
          actual = transition;
        });
        steps.push({ ...step, transition: actual });
        if (decision.step.type === intent.type) break;
        if (++detours > 3)
          throw new Error(
            `第 ${turn + 1} 项 ${intent.type} 连续 3 次未对齐（最近返回 ${decision.step.type}），已停止`,
          );
      }
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
}
