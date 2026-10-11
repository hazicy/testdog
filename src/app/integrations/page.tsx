import { WorkspaceFeaturePage } from '@/components/shell/WorkspaceFeaturePage';

export default function IntegrationsPage() {
  return (
    <WorkspaceFeaturePage
      title="集成"
      description="连接测试工作区与外部工具。"
      guidance="外部工具的连接和同步功能尚未开放。你可以在执行记录中导出测试报告，分享本次测试结果。"
      href="/runs"
      action="查看执行记录"
    />
  );
}
