import { routing } from '@/i18n/routing'

/**
 * 线上站点地址（Vercel 自定义域名）。
 *
 * sitemap / robots / canonical / hreflang 都要绝对 URL，统一从这里取，
 * 换域名只改这一处。
 */
export const SITE_URL = 'https://embedkit.ryanuo.cc'

/** 站内路径 → 某个 locale 的绝对 URL */
export function localeUrl(locale: string, path = ''): string {
  return `${SITE_URL}/${locale}${path}`
}

/**
 * canonical + hreflang。
 *
 * 两种语言各自有独立 URL（localePrefix: 'always'），所以必须互相声明
 * `alternate`，否则搜索引擎会把 /zh 和 /en 当成重复内容。
 * `x-default` 指向默认语言，给没有语言偏好的抓取者用。
 */
export function pageAlternates(locale: string, path = ''): {
  canonical: string
  languages: Record<string, string>
} {
  const languages: Record<string, string> = {}
  for (const item of routing.locales)
    languages[item] = localeUrl(item, path)

  languages['x-default'] = localeUrl(routing.defaultLocale, path)

  return { canonical: localeUrl(locale, path), languages }
}
