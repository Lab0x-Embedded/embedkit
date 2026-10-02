import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {
  // 工具全是纯前端计算，不做后端；保留默认静态/SSR 行为，将来要加 Route Handler 也不用改配置
  experimental: {
    // 根布局在 [locale] 动态段里，没匹配到路由的地址（例如 /zh/tools/typo）
    // 必须靠 app/global-not-found.tsx 才能显示站点自己的 404 页。
    globalNotFound: true,
  },
  // OG 图片路由要读 assets/og 里的字体子集（next/og 的 500KB 上限逼着字体做子集，
  // 见 scripts/build-og-font.mjs）。用全局 key 而不是猜路由 glob —— 猜错会**静默失效**，
  // 而两个权重加起来才 106KB，铺到所有路由上也无所谓。
  outputFileTracingIncludes: {
    '/*': ['./assets/og/**'],
  },
}

export default createNextIntlPlugin('./i18n/request.ts')(nextConfig)
