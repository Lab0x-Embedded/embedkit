import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/** robots.txt：整站可抓，工具页没有需要屏蔽的后台路径 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
