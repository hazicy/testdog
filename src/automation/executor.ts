import type { Locator, Page } from '@browserbasehq/stagehand';
import { Abilities, type AbilityOptions } from './abilities';
import type { Ability } from './compiler';

/**
 * Runtime-only state shared by sequential abilities. A Locator cannot be
 * serialized into the compiled plan, so the producer of a scope writes it
 * here and every subsequent ability receives the same object.
 */
export interface ExecutionContext {
  locator?: Locator;
}

export class Executor {
  constructor(
    private abilities: Abilities,
    private readonly maxAttempts = 3,
  ) {}

  async execute(
    primitives: Ability[],
    page: Page,
    context: ExecutionContext = {},
  ) {
    for (const primitive of primitives) {
      await this.executeWithRecovery(primitive, page, context);
    }

    return context;
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
    const options: AbilityOptions = {
      page,
      ...(context.locator ? { locator: context.locator } : {}),
    };

    switch (primitive.type) {
      case 'navigate': {
        await this.abilities.navigate(primitive.url, options);
        break;
      }
      case 'fill':
        await this.abilities.fill(primitive.target.description, primitive.value, options);
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
