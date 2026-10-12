import type { TestCase } from '@testdog/contracts/test-cases/types';
import { InputRefsSchema } from '@testdog/contracts/automation/platform/inputs';

export function parseCaseInputs(value: string) {
  try {
    return InputRefsSchema.parse(JSON.parse(value.trim() || '{}'));
  } catch {
    throw new Error('请在测试设置中填写有效的输入引用 JSON，使用 value 或 secretRef 定义输入。');
  }
}

export type CaseSettingsValue = {
  url: string;
  loginIdentityId: string;
  platform: 'web' | 'android' | 'ios';
  webProfile: 'Pixel 7' | 'iPhone 13' | 'legacy-desktop';
  appId: string;
  deviceProfileId: string;
  buildArtifactId: string;
  resetPolicy: 'preserve' | 'clear-data' | 'reinstall';
  launchUrl: string;
  nativeVideo: boolean;
  nativeTrace: boolean;
  nativeLogs: boolean;
  inputRefs: string;
  tags: string;
};

export function initialCaseSettings(test?: TestCase): CaseSettingsValue {
  const target = test?.target;
  const native = target && target.platform !== 'web' ? target : undefined;

  return {
    url: target?.platform === 'web' ? target.url : (test?.url ?? ''),
    loginIdentityId: target?.platform === 'web' ? (target.loginIdentityId ?? '') : '',
    platform: target?.platform ?? 'web',
    webProfile:
      target?.platform === 'web' ? target.deviceProfile : test ? 'legacy-desktop' : 'Pixel 7',
    appId: native?.appId ?? '',
    deviceProfileId: native?.deviceProfileId ?? '',
    buildArtifactId: native?.buildArtifactId ?? '',
    resetPolicy: native?.resetPolicy ?? 'preserve',
    launchUrl: native?.launchUrl ?? '',
    nativeVideo: native?.evidence?.video ?? false,
    nativeTrace: native?.evidence?.trace ?? false,
    nativeLogs: native?.evidence?.logs ?? false,
    inputRefs: JSON.stringify(target?.inputs ?? {}, null, 2),
    tags: test?.tags.join(', ') ?? '',
  };
}

export function caseTarget(value: CaseSettingsValue, inputs: unknown) {
  return value.platform === 'web'
    ? {
        schemaVersion: 1 as const,
        platform: value.platform,
        url: value.url.trim(),
        browser: value.webProfile === 'iPhone 13' ? ('webkit' as const) : ('chromium' as const),
        deviceProfile: value.webProfile,
        ...(value.loginIdentityId ? { loginIdentityId: value.loginIdentityId } : {}),
        inputs,
      }
    : {
        schemaVersion: 1 as const,
        platform: value.platform,
        appId: value.appId,
        deviceProfileId: value.deviceProfileId,
        resetPolicy: value.resetPolicy,
        inputs,
        evidence: { video: value.nativeVideo, trace: value.nativeTrace, logs: value.nativeLogs },
        ...(value.buildArtifactId ? { buildArtifactId: value.buildArtifactId } : {}),
        ...(value.launchUrl.trim() ? { launchUrl: value.launchUrl.trim() } : {}),
      };
}
