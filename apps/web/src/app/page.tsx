import { useTranslations } from 'next-intl';
import clsx from 'clsx';
import marketingStyles from '@/features/marketing/components/marketing.module.css';
import Link from 'next/link';
import Image from 'next/image';
import { Brand } from '@/components/brand/Brand';
import { MarketingDemo } from '@/features/marketing/components/MarketingDemo';
import { MarketingMotion } from '@/features/marketing/components/MarketingMotion';

export default function Home() {
  const t = useTranslations('marketing');
  const faqs = [
    [t('faqScripts'), t('faqScriptsAnswer')],
    [t('faqPlatforms'), t('faqPlatformsAnswer')],
    [t('faqResults'), t('faqResultsAnswer')],
    [t('faqHosting'), t('faqHostingAnswer')],
  ];

  return (
    <MarketingMotion className={marketingStyles.marketing}>
      <a href="#main-content" className={marketingStyles.marketingSkip}>
        {t('skip')}
      </a>
      <header className={marketingStyles.marketingHeader}>
        <div className={clsx(marketingStyles.marketingContainer, marketingStyles.marketingNav)}>
          <Link href="/" aria-label={t('home')}>
            <Brand />
          </Link>
          <nav aria-label={t('navigation')}>
            <a href="#features">{t('features')}</a>
            <a href="#workflow">{t('workflow')}</a>
            <a href="#faq">{t('faq')}</a>
          </nav>
          <Link
            href="/cases"
            className={clsx(marketingStyles.marketingButton, marketingStyles.small)}
          >
            {t('openWorkspace')} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>
      <main id="main-content">
        <section
          className={clsx(marketingStyles.marketingHero, marketingStyles.marketingContainer)}
        >
          <div>
            <h1 data-entrance="100">
              {t('heroFirst')}
              <br />
              <span>{t('heroSecond')}</span>
            </h1>
            <p className={marketingStyles.marketingIntro} data-entrance="200">
              {t('intro')}
            </p>
            <div className={marketingStyles.marketingActions} data-entrance="300">
              <Link
                href="/cases"
                className={clsx(marketingStyles.marketingButton, marketingStyles.primary)}
              >
                {t('getStarted')} <span aria-hidden="true">↗</span>
              </Link>
              <a href="#workflow" className={marketingStyles.marketingButton}>
                {t('viewDemo')} <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
          <div
            className={marketingStyles.marketingArt}
            data-hero-art
            data-entrance="150"
            aria-label={t('illustration')}
          >
            <div className={marketingStyles.marketingArtGrid} />
            <div className={clsx(marketingStyles.marketingOrbit, marketingStyles.orbitOne)} />
            <div className={clsx(marketingStyles.marketingOrbit, marketingStyles.orbitTwo)} />
            <div className={clsx(marketingStyles.marketingOrbit, marketingStyles.orbitThree)} />
            <div className={marketingStyles.marketingCore} data-forge-tilt>
              <div className={marketingStyles.marketingCoreFace}>
                <Image src="/brand/testdog-mark.svg" alt="" width={112} height={112} unoptimized />
              </div>
            </div>
            <div className={clsx(marketingStyles.marketingArtLabel, marketingStyles.labelInput)}>
              <span className={marketingStyles.artIcon}>Aa</span>
              <div>
                <strong>{t('examplePrompt')}</strong>
              </div>
            </div>
            <div className={clsx(marketingStyles.marketingArtLabel, marketingStyles.labelExecute)}>
              <span className={marketingStyles.artIcon}>↗</span>
              <div>
                <strong>
                  {t('realExecution')}
                  <span className={marketingStyles.marketingLive} />
                </strong>
              </div>
            </div>
            <div className={clsx(marketingStyles.marketingArtLabel, marketingStyles.labelResult)}>
              <span className={clsx(marketingStyles.artIcon, marketingStyles.green)}>✓</span>
              <div>
                <strong>{t('verified')}</strong>
              </div>
            </div>
          </div>
        </section>
        <div
          className={clsx(marketingStyles.marketingPlatforms, marketingStyles.marketingContainer)}
        >
          <span>{t('crossPlatform')}</span>
          <div>
            <span>◎ Web</span>
            <span>◉ Android</span>
            <span>◈ iOS</span>
          </div>
        </div>
        <section
          id="features"
          className={clsx(marketingStyles.marketingSection, marketingStyles.marketingContainer)}
        >
          <div className={marketingStyles.marketingSectionHeading} data-reveal>
            <h2>{t('featuresTitle')}</h2>
          </div>
          <div className={marketingStyles.marketingFeatures}>
            <article className={marketingStyles.marketingFeature} data-reveal>
              <div className={marketingStyles.marketingFeatureVisual}>
                <div className={marketingStyles.marketingPrompt}>
                  <span>{t('testCase')}</span>
                  <p>
                    {t('openLogin')}
                    <br />
                    {t('enterCredentials')}
                    <br />
                    {t('clickLogin')}
                    <br />
                    <em>{t('verifyWelcome')}</em>
                    <b className={marketingStyles.marketingCaret}>▍</b>
                  </p>
                </div>
              </div>
              <h3>{t('describeTitle')}</h3>
              <p>{t('describeBody')}</p>
            </article>
            <article className={marketingStyles.marketingFeature} data-reveal="100">
              <div className={marketingStyles.marketingFeatureVisual}>
                <div className={marketingStyles.marketingMiniFlow}>
                  <span>{t('observe')}</span>
                  <i>↓</i>
                  <span className={marketingStyles.active}>
                    {t('act')} <b className={marketingStyles.marketingLive} />
                  </span>
                  <i>↓</i>
                  <span>
                    {t('verify')} <b>✓</b>
                  </span>
                </div>
              </div>
              <h3>{t('realTitle')}</h3>
              <p>{t('realBody')}</p>
            </article>
            <article className={marketingStyles.marketingFeature} data-reveal="200">
              <div className={marketingStyles.marketingFeatureVisual}>
                <div className={marketingStyles.marketingEvidence}>
                  <span className={marketingStyles.marketingEvidenceCheck}>✓</span>
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
          id="workflow"
          className={clsx(marketingStyles.marketingSection, marketingStyles.marketingContainer)}
        >
          <div className={marketingStyles.marketingDemoHeading} data-reveal>
            <div>
              <h2>{t('workflowTitle')}</h2>
            </div>
          </div>
          <div className={marketingStyles.marketingDemo} data-reveal>
            <div className={marketingStyles.marketingDemoTitle}>
              <span>
                <i />
                <i />
                <i />
              </span>
              <span>{t('interactiveDemo')}</span>
            </div>
            <MarketingDemo />
          </div>
        </section>
        <section
          id="faq"
          className={clsx(
            marketingStyles.marketingSection,
            marketingStyles.marketingContainer,
            marketingStyles.marketingFaq,
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
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section
          className={clsx(marketingStyles.marketingClosing, marketingStyles.marketingContainer)}
          data-reveal
        >
          <div className={marketingStyles.marketingClosingGlow} />
          <h2>
            {t('closingFirst')}
            <br />
            <span>{t('closingSecond')}</span>
          </h2>
          <Link
            href="/cases"
            className={clsx(marketingStyles.marketingButton, marketingStyles.primary)}
          >
            {t('getStartedBrand')} <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>
      <footer className={clsx(marketingStyles.marketingContainer, marketingStyles.marketingFooter)}>
        <Brand />
        <span>© {new Date().getFullYear()} testdog</span>
        <a href="#main-content">{t('backTop')}</a>
      </footer>
    </MarketingMotion>
  );
}
