/**
 * 串口助手用到的纯计算：HEX/文本互转、日志时间戳、分包合并。
 *
 * 约束：不 import React、不碰 DOM / navigator，全部可在 node 下单测。
 * 真正的串口 API 封装在 lib/browser/serial.ts。
 */

export type ParseHexErrorCode = 'empty' | 'oddLength' | 'badChar'

export interface ParseHexSuccess {
  ok: true
  bytes: Uint8Array<ArrayBuffer>
}

export interface ParseHexError {
  ok: false
  code: ParseHexErrorCode
  /** badChar 时给出第一个非法字符 */
  detail?: string
}

export type ParseHexResult = ParseHexSuccess | ParseHexError

/**
 * 解析用户输入的 HEX。
 *
 * 容忍：空格 / 换行 / 逗号 / 分号 / 冒号 / 短横线分隔，`0x` 前缀，`\x` 转义。
 * 报错（不抛异常）：空输入、奇数个数字、非法字符。
 */
export function parseHexInput(text: string): ParseHexResult {
  const normalized = text
    .replace(/\\x/gi, '')
    .replace(/0x/gi, '')
    .replace(/[\s,;:_-]+/g, '')

  if (!normalized)
    return { ok: false, code: 'empty' }

  const bad = /[^0-9a-f]/i.exec(normalized)
  if (bad)
    return { ok: false, code: 'badChar', detail: bad[0] }

  if (normalized.length % 2 !== 0)
    return { ok: false, code: 'oddLength' }

  const bytes = new Uint8Array(new ArrayBuffer(normalized.length / 2))
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16)

  return { ok: true, bytes }
}

export interface FormatHexOptions {
  /** 默认大写（调试习惯） */
  uppercase?: boolean
  /** 默认空格分隔 */
  separator?: string
}

/** 字节 → HEX 字符串 */
export function formatHex(bytes: Uint8Array, options: FormatHexOptions = {}): string {
  const { uppercase = true, separator = ' ' } = options
  const parts: string[] = []
  for (const byte of bytes)
    parts.push(byte.toString(16).padStart(2, '0'))

  const text = parts.join(separator)
  return uppercase ? text.toUpperCase() : text
}

/** 字节 → 文本（UTF-8，非法序列显示为替换字符；二进制数据请看 HEX 模式） */
export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/** 文本 → 字节（UTF-8） */
export function textToBytes(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>
}

/** 日志时间戳 HH:MM:SS.mmm（传 Date，保持纯函数） */
export function formatClockTime(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

/** 字节数的易读形式：1234 → 1.2 KB */
export function formatByteCount(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

/**
 * 分包合并器。
 *
 * 串口一次 read() 拿到的往往不是完整一帧，所以把「间隔小于 gapMs 的连续数据」
 * 合成一包再上屏 —— 和参考项目一个思路，但把逻辑抽成可注入时间的纯状态机，便于单测。
 *
 * 用法：收到数据就 push()，然后调用方按 gapMs 定时来 poll() 取合并结果。
 */
export class PacketAssembler {
  private buffer: number[] = []
  private lastChunkAt = 0

  constructor(private readonly gapMs: number) {}

  /** 缓冲区里待合并的字节数 */
  get pendingBytes(): number {
    return this.buffer.length
  }

  push(bytes: Uint8Array | readonly number[], now: number): void {
    for (const byte of bytes)
      this.buffer.push(byte)
    this.lastChunkAt = now
  }

  /** 距最后一次 push 已满 gapMs 就吐出合并后的包，否则返回 null */
  poll(now: number): Uint8Array<ArrayBuffer> | null {
    if (this.buffer.length === 0)
      return null
    if (this.gapMs > 0 && now - this.lastChunkAt < this.gapMs)
      return null

    return this.flush()
  }

  /** 立即吐出缓冲区（关闭串口、切换模式时用），空则返回 null */
  flush(): Uint8Array<ArrayBuffer> | null {
    if (this.buffer.length === 0)
      return null

    const bytes = Uint8Array.from(this.buffer) as Uint8Array<ArrayBuffer>
    this.buffer = []
    return bytes
  }

  reset(): void {
    this.buffer = []
    this.lastChunkAt = 0
  }
}

// ───────────────────────── 串口参数（数据定义，UI 与 store 共用） ─────────────────────────

export const BAUD_RATES = [
  1200,
  2400,
  4800,
  9600,
  19200,
  38400,
  57600,
  74880,
  115200,
  230400,
  460800,
  921600,
  1500000,
] as const

export const DATA_BITS = [7, 8] as const
export const STOP_BITS = [1, 2] as const
export const PARITIES = ['none', 'even', 'odd'] as const
export const FLOW_CONTROLS = ['none', 'hardware'] as const

export type DataBits = (typeof DATA_BITS)[number]
export type StopBits = (typeof STOP_BITS)[number]
export type SerialParity = (typeof PARITIES)[number]
export type SerialFlowControl = (typeof FLOW_CONTROLS)[number]

export interface SerialSettings {
  baudRate: number
  dataBits: DataBits
  stopBits: StopBits
  parity: SerialParity
  flowControl: SerialFlowControl
}

export const DEFAULT_SERIAL_SETTINGS: SerialSettings = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none',
}

/** 校验从本地存储读回来的串口参数，坏值一律回退默认（用户手改过 localStorage 也不炸） */
export function normalizeSerialSettings(raw: unknown): SerialSettings {
  const source = (raw ?? {}) as Partial<Record<keyof SerialSettings, unknown>>
  const baudRate = Number(source.baudRate)
  return {
    baudRate: BAUD_RATES.includes(baudRate as (typeof BAUD_RATES)[number])
      ? baudRate
      : DEFAULT_SERIAL_SETTINGS.baudRate,
    dataBits: DATA_BITS.includes(source.dataBits as DataBits)
      ? (source.dataBits as DataBits)
      : DEFAULT_SERIAL_SETTINGS.dataBits,
    stopBits: STOP_BITS.includes(source.stopBits as StopBits)
      ? (source.stopBits as StopBits)
      : DEFAULT_SERIAL_SETTINGS.stopBits,
    parity: PARITIES.includes(source.parity as SerialParity)
      ? (source.parity as SerialParity)
      : DEFAULT_SERIAL_SETTINGS.parity,
    flowControl: FLOW_CONTROLS.includes(source.flowControl as SerialFlowControl)
      ? (source.flowControl as SerialFlowControl)
      : DEFAULT_SERIAL_SETTINGS.flowControl,
  }
}
