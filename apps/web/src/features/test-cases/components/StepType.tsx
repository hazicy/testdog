'use client';

import { Icon } from '@iconify/react/offline';
import act from '@iconify-icons/lucide/zap';
import assert from '@iconify-icons/lucide/eye';
import login from '@iconify-icons/lucide/key-round';
import files from '@iconify-icons/lucide/paperclip';
import screenshot from '@iconify-icons/lucide/camera';
import group from '@iconify-icons/lucide/list-tree';
import branch from '@iconify-icons/lucide/git-branch';
import type { StepType } from '@testdog/contracts/automation/compiler/schema';

export const stepTypes = [
  { value: 'act', label: 'Act', description: '操作页面或应用' },
  { value: 'assert', label: 'Assert', description: '验证预期结果' },
  { value: 'login', label: 'Login', description: '使用输入引用登录' },
  { value: 'files', label: 'Files', description: '打开或下载页面文件' },
  { value: 'screenshot', label: 'Screenshot', description: '保存当前画面截图' },
  { value: 'group', label: 'Group', description: '分组并排展示，组内顺序执行' },
  { value: 'branch', label: 'Branch', description: '根据条件选择路径' },
] as const;
export type BoardStepType = StepType | 'group' | 'branch';
const icons = { act, assert, login, files, screenshot, group, branch };

export function StepBadge({ type }: { type: BoardStepType }) {
  return (
    <span className={`step-badge ${type}`}>
      <Icon icon={icons[type]} width={18} aria-hidden="true" />
      {stepTypes.find((item) => item.value === type)?.label}
    </span>
  );
}
