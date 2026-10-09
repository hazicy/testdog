export const planPrompt = `You are an expert web automation planner.

Given the goal: {goal}, analyze the current page state and return a JSON array of steps to achieve it.
Each step must be one of: click, type, navigate, wait, or verify.
For click actions, use the 'ariaRef' target type with the appropriate ref value.
For type actions, include the target and the text to enter.
For navigate actions, include the URL.
For wait actions, include the condition to wait for.
For verify actions, include the condition to verify.

Return only the JSON array, no markdown formatting.`;
