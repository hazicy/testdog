import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import { Abilities, locate } from './abilities';
import { RollingCaseCompiler, type Flow, type Step } from './compiler';
async function observe(page: Page) {
  const snapshot = async () => {
    const tree = await page.locator('body').ariaSnapshot();
    const elements = await page
    .locator(
      'input,button,a,[role],[data-testid],video,iframe,.ant-select-item-option',
    )
    .evaluateAll((nodes) =>
      nodes
        .filter((el) => {
          const style = getComputedStyle(el);
          return (
            el.getClientRects().length > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          );
        })
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
              'title',
              'data-testid',
            ].map((name) => [name, el.getAttribute(name)]),
          ),
          container: (() => {
            const selectDropdown = el.closest('.ant-select-dropdown');
            if (selectDropdown) {
              return `Ant Design select dropdown: ${selectDropdown.textContent?.trim().slice(0, 100) || 'unnamed'}`;
            }
            const listbox = el.closest('[role="listbox"]');
            if (listbox) {
              const label = listbox.getAttribute('aria-label') || listbox.textContent;
              return `popup listbox: ${label?.trim().slice(0, 100) || 'unnamed'}`;
            }
            const dialog = el.closest('[role="dialog"]');
            if (!dialog) return 'page';
            const labelledBy = dialog.getAttribute('aria-labelledby');
            const label = dialog.getAttribute('aria-label');
            const title =
              (labelledBy && document.getElementById(labelledBy)?.textContent) ||
              label ||
              dialog.querySelector('.ant-modal-title')?.textContent ||
              dialog.textContent;
            return `dialog: ${title?.trim().slice(0, 100) || 'unnamed'}`;
          })(),
        })),
    );
    return { url: page.url(), tree: tree.slice(0, 40000), elements };
  };

  // A client-side navigation can replace the document before its application
  // shell is rendered. Do not give the planner that transient empty document.
  const deadline = Date.now() + 5000;
  let result = await snapshot();
  while (!result.tree.trim() && result.elements.length === 0 && Date.now() < deadline) {
    await page.waitForTimeout(100);
    result = await snapshot();
  }
  return result;
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
      let rejectedPlans = 0;
      let locatorConflicts: Array<{ target: Step['target']; count: number }> = [];
      let navigationConflicts: string[] = [];
      let attentionConflicts: Array<{ target: Step['target']; scope: string }> = [];
      let visibilityConflicts: Step['target'][] = [];
      while (true) {
        const decision = await planner.planNext({
          goal: intent.instruction,
          requiredType: intent.type,
          ...(await observe(page)),
          steps,
          locatorConflicts,
          navigationConflicts,
          attentionConflicts,
          visibilityConflicts,
        });
        if (decision.done)
          throw new Error(
            `第 ${turn + 1} 项应执行 ${intent.type}，规划提前结束（${decision.reason}），已停止`,
          );
        console.info('Playwright 探索步骤', {
          turn: turn + 1,
          reason: decision.reason,
          attention: decision.attention,
          step: decision.step,
        });
        const step: Step = {
          ...decision.step,
          target: {
            ...decision.step.target,
            scope: decision.attention?.scope ?? decision.step.target.scope,
          },
          expected:
            decision.step.type === 'assert' ? decision.step.expected : null,
        };
        if (step.type === 'navigate' && sameUrl(step.value, page.url())) {
          navigationConflicts = [step.value];
          if (++rejectedPlans > 5)
            throw new Error(
              `第 ${turn + 1} 项 ${intent.type} 连续尝试导航到当前页面，已停止`,
            );
          continue;
        }
        navigationConflicts = [];
        if (step.type !== 'navigate' && step.type !== 'wait' && step.type !== 'assert') {
          const scopedCount = await locate(page, step.target).count();
          const unscopedTarget = { ...step.target, scope: '' };
          const unscopedCount = step.target.scope
            ? await locate(page, unscopedTarget).count()
            : scopedCount;
          if (step.target.scope && scopedCount === 0 && unscopedCount === 1) {
            attentionConflicts = [{ target: step.target, scope: step.target.scope }];
            if (++rejectedPlans > 5)
              throw new Error(
                `第 ${turn + 1} 项 ${intent.type} 的 attention 范围连续错误，已停止`,
              );
            continue;
          }
          attentionConflicts = [];

          if (scopedCount > 0) {
            let visibleCount = 0;
            const target = locate(page, step.target);
            for (let index = 0; index < scopedCount; index++) {
              if (await target.nth(index).isVisible()) visibleCount++;
            }
            if (visibleCount === 0) {
              visibilityConflicts = [step.target];
              if (++rejectedPlans > 5)
                throw new Error(
                  `第 ${turn + 1} 项 ${intent.type} 连续定位到隐藏元素，已停止`,
                );
              continue;
            }
          }
          visibilityConflicts = [];
        }
        if (
          step.type !== 'wait' &&
          JSON.stringify(step) === JSON.stringify(steps.at(-1))
        )
          throw new Error('规划重复已成功动作，停止执行');
        if (step.type !== 'navigate' && step.type !== 'wait' && step.type !== 'assert') {
          const count = await locate(page, step.target).count();
          if (step.target.index < 0 && count > 1) {
            locatorConflicts = [{ target: step.target, count }];
            if (++rejectedPlans > 5)
              throw new Error(
                `第 ${turn + 1} 项 ${intent.type} 的定位器连续匹配多个元素，已停止`,
              );
            continue;
          }
        }
        locatorConflicts = [];
        attentionConflicts = [];
        visibilityConflicts = [];
        rejectedPlans = 0;
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

function sameUrl(left: string, right: string) {
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return left === right;
  }
}
