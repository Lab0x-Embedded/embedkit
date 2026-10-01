import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

/**
 * 404。
 *
 * 放在 [locale] 段里，这样 /zh/tools/typo 这类地址仍走站点自己的
 * 页头 / 页脚 / 主题，而不是 Next 的默认 404。
 */
export default async function LocaleNotFound() {
  const t = await getTranslations('NotFound')

  return (
    <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <p className="font-mono text-5xl font-semibold tracking-tight text-muted-foreground/40">
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('desc')}</p>
      <div className="pt-2">
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
