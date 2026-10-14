import { expect, it } from 'vitest';
import { PlanSchema } from '@testdog/contracts/automation/compiler/schema';
import type { ExecutionStep } from '@testdog/contracts/runs/types';
import { executionGroups } from './executionGroups';

const task = (id: string) => ({
  id,
  kind: 'task',
  goal: id,
  dependsOn: [],
  requirementIds: [],
  assertions: [],
});
const action = (id: string, planNodeId?: string): ExecutionStep => ({
  id,
  planNodeId,
  runId: 'run',
  sequence: 1,
  kind: 'action',
  title: id,
  status: 'passed',
  startedAt: '2026-10-15T00:00:00Z',
  pageId: 'page-1',
  pageUrl: '',
  replayable: true,
});

it('preserves nested groups while aggregating status without duplicating displayed actions', () => {
  const plan = PlanSchema.parse({
    rootId: 'root',
    nodes: {
      root: { id: 'root', kind: 'group', goal: 'Root', children: ['nested'], dependsOn: [] },
      nested: {
        id: 'nested',
        kind: 'group',
        goal: 'Nested',
        children: ['first', 'pending'],
        dependsOn: [],
      },
      first: task('first'),
      pending: task('pending'),
    },
  });
  const executed = action('executed', 'first');
  const setup = action('setup');
  const { groups, ungrouped } = executionGroups(plan, [setup, executed]);
  const nested = groups[0];

  expect(nested.title).toBe('Nested');
  expect(nested.actions).toEqual([]);
  expect(nested.steps).toEqual([executed]);
  expect(nested.children.map((entry) => entry.title)).toEqual(['first', 'pending']);
  expect(nested.children[0].actions).toEqual([executed]);
  expect(nested.children[1].actions).toEqual([]);
  expect(ungrouped).toEqual([setup]);
});

it('retains branch labels, repeated assertions and references through hidden sequences', () => {
  const plan = PlanSchema.parse({
    rootId: 'branch',
    nodes: {
      branch: {
        id: 'branch',
        kind: 'branch',
        condition: 'Signed in?',
        then: 'sequence',
        otherwise: 'shared',
        dependsOn: [],
      },
      sequence: {
        id: 'sequence',
        kind: 'group',
        presentation: 'sequence',
        goal: 'Internal',
        children: ['shared'],
        dependsOn: [],
      },
      shared: {
        ...task('shared'),
        assertions: [{ description: 'Visible' }, { description: 'Visible' }],
      },
    },
  });
  const first = {
    ...action('assert-1', 'shared'),
    kind: 'assertion' as const,
    assertion: { description: 'Visible' },
  };
  const second = { ...first, id: 'assert-2', sequence: 2 };
  const { groups, ungrouped } = executionGroups(plan, [first, second]);
  const [shared, reference] = groups[0].children;

  expect(shared.title).toBe('shared');
  expect(shared.pathLabel).toBe('YES / 条件成立');
  expect(shared.actions).toEqual([]);
  expect(shared.children.map((entry) => entry.actions)).toEqual([[first], [second]]);
  expect(reference.pathLabel).toBe('NO / 条件不成立');
  expect(reference.reference).toBe(shared.id);
  expect(reference.steps).toEqual([]);
  expect(ungrouped).toEqual([]);
});

it('preserves actions when a plan is not available', () => {
  const steps = [action('setup')];

  expect(executionGroups(undefined, steps)).toEqual({ groups: [], ungrouped: steps });
});

it('hides an empty root without dropping unattached actions', () => {
  const plan = PlanSchema.parse({
    rootId: 'root',
    nodes: { root: { id: 'root', kind: 'group', goal: 'Root', children: [], dependsOn: [] } },
  });
  const steps = [action('setup')];

  expect(executionGroups(plan, steps)).toEqual({ groups: [], ungrouped: steps });
});

it('points a reused hidden container directly at the original visible node', () => {
  const plan = PlanSchema.parse({
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'group',
        goal: 'Root',
        children: ['shared', 'wrapper', 'branch'],
        dependsOn: [],
      },
      shared: task('shared'),
      wrapper: {
        id: 'wrapper',
        kind: 'group',
        goal: 'Internal',
        presentation: 'sequence',
        children: ['shared'],
        dependsOn: [],
      },
      branch: { id: 'branch', kind: 'branch', condition: 'Reuse?', then: 'wrapper', dependsOn: [] },
    },
  });
  const executed = action('executed', 'shared');
  const { groups, ungrouped } = executionGroups(plan, [executed]);

  expect(groups[1].reference).toBe(groups[0].id);
  expect(groups[2].children[0].reference).toBe(groups[0].id);
  expect(groups[2].children[0].steps).toEqual([]);
  expect(ungrouped).toEqual([]);
});
