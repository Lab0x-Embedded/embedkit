import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SERIAL_SETTINGS,
  normalizeSerialSettings,
} from './serial'
import {
  createSerialStore,
  DEFAULT_SERIAL_STATE,
  normalizeSerialState,
  SERIAL_STORAGE_KEY,
} from './serial-store'

/** 内存假存储：store 只依赖 getItem/setItem，所以可以在 node 里测 */
function createFakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

describe('normalizeSerialSettings', () => {
  it('合法值原样保留', () => {
    const settings = { baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even', flowControl: 'hardware' } as const
    expect(normalizeSerialSettings(settings)).toEqual(settings)
  })

  it('非法值回退默认（手改过 localStorage 也不炸）', () => {
    expect(normalizeSerialSettings({ baudRate: 12345, dataBits: 9, stopBits: 3, parity: 'x', flowControl: 'y' }))
      .toEqual(DEFAULT_SERIAL_SETTINGS)
    expect(normalizeSerialSettings(null)).toEqual(DEFAULT_SERIAL_SETTINGS)
    expect(normalizeSerialSettings(undefined)).toEqual(DEFAULT_SERIAL_SETTINGS)
  })

  it('波特率字符串也接受（旧版本存成过字符串）', () => {
    expect(normalizeSerialSettings({ baudRate: '9600' }).baudRate).toBe(9600)
  })
})

describe('normalizeSerialState', () => {
  it('空输入得到默认状态', () => {
    expect(normalizeSerialState(null)).toEqual(DEFAULT_SERIAL_STATE)
    expect(normalizeSerialState({})).toEqual(DEFAULT_SERIAL_STATE)
  })

  it('保留合法字段', () => {
    const state = normalizeSerialState({
      settings: { baudRate: 74880 },
      display: { mode: 'ansi', showTime: false, autoScroll: false, mergeGapMs: 0 },
      send: { mode: 'hex', content: '01 02', appendCrlf: true, loopSend: true, loopIntervalMs: 500 },
      presets: [{ id: 'p1', name: 'ping', content: 'AA BB', hex: true }],
    })
    expect(state.settings.baudRate).toBe(74880)
    expect(state.display).toEqual({ mode: 'ansi', showTime: false, autoScroll: false, mergeGapMs: 0 })
    expect(state.send).toEqual({ mode: 'hex', content: '01 02', appendCrlf: true, loopSend: true, loopIntervalMs: 500 })
    expect(state.presets).toEqual([{ id: 'p1', name: 'ping', content: 'AA BB', hex: true }])
  })

  it('枚举非法时回退，间隔被夹到合理区间', () => {
    const state = normalizeSerialState({
      display: { mode: 'rainbow', mergeGapMs: -5 },
      send: { mode: 'binary', loopIntervalMs: 10 ** 9 },
    })
    expect(state.display.mode).toBe('hex')
    expect(state.display.mergeGapMs).toBe(0)
    expect(state.send.mode).toBe('text')
    expect(state.send.loopIntervalMs).toBe(600000)
  })

  it('快捷指令里缺字段/非法的项被丢掉或补默认', () => {
    const state = normalizeSerialState({
      presets: [
        { content: 'AT' },
        { name: '没有内容' },
        null,
        'string',
        { id: 'x', name: '重启', content: 'AT+RST', hex: 'yes' },
      ],
    })
    expect(state.presets).toHaveLength(2)
    expect(state.presets[0]).toEqual({ id: 'preset-0', name: '#1', content: 'AT', hex: false })
    expect(state.presets[1]).toEqual({ id: 'x', name: '重启', content: 'AT+RST', hex: false })
  })

  it('presets 不是数组时用默认快捷指令', () => {
    expect(normalizeSerialState({ presets: 'nope' }).presets).toEqual(DEFAULT_SERIAL_STATE.presets)
  })
})

describe('createSerialStore', () => {
  it('服务端快照永远是默认值（hydration 才不会不一致）', () => {
    const storage = createFakeStorage({ [SERIAL_STORAGE_KEY]: JSON.stringify({ settings: { baudRate: 9600 } }) })
    const store = createSerialStore(storage)
    expect(store.getServerSnapshot()).toEqual(DEFAULT_SERIAL_STATE)
    expect(store.getSnapshot().settings.baudRate).toBe(9600)
  })

  it('没有存储（隐私模式 / SSR）时返回默认值', () => {
    const store = createSerialStore(null)
    expect(store.getSnapshot()).toEqual(DEFAULT_SERIAL_STATE)
  })

  it('存储内容坏掉时回退默认而不是抛异常', () => {
    const store = createSerialStore(createFakeStorage({ [SERIAL_STORAGE_KEY]: '{ not json' }))
    expect(store.getSnapshot()).toEqual(DEFAULT_SERIAL_STATE)
  })

  it('update 会合并、落盘并通知订阅者', () => {
    const storage = createFakeStorage()
    const store = createSerialStore(storage)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.update({ display: { ...DEFAULT_SERIAL_STATE.display, mode: 'ansi' } })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().display.mode).toBe('ansi')
    expect(JSON.parse(storage.getItem(SERIAL_STORAGE_KEY)!).display.mode).toBe('ansi')

    unsubscribe()
    store.update({ presets: [] })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('更新后的值能被新实例读回来（同一份存储）', () => {
    const storage = createFakeStorage()
    createSerialStore(storage).update({ send: { ...DEFAULT_SERIAL_STATE.send, content: 'AT+GMR' } })
    expect(createSerialStore(storage).getSnapshot().send.content).toBe('AT+GMR')
  })

  it('写存储抛异常时仍然在本会话生效', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    const store = createSerialStore(storage)
    store.update({ send: { ...DEFAULT_SERIAL_STATE.send, content: 'x' } })
    expect(store.getSnapshot().send.content).toBe('x')
  })
})
