import Image from 'next/image';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2.5">
      <Image src="/brand/testdog-mark.svg" alt="" width={32} height={32} unoptimized />
      {!compact && (
        <span className="text-xl font-bold tracking-tight">
          testdog<span className="text-brand">.</span>
        </span>
      )}
    </span>
  );
}
