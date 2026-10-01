import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  test: {
    // 工具核心都是纯函数，跑在 node 环境即可（不依赖 jsdom）
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
