import { hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from '@/lib/og'
import { toolOgCard } from '@/lib/og-text'

const SLUG = 'crc'

export const alt = 'EmbedKit · 嵌入式工具箱'
// 声明后图片在构建时预渲染，运行时不依赖 assets/og 的字体文件
export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }))
}

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale))
    notFound()

  return renderOgCard(toolOgCard(SLUG, locale))
}
