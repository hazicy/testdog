import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import { jev } from '../ai/provider/jev';
import { Abilities } from './abilities';
import { RollingCaseCompiler, type Flow, type Step } from './compiler';
import { Observer } from './observer';

export class Executor {
  constructor(
    private abilities = new Abilities(),
    private observer = new Observer(),
  ) {}

  async record(goal: string, page: Page, planner = new RollingCaseCompiler()): Promise<Flow> {
    const steps: Step[] = [];

    while (true) {
      const { tree, rawTree } = await this.observer.observe(page);

      const decision = await planner.planNext({
        goal,
        tree: rawTree,
        steps,
      });

      let { step } = decision;

      if (!step) {
        break;
      }

      if (step.type === 'click') {
        const decision = await jev.decideClick({ goal, tree });
        step = {
          ...step,
          target: {
            kind: 'ariaRef',
            value: decision.ref,
            name: '',
            scope: '',
            index: -1,
          },
        };
      }

      page = await this.abilities.execute(page, step);
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
}
