import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  buildAtBlocks,
  buildOneNetConfig,
  buildPropertyPayload,
  buildReplyPayload,
  buildResourceName,
  buildStringToSign,
  buildTopics,
  bytesToBase64,
  dateTimeToTimestamp,
  expiryFromNow,
  flattenAtBlocks,
  jsonByteLength,
  ONENET_HOSTS,
  ONENET_TOKEN_VERSION,
  OneNetError,
  percentEncode,
  signToken,
  timestampToDateTime,
} from './onenet'

/**
 * 测试向量来源：用 Python 的 hmac / hashlib / base64 独立算得，
 * 不是拿本文件自己的实现自证（这就是校验实现对不对的关键一步）。
 *
 *   key_b64 = 'cThZSDE5bGNKRGZYV2pIdmxXNDhSMlpCUUZsUWFLdEc='
 *   res     = 'products/AceV67og0i/devices/humi_temp'
 *   et      = 1805693871
 *   sha1:   sign = W0HLX/+I4MsQZdIsvJ9LuYuF9mM=
 *   sha256: sign = DeEUAliqi+rfKT/FaWYYRIw+SsjnyDgfDDE50vJZF6c=
 */
const DEMO_KEY = 'cThZSDE5bGNKRGZYV2pIdmxXNDhSMlpCUUZsUWFLdEc='
const DEMO_PRODUCT = 'AceV67og0i'
const DEMO_DEVICE = 'humi_temp'
const DEMO_ET = 1805693871

const EXPECTED_SHA1 = 'version=2018-10-31'
  + '&res=products%2FAceV67og0i%2Fdevices%2Fhumi_temp'
  + '&et=1805693871'
  + '&method=sha1'
  + '&sign=W0HLX%2F%2BI4MsQZdIsvJ9LuYuF9mM%3D'

const EXPECTED_SHA256 = 'version=2018-10-31'
  + '&res=products%2FAceV67og0i%2Fdevices%2Fhumi_temp'
  + '&et=1805693871'
  + '&method=sha256'
  + '&sign=DeEUAliqi%2BrfKT%2FFaWYYRIw%2BSsjnyDgfDDE50vJZF6c%3D'

describe('buildResourceName', () => {
  it('固定格式 products/{产品ID}/devices/{设备ID}', () => {
    expect(buildResourceName('p1', 'd1')).toBe('products/p1/devices/d1')
  })
})

describe('buildStringToSign', () => {
  it('四行用 \\n 连接，顺序是 et / method / res / version', () => {
    expect(buildStringToSign(DEMO_ET, 'sha1', 'products/p/d'))
      .toBe(`1805693871\nsha1\nproducts/p/d\n2018-10-31`)
  })

  it('version 可覆盖，默认是官方唯一支持的 2018-10-31', () => {
    expect(ONENET_TOKEN_VERSION).toBe('2018-10-31')
    expect(buildStringToSign(1, 'sha256', 'r', '2099-01-01')).toBe('1\nsha256\nr\n2099-01-01')
  })
})

describe('percentEncode', () => {
  it('转义 / + = 这些 base64 与路径里的字符', () => {
    expect(percentEncode('a/b+c=d')).toBe('a%2Fb%2Bc%3Dd')
  })

  it('encodeURIComponent 漏掉的 * 和 \' 也要转义（对齐官方示例）', () => {
    expect(percentEncode('*')).toBe('%2A')
    expect(percentEncode('\'')).toBe('%27')
  })

  it('不转义 URL 里的安全字符', () => {
    expect(percentEncode('a-b_c.d~e')).toBe('a-b_c.d~e')
  })
})

describe('base64 互转', () => {
  it('解码设备密钥', () => {
    const bytes = base64ToBytes(DEMO_KEY)
    expect(bytes.length).toBe(32)
    expect(bytesToBase64(bytes)).toBe(DEMO_KEY)
  })

  it('容忍空白与 URL-safe 变体、缺失 padding', () => {
    expect(bytesToBase64(base64ToBytes('  YWJj \n'))).toBe('YWJj')
    expect(bytesToBase64(base64ToBytes('YWJj'))).toBe('YWJj')
    expect(bytesToBase64(base64ToBytes('-_-_'))).toBe('+/+/')
  })

  it('非法输入抛 badKey', () => {
    expect(() => base64ToBytes('')).toThrow(OneNetError)
    expect(() => base64ToBytes('not base64!')).toThrow(OneNetError)
    try {
      base64ToBytes('✋✋')
    }
    catch (error) {
      expect((error as OneNetError).code).toBe('badKey')
    }
  })
})

