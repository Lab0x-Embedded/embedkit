import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import zh from '@/messages/zh.json'
import { ogCharset, siteOgCard, toolOgCard } from './og-text'
import { countByStatus, countExternal, tools } from './tools-meta'

const CHARSET_PATH = join(process.cwd(), 'assets/og/charset.txt')

describe('og · 字体字符集与文案一致', () => {
  it('assets/og/charset.txt 与当前文案算出来的字符集完全相同', () => {
    const required = ogCharset()

    // 显式要求时才写回：避免测试顺带改仓库文件
    if (process.env.UPDATE_OG_CHARSET === '1') {
      writeFileSync(CHARSET_PATH, required)
      return
    }

    expect(
      // 只去掉文件末尾可能多的换行：字符集里**开头就是一个空格**，
      // 用 trim() 会把那个合法字符一起吃掉。
      readFileSync(CHARSET_PATH, 'utf8').replace(/\n$/, ''),
      [
        '文案变了，但 assets/og 里的字体子集还是旧的 —— 卡片会渲染出豆腐块。',
        '重新生成：UPDATE_OG_CHARSET=1 pnpm test -- lib/og.test.ts && node scripts/build-og-font.mjs',
      ].join('\n'),
    ).toBe(required)
  })

  it('字符集覆盖两种语言与全部工具（不是只覆盖中文首页）', () => {
    const charset = new Set(ogCharset())

    for (const locale of ['zh', 'en'] as const) {
      const site = siteOgCard(locale)
      for (const text of [site.brand, site.title, site.subtitle, site.meta, site.footer]) {
        for (const char of text)
          expect(charset.has(char), `${locale} 首页缺字「${char}」`).toBe(true)
      }

      for (const tool of tools) {
        const card = toolOgCard(tool.slug, locale)
        for (const text of [card.title, card.subtitle, card.meta]) {
          for (const char of text)
            expect(charset.has(char), `${locale} 的 ${tool.slug} 缺字「${char}」`).toBe(true)
        }
      }
    }
  })
})

describe('og · 首页卡片', () => {
  it('标题与说明取自 messages，域名不带协议', () => {
    const card = siteOgCard('zh')
    expect(card.brand).toBe('EmbedKit')
    expect(card.title).toBe(zh.Home.title)
    expect(card.subtitle).toBe(zh.Home.intro)
    expect(card.footer).toBe('embedkit.ryanuo.cc')
  })

  it('meta 行是真实的工具数量（外链工具单独算，不混进「可用」）', () => {
    const card = siteOgCard('zh')
    expect(card.meta).toContain(`${countByStatus('done')} 个可用`)
    expect(card.meta).toContain(`${countExternal()} 个外部工具`)
    // 8 个工具 = 7 本地 + 1 外链，别写成 8 个可用
    expect(countByStatus('done')).toBe(tools.length - countExternal())
  })

  it('英文站点数量走 ICU 复数，不会出现「1 external tools」', () => {
    const card = siteOgCard('en')
    expect(card.meta).toContain('external tool')
    expect(card.meta).not.toContain('external tools')
  })
})

describe('og · 工具卡片', () => {
  it('标题是工具名，说明是该工具的 desc，meta 是分类名', () => {
    const card = toolOgCard('crc', 'zh')
    expect(card.title).toBe(zh.Tools.crc.name)
    expect(card.subtitle).toBe(zh.Tools.crc.desc)
    expect(card.meta).toBe(zh.Categories.calc)
    expect(card.footer).toBe('embedkit.ryanuo.cc')
  })

  it('每个工具都能出卡片，且标题不为空', () => {
    for (const tool of tools) {
      for (const locale of ['zh', 'en'] as const) {
        const card = toolOgCard(tool.slug, locale)
        expect(card.title.length, `${locale}/${tool.slug} 标题为空`).toBeGreaterThan(0)
        expect(card.subtitle.length, `${locale}/${tool.slug} 说明为空`).toBeGreaterThan(0)
      }
    }
  })

  it('未知 slug 不会崩（退回 slug 本身）', () => {
    const card = toolOgCard('not-a-tool', 'zh')
    expect(card.title).toBe('not-a-tool')
    expect(card.meta).toBe('')
  })
})
