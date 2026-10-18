import { test as base } from '@playwright/test';
import { AccountMenu } from '../pages/account-menu.page';
import { LoginPage } from '../pages/login.page';
import { RegisterPage } from '../pages/register.page';
import { WorkspacePage } from '../pages/workspace.page';
import { CaseEditorPage } from '../pages/case-editor.page';
import { RunPage } from '../pages/run.page';
import { IssuesPage } from '../pages/issues.page';
import { IntegrationsPage } from '../pages/integrations.page';
import { SettingsPage } from '../pages/settings.page';
import { SuitesPage } from '../pages/suites.page';
import { TeamsPage } from '../pages/teams.page';
import { PluginsPage } from '../pages/plugins.page';
import { ListPage } from '../pages/list.page';

type Fixtures = {
  accountMenu: AccountMenu;
  loginPage: LoginPage;
  registerPage: RegisterPage;
  workspacePage: WorkspacePage;
  caseEditor: CaseEditorPage;
  runPage: RunPage;
  issuesPage: IssuesPage;
  integrationsPage: IntegrationsPage;
  settingsPage: SettingsPage;
  suitesPage: SuitesPage;
  teamsPage: TeamsPage;
  pluginsPage: PluginsPage;
  listPage: ListPage;
};

export const test = base.extend<Fixtures>({
  accountMenu: async ({ page }, provide) => {
    await provide(new AccountMenu(page));
  },
  loginPage: async ({ page }, provide) => {
    await provide(new LoginPage(page));
  },
  registerPage: async ({ page }, provide) => {
    await provide(new RegisterPage(page));
  },
  workspacePage: async ({ page }, provide) => {
    await provide(new WorkspacePage(page));
  },
  caseEditor: async ({ page }, provide) => {
    await provide(new CaseEditorPage(page));
  },
  runPage: async ({ page }, provide) => {
    await provide(new RunPage(page));
  },
  issuesPage: async ({ page }, provide) => {
    await provide(new IssuesPage(page));
  },
  integrationsPage: async ({ page }, provide) => {
    await provide(new IntegrationsPage(page));
  },
  settingsPage: async ({ page }, provide) => {
    await provide(new SettingsPage(page));
  },
  suitesPage: async ({ page }, provide) => {
    await provide(new SuitesPage(page));
  },
  teamsPage: async ({ page }, provide) => {
    await provide(new TeamsPage(page));
  },
  pluginsPage: async ({ page }, provide) => {
    await provide(new PluginsPage(page));
  },
  listPage: async ({ page }, provide) => {
    await provide(new ListPage(page));
  },
});

export { expect } from '@playwright/test';
