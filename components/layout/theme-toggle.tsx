'use client'

import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'

/**
 * 图标用 CSS 的 dark: 变体切换，不在渲染里读主题状态 —— 这样服务端与客户端首屏一致，
 * 也不需要 mounted 状态，不会出现 hydration 不一致。
 */
export function ThemeToggle({ label }: { label: string }) {
  const { toggleTheme } = useTheme()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  )
}
