import type { Theme } from '@/lib/theme'
import { createContext } from 'react'

export interface ThemeContextValue {
  /** 用户选择（可能是 'system'） */
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

/**
 * 主题上下文对象单独放一个文件：
 * - Provider（组件）与 useTheme（hook）分开放，才能满足 react-refresh 的
 *   "一个文件只导出组件" 规则，热更新不会整页刷新。
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null)
