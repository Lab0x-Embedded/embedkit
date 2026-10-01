import type { ParseResult, ParseSuccess } from './radix'
import { describe, expect, it } from 'vitest'
import {
  byteOrder,
  convertAll,
  format,
  interpret,
  normalize,
  parseInput,
  RADIX_ROWS,
  WIDTHS,
} from './radix'

/** 断言解析成功并收窄类型（expect 不会给 TS 收窄） */
function expectOk(result: ParseResult): ParseSuccess {
  if (!result.ok)
    throw new Error(`期望解析成功，实际失败：${result.code}`)
  return result
}

describe('normalize', () => {
  it('去掉空格 / 下划线 / 逗号', () => {
    expect(normalize('0x1F 2A_3,4')).toBe('0x1F2A34')
  })

  it('全角转半角', () => {
    expect(normalize('０ｘ１Ｆ')).toBe('0x1F')
  })

  it('非字符串返回空串', () => {
    expect(normalize(null)).toBe('')
    expect(normalize(undefined)).toBe('')
    expect(normalize(42)).toBe('')
  })
})

describe('parseInput 前缀识别', () => {
  it('十六进制', () => {
    const r = expectOk(parseInput('0x7FFFFFFF'))
    expect(r.radix).toBe(16)
    expect(r.value).toBe(2147483647n)
  })

  it('大写前缀 0X', () => {
    expect(expectOk(parseInput('0X1F')).value).toBe(31n)
  })

  it('二进制与八进制', () => {
    expect(expectOk(parseInput('0b1010_1010')).value).toBe(170n)
    expect(expectOk(parseInput('0o777')).value).toBe(511n)
  })

  it('无前缀按十进制', () => {
    expect(expectOk(parseInput('123')).value).toBe(123n)
    expect(expectOk(parseInput('123')).radix).toBe(10)
  })
})

describe('parseInput 数值处理', () => {
  it('负数与正号', () => {
    expect(expectOk(parseInput('-42')).value).toBe(-42n)
    expect(expectOk(parseInput('+42')).value).toBe(42n)
    expect(expectOk(parseInput('-0x10')).value).toBe(-16n)
  })

  it('全角输入等价于半角', () => {
    expect(expectOk(parseInput('０ｘ１Ｆ')).value).toBe(31n)
  })

  it('允许空格 / 下划线分隔', () => {
    expect(expectOk(parseInput('0x12 34_56')).value).toBe(0x123456n)
  })

  it('大数不丢精度', () => {
    expect(expectOk(parseInput('0xFFFFFFFFFFFFFFFF')).value).toBe(18446744073709551615n)
    expect(expectOk(parseInput('0xFFFFFFFFFFFFFFFFF')).value).toBe(295147905179352825855n)
  })
})

describe('parseInput 手动进制', () => {
  it('forcedRadix 允许无前缀输入', () => {
    const r = expectOk(parseInput('FF', 16))
    expect(r.value).toBe(255n)
    expect(r.radix).toBe(16)
  })

  it('前缀与 forcedRadix 冲突时报 prefixMismatch', () => {
    const r = parseInput('0x10', 10)
    expect(r.ok).toBe(false)
    if (r.ok)
      return
    expect(r.code).toBe('prefixMismatch')
    expect(r.detail).toBe('x')
  })
})

describe('parseInput 错误处理（不抛异常）', () => {
  it('非法字符：错误码 badDigit 并指出字符', () => {
    const r = parseInput('0xZZ')
    expect(r.ok).toBe(false)
    if (r.ok)
      return
    expect(r.code).toBe('badDigit')
    expect(r.detail).toBe('Z')
  })

  it('八进制不接受 8', () => {
    const r = parseInput('0o8')
    expect(r.ok).toBe(false)
    if (r.ok)
      return
    expect(r.code).toBe('badDigit')
    expect(r.detail).toBe('8')
  })

  it('纯字母与空输入', () => {
    expect(parseInput('hello').ok).toBe(false)
    expect(parseInput('').ok).toBe(false)
    expect(parseInput('   ').ok).toBe(false)
    expect(parseInput('hello')).toEqual({ ok: false, code: 'badDigit', detail: 'h', radix: 10 })
  })

  it('只有前缀没有数字', () => {
    const r = parseInput('0x')
    expect(r.ok).toBe(false)
    if (r.ok)
      return
    expect(r.code).toBe('noDigits')
    expect(r.radix).toBe(16)
  })

  it('只有符号没有数字', () => {
    expect(parseInput('-').ok).toBe(false)
  })
})

