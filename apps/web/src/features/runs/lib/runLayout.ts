import stepsIcon from '@iconify-icons/lucide/list-checks';
import executionIcon from '@iconify-icons/lucide/monitor-play';
import logsIcon from '@iconify-icons/lucide/scroll-text';
import consoleIcon from '@iconify-icons/lucide/terminal';
import issuesIcon from '@iconify-icons/lucide/bug';
import planIcon from '@iconify-icons/lucide/workflow';
import recordingIcon from '@iconify-icons/lucide/file-code';
import networkIcon from '@iconify-icons/lucide/network';
import type { DockTab } from '@/components/ui/DockTabs';

export type RunLayout = 'default' | 'review' | 'notes' | 'debug' | 'focus';
export type PanelId =
  'steps' | 'issues' | 'plan' | 'execution' | 'recording' | 'logs' | 'console' | 'network';
type WorkspaceTab = DockTab & { id: PanelId };

const workspaceTabs: readonly WorkspaceTab[] = [
  {
    id: 'steps',
    icon: stepsIcon,
    label: 'steps',
    initiallyVisible: true,
    initialWidthRatio: 0.382,
  },
  {
    id: 'execution',
    icon: executionIcon,
    label: 'execution',
    reference: 'steps',
    direction: 'right',
    initiallyVisible: true,
  },
  { id: 'logs', icon: logsIcon, label: 'logs', reference: 'execution' },
  {
    id: 'console',
    icon: consoleIcon,
    label: 'console',
    reference: 'execution',
    direction: 'below',
    initialHeight: 260,
    initiallyCollapsed: true,
  },
  { id: 'issues', icon: issuesIcon, label: 'issues', reference: 'steps' },
  { id: 'plan', icon: planIcon, label: 'plan', reference: 'steps' },
  { id: 'recording', icon: recordingIcon, label: 'recording', reference: 'execution' },
  { id: 'network', icon: networkIcon, label: 'network', reference: 'console' },
];
const sideIssues = {
  reference: 'console',
  direction: 'below',
  initiallyVisible: true,
  initialHeight: 260,
} as const;
const layoutOverrides: Record<
  Exclude<RunLayout, 'default' | 'focus'>,
  Partial<Record<PanelId, Partial<Omit<DockTab, 'id'>>>>
> = {
  review: {
    issues: {
      reference: 'execution',
      direction: 'right',
      initiallyVisible: true,
      initialWidthRatio: 0.28,
    },
  },
  notes: {
    console: { direction: 'right', initialWidthRatio: 0.28, initiallyVisible: true },
    issues: sideIssues,
  },
  debug: {
    console: { direction: 'right', initialWidthRatio: 0.28, initiallyVisible: false },
    issues: sideIssues,
  },
};

export function runWorkspaceTabs(layout: RunLayout, issueCount: number): WorkspaceTab[] {
  return workspaceTabs.map((tab): WorkspaceTab => {
    const configured = { ...tab, ...(tab.id === 'issues' ? { badge: issueCount } : {}) };

    if (layout === 'focus')
      return {
        ...configured,
        reference: tab.id === 'steps' ? undefined : 'steps',
        direction: 'within',
        initiallyVisible: tab.id === 'execution',
        initiallyCollapsed: false,
        initialWidthRatio: undefined,
        initialHeight: undefined,
      };
    if (layout === 'default') return configured;

    return {
      ...configured,
      ...(tab.id === 'steps' ? { initialWidthRatio: 0.28 } : {}),
      ...(tab.id === 'console' ? { initiallyCollapsed: false } : {}),
      ...layoutOverrides[layout][tab.id],
    };
  });
}
