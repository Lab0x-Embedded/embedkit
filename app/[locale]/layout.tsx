import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ThemeProvider } from '@wrksz/themes/next'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Geist, Geist_Mono } from 'next/font/google'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { routing } from '@/i18n/routing'
import { SITE_URL } from '@/lib/site'
import '../globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale))
    notFound()

  const t = await getTranslations({ locale, namespace: 'Metadata' })

  return {
    // 相对 URL（openGraph / canonical）靠它补成绝对地址
    metadataBase: new URL(SITE_URL),
    title: { default: t('title'), template: `%s · ${t('siteName')}` },
    description: t('description'),
    applicationName: t('siteName'),
    openGraph: {
      type: 'website',
      siteName: t('siteName'),
      // 刻意不写 title / description：留空时 Next 会用该页最终解析出来的
      // title / description 兜底，工具页才会显示「CRC 计算器」而不是站点名。
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
    },
    twitter: { card: 'summary' },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale))
    notFound()

  // 让本页走静态渲染（配合 generateStaticParams）
  setRequestLocale(locale)

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider>
          {/* @wrksz/themes 的 ThemeProvider 由 Server Component 注入首屏脚本来设定主题
              （不闪白），客户端渲染的 script 在 React 19 里不会执行，所以必须留在服务端。
              attribute="class" 对应 globals.css 里的 dark: 变体；默认 system 跟随系统。 */}
          <ThemeProvider attribute="class">
            <TooltipProvider>
              <div className="flex min-h-svh flex-col">
                <SiteHeader />
                <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">
                  {children}
                </main>
                <SiteFooter />
              </div>
            </TooltipProvider>
            {/* Toaster 要用主题上下文，必须待在 ThemeProvider 里面 */}
            <Toaster position="top-center" />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
