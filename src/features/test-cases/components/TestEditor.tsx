'use client';

import { Button } from '@/components/ui/Button';
import { useEffect, useState, useRef } from 'react';
import type { TestCase } from '@/features/test-cases/types';
import { api } from '@/client/api';
import { Dialog } from '@/components/shared/Dialog';
import { Icon } from '@iconify/react/offline';
import { PlanBoard } from '@/features/runs/components/PlanBoard';
import type { Plan } from '@/automation/compiler/schema';
import { testSchema } from '@/features/test-cases/schemas';
import { caseName, goalUrl } from '../lib/authoring';
import { editablePlan, emptyPlan, planText } from '../lib/authoring';
import { useRouter } from 'next/navigation';
import { writeCaseDraft, type CaseDraft } from '../lib/caseDraft';
import { CaseSettings } from './CaseSettings';
import { initialCaseSettings, caseTarget, type CaseSettingsValue } from '../lib/caseSettings';
import closeIcon from '@iconify-icons/lucide/x';
import backIcon from '@iconify-icons/lucide/arrow-left';

export function TestEditor({
  test,
  duplicate = false,
  onClose,
  onSaved,
  initialDraft,
  draftId,
}: {
  test?: TestCase;
  duplicate?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  initialDraft?: CaseDraft;
  draftId?: string;
}) {
  const router = useRouter();
  const isPage = !!draftId;
  const [name, setName] = useState(
    initialDraft?.name ?? (test ? `${test.name}${duplicate ? '（副本）' : ''}` : caseName('')),
  );
  const nameChanged = useRef(false);
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
  const [plan, setPlan] = useState<Plan | undefined>(() => {
    if (initialDraft) return initialDraft.plan;
    if (!test?.plan) return undefined;
    const draft = editablePlan(test.plan, name);
    const root = draft.nodes[draft.rootId];

    if (root.kind === 'group') draft.nodes[root.id] = { ...root, goal: name };

    return draft;
  });
  const [mode, setMode] = useState<'text' | 'board'>(initialDraft || test?.plan ? 'board' : 'text');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  function enterCanvas(next: Plan, title: string, startUrl: string) {
    if (isPage) {
      setPlan(next);
      setMode('board');

      return;
    }

    const id = crypto.randomUUID();

    writeCaseDraft(id, { test, duplicate, name: title, url: startUrl, goal, plan: next });
    onClose();
    router.push(`/cases/editor/${id}`);
  }

  useEffect(() => {
    if (draftId && plan)
      writeCaseDraft(draftId, { test, duplicate, name, url, goal, plan, settings: configuration });
  }, [draftId, plan, name, url, goal, configuration, test, duplicate]);

  function changeName(value: string) {
    nameChanged.current = true;
    setName(value);
    if (plan) {
      const root = plan.nodes[plan.rootId];

      if (root.kind === 'group')
        setPlan({
          ...plan,
          nodes: { ...plan.nodes, [root.id]: { ...root, goal: value || '未命名测试' } },
        });
    }
  }

  async function compile() {
    if (saving || compiling || !goal.trim()) return;
    setCompiling(true);
    setFormError('');
    try {
      const startUrl = platform === 'web' ? url.trim() || goalUrl(goal) : undefined;
      const { plan: source } = await api
        .post('/api/tests/compile', {
          json: { goal, ...(startUrl ? { url: startUrl } : {}) },
          timeout: 100000,
          totalTimeout: 100000,
        })
        .json<{ plan: Plan }>();
      const root = source.nodes[source.rootId];
      const title =
        !test && !nameChanged.current ? caseName(root.kind === 'branch' ? goal : root.goal) : name;

      setName(title);
      const next = editablePlan(source, title);
      const nextRoot = next.nodes[next.rootId];

      if (nextRoot.kind === 'group') next.nodes[nextRoot.id] = { ...nextRoot, goal: title };
      setPlan(next);
      if (startUrl && !url.trim()) changeSettings({ url: startUrl });
      setSettingsOpen(false);
      enterCanvas(next, title, startUrl || url);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '转换失败，请重试');
    } finally {
      setCompiling(false);
    }
  }

  function openCanvas() {
    if (saving || compiling) return;
    const title = !test && !nameChanged.current ? caseName(goal) : name;
    const next = plan ?? emptyPlan(title);
    const startUrl = url.trim() || goalUrl(goal) || '';

    setName(title);
    changeSettings({ url: startUrl });
    setFormError('');
    setSettingsOpen(false);
    enterCanvas(next, title, startUrl);
  }

  async function save() {
    if (saving || compiling || !plan) return;
    setFormError('');
    if (!Object.values(plan.nodes).some((node) => node.kind === 'task')) {
      setFormError('请点击画板上的 ＋ 添加至少一个步骤。');

      return;
    }

    let inputs: unknown;

    try {
      inputs = JSON.parse(inputRefs);
    } catch {
      setFormError('请在 Settings 中填写有效的输入引用 JSON。');
      setSettingsOpen(true);

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

      setFormError(`请在 Settings 中检查${missing}。`);
      setSettingsOpen(true);

      return;
    }

    setSaving(true);
    try {
      if (test && !duplicate) await api.patch(`/api/tests/${test.id}`, { json: parsed.data });
      else await api.post('/api/tests', { json: parsed.data });
      await onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const content = (
    <form
      className="case-editor-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void (mode === 'text' ? compile() : save());
      }}
    >
      <div className="ws-dialog-header">
        <div>
          <h2 id="editor-title" className="text-lg font-semibold">
            {mode === 'board' ? name : test && !duplicate ? '编辑测试' : '新建测试'}
          </h2>
          <p className="mt-1 text-xs text-text-subtle">
            {mode === 'text'
              ? '描述操作和预期结果，由 AI 整理成可编辑的步骤画板。'
              : `${platform.toUpperCase()} · ${platform === 'web' ? webProfile : deviceProfileId || '未设置设备'} · ${Object.values(plan?.nodes ?? {}).filter((node) => node.kind === 'task').length} 个步骤`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'board' && (
            <Button
              type="button"
              aria-label="Settings"
              aria-pressed={settingsOpen}
              className="ws-button"
              disabled={saving || compiling}
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              Settings
            </Button>
          )}
          <Button
            type="button"
            className="ws-icon-button"
            disabled={saving || compiling}
            aria-label={isPage ? '返回用例列表' : '关闭编辑器'}
            onClick={onClose}
          >
            <Icon icon={isPage ? backIcon : closeIcon} width="18" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {mode === 'text' ? (
        <div className="case-text-body">
          <label className="ws-label">
            测试步骤与预期结果
            <textarea
              name="caseText"
              aria-label="测试步骤与预期结果"
              className="ws-input case-text-input"
              maxLength={20000}
              value={goal}
              disabled={saving || compiling}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={`打开 https://example.com
点击登录，使用测试账号登录
验证页面显示账号名称`}
            />
          </label>
          <p className="mt-3 text-xs text-page-muted">
            也可以直接打开空画板，点击连线上的 ＋ 自己添加步骤。
          </p>
        </div>
      ) : (
        plan && (
          <div className="case-canvas-content">
            <PlanBoard
              fullHeight
              plan={plan}
              steps={[]}
              onStep={() => {}}
              onChange={
                saving || compiling
                  ? undefined
                  : (next) => {
                      setPlan(next);
                      const root = next.nodes[next.rootId];

                      if (root.kind === 'group') setName(root.goal);
                    }
              }
              settings={
                <CaseSettings
                  name={name}
                  onNameChange={changeName}
                  value={configuration}
                  onChange={changeSettings}
                  busy={saving || compiling}
                />
              }
              settingsOpen={settingsOpen}
              onSettingsClose={() => setSettingsOpen(false)}
            />
          </div>
        )
      )}
      {formError && (
        <p role="alert" className="case-editor-error">
          {formError}
        </p>
      )}
      <div className="ws-dialog-footer">
        {mode === 'text' ? (
          <Button
            key="direct"
            type="button"
            className="ws-button"
            disabled={saving || compiling}
            onClick={openCanvas}
          >
            直接创建画板
          </Button>
        ) : (
          <Button
            key="text"
            type="button"
            className="ws-button"
            disabled={saving || compiling}
            onClick={() => {
              if (plan) setGoal(planText(plan));
              setMode('text');
              setFormError('');
            }}
          >
            返回文本
          </Button>
        )}
        {mode === 'text' ? (
          <Button
            key="compile"
            type="submit"
            className="ws-button primary"
            disabled={saving || compiling || !goal.trim()}
          >
            {compiling ? 'AI 解析中…' : 'AI 创建画板'}
          </Button>
        ) : (
          <Button
            key="save"
            type="submit"
            className="ws-button primary"
            disabled={saving || compiling}
          >
            {saving ? '保存中…' : '保存测试'}
          </Button>
        )}
      </div>
    </form>
  );

  if (isPage)
    return (
      <section className="case-canvas-page" aria-label="测试画板" aria-busy={saving || compiling}>
        {content}
      </section>
    );
  if (test?.plan) return null;

  return (
    <Dialog
      titleId="editor-title"
      className="case-text-dialog"
      busy={saving || compiling}
      onDismiss={onClose}
      initialFocus='[name="caseText"]'
    >
      {content}
    </Dialog>
  );
}
