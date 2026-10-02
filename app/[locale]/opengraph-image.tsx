import { hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from '@/lib/og'
import { siteOgCard } from '@/lib/og-text'

/** 社交平台的 alt 文本（内容是图，说明用常量即可） */
export const alt = 'EmbedKit · 嵌入式工具箱'

/**
 * 必须显式声明：没有它这两张图会被当成「按需服务端渲染」（构建产物里是 ƒ），
 * 运行时就得能读到 assets/og 的字体。声明之后变成构建时预渲染（●），
 * 字体只在构建阶段用到。
 */
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

  return renderOgCard(siteOgCard(locale))
}
