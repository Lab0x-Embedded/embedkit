import { hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from '@/lib/og'
import { siteOgCard } from '@/lib/og-text'

/** 社交平台的 alt 文本（内容是图，说明用常量即可） */
export const alt = 'EmbedKit · 嵌入式工具箱'

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

  return renderOgCard(siteOgCard(locale))
}
