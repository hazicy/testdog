'use client';

import clsx from 'clsx';

import styles from './RunLayoutPopover.module.css';

import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Icon } from '@iconify/react/offline';
import layoutIcon from '@iconify-icons/lucide/panels-top-left';
import focusIcon from '@iconify-icons/lucide/maximize';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';

export type RunLayout = 'default' | 'review' | 'notes' | 'debug' | 'focus';

const presets = [
  {
    id: 'default',
    label: '预设',
    columns: '1fr 1fr',
    cells: ['1 / 1 / 3 / 2', '1 / 2 / 2 / 3', '2 / 2 / 3 / 3'],
  },
  {
    id: 'review',
    label: '审阅',
    columns: '1fr 1fr 1fr',
    cells: ['1 / 1 / 3 / 2', '1 / 2 / 2 / 3', '2 / 2 / 3 / 3', '1 / 3 / 3 / 4'],
  },
  {
    id: 'notes',
    label: '问题',
    columns: '1fr 1fr 1fr',
    cells: ['1 / 1 / 3 / 2', '1 / 2 / 3 / 3', '1 / 3 / 2 / 4', '2 / 3 / 3 / 4'],
  },
  {
    id: 'debug',
    label: '调试',
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
  const [open, setOpen] = useState(false);

  function select(layout: RunLayout) {
    onChange(layout);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={buttonStyles({ variant: 'ghost', size: 'icon-sm' })}
        aria-label="布局"
        title="布局"
      >
        <Icon icon={layoutIcon} width="16" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={10} className={styles.positioner}>
          <Popover.Popup className={styles.popup}>
            <Popover.Title className={styles.title}>布局</Popover.Title>
            <Popover.Description className={styles.description}>
              选择工作台布局，也可拖动标签调整面板。
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
                  <span className={styles.presetLabel}>{preset.label}</span>
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
                {value === 'focus' ? '退出专注模式' : '专注模式'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={styles.reset}
                onClick={() => select('default')}
              >
                恢复默认布局
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
