import { expect, it } from 'vitest';
import { PlanSchema } from '@testdog/contracts/automation/compiler/schema';
import { planForest } from '@/features/runs/lib/planTree';

it('preserves group nesting, both branch paths, shared references and nodes outside containment', () => {
  const task = (id: string) => ({
    id,
    kind: 'task',
    goal: id,
    dependsOn: [],
    requirementIds: [],
    assertions: [],
  });
  const plan = PlanSchema.parse({
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'group',
        goal: 'All',
        children: ['nested', 'branch'],
        dependsOn: ['dependency'],
      },
      nested: { id: 'nested', kind: 'group', goal: 'Nested', children: ['shared'], dependsOn: [] },
      branch: {
        id: 'branch',
        kind: 'branch',
        condition: 'Signed in?',
        then: 'shared',
        otherwise: 'login',
        dependsOn: [],
      },
      shared: task('shared'),
      login: task('login'),
      dependency: task('dependency'),
      independent: task('independent'),
    },
  });
  const forest = planForest(plan);

  expect(forest.map((n) => n.id)).toEqual(['root', 'dependency', 'independent']);
  expect(forest[0].children[0].children[0].id).toBe('shared');
  expect(forest[0].children[1].then).toMatchObject({ id: 'shared', reference: true });
  expect(forest[0].children[1].otherwise?.id).toBe('login');
});
