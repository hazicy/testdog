import { Suspense } from 'react';
import { Workspace } from '@/components/Workspace';
export default function Cases() {
  return (
    <Suspense fallback={<p>正在加载…</p>}>
      <Workspace view="tests" />
    </Suspense>
  );
}
