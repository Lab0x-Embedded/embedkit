import { useTranslations } from 'next-intl'

/** 构建期算一次即可；放在渲染函数外面，组件保持纯函数 */
const YEAR = new Date().getFullYear()
const SIGNATURE = `EmbedKit · Lab0x-Embedded · ${YEAR}`

export function SiteFooter() {
  const t = useTranslations('Footer')

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{t('note')}</p>
        <p className="font-mono">{SIGNATURE}</p>
      </div>
    </footer>
  )
}
