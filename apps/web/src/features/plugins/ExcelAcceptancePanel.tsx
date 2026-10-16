'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import type { RunSummary, TestRun } from '@testdog/contracts/runs/types';
import { api, fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import Image from 'next/image';
import { Checkbox } from '@/components/ui/Checkbox';
import { executePlugin, type PluginGroup } from './api';
import { nodePlugins } from './registry';
import { runPluginNodes } from './runAdapter';
import styles from './Plugins.module.css';

type RunPage = { runs: RunSummary[]; nextCursor: string | null };

export function ExcelAcceptancePanel() {
  const t = useTranslations('plugins');
  const [runId, setRunId] = useState('');
  const {
    data: pages,
    error: listError,
    size,
    setSize,
  } = useSWRInfinite<RunPage>(
    (index, previous) =>
      index && !previous?.nextCursor
        ? null
        : `/api/runs?limit=100${index ? `&cursor=${encodeURIComponent(previous!.nextCursor!)}` : ''}`,
    fetchJson,
  );
  const { data, error, isLoading } = useSWR<{ run: TestRun }>(
    runId ? `/api/runs/${runId}` : null,
    fetchJson,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [groups, setGroups] = useState<PluginGroup[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const plugin = nodePlugins[0];
  const nodes = useMemo(() => (data ? runPluginNodes(data.run) : []), [data]);
  const eligible = nodes.filter(plugin.accepts);

  function reset() {
    setSelected([]);
    setGroups([]);
    setFailure('');
    setName('');
  }

  async function exportFile() {
    setBusy(true);
    setFailure('');
    try {
      const result = await executePlugin(plugin, {
        nodes,
        groups,
        readAsset: async (assetId) => {
          if (!nodes.some((node) => node.assets.some((asset) => asset.id === assetId)))
            throw new Error(t('unavailable'));

          return api
            .get(`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(assetId)}`)
            .blob();
        },
      });

      for (const file of result.files ?? []) {
        const href = URL.createObjectURL(file.blob);
        const link = document.createElement('a');

        link.href = href;
        link.download = file.name;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
      }
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.exportPanel}>
      <div className={styles.runPicker}>
        <Select
          aria-label={t('run')}
          disabled={busy}
          value={runId}
          onValueChange={(value) => {
            setRunId(value);
            reset();
          }}
          items={[
            { value: '', label: t('chooseRun') },
            ...(pages
              ?.flatMap((page) => page.runs)
              .map((run) => ({
                value: run.id,
                label: `${run.name} · ${new Date(run.startedAt).toLocaleString()}`,
              })) ?? []),
          ]}
        />
        {pages?.at(-1)?.nextCursor && (
          <Button variant="ghost" disabled={busy} onClick={() => void setSize(size + 1)}>
            {t('more')}
          </Button>
        )}
      </div>
      {(error || listError || failure) && (
        <p role="alert">{failure || error?.message || listError?.message}</p>
      )}
      {isLoading && <p role="status">{t('loading')}</p>}
      {data && (
        <>
          <div className={styles.exportColumns}>
            <section className={styles.screenshotSection}>
              <h3>{t('screenshots')}</h3>
              <div className={styles.nodes}>
                {!eligible.length && <p>{t('empty')}</p>}
                {eligible.map((node) => (
                  <label key={node.id} className={styles.node}>
                    <Checkbox
                      disabled={busy || !node.assets.some((asset) => asset.kind === 'screenshot')}
                      checked={selected.includes(node.id)}
                      onCheckedChange={(checked) =>
                        setSelected((ids) =>
                          checked ? [...ids, node.id] : ids.filter((id) => id !== node.id),
                        )
                      }
                    />
                    {node.assets.find((asset) => asset.kind === 'screenshot') && (
                      <Image
                        className={styles.thumbnail}
                        src={`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(node.assets.find((asset) => asset.kind === 'screenshot')!.id)}`}
                        alt=""
                        width={96}
                        height={64}
                        unoptimized
                      />
                    )}
                    <span>{node.title}</span>
                    {!node.assets.some((asset) => asset.kind === 'screenshot') && (
                      <span>{t('unavailable')}</span>
                    )}
                  </label>
                ))}
              </div>
            </section>
            <section className={styles.exportGroups}>
              <h3>{t('groups')}</h3>
              <div className={styles.groupComposer}>
                <Input
                  aria-label={t('groupName')}
                  placeholder={t('groupName')}
                  value={name}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
                <Button
                  disabled={busy || !name.trim() || !selected.length}
                  onClick={() => {
                    setGroups((items) => [
                      ...items,
                      { id: crypto.randomUUID(), name: name.trim(), nodeIds: [...selected] },
                    ]);
                    setSelected([]);
                    setName('');
                  }}
                >
                  {t('addGroup')}
                </Button>
              </div>
              {!groups.length && <p className={styles.emptyGroups}>{t('noGroups')}</p>}
              {groups.map((group) => (
                <div className={styles.group} key={group.id}>
                  <div>
                    <strong>{group.name}</strong>
                    <ul>
                      {group.nodeIds.map((id) => (
                        <li key={id}>{nodes.find((node) => node.id === id)?.title}</li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    aria-label={t('removeGroup', { name: group.name })}
                    onClick={() =>
                      setGroups((items) => items.filter((item) => item.id !== group.id))
                    }
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                variant="primary"
                disabled={busy || !groups.length}
                onClick={() => void exportFile()}
              >
                {busy ? t('exporting') : t('export')}
              </Button>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
