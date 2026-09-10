import type { Locator, Page } from '@browserbasehq/stagehand';
import { Abilities, type AbilityOptions } from './abilities';
import {
  RollingCaseCompiler,
  type Ability,
  type InteractionRegionKind,
  type PlannedScope,
} from './compiler';

const MAX_PAGE_TREE_CHARS = 30_000;
const MAX_STALLED_REPLANS = 2;

/**
 * Runtime-only state shared by sequential abilities. Locators cannot be
 * serialized into the compiled plan, so the planner's current interaction
 * region is retained here and scopes the next ability.
 */
export interface InteractionRegion {
  kind: InteractionRegionKind;
  locator: Locator;
  query: string;
  reason: string;
}

export interface ExecutionContext {
  regions: InteractionRegion[];
}

export class Executor {
  constructor(
    private abilities: Abilities,
    private readonly maxAttempts = 3,
  ) {}

  async execute(
    primitives: Ability[],
    page: Page,
    context: ExecutionContext = { regions: [] },
  ) {
    for (const primitive of primitives) {
      await this.executeWithRecovery(primitive, page, context);

      if (primitive.type === 'navigate') {
        // A navigation invalidates any locator from the previous document.
        context.regions = [];
      }
    }

    return context;
  }

  async executeRolling(
    goal: string,
    page: Page,
    planner: RollingCaseCompiler,
    maxSteps = 20,
  ) {
    const context: ExecutionContext = { regions: [] };
    const completedSteps: Ability[] = [];
    let previousStepSignature: string | undefined;
    let stalledReplans = 0;

    for (let turn = 1; turn <= maxSteps; turn += 1) {
      const snapshot = await page.snapshot();
      const pageTree = this.trimPageTree(snapshot.formattedTree);
      const decision = await planner.planNext({
        goal,
        pageUrl: await page.url(),
        completedSteps,
        pageTree,
        xpathMap: this.xpathMapForTree(pageTree, snapshot.xpathMap),
        activeRegions: context.regions.map(({ kind, query, reason }) => ({
          kind,
          query,
          reason,
        })),
        turn,
      });

      if (decision.done) {
        if (decision.nextStep) {
          throw new Error('滚动规划失败：完成状态不能包含下一步');
        }
        await this.abilities.assert(
          `Verify the final destination/state requested by this goal is currently visible: ${goal}. Current URL: ${await page.url()}. Do not infer success from attempted actions. A source search page does not prove a video was opened. Check the requested search query and destination content.`,
          { page },
        );
        return { completedSteps, context, reason: decision.reason };
      }
      if (!decision.nextStep) {
        throw new Error('滚动规划失败：未完成时必须提供下一步');
      }

      const stepSignature = this.stepSignature(decision.nextStep);
      if (stepSignature === previousStepSignature) {
        stalledReplans += 1;
        if (stalledReplans >= MAX_STALLED_REPLANS) {
          throw new Error(
            `滚动规划停滞：连续规划相同动作 ${stepSignature}`,
          );
        }
      } else {
        stalledReplans = 0;
      }

      console.info('滚动规划下一步', {
        turn,
        reason: decision.reason,
        step: decision.nextStep,
      });

      await this.applyPlannedScope(decision.scope, page, context);
      const beforePages = new Set((await this.abilities.pages()).map(p => p.pageId));
      const beforeUrl = await page.url();
      await this.execute([decision.nextStep], page, context);
      completedSteps.push(decision.nextStep);
      previousStepSignature = stepSignature;

      // The click may schedule a portal/dialog render after the action event.
      // Give the accessibility tree a chance to reflect that state before the
      // next rolling-planning turn.
      // Search and video links may open a new tab without changing the source.
      if (decision.nextStep.type === 'click' || decision.nextStep.type === 'press') {
        const deadline = Date.now() + 3000;
        do {
          const opened = (await this.abilities.pages()).filter(p => !beforePages.has(p.pageId));
          if (opened.length > 1) throw new Error('动作打开多个标签页，无法唯一确定目标页面');
          if (opened.length === 1) {
            page = opened[0];
            context.regions = [];
            await page.waitForLoadState('domcontentloaded', 30_000);
            break;
          }
          if (await page.url() !== beforeUrl) {
            context.regions = [];
            await page.waitForLoadState('domcontentloaded', 30_000);
            break;
          }
          await page.waitForTimeout(250);
        } while (Date.now() < deadline);
      }
      await page.waitForTimeout(750);
      console.info('动作后页面', { pageId: page.pageId, url: await page.url() });
    }

    throw new Error(`滚动规划在 ${maxSteps} 步后仍未完成：${goal}`);
  }

  private trimPageTree(tree: string) {
    if (tree.length <= MAX_PAGE_TREE_CHARS) return tree;

    return `${tree.slice(0, MAX_PAGE_TREE_CHARS)}\n[Accessibility tree truncated]`;
  }

  private stepSignature(step: Ability) {
    const { id: _id, ...action } = step;
    return JSON.stringify(action);
  }

  private xpathMapForTree(
    tree: string,
    xpathMap: Record<string, string>,
  ) {
    const ids = tree.matchAll(/\[(\d+-\d+)\]/g);
    const entries: Array<[string, string]> = [];

    for (const match of ids) {
      const id = match[1];
      const xpath = xpathMap[id];
      if (xpath) entries.push([id, xpath]);
    }

    return Object.fromEntries(entries);
  }

  private async applyPlannedScope(
    scope: PlannedScope | null,
    page: Page,
    context: ExecutionContext,
  ) {
    if (!scope) {
      context.regions = [];
      return;
    }

    const locator = page.locator(scope.query);
    const count = await locator.count();
    if (count !== 1 || !(await locator.isVisible())) {
      throw new Error(
        `滚动规划的作用域不可用：${scope.query}（匹配 ${count} 个元素）`,
      );
    }

    context.regions = [{ ...scope, locator }];
  }

  private async executeWithRecovery(
    primitive: Ability,
    page: Page,
    context: ExecutionContext,
  ) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        await this.executeOnce(primitive, page, context);
        return;
      } catch (error) {
        lastError = error;
        if (attempt === this.maxAttempts) break;

        // The page may have changed while an action was being resolved. Waiting
        // briefly and running the semantic observation again gives Stagehand a
        // fresh target instead of retrying a stale locator.
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `步骤 ${primitive.id}（${primitive.type}）在 ${this.maxAttempts} 次尝试后仍失败：${message}`,
      { cause: lastError },
    );
  }

  private async executeOnce(
    primitive: Ability,
    page: Page,
    context: ExecutionContext,
  ) {
    const activeRegion = context.regions.at(-1);
    const options: AbilityOptions = {
      page,
      ...(activeRegion ? { locator: activeRegion.locator } : {}),
    };

    switch (primitive.type) {
      case 'navigate': {
        await this.abilities.navigate(primitive.url, options);
        break;
      }
      case 'fill':
        await this.abilities.fill(primitive.target.description, primitive.value, options);
        break;
      case 'press':
        await this.abilities.press(primitive.target.description, primitive.key, options);
        break;
      case 'click':
        await this.abilities.click(primitive.target.description, options);
        break;
      case 'assert':
        await this.abilities.assert(primitive.condition, options);
        break;
      case 'extract':
        throw new Error(
          `尚未实现步骤类型：${primitive.type}（${primitive.id}）`,
        );
    }
  }
}

// ability 封装能力
// 支持的能力 navigate，observe，fill，click
// llm 要将输入的 case 转换成 ability stagehand 原始的 action 实际大概就是这个能力，对齐在封装一层合适吗？
// 然后 executor 执行 ability
