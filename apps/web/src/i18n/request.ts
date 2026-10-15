import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  const locale = (await cookies()).get('locale')?.value === 'en' ? 'en' : 'zh';

  return {
    locale,
    timeZone: 'Asia/Shanghai',
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
