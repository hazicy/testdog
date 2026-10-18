'use client';

import { Fragment, useContext, useState, type ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@iconify/react/offline';
import chevronIcon from '@iconify-icons/lucide/chevron-right';
import { Checkbox } from '@/components/ui/Checkbox';
import { TableRow, TableCell } from '@/components/ui/Table';
import { WorkspaceRows } from '@/features/workspace/components/WorkspaceRows';
import { FolderTreeContext, FolderActionsContext } from '../context';
import { caseGroups } from '../lib/caseGroups';
import styles from './GroupedCaseRows.module.css';

type Props = ComponentProps<typeof WorkspaceRows> & {
  includeEmpty: boolean;
  folderId?: string | null;
};

export function GroupedCaseRows({ includeEmpty, folderId, ...props }: Props) {
  const tree = useContext(FolderTreeContext);
  const actions = useContext(FolderActionsContext);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const t = useTranslations('suites');
  const workspace = useTranslations('workspace');
  const groups = caseGroups(tree?.folders ?? [], props.visibleTests, includeEmpty, folderId);
  const groupedIds = new Set(groups.flatMap((group) => group.tests.map((test) => test.id)));
  const ungrouped = props.visibleTests.filter((test) => !groupedIds.has(test.id));

  const displayedGroups = [
    ...(ungrouped.length ? [{ folder: null, name: t('rootFolder'), tests: ungrouped }] : []),
    ...groups,
  ];

  return (
    <>
      {displayedGroups.map(({ folder, name, tests }) => {
        const id = folder?.id ?? 'root';
        const closed = collapsed.has(id);
        const members = folder?.tests ?? tree?.rootTests ?? [];
        const passed = members.filter((test) => test.latestStatus === 'passed').length;
        const total = folder?.testCount ?? members.length;
        const percent = total ? Math.round((passed / total) * 100) : 0;
        const passRate = t('passRateValue', { passed, total, percent });

        return (
          <Fragment key={id}>
            <TableRow className={styles.groupRow}>
              <TableCell colSpan={4}>
                <div className={styles.groupHeader}>
                  {props.selection && (
                    <Checkbox
                      aria-label={workspace('selectGroup', { name })}
                      disabled={!tests.length}
                      checked={
                        tests.length > 0 && tests.every((test) => props.selection!.ids.has(test.id))
                      }
                      indeterminate={
                        tests.some((test) => props.selection!.ids.has(test.id)) &&
                        !tests.every((test) => props.selection!.ids.has(test.id))
                      }
                      onCheckedChange={(checked) =>
                        props.selection!.toggle(
                          tests.map((test) => test.id),
                          checked,
                        )
                      }
                    />
                  )}
                  <button
                    type="button"
                    className={styles.toggle}
                    aria-expanded={!closed}
                    aria-label={t(closed ? 'expandFolder' : 'collapseFolder', { name })}
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);

                        if (next.has(id)) next.delete(id);
                        else next.add(id);

                        return next;
                      })
                    }
                  >
                    <Icon
                      icon={chevronIcon}
                      width="16"
                      aria-hidden="true"
                      className={styles.chevron}
                      data-expanded={!closed || undefined}
                    />
                    <span className={styles.name}>{name}</span>
                    <span className={styles.count}>{total}</span>
                  </button>
                  {folder && actions?.renderActions(folder)}
                  <div
                    className={styles.passRate}
                    role="progressbar"
                    aria-label={t('collectionPassRate', { name })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-valuetext={passRate}
                    title={passRate}
                  >
                    <span className={styles.passRateFill} style={{ width: `${percent}%` }} />
                  </div>
                </div>
              </TableCell>
            </TableRow>
            {!closed &&
              (tests.length ? (
                <WorkspaceRows {...props} visibleTests={tests} />
              ) : (
                <TableRow className={styles.emptyRow}>
                  <TableCell colSpan={4}>
                    <div className={styles.emptyContent}>
                      <span>{t('noCases')}</span>
                      {folder && actions?.renderAddActions(folder)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </Fragment>
        );
      })}
    </>
  );
}
