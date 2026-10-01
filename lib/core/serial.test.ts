import { describe, expect, it } from 'vitest'
import {
  bytesToText,
  formatByteCount,
  formatClockTime,
  formatHex,
  PacketAssembler,
  parseHexInput,
  textToBytes,
} from './serial'

describe('parseHexInput', () => {
  it('宽松接受空格 / 换行 / 逗号 / 短横线 / 冒号分隔', () => {
    for (const input of ['01 02 FF', '01,02,FF', '01\n02\nFF', '01-02-FF', '01:02:FF', ' 0102FF ']) {
      const result = parseHexInput(input)
      expect(result.ok, input).toBe(true)
      if (result.ok)
        expect([...result.bytes], input).toEqual([1, 2, 255])
    }
  })

  it('支持 0x / \\x 前缀', () => {
    const result = parseHexInput('0x0A\\x0B 0xC0')
    expect(result.ok).toBe(true)
    if (result.ok)
      expect([...result.bytes]).toEqual([0x0A, 0x0B, 0xC0])
  })

  it('大小写都接受', () => {
    const lower = parseHexInput('deadbeef')
    const upper = parseHexInput('DEADBEEF')
    expect(lower.ok && upper.ok).toBe(true)
    if (lower.ok && upper.ok)
      expect([...lower.bytes]).toEqual([...upper.bytes])
  })

  it('空输入报 empty', () => {
    expect(parseHexInput('')).toEqual({ ok: false, code: 'empty' })
    expect(parseHexInput('   ')).toEqual({ ok: false, code: 'empty' })
    expect(parseHexInput('0x')).toEqual({ ok: false, code: 'empty' })
  })

  it('奇数个数字报 oddLength', () => {
    expect(parseHexInput('ABC')).toEqual({ ok: false, code: 'oddLength' })
    expect(parseHexInput('1 2 3')).toEqual({ ok: false, code: 'oddLength' })
  })

  it('非法字符报 badChar 并指出字符', () => {
    const result = parseHexInput('01 02 ZZ')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('badChar')
      expect(result.detail).toBe('Z')
    }
    expect(parseHexInput('中文')).toMatchObject({ ok: false, code: 'badChar' })
  })

  it('边界字节 00 / FF 正确', () => {
    const result = parseHexInput('00FF')
    expect(result.ok).toBe(true)
    if (result.ok)
      expect([...result.bytes]).toEqual([0, 255])
  })
})

describe('formatHex', () => {
  it('默认大写、空格分隔、两位补零', () => {
    expect(formatHex(Uint8Array.from([0, 1, 15, 16, 255]))).toBe('00 01 0F 10 FF')
  })

  it('可切小写与自定义分隔符', () => {
    expect(formatHex(Uint8Array.from([0xAB, 0xCD]), { uppercase: false })).toBe('ab cd')
    expect(formatHex(Uint8Array.from([1, 2, 3]), { separator: '' })).toBe('010203')
    expect(formatHex(Uint8Array.from([1, 2]), { separator: '-' })).toBe('01-02')
  })

  it('空数组得到空串', () => {
    expect(formatHex(Uint8Array.from([]))).toBe('')
  })

  it('与 parseHexInput 互为逆运算', () => {
    const bytes = Uint8Array.from([0x12, 0x34, 0xAB, 0x00])
    const parsed = parseHexInput(formatHex(bytes))
    expect(parsed.ok).toBe(true)
    if (parsed.ok)
      expect([...parsed.bytes]).toEqual([...bytes])
  })
})

describe('文本与字节互转', () => {
  it('中文往返（UTF-8 多字节）', () => {
    const bytes = textToBytes('温度 25.6℃')
    expect(bytes.length).toBeGreaterThan('温度 25.6℃'.length)
    expect(bytesToText(bytes)).toBe('温度 25.6℃')
  })

  it('aSCII 往返', () => {
    expect(bytesToText(textToBytes('AT+GMR\r\n'))).toBe('AT+GMR\r\n')
  })

  it('非法 UTF-8 序列显示为替换字符，不抛异常', () => {
    expect(bytesToText(Uint8Array.from([0xFF, 0xFE]))).toBe('\uFFFD\uFFFD')
  })
})

describe('formatClockTime', () => {
  it('补零到 HH:MM:SS.mmm', () => {
    expect(formatClockTime(new Date(2026, 0, 2, 3, 4, 5, 6))).toBe('03:04:05.006')
    expect(formatClockTime(new Date(2026, 0, 2, 23, 59, 59, 999))).toBe('23:59:59.999')
  })
})

describe('formatByteCount', () => {
  it('小于 1KB 显示 B', () => {
    expect(formatByteCount(0)).toBe('0 B')
    expect(formatByteCount(1023)).toBe('1023 B')
  })

  it('按 1024 进位', () => {
    expect(formatByteCount(1024)).toBe('1.0 KB')
    expect(formatByteCount(1536)).toBe('1.5 KB')
    expect(formatByteCount(1024 * 1024)).toBe('1.0 MB')
    expect(formatByteCount(1024 ** 3)).toBe('1.0 GB')
  })
})

describe('packetAssembler 分包合并', () => {
  it('间隔小于 gap 的多段合并成一包', () => {
    const assembler = new PacketAssembler(50)
    assembler.push([1, 2], 1000)
    assembler.push([3], 1020)
    expect(assembler.pendingBytes).toBe(3)
    expect(assembler.poll(1030)).toBeNull()
    const packet = assembler.poll(1070)
    expect(packet && [...packet]).toEqual([1, 2, 3])
    expect(assembler.pendingBytes).toBe(0)
  })

  it('间隔超过 gap 后先到的数据先出来', () => {
    const assembler = new PacketAssembler(50)
    assembler.push([0xAA], 1000)
    const first = assembler.poll(1050)
    expect(first && [...first]).toEqual([0xAA])
    assembler.push([0xBB], 2000)
    const second = assembler.poll(2050)
    expect(second && [...second]).toEqual([0xBB])
  })

  it('gap 为 0 时立即可取（不合并）', () => {
    const assembler = new PacketAssembler(0)
    assembler.push([1], 1000)
    expect([...(assembler.poll(1000) ?? [])]).toEqual([1])
    expect(assembler.poll(1000)).toBeNull()
  })

  it('空缓冲区 poll 返回 null', () => {
    expect(new PacketAssembler(50).poll(9999)).toBeNull()
  })

  it('flush 立即取出并清空', () => {
    const assembler = new PacketAssembler(50)
    assembler.push([9, 8], 1000)
    expect([...(assembler.flush() ?? [])]).toEqual([9, 8])
    expect(assembler.flush()).toBeNull()
  })

  it('reset 丢弃缓冲区', () => {
    const assembler = new PacketAssembler(50)
    assembler.push([1, 2, 3], 1000)
    assembler.reset()
    expect(assembler.pendingBytes).toBe(0)
    expect(assembler.poll(9999)).toBeNull()
  })

  it('累计超过 255 的字节保持原值（不溢出）', () => {
    const assembler = new PacketAssembler(0)
    assembler.push(Uint8Array.from([0xFF, 0x00, 0xFE]), 0)
    const packet = assembler.poll(0)
    expect(packet && [...packet]).toEqual([0xFF, 0x00, 0xFE])
  })
})
