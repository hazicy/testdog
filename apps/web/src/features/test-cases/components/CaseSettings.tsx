'use client';

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
  name,
  onNameChange,
  value,
  onChange,
  busy,
}: {
  name: string;
  onNameChange: (name: string) => void;
  value: CaseSettingsValue;
  onChange: (patch: Partial<CaseSettingsValue>) => void;
  busy: boolean;
}) {
  const {
    url,
    platform,
    webProfile,
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
        测试名称
        <Input
          name="testName"
          aria-label="测试名称"
          required
          maxLength={120}
          value={name}
          disabled={busy}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="例如：验证登录页面"
        />
      </Label>
      <Label>
        平台
        <Select
          aria-label="平台"
          value={platform}
          disabled={busy}
          onValueChange={(value) => onChange({ platform: value as CaseSettingsValue['platform'] })}
          items={[
            { value: 'web', label: 'Web · 浏览器' },
            { value: 'android', label: 'Android · 原生应用' },
            { value: 'ios', label: 'iOS · 原生应用' },
          ]}
        />
      </Label>
      {platform === 'web' ? (
        <>
          <Label>
            网站地址
            <Input
              required
              type="url"
              aria-label="网站地址"
              value={url}
              disabled={busy}
              onChange={(event) => onChange({ url: event.target.value })}
              placeholder="https://your-app.com"
            />
          </Label>
          <div className={styles.mobileProfile}>
            <label className={styles.field}>
              <Checkbox
                aria-label="移动模拟"
                checked={webProfile !== 'legacy-desktop'}
                disabled={busy}
                onCheckedChange={(checked) =>
                  onChange({ webProfile: checked ? 'Pixel 7' : 'legacy-desktop' })
                }
              />
              移动模拟
            </label>
            <p className={styles.description}>
              {webProfile === 'legacy-desktop'
                ? '桌面 Chromium · 1280 × 800'
                : '模拟移动设备的视口、触摸操作和浏览器标识。'}
            </p>
          </div>
          {webProfile !== 'legacy-desktop' && (
            <Label>
              浏览器与设备
              <Select
                aria-label="浏览器与设备"
                value={webProfile}
                disabled={busy}
                onValueChange={(value) =>
                  onChange({ webProfile: value as CaseSettingsValue['webProfile'] })
                }
                items={[
                  { value: 'Pixel 7', label: 'Pixel 7 · Chromium' },
                  { value: 'iPhone 13', label: 'iPhone 13 · WebKit' },
                ]}
              />
            </Label>
          )}
        </>
      ) : (
        <>
          <Label>
            应用标识
            <Input
              required
              aria-label="应用标识"
              value={appId}
              disabled={busy}
              onChange={(event) => onChange({ appId: event.target.value })}
              placeholder="com.example.app"
            />
          </Label>
          <Label>
            设备配置
            <Select
              required
              aria-label="设备配置"
              value={deviceProfileId}
              disabled={busy}
              onValueChange={(value) => onChange({ deviceProfileId: value })}
              items={[
                { value: '', label: '选择已登记的设备配置' },
                deviceResources
                  .filter((resource) => resource.platform === platform)
                  .map((resource) => ({
                    value: resource.profileId,
                    label: (
                      <>
                        {resource.profileId} ·{' '}
                        {resource.status === 'quarantined'
                          ? '隔离中'
                          : resource.status === 'busy'
                            ? '使用中'
                            : '可用'}
                      </>
                    ),
                  })),
                !!deviceProfileId &&
                  !deviceResources.some(
                    (resource) =>
                      resource.profileId === deviceProfileId && resource.platform === platform,
                  ) && { value: deviceProfileId, label: <>{deviceProfileId} · 未连接</> },
              ]}
            />
          </Label>
          <Label>
            应用构建
            <Select
              aria-label="应用构建"
              value={buildArtifactId}
              disabled={busy}
              onValueChange={(value) => onChange({ buildArtifactId: value })}
              items={[
                { value: '', label: '使用设备上已安装的应用' },
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
                    label: <>{buildArtifactId} · 不可用</>,
                  },
              ]}
            />
          </Label>
          <Label>
            初始化策略
            <Select
              aria-label="初始化策略"
              value={resetPolicy}
              disabled={busy}
              onValueChange={(value) =>
                onChange({ resetPolicy: value as CaseSettingsValue['resetPolicy'] })
              }
              items={[
                { value: 'preserve', label: '保留应用数据' },
                { value: 'clear-data', label: '清除应用数据' },
                { value: 'reinstall', label: '重新安装所选构建' },
              ]}
            />
          </Label>
          <label className={styles.videoOption}>
            <Checkbox
              checked={value.nativeVideo}
              disabled={busy}
              onCheckedChange={(checked) => onChange({ nativeVideo: checked })}
            />{' '}
            视频
          </label>
          <Label>
            启动链接（可选）
            <Input
              value={launchUrl}
              disabled={busy}
              onChange={(event) => onChange({ launchUrl: event.target.value })}
              placeholder="myapp://login"
            />
          </Label>
          <p className={styles.description}>
            设备繁忙时会排队。重新安装及 iOS 清除数据需要选择应用构建。
          </p>
        </>
      )}
      <Label>
        标签 <span className={styles.optionalHint}>（可选，逗号分隔）</span>
        <Input
          value={tags}
          disabled={busy}
          onChange={(event) => onChange({ tags: event.target.value })}
          placeholder="冒烟测试, 登录"
        />
      </Label>
    </div>
  );
}
