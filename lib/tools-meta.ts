import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  Cloud,
  Code,
  Cpu,
  Plug,
  Radio,
  ShieldCheck,
} from 'lucide-react'

export type CategoryId = 'calc' | 'bytes' | 'proto' | 'cloud'

/** done = 可用；planned = 规划中（首页渲染成灰色禁用卡片，不做假入口） */
export type ToolStatus = 'done' | 'planned'

export interface ToolMeta {
  /** 同时也是路由段：/tools/<slug> */
  slug: string
  category: CategoryId
  status: ToolStatus
  icon: LucideIcon
  /**
   * 依赖「本机浏览器 + 硬件」这类本地能力（Web Serial 等）。
   *
   * 不影响 Vercel 部署（这些 API 本来就在客户端跑），但只有桌面版
   * Chrome / Edge 在 https 或 localhost 下才有，所以首页卡片要给提示。
   */
  needsLocalRuntime?: boolean
}

/** 首页与导航的分类顺序（空分类不渲染） */
export const categories: CategoryId[] = ['calc', 'bytes', 'proto', 'cloud']

/**
 * 工具清单：首页卡片、导航、sitemap 全部由这里派生。
 * 加一个工具 = 这里加一条 + messages 里加两条文案 + 一个页面 + 一个组件。
 */
export const tools: ToolMeta[] = [
  { slug: 'base-converter', category: 'calc', status: 'done', icon: ArrowLeftRight },
  { slug: 'crc', category: 'calc', status: 'planned', icon: ShieldCheck },
  { slug: 'bitfield', category: 'calc', status: 'planned', icon: Cpu },
  { slug: 'hex-ascii', category: 'bytes', status: 'done', icon: Code },
  { slug: 'modbus-frame', category: 'proto', status: 'planned', icon: Plug },
  { slug: 'serial', category: 'proto', status: 'done', icon: Radio, needsLocalRuntime: true },
  { slug: 'onenet-mqtt', category: 'cloud', status: 'done', icon: Cloud },
]

export function getToolBySlug(slug: string): ToolMeta | undefined {
  return tools.find(tool => tool.slug === slug)
}

export function getToolsByCategory(category: CategoryId): ToolMeta[] {
  return tools.filter(tool => tool.category === category)
}

export function countByStatus(status: ToolStatus): number {
  return tools.filter(tool => tool.status === status).length
}
