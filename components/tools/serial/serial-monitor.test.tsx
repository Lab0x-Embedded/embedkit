// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serialStore } from '@/lib/browser/serial-store'
import { DEFAULT_SERIAL_STATE } from '@/lib/core/serial-store'
import messages from '@/messages/zh.json'
import { SerialMonitor } from './serial-monitor'

/**
 * 断言用的文案全部从 messages 里取。
 *
 * 以前这里写死了「复用已授权端口」这类中文字面量，改一个字的文案就红一片 ——
 * 文案本来就不是测试要保护的东西，键和 UI 的对应关系才是。
 */
const t = messages.Serial

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

/** 不额外引入 jest-dom：直接看原生属性，依赖更少 */
function isDisabled(element: HTMLElement) {
  return (element as HTMLButtonElement).disabled === true
}

/** 假串口：能塞数据、能收写入，配合组件把整条链路跑通（真串口得插硬件） */
class FakePort {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null

  private controller!: ReadableStreamDefaultController<Uint8Array>
  written: Uint8Array[] = []
  opened = false
  closed = false

  constructor(private readonly info = { usbVendorId: 0x1A86, usbProductId: 0x7523 }) {
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller
      },
      // 真浏览器里流被取消后 port.readable 会变 null，假串口照做，
      // 否则读循环会对着同一个死流不停开 reader
      cancel: () => {
        this.readable = null
      },
    })
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.written.push(Uint8Array.from(chunk))
      },
    })
  }

  async open() {
    this.opened = true
  }

  async close() {
    this.closed = true
    this.readable = null
    this.writable = null
  }

  getInfo() {
    return this.info
  }

  /** 模拟设备发来一段数据 */
  emit(bytes: number[]) {
    this.controller.enqueue(Uint8Array.from(bytes))
  }

  /** 模拟拔线 */
  end() {
    this.controller.close()
    this.readable = null
    this.writable = null
  }

  get hexWrites() {
    return this.written.map(bytes => [...bytes].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '))
  }
}

let port: FakePort

function installSerial(ports: FakePort[]) {
  const api = {
    getPorts: vi.fn(async () => ports),
    requestPort: vi.fn(async () => ports[0]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  Object.defineProperty(navigator, 'serial', { value: api, configurable: true })
  return api
}

function renderMonitor() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <SerialMonitor />
    </NextIntlClientProvider>,
  )
}

const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')

async function openPort() {
  fireEvent.click(screen.getByRole('button', { name: t.reusePort }))
  fireEvent.click(await screen.findByRole('button', { name: t.open }))
  await screen.findByText(t.statusOpen)
}

beforeEach(() => {
  port = new FakePort()
  vi.clearAllMocks()
  // store 是模块级单例，测试之间要回到默认值
  serialStore.update(structuredClone(DEFAULT_SERIAL_STATE))
})

afterEach(() => {
  // 先卸载组件再摘掉 navigator.serial：卸载里要用它解绑事件
  cleanup()
  Reflect.deleteProperty(navigator, 'serial')
})

describe('serialMonitor · 浏览器支持', () => {
  it('不支持 Web Serial 时给出提示并禁用控件', () => {
    renderMonitor()
    expect(bodyText()).toContain(t.unsupported)
    expect(isDisabled(screen.getByRole('button', { name: t.selectPort }))).toBe(true)
    expect(isDisabled(screen.getByRole('button', { name: t.reusePort }))).toBe(true)
  })

  it('支持时不再显示提示，没选端口则不能打开', () => {
    installSerial([port])
    renderMonitor()
    expect(bodyText()).not.toContain(t.unsupported)
    expect(isDisabled(screen.getByRole('button', { name: t.selectPort }))).toBe(false)
    expect(isDisabled(screen.getByRole('button', { name: t.open }))).toBe(true)
    expect(bodyText()).toContain(t.noPort)
  })
})

