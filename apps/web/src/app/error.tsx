'use client';

import { ErrorState } from '@/components/shared/ErrorState';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState message="页面暂时无法打开，请稍后重试" retry={reset} />;
}
