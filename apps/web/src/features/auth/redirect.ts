export function safeCallbackURL(value?: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value))
    return '/cases';
  const pathname = value.split(/[?#]/)[0];

  if (pathname === '/login' || pathname === '/register' || pathname.startsWith('/api/'))
    return '/cases';

  return value;
}
