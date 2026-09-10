import type { Page } from '@browserbasehq/stagehand';
import { Abilities } from './abilities';
import type { Ability } from './compiler';

export class Executor {
  constructor(private abilities: Abilities) {}

  async execute(primitives: Ability[], page: Page) {
    for (const primitive of primitives) {
      switch (primitive.type) {
        case 'navigate': {
          await this.abilities.navigate(primitive.url, {
            page,
          });
          break;
        }
        case 'fill':
          await this.abilities.fill(primitive.target.description, primitive.value, {
            page,
          });
          break;
        case 'click':
          await this.abilities.click(primitive.target.description, { page });
          break;
        case 'assert':
          await this.abilities.assert(primitive.condition, { page });
          break;
        case 'extract':
          throw new Error(`尚未实现步骤类型：${primitive.type}（${primitive.id}）`);
      }
    }
  }
}

// ability 封装能力
// 支持的能力 navigate，observe，fill，click
// llm 要将输入的 case 转换成 ability stagehand 原始的 action 实际大概就是这个能力，对齐在封装一层合适吗？
// 然后 executor 执行 ability
