import { cookies } from 'next/headers';
import { Settings } from '@/features/settings/components/Settings';

export default async function SettingsPage() {
  const theme = (await cookies()).get('theme')?.value === 'dark' ? 'dark' : 'light';

  return <Settings initialTheme={theme} />;
}
