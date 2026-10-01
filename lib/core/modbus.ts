/**
 * Modbus 报文构造与解析（纯函数，无 React / DOM 依赖）。
 *
 * 只做「组帧 / 拆帧」这一件事：
 *   RTU = 单元号 + PDU + CRC16(小端)
 *   TCP = MBAP(事务号/协议号/长度/单元号) + PDU
 * CRC 复用 lib/core/crc.ts（也就是 js-crc 的 CRC-16/MODBUS 模型），不另写一份。
 *
 * 错误一律用错误码返回，不抛异常 —— 输入是用户在界面上敲的，什么都可能发生。
 */

import type { CrcAlgorithm } from './crc'
import { crcToBytesLE, getPreset } from './crc'

export type ModbusMode = 'rtu' | 'tcp'

export const MODBUS_MODES: ModbusMode[] = ['rtu', 'tcp']

/** 只做最常用的 8 个功能码，够覆盖调试现场 */
export const MODBUS_FUNCTIONS = [1, 2, 3, 4, 5, 6, 15, 16] as const
export type ModbusFunctionCode = (typeof MODBUS_FUNCTIONS)[number]

export type ModbusTarget = 'coil' | 'register'

export interface ModbusFunctionMeta {
  code: ModbusFunctionCode
  kind: 'read' | 'write'
  target: ModbusTarget
  /** 单个值还是批量；写多个时的数量来自值数组长度 */
  arity: 'single' | 'multiple'
}

export const MODBUS_FUNCTION_META: Record<ModbusFunctionCode, ModbusFunctionMeta> = {
  1: { code: 1, kind: 'read', target: 'coil', arity: 'multiple' },
  2: { code: 2, kind: 'read', target: 'coil', arity: 'multiple' },
  3: { code: 3, kind: 'read', target: 'register', arity: 'multiple' },
  4: { code: 4, kind: 'read', target: 'register', arity: 'multiple' },
  5: { code: 5, kind: 'write', target: 'coil', arity: 'single' },
  6: { code: 6, kind: 'write', target: 'register', arity: 'single' },
  15: { code: 15, kind: 'write', target: 'coil', arity: 'multiple' },
  16: { code: 16, kind: 'write', target: 'register', arity: 'multiple' },
}

/** 协议规定的数量上限（超过就会被从站拒绝） */
export const MODBUS_LIMITS: Record<ModbusFunctionCode, { min: number, max: number }> = {
  1: { min: 1, max: 2000 },
  2: { min: 1, max: 2000 },
  3: { min: 1, max: 125 },
  4: { min: 1, max: 125 },
  5: { min: 1, max: 1 },
  6: { min: 1, max: 1 },
  15: { min: 1, max: 1968 },
  16: { min: 1, max: 123 },
}

/** 字段的 i18n 键后缀；显示值已经是成品字符串，文案在 messages 里 */
export type ModbusFieldKey
  = | 'transactionId'
    | 'protocolId'
    | 'length'
    | 'unitId'
    | 'function'
    | 'address'
    | 'quantity'
    | 'byteCount'
    | 'value'
    | 'crc'

export interface ModbusField {
  key: ModbusFieldKey
  value: string
  /** 需要按 HEX 显示的字段 */
  hex?: boolean
}

export type ModbusErrorCode
  = | 'badUnitId'
    | 'badAddress'
    | 'badQuantity'
    | 'badValue'
    | 'badTransactionId'
    | 'emptyValues'
    | 'unsupportedFunction'

export interface ModbusError {
  ok: false
  code: ModbusErrorCode
  /** 出错的具体数字，用于文案插值 */
  detail?: string
}

export interface ModbusFrame {
  ok: true
  mode: ModbusMode
  bytes: Uint8Array<ArrayBuffer>
  pdu: Uint8Array<ArrayBuffer>
  fields: ModbusField[]
  /** RTU 帧算出来的 CRC 值 */
  crc?: bigint
}

export type ModbusResult = ModbusFrame | ModbusError

export interface ModbusRequestInput {
  mode: ModbusMode
  unitId: number
  functionCode: ModbusFunctionCode
  address: number
  /** 读请求的寄存器 / 线圈数量 */
  quantity?: number
  /** 写请求的值：单个功能码取第一个，批量功能码按顺序全部用上 */
  values?: number[]
  /** 仅 TCP：事务号 */
  transactionId?: number
}

const CRC: CrcAlgorithm = getPreset('crc-16-modbus')!

function isInteger(value: number): boolean {
  return Number.isInteger(value)
}

function u16(value: number): [number, number] {
  return [(value >> 8) & 0xFF, value & 0xFF]
}

function hex16(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
}

/**
 * 组一帧请求报文。
 *
 * 会按功能码逐项校验范围（地址、数量、单个值），越界就返回错误码而不是生成
 * 一个从站一定会拒绝的帧。
 */
