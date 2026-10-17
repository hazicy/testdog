'use client';

import { useTranslations } from 'next-intl';

import styles from './TestEditor.module.css';
import editorStyles from '@/features/test-cases/components/test-editor.module.css';

import { Button } from '@/components/ui/Button';
import { useEffect, useState, useRef } from 'react';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import { api } from '@/client/api';
import { usePlanCompilation } from '@/features/test-cases/hooks/usePlanCompilation';
import { Icon } from '@iconify/react/offline';
import { PlanBoard } from '@/features/runs/components/PlanBoard';
import type { NodeReview } from '@/features/runs/components/PlanNodes';
import type { ReviewDecisions } from '@/features/test-cases/lib/planReview';
import { usePlanReview } from '@/features/test-cases/hooks/usePlanReview';
import { testSchema } from '@testdog/contracts/test-cases/schemas';
import { useAuthoring } from '@/features/test-cases/hooks/useAuthoring';
import { writeCaseDraft, type CaseDraft } from '@/features/test-cases/lib/caseDraft';
import { CaseSettings } from '@/features/test-cases/components/CaseSettings';
import { CasePrompt } from '@/features/test-cases/components/CasePrompt';
import { TrialRunDialog } from '@/features/test-cases/components/TrialRunDialog';
import {
  initialCaseSettings,
  caseTarget,
  type CaseSettingsValue,
} from '@/features/test-cases/lib/caseSettings';
import playIcon from '@iconify-icons/lucide/play';
import saveIcon from '@iconify-icons/lucide/save';
import { useRunSubmission } from '@/client/useRunSubmission';
import undoIcon from '@iconify-icons/lucide/undo-2';
import settingsIcon from '@iconify-icons/lucide/settings-2';
import monitorIcon from '@iconify-icons/lucide/monitor';
import smartphoneIcon from '@iconify-icons/lucide/smartphone';
import sparklesIcon from '@iconify-icons/lucide/sparkles';

