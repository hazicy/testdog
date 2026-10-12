import testsIcon from '@iconify-icons/lucide/flask-conical';
import runsIcon from '@iconify-icons/lucide/play';
import issuesIcon from '@iconify-icons/lucide/bug';
import integrationsIcon from '@iconify-icons/lucide/plug';
import settingsIcon from '@iconify-icons/lucide/settings';

export const workspaceNavigation = [
  { href: '/cases', name: '测试用例', icon: testsIcon },
  { href: '/runs', name: '执行记录', icon: runsIcon },
  { href: '/issues', name: '问题追踪', icon: issuesIcon },
  { href: '/integrations', name: '集成', icon: integrationsIcon },
  { href: '/settings', name: '设置', icon: settingsIcon },
] as const;

export function activeWorkspaceNavigation(pathname: string) {
  return workspaceNavigation.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );
}
