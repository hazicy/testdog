'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Adds motion to server-rendered content; everything stays visible without JavaScript. */
export function MarketingMotion({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) return;

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const animations = new Set<Animation>();
    const revealElements = root.querySelectorAll<HTMLElement>('[data-reveal]');
    const hero = root.querySelector<HTMLElement>('[data-hero-art]');
    const tilt = root.querySelector<HTMLElement>('[data-forge-tilt]');
    const hadSmoothScroll = document.documentElement.classList.contains('scroll-smooth');
    let observer: IntersectionObserver | undefined;
    let frame = 0;
    let playedEntrance = false;

    function play(element: HTMLElement, delay = 0, entrance = false) {
      if (!element.animate || preference.matches) return;
      const art = element.hasAttribute('data-hero-art');
      const animation = element.animate(
        art
          ? [
              { opacity: 0, clipPath: 'inset(12% 0 0 0)' },
              { opacity: 1, clipPath: 'inset(0% 0 0 0)' },
            ]
          : [
              { opacity: 0, transform: 'translate3d(0, 24px, 0)' },
              { opacity: 1, transform: 'translate3d(0, 0, 0)' },
            ],
        {
          duration: entrance ? 900 : 700,
          delay,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'backwards',
        },
      );

      animations.add(animation);
      animation.onfinish = () => animations.delete(animation);
    }

    function configureMotion() {
      observer?.disconnect();
      for (const animation of animations) animation.cancel();
      animations.clear();
      for (const element of revealElements) element.removeAttribute('data-motion');
      if (preference.matches) {
        if (!hadSmoothScroll) document.documentElement.classList.remove('scroll-smooth');
        tilt?.style.removeProperty('--forge-rx');
        tilt?.style.removeProperty('--forge-ry');

        return;
      }

      document.documentElement.classList.add('scroll-smooth');
      if (!playedEntrance) {
        root?.querySelectorAll<HTMLElement>('[data-entrance]').forEach((element) => {
          play(element, Number(element.dataset.entrance) || 0, true);
        });
        playedEntrance = true;
      }

      if (!('IntersectionObserver' in window)) return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const element = entry.target as HTMLElement;

            element.removeAttribute('data-motion');
            play(element, Number(element.dataset.reveal) || 0);
            observer?.unobserve(element);
          }
        },
        { rootMargin: '0px 0px -40px 0px', threshold: 0.08 },
      );

      for (const element of revealElements) {
        // Content already in view stays visible, including when restoring scroll position.
        if (element.getBoundingClientRect().top < window.innerHeight - 40) continue;
        element.dataset.motion = 'pending';
        observer.observe(element);
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (!hero || !tilt || preference.matches || !pointer.matches) return;
      if (frame) cancelAnimationFrame(frame);
      const bounds = hero.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;

      frame = requestAnimationFrame(() => {
        tilt?.style.setProperty('--forge-rx', `${-y * 14}deg`);
        tilt?.style.setProperty('--forge-ry', `${x * 18}deg`);
        frame = 0;
      });
    }

    function resetPointer() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      tilt?.style.setProperty('--forge-rx', '0deg');
      tilt?.style.setProperty('--forge-ry', '0deg');
    }

    configureMotion();
    preference.addEventListener('change', configureMotion);
    hero?.addEventListener('pointermove', onPointerMove);
    hero?.addEventListener('pointerleave', resetPointer);

    return () => {
      observer?.disconnect();
      for (const animation of animations) animation.cancel();
      for (const element of revealElements) element.removeAttribute('data-motion');
      preference.removeEventListener('change', configureMotion);
      hero?.removeEventListener('pointermove', onPointerMove);
      hero?.removeEventListener('pointerleave', resetPointer);
      resetPointer();
      if (!hadSmoothScroll) document.documentElement.classList.remove('scroll-smooth');
    };
  }, []);

  return (
    <div ref={rootRef} data-marketing-motion className={className}>
      {children}
    </div>
  );
}
