'use client'

import type { ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'

/**
 * 带「小眼睛」的私密输入框：默认按密码渲染，点一下看明文。
 *
 * 布局完全用 shadcn 现成的 `InputGroup`（就是官方 Password Input 那个做法），
 * 自己不画边框、不算留白 —— 那些细节原语里都处理过了（聚焦环、禁用态、
 * aria-invalid、RTL、以及给右侧按钮让位的 pr）。
 * 这里只负责「显隐状态 + 无障碍名称」这一件事。
 *
 * 文案由调用方传入（照 components/tools/copy-button.tsx 的既定做法），
 * 组件自己不碰 i18n，才能被任何页面复用。传进来的 showLabel / hideLabel
 * 同时充当眼睛按钮的无障碍名称，所以两个字段各传各的
 * （「显示设备密钥」而不是笼统的「显示」）。
 *
 * 显隐状态只放组件内部 state，**不写进 store**：刷新后回到隐藏。
 * 把「上次你把它显示出来了」也持久化没有意义，还平白多一份暴露面。
 */
export function SecretInput({
  showLabel,
  hideLabel,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & {
  showLabel: string
  hideLabel: string
}) {
  const [revealed, setRevealed] = useState(false)

  return (
    <InputGroup>
      <InputGroupInput
        {...props}
        type={revealed ? 'text' : 'password'}
        className={className}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          onClick={() => setRevealed(value => !value)}
          aria-label={revealed ? hideLabel : showLabel}
          aria-pressed={revealed}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
