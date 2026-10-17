import { SuiteRunView } from '@/features/suites/components/SuiteRunView';

export default async function SuiteRunPage({ params }: { params: Promise<{ id: string }> }) {
  return <SuiteRunView id={(await params).id} />;
}
