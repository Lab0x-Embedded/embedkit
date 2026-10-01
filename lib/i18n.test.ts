import { describe, expect, it } from 'vitest'
import en from '../messages/en.json'
import zh from '../messages/zh.json'
import { tools } from './tools-meta'

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

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
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
})
