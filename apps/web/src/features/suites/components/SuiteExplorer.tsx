'use client';

import { createId } from '@/client/id';

import { useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import shellStyles from '@/components/shell/app-shell.module.css';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Icon } from '@iconify/react/offline';
import plusIcon from '@iconify-icons/lucide/plus';
import sparklesIcon from '@iconify-icons/lucide/sparkles';
import { QuickCreateDialog } from '@/features/test-cases/components/QuickCreateDialog';
import { MoveCasesDialog } from './MoveCasesDialog';
import editIcon from '@iconify-icons/lucide/pencil';
import playIcon from '@iconify-icons/lucide/play';
import trashIcon from '@iconify-icons/lucide/trash-2';
import { api } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogHeader, DialogFooter } from '@/components/ui/Dialog';
import { WorkspaceRowMenu } from '@/features/workspace/components/WorkspaceRowMenu';
import { useAuthoring } from '@/features/test-cases/hooks/useAuthoring';
import { writeCaseDraft } from '@/features/test-cases/lib/caseDraft';
import type { SuiteTreeNode } from '@testdog/contracts/suites/types';
import { descendantSuiteIds } from '@testdog/contracts/suites/tree';
import { FolderTreeContext, FolderActionsContext } from '../context';
import { FolderNameDialog } from './FolderNameDialog';
import backIcon from '@iconify-icons/lucide/arrow-left';
import { WorkspaceRealtimeContext } from '@/client/WorkspaceRealtimeContext';
import type { DirectoryItem, DirectoryAction } from '../types';
import { useFolderTree } from '../useFolderTree';
import styles from './Suites.module.css';

export function SuiteExplorer({ children }: { children: ReactNode }) {
  const t = useTranslations('suites');
  const workspace = useTranslations('workspace');
  const promptContainer = useRef<HTMLElement | null>(null);
  const [quickFolder, setQuickFolder] = useState<{ id: string } | null>(null);
  const [moveSelection, setMoveSelection] = useState<{
    ids: string[];
    onMoved?: () => void;
  } | null>(null);
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const selectedCase = params.get('case');
  const selectedFolder = params.get('folder');
  const { emptyPlan, caseName } = useAuthoring();
  const submit = useRunSubmission();
  const [action, setAction] = useState<DirectoryAction | null>(null);
  const edit = action?.kind === 'create' || action?.kind === 'rename' ? action : null;
  const deleting = action?.kind === 'delete' ? action.item : null;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const { data, error: treeError, mutate, connected, refresh } = useFolderTree();
  const folders = data?.folders ?? [];
  const editingCanvas = path.startsWith('/cases/editor/') || !!selectedCase;

  function selectFolder(id: string | null) {
    router.push(id ? `/cases?folder=${id}` : '/cases');
  }

  function createCase(parentId: string | null) {
    const id = createId();
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
        await api.post('/api/suites', { json: { name, parentId: edit.parentId, testIds: [] } });

        setAction(null);
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

    return item.kind === 'folder' ? [...addActions(item.value.id), ...common] : common;
  }

  function addActions(folderId: string) {
    return [
      {
        label: workspace('addTestsWithAI'),
        accessibleLabel: workspace('addTestsWithAI'),
        icon: sparklesIcon,
        disabled: pending,
        onSelect: () => setQuickFolder({ id: folderId }),
      },
      {
        label: workspace('addTestManually'),
        accessibleLabel: workspace('addTestManually'),
        icon: plusIcon,
        disabled: pending,
        onSelect: () => createCase(folderId),
      },
    ];
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

  return (
    <WorkspaceRealtimeContext value={connected}>
      <FolderTreeContext value={data}>
        <FolderActionsContext
          value={{
            createFolder: () => createFolder(null),
            moveCases: (ids, onMoved) => setMoveSelection({ ids, onMoved }),
            renderAddActions: (folder) => (
              <WorkspaceRowMenu
                label={t('addTests')}
                text={t('addTests')}
                icon={plusIcon}
                actions={addActions(folder.id)}
              />
            ),
            renderActions: (folder) => (
              <WorkspaceRowMenu
                label={t('itemActions', { name: folder.name })}
                actions={actions({ kind: 'folder', value: folder })}
              />
            ),
          }}
        >
          <div className={styles.explorer}>
            <div
              ref={(element) => {
                promptContainer.current = element?.closest<HTMLElement>('#main-content') ?? null;
              }}
              className={clsx(styles.folderContent, !editingCanvas && shellStyles.workspacePage)}
              data-ui="suite-content"
              data-editor={editingCanvas || undefined}
            >
              {treeError && (
                <p role="alert" className={styles.treeError}>
                  {t('loadFailed')}{' '}
                  <Button size="sm" onClick={() => mutate()}>
                    {t('retry')}
                  </Button>
                </p>
              )}
              {error && !deleting && (
                <p role="alert" className={styles.treeError}>
                  {error}
                </p>
              )}
              {!editingCanvas && selectedFolder && (
                <div className={styles.editorNavigation}>
                  <Button size="sm" variant="ghost" onClick={() => selectFolder(null)}>
                    <Icon icon={backIcon} width="16" aria-hidden="true" />
                    {t('allCases')}
                  </Button>
                </div>
              )}
              {children}
            </div>
          </div>
        </FolderActionsContext>
        {edit && (
          <FolderNameDialog
            initialName={edit.kind === 'rename' ? edit.item.value.name : undefined}
            onSave={saveName}
            onCancel={() => setAction(null)}
          />
        )}
        {quickFolder && (
          <QuickCreateDialog
            folderId={quickFolder.id}
            container={promptContainer}
            onClose={() => setQuickFolder(null)}
          />
        )}
        {moveSelection && (
          <MoveCasesDialog
            testIds={moveSelection.ids}
            folders={folders}
            onCancel={() => setMoveSelection(null)}
            onMoved={async () => {
              await refresh();
              moveSelection.onMoved?.();
              setMoveSelection(null);
            }}
          />
        )}
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
