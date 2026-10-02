import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  Cloud,
  Code,
  Cpu,
  MapPin,
  Plug,
  Radio,
  ShieldCheck,
} from 'lucide-react'

export type CategoryId = 'calc' | 'bytes' | 'proto' | 'cloud' | 'ext'

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
  /**
   * 外链工具：真正的功能在别的站点，本站只做一个跳转入口（不重复造轮子）。
   *
   * 有值时：首页卡片渲染成带「外部」标记的跳转卡，
   * **并且不计入「N 个可用」** —— 那个数字只统计本站能独立干活的工具。
   */
  externalUrl?: string
}

/** 首页与导航的分类顺序（空分类不渲染）。`ext` 永远排最后。 */
export const categories: CategoryId[] = ['calc', 'bytes', 'proto', 'cloud', 'ext']

/**
 * 工具清单：首页卡片、导航、sitemap 全部由这里派生。
 * 加一个工具 = 这里加一条 + messages 里加两条文案 + 一个页面 + 一个组件。
 */
export const tools: ToolMeta[] = [
  { slug: 'base-converter', category: 'calc', status: 'done', icon: ArrowLeftRight },
  { slug: 'crc', category: 'calc', status: 'done', icon: ShieldCheck },
  { slug: 'bitfield', category: 'calc', status: 'done', icon: Cpu },
  { slug: 'hex-ascii', category: 'bytes', status: 'done', icon: Code },
  { slug: 'modbus-frame', category: 'proto', status: 'done', icon: Plug },
  { slug: 'serial', category: 'proto', status: 'done', icon: Radio, needsLocalRuntime: true },
  { slug: 'onenet-mqtt', category: 'cloud', status: 'done', icon: Cloud },
  {
    slug: 'pin-lookup',
    category: 'ext',
    status: 'done',
    icon: MapPin,
    externalUrl: 'https://pinatlas.ryanuo.cc',
  },
]

/** 本站能独立干活的工具 */
export const localTools = tools.filter(tool => !tool.externalUrl)

/** 只是入口、功能在别处的工具 */
export const externalTools = tools.filter(tool => Boolean(tool.externalUrl))

export function getToolBySlug(slug: string): ToolMeta | undefined {
  return tools.find(tool => tool.slug === slug)
}

export function getToolsByCategory(category: CategoryId): ToolMeta[] {
  return tools.filter(tool => tool.category === category)
}

export function isExternal(tool: ToolMeta): boolean {
  return Boolean(tool.externalUrl)
}

/** 只统计本地工具：首页的「N 个可用 / N 个规划中」说的是本站的能力 */
export function countByStatus(status: ToolStatus): number {
  return localTools.filter(tool => tool.status === status).length
}

/** 外链工具数量（首页单独一个徽章，和本地工具区分开） */
export function countExternal(): number {
  return externalTools.length
}
