import { WorkspaceFeaturePage } from '@/components/shell/WorkspaceFeaturePage';

export default function SettingsPage() {
  return (
    <WorkspaceFeaturePage
      title="设置"
      description="管理工作区的偏好与配置。"
      guidance="工作区设置功能尚未开放。单个测试的平台、设备与输入引用可以在用例画板的测试设置中调整。"
      href="/cases"
      action="管理测试用例"
    />
  );
}
