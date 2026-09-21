import { randomUUID } from "node:crypto";
import type { Page } from "playwright";
import { Abilities } from "./abilities";
import { RollingCaseCompiler, type Flow, type Step } from "./compiler";
import { Observer } from "./observer";

export class Executor {
  constructor(
    private abilities = new Abilities(),
    private observer = new Observer(),
  ) {}

  async record(
    goal: string,
    page: Page,
    planner = new RollingCaseCompiler(),
  ): Promise<Flow> {
    const steps: Step[] = [];

    while (true) {
      const { rawTree } = await this.observer.observe(page);

      const decision = await planner.planNext({
        goal,
        tree: rawTree,
        steps,
      });

      const { step } = decision;

      if (!step) {
        break;
      }

      const ref = step.target.value;

      if (step.type === "click") {
        const aiLocator = page.locator(`aria-ref=${ref}`);

        const normalized = await aiLocator.normalize();

        await normalized.click();

        console.log(normalized.toString());
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