export function buildModbusRequest(input: ModbusRequestInput): ModbusResult {
  const meta = MODBUS_FUNCTION_META[input.functionCode]
  if (!meta)
    return { ok: false, code: 'unsupportedFunction', detail: String(input.functionCode) }

  if (!isInteger(input.unitId) || input.unitId < 0 || input.unitId > 255)
    return { ok: false, code: 'badUnitId', detail: String(input.unitId) }

  if (!isInteger(input.address) || input.address < 0 || input.address > 0xFFFF)
    return { ok: false, code: 'badAddress', detail: String(input.address) }

  const transactionId = input.transactionId ?? 1
  if (input.mode === 'tcp' && (!isInteger(transactionId) || transactionId < 0 || transactionId > 0xFFFF))
    return { ok: false, code: 'badTransactionId', detail: String(transactionId) }

  const values = input.values ?? []
  const limits = MODBUS_LIMITS[input.functionCode]

  // 写多个但一个值都没给：这比「数量不合法」更贴近用户的实际情况，先报它
  if (meta.kind === 'write' && meta.arity === 'multiple' && values.length === 0)
    return { ok: false, code: 'emptyValues' }

  // 写请求的「数量」来自值数组，读请求来自输入
  const quantity = meta.kind === 'read' || meta.arity === 'single'
    ? (input.quantity ?? values.length ?? 1)
    : values.length

  if (meta.kind === 'read' || meta.arity === 'multiple') {
    if (!isInteger(quantity) || quantity < limits.min || quantity > limits.max)
      return { ok: false, code: 'badQuantity', detail: String(quantity) }
  }

  const pdu: number[] = [input.functionCode, ...u16(input.address)]

  if (meta.kind === 'read') {
    pdu.push(...u16(quantity))
  }
  else if (meta.arity === 'single') {
    const value = values[0]
    if (value === undefined || !isInteger(value) || value < limits.min - 1 || value > 0xFFFF)
      return { ok: false, code: 'badValue', detail: String(value) }

    if (meta.target === 'coil') {
      // 线圈只有「通 / 断」，协议规定用 0xFF00 / 0x0000 表示
      if (value !== 0 && value !== 1 && value !== 0xFF00 && value !== 0x0000)
        return { ok: false, code: 'badValue', detail: String(value) }
      pdu.push(...u16(value === 1 || value === 0xFF00 ? 0xFF00 : 0x0000))
    }
    else {
      pdu.push(...u16(value))
    }
  }
  else {
    if (values.some(value => !isInteger(value) || value < 0 || value > 0xFFFF))
      return { ok: false, code: 'badValue', detail: String(values.find(value => !isInteger(value) || value < 0 || value > 0xFFFF)) }

    pdu.push(...u16(quantity))

    if (meta.target === 'coil') {
      // 线圈按位打包，低位在前，最后一字节不足 8 位补零
      const byteCount = Math.ceil(quantity / 8)
      pdu.push(byteCount)
      const packed = Array.from<number>({ length: byteCount }).fill(0)
      values.forEach((value, index) => {
        if (value)
          packed[index >> 3] |= 1 << (index % 8)
      })
      pdu.push(...packed)
    }
    else {
      pdu.push(quantity * 2)
      for (const value of values)
        pdu.push(...u16(value))
    }
  }

  const pduBytes = Uint8Array.from(pdu) as Uint8Array<ArrayBuffer>
  const fields: ModbusField[] = []

  let bytes: Uint8Array<ArrayBuffer>
  let crc: bigint | undefined

  if (input.mode === 'rtu') {
    crc = CRC.compute(pduBytes.length ? Uint8Array.from([input.unitId, ...pdu]) : Uint8Array.from([input.unitId]))
    const tail = crcToBytesLE(crc, 16)
    bytes = Uint8Array.from([input.unitId, ...pdu, ...tail]) as Uint8Array<ArrayBuffer>

    fields.push({ key: 'unitId', value: String(input.unitId) })
    fields.push(...describePdu(input, meta, quantity, values))
    fields.push({ key: 'crc', value: hex16(Number(crc)), hex: true })
  }
  else {
    const length = pdu.length + 1 // 单元号 1 字节 + PDU
    const mbap = [...u16(transactionId), 0x00, 0x00, ...u16(length), input.unitId]
    bytes = Uint8Array.from([...mbap, ...pdu]) as Uint8Array<ArrayBuffer>

    fields.push({ key: 'transactionId', value: String(transactionId) })
    fields.push({ key: 'protocolId', value: '0x0000', hex: true })
    fields.push({ key: 'length', value: String(length) })
    fields.push({ key: 'unitId', value: String(input.unitId) })
    fields.push(...describePdu(input, meta, quantity, values))
  }

  return { ok: true, mode: input.mode, bytes, pdu: pduBytes, fields, crc }
}

