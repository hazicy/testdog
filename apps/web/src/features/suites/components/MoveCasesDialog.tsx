'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@iconify/react/offline';
import plusIcon from '@iconify-icons/lucide/plus';
import checkIcon from '@iconify-icons/lucide/check';
import { api } from '@/client/api';
import { Dialog, DialogHeader, DialogFooter } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { SuiteTreeNode } from '@testdog/contracts/suites/types';
import { suiteFolderPath } from '@testdog/contracts/suites/tree';
import styles from './MoveCasesDialog.module.css';

export function MoveCasesDialog({
  testIds,
  folders,
  onMoved,
  onCancel,
}: {
  testIds: string[];
  folders: SuiteTreeNode[];
  onMoved: () => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('suites');
  const [search, setSearch] = useState('');
  const [destination, setDestination] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    if (creating) nameInput.current?.focus();
  }, [creating]);
  const options = [
    { id: 'root', name: t('rootFolder') },
    ...folders.map((folder) => ({ id: folder.id, name: suiteFolderPath(folders, folder.id) })),
  ].filter((option) => option.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  async function save() {
    if (pending || (creating ? !name.trim() : !destination)) return;
    setPending(true);
    setError('');
    try {
      if (!committed.current) {
        if (creating)
          await api.post('/api/suites', { json: { name: name.trim(), parentId: null, testIds } });
        else
          await api.patch('/api/tests/collection', {
            json: { testIds, folderId: destination === 'root' ? null : destination },
          });
        committed.current = true;
      }

      await onMoved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('saveFailed'));
      setPending(false);
    }
  }

  return (
    <Dialog titleId="move-cases-title" busy={pending} onDismiss={onCancel} initialFocus="input">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <DialogHeader>
          <h2 id="move-cases-title">{t('moveToCollection')}</h2>
        </DialogHeader>
        <div className={styles.body}>
          {creating ? (
            <Input
              ref={nameInput}
              aria-label={t('name')}
              placeholder={t('name')}
              value={name}
              maxLength={100}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          ) : (
            <>
              <Input
                aria-label={t('searchCollections')}
                placeholder={t('searchCollections')}
                value={search}
                disabled={pending}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className={styles.options} role="radiogroup" aria-label={t('parentFolder')}>
                {options.map((option) => (
                  <label key={option.id} className={styles.option}>
                    <input
                      type="radio"
                      name="destination"
                      value={option.id}
                      checked={destination === option.id}
                      disabled={pending}
                      onChange={() => setDestination(option.id)}
                    />
                    <span>{option.name}</span>
                    {destination === option.id && (
                      <Icon icon={checkIcon} width="16" aria-hidden="true" />
                    )}
                  </label>
                ))}
                {!options.length && <p className={styles.empty}>{t('noCollectionMatches')}</p>}
              </div>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setCreating(!creating);
              setError('');
            }}
          >
            {!creating && <Icon icon={plusIcon} width="16" aria-hidden="true" />}
            {t(creating ? 'chooseExistingCollection' : 'create')}
          </Button>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" disabled={pending} onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={pending || (creating ? !name.trim() : !destination)}
          >
            {t(creating ? 'createAndMove' : 'move')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
