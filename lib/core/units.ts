import Decimal from 'decimal.js'

/**
 * 单位换算核心（纯函数，无 React / DOM 依赖）
 *
 * 覆盖嵌入式调试最常用的几组换算：
 *  - 频率 ↔ 周期（T = 1/f，两边单位都能当输入）
 *  - 存储容量（嵌入式内存严格按 1024 进制）
 *  - 通信速率（bit 类单位严格按 1000 进制，bit 与 Byte 隐含 ×8）
 *  - 电压 / 电流（1000 进制阶梯）
 *  - ADC 原始值 ↔ 电压
 *
 * 数值运算一律用 Decimal，不经过 Number —— 与 radix.ts 用 BigInt 是同一条约定：
 * 1/1e-9 这类除法在 double 里是 999999999.9999999，在十进制里就是精确的 1e9。
 * 阶跃表全部写字符串常量（'0.001'），不写 1e-3，避免 double 误差混进精确换算。
 * 除法结果最多保留 20 位有效数字（decimal.js 默认精度），展示层用 formatNumber 收敛。
 *
 * ADC 的满量程映射取 V = raw ÷ (2ⁿ−1) × Vref，与 STM32 参考手册
 * （12 位满量程 4095 对应 Vref）一致；换算的前置条件（value > 0、
 * raw 为整数且不越界）由 UI 层校验，这里只做计算与夹取。
 */

// ---------------------------------------------------------------------------
// 输入解析：字符串 → Decimal
// ---------------------------------------------------------------------------

export type ParsedInput
  = | { ok: true, value: Decimal }
    | { ok: false, reason: 'empty' | 'invalid' }

/**
 * 统一的输入解析。直接接 Decimal 构造器的能力：
 * '115200'、'0.001'、'1e9' 都认；空串是 empty，其余解析不了或是 NaN / Infinity 是 invalid。
 * 负数不在这里拦 —— 各换算的值域不同，由调用方按需检查（gt(0)、整数、范围）。
 */
export function parseDecimal(text: string): ParsedInput {
  const trimmed = text.trim()
  if (trimmed === '')
    return { ok: false, reason: 'empty' }
  try {
    const value = new Decimal(trimmed)
    return value.isFinite() ? { ok: true, value } : { ok: false, reason: 'invalid' }
  }
  catch {
    return { ok: false, reason: 'invalid' }
  }
}

// ---------------------------------------------------------------------------
// 频率与周期：T = 1/f
// ---------------------------------------------------------------------------

export type FreqUnit = 'Hz' | 'kHz' | 'MHz' | 'GHz'
export type TimeUnit = 's' | 'ms' | 'μs' | 'ns'
/** 频率与周期共用一套输入框：任意一边都能当输入 */
export type FreqTimeUnit = FreqUnit | TimeUnit

export const FREQ_STEPS: Record<FreqUnit, Decimal> = {
  Hz: new Decimal('1'),
  kHz: new Decimal('1000'),
  MHz: new Decimal('1000000'),
  GHz: new Decimal('1000000000'),
}
export const TIME_STEPS: Record<TimeUnit, Decimal> = {
  s: new Decimal('1'),
  ms: new Decimal('0.001'),
  μs: new Decimal('0.000001'),
  ns: new Decimal('0.000000001'),
}
export const FREQ_UNITS: FreqUnit[] = ['Hz', 'kHz', 'MHz', 'GHz']
export const TIME_UNITS: TimeUnit[] = ['s', 'ms', 'μs', 'ns']
export const FREQ_TIME_UNITS: FreqTimeUnit[] = [...FREQ_UNITS, ...TIME_UNITS]

export function isFreqUnit(unit: FreqTimeUnit): unit is FreqUnit {
  return unit in FREQ_STEPS
}

/** 换算到 Hz：时间单位按「这个周期对应的频率」进来了 */
export function toHertz(value: Decimal, unit: FreqTimeUnit): Decimal {
  return isFreqUnit(unit)
    ? value.times(FREQ_STEPS[unit])
    : new Decimal(1).div(value.times(TIME_STEPS[unit]))
}

/** 换算到 s：频率单位按「这个频率对应的周期」进来了 */
export function toSeconds(value: Decimal, unit: FreqTimeUnit): Decimal {
  return isFreqUnit(unit)
    ? new Decimal(1).div(value.times(FREQ_STEPS[unit]))
    : value.times(TIME_STEPS[unit])
}

// ---------------------------------------------------------------------------
// 存储容量：严格 1024 进制（嵌入式内存与 Flash 的口径）
// ---------------------------------------------------------------------------

export type StorageUnit = 'bit' | 'B' | 'KB' | 'MB' | 'GB' | 'TB'

/** 一律先换到 bit（KB/MB/GB 是 1024 进制的口语单位，不做 KiB 二分） */
export const STORAGE_STEPS: Record<StorageUnit, Decimal> = {
  bit: new Decimal('1'),
  B: new Decimal('8'),
  KB: new Decimal('8192'),
  MB: new Decimal('8388608'),
  GB: new Decimal('8589934592'),
  TB: new Decimal('8796093022208'),
}
export const STORAGE_UNITS: StorageUnit[] = ['bit', 'B', 'KB', 'MB', 'GB', 'TB']

