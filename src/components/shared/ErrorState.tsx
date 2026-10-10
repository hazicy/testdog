import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export function ErrorState({
  title,
  message,
  retry,
  href = '/cases',
  linkLabel = '返回测试工作台',
}: {
  title: string;
  message: string;
  retry?: () => void;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <section
      className="mx-auto max-w-2xl border border-page-line bg-[#fffefa] p-8"
      aria-label={title}
    >
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p role="alert" className="mt-4 text-sm leading-7 text-page-muted">
        {message}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {retry && (
          <Button className="ws-button primary" onClick={retry}>
            重试
          </Button>
        )}
        <Link className="ws-button" href={href}>
          {linkLabel}
        </Link>
      </div>
    </section>
  );
}
