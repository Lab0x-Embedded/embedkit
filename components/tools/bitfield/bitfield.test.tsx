// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'
import messages from '@/messages/zh.json'
import { Bitfield } from './bitfield'

const t = messages.Bitfield

function renderTool() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <Bitfield />
    </NextIntlClientProvider>,
  )
}

const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')
const bit = (index: number) => screen.getByTitle(`bit ${index}`)

afterEach(cleanup)

describe('bitfield · 寄存器', () => {
  it('默认值 0x2301 出现在结果里', () => {
    renderTool()
    expect(bodyText()).toContain('2301')
    expect(bodyText()).toContain('8961')
  })

  it('点一位就翻转该位（bit 0 从 1 变 0 → 0x2300）', () => {
    renderTool()
    fireEvent.click(bit(0))
    expect(bodyText()).toContain('2300')
  })

  it('全清零 / 全置位', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.clearAll }))
    expect(bodyText()).toContain('0x00000000')
    fireEvent.click(screen.getByRole('button', { name: t.setAll }))
    expect(bodyText()).toContain('0xFFFFFFFF')
  })

  it('取反', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.invert }))
    expect(bodyText()).toContain('DCFE') // ~0x2301 & 0xFFFFFFFF
  })

  it('切到 8 位会截断低位', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: '8' }))
    expect(bodyText()).toContain('0x01')
  })

  it('输入非法字符时报错并指出字符', () => {
    renderTool()
    const box = document.getElementById('bitfield-input') as HTMLInputElement
    fireEvent.change(box, { target: { value: '0xZZ' } })
    expect(bodyText()).toContain(t.error.badChar.replace('{char}', 'Z'))
  })

  it('输入超出位宽时报错', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: '8' }))
    const box = document.getElementById('bitfield-input') as HTMLInputElement
    fireEvent.change(box, { target: { value: '0x1FF' } })
    expect(bodyText()).toContain(t.error.outOfRange.replace('{detail}', '511').replace('{width}', '8'))
  })
})

describe('bitfield · 字段与 C 宏', () => {
  it('默认字段 PLLM 取出低 6 位的值', () => {
    renderTool()
    expect(bodyText()).toContain('PLLM')
    // 0x2301 的低 6 位 = 0b000001 = 1
    expect(bodyText()).toContain('1 (0x1)')
  })

  it('导出 C 宏，包含寄存器值、位置、掩码与字段值', () => {
    renderTool()
    // bodyText() 会把连续空白压成一个空格，这里比较去空白后的结果
    const compact = bodyText().replace(/\s+/g, '')
    expect(compact).toContain('#defineRCC_CFGR_VALUE0x00002301u')
    expect(compact).toContain('#defineRCC_CFGR_PLLM_Pos0u')
    expect(compact).toContain('#defineRCC_CFGR_PLLM_Msk0x0000003Fu')
    expect(compact).toContain('#defineRCC_CFGR_PLLM_Val0x00000001u')
  })

  it('字段范围非法时给出提示且不进 C 宏', () => {
    renderTool()
    const msb = screen.getByDisplayValue('5')
    fireEvent.change(msb, { target: { value: '2' } })
    // MSB 2 < LSB 0 仍然合法，改成 LSB 大于 MSB 才非法
    const lsb = screen.getByDisplayValue('0')
    fireEvent.change(lsb, { target: { value: '9' } })
    expect(bodyText()).toContain(t.fieldError.badRange)
    expect(bodyText()).not.toContain('RCC_CFGR_PLLM_Pos')
  })

  it('新增字段后出现第二组输入框', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.fieldAdd }))
    expect(screen.getAllByPlaceholderText(t.fieldName)).toHaveLength(2)
  })

  it('删除字段', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.fieldRemove }))
    expect(bodyText()).toContain(t.fieldsEmpty)
    expect(bodyText()).not.toContain('RCC_CFGR_PLLM_Pos')
  })
})
