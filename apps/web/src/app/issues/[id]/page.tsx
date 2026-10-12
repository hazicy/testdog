import { IssueDetail } from '@/features/issues/components/IssueDetail';
import { notFound } from 'next/navigation';
import { z } from 'zod';

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!z.uuid().safeParse(id).success) notFound();

  return <IssueDetail key={id} id={id} />;
}
