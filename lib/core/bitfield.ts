/**
 * 位域 / 寄存器可视化（纯函数，无 React / DOM 依赖）。
 *
 * 位宽解释直接复用 lib/core/radix.ts 的 interpret（同一套补码 / 分组显示规则），
 * 这里只补寄存器特有的部分：逐位读写、字段切片、C 宏导出。
 */

import type { BitWidth } from './radix'
import { interpret, WIDTHS } from './radix'

export type { BitWidth }
export { WIDTHS }

/** 位宽掩码：8 → 0xFF */
export function maskFor(width: BitWidth): bigint {
  return (1n << BigInt(width)) - 1n
}

/** 把任意整数按位宽截断成无符号值 */
export function clampToWidth(value: bigint, width: BitWidth): bigint {
  return BigInt.asUintN(width, value)
}

/** 取某一位；下标从 0（LSB）开始 */
export function getBit(value: bigint, index: number): boolean {
  return ((value >> BigInt(index)) & 1n) === 1n
}

export function setBit(value: bigint, index: number, on: boolean, width: BitWidth): bigint {
  const mask = 1n << BigInt(index)
  return clampToWidth(on ? value | mask : value & ~mask, width)
}

export function toggleBit(value: bigint, index: number, width: BitWidth): bigint {
  return clampToWidth(value ^ (1n << BigInt(index)), width)
}

/** 全部取反（按位宽） */
export function invertAll(value: bigint, width: BitWidth): bigint {
  return clampToWidth(~value, width)
}

export function setAll(width: BitWidth): bigint {
  return maskFor(width)
}

export function clearAll(): bigint {
  return 0n
}

/** 从 MSB 到 LSB 的位序列，UI 按这个顺序渲染网格 */
export interface BitCell {
  index: number
  set: boolean
}

export function bitCells(value: bigint, width: BitWidth): BitCell[] {
  const cells: BitCell[] = []
  for (let index = width - 1; index >= 0; index--)
    cells.push({ index, set: getBit(value, index) })
  return cells
}

// ───────────────────────── 输入解析 ─────────────────────────

export type ParseRegisterErrorCode = 'empty' | 'badChar' | 'outOfRange'

export type ParseRegisterResult
  = | { ok: true, value: bigint }
    | { ok: false, code: ParseRegisterErrorCode, detail?: string }

/**
 * 解析寄存器输入。
 *
 * 容忍：`0x` / `0b` / `0o` 前缀、十进制、空格与下划线分隔。
 * 超过 64 位或出现非法字符时返回错误码。
 */
export function parseRegisterInput(text: string, width: BitWidth): ParseRegisterResult {
  const cleaned = text.trim().replace(/[\s_]/g, '')
  if (!cleaned)
    return { ok: false, code: 'empty' }

  let radix = 10
  let digits = cleaned
  if (/^0x/i.test(cleaned)) {
    radix = 16
    digits = cleaned.slice(2)
  }
  else if (/^0b/i.test(cleaned)) {
    radix = 2
    digits = cleaned.slice(2)
  }
  else if (/^0o/i.test(cleaned)) {
    radix = 8
    digits = cleaned.slice(2)
  }

  if (!digits)
    return { ok: false, code: 'empty' }

  const allowed = radix === 16 ? /[0-9a-f]/i : radix === 8 ? /[0-7]/ : radix === 2 ? /[01]/ : /\d/
  const bad = [...digits].find(char => !allowed.test(char))
  if (bad)
    return { ok: false, code: 'badChar', detail: bad }

  const value = BigInt(radix === 16 ? `0x${digits}` : radix === 8 ? `0o${digits}` : radix === 2 ? `0b${digits}` : digits)
  if (value > maskFor(width))
    return { ok: false, code: 'outOfRange', detail: value.toString(10) }

  return { ok: true, value }
}

// ───────────────────────── 字段 ─────────────────────────

export interface BitFieldDef {
  id: string
  /** 字段名，导出 C 宏时用 */
  name: string
  /** 最高位下标（含） */
  msb: number
  /** 最低位下标（含） */
  lsb: number
}

export type FieldErrorCode = 'badRange' | 'outOfWidth' | 'emptyName'

