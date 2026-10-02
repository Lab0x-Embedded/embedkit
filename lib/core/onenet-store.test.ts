import { describe, expect, it } from 'vitest'
import {
  createOneNetStore,
  DEFAULT_ONENET_STATE,
  normalizeOneNetState,
  ONENET_STORAGE_KEY,
} from './onenet-store'

/** 只实现 getItem/setItem 的假存储，和串口的测试用同一套思路 */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('onenetStore · 持久化', () => {
  it('没有 storage 时（SSR）读到的就是默认值', () => {
    const store = createOneNetStore(null)
    expect(store.getSnapshot()).toEqual(DEFAULT_ONENET_STATE)
    expect(store.getServerSnapshot()).toEqual(DEFAULT_ONENET_STATE)
  })

  it('update 之后新快照生效，并且写进了 storage', () => {
    const storage = fakeStorage()
    const store = createOneNetStore(storage)

    store.update({ productId: 'AceV67og0i', deviceId: 'humi_temp' })

    expect(store.getSnapshot().productId).toBe('AceV67og0i')
    const saved = JSON.parse(storage.data.get(ONENET_STORAGE_KEY) ?? '{}')
    expect(saved.productId).toBe('AceV67og0i')
    expect(saved.deviceId).toBe('humi_temp')
  })

  it('换一个 store 实例能从同一份存储里读回来（这就是「刷新还在」）', () => {
    const storage = fakeStorage()
    createOneNetStore(storage).update({ wifiSsid: 'LabWiFi', tempValue: '26.1' })

    const reopened = createOneNetStore(storage)
    expect(reopened.getSnapshot().wifiSsid).toBe('LabWiFi')
    expect(reopened.getSnapshot().tempValue).toBe('26.1')
  })

  it('设备密钥与 WiFi 密码也会存下来（明确的产品决定，别偷偷改回不存）', () => {
    const storage = fakeStorage()
    createOneNetStore(storage).update({ deviceKey: 'secret-key', wifiPassword: 'hunter2' })

    const reopened = createOneNetStore(storage)
    expect(reopened.getSnapshot().deviceKey).toBe('secret-key')
    expect(reopened.getSnapshot().wifiPassword).toBe('hunter2')
  })

  it('update 会通知订阅者', () => {
    const store = createOneNetStore(fakeStorage())
    let calls = 0
    const unsubscribe = store.subscribe(() => {
      calls += 1
    })

    store.update({ deviceId: 'dev-1' })
    expect(calls).toBe(1)

    unsubscribe()
    store.update({ deviceId: 'dev-2' })
    expect(calls).toBe(1)
  })

  it('reset 把内存和存储一起清回默认值', () => {
    const storage = fakeStorage()
    const store = createOneNetStore(storage)
    store.update({ productId: 'p', deviceKey: 'k', wifiPassword: 'w' })

    store.reset()

    expect(store.getSnapshot()).toEqual(DEFAULT_ONENET_STATE)
    const saved = JSON.parse(storage.data.get(ONENET_STORAGE_KEY) ?? '{}')
    expect(saved.productId).toBe('')
    expect(saved.deviceKey).toBe('')
    expect(saved.wifiPassword).toBe('')
  })

  it('update 不接受 date/time（过期时间不进存储，否则回来就是过期的）', () => {
    const store = createOneNetStore(fakeStorage())
    store.update({ deviceId: 'dev-1' })

    expect('date' in store.getSnapshot()).toBe(false)
    expect('time' in store.getSnapshot()).toBe(false)
  })
})

describe('onenetStore · 坏数据兜底', () => {
  it('存储里是非法 JSON 时退回默认值，不抛异常', () => {
    const storage = fakeStorage({ [ONENET_STORAGE_KEY]: '{ 这不是 json' })
    expect(createOneNetStore(storage).getSnapshot()).toEqual(DEFAULT_ONENET_STATE)
  })

  it('缺字段 / 类型不对时逐项回退，好字段仍然保留', () => {
    const storage = fakeStorage({
      [ONENET_STORAGE_KEY]: JSON.stringify({
        productId: 'keep-me',
        deviceId: 12345, // 类型错 → 回退
        method: 'md5', // 不在白名单 → 回退
      }),
    })

    const state = createOneNetStore(storage).getSnapshot()
    expect(state.productId).toBe('keep-me')
    expect(state.deviceId).toBe(DEFAULT_ONENET_STATE.deviceId)
    expect(state.method).toBe(DEFAULT_ONENET_STATE.method)
    expect(state.tempId).toBe(DEFAULT_ONENET_STATE.tempId)
  })

  it('normalize 接受 null / 非对象 / 空对象', () => {
    for (const raw of [null, undefined, 42, 'x', [], {}])
      expect(normalizeOneNetState(raw)).toEqual(DEFAULT_ONENET_STATE)
  })

  it('setItem 抛异常（隐私模式 / 配额满）时内存状态仍然生效', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const store = createOneNetStore(storage)

    expect(() => store.update({ deviceId: 'dev-1' })).not.toThrow()
    expect(store.getSnapshot().deviceId).toBe('dev-1')
  })
})
