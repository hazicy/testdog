'use client';

import { Icon } from '@iconify/react/offline';
import arrowUpRightIcon from '@iconify-icons/lucide/arrow-up-right';
import playIcon from '@iconify-icons/lucide/play';
import textIcon from '@iconify-icons/lucide/text-cursor-input';
import checkIcon from '@iconify-icons/lucide/check';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSpring, useTransform } from 'motion/react';
import type { PointerEvent } from 'react';
import * as m from 'motion/react-m';
import clsx from 'clsx';
import { LandingReveal, useLandingReducedMotion } from './LandingMotion';
import styles from './landing.module.css';

export function LandingHero() {
  const t = useTranslations('landing');
  const reduced = useLandingReducedMotion();
  const pointerX = useSpring(0, { stiffness: 90, damping: 24 });
  const pointerY = useSpring(0, { stiffness: 90, damping: 24 });
  const x = useTransform(pointerX, (value) => `${value}rem`);
  const y = useTransform(pointerY, (value) => `${value}rem`);
  const entrance = (delay: number) => ({
    initial: false as const,
    whileInView: reduced ? undefined : { opacity: [0.3, 1], y: ['1.25rem', '0rem'] },
    viewport: { once: true },
    transition: { duration: 0.85, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  function movePointer(event: PointerEvent<HTMLElement>) {
    if (reduced || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();

    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 0.6);
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 0.35);
  }

  function resetPointer() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <section
      className={clsx(styles.hero, styles.container)}
      aria-labelledby="hero-heading"
      onPointerMove={movePointer}
      onPointerLeave={resetPointer}
    >
      <div className={styles.heroCopy}>
        <m.div style={{ x: reduced ? '0rem' : x, y: reduced ? '0rem' : y }}>
          <h1 id="hero-heading">
            <m.span {...entrance(0)}>{t('heroFirst')}</m.span>
            <m.span {...entrance(0.14)} className={styles.heroHighlight}>
              {t('heroSecond')}
            </m.span>
          </h1>
        </m.div>
        <m.p className={styles.heroIntro} {...entrance(0.26)}>
          {t('intro')}
        </m.p>
        <m.div className={styles.heroActions} {...entrance(0.36)}>
          <Link href="/cases" className={clsx(styles.button, styles.primary)}>
            {t('getStarted')}
            <Icon icon={arrowUpRightIcon} aria-hidden="true" />
          </Link>
          <a href="#replay" className={styles.textButton}>
            <Icon icon={playIcon} aria-hidden="true" />
            {t('viewDemo')}
          </a>
        </m.div>
      </div>
      <LandingReveal className={styles.heroProof} delay={0.15}>
        <span className={styles.heroIntent}>
          <Icon icon={textIcon} aria-hidden="true" />
          {t('examplePrompt')}
        </span>
        <svg className={styles.heroSignal} viewBox="0 0 180 24" fill="none" aria-hidden="true">
          <path d="M1 12H179" stroke="currentColor" strokeOpacity="0.2" />
          <m.path
            d="M1 12H179"
            stroke="currentColor"
            initial={false}
            whileInView={reduced ? undefined : { pathLength: [0, 1] }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, delay: 0.4 }}
          />
          <m.circle
            r="2.5"
            cy="12"
            cx="1"
            fill="currentColor"
            initial={false}
            whileInView={reduced ? undefined : { cx: [1, 178], opacity: [0, 1, 1, 0] }}
            viewport={{ once: true }}
            transition={{
              duration: 1.4,
              delay: 0.8,
              repeat: 1,
              repeatDelay: 1.1,
              ease: 'easeInOut',
            }}
            style={{ opacity: 0 }}
          />
          <path d="m171 6 7 6-7 6" stroke="currentColor" />
        </svg>
        <span className={styles.heroOutcome}>
          <m.span
            initial={false}
            whileInView={
              reduced
                ? undefined
                : {
                    scale: [1, 1.12, 1],
                    boxShadow: [
                      '0 0 0 0 #db8d6e00',
                      '0 0 0 0.375rem #db8d6e12',
                      '0 0 0 0.625rem #db8d6e00',
                    ],
                  }
            }
            viewport={{ once: true }}
            transition={{ duration: 0.65, delay: 1.8, repeat: 1, repeatDelay: 1.85 }}
          >
            <Icon icon={checkIcon} aria-hidden="true" />
          </m.span>
          {t('verified')}
        </span>
      </LandingReveal>
    </section>
  );
}