export function toBits(value: Decimal, unit: StorageUnit): Decimal {
  return value.times(STORAGE_STEPS[unit])
}

// ---------------------------------------------------------------------------
// 通信速率：bit 类严格 1000 进制（SI 口径），1 B/s = 8 bps
// ---------------------------------------------------------------------------

export type RateUnit = 'bps' | 'kbps' | 'Mbps' | 'Gbps' | 'B/s' | 'KB/s' | 'MB/s' | 'GB/s'

/** 一律先换到 bps；Byte 类单位在阶跃里隐含 ×8 */
export const RATE_STEPS: Record<RateUnit, Decimal> = {
  'bps': new Decimal('1'),
  'kbps': new Decimal('1000'),
  'Mbps': new Decimal('1000000'),
  'Gbps': new Decimal('1000000000'),
  'B/s': new Decimal('8'),
  'KB/s': new Decimal('8000'),
  'MB/s': new Decimal('8000000'),
  'GB/s': new Decimal('8000000000'),
}
export const RATE_UNITS: RateUnit[] = ['bps', 'kbps', 'Mbps', 'Gbps', 'B/s', 'KB/s', 'MB/s', 'GB/s']

export function toBps(value: Decimal, unit: RateUnit): Decimal {
  return value.times(RATE_STEPS[unit])
}

// ---------------------------------------------------------------------------
// 电压 / 电流：1000 进制阶梯，按单位判断量纲
// ---------------------------------------------------------------------------

export type ElectricUnit = 'V' | 'mV' | 'μV' | 'A' | 'mA' | 'μA'

/** V 与 A 各自是 1，m/micro 前缀共用阶梯；V 和 A 之间不做换算 */
export const ELECTRIC_STEPS: Record<ElectricUnit, Decimal> = {
  V: new Decimal('1'),
  mV: new Decimal('0.001'),
  μV: new Decimal('0.000001'),
  A: new Decimal('1'),
  mA: new Decimal('0.001'),
  μA: new Decimal('0.000001'),
}
export const ELECTRIC_UNITS: ElectricUnit[] = ['V', 'mV', 'μV', 'A', 'mA', 'μA']

export type ElectricFamily = 'voltage' | 'current'

export function electricFamily(unit: ElectricUnit): ElectricFamily {
  return unit === 'A' || unit === 'mA' || unit === 'μA' ? 'current' : 'voltage'
}

export function toBaseElectric(value: Decimal, unit: ElectricUnit): Decimal {
  return value.times(ELECTRIC_STEPS[unit])
}

// ---------------------------------------------------------------------------
// ADC：原始值 ↔ 电压（满量程 2ⁿ−1 映射）
// ---------------------------------------------------------------------------

export const ADC_BIT_WIDTHS = [8, 10, 12, 16, 24] as const
export type AdcBits = (typeof ADC_BIT_WIDTHS)[number]

function fullScale(bits: number): Decimal {
  return new Decimal(2).pow(bits).minus(1)
}

export function adcToVoltage(raw: Decimal, vref: Decimal, bits: number): Decimal {
  return raw.times(vref).div(fullScale(bits))
}

/** 1 LSB 对应的电压步进 */
export function adcLsb(vref: Decimal, bits: number): Decimal {
  return vref.div(fullScale(bits))
}

export interface AdcFromVoltage {
  /** 理论码值（未取整，供参考） */
  exact: Decimal
  /** 四舍五入并夹到 0 ~ 2ⁿ−1 之后的码值（最大 2²⁴−1，远在 Number 安全整数内） */
  code: number
}

export function voltageToAdcCode(voltage: Decimal, vref: Decimal, bits: number): AdcFromVoltage {
  const scale = fullScale(bits)
  const exact = voltage.div(vref).times(scale)
  const code = Decimal.min(scale, Decimal.max(0, exact.toDecimalPlaces(0)))
  return { exact, code: code.toNumber() }
}

// ---------------------------------------------------------------------------
// 数字格式化：收敛除法的长尾巴，超常量级由 toString 自转指数记法
// ---------------------------------------------------------------------------

/**
 * 换算结果的统一展示格式：
 *  - 整数原样输出（乘法与整除都是精确的：1 GB = 1073741824 B 不丢「精确整数」这个信息）
 *  - 其余保留 6 位有效数字（13.888888…ns 显示成 13.8889）
 *  - 极大 / 极小量级由 Decimal.toString 自转指数记法（1e-10 这类不铺一长串零）
 * 非法输入（NaN / Infinity）返回空串，由调用方决定展示什么。
 */
export function formatNumber(value: Decimal): string {
  if (!value.isFinite())
    return ''
  if (value.isZero())
    return '0'
  if (value.isInteger())
    return value.toString()
  return value.toSignificantDigits(6).toString()
}
