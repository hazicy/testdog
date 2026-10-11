import { WorkspaceFeaturePage } from '@/components/shell/WorkspaceFeaturePage';

export default function TestAccountPage() {
  return (
    <WorkspaceFeaturePage
      title="测试账号"
      description="管理测试时使用的账号。"
      guidance="集中管理测试账号的功能尚未开放。你可以先在用例画板中编排登录步骤；测试账号与登录 testdog 的个人账号分别使用。"
      href="/cases"
      action="管理测试用例"
    />
  );
}
