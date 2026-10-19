import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const workspaceRoot = resolve(process.cwd(), '../..');

if (existsSync(resolve(workspaceRoot, 'pnpm-workspace.yaml'))) {
  loadDotenv({ path: resolve(workspaceRoot, '.env') });
  process.env.TESTDOG_DATA_DIR ||= resolve(workspaceRoot, '.automation');
}

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  transpilePackages: ['@testdog/contracts', '@testdog/automation', '@testdog/server'],
  serverExternalPackages: ['playwright', '@playwright/test', 'agent-device'],
  allowedDevOrigins: ['192.168.2.123', '192.168.2.35'],
};

export default createNextIntlPlugin()(nextConfig);
