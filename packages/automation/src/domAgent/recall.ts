import type { Action, Candidate, RankedCandidate, Target } from './types';

export const normalize = (value: string) =>
  value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export function matchesTarget(candidate: Candidate, target: Target) {
  return (
    normalize(candidate.name) === normalize(target.name) &&
    (!target.role || candidate.role === target.role) &&
    target.context.every((term) => normalize(candidate.context).includes(normalize(term)))
  );
}

export function compatible(candidate: Candidate, action: Action) {
  if (!candidate.enabled) return false;
  if (action.kind === 'fill') return candidate.editable;
  // selectOption only supports native select, not custom ARIA combobox widgets.
  if (action.kind === 'select') return candidate.tag === 'select';
  if (action.kind === 'check')
    return candidate.tag === 'input' && ['checkbox', 'radio'].includes(candidate.inputType);

  return Boolean(candidate.role || candidate.tag === 'summary');
}

export function recall(
  target: Target,
  action: Action,
  candidates: Candidate[],
  topK = 80,
): RankedCandidate[] {
  if (!Number.isInteger(topK) || topK < 1 || topK > 200) throw new Error('topK must be 1–200');
  const terms = target.keywords.length ? target.keywords : [target.name];
  const coverage = (text: string, words: string[]) =>
    words.length
      ? words.filter((word) => normalize(text).includes(normalize(word))).length / words.length
      : 0;

  return candidates
    .filter((candidate) => compatible(candidate, action))
    .map((candidate) => ({
      ...candidate,
      score:
        35 * coverage(`${candidate.name} ${candidate.text}`, terms) +
        30 * coverage(candidate.context, target.context) +
        (target.role ? (candidate.role === target.role ? 20 : 0) : 10) +
        10 * coverage(candidate.href, terms) +
        (candidate.inViewport ? 5 : 0) +
        (normalize(candidate.name) === normalize(target.name) ? 35 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, topK);
}
