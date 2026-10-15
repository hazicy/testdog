'use client';

import { useTranslations } from 'next-intl';

import styles from './CaseSettings.module.css';

import { Label } from '@/components/ui/Label';
import useSWR from 'swr';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { fetchJson } from '@/client/api';
import type { CaseSettingsValue } from '@/features/test-cases/lib/caseSettings';

const catalogOptions = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
};

export function CaseSettings({
  value,
  onChange,
  busy,
}: {
  value: CaseSettingsValue;
  onChange: (patch: Partial<CaseSettingsValue>) => void;
  busy: boolean;
}) {
  const t = useTranslations('editor');
  const {
    platform,
    webProfile,
    userAgent,
    appId,
    deviceProfileId,
    buildArtifactId,
    resetPolicy,
    launchUrl,
    tags,
  } = value;
  const { data: buildCatalog } = useSWR<{
    builds: { id: string; platform: string; appId: string; sha256: string }[];
  }>('/api/builds', fetchJson, catalogOptions);
  const { data: resourceCatalog } = useSWR<{
    resources: { id: string; platform: string; profileId: string; status: string }[];
  }>('/api/resources', fetchJson, catalogOptions);
  const builds = buildCatalog?.builds ?? [];
  const deviceResources = resourceCatalog?.resources ?? [];

  return (
    <div className={styles.container}>
      <Label>
        {t('platform')}
        <Select
          aria-label={t('platform')}
          value={platform}
          disabled={busy}
          onValueChange={(value) => onChange({ platform: value as CaseSettingsValue['platform'] })}
          items={[
            { value: 'web', label: t('web') },
            { value: 'android', label: t('android') },
            { value: 'ios', label: t('ios') },
          ]}
        />
      </Label>
      {platform === 'web' ? (
        <>
          <Label>
            {t('browserDevice')}
            <Select
              aria-label={t('browserDevice')}
              value={webProfile}
              disabled={busy}
              onValueChange={(value) =>
                onChange({ webProfile: value as CaseSettingsValue['webProfile'] })
              }
              items={[
                { value: 'legacy-desktop', label: t('desktopChromium') },
                { value: 'Pixel 7', label: 'Pixel 7 · Chromium' },
                { value: 'iPhone 13', label: 'iPhone 13 · WebKit' },
              ]}
            />
          </Label>
          <Label>
            User-Agent <span className={styles.optionalHint}>{t('optional')}</span>
            <Input
              aria-label="User-Agent"
              value={userAgent}
              disabled={busy}
              maxLength={2048}
              onChange={(event) => onChange({ userAgent: event.target.value })}
              placeholder={t('deviceDefault')}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Label>
        </>
      ) : (
        <>
          <Label>
            {t('appId')}
            <Input
              required
              aria-label={t('appId')}
              value={appId}
              disabled={busy}
              onChange={(event) => onChange({ appId: event.target.value })}
              placeholder="com.example.app"
            />
          </Label>
          <Label>
            {t('deviceProfile')}
            <Select
              required
              aria-label={t('deviceProfile')}
              value={deviceProfileId}
              disabled={busy}
              onValueChange={(value) => onChange({ deviceProfileId: value })}
              items={[
                { value: '', label: t('selectProfile') },
                deviceResources
                  .filter((resource) => resource.platform === platform)
                  .map((resource) => ({
                    value: resource.profileId,
                    label: (
                      <>
                        {resource.profileId} ·{' '}
                        {resource.status === 'quarantined'
                          ? t('quarantined')
                          : resource.status === 'busy'
                            ? t('inUse')
                            : t('available')}
                      </>
                    ),
                  })),
                !!deviceProfileId &&
                  !deviceResources.some(
                    (resource) =>
                      resource.profileId === deviceProfileId && resource.platform === platform,
                  ) && {
                    value: deviceProfileId,
                    label: (
                      <>
                        {deviceProfileId} · {t('disconnected')}
                      </>
                    ),
                  },
              ]}
            />
          </Label>
          <Label>
            {t('build')}
            <Select
              aria-label={t('build')}
              value={buildArtifactId}
              disabled={busy}
              onValueChange={(value) => onChange({ buildArtifactId: value })}
              items={[
                { value: '', label: t('installedApp') },
                builds
                  .filter((build) => build.platform === platform && build.appId === appId)
                  .map((build) => ({
                    value: build.id,
                    label: (
                      <>
                        {build.appId} · {build.sha256.slice(0, 12)}
                      </>
                    ),
                  })),
                !!buildArtifactId &&
                  !builds.some((build) => build.id === buildArtifactId) && {
                    value: buildArtifactId,
                    label: (
                      <>
                        {buildArtifactId} · {t('unavailable')}
                      </>
                    ),
                  },
              ]}
            />
          </Label>
          <Label>
            {t('resetPolicy')}
            <Select
              aria-label={t('resetPolicy')}
              value={resetPolicy}
              disabled={busy}
              onValueChange={(value) =>
                onChange({ resetPolicy: value as CaseSettingsValue['resetPolicy'] })
              }
              items={[
                { value: 'preserve', label: t('preserve') },
                { value: 'clear-data', label: t('clearData') },
                { value: 'reinstall', label: t('reinstall') },
              ]}
            />
          </Label>
          <label className={styles.videoOption}>
            <Checkbox
              checked={value.nativeVideo}
              disabled={busy}
              onCheckedChange={(checked) => onChange({ nativeVideo: checked })}
            />{' '}
            {t('video')}
          </label>
          <Label>
            {t('launchUrl')}
            <Input
              value={launchUrl}
              disabled={busy}
              onChange={(event) => onChange({ launchUrl: event.target.value })}
              placeholder="myapp://login"
            />
          </Label>
          <p className={styles.description}>{t('deviceHint')}</p>
        </>
      )}
      <Label>
        {t('tags')} <span className={styles.optionalHint}>{t('optionalTags')}</span>
        <Input
          value={tags}
          disabled={busy}
          onChange={(event) => onChange({ tags: event.target.value })}
          placeholder={t('tagExample')}
        />
      </Label>
    </div>
  );
}
