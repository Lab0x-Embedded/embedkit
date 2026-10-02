// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'
import { byteOrder, convertAll, interpret } from '@/lib/core/radix'
import messages from '@/messages/zh.json'
import { BaseConverter } from './base-converter'

const t = messages.BaseConverter

function renderTool() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <BaseConverter />
    </NextIntlClientProvider>,
  )
}

const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')
const input = () => document.getElementById('radix-input') as HTMLInputElement

/** 把 `{name}` 换成实际值，得到 ICU 在运行时渲染出来的那句话 */
function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`))
}

/**
 * 取某个 ValueRow 的整行文本。
 *
 * 用它**唯一**的 label 定位（无符号 / 有符号 / 符号位 / 大端 / 小端），
 * 避免整页 textContent 里撞到别的同名文字。
 */
function rowText(label: string): string {
  const span = screen.getByText(label)
  return (span.parentElement?.parentElement?.textContent ?? '').replace(/\s+/g, ' ')
}

/** 期望值一律由核心函数算出来，组件改坏 + 核心改坏才会同时骗过测试 */
function expectedRows(raw: string) {
  const result = convertAll(raw)
  if (!result.ok)
    throw new Error(`测试用例本身写错了：${raw} 应当解析成功`)
  return result
}

afterEach(cleanup)

describe('baseConverter · 自动识别', () => {
  it('默认 0xFF：四种进制的结果都渲染出来', () => {
    renderTool()
    expect(input().value).toBe('0xFF')
    for (const row of expectedRows('0xFF').rows)
      expect(bodyText()).toContain(row.display)
  })

  it('二进制按 4 位分组显示', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '0xAA' } })
    expect(bodyText()).toContain('1010 1010')
  })

  it('无前缀按十进制', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '255' } })
    expect(rowText(t.unsigned)).toContain('255')
    expect(bodyText()).toContain('FF')
  })

  it('后缀前缀都认：0b / 0o / 0x', () => {
    renderTool()
    for (const [raw, expected] of [['0b1010', '10'], ['0o777', '511'], ['0x1F', '31']] as const) {
      fireEvent.change(input(), { target: { value: raw } })
      expect(rowText(t.unsigned)).toContain(expected)
    }
  })

  it('大数不丢精度（2^64-1 不会变成浮点近似值）', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '18446744073709551615' } })
    expect(bodyText()).toContain('18446744073709551615')
    expect(bodyText()).not.toContain('18446744073709552000')
  })

  it('带分隔符与全角的输入也能解析', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '0b1010 1010' } })
    expect(rowText(t.unsigned)).toContain('170')
  })
})

describe('baseConverter · 手动指定源进制', () => {
  it('选 BIN 后「11」是二进制 3，不再是十进制 11', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: 'BIN' }))
    fireEvent.change(input(), { target: { value: '11' } })
    expect(rowText(t.unsigned)).toContain('3')
  })

  it('选 DEC 后输入 0xFF 报「前缀与所选进制冲突」', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: 'DEC' }))
    expect(bodyText()).toContain(
      fill(t.error.prefixMismatch, { prefix: 'x', radix: 10 }),
    )
  })

  it('切回自动识别后 0xFF 又能解析', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: 'DEC' }))
    expect(bodyText()).toContain(fill(t.error.prefixMismatch, { prefix: 'x', radix: 10 }))
    fireEvent.click(screen.getByRole('button', { name: t.auto }))
    expect(rowText(t.unsigned)).toContain('255')
  })
})

describe('baseConverter · 位宽与补码解释', () => {
  it('0xFFFFFFFF 在 32 位下：无符号 4294967295 / 有符号 -1 / 符号位为 1', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '0xFFFFFFFF' } })
    expect(rowText(t.unsigned)).toContain('4294967295')
    expect(rowText(t.signed)).toContain('-1')
    expect(rowText(t.signBit)).toContain(t.signBitSet)
  })

  it('默认 32 位下 0xFF 是有符号 255（正数）', () => {
    renderTool()
    expect(rowText(t.signed)).toContain('255')
    expect(rowText(t.signBit)).toContain(t.signBitClear)
  })

  it('切到 8 位后同一个 0xFF 变成有符号 -1', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: '8' }))
    expect(rowText(t.signed)).toContain('-1')
    expect(rowText(t.signBit)).toContain(t.signBitSet)
  })

  it('位宽解释与核心函数一致（64 位边界）', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '0x8000000000000000' } })
    fireEvent.click(screen.getByRole('button', { name: '64' }))
    const expected = interpret(0x8000000000000000n, 64)
    expect(rowText(t.unsigned)).toContain(expected.unsigned)
    expect(rowText(t.signed)).toContain(expected.signed)
  })
})

describe('baseConverter · 字节序', () => {
  it('0x12345678 的大端与小端互逆', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '0x12345678' } })
    const expected = byteOrder(0x12345678n, 32)
    expect(rowText(t.bigEndian)).toContain(expected.bigEndian)
    expect(rowText(t.littleEndian)).toContain(expected.littleEndian)
    expect(expected.bigEndian).not.toBe(expected.littleEndian)
  })

  it('位宽决定字节数：8 位 0xFF 切成 16 位后是大端 00 FF', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '0xFF' } })
    fireEvent.click(screen.getByRole('button', { name: '16' }))
    expect(rowText(t.bigEndian)).toContain('00 FF')
  })
})

describe('baseConverter · 错误与空态', () => {
  it('清空后给出输入提示', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.clear }))
    expect(input().value).toBe('')
    expect(bodyText()).toContain(t.emptyHint)
  })

  it('非法字符报错并指出是哪个字符', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '0xZZ' } })
    expect(bodyText()).toContain(fill(t.error.badDigit, { char: 'Z', radix: 16 }))
  })

  it('只有前缀没有数字', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '0x' } })
    expect(bodyText()).toContain(t.error.noDigits)
  })

  it('八进制不接受 8', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '0o8' } })
    expect(bodyText()).toContain(fill(t.error.badDigit, { char: '8', radix: 8 }))
  })

  it('出错后不再显示结果行，改成错误框', () => {
    renderTool()
    fireEvent.change(input(), { target: { value: '0xZZ' } })
    expect(screen.queryByText(t.unsigned)).toBeNull()
  })

  it('点示例按钮会替换输入并实时重算', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: '-1' }))
    expect(input().value).toBe('-1')
    // -1 在 32 位下按补码取值为 4294967295
    expect(rowText(t.unsigned)).toContain('4294967295')
    expect(rowText(t.signed)).toContain('-1')
  })
})
