import type { Page } from '@playwright/test';

export class RunPage {
  constructor(private readonly page: Page) {}

  get playbackButton() {
    return this.page.getByRole('button', { name: '回放', exact: true });
  }

  get playButton() {
    return this.page.getByRole('button', { name: '播放回看', exact: true });
  }

  get pauseButton() {
    return this.page.getByRole('button', { name: '暂停回看', exact: true });
  }

  get timeline() {
    return this.page.getByRole('slider', { name: '画面时间轴' });
  }

  get playbackTime() {
    return this.page.getByLabel('回放时间', { exact: true });
  }

  get recording() {
    return this.page.getByLabel('执行录像');
  }

  get planButton() {
    return this.page.getByRole('button', { name: '计划', exact: true });
  }

  get stepsButton() {
    return this.page.getByRole('button', { name: '步骤', exact: true });
  }

  get scriptButton() {
    return this.page.getByRole('button', { name: '录制脚本', exact: true });
  }

  get scriptInput() {
    return this.page.getByRole('textbox', { name: 'Playwright 录制脚本' });
  }

  get stopButton() {
    return this.page.getByRole('button', { name: '停止执行', exact: true });
  }

  get steps() {
    return this.page.getByRole('region', { name: '步骤' });
  }

  get workbench() {
    return this.page.getByLabel('执行工作台', { exact: true });
  }

  get consoleButton() {
    return this.page.getByRole('button', { name: '控制台', exact: true });
  }

  get consoleLogs() {
    return this.page.getByRole('region', { name: 'Console 记录', exact: true });
  }

  get networkButton() {
    return this.page.getByRole('button', { name: '网络', exact: true });
  }

  get networkLogs() {
    return this.page.getByRole('region', { name: 'Network 记录', exact: true });
  }

  get aiButton() {
    return this.page.getByRole('button', { name: 'AI 调用', exact: true });
  }

  get aiContent() {
    return this.page.getByLabel('AI 调用内容', { exact: true });
  }

  get planViewport() {
    return this.page.locator('[data-ui~="plan-viewport"]');
  }

  get nodeDetails() {
    return this.page.getByRole('complementary', { name: '计划节点详情' });
  }

  async goto(id: string) {
    await this.page.goto('/runs/' + encodeURIComponent(id));
  }

  async play() {
    await this.playButton.click();
  }

  async pause() {
    await this.pauseButton.click();
  }

  async openConsole() {
    await this.consoleButton.click();
  }

  async openNetwork() {
    await this.networkButton.click();
  }

  async openAiLogs() {
    await this.aiButton.click();
  }
}
