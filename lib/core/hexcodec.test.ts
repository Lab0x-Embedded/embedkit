import { describe, expect, it } from 'vitest'
import {
  decodeBytes,
  encodeText,
  formatHexBytes,
  formatHexDump,
  parseCArray,
  toCArray,
} from './hexcodec'
import { formatHex } from './serial'

const bytesOf = (...values: number[]) => Uint8Array.from(values)

describe('encodeText / decodeBytes', () => {
  it('utf8 支持中文往返（一个字 3 字节）', () => {
    const bytes = encodeText('温度 25.6℃', 'utf8')
    expect(bytes.length).toBeGreaterThan('温度 25.6℃'.length)
    expect(decodeBytes(bytes, 'utf8')).toBe('温度 25.6℃')
  })

  it('latin1 一个字符一个字节，往返无损', () => {
    const text = 'ABC\u00FF\u0080'
    const bytes = encodeText(text, 'latin1')
    expect([...bytes]).toEqual([0x41, 0x42, 0x43, 0xFF, 0x80])
    expect(decodeBytes(bytes, 'latin1')).toBe(text)
  })

  it('latin1 遇到超过 0xFF 的字符按低 8 位截断（不抛异常）', () => {
    expect([...encodeText('中', 'latin1')]).toEqual([0x2D])
  })

  it('utf8 解码非法字节序列时显示替换字符，不抛异常', () => {
    expect(decodeBytes(bytesOf(0xFF, 0xFE), 'utf8')).toBe('\uFFFD\uFFFD')
  })
})

describe('formatHexBytes', () => {
  it('默认大写、空格分隔、无前缀', () => {
    expect(formatHexBytes(bytesOf(0x0A, 0xFF))).toBe('0A FF')
  })

  it('可切小写与自定义分隔符', () => {
    expect(formatHexBytes(bytesOf(0x0A, 0xFF), { uppercase: false, separator: '' })).toBe('0aff')
  })

  it('前缀是 0x 而不是被大写的 0X（大小写只作用于数字）', () => {
    expect(formatHexBytes(bytesOf(0xAB), { prefix: true })).toBe('0xAB')
    expect(formatHexBytes(bytesOf(0xAB), { prefix: true, uppercase: false })).toBe('0xab')
  })

  it('源实现 formatHex 同样保证 0x 前缀小写', () => {
    expect(formatHex(bytesOf(0xAB), { prefix: true })).toBe('0xAB')
    expect(formatHex(bytesOf(0xAB), { prefix: true, uppercase: false, separator: ', ' })).toBe('0xab')
  })
})

describe('toCArray', () => {
  it('默认变量名 buf、每行 12 个、带 0x 前缀', () => {
    const text = toCArray(bytesOf(...Array.from({ length: 13 }, (_, i) => i)))
    expect(text.split('\n')[0]).toBe('const uint8_t buf[] = {')
    expect(text).toContain('  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,')
    expect(text).toContain('  0x0C,')
    expect(text.endsWith('};')).toBe(true)
    expect(text.split('\n')).toHaveLength(4)
  })

  it('可改名字、每行个数、大小写', () => {
    const text = toCArray(bytesOf(0xDE, 0xAD), { name: 'payload', perLine: 1, uppercase: false })
    expect(text).toBe('const uint8_t payload[] = {\n  0xde,\n  0xad,\n};')
  })

  it('空输入生成合法的空数组', () => {
    expect(toCArray(bytesOf())).toBe('const uint8_t buf[] = {};')
  })
})

describe('parseCArray', () => {
  it('能把 toCArray 的输出原样读回来（往返性质）', () => {
    const bytes = Uint8Array.from({ length: 40 }, (_, i) => (i * 7) & 0xFF)
    const result = parseCArray(toCArray(bytes, { perLine: 8 }))
    expect(result.ok).toBe(true)
    if (result.ok)
      expect([...result.bytes]).toEqual([...bytes])
  })

  it('容忍没花括号的裸字节表、0b 前缀、十进制', () => {
    const result = parseCArray('0x01 2 0b00000011\n0x04')
    expect(result).toEqual({ ok: true, bytes: bytesOf(1, 2, 3, 4) })
  })

  it('忽略行注释与块注释', () => {
    const source = `const uint8_t x[] = {
      0x01, // 帧头
      /* 长度 */ 0x02,
    };`
    expect(parseCArray(source)).toEqual({ ok: true, bytes: bytesOf(1, 2) })
  })

  it('空输入报 empty', () => {
    expect(parseCArray('  \n ')).toEqual({ ok: false, code: 'empty' })
    expect(parseCArray('const uint8_t x[] = {};')).toEqual({ ok: false, code: 'empty' })
  })

  it('非法 token 报 badToken 并指出内容', () => {
    expect(parseCArray('0x01, zz')).toEqual({ ok: false, code: 'badToken', detail: 'zz' })
  })

  it('超过一字节报 outOfRange', () => {
    expect(parseCArray('0x01, 0x100')).toEqual({ ok: false, code: 'outOfRange', detail: '0x100' })
    expect(parseCArray('256')).toEqual({ ok: false, code: 'outOfRange', detail: '256' })
  })
})

describe('formatHexDump', () => {
  it('按 xxd 风格输出：偏移 + HEX + |文本|', () => {
    const dump = formatHexDump(bytesOf(0x41, 0x00, 0xFF, 0x42), 4)
    expect(dump).toBe('00000000  41 00  FF 42  |A..B|')
  })

  it('第 8 列后多一个空格，非可打印字节显示为 .', () => {
    const dump = formatHexDump(bytesOf(...Array.from({ length: 10 }, (_, i) => 0x41 + i)), 16)
    expect(dump.startsWith('00000000  41 42 43 44 45 46 47 48  49 4A')).toBe(true)
    expect(dump.endsWith('|ABCDEFGHIJ|')).toBe(true)
  })

  it('超过一行时偏移按 16 进制递增', () => {
    const dump = formatHexDump(Uint8Array.from({ length: 17 }, () => 0x41), 16)
    const lines = dump.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0].startsWith('00000000')).toBe(true)
    expect(lines[1].startsWith('00000010')).toBe(true)
    // 不足一行时用空格补齐，第二行只有 1 个字节
    expect(lines[1]).toContain('41')
    expect(lines[1].endsWith('|A|')).toBe(true)
  })

  it('空输入得到空串', () => {
    expect(formatHexDump(bytesOf())).toBe('')
  })
})
