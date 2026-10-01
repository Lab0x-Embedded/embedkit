// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'
import messages from '@/messages/zh.json'
import { ModbusFrame } from './modbus-frame'

const t = messages.Modbus

function renderTool() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <ModbusFrame />
    </NextIntlClientProvider>,
  )
}

const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')

afterEach(cleanup)

describe('modbusFrame · 组帧', () => {
  it('默认参数生成 01 03 00 00 00 0A C5 CD', () => {
    renderTool()
    expect(bodyText()).toContain('01 03 00 00 00 0A C5 CD')
  })

  it('给出字段拆解与 C 数组', () => {
    renderTool()
    expect(bodyText()).toContain(t.fields.unitId)
    expect(bodyText()).toContain(t.fields.crc)
    expect(bodyText()).toContain('const uint8_t buf[] = {')
  })

  it('切到 TCP 后不带 CRC，换成 MBAP 头', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: 'TCP' }))
    expect(bodyText()).toContain('00 01 00 00 00 06 01 03 00 00 00 0A')
    expect(bodyText()).toContain(t.fields.protocolId)
  })

  it('读寄存器数量超上限时报错', () => {
    renderTool()
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    // 顺序：单元号、数量（地址在两者之间）
    const quantity = boxes.find(box => box.value === '10')
    expect(quantity).toBeTruthy()
    fireEvent.change(quantity!, { target: { value: '200' } })
    expect(bodyText()).toContain(t.error.badQuantity.replace('{min}', '1').replace('{max}', '125'))
  })

  it('地址非法时报错', () => {
    renderTool()
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    const address = boxes.find(box => box.value === '0x0000')
    fireEvent.change(address!, { target: { value: '0x10000' } })
    expect(bodyText()).toContain(t.error.badAddress)
  })
})

describe('modbusFrame · 解析', () => {
  it('默认粘一整帧有效报文，判定 CRC 通过', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.panelParse }))
    expect(bodyText()).toContain(t.crcOk)
  })

  it('改一个字节后判定 CRC 不通过', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.panelParse }))
    const box = screen.getAllByRole('textbox').at(-1) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '01 03 00 00 00 0B C5 CD' } })
    expect(bodyText()).toContain(t.crcBad)
  })

  it('识别异常响应', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.panelParse }))
    const box = screen.getAllByRole('textbox').at(-1) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '01 83 02 C0 F1' } })
    expect(bodyText()).toContain(t.exception.replace('{code}', '2'))
  })

  it('奇数长度 HEX 报错', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.panelParse }))
    const box = screen.getAllByRole('textbox').at(-1) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'ABC' } })
    expect(bodyText()).toContain(t.error.oddLength)
  })
})
