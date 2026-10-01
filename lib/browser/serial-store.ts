import { createSerialStore } from '@/lib/core/serial-store'

/** 绑定到浏览器 localStorage 的默认实例（SSR 时没有 storage，自动退回默认值） */
export const serialStore = createSerialStore(
  typeof window === 'undefined' ? null : window.localStorage,
)
