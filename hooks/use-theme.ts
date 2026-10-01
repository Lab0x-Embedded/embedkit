'use client'

import type { ThemeContextValue } from '@/components/theme-context'
import { use } from 'react'
import { ThemeContext } from '@/components/theme-context'

/** 读主题上下文（必须在 <ThemeProvider> 内部使用） */
export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext)
  if (!context)
    throw new Error('useTheme 必须在 <ThemeProvider> 内部使用')
  return context
}