describe('serialMonitor · 连接与收发', () => {
  it('复用已授权端口后按 USB 信息显示，并能按默认参数打开', async () => {
    installSerial([port])
    renderMonitor()

    fireEvent.click(screen.getByRole('button', { name: t.reusePort }))
    expect(await screen.findByText('USB 1A86:7523')).toBeTruthy()

    fireEvent.click(await screen.findByRole('button', { name: t.open }))
    await screen.findByText(t.statusOpen)
    expect(port.opened).toBe(true)
    expect(bodyText()).toContain(t.close)
  })

  it('文本发送写入 UTF-8 字节，勾了 CRLF 就补 0D 0A', async () => {
    installSerial([port])
    serialStore.update({ send: { ...DEFAULT_SERIAL_STATE.send, content: '', appendCrlf: true } })
    renderMonitor()
    await openPort()

    fireEvent.change(screen.getByPlaceholderText(t.sendTextPlaceholder), { target: { value: 'AT+GMR' } })
    fireEvent.click(screen.getByRole('button', { name: t.sendButton }))

    await vi.waitFor(() => expect(port.written).toHaveLength(1))
    expect(port.hexWrites[0]).toBe('41 54 2B 47 4D 52 0D 0A')
    // 统计要等这一轮渲染落地
    await vi.waitFor(() => expect(bodyText()).toContain(`${t.sent} 8 B`))
  })

  it('hex 发送非法内容只报错、不写端口', async () => {
    installSerial([port])
    serialStore.update({ send: { ...DEFAULT_SERIAL_STATE.send, mode: 'hex', content: '' } })
    renderMonitor()
    await openPort()

    fireEvent.change(screen.getByPlaceholderText(t.sendHexPlaceholder), { target: { value: 'ABC' } })
    fireEvent.click(screen.getByRole('button', { name: t.sendButton }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(t.error.oddLength))
    expect(port.written).toHaveLength(0)
  })

  it('收到数据按 HEX 上屏并累计收字节数（合并间隔 0 = 不合并）', async () => {
    installSerial([port])
    serialStore.update({ display: { ...DEFAULT_SERIAL_STATE.display, mode: 'hex', mergeGapMs: 0 } })
    renderMonitor()
    await openPort()

    port.emit([0xAA, 0xBB])
    expect(await screen.findByText('AA BB')).toBeTruthy()
    expect(bodyText()).toContain(`${t.received} 2 B`)
  })

  it('文本模式下中文按 UTF-8 正确显示', async () => {
    installSerial([port])
    serialStore.update({ display: { ...DEFAULT_SERIAL_STATE.display, mode: 'text', mergeGapMs: 0 } })
    renderMonitor()
    await openPort()

    port.emit([...new TextEncoder().encode('温度=25.6')])
    expect(await screen.findByText('温度=25.6')).toBeTruthy()
  })

  it('ansi 模式把颜色转义渲染成 span（且 HTML 被转义）', async () => {
    installSerial([port])
    serialStore.update({ display: { ...DEFAULT_SERIAL_STATE.display, mode: 'ansi', mergeGapMs: 0 } })
    const { container } = renderMonitor()
    await openPort()

    port.emit([...new TextEncoder().encode('\u001B[31mERROR\u001B[0m <b>')])
    await vi.waitFor(() => {
      expect(container.querySelector('span[style*="color"]')?.textContent).toContain('ERROR')
    })
    // 原始 <b> 不应该变成真标签
    expect(container.querySelector('b')).toBeNull()
    expect(bodyText()).toContain('<b>')
  })

  it('快捷指令：HEX 条目按字节发送', async () => {
    installSerial([port])
    serialStore.update({
      presets: [{ id: 'p1', name: 'ping', content: 'AA 55', hex: true }],
    })
    renderMonitor()
    await openPort()

    fireEvent.click(screen.getByRole('button', { name: 'ping' }))
    await vi.waitFor(() => expect(port.written).toHaveLength(1))
    expect(port.hexWrites[0]).toBe('AA 55')
  })

  it('拔线后状态回到「已断开」', async () => {
    installSerial([port])
    renderMonitor()
    await openPort()

    port.end()
    await screen.findByText(t.statusClosed)
  })
})

describe('serialMonitor · 配置留存', () => {
  it('切换显示模式会写进 localStorage，刷新后仍生效', () => {
    installSerial([port])
    renderMonitor()

    fireEvent.click(screen.getByRole('button', { name: t.modeAnsi }))

    const saved = JSON.parse(window.localStorage.getItem('embedkit.serial.v1') ?? '{}')
    expect(saved.display.mode).toBe('ansi')
    expect(serialStore.getSnapshot().display.mode).toBe('ansi')
  })

  it('默认带上 AT 系列快捷指令', () => {
    installSerial([port])
    renderMonitor()
    for (const name of ['AT', 'AT+GMR', 'AT+RST'])
      expect(screen.getByRole('button', { name })).toBeTruthy()
  })
})
