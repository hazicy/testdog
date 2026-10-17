'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { createLoginExample } from '../lib/loginExample';
import { LandingReveal } from './LandingMotion';
import { Icon } from '@iconify/react/offline';
import fileIcon from '@iconify-icons/lucide/file-text';
import lockIcon from '@iconify-icons/lucide/lock-keyhole';

import { useTranslations } from 'next-intl';

import styles from './LandingDemo.module.css';

const PlanBoard = dynamic(
  () => import('@/features/runs/components/PlanBoard').then((module) => module.PlanBoard),
  { ssr: false },
);

const LandingRunPreview = dynamic(
  () => import('./LandingRunPreview').then((module) => module.LandingRunPreview),
  { ssr: false, loading: () => <div className={styles.previewLoading} aria-hidden="true" /> },
);

function subscribeLayout(callback: () => void) {
  const media = window.matchMedia('(max-width: 47.5rem)');

  media.addEventListener('change', callback);

  return () => media.removeEventListener('change', callback);
}

export function LandingDemo() {
  const compact = useSyncExternalStore(
    subscribeLayout,
    () => window.matchMedia('(max-width: 47.5rem)').matches,
    () => false,
  );
  const t = useTranslations('landing');
  const example = useMemo(
    () =>
      createLoginExample({
        name: t('loginName'),
        url: 'app.example.com/login',
        input: [
          t('openLogin'),
          t('enterExampleCredentials'),
          t('clickLoginButton'),
          t('verifyWelcome'),
        ],
        title: t('welcome'),
        subtitle: t('signedIn'),
      }),
    [t],
  );
  const [draftPlan, setDraftPlan] = useState(example.run.plan);
  const { content } = example;

  return (
    <div className={styles.demo}>
      <section aria-labelledby="editor-heading">
        <LandingReveal>
          <h2 id="editor-heading" className={styles.sectionHeading}>
            {t('editorTitle')}
          </h2>
          <div className={styles.editorFrame}>
            <div className={styles.windowHeader}>
              <span>
                <Icon icon={fileIcon} aria-hidden="true" />
                {content.name}
              </span>
              <span className={styles.windowUrl}>
                <Icon icon={lockIcon} aria-hidden="true" />
                {content.url}
              </span>
            </div>
            <div className={styles.editorBody}>
              <aside className={styles.prompt} aria-label={t('testDescription')}>
                <span className={styles.promptTitle}>{t('testDescription')}</span>
                <ol>
                  {content.input.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </aside>
              <div className={styles.planCanvas}>
                <PlanBoard
                  key={compact ? 'compact' : 'wide'}
                  plan={draftPlan}
                  steps={[]}
                  onStep={() => {}}
                  onChange={setDraftPlan}
                  fullHeight
                />
              </div>
            </div>
          </div>
        </LandingReveal>
      </section>
      <section id="replay" className={styles.playbackSection} aria-labelledby="playback-heading">
        <LandingReveal>
          <h2 id="playback-heading" className={styles.sectionHeading}>
            {t('playbackTitle')}
          </h2>
          <div className={styles.workspaceFrame}>
            <div className={styles.windowHeader}>
              <span>
                <Icon icon={fileIcon} aria-hidden="true" />
                {content.name}
              </span>
            </div>
            <LandingRunPreview example={example} />
          </div>
        </LandingReveal>
      </section>
    </div>
  );
}
