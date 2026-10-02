// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { onenetStore } from '@/lib/browser/onenet-store'
import { buildOneNetConfig, dateTimeToTimestamp, jsonByteLength } from '@/lib/core/onenet'
import { ONENET_STORAGE_KEY } from '@/lib/core/onenet-store'
import messages from '@/messages/zh.json'
import { OneNetMqtt } from './onenet-mqtt'

const t = messages.OneNet

/** 成功分支：buildOneNetConfig 返回的是含错误分支的联合类型 */
type OneNetOk = Extract<Awaited<ReturnType<typeof buildOneNetConfig>>, { ok: true }>

/** 与 lib/core/onenet.test.ts 用同一组向量 */
const DEMO_KEY = 'cThZSDE5bGNKRGZYV2pIdmxXNDhSMlpCUUZsUWFLdEc='
const DEMO_PRODUCT = 'AceV67og0i'
const DEMO_DEVICE = 'humi_temp'

/**
 * 固定过期时间。
 *
 * 组件不填日期时按「点击那一刻 + 30 天」算，token 就不可复现了；
 * 所以测试里显式填死日期与时间，让 token 变成确定值。
 */
const FIXED_DATE = '2027-01-01'
const FIXED_TIME = '00:00'

function renderTool() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <OneNetMqtt />
    </NextIntlClientProvider>,
  )
}

const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')
const field = (id: string) => document.getElementById(id) as HTMLInputElement
/** 日期 / 时间输入没有 id，按 type 定位 */
const dateInput = () => document.querySelector('input[type="date"]') as HTMLInputElement
const timeInput = () => document.querySelector('input[type="time"]') as HTMLInputElement
const generateButton = () => screen.getByRole('button', { name: t.generate })
const generateAtButton = () => screen.getByRole('button', { name: t.generateAt })

function rowText(label: string): string {
  const span = screen.getByText(label)
  return (span.parentElement?.parentElement?.textContent ?? '').replace(/\s+/g, ' ')
}

/** 用核心函数算出这一组输入应当得到什么 */
async function expectedBuild(method: 'sha1' | 'sha256' = 'sha1'): Promise<OneNetOk> {
  const et = dateTimeToTimestamp(FIXED_DATE, FIXED_TIME)
  if (et === null)
    throw new Error('测试用例的固定时间写错了')

  const result = await buildOneNetConfig({
    productId: DEMO_PRODUCT,
    deviceId: DEMO_DEVICE,
    deviceKey: DEMO_KEY,
    et,
    method,
  })
  if (!result.ok)
    throw new Error(`核心函数返回了错误：${result.code}`)
  return result
}

/** 填好一份合法的设备信息（含固定过期时间） */
function fillValidForm() {
  fireEvent.change(field('onenet-product'), { target: { value: DEMO_PRODUCT } })
  fireEvent.change(field('onenet-device'), { target: { value: DEMO_DEVICE } })
  fireEvent.change(field('onenet-key'), { target: { value: DEMO_KEY } })
  fireEvent.change(dateInput(), { target: { value: FIXED_DATE } })
  fireEvent.change(timeInput(), { target: { value: FIXED_TIME } })
}

async function generateAndWait() {
  fireEvent.click(generateButton())
  await waitFor(() => expect(screen.getByText(t.clientId)).toBeTruthy())
}

/**
 * store 是模块级单例、而且会写 localStorage，所以用例之间会把填过的表单带过去。
 * 每个用例开始前清干净，否则「缺产品 ID」这种校验用例会因为上一轮填过而直接通过。
 */
beforeEach(() => {
  onenetStore.reset()
})

afterEach(cleanup)

