import type { AbstractIntlMessages } from 'next-intl'

export interface ToolText {
  name: string
  desc: string
}

/**
 * 按 slug 取工具的文案。
 *
 * 文案放在 messages 里（跟着 locale 走），但 slug 是动态的，
 * 用这个纯函数取值可以避开 next-intl 键名的类型体操。
 */
export function getToolText(messages: AbstractIntlMessages, slug: string): ToolText {
  const tools = (messages as Record<string, unknown>).Tools as
    | Record<string, ToolText>
    | undefined
  return tools?.[slug] ?? { name: slug, desc: '' }
}
