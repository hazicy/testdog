import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright', '@playwright/test', 'agent-device'],
};

export default nextConfig;
