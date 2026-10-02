// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SecretInput } from './secret-input'

const SHOW = '显示设备密钥'
const HIDE = '隐藏设备密钥'
const FIELD = '设备密钥'

// 这个仓库没开 testing-library 的自动 cleanup，不手动清会跨用例累积多个按钮
afterEach(cleanup)

function renderSecret(props: Record<string, unknown> = {}) {
  const onChange = vi.fn()
  render(
    <SecretInput
      aria-label={FIELD}
      showLabel={SHOW}
      hideLabel={HIDE}
      value="s3cret"
      onChange={onChange}
      {...props}
    />,
  )
  return { onChange }
}

const input = () => screen.getByLabelText(FIELD) as HTMLInputElement
const showButton = () => screen.getByRole('button', { name: SHOW })
const hideButton = () => screen.getByRole('button', { name: HIDE })

describe('secretInput', () => {
  it('默认是隐藏的：type=password，按钮含义是「显示」', () => {
    renderSecret()

    expect(input().type).toBe('password')
    expect(showButton()).toBeTruthy()
    expect(showButton().getAttribute('aria-pressed')).toBe('false')
  })

  it('点一下变可见，再点一下变回去', () => {
    renderSecret()

    fireEvent.click(showButton())
    expect(input().type).toBe('text')
    // 按钮含义跟着翻转，屏幕阅读器才不会说反
    expect(hideButton()).toBeTruthy()
    expect(hideButton().getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(hideButton())
    expect(input().type).toBe('password')
    expect(showButton()).toBeTruthy()
  })

  it('眼睛按钮是 type=button，不会提交外层表单', () => {
    renderSecret()
    expect(showButton().getAttribute('type')).toBe('button')
  })

  it('切换显隐不影响取值：输入照常回调', () => {
    const { onChange } = renderSecret()

    fireEvent.change(input(), { target: { value: 'a' } })
    expect(onChange).toHaveBeenCalledTimes(1)

    fireEvent.click(showButton())
    fireEvent.change(input(), { target: { value: 'b' } })
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('透传 className 到输入框', () => {
    renderSecret({ className: 'font-mono text-xs' })

    expect(input().className).toContain('font-mono')
    expect(input().className).toContain('text-xs')
  })

  it('用现成的 InputGroup 布局：输入框与眼睛按钮同组，留白由原语负责', () => {
    renderSecret()

    const group = input().closest('[data-slot="input-group"]')
    expect(group).toBeTruthy()
    expect(group?.contains(showButton())).toBe(true)
    // 自己画布局的话不会有这个标记；钉住它是为了别退化成手搓
    expect(group?.querySelector('[data-slot="input-group-control"]')).toBe(input())
  })

  it('两个实例各管各的，互不影响', () => {
    render(
      <>
        <SecretInput aria-label="A" showLabel="显示 A" hideLabel="隐藏 A" defaultValue="a" />
        <SecretInput aria-label="B" showLabel="显示 B" hideLabel="隐藏 B" defaultValue="b" />
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: '显示 A' }))

    expect((screen.getByLabelText('A') as HTMLInputElement).type).toBe('text')
    expect((screen.getByLabelText('B') as HTMLInputElement).type).toBe('password')
  })
})
