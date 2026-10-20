import type { OccurrenceSnapshot } from '@testdog/contracts/issues/types';

export function actualResult(snapshot: OccurrenceSnapshot) {
  const expected = snapshot.step?.assertion?.description ?? snapshot.nodeGoal ?? snapshot.goal;
  const evidence = snapshot.step?.evidence?.trim();
  const candidates = [
    evidence !== expected?.trim() ? evidence : undefined,
    snapshot.error,
    snapshot.step?.error,
  ];
  const messages = [
    ...new Set(
      candidates.map((value) => value?.trim()).filter((value): value is string => !!value),
    ),
  ];
  const primary = messages[0];

  if (!primary) return undefined;
  // Keep diagnostic logs available without letting them obscure the observed result.
  const concise = primary.split(/\n(?:Call log:|\s+at\s)/, 1)[0].trim();
  const received = concise.match(/^\s*Received(?: string| value)?:\s*(.+)$/m);
  const summary = (received ? received[0].trim() : concise).replace(/^Error:\s*/, '');
  const original = messages.join('\n\n');

  return {
    summary,
    ...(received ? { receivedValue: received[1].trim() } : {}),
    details: original !== summary ? original : undefined,
  };
}
