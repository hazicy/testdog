import { redirect } from 'next/navigation';

export default async function FolderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ case?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  redirect(
    `/cases?${new URLSearchParams({ folder: id, ...(query.case ? { case: query.case } : {}) })}`,
  );
}
