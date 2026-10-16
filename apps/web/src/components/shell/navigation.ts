import testsIcon from '@iconify-icons/lucide/flask-conical';
import runsIcon from '@iconify-icons/lucide/play';
import issuesIcon from '@iconify-icons/lucide/bug';
import integrationsIcon from '@iconify-icons/lucide/plug';
import pluginsIcon from '@iconify-icons/lucide/puzzle';
import settingsIcon from '@iconify-icons/lucide/settings';

export const workspaceNavigation = [
  { href: '/cases', key: 'test_cases', icon: testsIcon },
  { href: '/runs', key: 'runs', icon: runsIcon },
  { href: '/issues', key: 'issues', icon: issuesIcon },
  { href: '/integrations', key: 'integrations', icon: integrationsIcon },
  { href: '/plugins', key: 'plugins', icon: pluginsIcon },
  { href: '/settings', key: 'settings', icon: settingsIcon },
] as const;

export function activeWorkspaceNavigation(pathname: string) {
  return workspaceNavigation.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );
}
