'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export function useLogVirtualizer(rows: readonly { id: string }[]) {
  'use no memo';

  const scrollRef = useRef<HTMLDivElement>(null);
  const enabled = rows.length > 50;
  // This hook opts out of compiler memoization because the virtualizer is mutable.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => rows[index].id,
    estimateSize: () => 48,
    overscan: 8,
    enabled,
  });
  const items = virtualizer.getVirtualItems();
  const indexes = enabled ? items.map((item) => item.index) : rows.map((_, index) => index);
  const rootFontSize =
    typeof window === 'undefined'
      ? 16
      : parseFloat(window.getComputedStyle(document.documentElement).fontSize);
  // Virtualizer measurements are CSS pixels; styles follow the project's rem convention.
  const paddingStart = enabled ? (items[0]?.start ?? 0) / rootFontSize : 0;
  const paddingEnd = enabled
    ? Math.max(0, virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)) / rootFontSize
    : 0;

  return {
    scrollRef,
    indexes,
    paddingStart,
    paddingEnd,
    measureElement: enabled ? virtualizer.measureElement : undefined,
  };
}
