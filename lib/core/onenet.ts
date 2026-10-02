/**
 * OneNET（中国移动物联网平台）MQTT 接入参数生成 —— 纯函数 + Web Crypto，零第三方依赖。
 *
 * Token 算法（官方文档：version 固定 "2018-10-31"，method 支持 sha1 / sha256）：
 *
 *   res                 = products/{产品ID}/devices/{设备ID}
 *   stringForSignature  = et + "\n" + method + "\n" + res + "\n" + version
 *   sign                = Base64(HMAC(设备密钥先做 Base64 解码, stringForSignature, method))
 *   token               = version={version}&res={encode(res)}&et={et}&method={method}&sign={encode(sign)}
 *
 * 其中 encode 是 encodeURIComponent 再补上 * → %2A、' → %27（encodeURIComponent 不转义这两个，
 * 但官方示例转义了）。
 *
 * 测试里的期望 token 由 Python 的 hmac/base64 独立算得（不是用本文件自证），
 * 见 onenet.test.ts 顶部的向量。
 */

export type OneNetMethod = 'sha1' | 'sha256'

/** 官方文档：version 目前仅支持这一个值 */
export const ONENET_TOKEN_VERSION = '2018-10-31'

/** 国内节点的主/备服务器 */
export const ONENET_HOSTS = [
  { key: 'primary', host: 'mqtts.heclouds.com', port: 1883 },
  { key: 'backup', host: 'studio-mqtt.heclouds.com', port: 1883 },
] as const

export type OneNetErrorCode
  = | 'emptyProduct'
    | 'emptyDevice'
    | 'emptyKey'
    | 'badKey'
    | 'invalidExpire'
    | 'noWebCrypto'

export class OneNetError extends Error {
  readonly code: OneNetErrorCode

  constructor(code: OneNetErrorCode) {
    super(code)
    this.name = 'OneNetError'
    this.code = code
  }
}

export function buildResourceName(productId: string, deviceId: string): string {
  return `products/${productId}/devices/${deviceId}`
}

export function buildStringToSign(
  et: number,
  method: OneNetMethod,
  resourceName: string,
  version: string = ONENET_TOKEN_VERSION,
): string {
  return `${et}\n${method}\n${resourceName}\n${version}`
}

/** encodeURIComponent + 补转义 * 和 '（对齐官方示例） */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/\*/g, '%2A').replace(/'/g, '%27')
}

/** Base64 → 字节；容忍空白、URL-safe 变体与缺失的 padding，格式不对则抛 badKey */
export function base64ToBytes(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized)
    throw new OneNetError('badKey')
  const padded = normalized.length % 4 === 0
    ? normalized
    : normalized + '='.repeat(4 - (normalized.length % 4))

  if (!/^[A-Z0-9+/]+={0,2}$/i.test(padded))
    throw new OneNetError('badKey')

  let binary: string
  try {
    // atob 在浏览器与 Node ≥16 都有
    binary = atob(padded)
  }
  catch {
    throw new OneNetError('badKey')
  }

  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i)

  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)

  return btoa(binary)
}

/** HMAC 签名 → 完整 token（用 Web Crypto，不引 crypto-js） */
export async function signToken(options: {
  deviceKey: string
  resourceName: string
  et: number
  method?: OneNetMethod
}): Promise<string> {
  const { deviceKey, resourceName, et, method = 'sha1' } = options

  if (!globalThis.crypto?.subtle)
    throw new OneNetError('noWebCrypto')

  const keyBytes = base64ToBytes(deviceKey)
  const stringToSign = buildStringToSign(et, method, resourceName)

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: method === 'sha1' ? 'SHA-1' : 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(stringToSign),
  )

  const signatureBase64 = bytesToBase64(new Uint8Array(signature))
  return `version=${ONENET_TOKEN_VERSION}`
    + `&res=${percentEncode(resourceName)}`
    + `&et=${et}`
    + `&method=${method}`
    + `&sign=${percentEncode(signatureBase64)}`
}

export type OneNetTopicDirection = 'up' | 'down'

export interface OneNetTopic {
  /** i18n 键（messages 里的 OneNet.topic.<key>） */
  key: string
  direction: OneNetTopicDirection
  topic: string
}