describe('oneNet · 本地持久化', () => {
  /**
   * 这里只断言「真的写进了 localStorage」这个可观测事实。
   *
   * 别写成「remount 之后值还在」—— 那会被 store 的内存缓存蒙混过关：
   * 把持久化整个关掉，这种用例照样全绿（实测过）。真正的「换实例能读回来」
   * 由 lib/core/onenet-store.test.ts 覆盖，那边是 watch 着测试失败写出来的。
   */
  const saved = () => window.localStorage.getItem(ONENET_STORAGE_KEY) ?? ''

  it('在表单里输入会实时写进 localStorage', () => {
    renderTool()
    fireEvent.change(field('onenet-product'), { target: { value: DEMO_PRODUCT } })
    fireEvent.change(field('onenet-device'), { target: { value: DEMO_DEVICE } })

    expect(JSON.parse(saved()).productId).toBe(DEMO_PRODUCT)
    expect(JSON.parse(saved()).deviceId).toBe(DEMO_DEVICE)
  })

  it('设备密钥与 WiFi 密码也写进去（明确的产品决定）', () => {
    renderTool()
    fireEvent.change(field('onenet-key'), { target: { value: DEMO_KEY } })

    expect(JSON.parse(saved()).deviceKey).toBe(DEMO_KEY)
  })

  it('过期时间不写进存储（绝对时间点存下来下次就是过期的）', () => {
    renderTool()
    fireEvent.change(dateInput(), { target: { value: FIXED_DATE } })
    fireEvent.change(timeInput(), { target: { value: FIXED_TIME } })

    expect(saved()).not.toContain(FIXED_DATE)
    expect(JSON.parse(saved()).date).toBeUndefined()
  })

  it('重置把存储里的密钥也擦掉（共用电脑要能清干净）', () => {
    renderTool()
    fireEvent.change(field('onenet-product'), { target: { value: DEMO_PRODUCT } })
    fireEvent.change(field('onenet-key'), { target: { value: DEMO_KEY } })
    expect(saved()).toContain(DEMO_KEY)

    fireEvent.click(screen.getByRole('button', { name: t.reset }))

    expect(saved()).not.toContain(DEMO_KEY)
    expect(JSON.parse(saved()).productId).toBe('')
  })
})

describe('oneNet · 初始状态', () => {
  it('结果区是空提示，AT 按钮不可用并给出提示', () => {
    renderTool()
    expect(bodyText()).toContain(t.emptyHint)
    expect((generateAtButton() as HTMLButtonElement).disabled).toBe(true)
    expect(bodyText()).toContain(t.atHint)
  })

  it('物模型 Topic 区也是空提示', () => {
    renderTool()
    // 结果卡 + Topic 卡各一处
    expect(screen.getAllByText(t.emptyHint).length).toBeGreaterThanOrEqual(2)
  })

  it('设备密钥输入框不预填任何内容（不留残留凭据）', () => {
    renderTool()
    expect(field('onenet-key').value).toBe('')
  })
})

describe('oneNet · 必填校验', () => {
  it('缺产品 ID', async () => {
    renderTool()
    fireEvent.click(generateButton())
    await waitFor(() => expect(bodyText()).toContain(t.error.emptyProduct))
  })

  it('缺设备 ID', async () => {
    renderTool()
    fireEvent.change(field('onenet-product'), { target: { value: DEMO_PRODUCT } })
    fireEvent.click(generateButton())
    await waitFor(() => expect(bodyText()).toContain(t.error.emptyDevice))
  })

  it('缺设备密钥', async () => {
    renderTool()
    fireEvent.change(field('onenet-product'), { target: { value: DEMO_PRODUCT } })
    fireEvent.change(field('onenet-device'), { target: { value: DEMO_DEVICE } })
    fireEvent.click(generateButton())
    await waitFor(() => expect(bodyText()).toContain(t.error.emptyKey))
  })

  it('设备密钥不是合法 Base64', async () => {
    renderTool()
    fireEvent.change(field('onenet-product'), { target: { value: DEMO_PRODUCT } })
    fireEvent.change(field('onenet-device'), { target: { value: DEMO_DEVICE } })
    fireEvent.change(field('onenet-key'), { target: { value: '不是 base64!!' } })
    fireEvent.click(generateButton())
    await waitFor(() => expect(bodyText()).toContain(t.error.badKey))
  })

  it('出错时不渲染 Broker / ClientID 这些结果行', async () => {
    renderTool()
    fireEvent.click(generateButton())
    await waitFor(() => expect(bodyText()).toContain(t.error.emptyProduct))
    expect(screen.queryByText(t.clientId)).toBeNull()
  })
})

