import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { Geist, Geist_Mono } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

/**
 * 全局 404：**没匹配到任何路由**的地址走这里。
 *
 * 为什么不能只用 app/[locale]/not-found.tsx：那个文件只接住代码里主动调用的
 * `notFound()`；像 `/zh/tools/typo` 这种压根没匹配上路由的地址，Next 会用
 * 根部的兜底页。而我们的根布局在 [locale] 动态段里，正是官方文档说的那种
 * 「必须用 global-not-found」的情形（见 next/dist/docs 的 not-found.js 一节）。
 *
 * 这个文件会绕过所有布局，所以必须自带 <html> / <body>，并且拿不到 locale ——
 * 文案就双语并排写死，另外给出中英文两个入口。
 */
const geistSans = Geist({ subsets: ['latin'], variable: '--font-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: '404 · EmbedKit',
  description: 'The page you are looking for does not exist.',
}

export default function GlobalNotFound() {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <main className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="font-mono text-5xl font-semibold tracking-tight text-muted-foreground/40">
            404
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            页面不存在
            <span className="mt-1 block text-base font-normal text-muted-foreground">
              Page not found
            </span>
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            这个地址没有对应的工具页，可能是链接写错了。
            <span className="mt-1 block">
              There is no tool page at this address — the link may be wrong.
            </span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Link
              href="/zh"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              <ArrowLeft className="size-3.5" />
              回到首页
            </Link>
            <Link
              href="/en"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              <ArrowLeft className="size-3.5" />
              Back to home
            </Link>
          </div>
        </main>
      </body>
    </html>
  )
}
