'use client';

import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@iconify/react/offline';
import sheetIcon from '@iconify-icons/lucide/file-spreadsheet';
import flameIcon from '@iconify-icons/lucide/flame';
import arrowIcon from '@iconify-icons/lucide/arrow-up-right';
import backIcon from '@iconify-icons/lucide/arrow-left';
import { ExcelAcceptancePanel } from './ExcelAcceptancePanel';
import { VolcengineSettingsPanel } from './VolcengineSettingsPanel';
import styles from './Plugins.module.css';

const catalog = [
  {
    id: 'volcengine-abtest',
    icon: flameIcon,
    kind: 'execution',
    summary: 'experimentSummary',
    tone: 'experiment',
  },
  {
    id: 'excel-ui-acceptance',
    icon: sheetIcon,
    kind: 'results',
    summary: 'excelSummary',
    tone: 'excel',
  },
] as const;

export function Plugins() {
  const t = useTranslations('plugins');
  const router = useRouter();
  const params = useSearchParams();
  const plugin = catalog.find((item) => item.id === params.get('plugin'));

  return (
    <div className={styles.panel}>
      {plugin ? (
        <>
          <button type="button" className={styles.back} onClick={() => router.push('/plugins')}>
            <Icon icon={backIcon} aria-hidden="true" />
            {t('title')}
          </button>
          <header className={styles.detailHeader}>
            <span className={styles.appIcon} data-tone={plugin.tone}>
              <Icon icon={plugin.icon} aria-hidden="true" />
            </span>
            <div>
              <h1>{t(plugin.id)}</h1>
              <p>{t(plugin.summary)}</p>
            </div>
          </header>
          <div className={styles.detail}>
            {plugin.id === 'volcengine-abtest' ? (
              <VolcengineSettingsPanel />
            ) : (
              <ExcelAcceptancePanel />
            )}
          </div>
        </>
      ) : (
        <>
          <header className={styles.pageHeader}>
            <h1>{t('title')}</h1>
          </header>
          <div className={styles.catalog}>
            {catalog.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.catalogItem}
                onClick={() => router.push(`/plugins?plugin=${item.id}`)}
              >
                <span className={styles.cardTop}>
                  <span className={styles.appIcon} data-tone={item.tone}>
                    <Icon icon={item.icon} aria-hidden="true" />
                  </span>
                  <span className={styles.kind}>{t(item.kind)}</span>
                  <Icon icon={arrowIcon} className={styles.cardArrow} aria-hidden="true" />
                </span>
                <strong>{t(item.id)}</strong>
                <span className={styles.summary}>{t(item.summary)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
