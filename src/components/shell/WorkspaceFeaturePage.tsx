import Link from 'next/link';

export function WorkspaceFeaturePage({
  title,
  description,
  guidance,
  href,
  action,
}: {
  title: string;
  description: string;
  guidance: string;
  href: string;
  action: string;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-page-muted">{description}</p>
      </header>
      <section
        aria-label={`${title}功能状态`}
        className="space-y-4 rounded-xl border border-page-line bg-page p-6 sm:p-8"
      >
        <span className="inline-flex rounded-full bg-surface-raised px-3 py-1 text-xs text-page-muted">
          尚未开放
        </span>
        <h2 className="text-lg font-medium">{title}功能正在规划中</h2>
        <p className="max-w-2xl text-sm leading-6 text-page-muted">{guidance}</p>
        <Link href={href} className="ws-button inline-flex">
          {action}
        </Link>
      </section>
    </div>
  );
}
