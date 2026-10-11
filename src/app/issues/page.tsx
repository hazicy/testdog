import { WorkspaceFeaturePage } from '@/components/shell/WorkspaceFeaturePage';

export default function IssuesPage() {
  return (
    <WorkspaceFeaturePage
      title="问题追踪"
      description="集中跟进测试中发现的问题。"
      guidance="独立的问题管理功能尚未开放。你可以在执行记录中查看失败步骤、截图和日志，定位测试失败的原因。"
      href="/runs"
      action="查看执行记录"
    />
  );
}
