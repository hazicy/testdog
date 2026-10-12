import { describe, expect, it } from 'vitest';
import {
  displayReferences,
  encodeReferences,
  inputDefinitionError,
  reconcileInputs,
  sameWebsite,
} from '@testdog/contracts/login-identities/inputs';

describe('login flow input bindings', () => {
  it('preserves only values with matching keys and types and takes labels from the flow', () => {
    const result = reconcileInputs(
      {
        username: { value: '', label: '邮箱' },
        password: { value: '', label: '验证码' },
        token: { secretRef: 'TOKEN' },
      },
      {
        username: { value: 'alice', label: '旧账号' },
        password: { secretRef: 'IDENTITY_OLD' },
        removed: { value: 'unused' },
      },
    );

    expect(result).toEqual({
      username: { value: 'alice', label: '邮箱' },
      password: { value: '', label: '验证码' },
      token: { secretRef: 'TOKEN' },
    });
  });
  it('shows readable input references without substituting values and round trips them', () => {
    const inputs = {
      username: { value: 'private-user' },
      password: { secretRef: 'LOGIN_PASSWORD', label: '登录密码' },
    };
    const source = '填写 ${input.username} 和 ${input.password}，保留 ${input.missing}';
    const displayed = displayReferences(source, inputs);

    expect(displayed).toBe('填写 〔账号〕 和 〔登录密码〕，保留 ${input.missing}');
    expect(encodeReferences(displayed, inputs)).toBe(source);
    expect(displayed).not.toContain('private-user');
  });
  it('rejects ambiguous or unusable display names and matches sites by origin', () => {
    expect(
      inputDefinitionError({ first: { value: '', label: '账号' }, username: { value: '' } }),
    ).toContain('重复');
    expect(inputDefinitionError({ first: { value: '', label: '〔密码〕' } })).toContain('不能为空');
    expect(sameWebsite('https://app.example/login', 'https://app.example/account')).toBe(true);
    expect(sameWebsite('https://app.example', 'https://other.example')).toBe(false);
    expect(sameWebsite('', 'invalid')).toBe(false);
    expect(sameWebsite('file:///tmp/login', 'file:///tmp/account')).toBe(false);
  });
});
