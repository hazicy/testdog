import Image from 'next/image';

export function EmptyIllustration({
  variant,
}: {
  variant: 'tests' | 'runs' | 'search' | 'not-found';
}) {
  return (
    <Image
      src={`/illustrations/testdog-${variant}.svg`}
      alt=""
      width={240}
      height={160}
      className="mb-5 h-auto w-60 max-w-full"
      unoptimized
    />
  );
}
