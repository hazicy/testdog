'use client';
import { useState } from 'react';
import type { TestCase } from '@/workspace/types';
import { requestJson as api } from '@/client/api';
import { Dialog } from '../shared/Dialog';
import { WorkspaceIcon as Icon } from '../shared/WorkspaceIcon';

export function TestEditor({
  test,
  duplicate = false,
  onClose,
  onSaved,
}: {
  test?: TestCase;
  duplicate?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(test ? `${test.name}${duplicate ? '（副本）' : ''}` : '');
  const [url, setUrl] = useState(test?.url || '');
  const [goal, setGoal] = useState(test?.goal || '');
  const [tags, setTags] = useState(test?.tags.join(', ') || '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const editing = test && !duplicate;
      await api(editing ? `/api/tests/${test.id}` : '/api/tests', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          url: url.trim(),
          goal,
          tags: tags
            .split(/[,，]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      await onSaved();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog titleId="editor-title" busy={saving} onDismiss={onClose}>
      <form onSubmit={(event) => void save(event)}>
        <div className="ws-dialog-header">
          <div>
            <h2 id="editor-title" className="text-lg font-semibold">
              {test && !duplicate ? '编辑测试' : '新建测试'}
            </h2>
            <p className="mt-1 text-xs text-[#858578]">描述操作与预期结果，由 AI 规划执行。</p>
          </div>
          <button
            type="button"
            className="ws-icon-button"
            disabled={saving}
            aria-label="关闭编辑器"
            onClick={() => onClose()}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="space-y-5 p-6">
          <label className="ws-label">
            测试名称
            <input
              className="ws-input"
              required
              maxLength={120}
              value={name}
              disabled={saving}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：验证登录页面"
            />
          </label>
          <label className="ws-label">
            网站地址
            <input
              className="ws-input"
              required
              type="url"
              value={url}
              disabled={saving}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://your-app.com"
            />
          </label>
          <label className="ws-label">
            测试步骤与预期结果
            <textarea
              className="ws-input min-h-48 resize-y leading-6"
              required
              maxLength={20000}
              value={goal}
              disabled={saving}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={'1. 打开网站首页\n2. 点击登录按钮\n3. 验证页面包含邮箱输入框和提交按钮'}
            />
          </label>
          <p className="text-xs leading-5 text-[#858578]">
            测试会实际操作目标网站。建议使用测试环境，并写明判断通过的条件。
          </p>
          <label className="ws-label">
            标签 <span className="font-normal text-[#98998b]">（可选，逗号分隔）</span>
            <input
              className="ws-input"
              value={tags}
              disabled={saving}
              onChange={(event) => setTags(event.target.value)}
              placeholder="冒烟测试, 登录"
            />
          </label>
          {formError && (
            <p role="alert" className="text-sm text-red-700">
              {formError}
            </p>
          )}
        </div>
        <div className="ws-dialog-footer">
          <button type="button" disabled={saving} className="ws-button" onClick={() => onClose()}>
            取消
          </button>
          <button type="submit" disabled={saving} className="ws-button primary">
            {saving ? '保存中…' : '保存测试'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
