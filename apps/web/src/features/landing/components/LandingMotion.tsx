'use client';

import { LazyMotion, domAnimation, MotionConfig } from 'motion/react';
import * as m from 'motion/react-m';
import { useSyncExternalStore, type ReactNode } from 'react';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(callback: () => void) {
  const media = window.matchMedia(reducedMotionQuery);

  media.addEventListener('change', callback);

  return () => media.removeEventListener('change', callback);
}

export function useLandingReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => true,
  );
}

export function LandingMotion({ children, className }: { children: ReactNode; className: string }) {
  const reduced = useLandingReducedMotion();

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
        <div className={className}>{children}</div>
      </MotionConfig>
    </LazyMotion>
  );
}

/** Content stays visible in the server response; motion starts on entering the viewport. */
export function LandingReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useLandingReducedMotion();

  return (
    <m.div
      className={className}
      initial={false}
      whileInView={reduced ? undefined : { opacity: [0.65, 1], y: ['1rem', '0rem'] }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}
