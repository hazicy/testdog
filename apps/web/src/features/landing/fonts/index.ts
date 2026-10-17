import localFont from 'next/font/local';

export const landingLatin = localFont({
  src: './inter-landing.woff2',
  weight: '400 600',
  style: 'normal',
  display: 'swap',
  variable: '--font-landing-latin',
});

// Covers current landing translations. Regenerate the subset when copy changes.
export const landingChinese = localFont({
  src: './misans-landing.woff2',
  weight: '400 600',
  style: 'normal',
  display: 'swap',
  variable: '--font-landing-chinese',
});
