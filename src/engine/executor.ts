import type { Locator, Page } from 'playwright';
import { type JSONType, z } from 'zod';
import { jev, type ClickDecision } from '../ai/provider/jev';
import { generateWithOpenAI } from '../ai/provider/stepfun';
import {
  AttentionSchema,
  CheckSchema,
  Compiler,
  StepSchema,
  type Flow,
  type Step,
  type Target,
} from './compiler';
import { Observer } from './observer';
import { logger } from '@/lib/logger';
import { IntentNode } from './compiler/type';

const DecisionSchema = z.object({
  done: z.boolean(),
  reason: z.string(),
  step: StepSchema.nullable(),
});

export class Executor {
  private static readonly maxStepsPerAtomicIntent = 20;

  constructor(
    private observer = new Observer(),
    private intentNode: IntentNode,
  ) {}

  async record(goal: string, page: Page) {
    logger.info(this.intentNode);

    await this.dfs(this.intentNode, page);
  }

  async dfs(node: IntentNode, page: Page) {
    if (node.children) {
      for (const child of node.children) {
        await this.dfs(child, page);
      }
      return;
    }

    const completedSteps: Step[] = [];
    for (let attempt = 0; attempt < Executor.maxStepsPerAtomicIntent; attempt++) {
      const ariaTree = await this.observer.observe(page);
      const decision = await this.plan({
        goal: node.goal,
        observation: ariaTree,
        completedSteps,
      });

      logger.info(decision);

      if (decision.done) return;

      if (!decision.step) {
        throw new Error(`Planner returned no action before completing intent: ${node.goal}`);
      }

      await this.execute(page, decision.step);
      completedSteps.push(decision.step);
    }

    throw new Error(
      `Exceeded ${Executor.maxStepsPerAtomicIntent} actions without completing intent: ${node.goal}`,
    );
  }

  async plan(input: {
    goal: string;
    observation: Record<string, unknown>;
    completedSteps: Step[];
  }) {
    const response = await generateWithOpenAI({
      systemPrompt: `Plan the next single browser action toward the goal.
      Return done: true and step: null only when the goal is already complete.
      Otherwise return done: false and exactly one action.
      completedSteps contains actions that have already succeeded for this atomic goal. Never repeat a
      functionally identical action merely to satisfy a prerequisite: continue from its effect instead.
      In particular, after clicking a focused text input, choose fill or press when appropriate rather
      than clicking that input again. The observation includes the active element and its value.
      有以下原子能力可选, navigate, click, fill, press。如果是 click、fill 或 press，返回 kind 为 ariaRef；target.value 必须且只能是 ARIA ref token，例如 e18。绝不能返回 textbox "邮箱" [ref=e18] 等完整节点描述。`,
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: JSON.stringify(input) },
        },
      ],
      temperature: 0,
      responseFormat: {
        type: 'json_schema',
        name: 'browser_step',
        schema: z.toJSONSchema(DecisionSchema) as JSONType,
      },
    });

    return DecisionSchema.parse(response.structuredContent);
  }

  async planExperiment(
    input: Omit<Parameters<typeof jev.decideClick>[0], 'steps'> & { steps: readonly Step[] },
  ): Promise<ClickDecision> {
    return jev.decideClick(input);
  }

  async execute(page: Page, step: Step): Promise<Page> {
    // 执行操作
    if (step.type === 'navigate') {
      await page.goto(step.value, { waitUntil: 'domcontentloaded' });
    } else if (step.type === 'click') {
      const previousUrl = page.url();
      const target = this.locate(page, step.target);
      await target.click();

      await this.waitForStable(page, previousUrl);
    } else if (step.type === 'fill') {
      const target = this.locate(page, step.target);
      await target.fill(step.value);
    } else if (step.type === 'press') {
      const previousUrl = page.url();
      const target = this.locate(page, step.target);
      // Playwright 的 press 值支持大写
      const key = step.value.charAt(0).toUpperCase() + step.value.slice(1);
      await target.press(key);

      await this.waitForStable(page, previousUrl);
    }

    return page;
  }

  locate(page: Page, target: Target): Locator {
    const root = page.locator(':root');
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
    return target.index === undefined ? result : result.nth(target.index);
  }

  // 等待界面稳定
  private async waitForStable(page: Page, previousUrl: string, timeout: number = 5000) {
    await Promise.race([
      // Wait for either a navigation or a quiet DOM; do not await the candidates before racing them.
      page
        .waitForURL((url) => url.href !== previousUrl, { timeout })
        .then(() => page.waitForLoadState('domcontentloaded', { timeout }))
        .catch(() => undefined),
      this.waitForDomQuiet(page, timeout),
    ]);
  }

  private async waitForDomQuiet(page: Page, timeout: number, quietMs = 300): Promise<void> {
    try {
      await page.waitForFunction(
        (quietMs) => {
          return new Promise((resolve) => {
            let timer = setTimeout(() => resolve(true), quietMs);
            const observer = new MutationObserver(() => {
              clearTimeout(timer);
              timer = setTimeout(() => resolve(true), quietMs);
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
          });
        },
        quietMs,
        { timeout },
      );
    } catch {
      // 超时就算了,不阻塞主流程
    }
  }
}
