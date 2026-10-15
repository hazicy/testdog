'use client';

import styles from './TestEditor.module.css';
import editorStyles from '@/features/test-cases/components/test-editor.module.css';

import { Button } from '@/components/ui/Button';
import { useEffect, useState, useRef, useMemo } from 'react';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import { api } from '@/client/api';
import { usePlanCompilation } from '@/features/test-cases/hooks/usePlanCompilation';
import { Icon } from '@iconify/react/offline';
import { PlanBoard } from '@/features/runs/components/PlanBoard';
import type { NodeReview } from '@/features/runs/components/PlanNodes';
import {
  reviewPlan,
  resolveReview,
  type PlanReview,
  type ReviewDecisions,
} from '@/features/test-cases/lib/planReview';
import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import { testSchema } from '@testdog/contracts/test-cases/schemas';
import { caseName, editablePlan, emptyPlan, planText } from '@/features/test-cases/lib/authoring';
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
import collapseIcon from '@iconify-icons/lucide/chevron-up';
import expandIcon from '@iconify-icons/lucide/chevron-down';
import sparklesIcon from '@iconify-icons/lucide/sparkles';

export function TestEditor({
  test,
  duplicate = false,
  onSaved,
  initialDraft,
  draftId,
}: {
  test?: TestCase;
  duplicate?: boolean;
  onSaved: (test?: TestCase) => Promise<void>;
  initialDraft?: CaseDraft;
  draftId?: string;
}) {
  const submitRun = useRunSubmission();
  const [savedCase] = useState<TestCase | undefined>(duplicate ? undefined : test);
  const [name, setName] = useState(
    initialDraft?.name ?? (test ? `${test.name}${duplicate ? '（副本）' : ''}` : caseName('')),
  );
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
  const [plan, setPlan] = useState<Plan>(() => {
    const source = initialDraft?.plan ?? test?.plan ?? emptyPlan(name);

    return editablePlan(source, name);
  });
  const hasSteps = Object.values(plan.nodes).some((node) => node.kind === 'task');
  const [composerOpen, setComposerOpen] = useState(false);
  const canvasRef = useRef<HTMLElement>(null);
  const generateRef = useRef<HTMLButtonElement>(null);
  const [candidate, setCandidate] = useState<{
    review: PlanReview;
    decisions: ReviewDecisions;
  }>();
  const [previous, setPrevious] = useState<{ plan: Plan; name: string }>();
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
      });
  }, [draftId, plan, name, goal, configuration, test, duplicate, savedCase]);

  function changeName(value: string) {
    nameChanged.current = true;
    setPrevious(undefined);
    setName(value);
    const root = plan.nodes[plan.rootId];

    if (root.kind === 'group')
      setPlan({
        ...plan,
        nodes: { ...plan.nodes, [root.id]: { ...root, goal: value || '未命名测试' } },
      });
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
      const review = reviewPlan(plan, next);

      setCandidate({
        review,
        decisions: {},
      });
      setComposerOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '转换失败，请重试');
    }
  }

  function decideChanges(decisions: ReviewDecisions) {
    if (!candidate) return;
    try {
      const next = resolveReview(candidate.review, decisions, true);
      const complete = candidate.review.changes.every((change) =>
        Object.hasOwn(decisions, change.id),
      );

      if (!complete) {
        setCandidate({ ...candidate, decisions });
        setFormError('');

        return;
      }

      const accepted = Object.values(decisions).some(Boolean);

      if (accepted || !candidate.review.changes.length) {
        setPrevious({ plan, name });
        setPlan(next);
        const root = next.nodes[next.rootId];

        if (root.kind === 'group') setName(root.goal);
      }

      setCandidate(undefined);
      setComposerOpen(false);
      if (accepted) setGoal('');
      setFormError('');
    } catch {
      setFormError('该变更与其他步骤有关，请先处理关联变更。');
    }
  }

  function decideAll(accept: boolean) {
    if (!candidate) return;
    const decisions = { ...candidate.decisions };

    for (const change of candidate.review.changes) decisions[change.id] ??= accept;
    decideChanges(decisions);
  }

  const reviewPreview = useMemo(
    () => (candidate ? resolveReview(candidate.review, candidate.decisions, true) : plan),
    [candidate, plan],
  );
  const pendingChanges =
    candidate?.review.changes.filter((change) => !Object.hasOwn(candidate.decisions, change.id)) ??
    [];
  const nodeReviews: Record<string, NodeReview> = {};

  for (const change of pendingChanges)
    nodeReviews[change.id] = {
      kind: change.kind,
      before: change.before,
      count: change.nodeIds.length,
      onAccept: () => decideChanges({ ...candidate!.decisions, [change.id]: true }),
      onReject: () => decideChanges({ ...candidate!.decisions, [change.id]: false }),
    };

  function undoGeneration() {
    if (!previous) return;
    setPlan(previous.plan);
    setName(previous.name);
    setPrevious(undefined);
  }

  async function save(trial = false) {
    if (editingLocked) return;
    if (trial && trialId && trialActive) {
      setTrialOpen(true);

      return;
    }

    setFormError('');
    if (!hasSteps) {
      setFormError('请点击画板上的 ＋ 添加至少一个步骤。');

      return;
    }

    const payload = {
      name,
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
        ? '测试名称'
        : platform !== 'web' && !appId.trim()
          ? '应用标识'
          : platform !== 'web' && !deviceProfileId
            ? '设备配置'
            : '测试目标和标签';

      setFormError(
        parsed.error.issues.find((issue) => issue.code === 'custom')?.message ??
          `请在测试设置中检查${missing}。`,
      );
      if (!parsed.error.issues.some((issue) => issue.path[0] === 'plan')) setSettingsOpen(true);
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

        await onSaved(result?.test);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : trial ? '试跑失败' : '保存失败');
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
                  setPrevious(undefined);
                  setComposerOpen(false);
                  setPlan(next);
                  const root = next.nodes[next.rootId];

                  if (root.kind === 'group') setName(root.goal);
                }
          }
          floatingPanel={
            <aside
              className={editorStyles.caseFloatingPanel}
              data-collapsed={!settingsOpen}
              aria-label="测试面板"
            >
              <div className={editorStyles.casePanelActions}>
                <span className={editorStyles.casePanelPlatform}>
                  {platform === 'web' ? 'Web' : platform === 'ios' ? 'iOS' : 'Android'}
                </span>
                <span className={editorStyles.casePanelCount}>
                  {Object.values(reviewPreview.nodes).filter((node) => node.kind === 'task').length}{' '}
                  个步骤
                </span>
                <div className={editorStyles.casePanelPrimaryActions}>
                  <Button
                    type="button"
                    variant="primary"
                    size="xs"
                    aria-label="Run"
                    title={trialActive ? '查看正在进行的试跑' : '试跑当前草稿，不保存用例'}
                    disabled={editingLocked}
                    onClick={() => void save(true)}
                  >
                    <Icon icon={playIcon} width="13" aria-hidden="true" /> Run
                  </Button>
                  <Button type="submit" size="xs" aria-label="Save" disabled={editingLocked}>
                    <Icon icon={saveIcon} width="13" aria-hidden="true" /> Save
                  </Button>
                </div>
                <Button
                  type="button"
                  ref={generateRef}
                  variant="ghost"
                  size="icon-xs"
                  className={editorStyles.casePanelGenerate}
                  aria-label={hasSteps ? '描述调整' : '描述生成'}
                  title={hasSteps ? '描述调整' : '描述生成'}
                  aria-expanded={composerOpen}
                  aria-controls="case-prompt-section"
                  data-pending={!!candidate || compiling}
                  disabled={saving || !!candidate}
                  onClick={() => setComposerOpen(true)}
                >
                  <Icon icon={sparklesIcon} width="14" aria-hidden="true" />
                </Button>
                {previous && !candidate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="撤销生成"
                    title="撤销生成"
                    disabled={busy}
                    onClick={undoGeneration}
                  >
                    <Icon icon={undoIcon} width="14" aria-hidden="true" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={settingsOpen ? '收起面板' : '展开面板'}
                  aria-expanded={settingsOpen}
                  aria-controls="case-panel-settings"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                >
                  <Icon
                    icon={settingsOpen ? collapseIcon : expandIcon}
                    width="16"
                    aria-hidden="true"
                  />
                </Button>
              </div>
              {settingsOpen && (
                <div className={editorStyles.casePanelHeading}>
                  <h2 id="editor-title">{name || '未命名测试'}</h2>
                  <p>{platform === 'web' ? webProfile : deviceProfileId || '未设置设备'}</p>
                </div>
              )}
              {formError && !composerOpen && (
                <p role="alert" className={styles.error}>
                  {formError}
                </p>
              )}
              {settingsOpen && (
                <div id="case-panel-settings" className={editorStyles.casePanelBody}>
                  <CaseSettings
                    name={name}
                    onNameChange={changeName}
                    value={configuration}
                    onChange={changeSettings}
                    busy={editingLocked}
                  />
                </div>
              )}
            </aside>
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
      aria-label="测试画板"
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
          <span>{pendingChanges.length} 项变更待审阅</span>
          <Button type="button" size="xs" onClick={() => decideAll(false)}>
            全部拒绝
          </Button>
          <Button type="button" variant="primary" size="xs" onClick={() => decideAll(true)}>
            全部接受
          </Button>
        </div>
      )}
      <CasePrompt
        open={composerOpen}
        onOpenChange={setComposerOpen}
        container={canvasRef}
        finalFocus={generateRef}
        title={hasSteps ? '调整步骤' : '描述测试'}
        value={goal}
        onChange={setGoal}
        placeholder={
          hasSteps
            ? '描述要新增或修改的步骤，以及预期结果…'
            : '描述测试步骤和预期结果，可附上网站地址…'
        }
        busy={busy}
        onCancel={() => {
          compilation.cancel();
          setFormError('已取消生成，画板和描述已保留。');
        }}
        error={formError}
        submitLabel={hasSteps ? '预览' : '生成'}
        onSubmit={compile}
      />
    </section>
  );
}
