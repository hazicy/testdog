'use client';

import { useState } from 'react';

export function useCursorPagination(key: string) {
  const [pagination, setPagination] = useState({ key, cursors: [] as string[] });
  const cursors = pagination.key === key ? pagination.cursors : [];

  // Discard old cursors when filters change, including when returning to an earlier filter.
  if (pagination.key !== key) setPagination({ key, cursors });

  return {
    cursors,
    previousPage: () => setPagination({ key, cursors: cursors.slice(0, -1) }),
    nextPage: (cursor?: string | null) => {
      if (cursor) setPagination({ key, cursors: [...cursors, cursor] });
    },
  };
}
