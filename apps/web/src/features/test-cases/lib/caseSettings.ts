import type { TestCase } from '@testdog/contracts/test-cases/types';

export type CaseSettingsValue = {
  platform: 'web' | 'android' | 'ios';
  webProfile: 'Pixel 7' | 'iPhone 13' | 'legacy-desktop';
  userAgent: string;
  appId: string;
  deviceProfileId: string;
  buildArtifactId: string;
  resetPolicy: 'preserve' | 'clear-data' | 'reinstall';
  launchUrl: string;
  nativeVideo: boolean;
  tags: string;
};

export function initialCaseSettings(test?: TestCase): CaseSettingsValue {
  const target = test?.target;
  const native = target && target.platform !== 'web' ? target : undefined;

  return {
    platform: target?.platform ?? 'web',
    webProfile: target?.platform === 'web' ? target.deviceProfile : 'legacy-desktop',
    userAgent: target?.platform === 'web' ? (target.userAgent ?? '') : '',
    appId: native?.appId ?? '',
    deviceProfileId: native?.deviceProfileId ?? '',
    buildArtifactId: native?.buildArtifactId ?? '',
    resetPolicy: native?.resetPolicy ?? 'preserve',
    launchUrl: native?.launchUrl ?? '',
    nativeVideo: native?.evidence?.video ?? false,
    tags: test?.tags.join(', ') ?? '',
  };
}

export function caseTarget(value: CaseSettingsValue) {
  return value.platform === 'web'
    ? {
        schemaVersion: 1 as const,
        platform: value.platform,
        browser: value.webProfile === 'iPhone 13' ? ('webkit' as const) : ('chromium' as const),
        deviceProfile: value.webProfile,
        ...(value.userAgent.trim() ? { userAgent: value.userAgent.trim() } : {}),
      }
    : {
        schemaVersion: 1 as const,
        platform: value.platform,
        appId: value.appId,
        deviceProfileId: value.deviceProfileId,
        resetPolicy: value.resetPolicy,
        evidence: { video: value.nativeVideo },
        ...(value.buildArtifactId ? { buildArtifactId: value.buildArtifactId } : {}),
        ...(value.launchUrl.trim() ? { launchUrl: value.launchUrl.trim() } : {}),
      };
}