export function TestEditor({
  test,
  duplicate = false,
  onSaved,
  initialDraft,
  draftId,
  folderId,
}: {
  test?: TestCase;
  duplicate?: boolean;
  onSaved: (test?: TestCase) => Promise<void>;
  initialDraft?: CaseDraft;
  draftId?: string;
  folderId?: string | null;
}) {
  const t = useTranslations('editor');
  const { caseName, editablePlan, emptyPlan, planText } = useAuthoring();
  const submitRun = useRunSubmission();
  const [savedCase, setSavedCase] = useState<TestCase | undefined>(duplicate ? undefined : test);

  const nameChanged = useRef(!!test || (!!initialDraft && initialDraft.name !== caseName('')));
  const [configuration, setConfiguration] = useState<CaseSettingsValue>(() => {
    const settings = initialCaseSettings(test);

    return {
      ...settings,
      ...initialDraft?.settings,
    };
  });
  const { platform, webProfile, appId, deviceProfileId, tags } = configuration;

  function changeSettings(patch: Partial<CaseSettingsValue>) {
    setConfiguration((current) => ({ ...current, ...patch }));
  }

  const [goal, setGoal] = useState(initialDraft?.goal ?? test?.goal ?? '');
  const review = usePlanReview(() => {
    const name =
      initialDraft?.name ??
      (test ? `${test.name}${duplicate ? t('copySuffix') : ''}` : caseName(''));
    const source = initialDraft?.plan ?? test?.plan ?? emptyPlan(name);

    return { name, plan: editablePlan(source, name) };
  });
  const { name, plan, candidate, previous, preview: reviewPreview, pendingChanges } = review;
  const hasSteps = Object.values(plan.nodes).some((node) => node.kind === 'task');
  const [composerOpen, setComposerOpen] = useState(false);
  const canvasRef = useRef<HTMLElement>(null);
  const generateRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const compilation = usePlanCompilation();
  const compiling = compilation.busy;
  const [saving, setSaving] = useState(false);
  const [trialId, setTrialId] = useState<string>();
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialActive, setTrialActive] = useState(false);
  const [formError, setFormError] = useState('');
  const busy = saving || compiling;
  const editingLocked = busy || !!candidate;

  useEffect(() => {
    if (draftId)
      writeCaseDraft(draftId, {
        test: savedCase ?? test,
        duplicate: savedCase ? false : duplicate,
        name,
        goal,
        plan,
        settings: configuration,
        folderId,
      });
  }, [draftId, plan, name, goal, configuration, test, duplicate, savedCase, folderId]);

  function changeName(value: string) {
    nameChanged.current = true;
    review.changeName(value, t('untitled'));
  }

  async function compile() {
    if (editingLocked || !goal.trim()) return;
    setFormError('');
    try {
      const source = await compilation.compile({
        goal,
        currentPlan: hasSteps ? plan : undefined,
        context: {
          platform,
          ...(platform !== 'web' && configuration.appId.trim()
            ? { appId: configuration.appId.trim() }
            : {}),
        },
      });

      if (!source) return;
      const root = source.nodes[source.rootId];
      const title =
        !hasSteps && !nameChanged.current
          ? caseName(root.kind === 'branch' ? goal : root.goal)
          : name;

      const next = editablePlan(source, title);
      const nextRoot = next.nodes[next.rootId];

      // Preserve an explicitly cleared name; editablePlan only applies non-empty titles.
      if (nextRoot.kind === 'group') next.nodes[nextRoot.id] = { ...nextRoot, goal: title };
      review.startReview(next);
      setComposerOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('conversionFailed'));
    }
  }

  function applyReviewDecision(decide: () => ReturnType<typeof review.decide>) {
    try {
      const result = decide();

      if (!result) return;
      if (result.complete) {
        setComposerOpen(false);
        if (result.accepted) setGoal('');
      }

      setFormError('');
    } catch {
      setFormError(t('relatedChanges'));
    }
  }

  function decideChanges(decisions: ReviewDecisions) {
    applyReviewDecision(() => review.decide(decisions));
  }

  function decideAll(accept: boolean) {
    applyReviewDecision(() => review.decideAll(accept));
  }

  const nodeReviews: Record<string, NodeReview> = {};

  for (const change of pendingChanges)
    nodeReviews[change.id] = {
      kind: change.kind,
      before: change.before,
      count: change.nodeIds.length,
      onAccept: () => decideChanges({ ...candidate!.decisions, [change.id]: true }),
      onReject: () => decideChanges({ ...candidate!.decisions, [change.id]: false }),
    };

  async function save(trial = false) {
    if (editingLocked) return;
    if (trial && trialId && trialActive) {
      setTrialOpen(true);

      return;
    }

    setFormError('');
    if (!hasSteps) {
      setFormError(t('addStep'));

      return;
    }

    const payload = {
      name,
      ...(!savedCase && folderId !== undefined ? { folderId } : {}),
      target: caseTarget(configuration),
      goal: planText(plan),
      plan,
      tags: tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    const parsed = testSchema.safeParse(payload);

    if (!parsed.success) {
      const missing = !name.trim()
        ? t('testName')
        : platform !== 'web' && !appId.trim()
          ? t('appId')
          : platform !== 'web' && !deviceProfileId
            ? t('deviceProfile')
            : t('targetAndTags');

      setFormError(
        parsed.error.issues.find((issue) => issue.code === 'custom')?.message ??
          t('checkSettings', { field: missing }),
      );
      if (!name.trim()) {
        setFormError(t('enterName'));
        nameRef.current?.focus();
      } else if (!parsed.error.issues.some((issue) => issue.path[0] === 'plan')) {
        setSettingsOpen(true);
      }

      setComposerOpen(false);

      return;
    }

    setSaving(true);
    try {
      if (trial) {
        const { run } = await submitRun<{ run: { id: string } }>('/api/runs', {
          draft: {
            name: parsed.data.name,
            goal: parsed.data.goal,
            target: parsed.data.target,
            plan: parsed.data.plan,
          },
        });

        setTrialId(run.id);
        setTrialActive(true);
        setTrialOpen(true);
      } else {
        const result = await (
          savedCase
            ? api.patch(`/api/tests/${savedCase.id}`, { json: parsed.data })
            : api.post('/api/tests', { json: parsed.data })
        ).json<{ test: TestCase }>();

        if (result?.test) setSavedCase(result.test);
        await onSaved(result?.test);
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : trial ? t('trialFailed') : t('saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  }

  const content = (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <aside
        className={editorStyles.caseToolbar}
        data-collapsed={!settingsOpen}
        aria-label={t('testPanel')}
      >
        <input
          ref={nameRef}
          className={editorStyles.caseName}
          name="testName"
          aria-label={t('testName')}
          required
          maxLength={120}
          value={name}
          disabled={editingLocked}
          onChange={(event) => changeName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          placeholder={t('untitled')}
        />
        <div className={editorStyles.casePanelActions}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={editorStyles.caseEnvironment}
            ref={settingsRef}
            aria-label={settingsOpen ? t('collapsePanel') : t('expandPanel')}
            title={t('testSettings')}
            aria-expanded={settingsOpen}
            aria-controls="case-panel-settings"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Icon
              icon={
                platform === 'web' && webProfile === 'legacy-desktop' ? monitorIcon : smartphoneIcon
              }
              width="16"
              aria-hidden="true"
            />
            <span>
              {platform === 'web' ? 'Web' : platform === 'ios' ? 'iOS' : 'Android'} ·{' '}
              {platform === 'web'
                ? webProfile === 'legacy-desktop'
                  ? t('desktop')
                  : webProfile
                : deviceProfileId || t('selectDevice')}
            </span>
            <Icon icon={settingsIcon} width="14" aria-hidden="true" />
          </Button>
          <div className={editorStyles.casePanelSecondaryActions}>
            <Button
              type="button"
              ref={generateRef}
              variant="ghost"
              size="icon-sm"
              className={editorStyles.casePanelGenerate}
              aria-label={hasSteps ? t('describeChanges') : t('describeGeneration')}
              title={hasSteps ? t('describeChanges') : t('describeGeneration')}
              aria-expanded={composerOpen}
              aria-controls="case-prompt-section"
              data-pending={!!candidate || compiling}
              disabled={saving || !!candidate}
              onClick={() => setComposerOpen(true)}
            >
              <Icon icon={sparklesIcon} width="16" aria-hidden="true" />
            </Button>
            {previous && !candidate && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('undoGeneration')}
                title={t('undoGeneration')}
                disabled={busy}
                onClick={review.undo}
              >
                <Icon icon={undoIcon} width="16" aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className={editorStyles.casePanelPrimaryActions}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              aria-label={t('save')}
              title={t('save')}
              disabled={editingLocked}
            >
              <Icon icon={saveIcon} width="15" aria-hidden="true" />
              <span className={editorStyles.caseSaveLabel}>{t('save')}</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              aria-label={t('trial')}
              title={trialActive ? t('viewActiveTrial') : t('trialHint')}
              disabled={editingLocked}
              onClick={() => void save(true)}
            >
              <Icon icon={playIcon} width="15" aria-hidden="true" /> {t('trial')}
            </Button>
          </div>
        </div>
      </aside>
      {formError && !composerOpen && (
        <p role="alert" className={editorStyles.caseFormError}>
          {formError}
        </p>
      )}
      <div className={styles.container}>
        <PlanBoard
          fullHeight
          plan={reviewPreview}
          review={candidate ? nodeReviews : undefined}
          steps={[]}
          onStep={() => {}}
          onChange={
            editingLocked
              ? undefined
              : (next) => {
                  setComposerOpen(false);
                  review.changePlan(next);
                }
          }
          settingsOpen={settingsOpen}
          onSettingsClose={() => {
            setSettingsOpen(false);
            settingsRef.current?.focus();
          }}
          settings={
            <CaseSettings value={configuration} onChange={changeSettings} busy={editingLocked} />
          }
        />
      </div>
    </form>
  );

  return (
    <section
      data-ui="case-canvas-page"
      ref={canvasRef}
      className={editorStyles.caseCanvasPage}
      aria-label={t('canvas')}
      aria-busy={busy}
    >
      {content}
      {trialId && (
        <TrialRunDialog
          key={trialId}
          id={trialId}
          open={trialOpen}
          onClose={() => setTrialOpen(false)}
          onActiveChange={setTrialActive}
        />
      )}
      {candidate && (
        <div className={editorStyles.caseCanvasPreview} role="status">
          <span>{t('pendingChanges', { count: pendingChanges.length })}</span>
          <Button type="button" size="xs" onClick={() => decideAll(false)}>
            {t('rejectAll')}
          </Button>
          <Button type="button" variant="primary" size="xs" onClick={() => decideAll(true)}>
            {t('acceptAll')}
          </Button>
        </div>
      )}
      <CasePrompt
        open={composerOpen}
        onOpenChange={setComposerOpen}
        container={canvasRef}
        finalFocus={generateRef}
        title={hasSteps ? t('adjustSteps') : t('describeTest')}
        value={goal}
        onChange={setGoal}
        placeholder={hasSteps ? t('changePrompt') : t('prompt')}
        busy={busy}
        onCancel={() => {
          compilation.cancel();
          setFormError(t('cancelledCanvas'));
        }}
        error={formError}
        submitLabel={hasSteps ? t('preview') : t('generate')}
        onSubmit={compile}
      />
    </section>
  );
}
