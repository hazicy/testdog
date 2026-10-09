import { RunDetail } from '@/components/RunDetail';
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunDetail key={id} id={id} />;
}
