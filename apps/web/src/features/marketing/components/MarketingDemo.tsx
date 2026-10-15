'use client';

import { useTranslations } from 'next-intl';

import styles from './MarketingDemo.module.css';

import { statusStyles } from '@/components/ui/statusStyles';
import { Tabs } from '@/components/ui/Tabs';

export function MarketingDemo() {
  const t = useTranslations('marketing');
  const examples = [
    {
      name: t('loginName'),
      url: 'app.example.com/login',
      input: [
        t('openLogin'),
        t('enterExampleCredentials'),
        t('clickLoginButton'),
        t('verifyWelcome'),
      ],
      steps: [t('compileFour'), t('observeLogin'), t('actLogin'), t('verifyLogin')],
      title: t('welcome'),
      subtitle: t('signedIn'),
      badge: t('loginSuccess'),
    },
    {
      name: t('formName'),
      url: 'app.example.com/contact',
      input: [t('openContact'), t('fillContact'), t('clickSubmit'), t('verifySubmit')],
      steps: [t('compileFour'), t('observeContact'), t('actContact'), t('verifyContact')],
      title: t('submitted'),
      subtitle: t('receivedMessage'),
      badge: t('formSubmitted'),
    },
    {
      name: t('navigation'),
      url: 'app.example.com/settings',
      input: [t('openWorkspaceHome'), t('clickSettings'), t('waitSettings'), t('verifySettings')],
      steps: [t('compileFour'), t('observeNavigation'), t('actNavigation'), t('verifyNavigation')],
      title: t('accountSettings'),
      subtitle: t('manageProfile'),
      badge: t('navigationComplete'),
    },
  ];

  return (
    <Tabs.Root defaultValue={0} className={styles.root}>
      <div className={styles.container}>
        <Tabs.List activateOnFocus className={styles.list} aria-label={t('exampleCases')}>
          {examples.map((item, index) => (
            <Tabs.Tab key={item.name} value={index} className={styles.tab}>
              {item.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <span className={styles.label}>{t('interactiveDemo')}</span>
      </div>
      {examples.map((example, index) => (
        <Tabs.Panel key={example.name} value={index} className={styles.panel}>
          <section className={styles.section} aria-label={t('testDescription')}>
            <h3 className={styles.subheading}>{t('testDescription')}</h3>
            <p className={styles.description}>https://{example.url}</p>
            <ol className={styles.ol}>
              {example.input.map((line, index) => (
                <li key={line} className={styles.item}>
                  <span className={styles.stepNumber}>{index + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className={styles.result} aria-label={t('exampleResult')}>
            <div className={styles.resultHeading}>
              <h3 className={styles.resultTitle}>{t('runs')}</h3>
              <span data-slot="status" data-status="passed" className={statusStyles('passed')}>
                <span />
                {t('passed')}
              </span>
            </div>
            <ol className={styles.ol}>
              {example.steps.map((step) => (
                <li key={step} className={styles.item}>
                  <span aria-hidden="true" className={styles.checkmark}>
                    ✓
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className={styles.evidence}>
              <p className={styles.evidenceCaption}>
                {t('pageEvidence', { title: example.title })}
              </p>
            </div>
          </section>
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
