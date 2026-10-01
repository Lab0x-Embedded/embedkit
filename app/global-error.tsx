'use client'

import { useEffect } from 'react'
import './globals.css'

/**
 * 根级错误边界：只有 app/[locale]/layout.tsx 自身（字体 / 主题 Provider /
 * next-intl Provider）在客户端抛异常时才会走到这里。
 *
 * 这个文件会**替换整个根布局**，所以必须自带 <html> / <body>；也因此拿不到
 * NextIntlClientProvider，文案只能双语并排写死 —— 这是刻意为之，少一个依赖
 * 就少一个再次崩掉的理由。
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="zh">
      <body className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground antialiased">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            页面出错了
            <span className="mt-1 block text-sm font-normal text-muted-foreground">
              Something went wrong
            </span>
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            站点外壳没能加载。可以先重试，或者刷新页面。
            <span className="mt-1 block">
              The site shell failed to load. Try again, or reload the page.
            </span>
          </p>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground/70">
              Error ID:
              {' '}
              {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            重试 / Try again
          </button>
        </div>
      </body>
    </html>
  )
}
