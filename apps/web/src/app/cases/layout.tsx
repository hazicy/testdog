import { Suspense, type ReactNode } from 'react';
import { SuiteExplorer } from '@/features/suites/components/SuiteExplorer';
import { LoadingState } from '@/components/shared/LoadingState';

export default function CasesLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <SuiteExplorer>{children}</SuiteExplorer>
    </Suspense>
  );
}