/** PDU 部分的字段拆解（RTU / TCP 共用） */
function describePdu(
  input: ModbusRequestInput,
  meta: ModbusFunctionMeta,
  quantity: number,
  values: number[],
): ModbusField[] {
  const fields: ModbusField[] = [
    { key: 'function', value: `0x${input.functionCode.toString(16).toUpperCase().padStart(2, '0')}` },
    { key: 'address', value: hex16(input.address), hex: true },
  ]

  if (meta.kind === 'read')
    fields.push({ key: 'quantity', value: String(quantity) })
  else if (meta.arity === 'single')
    fields.push({ key: 'value', value: meta.target === 'coil' ? String(values[0] ? 1 : 0) : hex16(values[0] ?? 0) })
  else
    fields.push({ key: 'quantity', value: String(quantity) })

  return fields
}

// ───────────────────────── 解析 ─────────────────────────

export type ModbusParseErrorCode = 'tooShort' | 'badCrc' | 'badProtocolId' | 'badLength'

export interface ModbusParsed {
  ok: true
  mode: ModbusMode
  fields: ModbusField[]
  /** 从站返回的异常码（功能码最高位为 1 时） */
  exception?: number
  /** 报文自带的 CRC（RTU）以及是否与重算一致 */
  crc?: { value: bigint, valid: boolean }
}

export type ModbusParseResult = ModbusParsed | ModbusError | { ok: false, code: ModbusParseErrorCode, detail?: string }

export function isParseErrorCode(code: string): code is ModbusParseErrorCode {
  return code === 'tooShort' || code === 'badCrc' || code === 'badProtocolId' || code === 'badLength'
}

/**
 * 拆一帧报文（收到的响应也能拆）。
 *
 * 比组帧更宽松：只做结构解释 + CRC 校验，不去判断功能码和数据段是否自洽 ——
 * 调试时「从站到底回了什么」比「这帧合不合规」更重要。
 */
export function parseModbusFrame(bytes: Uint8Array, mode: ModbusMode): ModbusParseResult {
  if (bytes.length < (mode === 'rtu' ? 4 : 8))
    return { ok: false, code: 'tooShort' }

  const fields: ModbusField[] = []
  let offset = 0
  let crc: { value: bigint, valid: boolean } | undefined

  if (mode === 'rtu') {
    const payload = bytes.subarray(0, bytes.length - 2)
    const trailing = bytes.subarray(bytes.length - 2)
    const computed = CRC.compute(payload)
    const inFrame = BigInt(trailing[0]) | (BigInt(trailing[1]) << 8n)
    crc = { value: inFrame, valid: computed === inFrame }

    fields.push({ key: 'unitId', value: String(bytes[0]) })
    offset = 1
  }
  else {
    const transactionId = (bytes[0] << 8) | bytes[1]
    const protocolId = (bytes[2] << 8) | bytes[3]
    if (protocolId !== 0)
      return { ok: false, code: 'badProtocolId', detail: String(protocolId) }

    const length = (bytes[4] << 8) | bytes[5]
    if (length + 6 !== bytes.length)
      return { ok: false, code: 'badLength', detail: String(length) }

    fields.push({ key: 'transactionId', value: String(transactionId) })
    fields.push({ key: 'protocolId', value: '0x0000', hex: true })
    fields.push({ key: 'length', value: String(length) })
    fields.push({ key: 'unitId', value: String(bytes[6]) })
    offset = 7
  }

  const functionCode = bytes[offset]
  const data = bytes.subarray(offset + 1, mode === 'rtu' ? bytes.length - 2 : bytes.length)
  const exception = (functionCode & 0x80) !== 0
  const code = exception ? functionCode & 0x7F : functionCode

  fields.push({ key: 'function', value: `0x${code.toString(16).toUpperCase().padStart(2, '0')}` })

  if (exception) {
    fields.push({ key: 'value', value: `0x${(data[0] ?? 0).toString(16).toUpperCase().padStart(2, '0')}` })
  }
  else if (MODBUS_FUNCTIONS.includes(code as ModbusFunctionCode)) {
    // 响应里首字节是字节数，后面才是地址/数量/数据 —— 只把能确定的部分标出来
    const meta = MODBUS_FUNCTION_META[code as ModbusFunctionCode]
    if (meta.kind === 'write') {
      fields.push({ key: 'address', value: hex16(((data[0] ?? 0) << 8) | (data[1] ?? 0)), hex: true })
      fields.push({ key: 'value', value: hex16(((data[2] ?? 0) << 8) | (data[3] ?? 0)), hex: true })
    }
    else {
      fields.push({ key: 'byteCount', value: String(data[0] ?? 0) })
    }
  }

  if (crc)
    fields.push({ key: 'crc', value: hex16(Number(crc.value)), hex: true })

  return { ok: true, mode, fields, exception: exception ? data[0] : undefined, crc }
}