export interface FieldError {
  ok: false
  code: FieldErrorCode
  detail?: string
}

/** 校验字段范围：lsb ≤ msb，且都落在位宽内 */
export function validateField(field: BitFieldDef, width: BitWidth): FieldError | { ok: true } {
  if (!field.name.trim())
    return { ok: false, code: 'emptyName' }
  if (!Number.isInteger(field.lsb) || !Number.isInteger(field.msb) || field.lsb > field.msb)
    return { ok: false, code: 'badRange', detail: `${field.lsb}:${field.msb}` }
  if (field.lsb < 0 || field.msb >= width)
    return { ok: false, code: 'outOfWidth', detail: `${field.lsb}:${field.msb}` }
  return { ok: true }
}

/** 字段占用的位宽 */
export function fieldWidth(field: BitFieldDef): number {
  return field.msb - field.lsb + 1
}

/** 字段的掩码（未移位，绝对值） */
export function fieldMask(field: BitFieldDef, width: BitWidth): bigint {
  const bits = fieldWidth(field)
  return clampToWidth(((1n << BigInt(bits)) - 1n) << BigInt(field.lsb), width)
}

/** 从寄存器里取出字段值（未移位） */
export function extractField(value: bigint, field: BitFieldDef): bigint {
  const shifted = value >> BigInt(field.lsb)
  return shifted & ((1n << BigInt(fieldWidth(field))) - 1n)
}

/** 把字段值写回寄存器，其余位不动 */
export function applyField(value: bigint, field: BitFieldDef, fieldValue: bigint, width: BitWidth): bigint {
  const mask = fieldMask(field, width)
  const bits = fieldWidth(field)
  const clamped = fieldValue & ((1n << BigInt(bits)) - 1n)
  return clampToWidth((value & ~mask) | ((clamped << BigInt(field.lsb)) & mask), width)
}

// ───────────────────────── 显示与导出 ─────────────────────────

export interface RegisterView {
  /** 二进制，按 4 位分组 */
  bin: string
  hex: string
  dec: string
  signed: string
  signBitSet: boolean
}

/** 复用进制转换那套的显示规则，保证两个工具看起来一致 */
export function registerView(value: bigint, width: BitWidth): RegisterView {
  const result = interpret(value, width)
  return {
    bin: result.bin,
    hex: result.hex,
    dec: result.unsigned,
    signed: result.signed,
    signBitSet: result.signBitSet,
  }
}

/** C 标识符：大写，非字母数字换成下划线 */
export function toCIdentifier(name: string): string {
  const cleaned = name.trim().replace(/\W+/g, '_').replace(/^_+|_+$/g, '')
  return (cleaned || 'FIELD').toUpperCase()
}

function cHex(value: bigint, width: BitWidth): string {
  const digits = value.toString(16).toUpperCase().padStart(width / 4, '0')
  return `0x${digits}u`
}

/**
 * 导出可粘贴进 C 代码的宏。
 *
 * 用绝对掩码（不写移位形式）—— 位宽 64 时移位容易在 32 位平台上翻车，
 * 绝对掩码配合 `u`/`ull` 后缀反而更稳。
 */
export function toCMacros(
  value: bigint,
  width: BitWidth,
  fields: BitFieldDef[],
  registerName = 'REG',
): string {
  const name = toCIdentifier(registerName)
  const lines: string[] = [
    `/* EmbedKit · ${width} 位寄存器 */`,
    `#define ${name}_VALUE   ${cHex(clampToWidth(value, width), width)}`,
  ]

  const valid = fields.filter(field => validateField(field, width).ok)
  if (valid.length > 0) {
    lines.push('')
    lines.push('/* 字段 */')
    for (const field of valid) {
      const id = toCIdentifier(field.name)
      const mask = fieldMask(field, width)
      const fieldValue = extractField(value, field)
      lines.push(`#define ${name}_${id}_Pos   ${field.lsb}u`)
      lines.push(`#define ${name}_${id}_Msk   ${cHex(mask, width)}`)
      lines.push(`#define ${name}_${id}_Val   ${cHex(fieldValue, width)}`)
    }
  }

  return lines.join('\n')
}
