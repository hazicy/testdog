'use client';

import { nodeDragType } from '@/features/runs/components/PlanNodes';
import { Menu } from '@base-ui/react/menu';
import type { Node, NodeProps } from '@xyflow/react';
import { StepBadge, stepTypes, type BoardStepType } from './StepType';

export type InsertFlowNode = Node<
  { onInsert: (type: BoardStepType) => void; label: string; onDrop: (id: string) => void },
  'insert'
>;

export function InsertStepMenu({ data }: NodeProps<InsertFlowNode>) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="step-insert-trigger nodrag nopan"
        aria-label={data.label}
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
          className="step-menu-positioner"
        >
          <Menu.Popup className="step-type-menu" aria-label="选择节点类型">
            {stepTypes.map((type) => (
              <Menu.Item
                key={type.value}
                className="step-type-option"
                onClick={() => data.onInsert(type.value)}
              >
                <StepBadge type={type.value} />
                <span>{type.description}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
