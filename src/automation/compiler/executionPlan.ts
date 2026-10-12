import { ExecutablePlanSchema, type Plan } from './schema';
import { inputGoal, type InputRefs } from '../platform/inputs';

// Resolve references once before dispatch. Secret values remain opaque tokens.
export function resolvePlanInputs(source: Plan, inputs?: InputRefs): Plan {
  const plan = structuredClone(ExecutablePlanSchema.parse(source));

  for (const node of Object.values(plan.nodes)) {
    if (node.kind === 'branch') node.condition = inputGoal(node.condition, inputs);
    else node.goal = inputGoal(node.goal, inputs);
    if (node.kind === 'task')
      for (const assertion of node.assertions)
        assertion.description = inputGoal(assertion.description, inputs);
  }

  return ExecutablePlanSchema.parse(plan);
}

export function validateInputReferences(goal: string, plan?: Plan | null, inputs?: InputRefs) {
  inputGoal(goal, inputs);
  if (plan) resolvePlanInputs(plan, inputs);
}
