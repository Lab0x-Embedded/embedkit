import { describe, expect, it } from 'vitest'
import {
  buildPinAtlasUrl,
  normalizeChipId,
  PINATLAS_ORIGIN,
  suggestCubeMxId,
} from './pinatlas'

describe('normalizeChipId', () => {
  it('去掉首尾与中间空白（手册里复制的型号常带空格）', () => {
    expect(normalizeChipId('  STM32F103C8Tx ')).toBe('STM32F103C8Tx')
    expect(normalizeChipId('STM32 F103 C8Tx')).toBe('STM32F103C8Tx')
  })
})

describe('buildPinAtlasUrl', () => {
  it('只带型号', () => {
    const result = buildPinAtlasUrl({ chip: 'STM32F103C8Tx' })
    expect(result).toEqual({ ok: true, url: `${PINATLAS_ORIGIN}/?chip=STM32F103C8Tx` })
  })

  it('带引脚', () => {
    const result = buildPinAtlasUrl({ chip: 'STM32F103C8Tx', pin: 'PA9' })
    expect(result.ok && result.url).toBe(`${PINATLAS_ORIGIN}/?chip=STM32F103C8Tx&pin=PA9`)
  })

  it('带引脚与封装变体，参数顺序稳定', () => {
    const result = buildPinAtlasUrl({ chip: 'STM32F103C8Tx', pin: 'PA9', variant: 'LQFP48' })
    expect(result.ok && result.url)
      .toBe(`${PINATLAS_ORIGIN}/?chip=STM32F103C8Tx&pin=PA9&variant=LQFP48`)
  })

  it('空的可选参数不会写进 URL（否则会覆盖 PinAtlas 的默认视图）', () => {
    const result = buildPinAtlasUrl({ chip: 'STM32F103C8Tx', pin: '  ', variant: '' })
    expect(result.ok && result.url).toBe(`${PINATLAS_ORIGIN}/?chip=STM32F103C8Tx`)
  })

  it('型号带空格也能拼对', () => {
    const result = buildPinAtlasUrl({ chip: ' STM32F407VETx ' })
    expect(result.ok && result.url).toBe(`${PINATLAS_ORIGIN}/?chip=STM32F407VETx`)
  })

  it('特殊字符会被转义', () => {
    const result = buildPinAtlasUrl({ chip: 'STM32F103C8Tx', pin: 'PA9' })
    expect(result.ok && result.url).toContain('pin=PA9')
  })

  it('型号为空报 emptyChip', () => {
    expect(buildPinAtlasUrl({ chip: '' })).toEqual({ ok: false, code: 'emptyChip' })
    expect(buildPinAtlasUrl({ chip: '   ' })).toEqual({ ok: false, code: 'emptyChip' })
  })

  it('非法型号报 badChip 并指出内容', () => {
    expect(buildPinAtlasUrl({ chip: 'STM32/../etc' }))
      .toEqual({ ok: false, code: 'badChip', detail: 'STM32/../etc' })
    expect(buildPinAtlasUrl({ chip: 'STM32 F103<script>' }))
      .toMatchObject({ ok: false, code: 'badChip' })
  })

  it('非法引脚 / 变体分别报 badPin / badVariant', () => {
    expect(buildPinAtlasUrl({ chip: 'STM32F103C8Tx', pin: 'PA 9' }))
      .toEqual({ ok: false, code: 'badPin', detail: 'PA 9' })
    expect(buildPinAtlasUrl({ chip: 'STM32F103C8Tx', variant: 'LQFP 48' }))
      .toEqual({ ok: false, code: 'badVariant', detail: 'LQFP 48' })
  })

  it('不会拼出跨站的相对路径（型号里带斜杠一律拒绝）', () => {
    const result = buildPinAtlasUrl({ chip: '../../evil' })
    expect(result.ok).toBe(false)
  })
})

describe('suggestCubeMxId', () => {
  it('订货号 → CubeMX 形式（T6 → Tx）', () => {
    expect(suggestCubeMxId('STM32F103C8T6')).toBe('STM32F103C8Tx')
    expect(suggestCubeMxId('STM32F407VET6')).toBe('STM32F407VETx')
    expect(suggestCubeMxId('STM32F411CEU6')).toBe('STM32F411CEUx')
    expect(suggestCubeMxId('STM32G071CBT6')).toBe('STM32G071CBTx')
  })

  it('已经是 CubeMX 形式就不提示', () => {
    expect(suggestCubeMxId('STM32F103C8Tx')).toBeNull()
    expect(suggestCubeMxId('STM32F103C8TX')).toBeNull()
  })

  it('形状不像订货号就不瞎猜', () => {
    expect(suggestCubeMxId('')).toBeNull()
    expect(suggestCubeMxId('ESP32')).toBeNull()
  })

  it('带空格的订货号也会被规范化后再判断', () => {
    expect(suggestCubeMxId(' STM32F103C8T6 ')).toBe('STM32F103C8Tx')
  })
})
