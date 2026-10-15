'use client';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import boardStyles from '@/features/runs/components/plan-board.module.css';
import styles from './InsertStepMenu.module.css';

import { nodeDragType } from '@/features/runs/components/PlanNodes';
import { useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import type { Node, NodeProps } from '@xyflow/react';
import {
  StepBadge,
  useStepTypes,
  type BoardStepType,
} from '@/features/test-cases/components/StepType';

export type InsertFlowNode = Node<
  {
    onInsert: (type: BoardStepType, index: number) => void;
    label: string;
    description: string;
    index: number;
    positions: { index: number; label: string }[];
    onDrop: (id: string) => void;
    persistent: boolean;
    revealed: boolean;
  },
  'insert'
>;

export function InsertStepMenu({ data }: NodeProps<InsertFlowNode>) {
  const t = useTranslations('editor');
  const stepTypes = useStepTypes();
  const [index, setIndex] = useState(data.index);

  return (
    <div
      className={boardStyles.stepInsertArea}
      data-persistent={data.persistent}
      data-revealed={data.revealed}
    >
      <Menu.Root
        onOpenChange={(open) => {
          if (open) setIndex(data.index);
        }}
      >
        <Menu.Trigger
          data-ui="step-insert-trigger"
          className={clsx(boardStyles.stepInsertTrigger, 'nodrag', 'nopan')}
          aria-label={data.label}
          title={data.description}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(nodeDragType)) event.preventDefault();
          }}
          onDrop={(event) => {
            const id = event.dataTransfer.getData(nodeDragType);

            if (id) {
              event.preventDefault();
              data.onDrop(id);
            }
          }}
        >
          ＋
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="center"
            sideOffset={8}
            className={boardStyles.stepMenuPositioner}
          >
            <Menu.Popup className={boardStyles.stepTypeMenu} aria-label={t('nodeType')}>
              <label className={styles.field}>
                {t('insertPosition')}
                <select
                  className={styles.select}
                  aria-label={t('insertPosition')}
                  value={index}
                  onChange={(event) => setIndex(Number(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key !== 'Escape') event.stopPropagation();
                  }}
                >
                  {data.positions.map((position) => (
                    <option key={position.index} value={position.index}>
                      {position.label}
                    </option>
                  ))}
                </select>
              </label>
              {stepTypes.map((type) => (
                <Menu.Item
                  key={type.value}
                  className={boardStyles.stepTypeOption}
                  onClick={() => data.onInsert(type.value, index)}
                >
                  <StepBadge type={type.value} />
                  <span>{type.description}</span>
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
