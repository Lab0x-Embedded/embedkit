import type { MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { parse, TYPE } from '@formatjs/icu-messageformat-parser'
import { describe, expect, it } from 'vitest'
import en from '../messages/en.json'
import zh from '../messages/zh.json'
import { CRC_PRESETS } from './core/crc'
import { categories, tools } from './tools-meta'

type Tree = Record<string, unknown>

/** 把嵌套文案压成 `Namespace.key` → 值 */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of flatten(value as Tree, path))
        out.set(k, v)
    }
    else {
      out.set(path, String(value))
    }
  }
  return out
}

/**
 * 正则视角的占位符。
 *
 * 只用来和 ICU 视角对照：两者不一致说明写法被 ICU 的引号语法吞了。
 */
function rawPlaceholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
}

/**
 * 取出文案里用到的参数名。
 *
 * 走 ICU 解析器而不是正则：`{count, plural, one {# byte} other {# bytes}}`
 * 这种复数写法在正则眼里根本不像占位符，会被误判成「两种语言不一致」。
 */
function placeholders(text: string): string[] {
  const found = new Set<string>()

  const walk = (elements: MessageFormatElement[]): void => {
    for (const element of elements) {
      if (element.type === TYPE.argument) {
        found.add(element.value)
      }
      else if (element.type === TYPE.plural || element.type === TYPE.select) {
        found.add(element.value)
        for (const option of Object.values(element.options))
          walk(option.value)
      }
      else if (element.type === TYPE.tag) {
        walk(element.children)
      }
    }
  }

  walk(parse(text))
  return [...found].sort()
}

const zhKeys = flatten(zh as Tree)
const enKeys = flatten(en as Tree)

/**
 * 文案是唯一「加工具容易忘」的地方：页面忘了文案会直接显示 slug。
 * 这几条断言把 zh / en / 工具清单三者钉在一起，靠 CI 兜底。
 */
describe('i18n 文案一致性', () => {
  it('zh 与 en 的键完全一致', () => {
    expect([...enKeys.keys()].sort()).toEqual([...zhKeys.keys()].sort())
  })

  it('没有空文案', () => {
    const blank = [...zhKeys, ...enKeys]
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key)
    expect(blank).toEqual([])
  })

  it('两种语言的占位符（{name}）相同', () => {
    const mismatched = [...zhKeys.keys()].filter((key) => {
      const zhText = zhKeys.get(key)
      const enText = enKeys.get(key)
      if (zhText === undefined || enText === undefined)
        return false
      return placeholders(zhText).join() !== placeholders(enText).join()
    })
    expect(mismatched).toEqual([])
  })

  it('没有占位符被 ICU 的引号语法吞掉', () => {
    // ICU 里单引号是转义符：`'{char}'` 会被当成字面量，参数根本不替换。
    // 这种错在页面上表现为直接显示 {char}，既不抛异常也不报错，只能靠断言拦。
    // （真实案例：英文站的 BaseConverter.error.badDigit 曾经就是这个写法。）
    const swallowed: string[] = []
    for (const [key, value] of [...zhKeys, ...enKeys]) {
      const expected = rawPlaceholders(value)
      if (expected.length === 0)
        continue
      const actual = placeholders(value)
      const missing = expected.filter(name => !actual.includes(name))
      if (missing.length > 0)
        swallowed.push(`${key}: ${missing.join(', ')}`)
    }
    expect(swallowed).toEqual([])
  })

  it('每条文案都能被 ICU 解析', () => {
    // 文案里出现字面量花括号（比如 C 代码片段）会被 ICU 当成参数占位符，
    // 运行时抛 INVALID_MESSAGE 且只在控制台可见 —— 这条断言把它变成红灯。
    const broken: string[] = []
    for (const [key, value] of [...zhKeys, ...enKeys]) {
      try {
        parse(value)
      }
      catch (error) {
        broken.push(`${key}: ${(error as Error).message}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('tools-meta 里每个分类都有双语名称', () => {
    const zhCategories = (zh as Tree).Categories as Tree
    const enCategories = (en as Tree).Categories as Tree
    // 漏了分类文案首页会直接渲染出 ext 这种键名
    const missing = categories.filter(
      category => !(category in zhCategories) || !(category in enCategories),
    )
    expect(missing).toEqual([])
  })

  it('tools-meta 里每个工具都有 name / desc 文案', () => {
    const missing = tools.filter((tool) => {
      const entry = (zh as Tree).Tools as Record<string, { name?: string, desc?: string }>
      const enEntry = (en as Tree).Tools as Record<string, { name?: string, desc?: string }>
      return !entry?.[tool.slug]?.name || !entry?.[tool.slug]?.desc
        || !enEntry?.[tool.slug]?.name || !enEntry?.[tool.slug]?.desc
    })
    expect(missing.map(tool => tool.slug)).toEqual([])
  })

  it('messages 里没有多余的、tools-meta 已删除的工具文案', () => {
    const slugs = new Set(tools.map(tool => tool.slug))
    const orphan = Object.keys((zh as Tree).Tools as Tree).filter(slug => !slugs.has(slug))
    expect(orphan).toEqual([])
  })

  it('每个 CRC 预设都有双语名称', () => {
    const zhPresets = (zh as Tree).Crc as { presets: Tree }
    const enPresets = (en as Tree).Crc as { presets: Tree }
    const missing = CRC_PRESETS.filter(preset =>
      !(preset.id in zhPresets.presets) || !(preset.id in enPresets.presets),
    ).map(preset => preset.id)
    expect(missing).toEqual([])
  })

  it('预设文案里没有多余的条目', () => {
    const ids = new Set<string>(CRC_PRESETS.map(preset => preset.id))
    const zhPresets = (zh as Tree).Crc as { presets: Tree }
    expect(Object.keys(zhPresets.presets).filter(id => !ids.has(id))).toEqual([])
  })
})
