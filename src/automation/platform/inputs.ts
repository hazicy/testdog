import { z } from 'zod';

export const InputRefsSchema = z
  .record(
    z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
    z.union([
      z.strictObject({ value: z.string().max(20000) }),
      z.strictObject({ secretRef: z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/) }),
    ]),
  )
  .refine((inputs) => Object.keys(inputs).length <= 50, 'Too many inputs');
export type InputRefs = z.infer<typeof InputRefsSchema>;

export function inputGoal(goal: string, inputs: InputRefs = {}) {
  return goal.replace(/\$\{input\.([A-Za-z][A-Za-z0-9_]*)\}/g, (_match, key: string) => {
    const input = inputs[key];
    if (!input) throw new Error(`Missing input reference: ${key}`);

    return 'value' in input ? input.value : `\$\{secret:${input.secretRef}\}`;
  });
}

export class SecretInputs {
  private values = new Map<string, string>();
  constructor(inputs: InputRefs = {}) {
    for (const input of Object.values(inputs)) {
      if (!('secretRef' in input)) continue;
      const value = process.env[`CASEFORGE_SECRET_${input.secretRef}`];
      if (!value) throw new Error(`Missing worker secret: ${input.secretRef}`);
      this.values.set(input.secretRef, value);
    }
  }
  get maskValues() {
    return [...this.values.values()];
  }
  get enabled() {
    return this.values.size > 0;
  }
  resolve(value: string): { value: string; sensitive: boolean } {
    const match = /^\$\{secret:([A-Z][A-Z0-9_]*)\}$/.exec(value);
    if (!match) {
      if (value.includes('${secret:'))
        throw new Error('Secret reference must be the entire fill value');

      return { value, sensitive: false };
    }
    const secret = this.values.get(match[1]);
    if (!secret) throw new Error('Unregistered secret reference');

    return { value: secret, sensitive: true };
  }
  redactData<T>(data: T): T {
    const visit = (value: unknown): unknown => {
      if (typeof value === 'string') return this.redact(value);
      if (Array.isArray(value)) return value.map(visit);
      if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));

      return value;
    };

    return visit(data) as T;
  }
  redact(text: string) {
    for (const value of this.values.values()) {
      text = text.split(JSON.stringify(value).slice(1, -1)).join('[redacted]');
      text = text.split(value).join('[redacted]');
      text = text.split(encodeURIComponent(value)).join('[redacted]');
    }

    return text;
  }
}
