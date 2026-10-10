import type { useWorkspaceData } from '../hooks/useWorkspaceData';

type Props = Pick<ReturnType<typeof useWorkspaceData>, 'loading' | 'counts' | 'running'> & {
  isTests: boolean;
  testCount: number;
  runCount: number;
};

export function WorkspaceStats({ isTests, testCount, runCount, counts, running, loading }: Props) {
  const finished = counts.passed + counts.failed;

  return (
    <div className="ws-stats mt-7 grid grid-cols-2 lg:grid-cols-4">
      {[
        {
          label: isTests ? '测试用例' : '总执行次数',
          value: isTests ? testCount : runCount,
          note: isTests ? '保存的测试场景' : '全部历史记录',
        },
        {
          label: '通过率',
          value: finished ? `${Math.round((counts.passed / finished) * 100)}%` : '—',
          note: '已完成的执行',
        },
        {
          label: '失败记录',
          value: counts.failed,
          note: '需要关注的执行',
        },
        {
          label: '执行中',
          value: counts.running + counts.queued + counts.preparing + counts.finalizing,
          note: running ? '结果自动更新' : '等待下一次测试',
        },
      ].map((stat) => (
        <div key={stat.label} className="px-5 py-4">
          <p className="text-xs text-page-muted">{stat.label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? '—' : stat.value}</p>
          <p className="mt-1 text-xs text-text-subtle">{stat.note}</p>
        </div>
      ))}
    </div>
  );
}
