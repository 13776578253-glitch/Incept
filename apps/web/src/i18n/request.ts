import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { localeConfig } from '@/i18n/config/locales';
import { getLocaleMessages } from '@/i18n/loaders/get-messages';

/*
使用 `getRequestConfig` 函数，传入一个异步函数作为参数。
首先尝试获取请求的语言环境（locale）。如果没有提供语言环境，将使用 `requestLocale` 来获取它。
如果语言环境有效，返回一个对象包含解析后的语言环境、对应的消息以及时区信息
*/
export default getRequestConfig(async ({ locale, requestLocale }) => {
  const resolvedLocale = locale ?? (await requestLocale);

  if (!resolvedLocale || !hasLocale(localeConfig.locales, resolvedLocale)) {
    notFound();
  }

  return {
    locale: resolvedLocale,
    messages: await getLocaleMessages(resolvedLocale),
    timeZone: localeConfig.timeZone,
  };
});
