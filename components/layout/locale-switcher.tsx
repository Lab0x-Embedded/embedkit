'use client'

import { Languages } from 'lucide-react'
import { useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

/** 语言名用各自的母语写法，不做翻译 */
const nativeNames: Record<string, string> = {
  zh: '中文',
  en: 'English',
}

export function LocaleSwitcher({ label }: { label: string }) {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  const target = routing.locales.find(item => item !== locale) ?? routing.defaultLocale

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      onClick={() => router.replace(pathname, { locale: target })}
    >
      <Languages className="size-4" />
      {nativeNames[target] ?? target.toUpperCase()}
    </Button>
  )
}
