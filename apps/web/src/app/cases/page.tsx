import { Suspense } from 'react';
import { Workspace } from '@/features/workspace/components/Workspace';

export default function Cases() {
  return (
    <Suspense fallback={<p>正在加载…</p>}>
      <Workspace view="tests" />
    </Suspense>
  );
}
