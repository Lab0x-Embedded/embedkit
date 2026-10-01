'use client'

import type { ReactNode } from 'react'
import type { Theme } from '@/lib/theme'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ThemeContext } from '@/components/theme-context'
import { THEME_CLASS, THEME_STORAGE_KEY } from '@/lib/theme'

function readStoredTheme(): Theme {
  if (typeof window === 'undefined')
    return 'system'
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system')
      return stored
  }
  catch {
    // 隐私模式下 localStorage 不可用，退回系统偏好
  }
  return 'system'
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 真正的样式来源是 <html> 上的 class，跟首屏脚本保持一致 */
function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && prefersDark())
  const root = document.documentElement
  root.classList.toggle(THEME_CLASS, dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}

/**
 * 主题 Provider。
 *
 * 首屏由 <head> 里的内联脚本（lib/theme.ts 的 themeInitScript）先落地，
 * 这里只负责后续切换与跟随系统主题，不渲染任何 script —— 这正是替换掉
 * next-themes 的原因（它在客户端组件里渲染 script，React 19 会报警）。
 * 初始值用惰性初始化直接读 localStorage，所以不需要「挂载后再 setState」那种模式。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [selectedTheme, setSelectedTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    applyTheme(selectedTheme)
  }, [selectedTheme])

  useEffect(() => {
    if (selectedTheme !== 'system')
      return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [selectedTheme])

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    }
    catch {
      // 写入失败也不影响本次切换，只是下次打开会回到系统偏好
    }
    setSelectedTheme(next)
  }, [])

  const toggleTheme = useCallback(() => {
    const isDark = document.documentElement.classList.contains(THEME_CLASS)
    setTheme(isDark ? 'light' : 'dark')
  }, [setTheme])

  const value = useMemo(
    () => ({ theme: selectedTheme, setTheme, toggleTheme }),
    [selectedTheme, setTheme, toggleTheme],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}
