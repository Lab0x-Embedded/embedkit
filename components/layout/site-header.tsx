import { ExternalLink, Terminal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { ToolsNav } from '@/components/layout/tools-nav'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

const REPO_URL = 'https://github.com/Lab0x-Embedded/embedkit'

export function SiteHeader() {
  const t = useTranslations('Nav')
  const home = useTranslations('Home')

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Terminal className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">EmbedKit</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {home('title')}
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <ToolsNav />
          <Button asChild variant="ghost" size="sm">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              {/* 页头多了一个「工具」之后，窄屏上把 GitHub 的文字收起来省空间 */}
              <span className="hidden sm:inline">{t('github')}</span>
            </a>
          </Button>
          <LocaleSwitcher label={t('toggleLanguage')} />
          <ThemeToggle label={t('toggleTheme')} />
        </div>
      </div>
    </header>
  )
}
