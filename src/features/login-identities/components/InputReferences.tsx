'use client';

import { createContext, useContext, useRef, type ComponentProps, type RefObject } from 'react';
import type { InputRefs } from '@/automation/platform/inputs';
import { displayReferences, encodeReferences, inputLabel } from '../inputs';

export const LoginInputContext = createContext<InputRefs | undefined>(undefined);

export function useReferenceDisplay(text: string) {
  const inputs = useContext(LoginInputContext);

  return inputs ? displayReferences(text, inputs) : text;
}

export function ReferenceTextarea({
  value,
  onValueChange,
  textareaRef,
  onCompleteBlur,
  ...props
}: Omit<ComponentProps<'textarea'>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onCompleteBlur?: () => void;
}) {
  const inputs = useContext(LoginInputContext);
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;
  const displayed = inputs ? displayReferences(value, inputs) : value;

  return (
    <div
      className="contents"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onCompleteBlur?.();
      }}
    >
      <textarea
        {...props}
        ref={ref}
        value={displayed}
        onChange={(event) =>
          onValueChange(inputs ? encodeReferences(event.target.value, inputs) : event.target.value)
        }
      />
      {inputs && (
        <div className="flex flex-wrap gap-2 py-2 text-xs nodrag nopan" aria-label="插入登录输入">
          {Object.entries(inputs).map(([key, input]) => (
            <button
              key={key}
              type="button"
              disabled={props.disabled}
              className="rounded border border-page-line px-2 py-1"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const start = ref.current?.selectionStart ?? displayed.length;
                const end = ref.current?.selectionEnd ?? start;
                const token = `〔${inputLabel(key, input)}〕`;

                onValueChange(
                  encodeReferences(
                    displayed.slice(0, start) + token + displayed.slice(end),
                    inputs,
                  ),
                );
                requestAnimationFrame(() => {
                  ref.current?.focus();
                  ref.current?.setSelectionRange(start + token.length, start + token.length);
                });
              }}
            >
              插入 {inputLabel(key, input)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
