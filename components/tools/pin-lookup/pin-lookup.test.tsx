// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'
import messages from '@/messages/zh.json'
import { PinLookup } from './pin-lookup'

const t = messages.PinLookup

function renderTool() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <PinLookup />
    </NextIntlClientProvider>,
  )
}

const bodyText = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')
const chipInput = () => document.getElementById('pin-lookup-chip') as HTMLInputElement
const pinInput = () => document.getElementById('pin-lookup-pin') as HTMLInputElement
const openLink = () => screen.getByRole('link', { name: new RegExp(t.open) }) as HTMLAnchorElement

afterEach(cleanup)

describe('pinLookup · 深链拼装', () => {
  it('默认型号拼出 PinAtlas 深链', () => {
    renderTool()
    expect(chipInput().value).toBe('STM32F103C8Tx')
    expect(openLink().href).toBe('https://pinatlas.ryanuo.cc/?chip=STM32F103C8Tx')
  })

  it('打开按钮是新标签页，且带 noopener', () => {
    renderTool()
    expect(openLink().target).toBe('_blank')
    expect(openLink().rel).toContain('noopener')
  })

  it('填引脚后 URL 带上 pin', () => {
    renderTool()
    fireEvent.change(pinInput(), { target: { value: 'PA9' } })
    expect(openLink().href).toBe('https://pinatlas.ryanuo.cc/?chip=STM32F103C8Tx&pin=PA9')
  })

  it('点常用型号会换掉输入框', () => {
    renderTool()
    fireEvent.click(screen.getByRole('button', { name: 'STM32H743VITx' }))
    expect(chipInput().value).toBe('STM32H743VITx')
    expect(openLink().href).toContain('chip=STM32H743VITx')
  })

  it('型号留空时报错且不给跳转按钮', () => {
    renderTool()
    fireEvent.change(chipInput(), { target: { value: '' } })
    expect(bodyText()).toContain(t.error.emptyChip)
    expect(screen.queryByRole('link', { name: new RegExp(t.open) })).toBeNull()
  })

  it('型号含非法字符时报错', () => {
    renderTool()
    fireEvent.change(chipInput(), { target: { value: 'STM32/evil' } })
    expect(bodyText()).toContain(t.error.badChip.replace('{detail}', 'STM32/evil'))
  })
})

describe('pinLookup · 订货号纠正', () => {
  it('粘贴订货号时提示改成 CubeMX 形式', () => {
    renderTool()
    fireEvent.change(chipInput(), { target: { value: 'STM32F103C8T6' } })
    expect(bodyText()).toContain(t.suggestion.replace('{suggested}', 'STM32F103C8Tx'))
  })

  it('点「改用建议值」会替换输入框', () => {
    renderTool()
    fireEvent.change(chipInput(), { target: { value: 'STM32F407VET6' } })
    fireEvent.click(screen.getByRole('button', { name: t.suggestionUse }))
    expect(chipInput().value).toBe('STM32F407VETx')
  })

  it('本来就是 CubeMX 形式就不提示', () => {
    renderTool()
    expect(bodyText()).not.toContain(t.suggestionUse)
  })
})
