import { redirect } from 'next/navigation';

export default async function SuitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ case?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  redirect(`/cases/folders/${id}${query.case ? `?case=${encodeURIComponent(query.case)}` : ''}`);
}
