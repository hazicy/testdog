import { z } from 'zod';

export const HttpUrlSchema = z
  .string()
  .trim()
  .pipe(z.url())
  .refine((value) => /^https?:\/\//i.test(value), '网站地址必须使用 http 或 https');

export const WebTargetSchema = z
  .strictObject({
    schemaVersion: z.literal(1).default(1),
    platform: z.literal('web'),
    url: z.union([HttpUrlSchema, z.literal('')]).default(''),
    browser: z.enum(['chromium', 'webkit']).default('chromium'),
    deviceProfile: z.enum(['Pixel 7', 'iPhone 13', 'legacy-desktop']).default('legacy-desktop'),
    locale: z.string().min(1).optional(),
    timezoneId: z.string().min(1).optional(),
  })
  .superRefine((target, ctx) => {
    if (target.deviceProfile === 'iPhone 13' && target.browser !== 'webkit')
      ctx.addIssue({ code: 'custom', message: 'iPhone 配置需要 WebKit' });
    if (target.deviceProfile === 'Pixel 7' && target.browser !== 'chromium')
      ctx.addIssue({ code: 'custom', message: 'Pixel 配置需要 Chromium' });
  });
const nativeFields = {
  evidence: z
    .strictObject({
      video: z.boolean().optional(),
    })
    .optional(),
  schemaVersion: z.literal(1).default(1),
  appId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]+$/),
  buildArtifactId: z.uuid().optional(),
  deviceProfileId: z.string().trim().min(1).max(200),
  launchUrl: z.url().optional(),
  resetPolicy: z.enum(['preserve', 'clear-data', 'reinstall']).default('preserve'),
};

export const TestTargetSchema = z.discriminatedUnion('platform', [
  WebTargetSchema,
  z.strictObject({ platform: z.literal('android'), ...nativeFields }),
  z.strictObject({ platform: z.literal('ios'), ...nativeFields }),
]);
export type TestTarget = z.infer<typeof TestTargetSchema>;
export type WebTarget = Extract<TestTarget, { platform: 'web' }>;
export type NativeTarget = Exclude<TestTarget, WebTarget>;

export function targetUrl(target: TestTarget): string {
  return target.platform === 'web' ? target.url : '';
}

export function defaultWebTarget(url: string): WebTarget {
  return WebTargetSchema.parse({ platform: 'web', url });
}