describe('signToken 与 Python 独立实现对齐', () => {
  it('sha1 生成的整串 token 与期望值完全一致', async () => {
    const token = await signToken({
      deviceKey: DEMO_KEY,
      resourceName: buildResourceName(DEMO_PRODUCT, DEMO_DEVICE),
      et: DEMO_ET,
      method: 'sha1',
    })
    expect(token).toBe(EXPECTED_SHA1)
  })

  it('sha256 同样一致', async () => {
    const token = await signToken({
      deviceKey: DEMO_KEY,
      resourceName: buildResourceName(DEMO_PRODUCT, DEMO_DEVICE),
      et: DEMO_ET,
      method: 'sha256',
    })
    expect(token).toBe(EXPECTED_SHA256)
  })

  it('换设备密钥结果必须变化（否则说明密钥没参与运算）', async () => {
    const other = await signToken({
      deviceKey: 'YWJjZGVmZ2hpamtsbW5vcA==',
      resourceName: buildResourceName(DEMO_PRODUCT, DEMO_DEVICE),
      et: DEMO_ET,
    })
    expect(other).not.toBe(EXPECTED_SHA1)
  })
})

describe('buildOneNetConfig', () => {
  it('三元组：ClientID=设备ID，Username=产品ID，Password=token', async () => {
    const result = await buildOneNetConfig({
      productId: DEMO_PRODUCT,
      deviceId: DEMO_DEVICE,
      deviceKey: DEMO_KEY,
      et: DEMO_ET,
    })
    expect(result.ok).toBe(true)
    if (!result.ok)
      return
    expect(result.clientId).toBe(DEMO_DEVICE)
    expect(result.username).toBe(DEMO_PRODUCT)
    expect(result.token).toBe(EXPECTED_SHA1)
    expect(result.method).toBe('sha1')
    expect(result.stringToSign).toBe(`1805693871\nsha1\n${result.resourceName}\n2018-10-31`)
  })

  it('入参两侧空白会被裁掉', async () => {
    const result = await buildOneNetConfig({
      productId: ` ${DEMO_PRODUCT} `,
      deviceId: `\t${DEMO_DEVICE}\n`,
      deviceKey: `  ${DEMO_KEY}  `,
      et: DEMO_ET,
    })
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.token).toBe(EXPECTED_SHA1)
  })

  it('缺字段 / 时间非法 / 密钥非法 都返回错误码而不是抛异常', async () => {
    const base = { productId: DEMO_PRODUCT, deviceId: DEMO_DEVICE, deviceKey: DEMO_KEY, et: DEMO_ET }
    expect(await buildOneNetConfig({ ...base, productId: ' ' })).toEqual({ ok: false, code: 'emptyProduct' })
    expect(await buildOneNetConfig({ ...base, deviceId: '' })).toEqual({ ok: false, code: 'emptyDevice' })
    expect(await buildOneNetConfig({ ...base, deviceKey: '' })).toEqual({ ok: false, code: 'emptyKey' })
    expect(await buildOneNetConfig({ ...base, et: 0 })).toEqual({ ok: false, code: 'invalidExpire' })
    expect(await buildOneNetConfig({ ...base, et: Number.NaN })).toEqual({ ok: false, code: 'invalidExpire' })
    expect(await buildOneNetConfig({ ...base, deviceKey: '!!' })).toEqual({ ok: false, code: 'badKey' })
  })
})

describe('buildTopics', () => {
  it('8 条物模型 topic，前缀是 $sys/{产品ID}/{设备ID}', () => {
    const topics = buildTopics('pid', 'did')
    expect(topics).toHaveLength(8)
    for (const item of topics)
      expect(item.topic.startsWith('$sys/pid/did/thing/')).toBe(true)

    expect(topics.map(t => t.key)).toEqual([
      'propertyPost',
      'propertyPostReply',
      'propertySet',
      'propertySetReply',
      'propertyGet',
      'propertyGetReply',
      'eventPost',
      'eventPostReply',
    ])
    expect(topics[0].topic).toBe('$sys/pid/did/thing/property/post')
    expect(topics[3].topic).toBe('$sys/pid/did/thing/property/set_reply')
    expect(topics[0].direction).toBe('up')
    expect(topics[2].direction).toBe('down')
  })
})

describe('报文构造', () => {
  it('属性上报报文结构', () => {
    const payload = buildPropertyPayload([
      { identifier: 'temperature', value: 25.6 },
      { identifier: 'humidity', value: 60.2 },
    ], '123456')
    expect(JSON.parse(payload)).toEqual({
      id: '123456',
      params: {
        temperature: { value: 25.6 },
        humidity: { value: 60.2 },
      },
    })
  })

  it('回复报文结构', () => {
    expect(JSON.parse(buildReplyPayload('1'))).toEqual({ id: '1', code: 200, msg: 'success' })
  })

  it('jsonByteLength 按 UTF-8 字节算（中文 3 字节），不是 String.length', () => {
    expect(jsonByteLength('{"a":1}')).toBe(7)
    expect(jsonByteLength('温')).toBe(3)
    expect('温'.length).toBe(1)
  })
})

