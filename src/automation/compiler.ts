import z from 'zod';
import { generateWithOpenAI } from './stagehand/generate';

export class CaseCompiler {
  constructor() {}

  async compile(caseText: string) {
    const response = await generateWithOpenAI({
      systemPrompt: CASE_COMPILER_PROMPT,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Compile the following automation case into an AbilityPlan.
            Case:
            ${caseText}
            `.trim(),
          },
        },
      ],
      temperature: 0,
      responseFormat: {
        type: 'json_schema',
        name: 'ability_plan',
        description:
          'A browser automation plan expressed using supported abilities.',
        schema: z.toJSONSchema(AbilityPlanSchema),
      },
    });

    return AbilityPlanSchema.parse(response.structuredContent);
  }
}

export const TargetSchema = z.object({
  description: z.string().min(1),
});

export const NavigateAbilitySchema = z.object({
  id: z.string(),
  type: z.literal('navigate'),
  url: z.string(),
});

export const ClickAbilitySchema = z.object({
  id: z.string(),
  type: z.literal('click'),
  target: TargetSchema,
});

export const FillAbilitySchema = z.object({
  id: z.string(),
  type: z.literal('fill'),
  target: TargetSchema,
  value: z.string(),
});

export const ExtractAbilitySchema = z.object({
  id: z.string(),
  type: z.literal('extract'),
  instruction: z.string(),
  outputKey: z.string(),
});

export const AssertAbilitySchema = z.object({
  id: z.string(),
  type: z.literal('assert'),
  condition: z.string(),
});

export const AbilitySchema = z.discriminatedUnion('type', [
  NavigateAbilitySchema,
  ClickAbilitySchema,
  FillAbilitySchema,
  ExtractAbilitySchema,
  AssertAbilitySchema,
]);

export const AbilityPlanSchema = z.object({
  goal: z.string(),
  steps: z.array(AbilitySchema),
});

export type AbilityPlan = z.infer<typeof AbilityPlanSchema>;
export type Ability = z.infer<typeof AbilitySchema>;

const CASE_COMPILER_PROMPT = `
You are a browser automation Case Compiler.

Your job is to convert a user-written automation case into an AbilityPlan.

Available abilities:

1. navigate
   Navigate to an explicit URL.

2. click
   Click a semantically described interactive element.

3. fill
   Fill a value into a semantically described input element.

4. extract
   Read structured information from the current page.
   Only use this when later steps depend on information that must be obtained
   from the page at runtime.

5. assert
   Verify that the browser is in the expected state.

Rules:

- Only use the abilities listed above.
- Do not produce CSS selectors.
- Do not produce XPath.
- Do not invent DOM structure.
- Do not invent element positions.
- Describe targets semantically.
- Do not produce Stagehand actions.
- Do not call observe or act.
- Do not assume UI details that were not provided by the case.
- Keep the plan minimal.
- Each step must have a unique id.
- The executor will resolve semantic targets against the real page at runtime.
`;
