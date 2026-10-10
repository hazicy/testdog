'use client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { useEffect, useState } from 'react';
import type { TestCase } from '@/workspace/types';
import { requestJson as api } from '@/client/api';
import { Dialog } from '@/components/shared/Dialog';
import { WorkspaceIcon as Icon } from '@/components/shared/WorkspaceIcon';

export function TestEditor({
  test,
  duplicate = false,
  onClose,
  onSaved,
}: {
  test?: TestCase;
  duplicate?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(test ? `${test.name}${duplicate ? '（副本）' : ''}` : '');
  const [url, setUrl] = useState(test?.url || '');
  const native = test?.target && test.target.platform !== 'web' ? test.target : undefined;
  const [platform, setPlatform] = useState<'web' | 'android' | 'ios'>(
    test?.target?.platform ?? 'web',
  );
  const [webProfile, setWebProfile] = useState<string>(
    test?.target?.platform === 'web'
      ? test.target.deviceProfile
      : test
        ? 'legacy-desktop'
        : 'Pixel 7',
  );
  const [appId, setAppId] = useState(native?.appId || '');
  const [deviceProfileId, setDeviceProfileId] = useState(native?.deviceProfileId || '');
  const [buildArtifactId, setBuildArtifactId] = useState(native?.buildArtifactId || '');
  const [resetPolicy, setResetPolicy] = useState<'preserve' | 'clear-data' | 'reinstall'>(
    native?.resetPolicy || 'preserve',
  );
  const [launchUrl, setLaunchUrl] = useState(native?.launchUrl || '');
  const [nativeVideo, setNativeVideo] = useState(native?.evidence?.video || false);
  const [nativeTrace, setNativeTrace] = useState(native?.evidence?.trace || false);
  const [nativeLogs, setNativeLogs] = useState(native?.evidence?.logs || false);
  const [inputRefs, setInputRefs] = useState(JSON.stringify(test?.target?.inputs || {}, null, 2));
  const [builds, setBuilds] = useState<
    { id: string; platform: string; appId: string; sha256: string }[]
  >([]);
  const [deviceResources, setDeviceResources] = useState<
    { id: string; platform: string; profileId: string; status: string }[]
  >([]);
  const [goal, setGoal] = useState(test?.goal || '');
  const [tags, setTags] = useState(test?.tags.join(', ') || '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    void api<{ builds: typeof builds }>('/api/builds')
      .then((data) => setBuilds(data.builds))
      .catch(() => {});
    void api<{ resources: typeof deviceResources }>('/api/resources')
      .then((data) => setDeviceResources(data.resources))
      .catch(() => {});
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const editing = test && !duplicate;

      await api(editing ? `/api/tests/${test.id}` : '/api/tests', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          ...(platform === 'web'
            ? {
                url: url.trim(),
                target: {
                  schemaVersion: 1,
                  platform,
                  url: url.trim(),
                  browser: webProfile === 'iPhone 13' ? 'webkit' : 'chromium',
                  deviceProfile: webProfile,
                  inputs: JSON.parse(inputRefs),
                },
              }
            : {
                target: {
                  schemaVersion: 1,
                  platform,
                  appId,
                  deviceProfileId,
                  inputs: JSON.parse(inputRefs),
                  resetPolicy,
                  evidence: { video: nativeVideo, trace: nativeTrace, logs: nativeLogs },
                  ...(buildArtifactId ? { buildArtifactId } : {}),
                  ...(launchUrl.trim() ? { launchUrl: launchUrl.trim() } : {}),
                },
              }),

          goal,
          tags: tags
            .split(/[,，]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      await onSaved();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      titleId="editor-title"
      busy={saving}
      onDismiss={onClose}
      initialFocus='[name="testName"]'
    >
      <form onSubmit={(event) => void save(event)}>
        <div className="ws-dialog-header">
          <div>
            <h2 id="editor-title" className="text-lg font-semibold">
              {test && !duplicate ? '编辑测试' : '新建测试'}
            </h2>
            <p className="mt-1 text-xs text-text-subtle">描述操作与预期结果，由 AI 规划执行。</p>
          </div>
          <Button
            type="button"
            className="ws-icon-button"
            disabled={saving}
            aria-label="关闭编辑器"
            onClick={() => onClose()}
          >
            <Icon name="close" />
          </Button>
        </div>
        <div className="space-y-5 p-6">
          <label className="ws-label">
            测试名称
            <Input
              name="testName"
              className="ws-input"
              required
              maxLength={120}
              value={name}
              disabled={saving}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：验证登录页面"
            />
          </label>
          <label className="ws-label">
            平台
            <Select
              className="ws-input"
              aria-label="平台"
              value={platform}
              disabled={saving}
              onValueChange={(value) => setPlatform(value as typeof platform)}
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
                  value={url}
                  disabled={saving}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://your-app.com"
                />
              </label>
              <label className="ws-label">
                浏览器与设备
                <Select
                  className="ws-input"
                  aria-label="浏览器与设备"
                  value={webProfile}
                  disabled={saving}
                  onValueChange={(value) => setWebProfile(value)}
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
                  value={appId}
                  disabled={saving}
                  onChange={(event) => setAppId(event.target.value)}
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
                  disabled={saving}
                  onValueChange={(value) => setDeviceProfileId(value)}
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
                  disabled={saving}
                  onValueChange={(value) => setBuildArtifactId(value)}
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
                  disabled={saving}
                  onValueChange={(value) => setResetPolicy(value as typeof resetPolicy)}
                  items={[
                    { value: 'preserve', label: '保留应用数据' },
                    { value: 'clear-data', label: '清除应用数据' },
                    { value: 'reinstall', label: '重新安装所选构建' },
                  ]}
                />
              </label>
              <fieldset className="space-y-2 text-xs text-page-muted">
                <legend className="mb-2">诊断附件</legend>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={nativeVideo}
                    disabled={saving}
                    onCheckedChange={(checked) => setNativeVideo(checked)}
                  />{' '}
                  视频
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={nativeTrace}
                    disabled={saving}
                    onCheckedChange={(checked) => setNativeTrace(checked)}
                  />{' '}
                  设备 trace
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={nativeLogs}
                    disabled={saving}
                    onCheckedChange={(checked) => setNativeLogs(checked)}
                  />{' '}
                  应用日志
                </label>
              </fieldset>
              <label className="ws-label">
                启动链接（可选）
                <Input
                  className="ws-input"
                  value={launchUrl}
                  disabled={saving}
                  onChange={(event) => setLaunchUrl(event.target.value)}
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
              disabled={saving}
              onChange={(event) => setInputRefs(event.target.value)}
            />
            <span className="text-xs text-page-muted">
              步骤中用 {'${input.name}'} 引用输入。普通输入：{'{"name":{"value":"Ada"}}'}；密码：
              {'{"password":{"secretRef":"LOGIN_PASSWORD"}}'}。密钥由 worker 配置。
            </span>
          </label>
          <label className="ws-label">
            测试步骤与预期结果
            <textarea
              className="ws-input min-h-48 resize-y leading-6"
              required
              maxLength={20000}
              value={goal}
              disabled={saving}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={'1. 打开网站首页\n2. 点击登录按钮\n3. 验证页面包含邮箱输入框和提交按钮'}
            />
          </label>
          <p className="text-xs leading-5 text-text-subtle">
            测试会实际操作目标网站。建议使用测试环境，并写明判断通过的条件。
          </p>
          <label className="ws-label">
            标签 <span className="font-normal text-text-subtle">（可选，逗号分隔）</span>
            <Input
              className="ws-input"
              value={tags}
              disabled={saving}
              onChange={(event) => setTags(event.target.value)}
              placeholder="冒烟测试, 登录"
            />
          </label>
          {formError && (
            <p role="alert" className="text-sm text-error-ink">
              {formError}
            </p>
          )}
        </div>
        <div className="ws-dialog-footer">
          <Button type="button" disabled={saving} className="ws-button" onClick={() => onClose()}>
            取消
          </Button>
          <Button type="submit" disabled={saving} className="ws-button primary">
            {saving ? '保存中…' : '保存测试'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
