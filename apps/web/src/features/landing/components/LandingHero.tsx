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
import { useEffect, useRef, type PointerEvent } from 'react';
import * as m from 'motion/react-m';
import clsx from 'clsx';
import { useLandingReducedMotion } from './LandingMotion';
import styles from './landing.module.css';

const circuitPath =
  'M65 105H165Q185 105 185 125V200Q185 220 205 220H350Q370 220 370 240V315Q370 335 390 335H495';

export function LandingHero() {
  const t = useTranslations('landing');
  const heroRef = useRef<HTMLElement>(null);

  const reduced = useLandingReducedMotion();
  const pointerX = useSpring(0, { stiffness: 80, damping: 22 });
  const pointerY = useSpring(0, { stiffness: 80, damping: 22 });
  const x = useTransform(pointerX, (value) => `${value}rem`);
  const y = useTransform(pointerY, (value) => `${value}rem`);

  useEffect(() => {
    const hero = heroRef.current;

    if (!hero) return;

    const observer = new IntersectionObserver(([entry]) => {
      hero.toggleAttribute('data-motion-paused', !entry.isIntersecting);
    });

    observer.observe(hero);

    return () => observer.disconnect();
  }, []);

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
      ref={heroRef}
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
          <path d={circuitPath} stroke="var(--page-line)" strokeWidth="1.5" />
          <path
            d={circuitPath}
            pathLength="1"
            stroke="var(--brand-active)"
            strokeWidth="1.5"
            className={styles.heroCircuitDraw}
          />
          <path
            d={circuitPath}
            pathLength="1"
            stroke="var(--brand-active)"
            strokeWidth="5"
            strokeLinecap="round"
            className={styles.heroPacket}
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
        <div className={styles.heroPlate}>
          <div className={styles.heroPlateBack} />
          <div className={styles.heroPlateFace}>
            <span className={styles.heroDog} />
          </div>
        </div>
        <div className={styles.heroCursor}>
          <span>
            <Icon icon={pointerIcon} />
          </span>
        </div>
        <div className={styles.heroVerified}>
          <Icon icon={checkIcon} />
        </div>
      </m.div>
    </section>
  );
}
