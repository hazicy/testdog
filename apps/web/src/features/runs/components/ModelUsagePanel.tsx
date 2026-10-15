'use client';

import { useTranslations, useFormatter } from 'next-intl';

import styles from './ModelUsagePanel.module.css';
import { useModelCallPurposes } from '@/features/runs/presentation';
import { useEffect, useId, useRef, useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Icon } from '@iconify/react/offline';
import xIcon from '@iconify-icons/lucide/x';
import type { ModelCallSummary, ModelUsage } from '@testdog/contracts/runs/modelCalls';
import { ModelCallTrajectory } from './ModelCallTrajectory';

export function ModelUsagePanel({
  id,
  active,
  onStep,
}: {
  id: string;
  active: boolean;
  onStep: (id: string) => void;
}) {
  const t = useTranslations('runs');
  const format = useFormatter();
  const modelCallPurposes = useModelCallPurposes();
  const data = useSWR<{
    usage: ModelUsage;
    calls: ModelCallSummary[];
  }>(`/api/runs/${id}/model-usage`, fetchJson, { refreshInterval: active ? 5000 : 0 });
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const titleId = useId();
  const drawerId = useId();
  const trigger = useRef<HTMLElement | null>(null);
  const drawer = useRef<HTMLElement | null>(null);
  const selectCall = (callId: string, element: HTMLElement) => {
    trigger.current = element;
    setSelectedId(callId);
  };

  const closeDetail = () => {
    setSelectedId(null);
    trigger.current?.focus();
  };

  const usage = data.data?.usage;
  const calls = data.data?.calls ?? [];
  const search = query.trim().toLowerCase();
  const visibleCalls = calls.filter((call) =>
    `${call.model} ${call.preview ?? ''} ${call.purpose ?? ''} ${modelCallPurposes[call.purpose ?? ''] ?? ''} ${t(`callStatuses.${call.status}`)} ${call.errorCode ?? ''}`
      .toLowerCase()
      .includes(search),
  );
  const selectedIndex = visibleCalls.findIndex((call) => call.id === selectedId);
  const selected = visibleCalls[selectedIndex];
  const previous = visibleCalls[selectedIndex - 1];
  const next = visibleCalls[selectedIndex + 1];
  const totalDuration = calls.reduce((total, call) => total + Math.max(0, call.durationMs), 0);
  const scroll = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const lastScrollTop = useRef(0);
  const wasActive = useRef(active);
  const mutate = data.mutate;

  useEffect(() => {
    if (selectedId) drawer.current?.focus();
  }, [selectedId]);

  useEffect(() => {
    if (wasActive.current && !active) void mutate();
    wasActive.current = active;
  }, [active, mutate]);

  useEffect(() => {
    const element = scroll.current;

    if (!element) return;
    const follow = () => {
      if (following.current) {
        element.scrollTop = element.scrollHeight;
        lastScrollTop.current = element.scrollTop;
      }
    };

    const observer = new ResizeObserver(follow);

    // Follow changes to both the dock size and the list, without a parent timer.
    observer.observe(element);
    const list = element.querySelector('ol');

    if (list) observer.observe(list);
    follow();

    return () => observer.disconnect();
  }, [data.data, search]);

  return (
    <section
      aria-label={t('aiCalls')}
      className={styles.panel}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && selected) {
          event.stopPropagation();
          closeDetail();
        }
      }}
    >
      {!!calls.length && usage && (
        <div className={styles.usage}>
          <span className={styles.toolbarLabel}>{t('duration')}</span>
          <span
            title={t('inputTokens')}
            aria-label={t('inputTokenCount', { count: usage.inputTokens })}
          >
            ↑ {format.number(usage.inputTokens)}
          </span>
          <span
            title={t('outputTokens')}
            aria-label={t('outputTokenCount', { count: usage.outputTokens })}
          >
            ↓ {format.number(usage.outputTokens)}
          </span>
          <span title={t('totalDuration')}>{(usage.durationMs / 1000).toFixed(1)} s</span>
          <input
            className={styles.search}
            type="search"
            aria-label={t('searchAi')}
            placeholder={t('searchCalls')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedId(null);
            }}
          />
        </div>
      )}
      {!!calls.length && (
        <div className={styles.timeline} aria-label={t('modelTimeline')}>
          <span className={styles.timelineLabel}>{t('model')}</span>
          <div className={styles.timelineTrack}>
            {calls.map((call, index) => (
              <button
                key={call.id}
                type="button"
                className={styles.timelineSegment}
                data-status={call.status}
                style={{ flexGrow: totalDuration ? Math.max(0, call.durationMs) : 1 }}
                title={`${call.model} · ${(call.durationMs / 1000).toFixed(2)} s`}
                aria-label={t('viewCall', { index: index + 1, model: call.model })}
                onClick={(event) => {
                  setQuery('');
                  selectCall(call.id, event.currentTarget);
                }}
              />
            ))}
          </div>
        </div>
      )}
      {data.error && (
        <div role="alert" className={styles.error}>
          {t('aiLoadFailed')}
          <Button size="xs" onClick={() => void data.mutate()}>
            {t('retry')}
          </Button>
        </div>
      )}
      <div className={styles.workspace}>
        <div
          ref={scroll}
          className={styles.scroll}
          onScroll={(event) => {
            const element = event.currentTarget;

            const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 24;

            if (atBottom) following.current = true;
            else if (element.scrollTop < lastScrollTop.current) following.current = false;
            lastScrollTop.current = element.scrollTop;
          }}
        >
          {data.isLoading && (
            <p role="status" className={styles.empty}>
              {t('loading')}
            </p>
          )}
          {!data.isLoading && !data.error && !calls.length && (
            <p className={styles.empty}>{t('noAiCalls')}</p>
          )}
          {!!visibleCalls.length && (
            <ol className={styles.calls}>
              {visibleCalls.map((call) => (
                <ModelCallRow
                  key={call.id}
                  call={call}
                  index={calls.indexOf(call) + 1}
                  selected={selectedId === call.id}
                  drawerId={drawerId}
                  onSelect={(element) => selectCall(call.id, element)}
                />
              ))}
            </ol>
          )}
          {!!calls.length && !visibleCalls.length && (
            <p className={styles.empty}>{t('noMatchingCalls')}</p>
          )}
        </div>
        {selected && (
          <aside
            ref={drawer}
            tabIndex={-1}
            id={drawerId}
            aria-labelledby={titleId}
            className={styles.drawer}
          >
            <header className={styles.drawerHeader}>
              <div>
                <h2 id={titleId}>{t('callNumber', { index: calls.indexOf(selected) + 1 })}</h2>
                <span className={styles.drawerModel}>{selected.model}</span>
              </div>
              <nav aria-label={t('switchCall')} className={styles.drawerActions}>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={!previous}
                  onClick={() => previous && setSelectedId(previous.id)}
                >
                  {t('previousCall')}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={!next}
                  onClick={() => next && setSelectedId(next.id)}
                >
                  {t('nextCall')}
                </Button>
                <Button size="xs" variant="ghost" aria-label={t('closeCall')} onClick={closeDetail}>
                  <Icon icon={xIcon} width="16" />
                </Button>
              </nav>
            </header>
            <div className={styles.drawerBody} key={selected.id}>
              <div className={styles.callMeta}>
                <span>{t(`callStatuses.${selected.status}`)}</span>
                <time dateTime={selected.startedAt}>
                  {format.dateTime(new Date(selected.startedAt), {
                    dateStyle: 'short',
                    timeStyle: 'medium',
                    hour12: false,
                  })}
                </time>
                <span>{(selected.durationMs / 1000).toFixed(2)} s</span>
                <span>
                  ↑ {selected.inputTokens == null ? '—' : format.number(selected.inputTokens)} ↓{' '}
                  {selected.outputTokens == null ? '—' : format.number(selected.outputTokens)}
                </span>
                {selected.failedAttempts > 0 && (
                  <span>{t('failedAttempts', { count: selected.failedAttempts })}</span>
                )}
                {selected.retryCount > 0 && (
                  <span>{t('retryCount', { count: selected.retryCount })}</span>
                )}
                {selected.errorCode && (
                  <span className={styles.errorCode}>{selected.errorCode}</span>
                )}
              </div>
              {selected.hasTrace && (
                <ModelCallTrajectory
                  runId={id}
                  callId={selected.id}
                  active={active}
                  onStep={(stepId) => {
                    setSelectedId(null);
                    onStep(stepId);
                  }}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

function ModelCallRow({
  call,
  index,
  selected,
  drawerId,
  onSelect,
}: {
  call: ModelCallSummary;
  index: number;
  selected: boolean;
  drawerId: string;
  onSelect: (element: HTMLButtonElement) => void;
}) {
  const t = useTranslations('runs');
  const format = useFormatter();
  const modelCallPurposes = useModelCallPurposes();

  return (
    <li id={`model-call-${call.id}`} className={styles.call} data-status={call.status}>
      <button
        type="button"
        className={styles.summary}
        aria-label={t('callLabel', { index, model: call.model })}
        aria-controls={selected ? drawerId : undefined}
        aria-expanded={selected}
        aria-current={selected ? 'true' : undefined}
        onClick={(event) => onSelect(event.currentTarget)}
      >
        <span className={styles.callIndex}>{index}</span>
        <span className={styles.role} data-role="assistant">
          {modelCallPurposes[call.purpose ?? ''] ?? t('model')}
        </span>
        <time dateTime={call.startedAt} className={styles.timestamp}>
          {format.dateTime(new Date(call.startedAt), { timeStyle: 'medium', hour12: false })}
        </time>
        <span className={styles.model}>{call.model}</span>
        <span className={styles.preview}>{call.preview || call.errorCode || '—'}</span>
        <span className={styles.status}>{t(`callStatuses.${call.status}`)}</span>
        <span className={styles.duration}>{(call.durationMs / 1000).toFixed(2)} s</span>
        {call.retryCount > 0 && (
          <span className={styles.retry}>{t('retryCount', { count: call.retryCount })}</span>
        )}
      </button>
    </li>
  );
}
