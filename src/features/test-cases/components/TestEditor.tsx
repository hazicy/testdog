'use client';

import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useEffect, useState, useRef, useMemo } from 'react';
import type { TestCase } from '@/features/test-cases/types';
import { api } from '@/client/api';
import { Icon } from '@iconify/react/offline';
import { PlanBoard } from '@/features/runs/components/PlanBoard';
import type { NodeReview } from '@/features/runs/components/PlanNodes';
import {
  reviewPlan,
  resolveReview,
  type PlanReview,
  type ReviewDecisions,
} from '../lib/planReview';
import type { Plan } from '@/automation/compiler/schema';
import { testSchema } from '@/features/test-cases/schemas';
import { caseName, goalUrl, editablePlan, emptyPlan, planText } from '../lib/authoring';
import { clearCaseDraft, writeCaseDraft, type CaseDraft } from '../lib/caseDraft';
import { CaseSettings } from './CaseSettings';
import { initialCaseSettings, caseTarget, type CaseSettingsValue } from '../lib/caseSettings';
import playIcon from '@iconify-icons/lucide/play';
import saveIcon from '@iconify-icons/lucide/save';
import { useRouter } from 'next/navigation';
import { useRunSubmission } from '@/client/useRunSubmission';
import undoIcon from '@iconify-icons/lucide/undo-2';
import collapseIcon from '@iconify-icons/lucide/chevron-up';
import expandIcon from '@iconify-icons/lucide/chevron-down';
import sparklesIcon from '@iconify-icons/lucide/sparkles';
import arrowUpIcon from '@iconify-icons/lucide/arrow-up';

