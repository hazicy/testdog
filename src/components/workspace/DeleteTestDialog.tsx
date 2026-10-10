'use client';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';
import type { TestCase } from '@/workspace/types';
import { requestJson as api } from '@/client/api';
import { Dialog } from '../shared/Dialog';

export function DeleteTestDialog({
  test,
  onClose,
  onDeleted,
}: {
  test: TestCase;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  async function remove() {
    setSaving(true);
    setFormError('');
    try {
      await api(`/api/tests/${test.id}`, { method: 'DELETE' });
      await onDeleted();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '删除失败');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog titleId="delete-title" busy={saving} onDismiss={onClose} className="max-w-md">
      <div className="p-6">
        <h2 id="delete-title" className="text-lg font-semibold">
          删除测试？
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#78796f]">
          将删除「{test.name}」。历史执行结果会保留。
        </p>
        {formError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {formError}
          </p>
        )}
      </div>
      <div className="ws-dialog-footer">
        <Button disabled={saving} className="ws-button" onClick={() => onClose()}>
          取消
        </Button>
        <Button
          disabled={saving}
          className="ws-button border-red-200 text-red-700"
          onClick={() => void remove()}
        >
          {saving ? '删除中…' : '删除测试'}
        </Button>
      </div>
    </Dialog>
  );
}
