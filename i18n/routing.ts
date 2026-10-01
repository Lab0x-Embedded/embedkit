import { defineRouting } from 'next-intl/routing'

/**
 * 站点语言：中文（默认） / 英文。
 * localePrefix 用 'always'，两种语言都有独立的 URL（对 SEO 友好，也方便分享）。
 */
export const routing = defineRouting({
  locales: ['zh', 'en'],
  defaultLocale: 'zh',
  localePrefix: 'always',
})

export type Locale = (typeof routing.locales)[number]
