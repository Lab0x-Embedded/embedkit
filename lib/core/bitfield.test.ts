import { describe, expect, it } from 'vitest'
import {
  applyField,
  bitCells,
  clampToWidth,
  clearAll,
  extractField,
  fieldMask,
  fieldWidth,
  getBit,
  invertAll,
  maskFor,
  parseRegisterInput,
  registerView,
  setAll,
  setBit,
  toCIdentifier,
  toCMacros,
  toggleBit,
  validateField,
} from './bitfield'

const field = (name: string, msb: number, lsb: number) => ({ id: name, name, msb, lsb })

describe('掩码与截断', () => {
  it('掩码按位宽', () => {
    expect(maskFor(8)).toBe(0xFFn)
    expect(maskFor(16)).toBe(0xFFFFn)
    expect(maskFor(32)).toBe(0xFFFFFFFFn)
    expect(maskFor(64)).toBe(0xFFFFFFFFFFFFFFFFn)
  })

  it('截断保留低位', () => {
    expect(clampToWidth(0x1FFn, 8)).toBe(0xFFn)
    expect(clampToWidth(-1n, 8)).toBe(0xFFn)
    expect(clampToWidth(-1n, 32)).toBe(0xFFFFFFFFn)
  })
})

describe('逐位操作', () => {
  it('getBit 从 0（LSB）开始', () => {
    expect(getBit(0b1000n, 3)).toBe(true)
    expect(getBit(0b1000n, 2)).toBe(false)
  })

  it('setBit 置位 / 清零不影响其它位', () => {
    expect(setBit(0n, 3, true, 8)).toBe(0b1000n)
    expect(setBit(0xFFn, 0, false, 8)).toBe(0xFEn)
  })

  it('setBit 超出位宽时不会溢出到外面', () => {
    expect(setBit(0n, 7, true, 8)).toBe(0x80n)
    expect(setBit(0x80n, 7, false, 8)).toBe(0n)
  })

  it('toggleBit 翻转', () => {
    expect(toggleBit(0b1010n, 0, 8)).toBe(0b1011n)
    expect(toggleBit(0b1010n, 1, 8)).toBe(0b1000n)
  })

  it('全部取反按位宽截断', () => {
    expect(invertAll(0n, 8)).toBe(0xFFn)
    expect(invertAll(0x0Fn, 8)).toBe(0xF0n)
    expect(invertAll(0n, 32)).toBe(0xFFFFFFFFn)
  })

  it('全置位 / 全清零', () => {
    expect(setAll(16)).toBe(0xFFFFn)
    expect(clearAll()).toBe(0n)
  })
})

describe('bitCells', () => {
  it('从 MSB 到 LSB 排列，长度等于位宽', () => {
    const cells = bitCells(0b1010n, 8)
    expect(cells).toHaveLength(8)
    expect(cells[0].index).toBe(7)
    expect(cells[7].index).toBe(0)
  })

  it('标记出被置位的位', () => {
    const cells = bitCells(0b1000_0001n, 8)
    expect(cells.filter(cell => cell.set).map(cell => cell.index)).toEqual([7, 0])
  })
})

describe('parseRegisterInput', () => {
  it('十六进制 / 二进制 / 八进制 / 十进制', () => {
    expect(parseRegisterInput('0xFF', 8)).toEqual({ ok: true, value: 0xFFn })
    expect(parseRegisterInput('0b1010', 8)).toEqual({ ok: true, value: 0b1010n })
    expect(parseRegisterInput('0o17', 8)).toEqual({ ok: true, value: 15n })
    expect(parseRegisterInput('255', 8)).toEqual({ ok: true, value: 255n })
  })

  it('容忍空格与下划线分隔', () => {
    expect(parseRegisterInput('0b1010 1010', 8)).toEqual({ ok: true, value: 0xAAn })
    expect(parseRegisterInput('0xDE_AD', 16)).toEqual({ ok: true, value: 0xDEADn })
  })

  it('空输入报 empty', () => {
    expect(parseRegisterInput('  ', 8)).toEqual({ ok: false, code: 'empty' })
    expect(parseRegisterInput('0x', 8)).toEqual({ ok: false, code: 'empty' })
  })

  it('非法字符报 badChar 并指出字符', () => {
    expect(parseRegisterInput('0xZZ', 8)).toEqual({ ok: false, code: 'badChar', detail: 'Z' })
    expect(parseRegisterInput('0b12', 8)).toEqual({ ok: false, code: 'badChar', detail: '2' })
  })

  it('超出位宽报 outOfRange', () => {
    expect(parseRegisterInput('0x1FF', 8)).toMatchObject({ ok: false, code: 'outOfRange' })
    expect(parseRegisterInput('256', 8)).toMatchObject({ ok: false, code: 'outOfRange' })
    // 刚好等于上限是合法的
    expect(parseRegisterInput('255', 8)).toEqual({ ok: true, value: 255n })
  })
})

