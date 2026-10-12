import type { ExecutionStep } from '@testdog/contracts/runs/types';
import cameraIcon from '@iconify-icons/lucide/camera';
import checkIcon from '@iconify-icons/lucide/check';
import branchIcon from '@iconify-icons/lucide/git-branch';
import clockIcon from '@iconify-icons/lucide/clock';
import globeIcon from '@iconify-icons/lucide/globe';
import keyboardIcon from '@iconify-icons/lucide/keyboard';
import scrollIcon from '@iconify-icons/lucide/move-vertical';
import pointerIcon from '@iconify-icons/lucide/mouse-pointer-2';

export function actionIcon(step: ExecutionStep) {
  const action = step.action?.action.type;

  if (step.kind === 'assertion') return checkIcon;
  if (step.kind === 'branch') return branchIcon;
  if (step.kind === 'wait' || action === 'wait') return clockIcon;
  if (step.kind === 'navigate' || action === 'navigate') return globeIcon;
  if (action === 'fill' || action === 'press') return keyboardIcon;
  if (action === 'screenshot') return cameraIcon;
  if (action === 'swipe') return scrollIcon;

  return pointerIcon;
}
