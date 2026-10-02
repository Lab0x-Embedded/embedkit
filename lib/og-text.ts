/**
 * OG 卡片上用到的全部文字。
 *
 * 单独抽出来的原因：**这份文案决定了字体子集要包含哪些字**。
 * assets/og/*.ttf 是从完整 Noto Sans SC 裁出来的子集（完整版 10MB+，
 * 而 next/og 的 bundle 上限是 500KB），所以卡片上出现的每一个字都必须在
 * 那个子集里，否则会渲染成豆腐块。
 *
 * 因此：
 *   - 文案只能来自 messages（单一数据源）
 *   - `ogCharset()` 是「需要哪些字」的权威定义
 *   - lib/og.test.ts 拿它和 assets/og/charset.txt 比对，
 *     改了文案却没重新生成字体，测试直接红
 *
 * 纯模块：不 import React、不碰 DOM / next/og，可在 node 下单测。
 * 文案是静态的（每个 locale 一份），所以直接读 messages，不走请求上下文 ——
 * OG 图片对每个 locale 都是常量，没必要挂到 next-intl 的请求作用域上。
 */

import type { Locale } from '@/i18n/routing'
import { createTranslator } from 'next-intl'
import { routing } from '@/i18n/routing'
import enMessages from '@/messages/en.json'
import zhMessages from '@/messages/zh.json'
import { SITE_URL } from './site'
import { categories, countByStatus, countExternal, tools } from './tools-meta'
import { getToolText } from './tools-text'

/**
 * en 与 zh 的**键结构完全相同**，只有字符串不同。
 *
 * 这里借 zh 的类型做形状声明，好让 createTranslator 能推断出占位符 ——
 * 否则第二个参数会被推成 `undefined`，`t('available', { count })` 直接类型报错。
 */
const MESSAGES = {
  zh: zhMessages,
  en: enMessages as unknown as typeof zhMessages,
}

/** 一张卡片的几段文字 */
export interface OgCard {
  /** 左上角品牌 */
  brand: string
  /** 主标题（大字） */
  title: string
  /** 说明（副标题，会换行） */
  subtitle: string
  /** 标题下一行小字（数量 / 分类） */
  meta: string
  /** 右下角域名 */
  footer: string
}

const BRAND = 'EmbedKit'
const FOOTER = new URL(SITE_URL).host

/**
 * 卡片上的装饰字符。
 *
 * 不来自文案，但画在卡片上（左上角那个 `>_` 终端标记），
 * 所以必须一起进字体子集 —— 否则渲染成豆腐块。
 */
const DECORATIVE = '>_'

function categoryLabel(locale: Locale, category: string): string {
  const table = MESSAGES[locale].Categories as Record<string, string>
  return table[category] ?? category
}

/** 首页卡片：站点名 + 一句话 + 「N 个可用 · N 个外部工具」 */
export function siteOgCard(locale: Locale): OgCard {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'Home' })

  return {
    brand: BRAND,
    title: t('title'),
    subtitle: t('intro'),
    meta: [
      t('available', { count: countByStatus('done') }),
      t('external', { count: countExternal() }),
    ].join(' · '),
    footer: FOOTER,
  }
}

/** 工具卡片：工具名 + 该工具的说明 + 所属分类 */
export function toolOgCard(slug: string, locale: Locale): OgCard {
  const messages = MESSAGES[locale]
  const tool = tools.find(item => item.slug === slug)
  const text = getToolText(messages, slug)

  return {
    brand: BRAND,
    title: text.name,
    subtitle: text.desc,
    meta: tool ? categoryLabel(locale, tool.category) : '',
    footer: FOOTER,
  }
}

/**
 * 所有可能出现的字符（去重 + 排序）。
 *
 * 两种语言、首页 + 每个工具都算进来 —— 字体子集必须覆盖全部，
 * 否则切到英文或某个工具页就会缺字。
 */
export function ogCharset(): string {
  const texts: string[] = []

  const collect = (card: OgCard) => {
    texts.push(card.brand, card.title, card.subtitle, card.meta, card.footer)
  }

  for (const locale of routing.locales) {
    collect(siteOgCard(locale))
    for (const tool of tools)
      collect(toolOgCard(tool.slug, locale))
    // 分类名只出现在工具卡片的 meta 行，但它来自 Categories 命名空间，一起收进来
    for (const category of categories)
      texts.push(categoryLabel(locale, category))
  }

  const unique = new Set<string>()
  for (const text of texts) {
    for (const char of text)
      unique.add(char)
  }
  for (const char of DECORATIVE)
    unique.add(char)

  return [...unique].sort().join('')
}
