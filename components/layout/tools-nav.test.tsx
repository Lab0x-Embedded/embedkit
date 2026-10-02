// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { categories, getToolsByCategory } from '@/lib/tools-meta'
import messages from '@/messages/zh.json'
import { ToolsNav } from './tools-nav'

const nav = messages.Nav
const tc = messages.Categories

/**
 * 把 next-intl 的导航适配层换掉。
 *
 * 真实的 Link / usePathname 需要 App Router 的运行时上下文，纯组件测试里没有；
 * 这里换成一个朴素的 <a> 和一个可控的 pathname，测的是**本组件自己的逻辑**
 * （分组、顺序、href、当前项标记），locale 前缀由 next-intl 负责，不在这一层测。
 */
const state = vi.hoisted(() => ({ pathname: '/tools/crc' }))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string, children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  usePathname: () => state.pathname,
}))

function renderNav() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <ToolsNav />
    </NextIntlClientProvider>,
  )
}

/** Radix 的下拉是 pointerdown 触发的，click 不管用 */
function openMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: nav.tools }), { button: 0, ctrlKey: false })
}

function menuLinks() {
  return [...document.querySelectorAll('[role="menuitem"]')].map(node => node as HTMLAnchorElement)
}

afterEach(() => {
  cleanup()
  state.pathname = '/tools/crc'
})

describe('toolsNav · 触发器', () => {
  it('页头有一个「工具」按钮', () => {
    renderNav()
    expect(screen.getByRole('button', { name: nav.tools })).toBeTruthy()
  })

  it('没点开时菜单内容不在 DOM 里', () => {
    renderNav()
    expect(menuLinks()).toHaveLength(0)
  })
})

describe('toolsNav · 菜单内容由 tools-meta 派生', () => {
  it('8 个工具全部列出，顺序与 tools-meta 的分类顺序一致', () => {
    renderNav()
    openMenu()

    const expected = categories.flatMap(category => getToolsByCategory(category))
    expect(menuLinks()).toHaveLength(expected.length)
    expect(expected).toHaveLength(8)

    // 菜单项的文本就是 messages 里的工具名，顺序必须一致
    expect(menuLinks().map(link => link.textContent)).toEqual(
      expected.map(tool => messages.Tools[tool.slug as keyof typeof messages.Tools].name),
    )
  })

  it('每个菜单项都指向站内的 /tools/<slug>', () => {
    renderNav()
    openMenu()

    for (const tool of categories.flatMap(category => getToolsByCategory(category)))
      expect(menuLinks().some(link => link.getAttribute('href') === `/tools/${tool.slug}`)).toBe(true)
  })

  it('外链工具也指向站内入口页，不直接甩到外站', () => {
    renderNav()
    openMenu()

    const pinLookup = menuLinks().find(link => link.getAttribute('href') === '/tools/pin-lookup')
    expect(pinLookup).toBeTruthy()
    expect(menuLinks().some(link => link.getAttribute('href')?.startsWith('http'))).toBe(false)
  })

  it('分类标题都渲染出来（含「外部工具」）', () => {
    renderNav()
    openMenu()

    for (const category of categories)
      expect(screen.getAllByText(tc[category]).length).toBeGreaterThan(0)

    expect(tc.ext).toBe(messages.Categories.ext)
  })
})

describe('toolsNav · 当前位置标记', () => {
  it('当前所在的工具带 aria-current="page"，其余没有', () => {
    state.pathname = '/tools/crc'
    renderNav()
    openMenu()

    const current = menuLinks().filter(link => link.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0].getAttribute('href')).toBe('/tools/crc')
  })

  it('在首页时没有任何菜单项被标记为当前', () => {
    state.pathname = '/'
    renderNav()
    openMenu()

    expect(menuLinks().every(link => link.getAttribute('aria-current') === null)).toBe(true)
  })

  it('在别的工具页时标记会跟着换', () => {
    state.pathname = '/tools/bitfield'
    renderNav()
    openMenu()

    const current = menuLinks().filter(link => link.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0].getAttribute('href')).toBe('/tools/bitfield')
  })
})
