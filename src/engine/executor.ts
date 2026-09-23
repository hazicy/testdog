import type { Locator, Page } from 'playwright';
import { type JSONType, z } from 'zod';
import { jev, type ClickDecision } from '../ai/provider/jev';
import { generateWithOpenAI } from '../ai/provider/openai';
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
import { ne } from 'drizzle-orm/sqlite-core/expressions';

const DecisionSchema = z.object({
  done: z.boolean(),
  reason: z.string(),
  step: StepSchema.extend({ expected: CheckSchema.nullable() }).nullable(),
  attention: AttentionSchema.nullable(),
});

export class Executor {
  constructor(
    private observer = new Observer(),
    private intentNode: IntentNode,
  ) {}

  async record(goal: string, page: Page) {
    logger.info(this.intentNode);

    await this.dfs(this.intentNode, page);
  }

  async dfs(node: IntentNode, page: Page) {
    const ariaTree = await this.observer.observe(page);

    const decision = await this.plan({
      goal: node.goal,
      tree: ariaTree,
    });

    logger.info(decision);

    if (decision.step) {
      await this.execute(page, decision.step);
    }

    if (!node.children) {
      return;
    }

    for (const n of node.children) {
      await this.dfs(n, page);
    }
  }

  /** Plans the next browser action from the current observed page state. */
  async plan(input: { goal: string; tree: Record<string, any> }) {
    const response = await generateWithOpenAI({
      systemPrompt: `Plan one browser action，
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
      const target = this.locate(page, step.target);
      await target.click();

      await this.waitForStable(page);
    } else if (step.type === 'fill') {
      const target = this.locate(page, step.target);
      await target.fill(step.value);
    } else if (step.type === 'press') {
      const target = this.locate(page, step.target);
      await target.press(step.value);

      await this.waitForStable(page);
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

  // 等待界面稳定
  private async waitForStable(page: Page, timeout: number = 5000) {
    Promise.race([
      // 等待 DOM 稳定
      await page.waitForLoadState('domcontentloaded', {
        timeout,
      }),
      // 等待 URL 变化
      await page.waitForURL(() => true, {
        timeout,
      }),
      await this.waitForDomQuiet(page, timeout),
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
