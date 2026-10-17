import { Icon } from '@iconify/react/offline';
import arrowUpRightIcon from '@iconify-icons/lucide/arrow-up-right';
import arrowUpIcon from '@iconify-icons/lucide/arrow-up';
import plusIcon from '@iconify-icons/lucide/plus';
import globeIcon from '@iconify-icons/lucide/globe';
import smartphoneIcon from '@iconify-icons/lucide/smartphone';
import tabletIcon from '@iconify-icons/lucide/tablet';
import serverIcon from '@iconify-icons/lucide/server';
import { useLocale, useTranslations } from 'next-intl';
import clsx from 'clsx';
import Link from 'next/link';
import { Brand } from '@/components/brand/Brand';
import { LandingMotion, LandingReveal } from '@/features/landing/components/LandingMotion';
import { landingLatin, landingChinese } from '@/features/landing/fonts';
import { LandingLanguageSwitch } from '@/features/landing/components/LandingLanguageSwitch';
import { LandingHero } from '@/features/landing/components/LandingHero';
import { LandingDemo } from '@/features/landing/components/LandingDemo';
import styles from '@/features/landing/components/landing.module.css';

export default function Home() {
  const t = useTranslations('landing');
  const locale = useLocale();
  const faqs = [
    [t('faqScripts'), t('faqScriptsAnswer')],
    [t('faqPlatforms'), t('faqPlatformsAnswer')],
    [t('faqResults'), t('faqResultsAnswer')],
    [t('faqHosting'), t('faqHostingAnswer')],
  ];

  return (
    <LandingMotion className={clsx(styles.landing, landingLatin.variable, landingChinese.variable)}>
      <a href="#main-content" className={styles.skip}>
        {t('skip')}
      </a>
      <header className={styles.header}>
        <div className={clsx(styles.container, styles.nav)}>
          <Link href="/" aria-label={t('home')}>
            <Brand />
          </Link>
          <nav aria-label={t('navigation')}>
            <a href="#workflow">{t('workflow')}</a>
            <a href="#features">{t('features')}</a>
            <a href="#faq">{t('faq')}</a>
          </nav>
          <div className={styles.navActions}>
            <LandingLanguageSwitch />
            <Link href="/cases" className={clsx(styles.button, styles.navButton)}>
              {t('openWorkspace')}
              <Icon icon={arrowUpRightIcon} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>
      <main id="main-content">
        <LandingHero />
        <div id="workflow" className={clsx(styles.productStory, styles.container)}>
          <LandingDemo key={locale} />
        </div>
        <section
          id="features"
          className={clsx(styles.capabilities, styles.container)}
          aria-labelledby="platform-heading"
        >
          <LandingReveal>
            <div className={styles.sectionHeading}>
              <h2 id="platform-heading">
                {t('platformTitle')}
                <br />
                <span>{t('platformTitleSecond')}</span>
              </h2>
            </div>
            <div className={styles.capabilityGrid}>
              <article className={styles.platformCard}>
                <p className={styles.cardIntro}>{t('platformBody')}</p>
                <div className={styles.platformDevices}>
                  <div className={styles.deviceWeb}>
                    <span className={styles.deviceTop}>
                      <Icon icon={globeIcon} aria-hidden="true" />
                      Web
                    </span>
                    <div className={styles.deviceContent} aria-hidden="true">
                      <i />
                      <i />
                      <b />
                    </div>
                  </div>
                  <div className={styles.devicePhone}>
                    <span className={styles.deviceTop}>
                      <Icon icon={smartphoneIcon} aria-hidden="true" />
                      Android
                    </span>
                    <div className={styles.deviceContent} aria-hidden="true">
                      <i />
                      <i />
                      <b />
                    </div>
                  </div>
                  <div className={styles.deviceTablet}>
                    <span className={styles.deviceTop}>
                      <Icon icon={tabletIcon} aria-hidden="true" />
                      iOS
                    </span>
                    <div className={styles.deviceContent} aria-hidden="true">
                      <i />
                      <i />
                      <b />
                    </div>
                  </div>
                </div>
              </article>
              <article className={styles.hostingCard}>
                <Icon icon={serverIcon} className={styles.hostingIcon} aria-hidden="true" />
                <div>
                  <h3>{t('hostingTitle')}</h3>
                  <p>{t('hostingBody')}</p>
                </div>
              </article>
            </div>
          </LandingReveal>
        </section>
        <section
          id="faq"
          className={clsx(styles.faq, styles.container)}
          aria-labelledby="faq-heading"
        >
          <div>
            <h2 id="faq-heading">{t('faq')}</h2>
          </div>
          <div className={styles.questions}>
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Icon icon={plusIcon} aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section
          className={clsx(styles.closing, styles.container)}
          aria-labelledby="closing-heading"
        >
          <LandingReveal className={styles.closingInner}>
            <div>
              <h2 id="closing-heading">
                {t('closingFirst')}
                <br />
                <span>{t('closingSecond')}</span>
              </h2>
            </div>
            <Link href="/cases" className={clsx(styles.button, styles.primary)}>
              {t('getStartedBrand')}
              <Icon icon={arrowUpRightIcon} aria-hidden="true" />
            </Link>
          </LandingReveal>
        </section>
      </main>
      <footer className={clsx(styles.container, styles.footer)}>
        <Brand />
        <span>© {new Date().getFullYear()} testdog</span>
        <a href="#main-content">
          {t('backTop')}
          <Icon icon={arrowUpIcon} aria-hidden="true" />
        </a>
      </footer>
    </LandingMotion>
  );
}