/** 物模型常用 topic（上下行）。identifier 与具体功能点以 OneNET 控制台为准 */
export function buildTopics(productId: string, deviceId: string): OneNetTopic[] {
  const base = `$sys/${productId}/${deviceId}`
  return [
    { key: 'propertyPost', direction: 'up', topic: `${base}/thing/property/post` },
    { key: 'propertyPostReply', direction: 'down', topic: `${base}/thing/property/post/reply` },
    { key: 'propertySet', direction: 'down', topic: `${base}/thing/property/set` },
    { key: 'propertySetReply', direction: 'up', topic: `${base}/thing/property/set_reply` },
    { key: 'propertyGet', direction: 'down', topic: `${base}/thing/property/get` },
    { key: 'propertyGetReply', direction: 'up', topic: `${base}/thing/property/get_reply` },
    { key: 'eventPost', direction: 'up', topic: `${base}/thing/event/post` },
    { key: 'eventPostReply', direction: 'down', topic: `${base}/thing/event/post/reply` },
  ]
}

export interface OneNetInput {
  productId: string
  deviceId: string
  /** 设备密钥（Base64，OneNET 控制台上的"设备密钥"） */
  deviceKey: string
  /** Token 过期时间（秒级时间戳） */
  et: number
  method?: OneNetMethod
}

export interface OneNetConfig {
  ok: true
  method: OneNetMethod
  resourceName: string
  stringToSign: string
  /** 同时也是 MQTT Password */
  token: string
  clientId: string
  username: string
  topics: OneNetTopic[]
}

export type OneNetBuild = OneNetConfig | { ok: false, code: OneNetErrorCode }

/**
 * 生成 MQTT 三元组：ClientID = 设备ID，Username = 产品ID，Password = token。
 * 任何校验失败都返回错误码（文案在 messages 里按码翻译），不抛异常。
 */
export async function buildOneNetConfig(input: OneNetInput): Promise<OneNetBuild> {
  const productId = input.productId.trim()
  const deviceId = input.deviceId.trim()
  const deviceKey = input.deviceKey.trim()

  if (!productId)
    return { ok: false, code: 'emptyProduct' }
  if (!deviceId)
    return { ok: false, code: 'emptyDevice' }
  if (!deviceKey)
    return { ok: false, code: 'emptyKey' }
  if (!Number.isFinite(input.et) || input.et <= 0)
    return { ok: false, code: 'invalidExpire' }

  const method = input.method ?? 'sha1'
  const resourceName = buildResourceName(productId, deviceId)
  const stringToSign = buildStringToSign(input.et, method, resourceName)

  let token: string
  try {
    token = await signToken({ deviceKey, resourceName, et: input.et, method })
  }
  catch (error) {
    return { ok: false, code: error instanceof OneNetError ? error.code : 'badKey' }
  }

  return {
    ok: true,
    method,
    resourceName,
    stringToSign,
    token,
    clientId: deviceId,
    username: productId,
    topics: buildTopics(productId, deviceId),
  }
}

/** JSON 的【字节】长度：中文字符按 UTF-8 算 3 字节，不能直接用 String.length */
export function jsonByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export type ParseParamsErrorCode = 'empty' | 'invalid-json' | 'not-object'

export type ParseParamsResult
  = | { ok: true, params: Record<string, unknown> }
    | { ok: false, code: ParseParamsErrorCode }

/**
 * 解析属性上报的 params —— 也就是文本框里那段 JSON。
 *
 * 只认「一个 JSON 对象」：外层 `{"id":…,"params":…}` 由 buildPropertyPayload 补上，
 * 使用者只写里面那层，少敲一层也就不容易写错。
 *
 * 值的类型完全由 JSON 自己表达（`25.6` 数字、`"ok"` 字符串、`true` 布尔、
 * 嵌套对象也行），所以不需要额外的类型下拉 —— 这是当初把逐字段输入框
 * 换成直接写 JSON 的主要收益。
 */
export function parsePropertyParams(text: string): ParseParamsResult {
  if (!text.trim())
    return { ok: false, code: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    return { ok: false, code: 'invalid-json' }
  }

  // 数组和 null 的 typeof 也是 'object'，得单独排掉
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    return { ok: false, code: 'not-object' }

  return { ok: true, params: parsed as Record<string, unknown> }
}

/** 属性上报报文：{ "id": "<id>", "params": <解析出来的 params> } */
export function buildPropertyPayload(
  params: Record<string, unknown>,
  id: string | number = '1',
): string {
  return JSON.stringify({ id: String(id), params })
}

