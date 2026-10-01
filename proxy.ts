import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

/** Next.js 16 里 middleware 文件改叫 proxy.ts */
export default createMiddleware(routing)

export const config = {
  // 跳过 /api、/_next、/_vercel 以及所有带扩展名的静态文件
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
}
