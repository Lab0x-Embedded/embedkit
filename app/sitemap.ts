import type { MetadataRoute } from 'next'
import { routing } from '@/i18n/routing'
import { localeUrl } from '@/lib/site'
import { tools } from '@/lib/tools-meta'

/** 每个 URL 在 sitemap 里都要带上全部语言版本 */
function languagesFor(path: string): Record<string, string> {
  const languages: Record<string, string> = {}
  for (const locale of routing.locales)
    languages[locale] = localeUrl(locale, path)
  return languages
}

/**
 * sitemap.xml —— 由 lib/tools-meta.ts 派生，加工具不用改这里。
 *
 * 只收录 status === 'done' 的工具：planned 的只有首页灰卡，没有真实页面，
 * 写进去会让爬虫撞 404。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  const home: MetadataRoute.Sitemap = routing.locales.map(locale => ({
    url: localeUrl(locale),
    lastModified,
    changeFrequency: 'weekly',
    priority: 1,
    alternates: { languages: languagesFor('') },
  }))

  const toolPages: MetadataRoute.Sitemap = tools
    .filter(tool => tool.status === 'done')
    .flatMap((tool) => {
      const path = `/tools/${tool.slug}`
      return routing.locales.map(locale => ({
        url: localeUrl(locale, path),
        lastModified,
        changeFrequency: 'monthly' as const,
        priority: 0.8,
        alternates: { languages: languagesFor(path) },
      }))
    })

  return [...home, ...toolPages]
}
