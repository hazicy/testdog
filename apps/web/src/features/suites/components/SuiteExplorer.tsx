'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Icon } from '@iconify/react/offline';
import panelCloseIcon from '@iconify-icons/lucide/panel-left-close';
import panelOpenIcon from '@iconify-icons/lucide/panel-left-open';
import filesIcon from '@iconify-icons/lucide/files';
import folderIcon from '@iconify-icons/lucide/folder';
import fileIcon from '@iconify-icons/lucide/file-check';
import plusIcon from '@iconify-icons/lucide/plus';
import editIcon from '@iconify-icons/lucide/pencil';
import moveIcon from '@iconify-icons/lucide/folder-input';
import playIcon from '@iconify-icons/lucide/play';
import trashIcon from '@iconify-icons/lucide/trash-2';
import { api } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Dialog, DialogHeader, DialogFooter } from '@/components/ui/Dialog';
import { WorkspaceRowMenu } from '@/features/workspace/components/WorkspaceRowMenu';
import { useAuthoring } from '@/features/test-cases/hooks/useAuthoring';
import { writeCaseDraft } from '@/features/test-cases/lib/caseDraft';
import type { SuiteTreeNode } from '@testdog/contracts/suites/types';
import { descendantSuiteIds, suiteFolderPath } from '@testdog/contracts/suites/tree';
import { FolderTreeContext } from '../context';
import { WorkspaceRealtimeContext } from '@/client/WorkspaceRealtimeContext';
import { DirectoryTree } from './DirectoryTree';
import type { DirectoryItem, DirectoryAction } from '../types';
import { useFolderTree } from '../useFolderTree';
import styles from './Suites.module.css';

