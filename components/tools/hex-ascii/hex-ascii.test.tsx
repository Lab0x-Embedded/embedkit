// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'
import messages from '@/messages/zh.json'
import { HexAscii } from './hex-ascii'

const t = messages.HexAscii

function renderTool() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <HexAscii />
    </NextIntlClientProvider>,
  )
}

const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')

/** 页面里还有一个「数组变量名」输入框，按 id 精确定位大文本框 */
const input = () => document.getElementById('hexascii-input') as HTMLTextAreaElement

afterEach(cleanup)

describe('hexAscii · 文本 → HEX', () => {
  it('默认把「Hello 温度」按 UTF-8 转成字节', () => {
    renderTool()
    expect(input().value).toBe('Hello 温度')
    expect(bodyText()).toContain('48 65 6C 6C 6F 20 E6 B8 A9 E5 BA A6')
  })

  it('同一段文本能在结果里读回来（往返）', () => {
    renderTool()
    expect(bodyText()).toContain('Hello 温度')
  })

  it('勾上 0x 前缀后 HEX 视图改变，但 C 数组不重复加前缀', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: '0x' }))
    expect(bodyText()).toContain('0x48,')
    expect(bodyText()).toContain('const uint8_t buf[] = {')
  })

  it('latin-1 下一个字符一个字节', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.encodingLatin1 }))
    fireEvent.change(input(), { target: { value: 'AB' } })
    expect(bodyText()).toContain('41 42')
  })
})

describe('hexAscii · HEX → 文本', () => {
  it('切到 HEX 输入后解析出文本与 C 数组', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.modeHex }))
    fireEvent.change(input(), { target: { value: '48 65 6C 6C 6F' } })
    expect(bodyText()).toContain('Hello')
    expect(bodyText()).toContain('0x48, 0x65, 0x6C, 0x6C, 0x6F,')
  })

  it('奇数长度报错', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.modeHex }))
    fireEvent.change(input(), { target: { value: 'ABC' } })
    expect(bodyText()).toContain(t.error.oddLength)
  })

  it('非法字符报错并指出字符', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.modeHex }))
    fireEvent.change(input(), { target: { value: 'ZZ' } })
    expect(bodyText()).toContain(t.error.badChar.replace('{char}', 'Z'))
  })

  it('显示 xxd 风格的 HEX 转储', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.modeHex }))
    fireEvent.change(input(), { target: { value: '41 00 FF 42' } })
    expect(bodyText()).toContain('00000000')
    expect(bodyText()).toContain('|A..B|')
  })
})

describe('hexAscii · C 数组 → 字节', () => {
  it('能把生成的 C 数组原样读回来', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.modeCArray }))
    fireEvent.change(input(), {
      target: { value: 'const uint8_t frame[] = {\n  0x01, 0x03, /* 长度 */ 0x00, 0x0A,\n};' },
    })
    expect(bodyText()).toContain('01 03 00 0A')
  })

  it('超过一个字节的值报错', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.modeCArray }))
    fireEvent.change(input(), { target: { value: '0x100' } })
    expect(bodyText()).toContain(t.error.outOfRange.replace('{detail}', '0x100'))
  })
})
