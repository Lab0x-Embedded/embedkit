/**
 * 进制转换核心（纯函数，无 React / DOM 依赖）
 *
 * 移植自 ~/dev/github/进制转化工具/src/utils/radix.js（uTools 插件版，逻辑与测试都保留）。
 * 唯一刻意的差异：错误信息不再是中文文案，而是「错误码 + 细节」，
 * 文案统一放 messages/*.json 走 i18n。
 *
 * 仅支持 2 / 8 / 10 / 16 四种进制；数值运算一律用 BigInt，不经过 Number。
 */

export type Radix = 2 | 8 | 10 | 16
export type BitWidth = 8 | 16 | 32 | 64

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const PREFIX_OF: Record<Radix, string> = { 2: '0b', 8: '0o', 10: '', 16: '0x' }
const GROUP_SIZE: Partial<Record<Radix, number>> = { 2: 4, 8: 3, 16: 2 }

export type ParseErrorCode
  = | 'empty' // 空输入
    | 'noDigits' // 只有前缀，没有数字
    | 'badDigit' // 出现该进制不允许的字符（detail = 字符）
    | 'prefixMismatch' // 前缀与手动选择的进制冲突（detail = 前缀字母）
    | 'invalidFormat' // BigInt 也解析不了

export interface ParseError {
  ok: false
  code: ParseErrorCode
  detail?: string
  radix?: Radix
}

export interface ParseSuccess {
  ok: true
  value: bigint
  negative: boolean
  radix: Radix
}

export type ParseResult = ParseSuccess | ParseError

/** 全角→半角，并去掉所有分隔符（空格 / 下划线 / 逗号） */
export function normalize(raw: unknown): string {
  if (typeof raw !== 'string')
    return ''
  return raw
    .replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\s_,]/g, '')
}

function digitValue(ch: string): number {
  return DIGITS.indexOf(ch.toLowerCase())
}

function isRadix(value: number): value is Radix {
  return value === 2 || value === 8 || value === 10 || value === 16
}

/**
 * 解析用户输入。
 * @param raw 原始输入
 * @param forcedRadix 手动指定的进制（此时允许不带前缀）
 */
export function parseInput(raw: unknown, forcedRadix?: Radix): ParseResult {
  const s = normalize(raw)
  if (!s)
    return { ok: false, code: 'empty' }

  let body = s
  let negative = false
  const sign = /^[+-]/.exec(body)
  if (sign) {
    negative = sign[0] === '-'
    body = body.slice(1)
  }
  if (!body)
    return { ok: false, code: 'empty' }

  let radix = forcedRadix ?? 0
  let digits = body

  const prefixed = /^0([xbo])(.*)$/i.exec(body)
  if (prefixed) {
    const letter = prefixed[1].toLowerCase()
    const prefixRadix: Radix = letter === 'x' ? 16 : letter === 'b' ? 2 : 8
    if (radix && radix !== prefixRadix) {
      return {
        ok: false,
        code: 'prefixMismatch',
        detail: letter,
        radix: radix as Radix,
      }
    }
    radix = prefixRadix
    digits = prefixed[2]
  }
  if (!radix)
    radix = 10

  if (!digits)
    return { ok: false, code: 'noDigits', radix: radix as Radix }

  const bad = [...digits].find((ch) => {
    const value = digitValue(ch)
    return value < 0 || value >= radix
  })
  if (bad !== undefined)
    return { ok: false, code: 'badDigit', detail: bad, radix: radix as Radix }

  if (!isRadix(radix))
    return { ok: false, code: 'invalidFormat' }

  try {
    const value = BigInt(PREFIX_OF[radix] + digits.toLowerCase())
    return { ok: true, value: negative ? -value : value, negative, radix }
  }
  catch {
    return { ok: false, code: 'invalidFormat', radix }
  }
}

export type RadixKey = 'hex' | 'dec' | 'bin' | 'oct'

export interface RadixRowMeta {
  radix: Radix
  /** i18n 键（messages 里的 Radix.<key>） */
  key: RadixKey
  /** 与语言无关的短标签，直接显示 */
  label: string
}

