'use client'

import { ChevronDown } from 'lucide-react'
import { useMessages, useTranslations } from 'next-intl'
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Link, usePathname } from '@/i18n/navigation'
import { categories, getToolsByCategory } from '@/lib/tools-meta'
import { getToolText } from '@/lib/tools-text'
import { cn } from '@/lib/utils'

/**
 * 页头工具导航。
 *
 * 清单完全由 lib/tools-meta.ts 派生 —— 加工具不用动这里，和首页卡片、sitemap 同源。
 * 之所以做成下拉而不是平铺：8 个工具平铺会撑爆移动端的页头，
 * 下拉的触发器只占一个按钮的位置。
 *
 * 注意所有工具都指向站内页面：外链工具（pin-lookup）在站内有自己的入口页，
 * 由那一页负责跳去 PinAtlas，所以这里不需要 target=_blank。
 */
export function ToolsNav() {
  const t = useTranslations('Nav')
  const tc = useTranslations('Categories')
  const messages = useMessages()
  // next-intl 的 usePathname 已经剥掉了 locale 前缀，返回 /tools/crc 这种
  const pathname = usePathname()

  const groups = categories
    .map(category => ({ category, items: getToolsByCategory(category) }))
    .filter(group => group.items.length > 0)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          {t('tools')}
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        {groups.map((group, index) => (
          <Fragment key={group.category}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{tc(group.category)}</DropdownMenuLabel>
              {group.items.map((tool) => {
                const text = getToolText(messages, tool.slug)
                const Icon = tool.icon
                const href = `/tools/${tool.slug}`
                const current = pathname === href

                return (
                  <DropdownMenuItem key={tool.slug} asChild>
                    <Link
                      href={href}
                      aria-current={current ? 'page' : undefined}
                      className={cn('flex items-center gap-2', current && 'font-medium')}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{text.name}</span>
                    </Link>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
