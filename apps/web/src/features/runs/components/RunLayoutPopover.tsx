'use client';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import styles from './RunLayoutPopover.module.css';

import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Icon } from '@iconify/react/offline';
import layoutIcon from '@iconify-icons/lucide/panels-top-left';
import focusIcon from '@iconify-icons/lucide/maximize';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';

import type { RunLayout } from '@/features/runs/lib/runLayout';

const presets = [
  {
    id: 'default',
    label: 'default',
    columns: '1fr 1fr',
    cells: ['1 / 1 / 3 / 2', '1 / 2 / 2 / 3', '2 / 2 / 3 / 3'],
  },
  {
    id: 'review',
    label: 'review',
    columns: '1fr 1fr 1fr',
    cells: ['1 / 1 / 3 / 2', '1 / 2 / 2 / 3', '2 / 2 / 3 / 3', '1 / 3 / 3 / 4'],
  },
  {
    id: 'notes',
    label: 'notes',
    columns: '1fr 1fr 1fr',
    cells: ['1 / 1 / 3 / 2', '1 / 2 / 3 / 3', '1 / 3 / 2 / 4', '2 / 3 / 3 / 4'],
  },
  {
    id: 'debug',
    label: 'debug',
    columns: '1fr 1fr 1fr',
    cells: ['1 / 1 / 3 / 2', '1 / 2 / 3 / 3', '1 / 3 / 2 / 4', '2 / 3 / 3 / 4'],
  },
] as const;

export function RunLayoutPopover({
  value,
  onChange,
}: {
  value: RunLayout;
  onChange: (layout: RunLayout) => void;
}) {
  const t = useTranslations('runs');
  const [open, setOpen] = useState(false);

  function select(layout: RunLayout) {
    onChange(layout);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={buttonStyles({ variant: 'ghost', size: 'icon-sm' })}
        aria-label={t('layout')}
        title={t('layout')}
      >
        <Icon icon={layoutIcon} width="16" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={10} className={styles.positioner}>
          <Popover.Popup className={styles.popup}>
            <Popover.Title className={styles.title}>{t('layout')}</Popover.Title>
            <Popover.Description className={styles.description}>
              {t('layoutHint')}
            </Popover.Description>
            <div className={styles.container}>
              {presets.map((preset) => (
                <Button
                  key={preset.id}
                  variant="ghost"
                  aria-pressed={value === preset.id}
                  onClick={() => select(preset.id)}
                  className={clsx(
                    styles.preset,
                    value === preset.id ? styles.selectedPreset : styles.unselectedPreset,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={styles.label}
                    style={{ gridTemplateColumns: preset.columns, gridTemplateRows: '1fr 0.35fr' }}
                  >
                    {preset.cells.map((area) => (
                      <span key={area} style={{ gridArea: area }} className={styles.previewCell} />
                    ))}
                  </span>
                  <span className={styles.presetLabel}>{t(`layouts.${preset.label}`)}</span>
                </Button>
              ))}
            </div>
            <div className={styles.footer}>
              <Button
                variant="soft"
                className={styles.focusToggle}
                aria-pressed={value === 'focus'}
                onClick={() => select(value === 'focus' ? 'default' : 'focus')}
              >
                <Icon icon={focusIcon} width="16" aria-hidden="true" />
                {value === 'focus' ? t('exitFocus') : t('focus')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={styles.reset}
                onClick={() => select('default')}
              >
                {t('resetLayout')}
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
