import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {
  // 工具全是纯前端计算，不做后端；保留默认静态/SSR 行为，将来要加 Route Handler 也不用改配置
}

export default createNextIntlPlugin('./i18n/request.ts')(nextConfig)
