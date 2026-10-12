'use client';

import { useEffect, useRef, useState } from 'react';
import type { CompileRequest } from '@/automation/compiler/request';
import { compilePlan } from './compilePlan';

export function usePlanCompilation() {
  const active = useRef<AbortController | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      active.current?.abort();
      active.current = undefined;
    },
    [],
  );

  function cancel() {
    active.current?.abort();
    active.current = undefined;
    setBusy(false);
  }

  async function compile(input: CompileRequest) {
    if (active.current) return;
    const controller = new AbortController();

    active.current = controller;
    setBusy(true);
    try {
      return await compilePlan(input, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      if (active.current === controller) {
        active.current = undefined;
        setBusy(false);
      }
    }
  }

  return { busy, compile, cancel };
}
