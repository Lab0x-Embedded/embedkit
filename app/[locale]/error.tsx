'use client'

import { ArrowLeft, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

/**
 * 工具页的错误边界。
 *
 * 工具都是纯前端计算，出问题多半是某段输入触发了未预料的异常，
 * 所以主操作是「重试」，给用户一条出路而不是白屏。
 *
 * 注意：Next 16.3 起这个边界回调叫 `retry`（`reset` 仍然存在但不建议用）。
 */
export default function LocaleError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const t = useTranslations('Error')

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('desc')}</p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground/70">
          {t('digest')}
          {': '}
          {error.digest}
        </p>
      )}
      <div className="flex items-center justify-center gap-2 pt-2">
        <Button size="sm" onClick={() => retry()}>
          <RotateCcw className="size-3.5" />
          {t('retry')}
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <ArrowLeft className="size-3.5" />
            {t('home')}
          </Link>
        </Button>
      </div>
    </div>
  )
}
