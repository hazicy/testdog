import { randomUUID } from 'node:crypto';

const state = globalThis as typeof globalThis & { testdogWorkerId?: string };

export const owner = (state.testdogWorkerId ??= randomUUID());
