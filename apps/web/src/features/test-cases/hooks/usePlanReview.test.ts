import { describe, expect, it } from 'vitest';
import { PlanSchema, type Plan } from '@testdog/contracts/automation/compiler/schema';
import { reviewPlan, resolveReview } from '@/features/test-cases/lib/planReview';
import { planReviewReducer, type PlanReviewState } from './usePlanReview';

const plan = (name: string, goal = '打开首页'): Plan =>
  PlanSchema.parse({
    rootId: 'root',
    nodes: {
      root: { id: 'root', kind: 'group', goal: name, children: ['task'], dependsOn: [] },
      task: {
        id: 'task',
        kind: 'task',
        actionType: 'act',
        goal,
        dependsOn: [],
        requirementIds: [],
        assertions: [],
      },
    },
  });

function fixture() {
  const current = plan('当前用例');
  const previous = { plan: plan('更早用例'), name: '更早用例' };
  const state: PlanReviewState = { plan: current, name: '当前用例', previous };
  const review = reviewPlan(current, plan('新用例', '点击登录'));

  return { state, review };
}

const decisionsFor = (review: ReturnType<typeof reviewPlan>, accept: boolean) =>
  Object.fromEntries(review.changes.map((change) => [change.id, accept]));

describe('planReviewReducer', () => {
  it('renames the root title without mutating the old plan and invalidates undo', () => {
    const { state } = fixture();
    const result = planReviewReducer(state, { type: 'rename', name: '重命名', untitled: '未命名' });

    expect(result.name).toBe('重命名');
    expect(result.plan.nodes.root).toMatchObject({ goal: '重命名' });
    expect(result.plan.nodes.task).toBe(state.plan.nodes.task);
    expect(state.plan.nodes.root).toMatchObject({ goal: '当前用例' });
    expect(result.previous).toBeUndefined();
    expect(planReviewReducer(result, { type: 'undo' })).toBe(result);
  });

  it('keeps an empty name while using the untitled fallback for the root title', () => {
    const { state } = fixture();
    const result = planReviewReducer(state, { type: 'rename', name: '', untitled: '未命名用例' });

    expect(result.name).toBe('');
    expect(result.plan.nodes.root).toMatchObject({ goal: '未命名用例' });
    expect(PlanSchema.safeParse(result.plan).success).toBe(true);
    expect(result.previous).toBeUndefined();
  });

  it('synchronizes the name after an edit and invalidates undo', () => {
    const { state } = fixture();
    const edited = plan('编辑后的用例', '点击登录');
    const result = planReviewReducer(state, { type: 'edit', plan: edited });

    expect(result.plan).toBe(edited);
    expect(result.name).toBe('编辑后的用例');
    expect(result.previous).toBeUndefined();
    expect(planReviewReducer(result, { type: 'undo' })).toBe(result);
  });

  it('starts a preview without changing the committed plan, name or undo snapshot', () => {
    const { state, review } = fixture();
    const result = planReviewReducer(state, { type: 'preview', review });

    expect(result.plan).toBe(state.plan);
    expect(result.name).toBe(state.name);
    expect(result.previous).toBe(state.previous);
    expect(result.candidate).toEqual({ review, decisions: {} });
    expect(result.candidate?.review).toBe(review);
    expect(state.candidate).toBeUndefined();
  });

  it('records partial decisions without changing any committed state', () => {
    const { state, review } = fixture();

    expect(review.changes).toHaveLength(2);
    const preview = planReviewReducer(state, { type: 'preview', review });
    const decisions = { [review.changes[0].id]: true };
    const result = planReviewReducer(preview, {
      type: 'decide',
      decisions,
      plan: resolveReview(review, decisions, true),
      complete: false,
    });

    expect(result.plan).toBe(state.plan);
    expect(result.name).toBe(state.name);
    expect(result.previous).toBe(state.previous);
    expect(result.candidate).toEqual({ review, decisions });
    expect(preview.candidate?.decisions).toEqual({});
  });

  it('atomically commits a completed acceptance with the name and a fresh undo snapshot', () => {
    const { state, review } = fixture();
    const preview = planReviewReducer(state, { type: 'preview', review });
    const decisions = decisionsFor(review, true);
    const accepted = resolveReview(review, decisions);
    const result = planReviewReducer(preview, {
      type: 'decide',
      decisions,
      plan: accepted,
      complete: true,
    });

    expect(result).toEqual({
      plan: accepted,
      name: '新用例',
      previous: { plan: state.plan, name: state.name },
      candidate: undefined,
    });
    expect(result.plan).toBe(accepted);
    expect(result.previous?.plan).toBe(state.plan);
    expect(result.previous).not.toBe(state.previous);
    expect(preview.plan).toBe(state.plan);
    expect(preview.previous).toBe(state.previous);
  });

  it('clears a fully rejected review while retaining the old plan, name and previous snapshot', () => {
    const { state, review } = fixture();
    const preview = planReviewReducer(state, { type: 'preview', review });
    const decisions = decisionsFor(review, false);
    const result = planReviewReducer(preview, {
      type: 'decide',
      decisions,
      plan: resolveReview(review, decisions),
      complete: true,
    });

    expect(result.plan).toBe(state.plan);
    expect(result.name).toBe(state.name);
    expect(result.previous).toBe(state.previous);
    expect(result.candidate).toBeUndefined();
  });

  it('applies a completed review with no changes even when decisions are empty', () => {
    const { state } = fixture();
    const review = reviewPlan(state.plan, structuredClone(state.plan));

    expect(review.changes).toEqual([]);
    const preview = planReviewReducer(state, { type: 'preview', review });
    const accepted = resolveReview(review, {});
    const result = planReviewReducer(preview, {
      type: 'decide',
      decisions: {},
      plan: accepted,
      complete: true,
    });

    expect(result.plan).toBe(accepted);
    expect(result.name).toBe(state.name);
    expect(result.previous).toEqual({ plan: state.plan, name: state.name });
    expect(result.previous?.plan).toBe(state.plan);
    expect(result.previous).not.toBe(state.previous);
    expect(result.candidate).toBeUndefined();
  });

  it('undoes an accepted review by restoring the committed plan and name only once', () => {
    const { state, review } = fixture();
    const preview = planReviewReducer(state, { type: 'preview', review });
    const decisions = decisionsFor(review, true);
    const accepted = planReviewReducer(preview, {
      type: 'decide',
      decisions,
      plan: resolveReview(review, decisions),
      complete: true,
    });
    const result = planReviewReducer(accepted, { type: 'undo' });

    expect(result.plan).toBe(state.plan);
    expect(result.name).toBe(state.name);
    expect(result.previous).toBeUndefined();
    expect(result.candidate).toBeUndefined();
    expect(planReviewReducer(result, { type: 'undo' })).toBe(result);
  });
});
