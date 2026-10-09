'use client';
import { ErrorState } from '@/components/shared/ErrorState';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="页面暂时无法打开"
      message="加载页面时发生错误，请重试或返回测试工作台。"
      retry={reset}
    />
  );
}
