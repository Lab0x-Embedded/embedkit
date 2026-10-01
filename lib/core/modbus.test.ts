import { describe, expect, it } from 'vitest'
import {
  buildModbusRequest,
  MODBUS_LIMITS,
  parseModbusFrame,
} from './modbus'
import { parseHexInput } from './serial'

/** HEX 字面量 → 字节，测试里读起来更接近协议文档 */
function hex(text: string): Uint8Array<ArrayBuffer> {
  const result = parseHexInput(text)
  if (!result.ok)
    throw new Error(`测试用例里的 HEX 写错了：${text}`)
  return result.bytes
}

function hexOf(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

/**
 * 这些参考帧由三份互相独立的实现算出来（js-crc 目录模型、
 * pycrc 逐位模型、教科书的 0xA001 反射查表法），三份结果完全一致，
 * 所以可以直接当协议文档里的标准例子用。
 */
describe('rTU 组帧', () => {
  it('读保持寄存器：01 03 00 00 00 0A → CRC C5 CD', () => {
    const frame = buildModbusRequest({
      mode: 'rtu',
      unitId: 1,
      functionCode: 3,
      address: 0,
      quantity: 10,
    })
    expect(frame.ok).toBe(true)
    if (frame.ok)
      expect(hexOf(frame.bytes)).toBe('01 03 00 00 00 0A C5 CD')
  })

  it('写单个线圈（ON）用协议规定的 0xFF00 表示', () => {
    const frame = buildModbusRequest({
      mode: 'rtu',
      unitId: 1,
      functionCode: 5,
      address: 0x00AC,
      values: [1],
    })
    expect(frame.ok).toBe(true)
    if (frame.ok)
      expect(hexOf(frame.bytes)).toBe('01 05 00 AC FF 00 4C 1B')
  })

  it('写单个线圈（OFF）用 0x0000', () => {
    const frame = buildModbusRequest({
      mode: 'rtu',
      unitId: 1,
      functionCode: 5,
      address: 0x00AC,
      values: [0],
    })
    expect(frame.ok).toBe(true)
    if (frame.ok)
      expect(hexOf(frame.bytes).startsWith('01 05 00 AC 00 00')).toBe(true)
  })

  it('写单个寄存器', () => {
    const frame = buildModbusRequest({
      mode: 'rtu',
      unitId: 1,
      functionCode: 6,
      address: 0x0001,
      values: [0x0003],
    })
    expect(frame.ok).toBe(true)
    if (frame.ok)
      expect(hexOf(frame.bytes)).toBe('01 06 00 01 00 03 98 0B')
  })

  it('写多个线圈：按位打包，低位在前', () => {
    const frame = buildModbusRequest({
      mode: 'rtu',
      unitId: 1,
      functionCode: 15,
      address: 0x0013,
      values: [1, 0, 1, 1, 0, 0, 1, 1, 1, 0],
    })
    expect(frame.ok).toBe(true)
    if (frame.ok)
      expect(hexOf(frame.bytes)).toBe('01 0F 00 13 00 0A 02 CD 01 72 CB')
  })

  it('写多个寄存器：字节数 = 数量 × 2', () => {
    const frame = buildModbusRequest({
      mode: 'rtu',
      unitId: 1,
      functionCode: 16,
      address: 0,
      values: [0x000A, 0x0102],
    })
    expect(frame.ok).toBe(true)
    if (frame.ok)
      expect(hexOf(frame.bytes)).toBe('01 10 00 00 00 02 04 00 0A 01 02 53 FC')
  })

  it('单元号 0（广播）也能组帧', () => {
    const frame = buildModbusRequest({ mode: 'rtu', unitId: 0, functionCode: 3, address: 0, quantity: 1 })
    expect(frame.ok).toBe(true)
    if (frame.ok)
      expect(frame.bytes[0]).toBe(0)
  })

  it('cRC 结果同时以数值形式给出，便于界面显示', () => {
    const frame = buildModbusRequest({ mode: 'rtu', unitId: 1, functionCode: 3, address: 0, quantity: 10 })
    expect(frame.ok && frame.crc).toBe(0xCDC5n)
  })
})

describe('tCP 组帧', () => {
  it('mBAP 长度字段 = 单元号 + PDU（本例 6）', () => {
    const frame = buildModbusRequest({
      mode: 'tcp',
      unitId: 1,
      functionCode: 3,
      address: 0,
      quantity: 10,
      transactionId: 1,
    })
    expect(frame.ok).toBe(true)
    if (frame.ok)
      expect(hexOf(frame.bytes)).toBe('00 01 00 00 00 06 01 03 00 00 00 0A')
  })

  it('事务号可自定义，且在大端高位', () => {
    const frame = buildModbusRequest({
      mode: 'tcp',
      unitId: 0x11,
      functionCode: 6,
      address: 1,
      values: [3],
      transactionId: 0x1234,
    })
    expect(frame.ok).toBe(true)
    if (frame.ok) {
      expect(frame.bytes[0]).toBe(0x12)
      expect(frame.bytes[1]).toBe(0x34)
      // TCP 帧不带 CRC，长度 = 1 + 5
      expect([...frame.bytes.slice(4, 6)]).toEqual([0x00, 0x06])
      expect(frame.crc).toBeUndefined()
    }
  })
})

describe('参数校验（返回错误码，不抛异常）', () => {
  it('单元号超出 0-255', () => {
    expect(buildModbusRequest({ mode: 'rtu', unitId: 256, functionCode: 3, address: 0, quantity: 1 }))
      .toMatchObject({ ok: false, code: 'badUnitId' })
  })

  it('地址超出 0-65535', () => {
    expect(buildModbusRequest({ mode: 'rtu', unitId: 1, functionCode: 3, address: 65536, quantity: 1 }))
      .toMatchObject({ ok: false, code: 'badAddress' })
  })

  it('读寄存器数量超过 125', () => {
    expect(buildModbusRequest({ mode: 'rtu', unitId: 1, functionCode: 3, address: 0, quantity: 126 }))
      .toMatchObject({ ok: false, code: 'badQuantity' })
    expect(MODBUS_LIMITS[3].max).toBe(125)
  })

  it('读线圈数量上限是 2000，写多个线圈上限是 1968', () => {
    expect(buildModbusRequest({ mode: 'rtu', unitId: 1, functionCode: 1, address: 0, quantity: 2001 }))
      .toMatchObject({ ok: false, code: 'badQuantity' })
    expect(MODBUS_LIMITS[1].max).toBe(2000)
    expect(MODBUS_LIMITS[15].max).toBe(1968)
  })

  it('数量为 0', () => {
    expect(buildModbusRequest({ mode: 'rtu', unitId: 1, functionCode: 3, address: 0, quantity: 0 }))
      .toMatchObject({ ok: false, code: 'badQuantity' })
  })

  it('写多个但没给值', () => {
    expect(buildModbusRequest({ mode: 'rtu', unitId: 1, functionCode: 16, address: 0, values: [] }))
      .toMatchObject({ ok: false, code: 'emptyValues' })
  })

  it('寄存器值超过 0xFFFF', () => {
    expect(buildModbusRequest({ mode: 'rtu', unitId: 1, functionCode: 6, address: 0, values: [0x10000] }))
      .toMatchObject({ ok: false, code: 'badValue' })
  })

  it('线圈值只能是 0 / 1', () => {
    expect(buildModbusRequest({ mode: 'rtu', unitId: 1, functionCode: 5, address: 0, values: [2] }))
      .toMatchObject({ ok: false, code: 'badValue' })
  })

  it('tCP 事务号超出 0-65535', () => {
    expect(buildModbusRequest({ mode: 'tcp', unitId: 1, functionCode: 3, address: 0, quantity: 1, transactionId: 70000 }))
      .toMatchObject({ ok: false, code: 'badTransactionId' })
  })
})

describe('解析', () => {
  it('拆 RTU 帧：字段齐全且 CRC 校验通过', () => {
    const result = parseModbusFrame(hex('01 03 00 00 00 0A C5 CD'), 'rtu')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.crc).toEqual({ value: 0xCDC5n, valid: true })
      const keys = result.fields.map(field => field.key)
      expect(keys).toContain('unitId')
      expect(keys).toContain('function')
    }
  })

  it('cRC 被改过时标记为 invalid，但仍然把帧拆出来', () => {
    const result = parseModbusFrame(hex('01 03 00 00 00 0A C5 CE'), 'rtu')
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.crc?.valid).toBe(false)
  })

  it('拆 TCP 帧', () => {
    const result = parseModbusFrame(hex('00 01 00 00 00 06 01 03 00 00 00 0A'), 'tcp')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.fields.find(field => field.key === 'transactionId')?.value).toBe('1')
      expect(result.fields.find(field => field.key === 'length')?.value).toBe('6')
    }
  })

  it('tCP 协议号非 0 报错', () => {
    expect(parseModbusFrame(hex('00 01 00 01 00 06 01 03 00 00 00 0A'), 'tcp'))
      .toMatchObject({ ok: false, code: 'badProtocolId' })
  })

  it('tCP 长度字段与实际字节数不符报错', () => {
    expect(parseModbusFrame(hex('00 01 00 00 00 09 01 03 00 00 00 0A'), 'tcp'))
      .toMatchObject({ ok: false, code: 'badLength' })
  })

  it('太短报 tooShort', () => {
    expect(parseModbusFrame(hex('01 03'), 'rtu')).toMatchObject({ ok: false, code: 'tooShort' })
    expect(parseModbusFrame(hex('00 01 00 00'), 'tcp')).toMatchObject({ ok: false, code: 'tooShort' })
  })

  it('识别异常响应（功能码最高位置 1）并给出异常码', () => {
    // 01 83 02 + CRC：从站对功能码 3 回了「非法数据地址」
    const result = parseModbusFrame(hex('01 83 02 C0 F1'), 'rtu')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.exception).toBe(2)
      expect(result.fields.find(field => field.key === 'function')?.value).toBe('0x03')
    }
  })
})

describe('组帧 → 拆帧往返', () => {
  const cases = [
    { mode: 'rtu' as const, unitId: 1, functionCode: 3 as const, address: 0x0010, quantity: 8 },
    { mode: 'tcp' as const, unitId: 2, functionCode: 4 as const, address: 0x0100, quantity: 2, transactionId: 7 },
    { mode: 'rtu' as const, unitId: 3, functionCode: 6 as const, address: 0x0002, values: [0xBEEF] },
    { mode: 'rtu' as const, unitId: 1, functionCode: 16 as const, address: 0x0000, values: [1, 2, 3] },
  ]

  for (const input of cases) {
    it(`${input.mode.toUpperCase()} fc=${input.functionCode} 组出来的帧能被自己解析`, () => {
      const built = buildModbusRequest(input)
      expect(built.ok).toBe(true)
      if (!built.ok)
        return

      const parsed = parseModbusFrame(built.bytes, input.mode)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) {
        if (input.mode === 'rtu')
          expect(parsed.crc?.valid).toBe(true)
        expect(parsed.fields.find(field => field.key === 'unitId')?.value).toBe(String(input.unitId))
      }
    })
  }
})
