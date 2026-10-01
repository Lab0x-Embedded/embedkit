import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { notFound } from 'next/navigation'
import * as rootParams from 'next/root-params'
import { routing } from './routing'

/**
 * Next.js 16.3+ 可以用 next/root-params 直接读 [locale] 段，
 * 这样页面天然可静态渲染（不需要 headers()，因此不会退化成动态渲染）。
 */
export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    const paramValue = await rootParams.locale()
    if (hasLocale(routing.locales, paramValue))
      locale = paramValue
    else
      notFound()
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
