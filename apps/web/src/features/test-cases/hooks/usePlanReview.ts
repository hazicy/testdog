'use client';

import { useMemo, useReducer } from 'react';
import type { Plan } from '@testdog/contracts/execution/plan';

import {
  reviewPlan,
  resolveReview,
  type PlanReview,
  type ReviewDecisions,
} from '@/features/test-cases/lib/planReview';

export type PlanReviewState = {
  plan: Plan;
  name: string;
  candidate?: { review: PlanReview; decisions: ReviewDecisions };
  previous?: { plan: Plan; name: string };
};

type PlanReviewAction =
  | { type: 'rename'; name: string; untitled: string }
  | { type: 'edit'; plan: Plan }
  | { type: 'preview'; review: PlanReview }
  | { type: 'decide'; decisions: ReviewDecisions; plan: Plan; complete: boolean }
  | { type: 'undo' };

function planName(plan: Plan, fallback: string) {
  const root = plan.nodes[plan.rootId];

  return root.kind === 'group' ? root.goal : fallback;
}

export function planReviewReducer(
  state: PlanReviewState,
  action: PlanReviewAction,
): PlanReviewState {
  switch (action.type) {
    case 'rename': {
      const root = state.plan.nodes[state.plan.rootId];

      return {
        ...state,
        name: action.name,
        previous: undefined,
        plan:
          root.kind === 'group'
            ? {
                ...state.plan,
                nodes: {
                  ...state.plan.nodes,
                  [root.id]: { ...root, goal: action.name || action.untitled },
                },
              }
            : state.plan,
      };
    }

    case 'edit':
      return {
        ...state,
        plan: action.plan,
        name: planName(action.plan, state.name),
        previous: undefined,
      };
    case 'preview':
      return { ...state, candidate: { review: action.review, decisions: {} } };
    case 'decide': {
      if (!state.candidate) return state;
      if (!action.complete)
        return { ...state, candidate: { ...state.candidate, decisions: action.decisions } };
      const apply =
        Object.values(action.decisions).some(Boolean) || !state.candidate.review.changes.length;

      return {
        ...state,
        candidate: undefined,
        ...(apply
          ? {
              plan: action.plan,
              name: planName(action.plan, state.name),
              previous: { plan: state.plan, name: state.name },
            }
          : {}),
      };
    }

    case 'undo':
      return state.previous ? { ...state, ...state.previous, previous: undefined } : state;
  }
}

export function usePlanReview(initialize: () => { name: string; plan: Plan }) {
  const [state, dispatch] = useReducer(planReviewReducer, initialize, (create): PlanReviewState =>
    create(),
  );
  const { plan, candidate } = state;
  const preview = useMemo(
    () => (candidate ? resolveReview(candidate.review, candidate.decisions, true) : plan),
    [candidate, plan],
  );
  const pendingChanges =
    candidate?.review.changes.filter((change) => !Object.hasOwn(candidate.decisions, change.id)) ??
    [];

  function decide(decisions: ReviewDecisions) {
    if (!candidate) return;
    // Validate before dispatch so an invalid combination leaves the review unchanged.
    const next = resolveReview(candidate.review, decisions, true);
    const complete = candidate.review.changes.every((change) =>
      Object.hasOwn(decisions, change.id),
    );

    dispatch({ type: 'decide', decisions, plan: next, complete });

    return { complete, accepted: Object.values(decisions).some(Boolean) };
  }

  function decideAll(accept: boolean) {
    if (!candidate) return;
    const decisions = { ...candidate.decisions };

    for (const change of candidate.review.changes) decisions[change.id] ??= accept;

    return decide(decisions);
  }

  return {
    ...state,
    preview,
    pendingChanges,

    decide,
    decideAll,
    startReview: (next: Plan) => dispatch({ type: 'preview', review: reviewPlan(plan, next) }),
    changeName: (name: string, untitled: string) => dispatch({ type: 'rename', name, untitled }),
    changePlan: (next: Plan) => dispatch({ type: 'edit', plan: next }),
    undo: () => dispatch({ type: 'undo' }),
  };
}
