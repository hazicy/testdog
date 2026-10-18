'use client';

import { useEffect, useMemo, useRef, type ComponentProps, type CSSProperties } from 'react';
import { hotkeysCoreFeature, syncDataLoaderFeature } from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import chevronRightIcon from '@iconify-icons/lucide/chevron-right';
import { useTranslations } from 'next-intl';
import { Icon } from '@iconify/react/offline';
import folderIcon from '@iconify-icons/lucide/folder';
import fileIcon from '@iconify-icons/lucide/file-check';
import folderOpenIcon from '@iconify-icons/lucide/folder-open';
import { Button } from '@/components/ui/Button';
import { WorkspaceRowMenu } from '@/features/workspace/components/WorkspaceRowMenu';
import type { SuiteTreeNode } from '@testdog/contracts/suites/types';
import type { DirectoryItem, DirectoryEdit } from '../types';
import { InlineName } from './InlineName';
import styles from './Suites.module.css';

export function DirectoryTree({
  folders,
  rootTests,
  selectedCase,
  selectedFolder,
  edit,
  openCase,
  selectFolder,
  saveName,
  onCancelEdit,
  getActions,
}: {
  folders: SuiteTreeNode[];
  rootTests: { id: string; name: string }[];
  selectedCase: string | null;
  selectedFolder: string | null;
  edit: DirectoryEdit | null;
  openCase: (id: string, parentId: string | null) => void;
  selectFolder: (id: string | null) => void;
  saveName: (name: string) => Promise<void>;
  onCancelEdit: () => void;
  getActions: (item: DirectoryItem) => ComponentProps<typeof WorkspaceRowMenu>['actions'];
}) {
  const t = useTranslations('suites');
  const { items, children } = useMemo(() => {
    const items = new Map<string, DirectoryItem>();
    const children = new Map<string, string[]>();
    const add = (id: string, parentId: string, entry: DirectoryItem) => {
      items.set(id, entry);
      const siblings = children.get(parentId) ?? [];

      siblings.push(id);
      children.set(parentId, siblings);
    };

    for (const folder of folders) {
      add(`folder:${folder.id}`, folder.parentId ? `folder:${folder.parentId}` : 'root', {
        kind: 'folder',
        value: folder,
      });
    }

    for (const folder of folders) {
      for (const item of folder.tests) {
        add(`case:${item.id}`, `folder:${folder.id}`, {
          kind: 'case',
          value: item,
          parentId: folder.id,
        });
      }
    }

    for (const item of rootTests) {
      add(`case:${item.id}`, 'root', { kind: 'case', value: item, parentId: null });
    }

    return { items, children };
  }, [folders, rootTests]);
  const knownFolders = useRef(new Set<string>());
  const creatingIn = edit?.kind === 'create' ? edit.parentId : null;
  const tree = useTree<DirectoryItem>({
    rootItemId: 'root',
    getItemName: (item) => item.getItemData().value.name,
    isItemFolder: (item) => item.getItemData().kind === 'folder',
    dataLoader: {
      getItem: (id) => items.get(id)!,
      getChildren: (id) => children.get(id) ?? [],
    },
    onPrimaryAction: (item) => {
      const entry = item.getItemData();

      if (entry.kind === 'folder') selectFolder(entry.value.id);
      else openCase(entry.value.id, entry.parentId);
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
  });

  useEffect(() => {
    const folderIds = folders.map((folder) => `folder:${folder.id}`);
    const expanded = new Set(tree.getState().expandedItems);

    for (const id of folderIds) {
      if (!knownFolders.current.has(id)) expanded.add(id);
    }

    if (creatingIn) expanded.add(`folder:${creatingIn}`);
    knownFolders.current = new Set(folderIds);
    tree.applySubStateUpdate(
      'expandedItems',
      folderIds.filter((id) => expanded.has(id)),
    );
    tree.rebuildTree();
  }, [tree, items, folders, creatingIn]);

  function inlineRow(parentId: string | null, level: number) {
    return edit?.kind === 'create' && edit.parentId === parentId ? (
      <div
        className={styles.treeRow}
        style={{ '--tree-level': level } as CSSProperties}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Icon icon={folderIcon} width="16" aria-hidden="true" />
        <InlineName
          key={`new-${parentId}`}
          initialName=""
          onSave={saveName}
          onCancel={onCancelEdit}
        />
      </div>
    ) : null;
  }

  return (
    <div {...tree.getContainerProps(t('directory'))} className={styles.tree}>
      {inlineRow(null, 0)}
      {tree
        .getItems()
        .filter((item) => items.has(item.getId()))
        .map((item) => {
          const entry = item.getItemData();
          const { value } = entry;
          const folder = entry.kind === 'folder';
          const selected = folder
            ? selectedFolder === value.id && !selectedCase
            : selectedCase === value.id;
          const renaming =
            edit?.kind === 'rename' &&
            edit.item.kind === entry.kind &&
            edit.item.value.id === value.id;
          const icon = folder ? (item.isExpanded() ? folderOpenIcon : folderIcon) : fileIcon;
          const level = item.getItemMeta().level;

          return (
            <div key={item.getId()} role="none">
              <div
                {...item.getProps()}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.currentTarget.click();
                }}
                className={styles.treeRow}
                style={{ '--tree-level': level } as CSSProperties}
                aria-selected={selected}
                aria-current={selected ? 'page' : undefined}
                data-selected={selected || undefined}
              >
                {renaming ? (
                  <div
                    className={styles.treeRename}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Icon icon={icon} width="16" aria-hidden="true" />
                    <InlineName
                      key={value.id}
                      initialName={value.name}
                      maxLength={folder ? 100 : 120}
                      onSave={saveName}
                      onCancel={onCancelEdit}
                    />
                  </div>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      tabIndex={-1}
                      className={styles.treeLink}
                      title={value.name}
                      aria-expanded={folder ? item.isExpanded() : undefined}
                    >
                      <span
                        className={styles.treeChevron}
                        data-expanded={item.isExpanded() || undefined}
                      >
                        {folder && <Icon icon={chevronRightIcon} width="14" aria-hidden="true" />}
                      </span>
                      <Icon icon={icon} width="16" aria-hidden="true" />
                      <span>{value.name}</span>
                    </Button>
                    <span
                      className={styles.treeActions}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <WorkspaceRowMenu
                        label={t('itemActions', { name: value.name })}
                        actions={getActions(entry)}
                      />
                    </span>
                  </>
                )}
              </div>
              {folder && item.isExpanded() && inlineRow(value.id, level + 1)}
            </div>
          );
        })}
    </div>
  );
}
