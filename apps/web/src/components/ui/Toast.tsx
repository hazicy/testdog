'use client';

import { Toast as BaseToast } from '@base-ui/react/toast';
import { Icon } from '@iconify/react/offline';
import checkIcon from '@iconify-icons/lucide/circle-check';
import errorIcon from '@iconify-icons/lucide/circle-alert';
import xIcon from '@iconify-icons/lucide/x';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from './Button';
import styles from './Toast.module.css';

export const useToastManager = BaseToast.useToastManager;

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider timeout={5000} limit={3}>
      {children}
      <ToastViewport />
    </BaseToast.Provider>
  );
}

function ToastViewport() {
  const { toasts } = useToastManager();
  const t = useTranslations('ui');

  return (
    <BaseToast.Portal>
      <BaseToast.Viewport className={styles.viewport} aria-label={t('notifications')}>
        {toasts.map((toast) => (
          <BaseToast.Root key={toast.id} toast={toast} className={styles.toast}>
            <BaseToast.Content className={styles.content}>
              {(toast.type === 'success' || toast.type === 'error') && (
                <Icon
                  icon={toast.type === 'success' ? checkIcon : errorIcon}
                  className={styles.icon}
                  aria-hidden="true"
                />
              )}
              <div className={styles.text}>
                <BaseToast.Title className={styles.title} />
                {toast.description && <BaseToast.Description className={styles.description} />}
              </div>
              <BaseToast.Close
                render={<Button variant="ghost" size="icon-xs" />}
                aria-label={t('dismiss_notification')}
              >
                <Icon icon={xIcon} className={styles.closeIcon} aria-hidden="true" />
              </BaseToast.Close>
            </BaseToast.Content>
          </BaseToast.Root>
        ))}
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}
