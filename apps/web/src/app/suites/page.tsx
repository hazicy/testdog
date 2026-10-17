import { redirect } from 'next/navigation';

export default async function SuitesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  redirect((await searchParams).view === 'runs' ? '/cases?view=runs' : '/cases');
}
