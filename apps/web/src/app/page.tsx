import { Icon } from '@iconify/react/offline';
import arrowUpRightIcon from '@iconify-icons/lucide/arrow-up-right';
import arrowDownIcon from '@iconify-icons/lucide/arrow-down';
import arrowUpIcon from '@iconify-icons/lucide/arrow-up';
import checkIcon from '@iconify-icons/lucide/check';
import plusIcon from '@iconify-icons/lucide/plus';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
import landingStyles from '@/features/landing/components/landing.module.css';
import Link from 'next/link';
import { Brand } from '@/components/brand/Brand';
import { LandingDemo } from '@/features/landing/components/LandingDemo';
import { LandingMotion } from '@/features/landing/components/LandingMotion';

export default function Home() {
  const t = useTranslations('landing');
  const faqs = [
    [t('faqScripts'), t('faqScriptsAnswer')],
    [t('faqPlatforms'), t('faqPlatformsAnswer')],
    [t('faqResults'), t('faqResultsAnswer')],
    [t('faqHosting'), t('faqHostingAnswer')],
  ];

  return (
    <LandingMotion className={landingStyles.landing}>
      <a href="#main-content" className={landingStyles.landingSkip}>
        {t('skip')}
      </a>
      <header className={landingStyles.landingHeader}>
        <div className={clsx(landingStyles.landingContainer, landingStyles.landingNav)}>
          <Link href="/" aria-label={t('home')}>
            <Brand monochrome />
          </Link>
          <nav aria-label={t('navigation')}>
            <a href="#features">{t('features')}</a>
            <a href="#workflow">{t('workflow')}</a>
            <a href="#faq">{t('faq')}</a>
          </nav>
          <Link href="/cases" className={clsx(landingStyles.landingButton, landingStyles.small)}>
            {t('openWorkspace')}{' '}
            <Icon icon={arrowUpRightIcon} className={landingStyles.icon} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <main id="main-content">
        <section className={clsx(landingStyles.landingHero, landingStyles.landingContainer)}>
          <div>
            <h1 data-entrance="100">
              {t('heroFirst')}
              <br />
              <span>{t('heroSecond')}</span>
            </h1>
            <p className={landingStyles.landingIntro} data-entrance="200">
              {t('intro')}
            </p>
            <div className={landingStyles.landingActions} data-entrance="300">
              <Link
                href="/cases"
                className={clsx(landingStyles.landingButton, landingStyles.primary)}
              >
                {t('getStarted')}{' '}
                <Icon icon={arrowUpRightIcon} className={landingStyles.icon} aria-hidden="true" />
              </Link>
              <a href="#workflow" className={landingStyles.landingButton}>
                {t('viewDemo')}{' '}
                <Icon icon={arrowDownIcon} className={landingStyles.icon} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
        <section
          id="workflow"
          className={clsx(landingStyles.landingShowcase, landingStyles.landingContainer)}
        >
          <div className={landingStyles.landingDemoHeading} data-reveal>
            <div>
              <h2>{t('workflowTitle')}</h2>
            </div>
          </div>
          <div className={landingStyles.landingDemo} data-reveal>
            <div className={landingStyles.landingDemoTitle}>
              <span>
                <i />
                <i />
                <i />
              </span>
              <span>{t('interactiveDemo')}</span>
            </div>
            <LandingDemo />
          </div>
        </section>
        <div className={clsx(landingStyles.landingPlatforms, landingStyles.landingContainer)}>
          <span>{t('crossPlatform')}</span>
          <div>
            <span>Web</span>
            <span>Android</span>
            <span>iOS</span>
          </div>
        </div>
        <section
          id="features"
          className={clsx(landingStyles.landingSection, landingStyles.landingContainer)}
        >
          <div className={landingStyles.landingSectionHeading} data-reveal>
            <h2>{t('featuresTitle')}</h2>
          </div>
          <div className={landingStyles.landingFeatures}>
            <article className={landingStyles.landingFeature} data-reveal>
              <div className={landingStyles.landingFeatureVisual}>
                <div className={landingStyles.landingPrompt}>
                  <span>{t('testCase')}</span>
                  <p>
                    {t('openLogin')}
                    <br />
                    {t('enterCredentials')}
                    <br />
                    {t('clickLogin')}
                    <br />
                    <em>{t('verifyWelcome')}</em>
                    <span className={landingStyles.landingCaret} aria-hidden="true" />
                  </p>
                </div>
              </div>
              <h3>{t('describeTitle')}</h3>
              <p>{t('describeBody')}</p>
            </article>
            <article className={landingStyles.landingFeature} data-reveal="100">
              <div className={landingStyles.landingFeatureVisual}>
                <div className={landingStyles.landingMiniFlow}>
                  <span>{t('observe')}</span>
                  <Icon
                    icon={arrowDownIcon}
                    className={landingStyles.flowConnector}
                    aria-hidden="true"
                  />
                  <span className={landingStyles.active}>
                    {t('act')} <b className={landingStyles.landingLive} />
                  </span>
                  <Icon
                    icon={arrowDownIcon}
                    className={landingStyles.flowConnector}
                    aria-hidden="true"
                  />
                  <span>
                    {t('verify')}{' '}
                    <Icon icon={checkIcon} className={landingStyles.flowCheck} aria-hidden="true" />
                  </span>
                </div>
              </div>
              <h3>{t('realTitle')}</h3>
              <p>{t('realBody')}</p>
            </article>
            <article className={landingStyles.landingFeature} data-reveal="200">
              <div className={landingStyles.landingFeatureVisual}>
                <div className={landingStyles.landingEvidence}>
                  <span className={landingStyles.landingEvidenceCheck}>
                    <Icon
                      icon={checkIcon}
                      className={landingStyles.evidenceIcon}
                      aria-hidden="true"
                    />
                  </span>
                  <strong>{t('evidenceMatch')}</strong>
                  <div>
                    <span>{t('screenshots')}</span>
                    <span>{t('logs')}</span>
                    <span>{t('playback')}</span>
                  </div>
                </div>
              </div>
              <h3>{t('evidenceTitle')}</h3>
              <p>{t('evidenceBody')}</p>
            </article>
          </div>
        </section>
        <section
          id="faq"
          className={clsx(
            landingStyles.landingSection,
            landingStyles.landingContainer,
            landingStyles.landingFaq,
          )}
          data-reveal
        >
          <div>
            <h2>{t('faq')}</h2>
          </div>
          <div>
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">
                    <Icon icon={plusIcon} className={landingStyles.icon} />
                  </span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section
          className={clsx(landingStyles.landingClosing, landingStyles.landingContainer)}
          data-reveal
        >
          <div className={landingStyles.landingClosingGlow} />
          <h2>
            {t('closingFirst')}
            <br />
            <span>{t('closingSecond')}</span>
          </h2>
          <Link href="/cases" className={clsx(landingStyles.landingButton, landingStyles.primary)}>
            {t('getStartedBrand')}{' '}
            <Icon icon={arrowUpRightIcon} className={landingStyles.icon} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className={clsx(landingStyles.landingContainer, landingStyles.landingFooter)}>
        <Brand monochrome />
        <span>© {new Date().getFullYear()} testdog</span>
        <a href="#main-content">
          {t('backTop')}{' '}
          <Icon icon={arrowUpIcon} className={landingStyles.icon} aria-hidden="true" />
        </a>
      </footer>
    </LandingMotion>
  );
}
