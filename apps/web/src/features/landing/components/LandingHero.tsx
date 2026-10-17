'use client';

import { Icon } from '@iconify/react/offline';
import arrowUpRightIcon from '@iconify-icons/lucide/arrow-up-right';
import playIcon from '@iconify-icons/lucide/play';
import listIcon from '@iconify-icons/lucide/list-checks';
import pointerIcon from '@iconify-icons/lucide/mouse-pointer-2';
import checkIcon from '@iconify-icons/lucide/check';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSpring, useTransform } from 'motion/react';
import type { PointerEvent } from 'react';
import * as m from 'motion/react-m';
import clsx from 'clsx';
import { useLandingReducedMotion } from './LandingMotion';
import styles from './landing.module.css';

export function LandingHero() {
  const t = useTranslations('landing');
  const reduced = useLandingReducedMotion();
  const pointerX = useSpring(0, { stiffness: 80, damping: 22 });
  const pointerY = useSpring(0, { stiffness: 80, damping: 22 });
  const x = useTransform(pointerX, (value) => `${value}rem`);
  const y = useTransform(pointerY, (value) => `${value}rem`);

  function movePointer(event: PointerEvent<HTMLElement>) {
    if (reduced || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();

    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 1.5);
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 1);
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
        <h1 id="hero-heading">
          <span className={styles.heroLine}>
            <span>{t('heroFirst')}</span>
          </span>
          <span className={clsx(styles.heroLine, styles.heroHighlight)}>
            <span>{t('heroSecond')}</span>
          </span>
        </h1>
        <div className={styles.heroActions}>
          <Link href="/cases" className={clsx(styles.button, styles.primary)}>
            {t('getStarted')}
            <Icon icon={arrowUpRightIcon} aria-hidden="true" />
          </Link>
          <a href="#replay" className={styles.textButton}>
            <Icon icon={playIcon} aria-hidden="true" />
            {t('viewDemo')}
          </a>
        </div>
      </div>
      <m.div
        className={styles.heroArtwork}
        aria-hidden="true"
        style={{ x: reduced ? '0rem' : x, y: reduced ? '0rem' : y }}
      >
        <div className={styles.heroGrid} />
        <svg viewBox="0 0 560 440" fill="none" className={styles.heroCircuit}>
          <path
            d="M65 105H165Q185 105 185 125V200Q185 220 205 220H350Q370 220 370 240V315Q370 335 390 335H495"
            stroke="var(--page-line)"
            strokeWidth="1.5"
          />
          <m.path
            d="M65 105H165Q185 105 185 125V200Q185 220 205 220H350Q370 220 370 240V315Q370 335 390 335H495"
            stroke="var(--brand-active)"
            strokeWidth="1.5"
            initial={false}
            whileInView={reduced ? undefined : { pathLength: [0, 1], opacity: [0.2, 1] }}
            viewport={{ once: true }}
            transition={{ duration: 2.2, delay: 0.4, ease: 'easeInOut' }}
          />
          <m.circle
            r="4"
            fill="var(--brand-active)"
            cx="65"
            cy="105"
            initial={false}
            whileInView={
              reduced
                ? undefined
                : {
                    cx: [65, 165, 185, 185, 205, 350, 370, 370, 390, 495],
                    cy: [105, 105, 125, 200, 220, 220, 240, 315, 335, 335],
                    opacity: [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
                  }
            }
            viewport={{ once: true }}
            transition={{ duration: 2, delay: 0.6, repeat: 1, ease: 'linear' }}
            style={{ opacity: 0 }}
          />
        </svg>
        <div className={styles.heroInput}>
          <Icon icon={listIcon} />
          <span>
            <i />
            <i />
            <i />
          </span>
        </div>
        <m.div
          className={styles.heroPlate}
          initial={false}
          whileInView={
            reduced ? undefined : { rotate: [-15, -7], y: ['2rem', '0rem'], opacity: [0.3, 1] }
          }
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={styles.heroPlateBack} />
          <div className={styles.heroPlateFace}>
            <span className={styles.heroDog} />
          </div>
        </m.div>
        <m.div
          className={styles.heroCursor}
          initial={false}
          whileInView={
            reduced ? undefined : { x: ['2.5rem', '0rem'], y: ['2rem', '0rem'], opacity: [0, 1] }
          }
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <Icon icon={pointerIcon} />
        </m.div>
        <m.div
          className={styles.heroVerified}
          initial={false}
          whileInView={reduced ? undefined : { scale: [0.8, 1.15, 1], opacity: [0.3, 1, 1] }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 2.25 }}
        >
          <Icon icon={checkIcon} />
        </m.div>
      </m.div>
    </section>
  );
}
