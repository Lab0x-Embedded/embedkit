// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '@/messages/zh.json'
import { UnitConverter } from './unit-converter'

const t = messages.UnitConverter

/**
 * RadixCard 里的 next-intl Link 需要 App Router 运行时上下文，
 * 纯组件测试里没有 —— 换成朴素 <a>，href 由这一层自己拼（同 tools-nav 测试）。
 */
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string, children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

function renderTool() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <UnitConverter />
    </NextIntlClientProvider>,
  )
}

const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement
}

function type(id: string, text: string) {
  fireEvent.change(input(id), { target: { value: text } })
}

/** 把 `{name}` 换成实际值，得到 ICU 在运行时渲染出来的那句话 */
function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`))
}

afterEach(cleanup)

describe('unitConverter · 页签', () => {
  it('五个区块都在 DOM 里（forceMount），但只有激活页签可见', () => {
    renderTool()
    // forceMount：未激活页签的内容不卸载，输入状态切走再回来还在
    const storageContent = input('storage-input').closest('[data-slot="tabs-content"]')
    expect(storageContent?.getAttribute('data-state')).toBe('inactive')
    const freqContent = input('freq-input').closest('[data-slot="tabs-content"]')
    expect(freqContent?.getAttribute('data-state')).toBe('active')
    // 页签按钮是 role=tab，不会混进工具内部的 button 查询
    expect(screen.getAllByRole('tab')).toHaveLength(5)
  })
})

describe('unitConverter · 频率 ↔ 周期', () => {
  it('默认 1 MHz：频率与周期两列都渲染出来', () => {
    renderTool()
    expect(input('freq-input').value).toBe('1')
    expect(bodyText()).toContain('1000000') // Hz
    expect(bodyText()).toContain('0.001') // GHz 与 ms
    expect(bodyText()).toContain('0.000001') // 1 MHz 的周期是 1 μs = 0.000001 s
  })

  it('点 ns 后输入 1：频率精确等于 1 GHz（Decimal 不经过 Number）', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: 'ns' }))
    type('freq-input', '1')
    expect(bodyText()).toContain('1000000000') // Hz 行精确展开
    expect(bodyText()).not.toContain('999999999')
  })

  it('0 会做除法的分母，给出专门的提示', () => {
    renderTool()
    type('freq-input', '0')
    expect(bodyText()).toContain(t.errorPositive)
  })

  it('清空后回到空态提示', () => {
    renderTool()
    type('freq-input', '')
    expect(bodyText()).toContain(t.emptyHint)
  })

  it('非数字报 invalid', () => {
    renderTool()
    type('freq-input', '12x')
    expect(bodyText()).toContain(t.errorInvalid)
  })
})

describe('unitConverter · 存储容量与通信速率', () => {
  it('默认 1 KB：按 1024 进制给出 1024 B 与 8192 bit', () => {
    renderTool()
    expect(input('storage-input').value).toBe('1')
    expect(bodyText()).toContain('1024')
    expect(bodyText()).toContain('8192')
  })

  it('容量不接受负数', () => {
    renderTool()
    type('storage-input', '-1')
    expect(bodyText()).toContain(t.errorNegative)
  })

  it('默认 115200 bps：14400 B/s = 14.4 KB/s', () => {
    renderTool()
    expect(input('rate-input').value).toBe('115200')
    expect(bodyText()).toContain('14400')
    expect(bodyText()).toContain('14.4')
  })

  it('点 MB/s 后输入 100：等于 800000000 bps（隐含 ×8）', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: 'MB/s' }))
    type('rate-input', '100')
    expect(bodyText()).toContain('800000000')
  })

  it('常用波特率一键填入并切回 bps：9600 bps = 1200 B/s', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: 'MB/s' }))
    fireEvent.click(screen.getByRole('button', { name: '9600' }))
    expect(input('rate-input').value).toBe('9600')
    expect(bodyText()).toContain('1200') // B/s 行
    expect(bodyText()).toContain('9600') // bps 行
  })
})

describe('unitConverter · 电压 / 电流', () => {
  /** 电压电流卡的作用域：往上找 data-slot="card"（tab 标签文本相同，只取属于卡片的那个） */
  function electricCard(): HTMLElement {
    const card = screen
      .getAllByText(t.electricTitle)
      .map(el => el.closest('[data-slot="card"]'))
      .find(match => match !== null)
    if (!card)
      throw new Error('electric card not found')
    return card as HTMLElement
  }

  it('默认 1 mV：显示电压三档', () => {
    renderTool()
    expect(input('electric-input').value).toBe('1')
    expect(bodyText()).toContain('1000') // μV 行
  })

  it('切到 mA 后同量纲过滤：电压档的结果行消失', () => {
    renderTool()
    const withinCard = within(electricCard())
    // 默认 mV 家族：mV 的 tile 符号 + 单位按钮 = 2 个元素
    expect(withinCard.getAllByText('mV')).toHaveLength(2)
    fireEvent.click(withinCard.getByRole('button', { name: 'mA' }))
    // 切到电流家族后 mV 的结果行没了，只剩单位按钮；μA 行 = 1 mA × 1000
    expect(withinCard.getAllByText('mV')).toHaveLength(1)
    expect(withinCard.getAllByText('1000')).toHaveLength(1)
  })
})

describe('unitConverter · ADC', () => {
  it('默认 3.3 V / 12 位 / 码值 2048：电压 ≈ 1.6504 V，1 LSB ≈ 0.805861 mV', () => {
    renderTool()
    expect(input('adc-vref').value).toBe('3.3')
    expect(input('adc-raw').value).toBe('2048')
    // 2048 × 3.3 ÷ 4095 = 1.650402…，6 位有效数字
    expect(bodyText()).toContain('1.6504')
    expect(bodyText()).toContain('0.805861')
  })

  it('电压 → 码值：1.65 V 落在 0x800（2048）', () => {
    renderTool()
    expect(input('adc-voltage').value).toBe('1.65')
    expect(bodyText()).toContain('0x800')
  })

  it('原始值改成满量程 4095：电压正好是 Vref', () => {
    renderTool()
    type('adc-raw', '4095')
    expect(bodyText()).toContain('3.3')
  })

  it('切到 8 位后 2048 越界，提示合法范围', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: '8' }))
    expect(bodyText()).toContain(fill(t.adcRawRange, { max: '255' }))
  })

  it('vref 清空后两个方向都退到空态', () => {
    renderTool()
    type('adc-vref', '')
    expect(bodyText()).toContain(t.emptyHint)
    expect(bodyText()).not.toContain('0x800')
  })
})

describe('unitConverter · 进制跳转', () => {
  it('底部卡片链到进制转换工具', () => {
    renderTool()
    const link = screen.getByRole('link', { name: t.radixLink })
    expect(link.getAttribute('href')).toBe('/tools/base-converter')
  })
})