export function TestEditor({
  test,
  duplicate = false,
  onSaved,
  initialDraft,
  draftId,
}: {
  test?: TestCase;
  duplicate?: boolean;
  onSaved: () => Promise<void>;
  initialDraft?: CaseDraft;
  draftId?: string;
}) {
  const router = useRouter();
  const submitRun = useRunSubmission();
  const [savedCase, setSavedCase] = useState<TestCase | undefined>(duplicate ? undefined : test);
  const [name, setName] = useState(
    initialDraft?.name ?? (test ? `${test.name}${duplicate ? '（副本）' : ''}` : caseName('')),
  );
  const nameChanged = useRef(!!test || (!!initialDraft && initialDraft.name !== caseName('')));
  const [configuration, setConfiguration] = useState<CaseSettingsValue>(() => ({
    ...initialCaseSettings(test),
    ...initialDraft?.settings,
    url: initialDraft?.url ?? test?.url ?? '',
  }));
  const { url, platform, webProfile, appId, deviceProfileId, inputRefs, tags } = configuration;

  function changeSettings(patch: Partial<CaseSettingsValue>) {
    setConfiguration((current) => ({ ...current, ...patch }));
  }

  const [goal, setGoal] = useState(initialDraft?.goal ?? test?.goal ?? '');
  const [plan, setPlan] = useState<Plan>(() => {
    if (initialDraft) return initialDraft.plan;

    return test?.plan ? editablePlan(test.plan, name) : emptyPlan(name);
  });
  const hasSteps = Object.values(plan.nodes).some((node) => node.kind === 'task');
  const [composerOpen, setComposerOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const generateRef = useRef<HTMLButtonElement>(null);
  const [promptHint, setPromptHint] = useState('');

  useEffect(() => {
    if (!composerOpen || goal) return;
    const hint = hasSteps ? '补充登录后的验证' : '登录后，验证账号名称';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let index = 0;
    const timer = window.setInterval(
      () => {
        index = reduced ? hint.length : index + 1;
        setPromptHint(hint.slice(0, index));
        if (index >= hint.length) window.clearInterval(timer);
      },
      reduced ? 1 : 65,
    );

    return () => window.clearInterval(timer);
  }, [composerOpen, goal, hasSteps]);

  const [candidate, setCandidate] = useState<{
    url: string;
    review: PlanReview;
    decisions: ReviewDecisions;
  }>();
  const [previous, setPrevious] = useState<{ plan: Plan; name: string; url: string }>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const busy = saving || compiling;
  const editingLocked = busy || !!candidate;

  useEffect(() => {
    if (draftId)
      writeCaseDraft(draftId, {
        test: savedCase ?? test,
        duplicate: savedCase ? false : duplicate,
        name,
        url,
        goal,
        plan,
        settings: configuration,
      });
  }, [draftId, plan, name, url, goal, configuration, test, duplicate, savedCase]);

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
    setCompiling(true);
    setFormError('');
    try {
      const startUrl = platform === 'web' ? url.trim() || goalUrl(goal) : undefined;
      const { plan: source } = await api
        .post('/api/tests/compile', {
          json: {
            goal,
            ...(startUrl ? { url: startUrl } : {}),
            ...(hasSteps ? { currentPlan: plan } : {}),
          },
          timeout: 100000,
          totalTimeout: 100000,
        })
        .json<{ plan: Plan }>();
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
        url: startUrl || url,
        review,
        decisions: {},
      });
      setComposerOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '转换失败，请重试');
    } finally {
      setCompiling(false);
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
        setPrevious({ plan, name, url });
        setPlan(next);
        const root = next.nodes[next.rootId];

        if (root.kind === 'group') setName(root.goal);
        changeSettings({ url: candidate.url });
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
    changeSettings({ url: previous.url });
    setPrevious(undefined);
  }

  async function save(runAfterSave = false) {
    if (editingLocked) return;
    setFormError('');
    if (!hasSteps) {
      setFormError('请点击画板上的 ＋ 添加至少一个步骤。');

      return;
    }

    let inputs: unknown;

    try {
      inputs = JSON.parse(inputRefs);
    } catch {
      setFormError('请在测试设置中填写有效的输入引用 JSON。');
      setSettingsOpen(true);
      setComposerOpen(false);

      return;
    }

    const payload = {
      name,
      ...(platform === 'web' ? { url: url.trim() } : {}),
      target: caseTarget(configuration, inputs),
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
        : platform === 'web' && !url.trim()
          ? '网站地址'
          : platform !== 'web' && !appId.trim()
            ? '应用标识'
            : platform !== 'web' && !deviceProfileId
              ? '设备配置'
              : '测试目标、输入引用和标签';

      setFormError(`请在测试设置中检查${missing}。`);
      setSettingsOpen(true);
      setComposerOpen(false);

      return;
    }

    setSaving(true);
    try {
      const request = savedCase
        ? api.patch(`/api/tests/${savedCase.id}`, { json: parsed.data })
        : api.post('/api/tests', { json: parsed.data });

      if (runAfterSave) {
        const { test: saved } = await request.json<{ test: TestCase }>();

        setSavedCase(saved);
        const { run } = await submitRun<{ run: { id: string } }>('/api/runs', { testId: saved.id });

        if (draftId) clearCaseDraft(draftId);
        router.push(`/runs/${run.id}`);
      } else {
        await request;
        await onSaved();
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const content = (
    <form
      className="case-editor-form case-editor-board"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="case-canvas-content">
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
              className={`case-floating-panel ${settingsOpen ? '' : 'is-collapsed'}`}
              aria-label="测试面板"
            >
              <div className="case-panel-actions">
                <span className="case-panel-platform">
                  {platform === 'web' ? 'Web' : platform === 'ios' ? 'iOS' : 'Android'}
                </span>
                <span className="case-panel-count">
                  {Object.values(reviewPreview.nodes).filter((node) => node.kind === 'task').length}{' '}
                  个步骤
                </span>
                <div className="case-panel-primary-actions">
                  <Button
                    type="button"
                    variant="primary"
                    size="xs"
                    aria-label="Run"
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
                  className="case-panel-generate"
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
                <div className="case-panel-heading">
                  <h2 id="editor-title">{name || '未命名测试'}</h2>
                  <p>{platform === 'web' ? webProfile : deviceProfileId || '未设置设备'}</p>
                </div>
              )}
              {formError && !composerOpen && (
                <p role="alert" className="case-editor-error">
                  {formError}
                </p>
              )}
              {settingsOpen && (
                <div id="case-panel-settings" className="case-panel-body">
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
    <section ref={canvasRef} className="case-canvas-page" aria-label="测试画板" aria-busy={busy}>
      {content}
      {candidate && (
        <div className="case-canvas-preview" role="status">
          <span>{pendingChanges.length} 项变更待审阅</span>
          <Button type="button" size="xs" onClick={() => decideAll(false)}>
            全部拒绝
          </Button>
          <Button type="button" variant="primary" size="xs" onClick={() => decideAll(true)}>
            全部接受
          </Button>
        </div>
      )}
      <BaseDialog.Root open={composerOpen} onOpenChange={setComposerOpen}>
        <BaseDialog.Portal container={canvasRef}>
          <BaseDialog.Backdrop className="case-prompt-backdrop" />
          <BaseDialog.Popup
            id="case-prompt-section"
            className="case-prompt-overlay"
            initialFocus={promptRef}
            finalFocus={generateRef}
            aria-busy={compiling}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void compile();
              }}
            >
              <div className="case-prompt-heading">
                <BaseDialog.Title className="sr-only">
                  {hasSteps ? '调整步骤' : '描述测试'}
                </BaseDialog.Title>
                <BaseDialog.Close
                  className={buttonStyles({ variant: 'ghost', size: 'icon' })}
                  aria-label="关闭描述输入"
                >
                  ×
                </BaseDialog.Close>
              </div>
              <textarea
                ref={promptRef}
                id="case-prompt"
                name="caseText"
                aria-label="测试步骤与预期结果"
                className="case-prompt-input"
                maxLength={20000}
                value={goal}
                disabled={busy}
                placeholder={promptHint}
                onChange={(event) => setGoal(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void compile();
                  }
                }}
              />
              {formError && (
                <p role="alert" className="case-prompt-error">
                  {formError}
                </p>
              )}
              <div className="case-prompt-footer">
                <Button
                  type="submit"
                  variant="primary"
                  title="⌘ / Ctrl + Enter"
                  disabled={busy || !goal.trim()}
                >
                  {compiling ? '生成中…' : hasSteps ? '预览' : '生成'}
                  <Icon icon={arrowUpIcon} width="14" aria-hidden="true" />
                </Button>
              </div>
            </form>
          </BaseDialog.Popup>
        </BaseDialog.Portal>
      </BaseDialog.Root>
    </section>
  );
}
