import { describe, expect, it } from 'vitest'
import { THEME_CLASS, THEME_STORAGE_KEY, themeInitScript } from './theme'

describe('themeInitScript', () => {
  it('把存储键写进脚本（默认键）', () => {
    expect(themeInitScript()).toContain(THEME_STORAGE_KEY)
  })

  it('是自执行函数，避免污染全局作用域', () => {
    const script = themeInitScript()
    expect(script.startsWith('(function(){')).toBe(true)
    expect(script.endsWith('})()')).toBe(true)
  })

  it('切换的是 html 上的 dark 类', () => {
    expect(themeInitScript()).toContain(`classList.toggle("${THEME_CLASS}"`)
  })

  it('同时设置 color-scheme，原生控件跟着变色', () => {
    expect(themeInitScript()).toContain('colorScheme')
  })

  it('localStorage 被 try/catch 包住（隐私模式下不炸）', () => {
    const script = themeInitScript()
    expect(script).toContain('try{')
    expect(script).toContain('catch(_){}')
  })

  it('可以自定义存储键', () => {
    expect(themeInitScript('my-key')).toContain('"my-key"')
  })

  it('不包含模板残留（{{{ 之类）', () => {
    const script = themeInitScript()
    expect(script).not.toContain('${')
    expect(script).not.toContain('undefined')
  })
})
