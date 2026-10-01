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
)