describe('buildAtBlocks', () => {
  const payload = buildPropertyPayload([{ identifier: 'temperature', value: 25.6 }], '123456')
  const reply = buildReplyPayload('123457')

  it('按顺序给出 网络 / MQTT / 订阅 / 上报 / 回复 / 备选 六段', () => {
    const blocks = buildAtBlocks({
      wifiSsid: 'MyWiFi',
      wifiPassword: '12345678',
      productId: DEMO_PRODUCT,
      deviceId: DEMO_DEVICE,
      token: 'TOKEN',
      payload,
      replyPayload: reply,
    })
    expect(blocks.map(b => b.key)).toEqual(['network', 'mqtt', 'subscribe', 'publish', 'reply', 'fallback'])
  })

  it('网络段带上 WiFi 与 MQTT 参数', () => {
    const blocks = buildAtBlocks({
      wifiSsid: 'MyWiFi',
      wifiPassword: 'p@ss"word',
      productId: DEMO_PRODUCT,
      deviceId: DEMO_DEVICE,
      token: 'TOKEN',
      payload,
    })
    expect(blocks[0].lines).toEqual(['AT', 'AT+CWMODE=1', 'AT+CWJAP="MyWiFi","p@ss"word"'])
    expect(blocks[1].lines[0]).toBe(`AT+MQTTUSERCFG=0,1,"${DEMO_DEVICE}","${DEMO_PRODUCT}","TOKEN",0,0,""`)
    expect(blocks[1].lines[1]).toBe(`AT+MQTTCONN=0,"${ONENET_HOSTS[0].host}",1883,1`)
  })

  it('订阅与上报用 $sys 前缀，长度用字节数', () => {
    const blocks = buildAtBlocks({
      wifiSsid: 'w',
      wifiPassword: 'p',
      productId: 'pid',
      deviceId: 'did',
      token: 'T',
      payload,
    })
    const subscribe = blocks.find(b => b.key === 'subscribe')!
    expect(subscribe.lines[0]).toBe('AT+MQTTSUB=0,"$sys/pid/did/thing/property/post/reply",0')
    expect(subscribe.lines[1]).toBe('AT+MQTTSUB=0,"$sys/pid/did/thing/property/set",0')

    const publish = blocks.find(b => b.key === 'publish')!
    expect(publish.lines[0]).toBe(`AT+MQTTPUBRAW=0,"$sys/pid/did/thing/property/post",${jsonByteLength(payload)},0,0`)
    expect(publish.lines[1]).toBe(payload)
  })

  it('没有回复报文时不产生 reply 段', () => {
    const blocks = buildAtBlocks({
      wifiSsid: 'w',
      wifiPassword: 'p',
      productId: 'pid',
      deviceId: 'did',
      token: 'T',
      payload,
    })
    expect(blocks.some(b => b.key === 'reply')).toBe(false)
  })

  it('flattenAtBlocks 按语言拼注释行', () => {
    const text = flattenAtBlocks(
      [{ key: 'network', lines: ['AT'] }, { key: 'publish', lines: ['X'] }],
      { network: '基础指令', publish: '上报数据' },
    )
    expect(text).toBe('// ===== 基础指令 =====\nAT\n// ===== 上报数据 =====\nX')
  })

  it('flattenAtBlocks 不给注释时只输出指令', () => {
    expect(flattenAtBlocks([{ key: 'network', lines: ['AT', 'AT+CWMODE=1'] }])).toBe('AT\nAT+CWMODE=1')
  })
})

describe('时间换算', () => {
  it('本地时间 ⇄ 时间戳 可以往返', () => {
    const ts = dateTimeToTimestamp('2027-03-22', '23:45')!
    expect(ts).toBeGreaterThan(0)
    expect(timestampToDateTime(ts)).toEqual({ date: '2027-03-22', time: '23:45' })
  })

  it('只给日期时按 00:00 计算', () => {
    const withTime = dateTimeToTimestamp('2027-03-22', '00:00')
    expect(dateTimeToTimestamp('2027-03-22', '')).toBe(withTime)
  })

  it('空日期或非法值返回 null', () => {
    expect(dateTimeToTimestamp('', '12:00')).toBeNull()
    expect(dateTimeToTimestamp('not-a-date', '12:00')).toBeNull()
  })

  it('expiryFromNow 按天加秒数，可注入 now 便于测试', () => {
    expect(expiryFromNow(30, 1_700_000_000_000)).toBe(1_700_000_000 + 30 * 86400)
    expect(expiryFromNow(0, 1_700_000_000_000)).toBe(1_700_000_000)
  })
})