export function SuiteExplorer({ children }: { children: ReactNode }) {
  const t = useTranslations('suites');
  const ui = useTranslations('ui');
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const selectedCase = params.get('case');
  const selectedFolder = params.get('folder');
  const targetFolder = useRef(selectedFolder);

  useEffect(() => {
    targetFolder.current = selectedFolder;
  }, [selectedFolder]);
  const { emptyPlan, caseName } = useAuthoring();
  const submit = useRunSubmission();
  const [directoryCollapsed, setDirectoryCollapsed] = useState(false);
  const [action, setAction] = useState<DirectoryAction | null>(null);
  const edit = action?.kind === 'create' || action?.kind === 'rename' ? action : null;
  const moving = action?.kind === 'move' ? action.item : null;
  const destination = action?.kind === 'move' ? action.destination : null;
  const deleting = action?.kind === 'delete' ? action.item : null;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const { data, error: treeError, mutate, connected, refresh } = useFolderTree();
  const folders = data?.folders ?? [];
  const editingCanvas = path.startsWith('/cases/editor/') || !!selectedCase;

  function selectFolder(id: string | null) {
    targetFolder.current = id;
    router.push(id ? `/cases?folder=${id}` : '/cases');
  }

  function openCase(id: string, parentId: string | null) {
    targetFolder.current = parentId;
    router.push(
      `/cases?${new URLSearchParams({ ...(parentId ? { folder: parentId } : {}), case: id })}`,
    );
  }

  function createCase(parentId: string | null) {
    const id = crypto.randomUUID();
    const name = caseName('');

    writeCaseDraft(id, { name, goal: '', plan: emptyPlan(name), folderId: parentId });
    router.push(`/cases/editor/${id}${parentId ? `?folder=${parentId}` : ''}`);
  }

  function createFolder(parentId: string | null) {
    setError('');
    setAction({ kind: 'create', parentId });
  }

  async function updateFolder(
    folder: SuiteTreeNode,
    patch: { name?: string; parentId?: string | null },
  ) {
    await api.patch(`/api/suites/${folder.id}`, {
      json: { name: folder.name, parentId: folder.parentId, version: folder.version, ...patch },
    });
  }

  async function saveName(name: string) {
    if (!edit) return;
    if (pending) throw new Error(t('saving'));
    setPending(true);
    try {
      if (edit.kind === 'create') {
        const result = await api
          .post('/api/suites', { json: { name, parentId: edit.parentId, testIds: [] } })
          .json<{ id: string }>();

        setAction(null);
        selectFolder(result.id);
      } else {
        const { item } = edit;

        if (item.kind === 'folder') await updateFolder(item.value, { name });
        else {
          await api.patch(`/api/tests/${item.value.id}/name`, { json: { name } });
        }

        setAction(null);
      }

      await refresh();
    } finally {
      setPending(false);
    }
  }

  async function perform(action: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('saveFailed'));
    } finally {
      setPending(false);
    }
  }

  async function run(item: DirectoryItem) {
    await perform(async () => {
      if (item.kind === 'folder') {
        const { batchId } = await submit<{ batchId: string }>(
          `/api/suites/${item.value.id}/runs`,
          {},
        );

        router.push(`/cases/batches/${batchId}`);
      } else {
        const { run } = await submit<{ run: { id: string } }>('/api/runs', {
          testId: item.value.id,
        });

        router.push(`/runs/${run.id}`);
      }
    });
  }

  function actions(item: DirectoryItem) {
    const common = [
      {
        label: t('rename'),
        accessibleLabel: t('rename'),
        icon: editIcon,
        disabled: pending,
        onSelect: () => setAction({ kind: 'rename', item }),
      },
      {
        label: t('move'),
        accessibleLabel: t('move'),
        icon: moveIcon,
        disabled: pending,
        onSelect: () => {
          setError('');
          setAction({
            kind: 'move',
            item,
            destination: item.kind === 'folder' ? item.value.parentId : item.parentId,
          });
        },
      },
      {
        label: t(item.kind === 'folder' ? 'run' : 'runCase'),
        accessibleLabel: t(item.kind === 'folder' ? 'run' : 'runCase'),
        icon: playIcon,
        disabled: pending || (item.kind === 'folder' && !item.value.totalTestCount),
        onSelect: () => void run(item),
      },
      {
        label: t('deleteItem'),
        accessibleLabel: t('deleteItem'),
        icon: trashIcon,
        danger: true,
        disabled: pending,
        onSelect: () => {
          setError('');
          setAction({ kind: 'delete', item });
        },
      },
    ];

    return item.kind === 'folder'
      ? [
          {
            label: t('newCase'),
            disabled: pending,
            accessibleLabel: t('newCase'),
            icon: fileIcon,
            onSelect: () => createCase(item.value.id),
          },
          {
            label: t('newChildFolder'),
            disabled: pending,
            accessibleLabel: t('newChildFolder'),
            icon: folderIcon,
            onSelect: () => createFolder(item.value.id),
          },
          ...common,
        ]
      : common;
  }

  async function moveItem() {
    if (!moving) return;
    await perform(async () => {
      if (moving.kind === 'folder') await updateFolder(moving.value, { parentId: destination });
      else
        await api.patch(`/api/tests/${moving.value.id}/folder`, {
          json: { folderId: destination },
        });
      if (moving.kind === 'case' && selectedCase === moving.value.id)
        openCase(moving.value.id, destination);
      setAction(null);
      await refresh();
    });
  }

  async function deleteItem() {
    if (!deleting) return;
    await perform(async () => {
      await api.delete(
        `/api/${deleting.kind === 'folder' ? 'suites' : 'tests'}/${deleting.value.id}`,
      );
      const removedFolder =
        deleting.kind === 'folder' &&
        selectedFolder &&
        descendantSuiteIds(folders, deleting.value.id).has(selectedFolder);

      if (removedFolder || (deleting.kind === 'case' && selectedCase === deleting.value.id))
        selectFolder(deleting.kind === 'case' ? deleting.parentId : deleting.value.parentId);
      setAction(null);
      await refresh();
    });
  }

  const excluded =
    moving?.kind === 'folder' ? descendantSuiteIds(folders, moving.value.id) : new Set<string>();

  return (
    <WorkspaceRealtimeContext value={connected}>
      <FolderTreeContext value={data}>
        <div className={styles.explorer} data-directory-collapsed={directoryCollapsed || undefined}>
          <aside className={styles.directory} aria-label={t('directory')}>
            <div className={styles.treeHeader}>
              <h2 className={styles.treeTitle} hidden={directoryCollapsed}>
                {ui('test_cases')}
              </h2>
              <Button
                variant="ghost"
                size="icon-xs"
                className={styles.directoryToggle}
                aria-label={t(directoryCollapsed ? 'expandDirectory' : 'collapseDirectory')}
                title={t(directoryCollapsed ? 'expandDirectory' : 'collapseDirectory')}
                aria-expanded={!directoryCollapsed}
                aria-controls="case-directory"
                onClick={() => setDirectoryCollapsed((current) => !current)}
              >
                <Icon
                  icon={directoryCollapsed ? panelOpenIcon : panelCloseIcon}
                  width="16"
                  aria-hidden="true"
                />
              </Button>
              <span hidden={directoryCollapsed}>
                <WorkspaceRowMenu
                  label={t('createItem')}
                  icon={plusIcon}
                  actions={[
                    {
                      label: t('newCase'),
                      disabled: pending,
                      accessibleLabel: t('newCase'),
                      icon: fileIcon,
                      onSelect: () => createCase(targetFolder.current),
                    },
                    {
                      label: t('create'),
                      disabled: pending,
                      accessibleLabel: t('create'),
                      icon: folderIcon,
                      onSelect: () => createFolder(targetFolder.current),
                    },
                  ]}
                />
              </span>
            </div>
            <div id="case-directory" className={styles.directoryBody} hidden={directoryCollapsed}>
              {moving && (
                <section
                  className={styles.movePanel}
                  aria-label={t('moveTitle', { name: moving.value.name })}
                >
                  <strong>{t('moveTitle', { name: moving.value.name })}</strong>
                  <Select
                    aria-label={t('parentFolder')}
                    value={destination ?? 'root'}
                    onValueChange={(value) =>
                      setAction({
                        kind: 'move',
                        item: moving,
                        destination: value === 'root' ? null : value,
                      })
                    }
                    disabled={pending}
                    items={[
                      { value: 'root', label: t('rootFolder') },
                      ...folders
                        .filter((folder) => !excluded.has(folder.id))
                        .map((folder) => ({
                          value: folder.id,
                          label: suiteFolderPath(folders, folder.id),
                        })),
                    ]}
                  />
                  <div className={styles.toolbar}>
                    <Button size="sm" disabled={pending} onClick={() => setAction(null)}>
                      {t('cancel')}
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={pending}
                      onClick={() => void moveItem()}
                    >
                      {t('move')}
                    </Button>
                  </div>
                </section>
              )}
              {error && !deleting && (
                <p role="alert" className={styles.treeError}>
                  {error}
                </p>
              )}
              <nav aria-label={t('directory')} className={styles.treeNavigation}>
                <div
                  className={styles.treeRow}
                  data-selected={
                    (!selectedFolder && !selectedCase && path === '/cases') || undefined
                  }
                >
                  <Button
                    variant="ghost"
                    className={styles.treeLink}
                    aria-current={
                      !selectedFolder && !selectedCase && path === '/cases' ? 'page' : undefined
                    }
                    onClick={() => selectFolder(null)}
                  >
                    <Icon icon={filesIcon} width="16" aria-hidden="true" />
                    <span>{t('allCases')}</span>
                  </Button>
                </div>
                <div role="separator" className={styles.treeDivider} />
                {treeError ? (
                  <Button onClick={() => mutate()}>{t('retry')}</Button>
                ) : (
                  <DirectoryTree
                    folders={folders}
                    rootTests={data?.rootTests ?? []}
                    selectedCase={selectedCase}
                    selectedFolder={selectedFolder}
                    edit={edit}
                    openCase={openCase}
                    selectFolder={selectFolder}
                    saveName={saveName}
                    onCancelEdit={() => setAction(null)}
                    getActions={actions}
                  />
                )}
              </nav>
            </div>
          </aside>
          <div
            className={styles.folderContent}
            data-ui="suite-content"
            data-editor={editingCanvas || undefined}
          >
            {children}
          </div>
        </div>
        {deleting && (
          <Dialog titleId="delete-tree-item" busy={pending} onDismiss={() => setAction(null)}>
            <DialogHeader>
              <h2 id="delete-tree-item">{t('deleteItem')}</h2>
            </DialogHeader>
            <div className={styles.editor}>
              <p>
                {t(deleting.kind === 'folder' ? 'deleteConfirm' : 'deleteCaseConfirm', {
                  name: deleting.value.name,
                })}
              </p>
              {error && <p role="alert">{error}</p>}
            </div>
            <DialogFooter>
              <Button disabled={pending} onClick={() => setAction(null)}>
                {t('cancel')}
              </Button>
              <Button variant="danger" disabled={pending} onClick={() => void deleteItem()}>
                {t('deleteItem')}
              </Button>
            </DialogFooter>
          </Dialog>
        )}
      </FolderTreeContext>
    </WorkspaceRealtimeContext>
  );
}
