'use client';

import { useState } from 'react';
import type { Plan } from '@testdog/contracts/execution/plan';

// External replacements (generation/review) start a new editing history.
export function usePlanHistory(plan: Plan, onChange?: (plan: Plan) => void) {
  const [history, setHistory] = useState({ plan, past: [] as Plan[], future: [] as Plan[] });
  const current = history.plan === plan ? history : { plan, past: [], future: [] };

  if (history.plan !== plan) setHistory(current);

  function change(next: Plan) {
    if (!onChange || next === plan) return;
    setHistory({ plan: next, past: [...current.past.slice(-49), plan], future: [] });
    onChange(next);
  }

  function undo() {
    const previous = current.past.at(-1);

    if (!onChange || !previous) return;
    setHistory({
      plan: previous,
      past: current.past.slice(0, -1),
      future: [plan, ...current.future],
    });
    onChange(previous);
  }

  function redo() {
    const next = current.future[0];

    if (!onChange || !next) return;
    setHistory({ plan: next, past: [...current.past, plan], future: current.future.slice(1) });
    onChange(next);
  }

  return {
    change: onChange ? change : undefined,
    undo,
    redo,
    canUndo: !!onChange && !!current.past.length,
    canRedo: !!onChange && !!current.future.length,
  };
}