describe('字段校验与切片', () => {
  it('fieldWidth 含首尾', () => {
    expect(fieldWidth(field('A', 7, 4))).toBe(4)
    expect(fieldWidth(field('B', 3, 3))).toBe(1)
  })

  it('fieldMask 是移位后的绝对掩码', () => {
    expect(fieldMask(field('A', 7, 4), 16)).toBe(0x00F0n)
    expect(fieldMask(field('B', 11, 8), 16)).toBe(0x0F00n)
  })

  it('extractField 取出未移位的字段值', () => {
    expect(extractField(0xABCDn, field('A', 7, 4))).toBe(0xCn)
    expect(extractField(0xABCDn, field('B', 3, 0))).toBe(0xDn)
  })

  it('applyField 只改字段覆盖的位', () => {
    // 0xABCD 的 [7:4]（也就是 C 那一位段）改成 0x3 → 0xAB3D
    expect(applyField(0xABCDn, field('A', 7, 4), 0x3n, 16)).toBe(0xAB3Dn)
  })

  it('applyField 与 extractField 互为逆运算', () => {
    for (const fieldValue of [0n, 1n, 5n, 0xFn]) {
      const target = field('A', 15, 12)
      expect(extractField(applyField(0x1234n, target, fieldValue, 16), target)).toBe(fieldValue)
    }
  })

  it('applyField 会截断超宽的字段值，不污染相邻位', () => {
    expect(applyField(0x0000n, field('A', 7, 4), 0xFFn, 16)).toBe(0x00F0n)
  })

  it('validateField 拦住各种非法范围', () => {
    expect(validateField(field('A', 7, 4), 8).ok).toBe(true)
    expect(validateField(field('A', 4, 7), 8)).toMatchObject({ ok: false, code: 'badRange' })
    expect(validateField(field('A', 8, 0), 8)).toMatchObject({ ok: false, code: 'outOfWidth' })
    expect(validateField(field('  ', 3, 0), 8)).toMatchObject({ ok: false, code: 'emptyName' })
  })
})

describe('registerView（复用 radix 的显示规则）', () => {
  it('给出无符号 / 有符号 / HEX / BIN', () => {
    const view = registerView(0xFFFFFFFFn, 32)
    expect(view.dec).toBe('4294967295')
    expect(view.signed).toBe('-1')
    expect(view.signBitSet).toBe(true)
    expect(view.hex).toContain('FF')
    expect(view.bin).toHaveLength(39) // 32 位 + 7 个分组空格
  })

  it('符号位为 0 时 signed 与 unsigned 相同', () => {
    const view = registerView(0x7FFFFFFFn, 32)
    expect(view.signed).toBe(view.dec)
    expect(view.signBitSet).toBe(false)
  })
})

describe('c 宏导出', () => {
  it('标识符会被规范化', () => {
    expect(toCIdentifier('pll mux')).toBe('PLL_MUX')
    expect(toCIdentifier('  ')).toBe('FIELD')
  })

  it('导出寄存器值、字段位置、掩码与字段值', () => {
    const macros = toCMacros(0x0000_2301n, 32, [field('PLLM', 5, 0), field('PLLSRC', 22, 22)], 'RCC_CFGR')
    expect(macros).toContain('#define RCC_CFGR_VALUE   0x00002301u')
    expect(macros).toContain('#define RCC_CFGR_PLLM_Pos   0u')
    expect(macros).toContain('#define RCC_CFGR_PLLM_Msk   0x0000003Fu')
    expect(macros).toContain('#define RCC_CFGR_PLLM_Val   0x00000001u')
    expect(macros).toContain('#define RCC_CFGR_PLLSRC_Pos   22u')
    expect(macros).toContain('#define RCC_CFGR_PLLSRC_Msk   0x00400000u')
  })

  it('非法字段被跳过，不影响其它行', () => {
    const macros = toCMacros(0xFFn, 8, [field('OK', 3, 0), field('BAD', 99, 90)], 'R')
    expect(macros).toContain('R_OK_Pos')
    expect(macros).not.toContain('R_BAD_Pos')
  })

  it('没有字段时只导出寄存器值', () => {
    const macros = toCMacros(0x1234n, 16, [], 'REG')
    expect(macros).toContain('#define REG_VALUE   0x1234u')
    expect(macros).not.toContain('_Pos')
  })

  it('64 位值补零到 16 个 16 进制数字', () => {
    const macros = toCMacros(0x1n, 64, [], 'X')
    expect(macros).toContain('#define X_VALUE   0x0000000000000001u')
  })
})
