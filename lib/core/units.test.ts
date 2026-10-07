import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import {
  adcLsb,
  adcToVoltage,
  electricFamily,
  formatNumber,
  parseDecimal,
  toBaseElectric,
  toBits,
  toBps,
  toHertz,
  toSeconds,
  voltageToAdcCode,
} from './units'

const D = (value: string | number) => new Decimal(value)

/** 浮点时代过去了，但除法仍可能产生 20 位长尾巴，按有效数字比较 */
function same(actual: Decimal, expected: string | Decimal): boolean {
  const target = typeof expected === 'string' ? D(expected) : expected
  return actual.toSignificantDigits(12).eq(target.toSignificantDigits(12))
}

describe('parseDecimal · 统一输入解析', () => {
  it('十进制、科学计数法与首尾空白都认', () => {
    expect(parseDecimal('115200')).toEqual({ ok: true, value: D(115200) })
    expect(parseDecimal(' 0.001 ')).toEqual({ ok: true, value: D('0.001') })
    expect(parseDecimal('1e9')).toEqual({ ok: true, value: D('1e9') })
  })

  it('空串是 empty，其余解析不了的是 invalid', () => {
    expect(parseDecimal('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseDecimal('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(parseDecimal('abc')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseDecimal('1.2.3')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseDecimal('NaN')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseDecimal('Infinity')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('负数不在这一层拦，值域检查留给调用方', () => {
    expect(parseDecimal('-5')).toEqual({ ok: true, value: D(-5) })
  })
})

describe('formatNumber · 长尾巴收敛与量级表示', () => {
  it('常规值：0、整数、小数', () => {
    expect(formatNumber(D(0))).toBe('0')
    expect(formatNumber(D(1))).toBe('1')
    expect(formatNumber(D('1073741824'))).toBe('1073741824')
    expect(formatNumber(D('0.25'))).toBe('0.25')
  })

  it('除法长尾巴收敛到 6 位有效数字', () => {
    expect(formatNumber(D('13.888888888888888889'))).toBe('13.8889')
    expect(formatNumber(D('0.33333333333333333333'))).toBe('0.333333')
    expect(formatNumber(D('1234567.8'))).toBe('1234570')
  })

  it('极小量级转指数记法，极大整数保持十进制', () => {
    expect(formatNumber(D('1e-10'))).toBe('1e-10')
    expect(formatNumber(D('1.25e-10'))).toBe('1.25e-10')
    expect(formatNumber(D('1e15'))).toBe('1000000000000000')
  })

  it('非法输入返回空串', () => {
    expect(formatNumber(D(NaN))).toBe('')
    expect(formatNumber(D(Infinity))).toBe('')
  })
})

describe('频率与周期 · T = 1/f', () => {
  it('频率单位换到 Hz', () => {
    expect(toHertz(D(1), 'Hz').toString()).toBe('1')
    expect(toHertz(D(500), 'kHz').toString()).toBe('500000')
    expect(toHertz(D(1), 'MHz').toString()).toBe('1000000')
    expect(toHertz(D('2.4'), 'GHz').toString()).toBe('2400000000')
  })

  it('时间单位经 toHertz 也能进来：周期 1 ns 的频率精确等于 1 GHz', () => {
    expect(toHertz(D(1), 's').toString()).toBe('1')
    expect(toHertz(D(1), 'ms').toString()).toBe('1000')
    expect(toHertz(D(1), 'μs').toString()).toBe('1000000')
    expect(toHertz(D(1), 'ns').toString()).toBe('1000000000')
  })

  it('频率单位经 toSeconds 得到周期', () => {
    expect(toSeconds(D(1), 'Hz').toString()).toBe('1')
    expect(same(toSeconds(D(72), 'MHz'), D(1).div(72000000))).toBe(true)
    // toString 在指数 ≤ -7 时自转科学计数法，正是展示想要的形态
    expect(toSeconds(D(1), 'GHz').toString()).toBe('1e-9')
  })

  it('时间单位换到秒', () => {
    expect(toSeconds(D(500), 'ms').toString()).toBe('0.5')
    expect(toSeconds(D(1), 'μs').toString()).toBe('0.000001')
    expect(toSeconds(D(2), 'ns').toString()).toBe('2e-9')
  })

  it('往返一致：周期 1/2500 s 的频率是 2.5 kHz', () => {
    expect(same(toHertz(D(1).div(2500), 's').div(D('1000')), D('2.5'))).toBe(true)
  })
})

describe('存储容量 · 严格 1024 进制', () => {
  it('逐级换算都按 1024', () => {
    expect(toBits(D(1), 'bit').toString()).toBe('1')
    expect(toBits(D(1), 'B').toString()).toBe('8')
    expect(toBits(D(1), 'KB').toString()).toBe('8192')
    expect(toBits(D(1), 'MB').toString()).toBe('8388608')
    expect(toBits(D(1), 'GB').toString()).toBe('8589934592')
    expect(toBits(D(1), 'TB').toString()).toBe('8796093022208')
  })

  it('1 GB = 1024 B × 1024 × 1024，不是 10^9 字节', () => {
    expect(toBits(D(1), 'GB').div(8).toString()).toBe('1073741824')
    expect(toBits(D(1), 'GB').div(8).toString()).not.toBe('1000000000')
  })

  it('小数也能换：0.5 KB = 4096 bit', () => {
    expect(toBits(D('0.5'), 'KB').toString()).toBe('4096')
  })
})

describe('通信速率 · 1000 进制 + bit/Byte 差 8 倍', () => {
  it('bit 类单位按 1000 进制', () => {
    expect(toBps(D(115200), 'bps').toString()).toBe('115200')
    expect(toBps(D(1), 'kbps').toString()).toBe('1000')
    expect(toBps(D(1), 'Mbps').toString()).toBe('1000000')
    expect(toBps(D(1), 'Gbps').toString()).toBe('1000000000')
  })

  it('byte 类单位也是 1000 进制，且隐含 ×8', () => {
    expect(toBps(D(1), 'B/s').toString()).toBe('8')
    expect(toBps(D(1), 'KB/s').toString()).toBe('8000')
    expect(toBps(D(1), 'MB/s').toString()).toBe('8000000')
    expect(toBps(D(1), 'GB/s').toString()).toBe('8000000000')
  })

  it('经典值：115200 bps = 14400 B/s = 14.4 KB/s', () => {
    expect(toBps(D(115200), 'bps').div(8).toString()).toBe('14400')
    expect(toBps(D(115200), 'bps').div('8000').toString()).toBe('14.4')
  })

  it('经典值：100 Mbps 的理论上限是 12.5 MB/s', () => {
    expect(toBps(D(100), 'Mbps').div('8000000').toString()).toBe('12.5')
  })
})

describe('电压 / 电流 · 1000 进制阶梯', () => {
  it('电压单位', () => {
    expect(toBaseElectric(D(1), 'V').toString()).toBe('1')
    expect(toBaseElectric(D(1), 'mV').toString()).toBe('0.001')
    expect(toBaseElectric(D(2500), 'μV').toString()).toBe('0.0025')
  })

  it('电流单位与电压同阶梯', () => {
    expect(toBaseElectric(D(1), 'A').toString()).toBe('1')
    expect(toBaseElectric(D(20), 'mA').toString()).toBe('0.02')
    expect(toBaseElectric(D(1), 'μA').toString()).toBe('0.000001')
  })

  it('按单位判断量纲，结果只显示同量纲的行', () => {
    expect(electricFamily('V')).toBe('voltage')
    expect(electricFamily('μV')).toBe('voltage')
    expect(electricFamily('A')).toBe('current')
    expect(electricFamily('mA')).toBe('current')
  })
})

describe('aDC · 原始值 ↔ 电压（满量程 2ⁿ−1 映射）', () => {
  it('满量程码值对应 Vref', () => {
    expect(same(adcToVoltage(D(4095), D('3.3'), 12), D('3.3'))).toBe(true)
    expect(same(adcToVoltage(D(1023), D(5), 10), D(5))).toBe(true)
  })

  it('中间码值线性内插：12 位 2048 ≈ 1.65018 V', () => {
    expect(same(adcToVoltage(D(2048), D('3.3'), 12), D('6758.4').div('4095'))).toBe(true)
  })

  it('1 LSB 的大小', () => {
    expect(same(adcLsb(D('3.3'), 12), D('3.3').div('4095'))).toBe(true)
    expect(same(adcLsb(D(5), 10), D(5).div('1023'))).toBe(true)
  })

  it('电压转码值四舍五入：1.65 V 在 12 位下落在 2048', () => {
    const result = voltageToAdcCode(D('1.65'), D('3.3'), 12)
    expect(result.code).toBe(2048)
    expect(result.exact.toString()).toBe('2047.5')
  })

  it('越界电压被夹在 0 到满量程之间', () => {
    expect(voltageToAdcCode(D('-0.2'), D('3.3'), 12).code).toBe(0)
    expect(voltageToAdcCode(D(9), D('3.3'), 12).code).toBe(4095)
  })

  it('码值 → 电压 → 码值 往返无损', () => {
    const voltage = adcToVoltage(D(1234), D('2.5'), 12)
    expect(voltageToAdcCode(voltage, D('2.5'), 12).code).toBe(1234)
  })

  it('24 位高分辨率也不丢精度', () => {
    expect(voltageToAdcCode(D(1), D(1), 24).code).toBe(2 ** 24 - 1)
    expect(same(adcToVoltage(D(16777215), D('2.048'), 24), D('2.048'))).toBe(true)
  })
})
