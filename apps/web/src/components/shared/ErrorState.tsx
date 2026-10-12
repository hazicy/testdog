import Link from 'next/link';
import { EmptyIllustration } from '@/components/brand/EmptyIllustration';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';

export function ErrorState({
  title,
  illustration,
  message,
  retry,
  href = '/cases',
  linkLabel = '返回测试工作台',
}: {
  title: string;
  illustration?: 'not-found';
  message: string;
  retry?: () => void;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <section
      className="mx-auto max-w-2xl border border-page-line bg-surface p-8"
      aria-label={title}
    >
      {illustration && <EmptyIllustration variant={illustration} />}
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p role="alert" className="mt-4 text-sm leading-7 text-page-muted">
        {message}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {retry && (
          <Button variant="primary" onClick={retry}>
            重试
          </Button>
        )}
        <Link className={buttonStyles()} href={href}>
          {linkLabel}
        </Link>
      </div>
    </section>
  );
}
