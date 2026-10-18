'use client';

import type { ComponentProps, Dispatch, SetStateAction, ReactNode } from 'react';
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
  collapsed,
  setCollapsed,
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
  collapsed: Set<string>;
  setCollapsed: Dispatch<SetStateAction<Set<string>>>;
  openCase: (id: string, parentId: string | null) => void;
  selectFolder: (id: string | null) => void;
  saveName: (name: string) => Promise<void>;
  onCancelEdit: () => void;
  getActions: (item: DirectoryItem) => ComponentProps<typeof WorkspaceRowMenu>['actions'];
}) {
  const t = useTranslations('suites');
  const children = new Map<string | null, SuiteTreeNode[]>();

  for (const folder of folders) {
    const siblings = children.get(folder.parentId) ?? [];

    siblings.push(folder);
    children.set(folder.parentId, siblings);
  }

  function inlineRow(parentId: string | null) {
    return edit?.kind === 'create' && edit.parentId === parentId ? (
      <li className={styles.treeRow}>
        <Icon icon={folderIcon} width="16" aria-hidden="true" />
        <InlineName
          key={`new-${parentId}`}
          initialName=""
          onSave={saveName}
          onCancel={onCancelEdit}
        />
      </li>
    ) : null;
  }

  function caseRow(item: { id: string; name: string }, parentId: string | null) {
    const entry: DirectoryItem = { kind: 'case', value: item, parentId };
    const renaming =
      edit?.kind === 'rename' && edit.item.kind === 'case' && edit.item.value.id === item.id;

    return (
      <li
        key={item.id}
        className={styles.treeRow}
        data-selected={selectedCase === item.id || undefined}
      >
        {renaming ? (
          <>
            <Icon icon={fileIcon} width="16" aria-hidden="true" />
            <InlineName
              key={item.id}
              maxLength={120}
              initialName={item.name}
              onSave={saveName}
              onCancel={onCancelEdit}
            />
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              className={styles.treeLink}
              title={item.name}
              aria-current={selectedCase === item.id ? 'page' : undefined}
              onClick={() => openCase(item.id, parentId)}
            >
              <Icon icon={fileIcon} width="16" aria-hidden="true" />
              <span>{item.name}</span>
            </Button>
            <span className={styles.treeActions}>
              <WorkspaceRowMenu
                label={t('itemActions', { name: item.name })}
                actions={getActions(entry)}
              />
            </span>
          </>
        )}
      </li>
    );
  }

  function branch(parentId: string | null, ancestors = new Set<string>()): ReactNode {
    return (children.get(parentId) ?? [])
      .filter((folder) => !ancestors.has(folder.id))
      .map((folder) => {
        const open = !collapsed.has(folder.id);
        const selected = folder.id === selectedFolder && !selectedCase;
        const renaming =
          edit?.kind === 'rename' &&
          edit.item.kind === 'folder' &&
          edit.item.value.id === folder.id;

        return (
          <li key={folder.id}>
            <div className={styles.treeRow} data-selected={selected || undefined}>
              {renaming ? (
                <>
                  <Icon icon={open ? folderOpenIcon : folderIcon} width="16" aria-hidden="true" />
                  <InlineName
                    key={folder.id}
                    initialName={folder.name}
                    onSave={saveName}
                    onCancel={onCancelEdit}
                  />
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    className={styles.treeLink}
                    title={folder.name}
                    aria-current={selected ? 'page' : undefined}
                    aria-expanded={open}
                    onClick={() => {
                      setCollapsed((current) => {
                        const next = new Set(current);

                        if (next.has(folder.id)) next.delete(folder.id);
                        else next.add(folder.id);

                        return next;
                      });
                      selectFolder(folder.id);
                    }}
                  >
                    <Icon icon={open ? folderOpenIcon : folderIcon} width="16" aria-hidden="true" />
                    <span>{folder.name}</span>
                  </Button>
                  <span className={styles.treeActions}>
                    <WorkspaceRowMenu
                      label={t('itemActions', { name: folder.name })}
                      actions={getActions({ kind: 'folder', value: folder })}
                    />
                  </span>
                </>
              )}
            </div>
            {open && (
              <ul className={styles.treeChildren}>
                {inlineRow(folder.id)}
                {branch(folder.id, new Set([...ancestors, folder.id]))}
                {folder.tests.map((item) => caseRow(item, folder.id))}
              </ul>
            )}
          </li>
        );
      });
  }

  return (
    <ul className={styles.tree}>
      {inlineRow(null)}
      {branch(null)}
      {rootTests.map((item) => caseRow(item, null))}
    </ul>
  );
}
