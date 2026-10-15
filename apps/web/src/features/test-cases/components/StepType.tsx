'use client';

import { useTranslations } from 'next-intl';

import boardStyles from '@/features/runs/components/plan-board.module.css';

import { Icon } from '@iconify/react/offline';
import navigate from '@iconify-icons/lucide/globe';
import act from '@iconify-icons/lucide/zap';
import assert from '@iconify-icons/lucide/eye';
import login from '@iconify-icons/lucide/key-round';
import files from '@iconify-icons/lucide/paperclip';
import screenshot from '@iconify-icons/lucide/camera';
import group from '@iconify-icons/lucide/list-tree';
import branch from '@iconify-icons/lucide/git-branch';
import type { StepType } from '@testdog/contracts/automation/compiler/schema';

const stepTypes = [
  { value: 'navigate', label: 'Navigate' },
  { value: 'act', label: 'Act' },
  { value: 'assert', label: 'Assert' },
  { value: 'login', label: 'Login' },
  { value: 'files', label: 'Files' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'group', label: 'Group' },
  { value: 'branch', label: 'Branch' },
] as const;

export function useStepTypes() {
  const t = useTranslations('stepTypes');

  return stepTypes.map((item) => ({ ...item, description: t(item.value) }));
}

export type BoardStepType = StepType | 'group' | 'branch';
const icons = { navigate, act, assert, login, files, screenshot, group, branch };

export function StepBadge({ type }: { type: BoardStepType }) {
  return (
    <span data-ui="step-badge" data-type={type} className={boardStyles.stepBadge}>
      <Icon icon={icons[type]} width={18} aria-hidden="true" />
      {stepTypes.find((item) => item.value === type)?.label}
    </span>
  );
}
