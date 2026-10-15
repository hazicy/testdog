import { LoadingState } from '@/components/shared/LoadingState';
import { Suspense } from 'react';
import { Workspace } from '@/features/workspace/components/Workspace';

export default function Runs() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Workspace view="results" />
    </Suspense>
  );
}
