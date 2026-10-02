/**
 * OneNET 页面表单的本地持久化。
 *
 * 和串口助手用的是同一套模式（见 lib/core/serial-store.ts）：
 * 纯工厂 + 可注入的 storage，方便在 node 里用假存储单测；
 * 组件侧用 useSyncExternalStore 消费，SSR 走 getServerSnapshot 保证 hydration 一致。
 *
 * **为什么密钥和 WiFi 密码也存**：这是明确的产品决定（用户要求「都持久化，在本地没事」）。
 * 所以页面上必须写明这一点，并且「重置」要能一键清干净 —— 否则就是在误导使用者。
 * 想改回「敏感字段不落盘」的话，记得同步改 messages 里的 deviceKeyNote / noteLocal
 * 和 SKILL 的约定第 4 条，再改这里的白名单。
 *
 * 属性上报的 params 以**原始文本**存（propertyParams），不是解析后的对象 —— 见该字段注释。
 *
 * **过期时间（date/time）也进存储**：用户填过的东西刷新后要能回显，丢掉比显示
 * 一个可能已过期的值更让人困惑。是否已过期由页面提示，存储层不判断时间。
 * 留空表示「从现在起 N 天」，每次重算，所以默认值必须是空串。
 */

import type { OneNetMethod } from './onenet'
import type { StorageLike } from './serial-store'

export interface OneNetFormState {
  productId: string
  deviceId: string
  deviceKey: string
  method: OneNetMethod
  wifiSsid: string
  wifiPassword: string
  /**
   * 属性上报的 params，**存的是文本框里的原始文本**，不是解析结果。
   * 存原始文本的原因：可能存着半截没写完的 JSON，重开还得能接着改；
   * 存解析结果的话，一处语法错误就会把用户写的东西整个丢掉。
   */
  propertyParams: string
  /**
   * Token 过期时间（年月日 / 时:分 两个输入框）。
   *
   * 存的是**绝对时间点**，所以刷新回来可能已经过去了 —— 但存储层不做时间判断：
   * 丢掉用户填过的东西比显示一个过期值更让人困惑。过期由页面给提示（见组件里的
   * isExpiryPast），留空则按「现在 + 30 天」滚动计算。
   */
  date: string
  time: string
}

export const ONENET_STORAGE_KEY = 'embedkit.onenet.v1'

/** 默认示例：就是原来那两组写死的温度/湿度，换成可以直接改的 JSON */
const DEFAULT_PROPERTY_PARAMS = `{
  "temperature": { "value": 25.6 },
  "humidity": { "value": 60.2 }
}`

export const DEFAULT_ONENET_STATE: OneNetFormState = {
  productId: '',
  deviceId: '',
  deviceKey: '',
  method: 'sha1',
  wifiSsid: '',
  wifiPassword: '',
  propertyParams: DEFAULT_PROPERTY_PARAMS,
  // 留空 = 按「现在 + 30 天」算，所以默认必须是空的
  date: '',
  time: '',
}

const METHODS: OneNetMethod[] = ['sha1', 'sha256']

/** 允许从存储里读回来的字符串字段（date/time 不在此列，见文件头注释） */
const TEXT_FIELDS = [
  'productId',
  'deviceId',
  'deviceKey',
  'wifiSsid',
  'wifiPassword',
  'propertyParams',
  'date',
  'time',
] as const

/** 校验从本地存储读回来的状态；坏值逐项回退成默认，保证 UI 不炸 */
export function normalizeOneNetState(raw: unknown): OneNetFormState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return DEFAULT_ONENET_STATE

  const source = raw as Record<string, unknown>
  const state: OneNetFormState = { ...DEFAULT_ONENET_STATE }

  for (const field of TEXT_FIELDS) {
    const value = source[field]
    if (typeof value === 'string')
      state[field] = value
  }

  if (METHODS.includes(source.method as OneNetMethod))
    state.method = source.method as OneNetMethod

  return state
}

export interface OneNetStore {
  /** 客户端快照（读本地存储并缓存，避免每次渲染都 JSON.parse） */
  getSnapshot: () => OneNetFormState
  /** 服务端/hydration 快照：固定默认值，保证首屏与 SSG 的 HTML 一致 */
  getServerSnapshot: () => OneNetFormState
  subscribe: (listener: () => void) => () => void
  update: (patch: Partial<OneNetFormState>) => void
  /** 清回默认值，**同时清掉存储**（共用电脑时靠它擦掉密钥） */
  reset: () => void
}

export function createOneNetStore(
  storage: StorageLike | null,
  key = ONENET_STORAGE_KEY,
): OneNetStore {
  let cache: OneNetFormState | null = null
  const listeners = new Set<() => void>()

  const read = (): OneNetFormState => {
    if (!storage)
      return DEFAULT_ONENET_STATE
    try {
      const raw = storage.getItem(key)
      if (!raw)
        return DEFAULT_ONENET_STATE
      return normalizeOneNetState(JSON.parse(raw))
    }
    catch {
      // 存储坏了（用户手改、旧版本格式）就当默认值，不打断使用
      return DEFAULT_ONENET_STATE
    }
  }

  const commit = (next: OneNetFormState) => {
    cache = next
    try {
      storage?.setItem(key, JSON.stringify(next))
    }
    catch {
      // 隐私模式 / 配额满：状态仍在本会话生效
    }
    for (const listener of listeners)
      listener()
  }

  return {
    getSnapshot: () => {
      cache ??= read()
      return cache
    },
    getServerSnapshot: () => DEFAULT_ONENET_STATE,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    update: (patch) => {
      commit({ ...cache ?? read(), ...patch })
    },
    reset: () => {
      commit({ ...DEFAULT_ONENET_STATE })
    },
  }
}
