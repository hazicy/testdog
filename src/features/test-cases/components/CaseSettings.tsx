'use client';

import useSWR from 'swr';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { fetchJson } from '@/client/api';
import type { CaseSettingsValue } from '../lib/caseSettings';

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
    inputRefs,
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
    <div className="case-settings-fields">
      <label className="ws-label">
        测试名称
        <Input
          name="testName"
          aria-label="测试名称"
          className="ws-input"
          required
          maxLength={120}
          value={name}
          disabled={busy}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="例如：验证登录页面"
        />
      </label>
      <label className="ws-label">
        平台
        <Select
          className="ws-input"
          aria-label="平台"
          value={platform}
          disabled={busy}
          onValueChange={(value) => onChange({ platform: value as CaseSettingsValue['platform'] })}
          items={[
            { value: 'web', label: 'Web · 移动浏览器' },
            { value: 'android', label: 'Android · 原生应用' },
            { value: 'ios', label: 'iOS · 原生应用' },
          ]}
        />
      </label>
      {platform === 'web' ? (
        <>
          <label className="ws-label">
            网站地址
            <Input
              className="ws-input"
              required
              type="url"
              aria-label="网站地址"
              value={url}
              disabled={busy}
              onChange={(event) => onChange({ url: event.target.value })}
              placeholder="https://your-app.com"
            />
          </label>
          <label className="ws-label">
            浏览器与设备
            <Select
              className="ws-input"
              aria-label="浏览器与设备"
              value={webProfile}
              disabled={busy}
              onValueChange={(value) =>
                onChange({ webProfile: value as CaseSettingsValue['webProfile'] })
              }
              items={[
                { value: 'Pixel 7', label: 'Pixel 7 · Chromium' },
                { value: 'iPhone 13', label: 'iPhone 13 · WebKit' },
                webProfile === 'legacy-desktop' && {
                  value: 'legacy-desktop',
                  label: '历史桌面 Chromium',
                },
              ]}
            />
          </label>
        </>
      ) : (
        <>
          <label className="ws-label">
            应用标识
            <Input
              className="ws-input"
              required
              aria-label="应用标识"
              value={appId}
              disabled={busy}
              onChange={(event) => onChange({ appId: event.target.value })}
              placeholder="com.example.app"
            />
          </label>
          <label className="ws-label">
            设备配置
            <Select
              className="ws-input"
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
          </label>
          <label className="ws-label">
            应用构建
            <Select
              className="ws-input"
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
          </label>
          <label className="ws-label">
            初始化策略
            <Select
              className="ws-input"
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
          </label>
          <fieldset className="space-y-2 text-xs text-page-muted">
            <legend className="mb-2">诊断附件</legend>
            {(
              [
                ['nativeVideo', '视频'],
                ['nativeTrace', '设备 trace'],
                ['nativeLogs', '应用日志'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="flex items-center gap-2">
                <Checkbox
                  checked={value[field]}
                  disabled={busy}
                  onCheckedChange={(checked) => onChange({ [field]: checked })}
                />{' '}
                {label}
              </label>
            ))}
          </fieldset>
          <label className="ws-label">
            启动链接（可选）
            <Input
              className="ws-input"
              value={launchUrl}
              disabled={busy}
              onChange={(event) => onChange({ launchUrl: event.target.value })}
              placeholder="myapp://login"
            />
          </label>
          <p className="text-xs text-page-muted">
            设备繁忙时会排队。重新安装及 iOS 清除数据需要选择应用构建。
          </p>
        </>
      )}
      <label className="ws-label">
        输入引用（JSON，可选）
        <textarea
          className="ws-input min-h-24 font-mono text-xs"
          aria-label="输入引用（JSON，可选）"
          value={inputRefs}
          disabled={busy}
          onChange={(event) => onChange({ inputRefs: event.target.value })}
        />
        <span className="text-xs text-page-muted">
          步骤中用 {'${input.name}'} 引用输入。普通输入：{'{"name":{"value":"Ada"}}'}
          ；密码：
          {'{"password":{"secretRef":"LOGIN_PASSWORD"}}'}。密钥由 worker 配置。
        </span>
      </label>
      <label className="ws-label">
        标签 <span className="font-normal text-text-subtle">（可选，逗号分隔）</span>
        <Input
          className="ws-input"
          value={tags}
          disabled={busy}
          onChange={(event) => onChange({ tags: event.target.value })}
          placeholder="冒烟测试, 登录"
        />
      </label>
    </div>
  );
}
