'use client';

import { useTranslations } from 'next-intl';
import type { ExecutionStep } from '@testdog/contracts/runs/types';
import { DockTabs } from '@/components/ui/DockTabs';
import { RunPlayer } from '@/features/runs/components/RunPlayer';
import { StepList } from '@/features/runs/components/StepList';
import { useRunStudio } from '@/features/runs/hooks/useRunStudio';
import { stepAtTime } from '@/features/runs/lib/boardResults';
import { runWorkspaceTabs, type PanelId } from '@/features/runs/lib/runLayout';
import styles from './LandingDemo.module.css';
import type { LoginExample } from '../lib/loginExample';

export function LandingRunPreview({ example }: { example: LoginExample }) {
  const t = useTranslations('runs');
  const { state, act, playback } = useRunStudio();
  const { run, frameSources } = example;
  const { steps, plan, artifacts: frames } = run;
  const currentIndex = playback.follow
    ? 0
    : Math.max(
        0,
        frames.findLastIndex((frame) => frame.elapsedMs <= playback.elapsedMs),
      );
  const currentStep =
    steps.find((step) => step.id === state.inspectedStepId) ?? stepAtTime(run, playback.elapsedMs);
  const selectStep = (step: ExecutionStep) => {
    const index = steps.findIndex((item) => item.id === step.id);

    act({
      type: 'inspect',
      source: 'steps',
      stepId: step.id,
      cursor: { kind: 'evidence', index, stepId: step.id },
      elapsedMs: frames[index].elapsedMs,
    });
  };

  const tabs = runWorkspaceTabs('default', 0)
    .filter((tab) => ['steps', 'execution'].includes(tab.id))
    .map((tab) => ({ ...tab, label: t(`panels.${tab.id}`) }));

  function renderPanel(panel: PanelId) {
    switch (panel) {
      case 'execution':
        return (
          <RunPlayer
            id={run.id}
            run={run}
            currentFrame={frames[currentIndex]}
            frames={frames}
            videos={[]}
            clearPreview={() => {}}
            durationMs={run.durationMs}
            playback={playback}
            artifactUrl={(frame) => frameSources[frame.id]}
          />
        );
      case 'steps':
        return (
          <div className={styles.runSteps}>
            <StepList
              plan={plan}
              steps={steps}
              running={false}
              selectedId={currentStep?.id}
              onSelect={selectStep}
            />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className={styles.runWorkspace}>
      <DockTabs
        label={t('workbench')}
        className={styles.runDock}
        tabs={tabs}
        value={state.view}
        onChange={(panel) => act({ type: 'panel', panel })}
        revealPanels={state.revealPanels}
      >
        {renderPanel}
      </DockTabs>
    </div>
  );
}
