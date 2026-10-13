import { ErrorState } from '@/components/shared/ErrorState';

export default function NotFound() {
  return <ErrorState illustration="not-found" message="页面不存在或已被移除" />;
}
