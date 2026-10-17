import { redirect } from 'next/navigation';

export default async function SuiteRunPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/cases/batches/${(await params).id}`);
}
