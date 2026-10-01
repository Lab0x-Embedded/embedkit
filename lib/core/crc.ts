/**
 * CRC 计算（纯函数，无 React / DOM 依赖）。
 *
 * 算法本体**不自己实现** —— 用 js-crc：
 *   - `js-crc/models` 是直接从 reveng CRC catalogue 生成的模型目录（187 个），
 *     参数由库维护，我们只挑选嵌入式常用的那些；
 *   - 用户自定义参数（poly / init / refin / refout / xorout）走 `createModel`。
 * 本模块只负责三件库里没有的事：把结果当整数用、按位宽格式化、
 * 以及「数据 + 尾部 CRC」这种报文校验。
 *
 * 单测用各模型的官方 check 值（对 ASCII "123456789" 的结果）逐条比对，
 * 确保挑出来的模型和显示的位宽对得上。
 */

import type { createModel } from 'js-crc'
import { createModel as createCrcModel } from 'js-crc'
import * as crcModels from 'js-crc/models'

/** js-crc 的模型类型（不额外引它未导出的 interface，直接从函数推） */
export type CrcModel = ReturnType<typeof createModel>

export type CrcWidth = 8 | 16 | 32 | 64

export const CRC_WIDTHS: CrcWidth[] = [8, 16, 32, 64]

/** 一个可用的 CRC 算法：知道自己的位宽，并能对一段字节算出结果 */
export interface CrcAlgorithm {
  /** 唯一标识，也是 i18n 文案的键后缀 */
  id: string
  width: CrcWidth
  compute: (bytes: Uint8Array) => bigint
}

export interface CrcPreset extends CrcAlgorithm {
  /** 官方 check 值：对 ASCII "123456789" 的结果，单测逐条比对 */
  check: bigint
}

/** 库返回小写 16 进制串，转成整数便于格式化与拆字节 */
function hexToBigInt(hex: string): bigint {
  return hex ? BigInt(`0x${hex}`) : 0n
}

/** id 用泛型保留字面量类型，这样 i18n 的 `presets.${id}` 才能被类型检查到 */
function fromModel<Id extends string>(id: Id, width: CrcWidth, model: CrcModel) {
  return { id, width, compute: (bytes: Uint8Array) => hexToBigInt(model(bytes)) }
}

/**
 * 挑出来的预设。
 *
 * 模型实例直接来自 `js-crc/models`（导出名 = 官方模型名小写、`-` 与 `/` 换 `_`），
 * 所以这里没有任何手写的 poly / init，改不动也错不了。
 * 中文名与说明在 messages/*.json 的 Crc.presets 里。
 */
export const CRC_PRESETS = [
  { ...fromModel('crc-8', 8, crcModels.crc_8_smbus), check: 0xF4n },
  { ...fromModel('crc-8-maxim', 8, crcModels.crc_8_maxim_dow), check: 0xA1n },
  { ...fromModel('crc-8-sae-j1850', 8, crcModels.crc_8_sae_j1850), check: 0x4Bn },
  { ...fromModel('crc-8-autosar', 8, crcModels.crc_8_autosar), check: 0xDFn },
  { ...fromModel('crc-8-cdma2000', 8, crcModels.crc_8_cdma2000), check: 0xDAn },

  { ...fromModel('crc-16-arc', 16, crcModels.crc_16_arc), check: 0xBB3Dn },
  { ...fromModel('crc-16-modbus', 16, crcModels.crc_16_modbus), check: 0x4B37n },
  { ...fromModel('crc-16-usb', 16, crcModels.crc_16_usb), check: 0xB4C8n },
  { ...fromModel('crc-16-maxim', 16, crcModels.crc_16_maxim_dow), check: 0x44C2n },
  { ...fromModel('crc-16-ccitt-false', 16, crcModels.crc_16_ccitt_false), check: 0x29B1n },
  { ...fromModel('crc-16-xmodem', 16, crcModels.crc_16_xmodem), check: 0x31C3n },
  { ...fromModel('crc-16-x25', 16, crcModels.crc_16_x_25), check: 0x906En },
  { ...fromModel('crc-16-kermit', 16, crcModels.crc_16_kermit), check: 0x2189n },
  { ...fromModel('crc-16-dnp', 16, crcModels.crc_16_dnp), check: 0xEA82n },
  { ...fromModel('crc-16-en-13757', 16, crcModels.crc_16_en_13757), check: 0xC2B7n },
  { ...fromModel('crc-16-riello', 16, crcModels.crc_16_riello), check: 0x63D0n },

  { ...fromModel('crc-32', 32, crcModels.crc_32_iso_hdlc), check: 0xCBF43926n },
  { ...fromModel('crc-32-mpeg-2', 32, crcModels.crc_32_mpeg_2), check: 0x0376E6E7n },
  { ...fromModel('crc-32-bzip2', 32, crcModels.crc_32_bzip2), check: 0xFC891918n },
  { ...fromModel('crc-32-posix', 32, crcModels.crc_32_posix), check: 0x765E7680n },
  { ...fromModel('crc-32-jamcrc', 32, crcModels.crc_32_jamcrc), check: 0x340BC6D9n },
  { ...fromModel('crc-32c', 32, crcModels.crc_32_iscsi), check: 0xE3069283n },
  { ...fromModel('crc-32-autosar', 32, crcModels.crc_32_autosar), check: 0x1697D06An },

  { ...fromModel('crc-64-xz', 64, crcModels.crc_64_xz), check: 0x995DC9BBDF1939FAn },
] as const satisfies readonly CrcPreset[]

