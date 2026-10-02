/**
 * PinAtlas 深链构造（纯函数，无 React / DOM 依赖）。
 *
 * PinAtlas 是隔壁的芯片引脚查询站（https://pinatlas.ryanuo.cc），本站只做入口，
 * **不重复造轮子**（数据有 2781 个型号 / 31 万个引脚，不是这里该维护的东西）。
 *
 * 它支持三个 query 参数：`chip` / `pin` / `variant`。
 * 这里只负责拼 URL 与校验，不发任何请求 —— 站点承诺「工具页不发任何请求」。
 */

/** PinAtlas 入口 */
export const PINATLAS_ORIGIN = 'https://pinatlas.ryanuo.cc'

/** 型号、引脚名、封装变体都只允许这些字符，避免拼出畸形 URL */
const SAFE_TOKEN = /^[\w.\-+]+$/

export interface PinLookupInput {
  /** 芯片型号，PinAtlas 的 ID 形如 `STM32F103C8Tx` */
  chip: string
  /** 可选：引脚名，例如 PA9 / 1 / A1 */
  pin?: string
  /** 可选：封装变体，例如 LQFP48 */
  variant?: string
}

export type PinLookupErrorCode = 'emptyChip' | 'badChip' | 'badPin' | 'badVariant'

export type PinLookupResult
  = | { ok: true, url: string }
    | { ok: false, code: PinLookupErrorCode, detail?: string }

/** 用户常从手册里复制带空格的型号，这里统一去掉空白 */
export function normalizeChipId(raw: string): string {
  return raw.trim().replace(/\s+/g, '')
}

/**
 * 拼出 PinAtlas 的深链。
 *
 * 只带用户真的填了的参数：空字符串会被忽略，否则会把 `pin=` 也塞进地址栏，
 * 覆盖掉 PinAtlas 自己的默认视图。
 */
export function buildPinAtlasUrl(input: PinLookupInput): PinLookupResult {
  const chip = normalizeChipId(input.chip ?? '')
  if (!chip)
    return { ok: false, code: 'emptyChip' }
  if (!SAFE_TOKEN.test(chip))
    return { ok: false, code: 'badChip', detail: chip }

  const params = new URLSearchParams({ chip })

  const pin = (input.pin ?? '').trim()
  if (pin) {
    if (!SAFE_TOKEN.test(pin))
      return { ok: false, code: 'badPin', detail: pin }
    params.set('pin', pin)
  }

  const variant = (input.variant ?? '').trim()
  if (variant) {
    if (!SAFE_TOKEN.test(variant))
      return { ok: false, code: 'badVariant', detail: variant }
    params.set('variant', variant)
  }

  return { ok: true, url: `${PINATLAS_ORIGIN}/?${params.toString()}` }
}

/**
 * 把「订货号」猜成 PinAtlas 用的 CubeMX 形式。
 *
 * 数据集里的 ID 用 `x` 占位封装/温度等级（`STM32F103C8Tx`），而手册和数据手册上
 * 写的是订货号（`STM32F103C8T6`）。用户直接粘订货号时 PinAtlas 会静默退回默认型号，
 * 所以这里给出纠正建议。
 *
 * 返回 null 表示看不出需要纠正（已经以 x 结尾，或者形状不像订货号）。
 */
export function suggestCubeMxId(raw: string): string | null {
  const chip = normalizeChipId(raw)
  // 已经以 x/X 结尾 → 大概就是 CubeMX 形式
  if (/x$/i.test(chip))
    return null

  // ST 订货号：型号主体 + 封装码（T/U/H/I/Y/K/P）+ 温度等级（数字或字母）
  const matched = /^(.*[TUIHYKP])[0-9A-Z]$/.exec(chip)
  if (!matched)
    return null

  const suggestion = `${matched[1]}x`
  return suggestion === chip ? null : suggestion
}
