import { Suspense } from 'react';
import { LoadingState } from '@/components/shared/LoadingState';
import { IssueList } from '@/features/issues/components/IssueList';

export default function IssuesPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <IssueList />
    </Suspense>
  );
}
