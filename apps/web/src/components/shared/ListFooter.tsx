'use client';

import { Button } from '@/components/ui/Button';
import styles from './ListFooter.module.css';

type Props = {
  loading: boolean;
  count: number;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  previousPage: () => void;
  nextPage: () => void;
};

export function ListFooter({
  loading,
  count,
  page,
  hasPrevious,
  hasNext,
  previousPage,
  nextPage,
}: Props) {
  if (page === 1 && (loading || count === 0)) return null;

  return (
    <div data-ui="workspace-index-footer" className={styles.footer}>
      {!loading && <span>本页 {count} 条记录</span>}
      <nav className={styles.pagination} aria-label="列表分页">
        <Button variant="ghost" size="sm" disabled={!hasPrevious || loading} onClick={previousPage}>
          上一页
        </Button>
        <span aria-current="page">第 {page} 页</span>
        <Button variant="ghost" size="sm" disabled={!hasNext || loading} onClick={nextPage}>
          下一页
        </Button>
      </nav>
    </div>
  );
}
