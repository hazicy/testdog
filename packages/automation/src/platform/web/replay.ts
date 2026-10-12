import {
  PlatformAssertionSchema,
  type SessionEvent,
} from '@testdog/contracts/automation/platform/contracts';

export function normalizePlaywrightAssertion(
  assertion: NonNullable<SessionEvent['playwrightAssertion']>,
) {
  const mapping = {
    toBeVisible: 'visible',
    toHaveText: 'text',
    toContainText: 'containsText',
    toHaveValue: 'value',
    toHaveURL: 'url',
  } as const;

  return PlatformAssertionSchema.parse({
    platform: 'web',
    type: mapping[assertion.type],
    target: assertion.target,
    value: assertion.value,
    negate: assertion.negate,
  });
}
