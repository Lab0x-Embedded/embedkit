import type { SerialSettings } from './serial'
import {
  DEFAULT_SERIAL_SETTINGS,
  normalizeSerialSettings,
} from './serial'

export type SerialDisplayMode = 'hex' | 'text' | 'ansi'
export type SerialSendMode = 'hex' | 'text'

export interface SerialDisplayOptions {
  mode: SerialDisplayMode
  showTime: boolean
  autoScroll: boolean
  /** 分包合并间隔（ms）：小于该间隔的连续数据合成一行；0 = 不合并 */
  mergeGapMs: number
}

export interface SerialSendOptions {
  mode: SerialSendMode
  content: string
  appendCrlf: boolean
  loopSend: boolean
  loopIntervalMs: number
}

export interface SerialPreset {
  id: string
  name: string
  content: string
  /** true 时内容按 HEX 解析后发送 */
  hex: boolean
}

export interface SerialToolState {
  settings: SerialSettings
  display: SerialDisplayOptions
  send: SerialSendOptions
  presets: SerialPreset[]
}

export const SERIAL_STORAGE_KEY = 'embedkit.serial.v1'

export const DEFAULT_SERIAL_STATE: SerialToolState = {
  settings: DEFAULT_SERIAL_SETTINGS,
  display: { mode: 'hex', showTime: true, autoScroll: true, mergeGapMs: 50 },
  send: { mode: 'text', content: '', appendCrlf: false, loopSend: false, loopIntervalMs: 1000 },
  presets: [
    { id: 'esp-at', name: 'AT', content: 'AT', hex: false },
    { id: 'esp-gmr', name: 'AT+GMR', content: 'AT+GMR', hex: false },
    { id: 'esp-rst', name: 'AT+RST', content: 'AT+RST', hex: false },
  ],
}

const DISPLAY_MODES: SerialDisplayMode[] = ['hex', 'text', 'ansi']
const SEND_MODES: SerialSendMode[] = ['hex', 'text']

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value)
  if (!Number.isFinite(num))
    return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

function normalizePresets(raw: unknown): SerialPreset[] {
  if (!Array.isArray(raw))
    return DEFAULT_SERIAL_STATE.presets

  const presets: SerialPreset[] = []
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object')
      return
    const entry = item as Partial<Record<keyof SerialPreset, unknown>>
    if (typeof entry.content !== 'string')
      return
    presets.push({
      id: typeof entry.id === 'string' && entry.id ? entry.id : `preset-${index}`,
      name: typeof entry.name === 'string' && entry.name ? entry.name : `#${index + 1}`,
      content: entry.content,
      hex: entry.hex === true,
    })
  })
  return presets
}

/** 校验从本地存储读回来的整份状态；任何坏值都回退成默认，保证 UI 不炸 */
export function normalizeSerialState(raw: unknown): SerialToolState {
  const source = (raw ?? {}) as Partial<Record<keyof SerialToolState, unknown>>
  const display = (source.display ?? {}) as Partial<SerialDisplayOptions>
  const send = (source.send ?? {}) as Partial<SerialSendOptions>

  return {
    settings: normalizeSerialSettings(source.settings),
    display: {
      mode: DISPLAY_MODES.includes(display.mode as SerialDisplayMode)
        ? (display.mode as SerialDisplayMode)
        : DEFAULT_SERIAL_STATE.display.mode,
      showTime: display.showTime !== false,
      autoScroll: display.autoScroll !== false,
      mergeGapMs: clampNumber(display.mergeGapMs, 0, 5000, DEFAULT_SERIAL_STATE.display.mergeGapMs),
    },
    send: {
      mode: SEND_MODES.includes(send.mode as SerialSendMode)
        ? (send.mode as SerialSendMode)
        : DEFAULT_SERIAL_STATE.send.mode,
      content: typeof send.content === 'string' ? send.content : '',
      appendCrlf: send.appendCrlf === true,
      loopSend: send.loopSend === true,
      loopIntervalMs: clampNumber(send.loopIntervalMs, 20, 600000, DEFAULT_SERIAL_STATE.send.loopIntervalMs),
    },
    presets: normalizePresets(source.presets),
  }
}

/** 只依赖 getItem/setItem，便于在 node 里用假存储单测 */
export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface SerialStore {
  /** 客户端快照（读本地存储，缓存住，避免每次渲染都 JSON.parse） */
  getSnapshot: () => SerialToolState
  /** 服务端/hydration 快照：始终是默认值，保证首屏与 SSG 的 HTML 一致 */
  getServerSnapshot: () => SerialToolState
  subscribe: (listener: () => void) => () => void
  update: (patch: Partial<SerialToolState>) => void
}

/**
 * 串口助手的状态存储。
 *
 * 用 useSyncExternalStore 消费：SSR/hydration 阶段走 getServerSnapshot（默认值），
 * 客户端再切成真实快照 —— 这样「本地存了参数」不会导致 hydration 不一致，
 * 也不需要「挂载后再 setState」那种会被 lint 拦的写法。
 */
export function createSerialStore(storage: StorageLike | null, key = SERIAL_STORAGE_KEY): SerialStore {
  let cache: SerialToolState | null = null
  const listeners = new Set<() => void>()

  const read = (): SerialToolState => {
    if (!storage)
      return DEFAULT_SERIAL_STATE
    try {
      const raw = storage.getItem(key)
      if (!raw)
        return DEFAULT_SERIAL_STATE
      return normalizeSerialState(JSON.parse(raw))
    }
    catch {
      // 存储坏了（用户手改、旧版本格式）就当默认值，不打断使用
      return DEFAULT_SERIAL_STATE
    }
  }

  return {
    getSnapshot: () => {
      cache ??= read()
      return cache
    },
    getServerSnapshot: () => DEFAULT_SERIAL_STATE,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    update: (patch) => {
      const next: SerialToolState = { ...cache ?? read(), ...patch }
      cache = next
      try {
        storage?.setItem(key, JSON.stringify(next))
      }
      catch {
        // 隐私模式 / 配额满：状态仍在本会话生效
      }
      for (const listener of listeners)
        listener()
    },
  }
}
