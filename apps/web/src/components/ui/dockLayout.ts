import type { DockviewApi, DockviewGroupPanelApi } from 'dockview-react';
import styles from './DockTabs.module.css';

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

type GroupSize = { axis: 'width' | 'height'; expanded: number };
// Dockview geometry is expressed in pixels by its API.
const collapsedSize = 40;

/** Owns Dockview geometry and the desktop snapshot, independently of React rendering. */
export class DockLayout {
  compact = false;
  reflowing = false;
  private collapsed = new Set<string>();
  private sizes = new Map<string, GroupSize>();
  private desktop?: { layout: ReturnType<DockviewApi['toJSON']>; collapsed: Set<string> };

  constructor(readonly api: DockviewApi) {}

  get collapsedGroups(): Set<string> {
    return new Set(this.collapsed);
  }

  initialize(tabs: readonly DockTab[], value: string) {
    for (const tab of tabs) {
      this.api.addPanel({
        id: tab.id,
        title: tab.label,
        component: 'content',
        renderer: 'always',
        inactive: true,
        initialWidth: tab.initialWidth,
        initialHeight: tab.initialHeight,
        position: tab.reference
          ? { referencePanel: tab.reference, direction: tab.direction ?? 'within' }
          : this.api.panels[0]
            ? { referencePanel: this.api.panels[0].id }
            : undefined,
      });
    }

    for (const tab of tabs) {
      const width =
        tab.initialWidthRatio === undefined
          ? tab.initialWidth
          : this.api.width * tab.initialWidthRatio;

      if (width || tab.initialHeight)
        this.api.getPanel(tab.id)?.group.api.setSize({ width, height: tab.initialHeight });
      if (tab.initiallyVisible) this.api.getPanel(tab.id)?.api.setActive();
    }

    for (const tab of tabs) {
      if (!tab.initiallyCollapsed) continue;
      const group = this.api.getPanel(tab.id)?.group;

      if (!group) continue;
      this.sizes.set(group.id, {
        axis: 'height',
        expanded: tab.initialHeight ?? group.api.height,
      });
      this.applyCollapse(group.api, true);
      this.collapsed.add(group.id);
    }

    this.api.getPanel(value)?.api.setActive();
  }

  canCollapseActiveTab(groupId: string) {
    return !this.compact && this.sizes.get(groupId)?.axis === 'height';
  }

  collapse(api: DockviewGroupPanelApi, collapsed: boolean) {
    if (api.isMaximized()) api.exitMaximized();
    if (!this.api.groups.some((group) => group.id === api.id)) return;
    const axis =
      this.sizes.get(api.id)?.axis ??
      (api.height >= this.api.height - 1 && api.width < this.api.width - 1 ? 'width' : 'height');

    if (collapsed) this.sizes.set(api.id, { axis, expanded: api[axis] });
    this.applyCollapse(api, collapsed, axis);
    if (collapsed) this.collapsed.add(api.id);
    else this.collapsed.delete(api.id);
  }

  private applyCollapse(
    api: DockviewGroupPanelApi,
    collapsed: boolean,
    axis = this.sizes.get(api.id)?.axis ?? 'height',
  ) {
    const size = collapsed ? collapsedSize : this.sizes.get(api.id)?.expanded;

    api.setConstraints(
      axis === 'width'
        ? { minimumWidth: collapsedSize, maximumWidth: collapsed ? collapsedSize : Infinity }
        : { minimumHeight: collapsedSize, maximumHeight: collapsed ? collapsedSize : Infinity },
    );
    api.setSize(axis === 'width' ? { width: size } : { height: size });
    this.api.groups
      .find((group) => group.id === api.id)
      ?.element.classList.toggle(styles.dockCollapsedSide, collapsed && axis === 'width');
  }

  adapt(compact: boolean) {
    if (compact === this.compact) return;
    const activeId = this.api.activePanel?.id;

    this.reflowing = true;
    try {
      if (compact) this.enterCompact();
      else this.restoreDesktop();
      this.compact = compact;
      if (activeId) this.api.getPanel(activeId)?.api.setActive();
    } finally {
      this.reflowing = false;
    }
  }

  private enterCompact() {
    this.desktop = { layout: this.api.toJSON(), collapsed: new Set(this.collapsed) };
    for (const group of this.api.groups) {
      if (group.api.isMaximized()) group.api.exitMaximized();
      group.api.setConstraints({
        minimumWidth: 0,
        maximumWidth: Infinity,
        minimumHeight: 0,
        maximumHeight: Infinity,
      });
      group.element.classList.remove(styles.dockCollapsedSide);
    }

    const group = this.api.panels[0]?.group;

    if (group) {
      for (const panel of [...this.api.panels])
        if (panel.group !== group) panel.api.moveTo({ group, skipSetActive: true });
    }

    this.collapsed.clear();
  }

  private restoreDesktop() {
    if (!this.desktop) return;
    this.api.fromJSON(this.desktop.layout, { reuseExistingPanels: true });
    this.collapsed = new Set(this.desktop.collapsed);
    for (const group of this.api.groups)
      if (this.collapsed.has(group.id)) this.applyCollapse(group.api, true);
  }
}
