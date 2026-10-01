import type { ReactNode } from 'react'
import type { ToolText } from '@/lib/tools-text'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

/**
 * 所有工具页共用的外壳：返回首页 → 标题 → 一句话说明 → 工具本体。
 *
 * 工具页的 page.tsx 只剩「取文案 + 渲染组件」，7 个页面不用各写一遍标题结构。
 */
export async function ToolShell({
  text,
  children,
}: {
  text: ToolText
  children: ReactNode
}) {
  const t = await getTranslations()

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t('Nav.home')}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {text.name}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {text.desc}
        </p>
      </div>

      {children}
    </div>
  )
}
