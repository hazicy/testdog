import { AuthForm } from '@/features/auth/components/AuthForm';
import { configuredProviders } from '@/server/auth/auth';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthForm
      mode="register"
      providers={Object.keys(configuredProviders()) as ('google' | 'github')[]}
      callbackURL={params.callbackURL}
    />
  );
}
