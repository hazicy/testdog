# Testdog UI design system

## Source of truth

The case browser is the visual reference. `apps/web/src/app/globals.css` owns the existing typography, spacing, color, border, radius, focus and surface tokens. CSS lengths use rem; geometry APIs retain their native units.

- Page title: 18/26/600; panel title: 13/20/600.
- Navigation and primary data: 13/20/500; metadata: 12/18/400; headers and statuses: 12/18/500.
- Main spacing: 4, 8, 12, 16, 20, 24, 32; row padding and workspace inset retain the intentional 10-unit token.
- Warm App Shell `#F3F3F1`, white workspace, subtle border, Testdog accent `#B45332`.
- Navigation rows: 36; tree rows: 32; indentation: 16; desktop search/filter: 36.
- Data cells use a minimum of 48 with natural wrapping; names clamp to two lines; metadata has a 4-unit gap.
- Existing radius, semantic colors and shadows are reused; no second theme.
- Geist plus system Chinese sans-serif; Lucide 16–18.

## Architecture and reuse

- `components/shell/AppShell.tsx` owns global navigation, workspace switching, account menu and the single Workspace Surface. Detail workbenches can use the surface without page padding.
- `PageHeader`, `SectionHeader`, `SearchInput`, `StatusBadge` and `IntegrationCard` are shared presentation components. They accept existing data and handlers.
- `features/workspace/components/workspace-index.module.css` owns shared Data List density, toolbar and table presentation. Column rules remain specific to each data schema.
- Existing Base UI Button, Input, Select, Checkbox, Dialog, DockTabs and menus remain in use. EmptyState, LoadingState and ListFooter are reused. `FormControls.module.css` shares form typography, desktop control sizing and touch targets without wrapping business form handlers. There is no parallel component library.
- Native forms and feature-specific panels remain local. Create a wrapper only when there are multiple real consumers.

## Audit and migration inventory

| Area         | Existing source                                                             | Migration                                                             |
| ------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Cases        | SuiteExplorer, DirectoryTree, Workspace, WorkspaceList, WorkspaceRows       | Preserve the reference visuals and interactions                       |
| Runs         | Workspace results, RunDetail, RunHeader, DockTabs                           | Shared Data List; full workbench inside shared shell                  |
| Issues       | IssueList, IssueDetail, IssueEditor                                         | Shared page header/search/list/status; preserve workflow and evidence |
| Integrations | Integrations, NotificationChannelForm, BrowserlessForm, NotificationHistory | Grouped service cards, real connection states, shared forms/dialogs   |
| Plugins      | Plugins, ExecutionPluginEditor, acceptance plugins                          | Resource catalog plus existing configuration/detail panels            |
| Settings     | Settings, GeneralSettings, TeamSettings                                     | Sectioned forms and tabs; preserve save/permission behavior           |

## Interaction rules

Use existing URL filters, pagination, validation, disabled and busy states. Keep all business fields and accessible names. Hover, focus-visible and open-menu states use existing tokens; never hide actions from keyboard or touch users. Data tables scroll inside their regions on narrow screens. Each workspace owns its scroll; the document does not scroll.

## Validation

Migrate and validate runs, issues, integrations, plugins and settings in that order. Use existing Playwright scenarios with mocked APIs, plus lint, typecheck and production build. Include the case browser in regression checks after shared-component changes.

## Migration record

| Stage             | Actual implementation                                                                                                                                                    | Validation                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Shared foundation | Extracted PageHeader, SearchInput, StatusBadge; extended the existing AppShell-owned Workspace Surface to authenticated app routes; retained the case browser appearance | Runs filters/pagination, playback and case layout: 4 passed        |
| Runs              | Workspace, WorkspaceList, WorkspaceRows and RunHeader use shared presentation; detail DockTabs stays a workbench inside AppShell                                         | Search URL restoration, history pagination, step/frame playback    |
| Issues            | IssueList uses the shared data list with schema-specific column widths; IssueDetail and IssueEditor retain evidence, comments, verification and classification           | 9 issue workflow tests passed                                      |
| Integrations      | IntegrationCard and SectionHeader group browser and notification services; badges reflect configured/enabled/error/unavailable flags                                     | 6 configuration, secret retention, delivery and retry tests passed |
| Plugins           | Catalog plus existing detail/configuration/drawer; JSON and code fields retain monospace; no synthetic installation status                                               | 2 complete configuration/export flows passed                       |
| Settings          | PageHeader/SectionHeader, existing Tabs and sectioned forms; shared form controls; permission-driven team UI preserved                                                   | 5 settings and 3 team flows passed; app preference flows passed    |

Removed the old outer header/padding styles and duplicated feature search/title styles after their consumers migrated. The native Table, Base UI Select/Dialog/Checkbox, DockTabs and existing loading/empty components remain the source of truth. No API, database schema, permissions or data model changed.

## Final validation result

- Production build, web typecheck and repository lint passed.
- All modified files passed Prettier; the repository-wide exception is listed below.
- 120 unique app UI scenarios passed against the production preview: 115 in the broad run, plus 5 layout assertions updated for the existing bordered surface, renamed case entry, available-width compact mode and separator rounding, then re-run successfully. No workbench business logic changed to make these assertions pass.
- Desktop and 390-unit phone screenshots were inspected for cases, runs, issues, integrations, plugins, settings and plugin configuration; no browser runtime errors or document-level overflow.

## Manual verification and existing exceptions

- Validate real credentials and integration connectivity, actual execution streams and permission differences against a deployed environment. Automated UI scenarios use mocked APIs.
- Three existing marketing-home tests expect obsolete hero copy or the old demo tabs and are outside this app-page migration. Do not modify the homepage to satisfy those assertions.
- The repository-wide formatting check also flags the untouched `features/landing/fonts/ChillBitmap-License.md`; changed files are formatted without rewriting third-party license text.
