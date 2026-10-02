import antfu from '@antfu/eslint-config'

export default antfu(
  {
    react: true,
    nextjs: true,
    typescript: true,
    markdown: false,
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'pnpm-lock.yaml',
    ],
  },
  {
    // shadcn 生成的 UI 原语会同时导出组件和 variants，这是它们的既定写法
    files: ['components/ui/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Next 的文件约定要求 OG 图片路由同时导出 alt / size / contentType 和默认组件；
    // 这条规则只管客户端热更新，对服务端路由是误报
    files: ['app/**/opengraph-image.tsx', 'app/**/twitter-image.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
