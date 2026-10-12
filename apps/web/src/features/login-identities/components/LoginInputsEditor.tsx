'use client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { InputRefs } from '@testdog/contracts/automation/platform/inputs';
import { inputLabel } from '@testdog/contracts/login-identities/inputs';

export function LoginInputsEditor({
  inputs,
  onChange,
  disabled,
}: {
  inputs: InputRefs;
  onChange: (inputs: InputRefs) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">登录时需要填写的内容</legend>
      <p className="text-xs text-page-muted">
        在步骤中点击“插入”即可使用。实际账号和密码回到登录身份中填写。
      </p>
      {Object.entries(inputs).map(([key, input]) => (
        <div key={key} className="space-y-2 rounded border border-page-line p-2">
          <label className="block text-sm">
            输入名称
            <Input
              maxLength={60}
              aria-label={`输入名称 ${inputLabel(key, input)}`}
              value={inputLabel(key, input)}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...inputs, [key]: { ...input, label: event.target.value } })
              }
            />
          </label>
          <Select
            aria-label={`${inputLabel(key, input)}类型`}
            value={'secretRef' in input ? 'secret' : 'text'}
            disabled={disabled}
            items={[
              { value: 'text', label: '普通输入' },
              { value: 'secret', label: '密码 / 敏感输入' },
            ]}
            onValueChange={(value) =>
              onChange({
                ...inputs,
                [key]:
                  value === 'secret'
                    ? { secretRef: `LOGIN_${key.toUpperCase()}`, label: input.label }
                    : { value: '', label: input.label },
              })
            }
          />
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() => {
              const next = { ...inputs };

              delete next[key];
              onChange(next);
            }}
          >
            移除 {inputLabel(key, input)}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        disabled={disabled || Object.keys(inputs).length >= 50}
        onClick={() => {
          let index = 1;

          while (inputs[`field${index}`]) index++;
          const labels = new Set(
            Object.entries(inputs).map(([key, entry]) => inputLabel(key, entry)),
          );
          let labelIndex = index;

          while (labels.has(`输入 ${labelIndex}`)) labelIndex++;
          onChange({ ...inputs, [`field${index}`]: { value: '', label: `输入 ${labelIndex}` } });
        }}
      >
        添加输入
      </Button>
    </fieldset>
  );
}
