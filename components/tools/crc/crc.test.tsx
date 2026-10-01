// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'
import { getPreset } from '@/lib/core/crc'
import messages from '@/messages/zh.json'
import { Crc } from './crc'

const t = messages.Crc

function renderCrc() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <Crc />
    </NextIntlClientProvider>,
  )
}

const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')

afterEach(cleanup)

describe('crc · 默认状态', () => {
  it('默认是 Modbus 读保持寄存器的 PDU，CRC-16/MODBUS 算得 0xCDC5', () => {
    renderCrc()
    // 期望值由 lib/core/crc 的预设算出，这里只验证 UI 把它显示出来了
    const expected = getPreset('crc-16-modbus')!
      .compute(Uint8Array.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x0A]))
    expect(expected).toBe(0xCDC5n)
    expect(bodyText()).toContain('0xCDC5')
  })

  it('默认不开整帧校验（避免把纯数据误判成坏帧）', () => {
    renderCrc()
    expect(bodyText()).not.toContain(t.frameOk)
    expect(bodyText()).not.toContain(t.frameBad)
  })

  it('小端与大端字节都给出', () => {
    renderCrc()
    expect(bodyText()).toContain('CD C5')
    expect(bodyText()).toContain('C5 CD')
  })
})

describe('crc · 输入变化', () => {
  it('打开整帧校验后，完整的 Modbus 帧判定为一致', () => {
    renderCrc()
    fireEvent.click(screen.getByRole('button', { name: t.frameCheckToggle }))
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '01 03 00 00 00 0A C5 CD' } })
    expect(bodyText()).toContain(t.frameOk)
  })

  it('打开整帧校验后改一个字节就变成不一致', () => {
    renderCrc()
    fireEvent.click(screen.getByRole('button', { name: t.frameCheckToggle }))
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '01 03 00 00 00 0B C5 CD' } })
    expect(bodyText()).toContain(t.frameBad)
  })

  it('数据比 CRC 还短时不出整帧校验卡', () => {
    renderCrc()
    fireEvent.click(screen.getByRole('button', { name: t.frameCheckToggle }))
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '01 03' } })
    expect(bodyText()).not.toContain(t.frameOk)
    expect(bodyText()).not.toContain(t.frameBad)
    expect(bodyText()).toContain(t.crcValue)
  })

  it('切到文本模式按 UTF-8 字节算', () => {
    renderCrc()
    fireEvent.click(screen.getByRole('button', { name: t.modeText }))
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '123456789' } })
    // "123456789" 是各模型官方 check 的标准输入
    expect(bodyText()).toContain('0x4B37')
  })

  it('奇数长度的 HEX 报错而不是崩掉', () => {
    renderCrc()
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'ABC' } })
    expect(bodyText()).toContain(t.error.oddLength)
  })

  it('非法字符报错并指出字符', () => {
    renderCrc()
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'ZZ' } })
    expect(bodyText()).toContain('Z')
    expect(bodyText()).toContain(t.error.badChar.replace('{char}', 'Z'))
  })

  it('切到大端解释后同一帧校验失败（字节序选错就该失败）', () => {
    renderCrc()
    fireEvent.click(screen.getByRole('button', { name: t.frameCheckToggle }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '01 03 00 00 00 0A C5 CD' } })
    expect(bodyText()).toContain(t.frameOk)

    fireEvent.click(screen.getByRole('button', { name: t.bigEndian }))
    expect(bodyText()).toContain(t.frameBad)
  })
})
