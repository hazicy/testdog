import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import zh from '../../messages/zh.json';

function flatten(messages: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(messages).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;

      return typeof value === 'string'
        ? [[path, value]]
        : Object.entries(flatten(value as Record<string, unknown>, path));
    }),
  );
}

describe('message catalogs', () => {
  it('provides matching message keys for English and Chinese', () => {
    expect(Object.keys(flatten(en)).sort()).toEqual(Object.keys(flatten(zh)).sort());
  });

  for (const locale of ['en', 'zh'] as const) {
    const messages = { en, zh }[locale];

    it(`formats every ${locale} message without missing values or invalid ICU syntax`, () => {
      for (const [key, message] of Object.entries(flatten(messages))) {
        const values = Object.fromEntries(
          [...message.matchAll(/\{(\w+)(?:,|\})/g)].map((match) => [
            match[1],
            ['count', 'page'].includes(match[1]) ? 2 : 'Example',
          ]),
        );

        const translator = createTranslator({
          locale,
          messages: { message },
          onError(error) {
            throw error;
          },
        });

        expect(translator('message', values), key).not.toBe('');
      }
    });
  }
});
