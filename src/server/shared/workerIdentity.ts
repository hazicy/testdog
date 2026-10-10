import { randomUUID } from 'node:crypto';

const state = globalThis as typeof globalThis & { caseforgeWorkerId?: string };
export const owner = (state.caseforgeWorkerId ??= randomUUID());
