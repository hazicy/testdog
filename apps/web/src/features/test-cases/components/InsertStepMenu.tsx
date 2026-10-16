'use client';

import clsx from 'clsx';

import boardStyles from '@/features/runs/components/plan-board.module.css';
import styles from './InsertStepMenu.module.css';

import { nodeDragType } from '@/features/runs/components/PlanNodes';
import { useRef } from 'react';
import { Menu } from '@base-ui/react/menu';
import type { Node, NodeProps } from '@xyflow/react';
import {
  StepBadge,
  useStepTypes,
  type BoardStepType,
} from '@/features/test-cases/components/StepType';

export type InsertFlowNode = Node<
  {
    onInsert: (type: BoardStepType) => boolean;
    label: string;
    description: string;
    placement: 'below' | 'beside';
    onDrop: (id: string) => void;
    persistent: boolean;
    revealed: boolean;
  },
  'insert'
>;

export function InsertStepMenu({ data }: NodeProps<InsertFlowNode>) {
  const stepTypes = useStepTypes();
  const inserted = useRef(false);

  return (
    <div
      className={boardStyles.stepInsertArea}
      data-placement={data.placement}
      data-persistent={data.persistent}
      data-revealed={data.revealed}
    >
      <Menu.Root
        onOpenChange={(open) => {
          if (open) inserted.current = false;
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
            <Menu.Popup
              className={boardStyles.stepTypeMenu}
              aria-label={data.label}
              finalFocus={() => !inserted.current}
            >
              <p className={styles.location}>{data.description}</p>
              {stepTypes.map((type) => (
                <Menu.Item
                  key={type.value}
                  className={boardStyles.stepTypeOption}
                  onClick={() => {
                    inserted.current = data.onInsert(type.value);
                  }}
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
