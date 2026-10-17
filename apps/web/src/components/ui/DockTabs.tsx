'use client';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import { DockLayout, type DockTab } from './dockLayout';
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

export type { DockTab } from './dockLayout';

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
    <div className={styles.dockPanel} hidden={!visible || collapsedGroups.has(api.group.id)}>
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
      className={styles.dockTabButton}
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
  const t = useTranslations('dock');
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
    <div className={styles.dockGroupActions} onPointerDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label={maximized ? t('restoreGroup') : t('maximizeGroup')}
        title={maximized ? t('restore') : t('maximize')}
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
        aria-label={collapsed ? t('expandGroup') : t('collapseGroup')}
        title={collapsed ? t('expand') : t('collapse')}
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
  const t = useTranslations('dock');
  const container = useRef<HTMLDivElement>(null);
  const mobileTabs = useRef<HTMLDivElement>(null);
  const layout = useRef<DockLayout | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [activeId, setActiveId] = useState<string>(value);
  const initial = useRef({ tabs, value });
  const change = useRef(onChange);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set<string>());
  const [visited, setVisited] = useState(
    () =>
      new Set<string>([value, ...tabs.filter((tab) => tab.initiallyVisible).map((tab) => tab.id)]),
  );

  useEffect(() => {
    change.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const panel = layout.current?.api.getPanel(value);

    if (panel && !panel.api.isActive) panel.api.setActive();
  }, [value]);
  useEffect(() => {
    const list = mobileTabs.current;
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');

    if (!list || !selected) return;
    const listBounds = list.getBoundingClientRect();
    const tabBounds = selected.getBoundingClientRect();
    const offset =
      tabBounds.left < listBounds.left
        ? tabBounds.left - listBounds.left
        : Math.max(0, tabBounds.right - listBounds.right);

    // Reveal the tab within its strip without scrolling the surrounding page.
    list.scrollLeft += offset;
  }, [activeId, isCompact]);

  useEffect(() => {
    for (const tab of tabs) layout.current?.api.getPanel(tab.id)?.api.setTitle(tab.label);
  }, [tabs]);

  function collapse(api: DockviewGroupPanelApi, collapsed: boolean) {
    const current = layout.current;

    if (!current) return;
    current.collapse(api, collapsed);
    const activePanel = current.api.groups.find((group) => group.id === api.id)?.activePanel;

    if (!collapsed && activePanel) setVisited((previous) => new Set([...previous, activePanel.id]));
    setCollapsedGroups(current.collapsedGroups);
  }

  const reveal = useEffectEvent((id: string) => {
    const panel = layout.current?.api.getPanel(id);

    if (!panel) return;
    if (collapsedGroups.has(panel.group.id)) collapse(panel.group.api, false);
    panel.api.setActive();
  });

  useEffect(() => {
    for (const id of revealPanels ?? []) reveal(id);
  }, [revealPanels]);

  const adaptLayout = useEffectEvent((nextCompact: boolean) => {
    const current = layout.current;

    if (!current || nextCompact === current.compact) return;
    current.adapt(nextCompact);
    setCollapsedGroups(current.collapsedGroups);
    setIsCompact(current.compact);
    const activeId = current.api.activePanel?.id;

    if (activeId) setActiveId(activeId);
  });

  useEffect(() => {
    const element = container.current;

    if (!element) return;
    const observer = new ResizeObserver(() =>
      adaptLayout(
        element.clientWidth < 768 ||
          (window.matchMedia('(pointer: coarse)').matches && element.clientWidth < 1024),
      ),
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  function select(id: string, wasActive?: boolean) {
    const panel = layout.current?.api.getPanel(id);

    if (!panel) return;
    const group = panel.group;

    if (collapsedGroups.has(group.id)) collapse(group.api, false);
    else if (
      layout.current?.canCollapseActiveTab(group.id) &&
      (wasActive ?? group.activePanel?.id === id)
    )
      collapse(group.api, true);

    setVisited((previous) => (previous.has(id) ? previous : new Set([...previous, id])));
    panel.api.setActive();
    setActiveId(id);
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
        ref={container}
        data-ui="dock"
        data-compact={isCompact}
        aria-label={label}
        className={clsx(styles.dock, 'dockview-theme-light', className)}
      >
        {isCompact && (
          <div
            ref={mobileTabs}
            className={styles.mobileTabs}
            role="tablist"
            aria-label={t('tabs', { label })}
          >
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeId === tab.id}
                tabIndex={activeId === tab.id ? 0 : -1}
                className={styles.dockTabButton}
                onClick={() => select(tab.id)}
                onKeyDown={(event) => {
                  const nextIndex =
                    event.key === 'ArrowRight'
                      ? (index + 1) % tabs.length
                      : event.key === 'ArrowLeft'
                        ? (index - 1 + tabs.length) % tabs.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? tabs.length - 1
                            : undefined;

                  if (nextIndex === undefined) return;
                  event.preventDefault();
                  event.stopPropagation();
                  select(tabs[nextIndex].id);
                  mobileTabs.current
                    ?.querySelectorAll<HTMLButtonElement>('button')
                    [nextIndex]?.focus();
                }}
              >
                {tab.label}
                {!!tab.badge && <span className={styles.label}>{tab.badge}</span>}
              </button>
            ))}
          </div>
        )}
        <div className={styles.surface}>
          <DockviewReact
            disableDnd={isCompact}
            theme={tabTheme}
            components={components}
            defaultTabComponent={Header}
            rightHeaderActionsComponent={GroupActions}
            onReady={({ api }) => {
              const current = new DockLayout(api);

              layout.current = current;
              current.initialize(initial.current.tabs, initial.current.value);
              setCollapsedGroups(current.collapsedGroups);
              api.onDidActivePanelChange(({ panel }) => {
                if (!panel || current.reflowing) return;
                setActiveId(panel.id);
                setVisited((previous) =>
                  previous.has(panel.id) ? previous : new Set([...previous, panel.id]),
                );
                change.current(panel.id as T);
              });
            }}
          />
        </div>
      </div>
    </ContentContext.Provider>
  );
}
