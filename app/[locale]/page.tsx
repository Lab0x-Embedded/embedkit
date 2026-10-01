import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { ToolCard } from '@/components/tools/tool-card'
import { Badge } from '@/components/ui/badge'
import { routing } from '@/i18n/routing'
import { pageAlternates } from '@/lib/site'
import { categories, countByStatus, getToolsByCategory } from '@/lib/tools-meta'

/** 首页自己的 canonical 与 hreflang（title / description 由 layout 的默认值兜底） */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale))
    notFound()

  return { alternates: pageAlternates(locale) }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale))
    notFound()

  setRequestLocale(locale)

  const t = await getTranslations('Home')
  const tc = await getTranslations('Categories')

  const availableCount = countByStatus('done')
  const plannedCount = countByStatus('planned')

  return (
    <div className="space-y-12">
      <section className="max-w-2xl space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('title')}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          {t('intro')}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="default" className="rounded-4xl">
            {t('available', { count: availableCount })}
          </Badge>
          {/* 全部做完后不再显示「0 个规划中」—— 那看着像坏了 */}
          {plannedCount > 0 && (
            <Badge variant="outline" className="rounded-4xl">
              {t('planned', { count: plannedCount })}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{t('privacyNote')}</span>
        </div>
      </section>

      {categories.map((category) => {
        const items = getToolsByCategory(category)
        if (items.length === 0)
          return null

        return (
          <section key={category} className="space-y-4">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-medium">{tc(category)}</h2>
              <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(tool => <ToolCard key={tool.slug} tool={tool} />)}
            </div>
          </section>
        )
      })}

      {/* 有规划中的工具时才解释灰卡的含义 */}
      {plannedCount > 0 && (
        <section className="rounded-xl border border-dashed border-border/80 p-5">
          <p className="text-sm text-muted-foreground">{t('plannedNote')}</p>
        </section>
      )}
    </div>
  )
}
