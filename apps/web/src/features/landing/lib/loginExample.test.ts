import { expect, it } from 'vitest';
import { ExecutablePlanSchema } from '@testdog/contracts/automation/compiler/schema';
import { indexRun } from '@/features/runs/lib/runIndex';
import { stepAtTime } from '@/features/runs/lib/boardResults';
import en from '../../../../messages/en.json';
import zh from '../../../../messages/zh.json';
import { createLoginExample } from './loginExample';

for (const [locale, messages] of Object.entries({ en, zh })) {
  it(`${locale} example works with the executable plan and run playback contracts`, () => {
    const t = messages.landing;
    const { run, frameSources } = createLoginExample({
      name: t.loginName,
      url: 'app.example.com/login',
      input: [t.openLogin, t.enterExampleCredentials, t.clickLoginButton, t.verifyWelcome],
      title: t.welcome,
      subtitle: t.signedIn,
    });

    expect(() => ExecutablePlanSchema.parse(run.plan)).not.toThrow();
    const { frames, stepFrames } = indexRun(run);

    for (const frame of frames) {
      expect(stepAtTime(run, frame.elapsedMs)?.id).toBe(frame.stepId);
      expect(stepFrames.get(frame.stepId!)?.after).toBe(frames.indexOf(frame));
      expect(frameSources[frame.id]).toMatch(/^data:image\/svg\+xml/);
    }

    const lastFrame = frames.at(-1)!;
    const lastStep = run.steps.at(-1)!;

    expect(stepAtTime(run, run.durationMs)?.id).toBe(lastStep.id);
    expect(run.durationMs).toBeGreaterThanOrEqual(lastFrame.elapsedMs + lastStep.durationMs!);
  });
}
