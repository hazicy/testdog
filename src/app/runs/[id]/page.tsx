import { RunDetail } from '@/components/studio/RunDetail';
import { notFound } from 'next/navigation';
import { z } from 'zod';
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <RunDetail key={id} id={id} />;
}
