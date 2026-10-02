#!/usr/bin/env node
/**
 * 生成 OG 卡片用的中文字体子集。
 *
 * 为什么需要这个脚本：
 *   - next/og 走的是 Satori，它**不带任何中文字形**，中文会渲染成空白或豆腐块
 *   - 而 next/og 的 bundle 上限是 500KB，完整 Noto Sans SC 有 10MB+，差 20 倍
 *   - 所以只能裁：OG 卡片上出现的字是有限且固定的（见 lib/og-text.ts），
 *     把这批字单独取出来，两个权重加起来才 100 多 KB
 *
 * 做法：Google Fonts 的 css2 接口支持 `text=` 参数，只返回包含这些字的子集；
 * 再用一个老版本的 User-Agent 让它返回 `format('truetype')` —— Satori 只认
 * ttf / otf / woff，**不认 woff2**（新 UA 默认给 woff2）。
 *
 * 字符集来源：assets/og/charset.txt（由 lib/og.test.ts 校验，
 * 内容必须与 lib/og-text.ts 的 ogCharset() 一致）。
 *
 * 用法：
 *   UPDATE_OG_CHARSET=1 pnpm test -- lib/og.test.ts   # 文案改动后先同步字符集
 *   node scripts/build-og-font.mjs                     # 再重新生成字体
 */

import { Buffer } from 'node:buffer'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const CHARSET_PATH = join(ROOT, 'assets/og/charset.txt')
const WEIGHTS = [400, 700]

// 只去掉末尾换行：字符集开头就是一个空格，trim() 会把它吃掉
const CHARSET = readFileSync(CHARSET_PATH, 'utf8').replace(/\n$/, '')

if (!CHARSET.trim()) {
  console.error(`字符集是空的：${CHARSET_PATH}`)
  process.exit(1)
}

console.log(`字符集 ${[...CHARSET].length} 个字符，开始取子集字体…`)

for (const weight of WEIGHTS) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@${weight}&text=${encodeURIComponent(CHARSET)}`

  const cssResponse = await fetch(cssUrl, {
    // 老 UA → Google Fonts 返回 ttf；换成现代 UA 会给 woff2，Satori 读不了
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1)' },
  })
  if (!cssResponse.ok)
    throw new Error(`取 CSS 失败：${cssResponse.status}`)

  const css = await cssResponse.text()
  const fontUrl = css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/)?.[0]
  if (!fontUrl)
    throw new Error(`权重 ${weight} 的 CSS 里没有字体 URL：\n${css.slice(0, 300)}`)

  const fontResponse = await fetch(fontUrl)
  if (!fontResponse.ok)
    throw new Error(`下载字体失败：${fontResponse.status}`)

  const buffer = Buffer.from(await fontResponse.arrayBuffer())
  const outPath = join(ROOT, `assets/og/noto-sans-sc-${weight}.ttf`)
  writeFileSync(outPath, buffer)

  console.log(`  ✅ ${outPath.replace(`${ROOT}/`, '')}  ${(buffer.length / 1024).toFixed(0)} KB`)
}

console.log('完成。字体许可见 assets/og/LICENSE-NotoSansSC.txt（SIL OFL 1.1）。')
