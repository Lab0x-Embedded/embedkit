/**
 * 主题（亮/暗/跟随系统）的约定与首屏脚本。
 *
 * 为什么不用 next-themes：0.4.x 会在客户端组件里渲染一个 `<script>`，
 * React 19 会就此报警（"Scripts inside React components are never executed
 * when rendering on the client"）。这里改成由 Server Component 在 `<head>`
 * 里输出一个内联脚本：浏览器解析 HTML 时就执行，不经过 React 的客户端渲染，
 * 因此既没有警告，也不会有主题闪烁。
 */

export type Theme = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'embedkit-theme'

/** 主题类挂在 <html> 上（Tailwind 的 dark: 变体依赖它） */
export const THEME_CLASS = 'dark'

/**
 * 生成首屏主题脚本（同步执行，必须放在 <head> 里）。
 *
 * 逻辑：读取 localStorage → 没有就用系统偏好 → 给 <html> 挂 dark 类并设置 color-scheme。
 * 用 try/catch 包住 localStorage：隐私模式下会抛错，此时退回系统偏好。
 */
export function themeInitScript(storageKey: string = THEME_STORAGE_KEY): string {
  return `(function(){try{var t=localStorage.getItem(${JSON.stringify(storageKey)})||'system';var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle(${JSON.stringify(THEME_CLASS)},d);e.style.colorScheme=d?'dark':'light'}catch(_){}})()`
}
