import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright', '@playwright/test', 'agent-device'],
  allowedDevOrigins: ['192.168.2.123'],
};

export default nextConfig;
