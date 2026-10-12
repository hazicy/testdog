import type { InputRefs } from '@testdog/contracts/automation/platform/inputs';

export const defaultLoginInputs: InputRefs = {
  username: { value: '' },
  password: { secretRef: 'LOGIN_PASSWORD' },
};

export function inputLabel(key: string, input?: InputRefs[string]) {
  return input?.label ?? (key === 'username' ? '账号' : key === 'password' ? '密码' : key);
}

// A flow owns the input definition; an identity only supplies values of the same type.
export function reconcileInputs(definitions: InputRefs = {}, previous: InputRefs = {}) {
  return Object.fromEntries(
    Object.entries(definitions).map(([key, definition]) => {
      const old = Object.hasOwn(previous, key) ? previous[key] : undefined;
      const compatible = old && 'secretRef' in old === 'secretRef' in definition;

      return [key, compatible ? { ...old, label: definition.label } : definition];
    }),
  ) as InputRefs;
}

export function sameWebsite(left: string, right: string) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);

    return (
      ['http:', 'https:'].includes(leftUrl.protocol) &&
      ['http:', 'https:'].includes(rightUrl.protocol) &&
      leftUrl.origin === rightUrl.origin
    );
  } catch {
    return false;
  }
}

export function displayReferences(text: string, inputs: InputRefs) {
  return text.replace(/\$\{input\.([A-Za-z][A-Za-z0-9_]*)\}/g, (reference, key: string) =>
    Object.hasOwn(inputs, key) ? `〔${inputLabel(key, inputs[key])}〕` : reference,
  );
}

export function encodeReferences(text: string, inputs: InputRefs) {
  for (const [key, input] of Object.entries(inputs)) {
    text = text.split(`〔${inputLabel(key, input)}〕`).join(`\${input.${key}}`);
  }

  return text;
}

export function inputDefinitionError(inputs: InputRefs) {
  const labels = Object.entries(inputs).map(([key, input]) => inputLabel(key, input));

  if (labels.some((label) => !label.trim() || /[〔〕]/.test(label)))
    return '输入名称不能为空或包含〔〕。';
  if (new Set(labels).size !== labels.length) return '输入名称不能重复。';
}
