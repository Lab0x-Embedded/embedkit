import { createOneNetStore } from '@/lib/core/onenet-store'

/**
 * 绑定到浏览器 localStorage 的实例。
 * SSR 时没有 storage，自动退回默认值（和 lib/browser/serial-store.ts 一致）。
 */
export const onenetStore = createOneNetStore(
  typeof window === 'undefined' ? null : window.localStorage,
)
