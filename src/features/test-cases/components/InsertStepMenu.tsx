'use client';

import { nodeDragType } from '@/features/runs/components/PlanNodes';
import { useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import type { Node, NodeProps } from '@xyflow/react';
import { StepBadge, stepTypes, type BoardStepType } from './StepType';

export type InsertFlowNode = Node<
  {
    onInsert: (type: BoardStepType, index: number) => void;
    label: string;
    description: string;
    index: number;
    positions: { index: number; label: string }[];
    onDrop: (id: string) => void;
  },
  'insert'
>;

export function InsertStepMenu({ data }: NodeProps<InsertFlowNode>) {
  const [index, setIndex] = useState(data.index);

  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (open) setIndex(data.index);
      }}
    >
      <Menu.Trigger
        className="step-insert-trigger nodrag nopan"
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
          className="step-menu-positioner"
        >
          <Menu.Popup className="step-type-menu" aria-label="选择节点类型">
            <label className="flex items-center gap-2 px-3 py-2 text-sm">
              插入位置
              <select
                className="min-w-0 flex-1 rounded border border-gray-200 p-1"
                aria-label="插入位置"
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
                className="step-type-option"
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
  );
}
