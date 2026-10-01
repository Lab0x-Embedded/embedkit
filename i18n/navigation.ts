import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

/** 带 locale 感知的导航 API（Link / redirect / usePathname / useRouter） */
export const { Link, redirect, usePathname, useRouter, getPathname }
  = createNavigation(routing)