describe('format', () => {
  it('二进制按 4 位分组', () => {
    expect(format(0b10101010n, 2, { group: true })).toBe('1010 1010')
  })

  it('十六进制按字节分组', () => {
    expect(format(0x12345678n, 16, { group: true })).toBe('12 34 56 78')
  })

  it('八进制按 3 位分组（右侧起切）', () => {
    expect(format(0o17777777777n, 8, { group: true })).toBe('17 777 777 777')
  })

  it('可按位宽补零', () => {
    expect(format(0x0Fn, 2, { padWidth: 16, group: true })).toBe('0000 0000 0000 1111')
    expect(format(0x0Fn, 16, { padWidth: 4, uppercase: true })).toBe('000F')
  })

  it('十进制不分组', () => {
    expect(format(4294967295n, 10, { group: true })).toBe('4294967295')
  })

  it('负数保留符号', () => {
    expect(format(-16n, 16)).toBe('-10')
    expect(format(-170n, 2, { group: true })).toBe('-1010 1010')
  })
})

describe('convertAll', () => {
  it('一次给出四种进制，顺序稳定 [HEX, DEC, BIN, OCT]', () => {
    const r = convertAll('0x7FFFFFFF')
    expect(r.ok).toBe(true)
    if (!r.ok)
      return
    expect(r.radix).toBe(16)
    expect(r.rows.map(x => x.radix)).toEqual([16, 10, 2, 8])
    expect(r.rows.map(x => x.key)).toEqual(['hex', 'dec', 'bin', 'oct'])
    expect(r.rows[1].raw).toBe('2147483647')
    expect(r.rows[3].raw).toBe('17777777777')
  })

  it('显示值带分隔符、复制值不带', () => {
    const r = convertAll('0xAA')
    if (!r.ok)
      throw new Error('应当成功')
    const bin = r.rows.find(x => x.radix === 2)
    expect(bin?.display).toBe('1010 1010')
    expect(bin?.raw).toBe('10101010')
  })

  it('源进制行被标记', () => {
    const hex = convertAll('0xFF')
    const dec = convertAll('255')
    const bin = convertAll('0b101')
    if (!hex.ok || !dec.ok || !bin.ok)
      throw new Error('应当成功')
    expect(hex.rows.find(x => x.isSource)?.radix).toBe(16)
    expect(dec.rows.find(x => x.isSource)?.radix).toBe(10)
    expect(bin.rows.find(x => x.isSource)?.radix).toBe(2)
  })

  it('非法输入原样返回失败结果', () => {
    const r = convertAll('abc')
    expect(r.ok).toBe(false)
    if (r.ok)
      return
    expect(r.code).toBe('badDigit')
  })

  it('四条行数据的 label 与语言无关', () => {
    expect(RADIX_ROWS.map(r => r.label)).toEqual(['HEX', 'DEC', 'BIN', 'OCT'])
  })
})

describe('interpret 位宽与符号', () => {
  it('0xFFFFFFFF 在 32 位下：无符号 4294967295 / 有符号 -1', () => {
    const r = interpret(0xFFFFFFFFn, 32)
    expect(r.unsigned).toBe('4294967295')
    expect(r.signed).toBe('-1')
    expect(r.signBitSet).toBe(true)
  })

  it('0x7FFFFFFF 在 32 位下符号位为 0', () => {
    const r = interpret(0x7FFFFFFFn, 32)
    expect(r.unsigned).toBe('2147483647')
    expect(r.signed).toBe('2147483647')
    expect(r.signBitSet).toBe(false)
  })

  it('负数输入先按宽度取补码', () => {
    const r = interpret(-1n, 16)
    expect(r.unsigned).toBe('65535')
    expect(r.hex).toBe('FF FF')
    expect(r.bin).toBe('1111 1111 1111 1111')
  })

  it('超宽数值按宽度截断', () => {
    expect(interpret(0x1FFn, 8).unsigned).toBe('255')
  })

  it('二进制按位宽补零', () => {
    expect(interpret(0x0Fn, 16).bin).toBe('0000 0000 0000 1111')
  })

  it('64 位边界', () => {
    expect(interpret(0xFFFFFFFFFFFFFFFFn, 64).signed).toBe('-1')
    expect(interpret(0x0102030405060708n, 64).hex).toBe('01 02 03 04 05 06 07 08')
  })

  it('wIDTHS 覆盖 8/16/32/64', () => {
    expect(WIDTHS).toEqual([8, 16, 32, 64])
  })
})

describe('byteOrder 字节序', () => {
  it('0x12345678 → 大端 12 34 56 78 / 小端 78 56 34 12', () => {
    const r = byteOrder(0x12345678n, 32)
    expect(r.bigEndian).toBe('12 34 56 78')
    expect(r.littleEndian).toBe('78 56 34 12')
  })

  it('16 位补零到 2 字节', () => {
    expect(byteOrder(0x0Fn, 16).bigEndian).toBe('00 0f')
  })

  it('64 位', () => {
    expect(byteOrder(0x0102030405060708n, 64).littleEndian).toBe('08 07 06 05 04 03 02 01')
  })

  it('负数按补码取字节', () => {
    expect(byteOrder(-1n, 32).bigEndian).toBe('ff ff ff ff')
  })
})
