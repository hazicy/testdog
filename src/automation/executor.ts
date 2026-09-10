import { Abilities, Ability } from './abilities';

export class Executor {
  constructor(private abilities: Abilities) {}

  execute(primitives: Ability[]) {
    for (const primitive of primitives) {
      switch (primitive.type) {
        case 'navigate': {
          this.abilities.navigate('32', {
            page: primitive.page,
          });
          break;
        }
        case 'observe': {
          this.abilities.observe('232', {
            page: primitive.page,
          });
          break;
        }
        case 'fill': {
          this.abilities;
          break;
        }
        case 'click': {
          break;
        }
      }
    }
  }
}

// ability 封装能力
// 支持的能力 navigate，observe，fill，click
// llm 要将输入的 case 转换成 ability stagehand 原始的 action 实际大概就是这个能力，对齐在封装一层合适吗？
// 然后 executor 执行 ability
