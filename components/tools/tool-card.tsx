import type { ToolMeta } from '@/lib/tools-meta'
import { ArrowRight, Usb } from 'lucide-react'
import { useMessages, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Link } from '@/i18n/navigation'
import { getToolText } from '@/lib/tools-text'
import { cn } from '@/lib/utils'

/**
 * 首页工具卡片。
 *
 * done    → 可点击，整卡是链接
 * planned → 灰色禁用卡（保留在列表里做索引，但不给假入口；不隐藏）
 */
export function ToolCard({ tool }: { tool: ToolMeta }) {
  const t = useTranslations('Home')
  const messages = useMessages()
  const text = getToolText(messages, tool.slug)
  const Icon = tool.icon
  const available = tool.status === 'done'

  const body = (
    <div
      className={cn(
        'flex h-full flex-col rounded-xl border bg-card p-5 transition',
        available
          ? 'border-border shadow-xs group-hover:-translate-y-0.5 group-hover:shadow-md'
          : 'border-dashed border-border/80 bg-muted/40 opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-lg',
            available ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-5" />
        </span>
        <Badge variant={available ? 'default' : 'outline'} className="rounded-4xl">
          {available ? t('statusDone') : t('statusPlanned')}
        </Badge>
      </div>

      <h3 className="mt-4 text-base font-medium">{text.name}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
        {text.desc}
      </p>

      {tool.needsLocalRuntime && (
        <span className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Usb className="size-3.5" />
          {t('localRuntimeHint')}
        </span>
      )}

      {available && (
        <span className="mt-4 inline-flex items-center gap-1 text-sm text-foreground/80">
          {t('openTool')}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </div>
  )

  if (!available) {
    return (
      <div aria-disabled="true" title={t('statusPlanned')} className="cursor-not-allowed">
        {body}
      </div>
    )
  }

  return (
    <Link href={`/tools/${tool.slug}`} className="group block focus-visible:outline-none">
      {body}
    </Link>
  )
}
