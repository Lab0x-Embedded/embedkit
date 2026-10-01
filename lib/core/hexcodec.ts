/**
 * HEX ↔ 文本 ↔ C 数组 的纯计算。
 *
 * HEX 解析 / 格式化与 UTF-8 编解码直接复用 lib/core/serial.ts（串口助手那份），
 * 这里只补它没有的东西：Latin-1 编码、`0x` 前缀、C 数组生成与回读、hexdump。
 *
 * 约束：不 import React、不碰 DOM，全部可在 node 下单测。
 */

import type { ParseHexResult } from './serial'
import { formatHex, parseHexInput } from './serial'

// ───────────────────────── 编码 ─────────────────────────

/** utf8 = 多字节（中文常用）；latin1 = 一个字节一个字符（看原始字节用） */
export const TEXT_ENCODINGS = ['utf8', 'latin1'] as const
export type TextEncoding = (typeof TEXT_ENCODINGS)[number]

/** 文本 → 字节 */
export function encodeText(text: string, encoding: TextEncoding): Uint8Array<ArrayBuffer> {
  if (encoding === 'utf8')
    return new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>

  // Latin-1：每个字符低位就是一个字节，超出 0xFF 的字符按低 8 位截断
  const bytes = new Uint8Array(new ArrayBuffer(text.length))
  for (let i = 0; i < text.length; i++)
    bytes[i] = text.charCodeAt(i) & 0xFF
  return bytes
}

/** 字节 → 文本；非法 UTF-8 序列显示为替换字符，不抛异常 */
export function decodeBytes(bytes: Uint8Array, encoding: TextEncoding): string {
  if (encoding === 'utf8')
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)

  let text = ''
  for (const byte of bytes)
    text += String.fromCharCode(byte)
  return text
}

// ───────────────────────── HEX 输出 ─────────────────────────

export interface HexBytesOptions {
  /** 默认大写（调试习惯） */
  uppercase?: boolean
  /** 默认空格分隔 */
  separator?: string
  /** 每个字节加 0x 前缀（写 C 代码、发指令时常用） */
  prefix?: boolean
}

/** 字节 → HEX 字符串 */
export function formatHexBytes(bytes: Uint8Array, options: HexBytesOptions = {}): string {
  return formatHex(bytes, options)
}

// ───────────────────────── C 数组 ─────────────────────────

export interface CArrayOptions {
  /** 变量名，默认 buf */
  name?: string
  /** 每行几个字节，默认 12（一行不超过 80 列） */
  perLine?: number
  uppercase?: boolean
  /** 元素缩进，默认两个空格 */
  indent?: string
}

/**
 * 生成能直接粘进 C 代码的数组。
 *
 * 输出刻意只包含数组本身（不带长度常量），这样 parseCArray 能把结果原样读回来 ——
 * 工具里的「粘贴回读」靠的就是这个往返性质。
 */
export function toCArray(bytes: Uint8Array, options: CArrayOptions = {}): string {
  const { name = 'buf', perLine = 12, uppercase = true, indent = '  ' } = options
  const hex = (byte: number) => {
    const text = byte.toString(16).padStart(2, '0')
    return `0x${uppercase ? text.toUpperCase() : text}`
  }

  const lines: string[] = []
  for (let i = 0; i < bytes.length; i += perLine) {
    // 注意：不能用 Uint8Array.prototype.map —— 它会把回调的返回值再塞回一个
    // 类型化数组，"0xDE" 会被 Number() 成 222。先转成普通数组。
    const chunk = Array.from(bytes.subarray(i, i + perLine), hex)
    lines.push(`${indent + chunk.join(', ')},`)
  }

  if (lines.length === 0)
    return `const uint8_t ${name}[] = {};`

  return `const uint8_t ${name}[] = {\n${lines.join('\n')}\n};`
}

export type CArrayErrorCode = 'empty' | 'badToken' | 'outOfRange'

export type ParseCArrayResult
  = | { ok: true, bytes: Uint8Array<ArrayBuffer> }
    | { ok: false, code: CArrayErrorCode, detail?: string }

/**
 * 把（本工具生成的或从代码里抄来的）C 数组读回字节。
 *
 * 容忍：`const uint8_t x[] = { ... };` 外壳、`0x` / `0b` 前缀、十进制、
 * 逗号 / 空白分隔、行注释与块注释。
 */
export function parseCArray(input: string): ParseCArrayResult {
  const body = input
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')

  // 有花括号就只取花括号里面的内容，否则整段当作字节表
  const braced = /\{([\s\S]*)\}/.exec(body)
  const inner = braced ? braced[1] : body

  const tokens = inner.split(/[\s,]+/).filter(Boolean)
  if (tokens.length === 0)
    return { ok: false, code: 'empty' }

  const bytes = new Uint8Array(new ArrayBuffer(tokens.length))
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const value = /^0x[0-9a-f]+$/i.test(token)
      ? Number.parseInt(token.slice(2), 16)
      : /^0b[01]+$/i.test(token)
        ? Number.parseInt(token.slice(2), 2)
        : /^\d+$/.test(token)
          ? Number.parseInt(token, 10)
          : Number.NaN

    if (!Number.isInteger(value))
      return { ok: false, code: 'badToken', detail: token }
    if (value < 0 || value > 0xFF)
      return { ok: false, code: 'outOfRange', detail: token }

    bytes[i] = value
  }

  return { ok: true, bytes }
}

// ───────────────────────── hexdump ─────────────────────────

/**
 * 经典 hexdump：偏移 + HEX + `|文本|`。
 *
 * 看协议报文、二进制文件时比纯 HEX 串直观得多，非可打印字节显示成 `.`。
 */
export function formatHexDump(bytes: Uint8Array, perLine = 16): string {
  const lines: string[] = []

  for (let offset = 0; offset < bytes.length; offset += perLine) {
    const chunk = bytes.slice(offset, offset + perLine)
    const hexParts: string[] = []
    for (let i = 0; i < perLine; i++) {
      if (i < chunk.length)
        hexParts.push(chunk[i].toString(16).padStart(2, '0').toUpperCase())
      else
        hexParts.push('  ')
      // 第 8 列后多一个空格，和 xxd 的可读性对齐
      if (i === perLine / 2 - 1)
        hexParts.push('')
    }

    let ascii = ''
    for (const byte of chunk)
      ascii += byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : '.'

    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hexParts.join(' ')}  |${ascii}|`)
  }

  return lines.join('\n')
}

// ───────────────────────── 组合入口 ─────────────────────────

/** HEX 文本 → 字节（复用串口助手的解析规则），供 UI 直接用 */
export function parseHexBytes(text: string): ParseHexResult {
  return parseHexInput(text)
}
