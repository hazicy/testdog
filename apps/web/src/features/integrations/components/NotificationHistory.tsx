'use client';

import { useId, useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import clsx from 'clsx';
import { Icon } from '@iconify/react/offline';
import closeIcon from '@iconify-icons/lucide/x';
import { api } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogHeader } from '@/components/ui/Dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import type { IntegrationsResponse } from '@testdog/contracts/integrations/types';
import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';
import styles from './Integrations.module.css';

export function NotificationHistory({
  deliveries,
  emailAvailable,
  onRetried,
  onDismiss,
}: {
  deliveries: IntegrationsResponse['deliveries'];
  emailAvailable: boolean;
  onRetried: () => Promise<unknown>;
  onDismiss: () => void;
}) {
  const t = useTranslations('integrations');
  const format = useFormatter();
  const titleId = useId();
  const [retrying, setRetrying] = useState<string>();
  const [actionError, setActionError] = useState('');

  async function retry(channel: string, id: string) {
    setRetrying(id);
    setActionError('');
    try {
      await api.post(`/api/integrations/${channel}/deliveries/${id}/retry`);
      await onRetried();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t('retryFailed'));
    } finally {
      setRetrying(undefined);
    }
  }

  return (
    <Dialog titleId={titleId} busy={!!retrying} onDismiss={onDismiss} className={styles.dialog}>
      <DialogHeader>
        <h2 id={titleId} className={styles.heading}>
          {t('history')}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('closeHistory')}
          disabled={!!retrying}
          onClick={onDismiss}
        >
          <Icon icon={closeIcon} width="18" aria-hidden="true" />
        </Button>
      </DialogHeader>
      <section className={styles.deliveryHistory} aria-label={t('history')}>
        {actionError && (
          <p role="alert" className={styles.deliveryError}>
            {actionError}
          </p>
        )}
        {!deliveries.length ? (
          <p className={styles.webhookHint}>{t('noDeliveries')}</p>
        ) : (
          <div className={styles.deliveryTable}>
            <Table
              className={clsx(
                workspaceStyles.workspaceIndexTable,
                workspaceStyles.isResults,
                styles.table,
              )}
            >
              <TableHeader className={styles.tableHeader}>
                <TableRow>
                  <TableHead className={styles.tableHead}>{t('channelNotification')}</TableHead>
                  <TableHead className={styles.tableHead}>{t('status')}</TableHead>
                  <TableHead className={styles.tableHead}>{t('sentAt')}</TableHead>
                  <TableHead className={styles.tableHead}>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((item) => (
                  <TableRow key={item.id} className={styles.tableRow}>
                    <TableCell className={styles.tableHead}>
                      <p>{t(`channels.${item.channel}`)}</p>
                      <p className={styles.deliveryTitle}>{item.title}</p>
                    </TableCell>
                    <TableCell className={styles.tableHead}>
                      <p>
                        {t(`deliveryStatuses.${item.status}`)} ·{' '}
                        {t('attempts', { count: item.attempts })}
                      </p>
                      {item.lastError && <p className={styles.deliveryFailure}>{item.lastError}</p>}
                    </TableCell>
                    <TableCell className={styles.tableCell}>
                      {format.dateTime(new Date(item.sentAt ?? item.createdAt), {
                        dateStyle: 'medium',
                        timeStyle: 'medium',
                      })}
                    </TableCell>
                    <TableCell className={styles.tableHead}>
                      {item.status === 'failed' && (
                        <Button
                          disabled={
                            retrying === item.id || (item.channel === 'email' && !emailAvailable)
                          }
                          onClick={() => void retry(item.channel, item.id)}
                        >
                          {t('retry')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </Dialog>
  );
}
