import { ErrorState } from '@/components/shared/ErrorState';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <ErrorState title="页面不存在" message="地址可能不正确，或页面已被移除。" />
    </div>
  );
}
