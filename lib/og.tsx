/**
 * OG 卡片渲染（server-only）。
 *
 * 用 Next 内置的 `next/og`（底层是 Satori，把 JSX/CSS 渲染成 PNG），
 * 不引任何新依赖，也不需要手工做图。
 *
 * 两个关键约束（来自 next/dist/docs 的 image-response 一节）：
 *   1. bundle 上限 500KB —— 所以字体必须是子集（assets/og/*.ttf 各 53KB）
 *   2. 只认 ttf / otf / woff，**不认 woff2**
 * 字体怎么来的、怎么重新生成，见 scripts/build-og-font.mjs。
 *
 * 字体在模块作用域读一次就够：它不依赖请求数据，文档也明确要求别每次渲染都读盘。
 */

import type { OgCard } from './og-text'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { ImageResponse } from 'next/og'

/** 社交平台推荐的 1.91:1 */
export const OG_SIZE = { width: 1200, height: 630 } as const

export const OG_CONTENT_TYPE = 'image/png'

const FONT_REGULAR = readFile(join(process.cwd(), 'assets/og/noto-sans-sc-400.ttf'))
const FONT_BOLD = readFile(join(process.cwd(), 'assets/og/noto-sans-sc-700.ttf'))

const INK = '#18181b'
const MUTED = '#52525b'
const FAINT = '#a1a1aa'
const PAPER = '#fafafa'

export async function renderOgCard(card: OgCard): Promise<ImageResponse> {
  const [regular, bold] = await Promise.all([FONT_REGULAR, FONT_BOLD])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '68px 76px',
          background: 'linear-gradient(160deg, #ffffff 0%, #f4f4f5 58%, #eceef1 100%)',
          fontFamily: '"Noto Sans SC"',
          color: INK,
        }}
      >
        {/* 品牌：和站点页头同一个终端标记 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 54,
              height: 54,
              borderRadius: 15,
              background: INK,
              color: PAPER,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: -1,
              paddingBottom: 6,
            }}
          >
            {'>_'}
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.4 }}>
            {card.brand}
          </div>
        </div>

        {/* 主体。overflow hidden 是兜底：文案再长也不会顶出画布 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, overflow: 'hidden' }}>
          <div style={{ fontSize: 78, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1.5 }}>
            {card.title}
          </div>
          <div style={{ fontSize: 29, lineHeight: 1.5, color: MUTED, maxWidth: 1010 }}>
            {card.subtitle}
          </div>
          {card.meta
            ? <div style={{ fontSize: 25, color: FAINT }}>{card.meta}</div>
            : null}
        </div>

        {/* 底部：域名 + 一条装饰线 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 24,
            color: FAINT,
          }}
        >
          <div style={{ display: 'flex' }}>{card.footer}</div>
          <div style={{ display: 'flex', width: 132, height: 6, borderRadius: 999, background: '#d4d4d8' }} />
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Noto Sans SC', data: regular, style: 'normal', weight: 400 },
        { name: 'Noto Sans SC', data: bold, style: 'normal', weight: 700 },
      ],
    },
  )
}