/** 界面展示顺序 */
export const RADIX_ROWS: RadixRowMeta[] = [
  { radix: 16, key: 'hex', label: 'HEX' },
  { radix: 10, key: 'dec', label: 'DEC' },
  { radix: 2, key: 'bin', label: 'BIN' },
  { radix: 8, key: 'oct', label: 'OCT' },
]

function groupDigits(s: string, radix: Radix): string {
  const size = GROUP_SIZE[radix]
  if (!size)
    return s
  const parts: string[] = []
  for (let end = s.length; end > 0; end -= size)
    parts.unshift(s.slice(Math.max(0, end - size), end))

  return parts.join(' ')
}

export interface FormatOptions {
  /** true 只用于界面显示；复制到剪贴板必须 false（带空格粘进代码会坏） */
  group?: boolean
  padWidth?: number
  uppercase?: boolean
}

/** 格式化数值 */
export function format(value: bigint, radix: Radix, options: FormatOptions = {}): string {
  const { group = false, padWidth = 0, uppercase = false } = options
  const negative = value < 0n
  let s = (negative ? -value : value).toString(radix)
  if (padWidth > s.length)
    s = s.padStart(padWidth, '0')
  if (uppercase)
    s = s.toUpperCase()
  if (group)
    s = groupDigits(s, radix)
  return negative ? `-${s}` : s
}

export interface ConvertRow {
  radix: Radix
  key: RadixKey
  label: string
  isSource: boolean
  display: string
  raw: string
}

export interface ConvertSuccess {
  ok: true
  value: bigint
  radix: Radix
  rows: ConvertRow[]
}

export type ConvertResult = ConvertSuccess | ParseError

/** 一次算出四行结果（界面展示用 display，复制用 raw） */
export function convertAll(raw: unknown, forcedRadix?: Radix): ConvertResult {
  const parsed = parseInput(raw, forcedRadix)
  if (!parsed.ok)
    return parsed

  const { value, radix } = parsed
  const rows: ConvertRow[] = RADIX_ROWS.map(row => ({
    radix: row.radix,
    key: row.key,
    label: row.label,
    isSource: row.radix === radix,
    display: format(value, row.radix, { group: true }),
    raw: format(value, row.radix),
  }))
  return { ok: true, value, radix, rows }
}

export const WIDTHS: BitWidth[] = [8, 16, 32, 64]

export interface InterpretResult {
  width: BitWidth
  unsigned: string
  signed: string
  hex: string
  bin: string
  signBitSet: boolean
}

/**
 * 按位宽解释数值（寄存器场景核心）。
 *
 * 关键：BigInt.asUintN / asIntN 才是补码语义，
 * (-1n).toString(2) 得到的是 "-1" 而不是全 1。
 */
export function interpret(value: bigint, width: BitWidth): InterpretResult {
  const unsigned = BigInt.asUintN(width, value)
  const signed = BigInt.asIntN(width, value)
  return {
    width,
    unsigned: unsigned.toString(10),
    signed: signed.toString(10),
    hex: format(unsigned, 16, { padWidth: width / 4, group: true, uppercase: true }),
    bin: format(unsigned, 2, { padWidth: width, group: true }),
    signBitSet: signed < 0n,
  }
}

/** 大端字节数组（hex 字符串，小写补零） */
function bytesOf(value: bigint, width: BitWidth): string[] {
  const unsigned = BigInt.asUintN(width, value)
  const bytes: string[] = []
  for (let i = width / 8 - 1; i >= 0; i--)
    bytes.push(((unsigned >> BigInt(i * 8)) & 0xFFn).toString(16).padStart(2, '0'))

  return bytes
}

export interface ByteOrderResult {
  bigEndian: string
  littleEndian: string
}

/** 字节序视图 */
export function byteOrder(value: bigint, width: BitWidth): ByteOrderResult {
  const big = bytesOf(value, width)
  return {
    bigEndian: big.join(' '),
    littleEndian: [...big].reverse().join(' '),
  }
}