describe('oneNet · 三元组生成', () => {
  it('clientID = 设备 ID，Username = 产品 ID', async () => {
    renderTool()
    fillValidForm()
    await generateAndWait()

    expect(rowText(t.clientId)).toContain(DEMO_DEVICE)
    expect(rowText(t.username)).toContain(DEMO_PRODUCT)
  })

  it('password 与核心函数算出的 token 完全一致（含 version 前缀）', async () => {
    renderTool()
    fillValidForm()
    const expected = await expectedBuild('sha1')
    await generateAndWait()

    expect(rowText(t.token)).toContain(expected.token)
    expect(expected.token.startsWith('version=2018-10-31')).toBe(true)
  })

  it('broker 用的是 OneNET 主接入点', async () => {
    renderTool()
    fillValidForm()
    await generateAndWait()
    expect(rowText(t.broker)).toContain('mqtts.heclouds.com:1883')
  })

  it('签名原文可以展开看（能对上 token 的组成部分）', async () => {
    renderTool()
    fillValidForm()
    const expected = await expectedBuild('sha1')
    await generateAndWait()
    expect(bodyText()).toContain(t.stringToSign)
    expect(bodyText()).toContain(expected.stringToSign.replace(/\n/g, ' '))
  })

  it('切到 sha256 后 token 变化，且与 sha256 的期望值一致', async () => {
    renderTool()
    fillValidForm()
    const sha1 = await expectedBuild('sha1')
    const sha256 = await expectedBuild('sha256')
    expect(sha1.token).not.toBe(sha256.token)

    fireEvent.click(screen.getByRole('button', { name: 'sha256' }))
    await generateAndWait()
    expect(rowText(t.token)).toContain(sha256.token)
    expect(rowText(t.token)).not.toContain(sha1.token)
  })

  it('物模型 Topic 全部渲染，且都是 $sys/产品ID/设备ID 前缀', async () => {
    renderTool()
    fillValidForm()
    const expected = await expectedBuild('sha1')
    await generateAndWait()

    // 注意：每个 topic 在独立的 <code> 里，而 JSX 相邻元素之间的空白会被去掉，
    // 所以整页 textContent 里这些 topic 是首尾相接的 —— 不能按空白切分来数。
    const count = (bodyText().match(/\$sys\//g) ?? []).length
    expect(count).toBe(expected.topics.length)

    for (const topic of expected.topics) {
      expect(bodyText()).toContain(topic.topic)
      expect(topic.topic).toContain(`$sys/${DEMO_PRODUCT}/${DEMO_DEVICE}`)
    }
  })

  it('上行 / 下行方向标记都出现', async () => {
    renderTool()
    fillValidForm()
    await generateAndWait()
    expect(bodyText()).toContain(t.directionUp)
    expect(bodyText()).toContain(t.directionDown)
  })
})

describe('oneNet · 属性上报 JSON', () => {
  const paramsInput = () => document.getElementById('onenet-params') as HTMLTextAreaElement

  it('默认填的就是那份温度/湿度示例', () => {
    renderTool()
    expect(JSON.parse(paramsInput().value)).toEqual({
      temperature: { value: 25.6 },
      humidity: { value: 60.2 },
    })
  })

  it('非法 JSON → 报错、输入框标红、生成按钮禁用', async () => {
    renderTool()
    fillValidForm()
    await generateAndWait()
    // 先确认正常情况下是可用的，否则「禁用了」这条断言没有意义
    expect((generateAtButton() as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(paramsInput(), { target: { value: '{ 这不是 json' } })

    expect(bodyText()).toContain(t.paramsInvalidJson)
    expect(paramsInput().getAttribute('aria-invalid')).toBe('true')
    expect((generateAtButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('最外层不是对象 → 报错（数组 / 数字都算）', async () => {
    renderTool()
    fillValidForm()
    await generateAndWait()

    for (const value of ['[]', '42']) {
      fireEvent.change(paramsInput(), { target: { value } })
      expect(bodyText(), `${value} 应当被判错`).toContain(t.paramsNotObject)
      expect((generateAtButton() as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('清空 → 报错并禁用', async () => {
    renderTool()
    fillValidForm()
    await generateAndWait()

    fireEvent.change(paramsInput(), { target: { value: '   ' } })

    expect(bodyText()).toContain(t.paramsEmpty)
    expect((generateAtButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('改 JSON 后 AT 指令里的 payload 与字节数都跟着变', async () => {
    renderTool()
    fillValidForm()
    await generateAndWait()

    const custom = '{"status": {"value": "ok"}, "relay": {"value": true}}'
    fireEvent.change(paramsInput(), { target: { value: custom } })
    expect(bodyText()).toContain(t.paramsHint)

    fireEvent.click(generateAtButton())
    await waitFor(() => expect(bodyText()).toContain(t.atBlock.publish))

    // 字符串与布尔都按 JSON 原样进报文，不被转成数字
    const expectedPayload = JSON.stringify({ id: '1', params: JSON.parse(custom) })
    expect(bodyText()).toContain(expectedPayload)
    // 字节数必须按**新** payload 算，写死 25.6 那版的话这里就对不上
    expect(bodyText()).toContain(`,${jsonByteLength(expectedPayload)},0,0`)
  })
})

describe('oneNet · AT 指令', () => {
  it('生成三元组后按钮才可用，点一下才出现指令', async () => {
    renderTool()
    fillValidForm()
    await generateAndWait()

    expect((generateAtButton() as HTMLButtonElement).disabled).toBe(false)
    expect(bodyText()).not.toContain(t.atBlock.network)

    fireEvent.click(generateAtButton())
    await waitFor(() => expect(bodyText()).toContain(t.atBlock.network))
  })

  it('aT 指令里带上了 token 与 WiFi 参数', async () => {
    renderTool()
    fillValidForm()
    const expected = await expectedBuild('sha1')
    fireEvent.change(field('onenet-ssid'), { target: { value: 'LabWiFi' } })
    await generateAndWait()
    fireEvent.click(generateAtButton())

    await waitFor(() => expect(bodyText()).toContain('LabWiFi'))
    expect(bodyText()).toContain(expected.token)
  })

  it('没填 WiFi 名称时用默认的 MyWiFi 占位，不会生成空 SSID', async () => {
    renderTool()
    fillValidForm()
    await generateAndWait()
    fireEvent.click(generateAtButton())
    await waitFor(() => expect(bodyText()).toContain('MyWiFi'))
  })
})

describe('oneNet · 过期时间与重置', () => {
  it('预设按钮会填入日期与时间', () => {
    renderTool()
    expect(dateInput().value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: t.preset30d }))
    expect(dateInput().value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(timeInput().value).toMatch(/^\d{2}:\d{2}$/)
  })

  it('+1 天与 +1 年填出来的日期不同，且都在未来', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: t.preset1d }))
    const inOneDay = dateInput().value
    fireEvent.click(screen.getByRole('button', { name: t.preset1y }))
    const inOneYear = dateInput().value

    expect(inOneDay).not.toBe(inOneYear)
    expect(new Date(`${inOneYear}T00:00:00`).getTime())
      .toBeGreaterThan(new Date(`${inOneDay}T00:00:00`).getTime())
  })

  it('重置会清空表单与结果', async () => {
    renderTool()
    fillValidForm()
    await generateAndWait()
    expect(screen.getByText(t.clientId)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: t.reset }))

    expect(field('onenet-product').value).toBe('')
    expect(field('onenet-device').value).toBe('')
    expect(field('onenet-key').value).toBe('')
    expect(screen.queryByText(t.clientId)).toBeNull()
    expect(bodyText()).toContain(t.emptyHint)
  })
})
