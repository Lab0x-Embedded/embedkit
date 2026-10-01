'use client'

import { useTheme } from '@wrksz/themes/client'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * 图标用 CSS 的 dark: 变体切换，服务端与客户端首屏渲染结果一致，
 * 所以不需要 useHydrated() 过滤，也不会有 hydration 不一致。
 * 水合前 resolvedTheme 还是 undefined，此时按库的建议先禁用按钮。
 */
export function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, forcedTheme, setTheme } = useTheme()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      disabled={!resolvedTheme || Boolean(forcedTheme)}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  )
}