/** 预设 id 的字面量联合：让 i18n 的 `presets.${id}` 能被类型检查到 */
export type CrcPresetId = (typeof CRC_PRESETS)[number]['id']

export function getPreset(id: string): CrcPreset | undefined {
  return CRC_PRESETS.find(preset => preset.id === id)
}

/** 单测与工具自检共用的标准输入（各模型的官方 check 都基于它） */
export const CRC_CHECK_INPUT = '123456789'

// ───────────────────────── 自定义参数 ─────────────────────────

export interface CrcParams {
  width: CrcWidth
  /** 生成多项式（去掉隐含的最高位），例如 CRC-32 是 0x04C11DB7 */
  poly: bigint
  /** 寄存器初值 */
  init: bigint
  /** 输入字节是否按位反转（LSB first） */
  refin: boolean
  /** 输出是否按位反转 */
  refout: boolean
  /** 结果异或值 */
  xorout: bigint
}

/**
 * width > 32 时 js-crc 要求把 poly / init / xorout 拆成 32 位字数组。
 * 这只是把 BigInt 转成库要的入参形状，不涉及算法。
 */
function toModelValue(value: bigint, width: CrcWidth): number | number[] {
  if (width <= 32)
    return Number(value)

  const words: number[] = []
  for (let shift = BigInt(width - 32); shift >= 0n; shift -= 32n)
    words.push(Number((value >> shift) & 0xFFFFFFFFn))
  return words
}

/** 按自定义参数算 CRC */
export function computeCrc(bytes: Uint8Array, params: CrcParams): bigint {
  const model = createCrcModel({
    width: params.width,
    poly: toModelValue(params.poly, params.width),
    init: toModelValue(params.init, params.width),
    refin: params.refin,
    refout: params.refout,
    xorout: toModelValue(params.xorout, params.width),
  })
  return hexToBigInt(model(bytes))
}

/** 把自定义参数包成一个算法，好和预设走同一套调用 */
export function customAlgorithm(params: CrcParams): CrcAlgorithm {
  const model = createCrcModel({
    width: params.width,
    poly: toModelValue(params.poly, params.width),
    init: toModelValue(params.init, params.width),
    refin: params.refin,
    refout: params.refout,
    xorout: toModelValue(params.xorout, params.width),
  })
  return {
    id: 'custom',
    width: params.width,
    compute: bytes => hexToBigInt(model(bytes)),
  }
}

// ───────────────────────── 显示与拆字节 ─────────────────────────

/** 16 进制显示：按位宽补零，例如 0x4B37 / 0xCBF43926 */
export function formatCrc(value: bigint, width: CrcWidth): string {
  return `0x${value.toString(16).toUpperCase().padStart(width / 4, '0')}`
}

/** CRC 值按指定字节序拆成字节（Modbus RTU 是小端：低字节在前） */
export function crcToBytes(
  value: bigint,
  width: CrcWidth,
  byteOrder: 'be' | 'le',
): Uint8Array<ArrayBuffer> {
  const count = width / 8
  const bytes = new Uint8Array(new ArrayBuffer(count))
  for (let i = 0; i < count; i++) {
    const shift = BigInt(8 * (byteOrder === 'le' ? i : count - 1 - i))
    bytes[i] = Number((value >> shift) & 0xFFn)
  }
  return bytes
}

export function crcToBytesLE(value: bigint, width: CrcWidth): Uint8Array<ArrayBuffer> {
  return crcToBytes(value, width, 'le')
}

export function crcToBytesBE(value: bigint, width: CrcWidth): Uint8Array<ArrayBuffer> {
  return crcToBytes(value, width, 'be')
}

// ───────────────────────── 报文校验 ─────────────────────────

export type CrcCheckError = 'tooShort'

export interface CrcCheckResult {
  ok: boolean
  /** 从报文末尾按位宽取出来的校验值 */
  trailing: bigint
  /** 对末尾之前的数据重新算出来的校验值 */
  computed: bigint
}

/**
 * 校验一段「数据 + 尾部 CRC」的报文。
 *
 * 串口调试时最常用的动作：把收到的整帧粘进来，看尾部的 CRC 对不对。
 * 字节序由协议决定 —— Modbus RTU 是小端，多数自定义协议是大端。
 */
export function checkTrailingCrc(
  bytes: Uint8Array,
  algorithm: CrcAlgorithm,
  byteOrder: 'be' | 'le' = 'le',
): CrcCheckResult | CrcCheckError {
  const count = algorithm.width / 8
  if (bytes.length < count)
    return 'tooShort'

  const payload = bytes.subarray(0, bytes.length - count)
  const tail = bytes.subarray(bytes.length - count)

  let trailing = 0n
  for (let i = 0; i < count; i++) {
    const shift = BigInt(8 * (byteOrder === 'le' ? i : count - 1 - i))
    trailing |= BigInt(tail[i]) << shift
  }

  const computed = algorithm.compute(payload)
  return { ok: computed === trailing, trailing, computed }
}
