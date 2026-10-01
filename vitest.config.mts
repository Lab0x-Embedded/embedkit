import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  // tsconfig 里 jsx 是 preserve（交给 Next），vitest 这侧由 rolldown/oxc 按自身默认处理 JSX
  test: {
    // 工具核心都是纯函数，跑在 node 环境即可；组件测试在文件头用
    // `@vitest-environment happy-dom` 单独指定
    environment: 'node',
    include: ['lib/**/*.test.ts', 'components/**/*.test.tsx'],
  },
})
