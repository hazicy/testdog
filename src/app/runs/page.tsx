import { Suspense } from 'react';
import { Workspace } from '@/components/Workspace';
export default function Runs() {
  return (
    <Suspense fallback={<p>正在加载…</p>}>
      <Workspace view="results" />
    </Suspense>
  );
}
