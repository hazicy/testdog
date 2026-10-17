import { configuredProviders } from '@/server/auth/auth';
import { cookies } from 'next/headers';
import { Settings } from '@/features/settings/components/Settings';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; team?: string }>;
}) {
  const params = await searchParams;
  const theme = (await cookies()).get('theme')?.value === 'dark' ? 'dark' : 'light';

  return (
    <Settings
      initialTheme={theme}
      invitation={params.invite}
      teamTab={params.team === '1'}
      providers={Object.keys(configuredProviders()) as ('google' | 'github')[]}
    />
  );
}
