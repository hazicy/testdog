import type { DockTab } from '@/components/ui/DockTabs';

export type RunLayout = 'default' | 'review' | 'notes' | 'debug' | 'focus';
export type PanelId =
  'steps' | 'issues' | 'plan' | 'execution' | 'recording' | 'logs' | 'console' | 'network';
type WorkspaceTab = DockTab & { id: PanelId };

const workspaceTabs: readonly WorkspaceTab[] = [
  { id: 'steps', label: '步骤', initiallyVisible: true, initialWidthRatio: 0.382 },
  {
    id: 'execution',
    label: '回放',
    reference: 'steps',
    direction: 'right',
    initiallyVisible: true,
  },
  { id: 'logs', label: 'AI 调用', reference: 'execution' },
  {
    id: 'console',
    label: '控制台',
    reference: 'execution',
    direction: 'below',
    initialHeight: 260,
    initiallyCollapsed: true,
  },
  { id: 'issues', label: '问题', reference: 'steps' },
  { id: 'plan', label: '计划', reference: 'steps' },
  { id: 'recording', label: '录制脚本', reference: 'execution' },
  { id: 'network', label: '网络', reference: 'console' },
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