/** 设备回复属性设置：{ "id": "<id>", "code": 200, "msg": "success" } */
export function buildReplyPayload(id: string | number = '1', code = 200, msg = 'success'): string {
  return JSON.stringify({ id: String(id), code, msg })
}

export type AtBlockKey = 'network' | 'mqtt' | 'subscribe' | 'publish' | 'reply' | 'fallback'

export interface AtBlock {
  key: AtBlockKey
  lines: string[]
}

export interface AtCommandInput {
  wifiSsid: string
  wifiPassword: string
  productId: string
  deviceId: string
  token: string
  /** 属性上报报文（已序列化的 JSON） */
  payload: string
  /** 设备回复报文（为空则不出这一段） */
  replyPayload?: string
  host?: string
  port?: number
  clientIndex?: number
}

/**
 * 生成 ESP-AT（ESP8266 / ESP32）固件的连接指令序列。
 *
 * 只返回结构化片段，注释文案交给 UI 按语言拼（核心库不写死中文）。
 */
export function buildAtBlocks(input: AtCommandInput): AtBlock[] {
  const {
    wifiSsid,
    wifiPassword,
    productId,
    deviceId,
    token,
    payload,
    replyPayload,
    host = ONENET_HOSTS[0].host,
    port = ONENET_HOSTS[0].port,
    clientIndex = 0,
  } = input

  const base = `$sys/${productId}/${deviceId}`
  const blocks: AtBlock[] = [
    {
      key: 'network',
      lines: [
        'AT',
        'AT+CWMODE=1',
        `AT+CWJAP="${wifiSsid}","${wifiPassword}"`,
      ],
    },
    {
      key: 'mqtt',
      lines: [
        `AT+MQTTUSERCFG=${clientIndex},1,"${deviceId}","${productId}","${token}",0,0,""`,
        `AT+MQTTCONN=${clientIndex},"${host}",${port},1`,
      ],
    },
    {
      key: 'subscribe',
      lines: [
        `AT+MQTTSUB=${clientIndex},"${base}/thing/property/post/reply",0`,
        `AT+MQTTSUB=${clientIndex},"${base}/thing/property/set",0`,
      ],
    },
    {
      key: 'publish',
      lines: [
        `AT+MQTTPUBRAW=${clientIndex},"${base}/thing/property/post",${jsonByteLength(payload)},0,0`,
        payload,
      ],
    },
  ]

  if (replyPayload) {
    blocks.push({
      key: 'reply',
      lines: [
        `AT+MQTTPUBRAW=${clientIndex},"${base}/thing/property/set_reply",${jsonByteLength(replyPayload)},0,0`,
        replyPayload,
      ],
    })
  }

  blocks.push({
    key: 'fallback',
    lines: [
      `AT+MQTTCONN=${clientIndex},"${ONENET_HOSTS[1].host}",${ONENET_HOSTS[1].port},1`,
      `AT+MQTTCONN=${clientIndex},"${host}",${port},0`,
    ],
  })

  return blocks
}

/** 把片段拼成可复制文本；comments 按语言传入（缺省则不加注释行） */
export function flattenAtBlocks(
  blocks: readonly AtBlock[],
  comments: Partial<Record<AtBlockKey, string>> = {},
  lineEnding = '\n',
): string {
  const chunks: string[] = []
  for (const block of blocks) {
    const comment = comments[block.key]
    if (comment)
      chunks.push(`// ===== ${comment} =====`)
    chunks.push(...block.lines)
  }
  return chunks.join(lineEnding)
}

/** 本地时区的 日期 + 时间 → 秒级时间戳（无效返回 null） */
export function dateTimeToTimestamp(date: string, time: string): number | null {
  if (!date)
    return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = (time || '00:00').split(':').map(Number)
  if ([year, month, day, hour, minute].some(n => !Number.isFinite(n)))
    return null

  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0)
  return Number.isNaN(parsed.getTime()) ? null : Math.floor(parsed.getTime() / 1000)
}

/** 秒级时间戳 → 本地时区的 日期 + 时间（配合 <input type="datetime-local"> 用） */
export function timestampToDateTime(timestamp: number): { date: string, time: string } {
  const d = new Date(timestamp * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/** 默认过期时间：从现在起 N 天（OneNET 建议留足余量） */
export function expiryFromNow(days: number, now: number = Date.now()): number {
  return Math.floor(now / 1000) + Math.round(days * 24 * 60 * 60)
}
