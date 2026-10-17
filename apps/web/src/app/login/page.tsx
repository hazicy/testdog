import { AuthForm } from '@/features/auth/components/AuthForm';
import { configuredProviders } from '@/server/auth/auth';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string; error?: string | string[] }>;
}) {
  const params = await searchParams;

  return (
    <AuthForm
      mode="login"
      providers={Object.keys(configuredProviders()) as ('google' | 'github')[]}
      callbackURL={params.callbackURL}
      oauthError={params.error}
    />
  );
}
