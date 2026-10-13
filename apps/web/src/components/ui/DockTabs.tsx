'use client';

import { classNames } from '@/components/ui/classNames';

import studioStyles from '@/features/runs/components/run-studio.module.css';
import styles from './DockTabs.module.css';

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewGroupPanelApi,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelProps,
  type IDockviewPanelHeaderProps,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { Icon } from '@iconify/react/offline';
import maximizeIcon from '@iconify-icons/lucide/maximize';
import minimizeIcon from '@iconify-icons/lucide/minimize';
import collapseIcon from '@iconify-icons/lucide/chevron-down';
import expandIcon from '@iconify-icons/lucide/chevron-up';

export type DockTab = {
  id: string;
  label: string;
  badge?: number;
  reference?: string;
  direction?: 'right' | 'below' | 'within';
  initialWidth?: number;
  initialWidthRatio?: number;
  initialHeight?: number;
  initiallyVisible?: boolean;
  initiallyCollapsed?: boolean;
};
const ContentContext = createContext<{
  render: (id: string) => ReactNode;
  visited: Set<string>;
  badges: Record<string, number>;
  collapsedGroups: Set<string>;
  select: (id: string, wasActive?: boolean) => void;
  collapse: (api: DockviewGroupPanelApi, collapsed: boolean) => void;
}>({
  render: () => null,
  visited: new Set(),
  badges: {},
  collapsedGroups: new Set(),
  select: () => {},
  collapse: () => {},
});

function Content({ api }: IDockviewPanelProps) {
  const { render, visited, collapsedGroups } = useContext(ContentContext);
  const [visible, setVisible] = useState(api.isVisible);

  useEffect(() => {
    const subscription = api.onDidVisibilityChange(() => setVisible(api.isVisible));

    return () => subscription.dispose();
  }, [api]);

  return (
    <div className={studioStyles.dockPanel} hidden={!visible || collapsedGroups.has(api.group.id)}>
      {visited.has(api.id) && render(api.id)}
    </div>
  );
}

function Header({ api }: IDockviewPanelHeaderProps) {
  const { select, collapsedGroups, badges } = useContext(ContentContext);
  const [active, setActive] = useState(api.isVisible);
  const beforeActivation = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    const subscription = api.onDidVisibilityChange(() => setActive(api.isVisible));

    return () => subscription.dispose();
  }, [api]);

  return (
    <button
      data-ui="dock-tab-button"
      type="button"
      className={studioStyles.dockTabButton}
      aria-pressed={active}
      aria-expanded={!collapsedGroups.has(api.group.id)}
      onPointerDownCapture={() => {
        beforeActivation.current = api.isVisible;
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' || event.key === ' ') beforeActivation.current = api.isVisible;
      }}
      onClick={() => {
        select(api.id, beforeActivation.current ?? api.isVisible);
        beforeActivation.current = undefined;
      }}
    >
      {api.title}
      {!!badges[api.id] && (
        <span aria-hidden="true" className={styles.label}>
          {badges[api.id]}
        </span>
      )}
    </button>
  );
}

function GroupActions({ api, containerApi }: IDockviewHeaderActionsProps) {
  const { collapsedGroups, collapse } = useContext(ContentContext);
  const collapsed = collapsedGroups.has(api.id);
  const [maximized, setMaximized] = useState(api.isMaximized());
  const restoredSize = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const subscription = containerApi.onDidMaximizedGroupChange(() =>
      setMaximized(api.isMaximized()),
    );

    return () => subscription.dispose();
  }, [api, containerApi]);

  return (
    <div
      className={studioStyles.dockGroupActions}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={maximized ? '还原分组' : '最大化分组'}
        title={maximized ? '还原' : '最大化'}
        onClick={() => {
          if (maximized) {
            api.exitMaximized();
            if (restoredSize.current) api.setSize(restoredSize.current);
          } else {
            if (collapsed) collapse(api, false);
            restoredSize.current = { width: api.width, height: api.height };
            api.maximize();
          }
        }}
      >
        <Icon icon={maximized ? minimizeIcon : maximizeIcon} />
      </button>
      <button
        type="button"
        aria-label={collapsed ? '展开分组' : '折叠分组'}
        title={collapsed ? '展开' : '折叠'}
        aria-expanded={!collapsed}
        onClick={() => {
          if (api.isMaximized()) {
            api.exitMaximized();
            if (restoredSize.current) api.setSize(restoredSize.current);
          }

          collapse(api, !collapsed);
        }}
      >
        <Icon icon={collapsed ? expandIcon : collapseIcon} />
      </button>
    </div>
  );
}

const components = { content: Content };
const tabTheme = { ...themeLight, gap: 1 };

