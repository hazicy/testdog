import { Page } from '@browserbasehq/stagehand';
import { StagehandClient } from '../stagehand/client';

export type Ability = {
  type: 'navigate' | 'observe' | 'fill' | 'click';
  page: Page;
};

interface AbilityOptions {
  page: Page;
}

export class Abilities {
  constructor(private stage: StagehandClient) {}

  navigate(url: string, options: AbilityOptions) {
    options.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    });
  }

  observe(instruction: string, options: AbilityOptions) {
    this.stage.client.observe(instruction, {
      page: options.page,
      timeout: 5000,
      cache: true,
    });
  }

}
