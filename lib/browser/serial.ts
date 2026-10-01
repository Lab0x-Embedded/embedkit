/**
 * Web Serial API 封装（浏览器限定；这里允许碰 navigator / DOM）。
 *
 * 只做薄封装，不掺业务逻辑：端口选择、开关、读循环、写入。
 * 纯计算（HEX 解析、分包合并等）在 lib/core/serial.ts，那边有单测。
 */

import type { SerialSettings } from '@/lib/core/serial'

export {
  BAUD_RATES,
  DATA_BITS,
  DEFAULT_SERIAL_SETTINGS as DEFAULT_SETTINGS,
  FLOW_CONTROLS,
  PARITIES,
  STOP_BITS,
} from '@/lib/core/serial'
export type {
  DataBits,
  SerialFlowControl,
  SerialParity,
  SerialSettings,
  StopBits,
} from '@/lib/core/serial'

/** Web Serial 只在 Chromium 系桌面浏览器（且 https / localhost）可用 */
export function isSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator && Boolean(navigator.serial)
}

/** 已经授权过的端口（刷新页面后仍可复用，不需要重新弹窗） */
export async function listAuthorizedPorts(): Promise<SerialPort[]> {
  if (!isSerialSupported())
    return []
  return navigator.serial.getPorts()
}

/** 弹出系统选择框让用户授权一个端口（必须在用户手势里调用） */
export async function requestPort(): Promise<SerialPort> {
  return navigator.serial.requestPort()
}

/** 端口标签：优先厂商/产品 ID，其次序号 */
export function describePort(port: SerialPort, index = 0): string {
  const info = port.getInfo?.()
  if (info?.usbVendorId != null && info.usbProductId != null) {
    const vendor = info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')
    const product = info.usbProductId.toString(16).toUpperCase().padStart(4, '0')
    return `USB ${vendor}:${product}`
  }
  return `Serial #${index + 1}`
}

export async function openPort(port: SerialPort, settings: SerialSettings): Promise<void> {
  await port.open({
    baudRate: settings.baudRate,
    dataBits: settings.dataBits,
    stopBits: settings.stopBits,
    parity: settings.parity,
    flowControl: settings.flowControl,
    bufferSize: 4096,
  })
}

export async function closePort(port: SerialPort): Promise<void> {
  await port.close()
}

/** 写一段字节（自动获取/释放 writer 锁） */
export async function writeBytes(port: SerialPort, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  if (!port.writable)
    throw new Error('port-not-open')

  const writer = port.writable.getWriter()
  try {
    await writer.write(bytes)
  }
  finally {
    writer.releaseLock()
  }
}

export interface ReadLoopHandlers {
  onChunk: (bytes: Uint8Array<ArrayBuffer>) => void
  /** 读循环结束（拔线、关闭、出错）都会回调一次 */
  onEnd?: (error?: unknown) => void
}

export interface ReadLoop {
  /** 停止读取：cancel 会让 read() promise 结束，随后释放锁并关端口 */
  stop: () => Promise<void>
}

/**
 * 启动读循环。
 *
 * 与 Web Serial 的约束一致：`port.readable` 拿到 reader，`read()` 直到 done；
 * 停止时先 `reader.cancel()`（否则 read() 永远挂着），再 releaseLock，最后关端口。
 */
export function startReadLoop(port: SerialPort, handlers: ReadLoopHandlers): ReadLoop {
  let stopped = false
  /** 用函数读取，别让 while 的条件看起来「循环里从不修改」 */
  const isStopped = () => stopped
  let currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null

  const run = async () => {
    try {
      while (!isStopped() && port.readable) {
        const reader = port.readable.getReader()
        currentReader = reader
        /** 流读完（done）就该收工：别在 port.readable 还没被置空时开新 reader 空转 */
        let streamEnded = false
        try {
          while (!isStopped()) {
            const { value, done } = await reader.read()
            if (done) {
              streamEnded = true
              break
            }
            if (value && value.length > 0)
              handlers.onChunk(Uint8Array.from(value) as Uint8Array<ArrayBuffer>)
          }
        }
        catch (error) {
          // cancel() 触发的 AbortError 属于正常停止路径
          if (!stopped)
            handlers.onEnd?.(error)
          streamEnded = true
        }
        finally {
          reader.releaseLock()
          currentReader = null
        }
        if (streamEnded)
          break
      }
    }
    finally {
      handlers.onEnd?.()
    }
  }

  void run()

  return {
    stop: async () => {
      if (stopped)
        return
      stopped = true
      try {
        await currentReader?.cancel()
      }
      catch {
        // 端口已经拔掉时 cancel 会抛，忽略
      }
    },
  }
}
