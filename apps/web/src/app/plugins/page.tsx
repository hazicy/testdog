import { Suspense } from 'react';
import { LoadingState } from '@/components/shared/LoadingState';
import { Plugins } from '@/features/plugins/Plugins';

export default function PluginsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Plugins />
    </Suspense>
  );
}
