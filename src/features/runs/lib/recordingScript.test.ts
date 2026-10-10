import { describe, expect, it } from 'vitest';
import { parseRecordingScript, recordingScript } from './recordingScript';

describe('editable recording script', () => {
  it('round trips stable operations, branch checks, model expectations, native assertions and pages', () => {
    const script = `await page1.goto("https://example.com");
// @node signup
await page1.getByRole("textbox", { name: "Name", exact: true }).nth(0).fill("Grace");
await page1.getByTestId("submit").click();
await page1.getByLabel("Password", { exact: true }).press("Enter");
await page1.waitForTimeout(1000);
await waitFor(page1, "newPage", "", 5000);
await expectPage(page2, "Welcome Grace is visible");
await expectBranch(page2, "Already signed in", true);
await expect(page2.getByText("Grace", { exact: true })).toBeVisible();
await expect(page2.getByRole("heading")).toHaveText("Welcome Grace");
await expect(page2.getByRole("heading")).not.toContainText("Ada");
await expect(page1.getByPlaceholder("Name", { exact: true })).toHaveValue("Grace");
await expect(page2).toHaveURL("https://example.com/welcome");`;
    const steps = parseRecordingScript(script);

    expect(steps).toHaveLength(13);
    expect(steps[1].planNodeId).toBe('signup');
    expect(steps[1].action).toMatchObject({
      type: 'fill',
      value: 'Grace',
      target: { index: 0, name: 'Name' },
    });
    expect(steps[8].playwrightAssertion).toMatchObject({
      type: 'toBeVisible',
      target: { kind: 'text' },
    });
    expect(parseRecordingScript(recordingScript(steps))).toEqual(steps);
  });
  it.each([
    'process.exit(0);',
    'await page1.evaluate("alert(1)");',
    'const x = 1;',
    'await page1.goto("file:///etc/passwd");',
    'await page1.locator("aria-ref=e1").click();',
    'await page1.getByLabel("Name", { exact: false }).fill("x");',
    'await page1.getByTestId("Name", { name: "x" }).fill("x");',
    'await page1.getByRole("button").click({ force: true });',
    'await page1.getByRole("textbox").fill(process.env.PASSWORD);',
    'await expectPage(page1, "");',
    'await expectBranch(page1, "condition", "true");',
    'await page1["goto"]("https://example.com");',
    'await expect(page1).toBeVisible();',
  ])('rejects unsupported calls and expressions: %s', (script) => {
    expect(() => parseRecordingScript(script)).toThrow('第 1 行');
  });
  it('reports syntax errors and prevents empty scripts', () => {
    expect(() => parseRecordingScript('// empty')).toThrow('至少');
    expect(() => parseRecordingScript('\nawait page1.goto(')).toThrow('第 2 行');
  });
});