/** Dockview owns tab ordering and activation; visited panels keep their local state. */
export function DockTabs<T extends string>({
  tabs,
  value,
  onChange,
  children,
  className = '',
  label,
  revealPanels,
}: {
  tabs: readonly (Omit<DockTab, 'id'> & { id: T })[];
  value: T;
  onChange: (value: T) => void;
  children: (value: T) => ReactNode;
  className?: string;
  label: string;
  revealPanels?: readonly T[];
}) {
  const dock = useRef<DockviewApi | null>(null);
  const initial = useRef({ tabs, value });
  const change = useRef(onChange);
  const collapsedHeight = 40;
  const expandedHeights = useRef(new Map<string, number>());
  const collapsedWidths = useRef(new Map<string, number>());
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set<string>());
  const [visited, setVisited] = useState(
    () =>
      new Set<string>([value, ...tabs.filter((tab) => tab.initiallyVisible).map((tab) => tab.id)]),
  );

  useEffect(() => {
    change.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const panel = dock.current?.getPanel(value);

    if (panel && !panel.api.isActive) panel.api.setActive();
  }, [value]);

  const reveal = useEffectEvent((id: string) => {
    const panel = dock.current?.getPanel(id);

    if (!panel) return;
    if (collapsedGroups.has(panel.group.id)) collapse(panel.group.api, false);
    panel.api.setActive();
  });

  useEffect(() => {
    for (const id of revealPanels ?? []) reveal(id);
  }, [revealPanels]);

  function collapse(api: DockviewGroupPanelApi, collapsed: boolean) {
    if (api.isMaximized()) api.exitMaximized();
    const group = dock.current?.groups.find((group) => group.id === api.id);

    if (!group) return;
    const sideways =
      collapsedWidths.current.has(api.id) ||
      (api.height >= (dock.current?.height ?? 0) - 1 && api.width < (dock.current?.width ?? 0) - 1);

    if (sideways) {
      if (collapsed) collapsedWidths.current.set(api.id, api.width);
      api.setConstraints({
        minimumWidth: 40,
        maximumWidth: collapsed ? 40 : Number.POSITIVE_INFINITY,
      });
      api.setSize({ width: collapsed ? 40 : collapsedWidths.current.get(api.id) });
      group.element.classList.toggle(studioStyles.dockCollapsedSide, collapsed);
    } else {
      if (collapsed) expandedHeights.current.set(api.id, api.height);
      api.setConstraints({
        minimumHeight: collapsedHeight,
        maximumHeight: collapsed ? collapsedHeight : Number.POSITIVE_INFINITY,
      });
      api.setSize({ height: collapsed ? collapsedHeight : expandedHeights.current.get(api.id) });
    }

    setCollapsedGroups((previous) => {
      const next = new Set(previous);

      if (collapsed) next.add(api.id);
      else next.delete(api.id);

      return next;
    });
  }

  function select(id: string, wasActive?: boolean) {
    const panel = dock.current?.getPanel(id);

    if (!panel) return;
    const group = panel.group;

    if (collapsedGroups.has(group.id)) collapse(group.api, false);
    else if (expandedHeights.current.has(group.id) && (wasActive ?? group.activePanel?.id === id))
      collapse(group.api, true);

    setVisited((previous) => (previous.has(id) ? previous : new Set([...previous, id])));
    panel.api.setActive();
    change.current(id as T);
  }

  return (
    <ContentContext.Provider
      value={{
        render: (id) => children(id as T),
        visited,
        badges: Object.fromEntries(tabs.map((tab) => [tab.id, tab.badge ?? 0])),
        collapsedGroups,
        select,
        collapse,
      }}
    >
      <div
        data-ui="caseforge-dock"
        aria-label={label}
        className={classNames(
          [studioStyles.caseforgeDock, 'dockview-theme-light'].join(' '),
          className,
        )}
      >
        <DockviewReact
          theme={tabTheme}
          components={components}
          defaultTabComponent={Header}
          rightHeaderActionsComponent={GroupActions}
          onReady={({ api }) => {
            dock.current = api;
            for (const tab of initial.current.tabs) {
              api.addPanel({
                id: tab.id,
                title: tab.label,
                component: 'content',
                renderer: 'always',
                inactive: true,
                initialWidth: tab.initialWidth,
                initialHeight: tab.initialHeight,
                position: tab.reference
                  ? { referencePanel: tab.reference, direction: tab.direction ?? 'within' }
                  : api.panels[0]
                    ? { referencePanel: api.panels[0].id }
                    : undefined,
              });
            }

            for (const tab of initial.current.tabs) {
              const width =
                tab.initialWidthRatio === undefined
                  ? tab.initialWidth
                  : api.width * tab.initialWidthRatio;

              if (width || tab.initialHeight) {
                api.getPanel(tab.id)?.group.api.setSize({ width, height: tab.initialHeight });
              }

              if (tab.initiallyVisible) api.getPanel(tab.id)?.api.setActive();
            }

            const collapsed = new Set<string>();

            for (const tab of initial.current.tabs) {
              if (!tab.initiallyCollapsed) continue;
              const group = api.getPanel(tab.id)?.group;

              if (!group) continue;
              expandedHeights.current.set(group.id, tab.initialHeight ?? group.api.height);
              group.api.setConstraints({
                minimumHeight: collapsedHeight,
                maximumHeight: collapsedHeight,
              });
              group.api.setSize({ height: collapsedHeight });
              collapsed.add(group.id);
            }

            setCollapsedGroups(collapsed);
            api.getPanel(initial.current.value)?.api.setActive();
            api.onDidActivePanelChange(({ panel }) => {
              if (!panel) return;
              setVisited((previous) =>
                previous.has(panel.id) ? previous : new Set([...previous, panel.id]),
              );
              change.current(panel.id as T);
            });
          }}
        />
      </div>
    </ContentContext.Provider>
  );
}
