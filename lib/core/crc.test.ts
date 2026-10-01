import { describe, expect, it } from 'vitest'
import {
  checkTrailingCrc,
  computeCrc,
  CRC_CHECK_INPUT,
  CRC_PRESETS,
  crcToBytes,
  crcToBytesBE,
  crcToBytesLE,
  customAlgorithm,
  formatCrc,
  getPreset,
} from './crc'

const checkInput = () => new TextEncoder().encode(CRC_CHECK_INPUT)

/**
 * 全表逐条比对官方 check 值。
 *
 * 这是这个模块最重要的一组测试：预设其实是「挑」出来的 js-crc 模型，
 * 挑错了（比如把 CRC-8/MAXIM 当成 CRC-8）算出来照样是个「正常」的数字，
 * 只有对着官方 check 才能发现。
 */
describe('预设与官方 check 值一致', () => {
  for (const preset of CRC_PRESETS) {
    it(`${preset.id} → ${formatCrc(preset.check, preset.width)}`, () => {
      expect(preset.compute(checkInput())).toBe(preset.check)
    })
  }

  it('id 不重复', () => {
    const ids = CRC_PRESETS.map(preset => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('覆盖 8 / 16 / 32 / 64 四种位宽', () => {
    const widths = new Set(CRC_PRESETS.map(preset => preset.width))
    expect([...widths].sort((a, b) => a - b)).toEqual([8, 16, 32, 64])
  })

  it('check 值都能塞进自己的位宽', () => {
    for (const preset of CRC_PRESETS)
      expect(preset.check).toBeLessThan(1n << BigInt(preset.width))
  })
})

describe('getPreset', () => {
  it('按 id 取到预设', () => {
    expect(getPreset('crc-16-modbus')?.check).toBe(0x4B37n)
  })

  it('未知 id 返回 undefined', () => {
    expect(getPreset('nope')).toBeUndefined()
  })
})

describe('computeCrc（自定义参数走 js-crc 的 createModel）', () => {
  it('cRC-16/MODBUS 参数能算出一致的 check 值（与目录里的模型互相印证）', () => {
    const value = computeCrc(checkInput(), {
      width: 16,
      poly: 0x8005n,
      init: 0xFFFFn,
      refin: true,
      refout: true,
      xorout: 0x0000n,
    })
    expect(value).toBe(0x4B37n)
  })

  it('cRC-32 参数', () => {
    expect(computeCrc(checkInput(), {
      width: 32,
      poly: 0x04C11DB7n,
      init: 0xFFFFFFFFn,
      refin: true,
      refout: true,
      xorout: 0xFFFFFFFFn,
    })).toBe(0xCBF43926n)
  })

  it('改 xorout 就得到另一个变体（CRC-32 → JAMCRC）', () => {
    expect(computeCrc(checkInput(), {
      width: 32,
      poly: 0x04C11DB7n,
      init: 0xFFFFFFFFn,
      refin: true,
      refout: true,
      xorout: 0x00000000n,
    })).toBe(0x340BC6D9n)
  })

  it('超过 32 位时把参数拆成 32 位字后仍然正确（CRC-64/XZ）', () => {
    const value = computeCrc(checkInput(), {
      width: 64,
      poly: 0x42F0E1EBA9EA3693n,
      init: 0xFFFFFFFFFFFFFFFFn,
      refin: true,
      refout: true,
      xorout: 0xFFFFFFFFFFFFFFFFn,
    })
    expect(value).toBe(0x995DC9BBDF1939FAn)
  })

  it('customAlgorithm 与 computeCrc 结果一致', () => {
    const params = {
      width: 8 as const,
      poly: 0x07n,
      init: 0x00n,
      refin: false,
      refout: false,
      xorout: 0x00n,
    }
    expect(customAlgorithm(params).compute(checkInput())).toBe(computeCrc(checkInput(), params))
    expect(customAlgorithm(params).width).toBe(8)
  })

  it('数据改一个字节结果就变', () => {
    const preset = getPreset('crc-16-modbus')!
    expect(preset.compute(Uint8Array.from([0x01, 0x03, 0x00, 0x00])))
      .not
      .toBe(preset.compute(Uint8Array.from([0x01, 0x03, 0x00, 0x01])))
  })

  it('结果始终落在位宽范围内', () => {
    const preset = getPreset('crc-32c')!
    const value = preset.compute(new TextEncoder().encode('温度 25.6℃ / payload'))
    expect(value).toBeLessThan(1n << 32n)
    expect(value).toBeGreaterThanOrEqual(0n)
  })
})

describe('formatCrc', () => {
  it('按位宽补零并大写', () => {
    expect(formatCrc(0x4B37n, 16)).toBe('0x4B37')
    expect(formatCrc(0x0Fn, 8)).toBe('0x0F')
    expect(formatCrc(0x00n, 8)).toBe('0x00')
    expect(formatCrc(0xCBF43926n, 32)).toBe('0xCBF43926')
    expect(formatCrc(0x995DC9BBDF1939FAn, 64)).toBe('0x995DC9BBDF1939FA')
  })
})

describe('crcToBytes 字节序', () => {
  it('modbus RTU 用小端：低字节在前', () => {
    expect([...crcToBytesLE(0x4B37n, 16)]).toEqual([0x37, 0x4B])
  })

  it('大端：高字节在前', () => {
    expect([...crcToBytesBE(0x4B37n, 16)]).toEqual([0x4B, 0x37])
  })

  it('32 位同样成立', () => {
    expect([...crcToBytesLE(0xCBF43926n, 32)]).toEqual([0x26, 0x39, 0xF4, 0xCB])
    expect([...crcToBytesBE(0xCBF43926n, 32)]).toEqual([0xCB, 0xF4, 0x39, 0x26])
  })

  it('crcToBytes 与显式传 byteOrder 等价', () => {
    expect([...crcToBytes(0x4B37n, 16, 'le')]).toEqual([...crcToBytesLE(0x4B37n, 16)])
    expect([...crcToBytes(0x4B37n, 16, 'be')]).toEqual([...crcToBytesBE(0x4B37n, 16)])
  })
})

describe('checkTrailingCrc', () => {
  const algorithm = getPreset('crc-16-modbus')!

  /** 造一段「数据 + 小端 CRC」的 Modbus 风格报文 */
  function frame(payload: number[], byteOrder: 'be' | 'le' = 'le') {
    const bytes = Uint8Array.from(payload)
    const tail = crcToBytes(algorithm.compute(bytes), 16, byteOrder)
    return Uint8Array.from([...bytes, ...tail])
  }

  it('尾部 CRC 正确时报 ok', () => {
    const result = checkTrailingCrc(frame([0x01, 0x03, 0x00, 0x00, 0x00, 0x0A]), algorithm)
    expect(result).not.toBe('tooShort')
    if (result !== 'tooShort') {
      expect(result.ok).toBe(true)
      expect(result.trailing).toBe(result.computed)
    }
  })

  it('改一个数据字节就报不 ok，并给出两个不同的值', () => {
    const bytes = frame([0x01, 0x03, 0x00, 0x00, 0x00, 0x0A])
    bytes[3] = 0x01
    const result = checkTrailingCrc(bytes, algorithm)
    expect(result).not.toBe('tooShort')
    if (result !== 'tooShort') {
      expect(result.ok).toBe(false)
      expect(result.trailing).not.toBe(result.computed)
    }
  })

  it('按大端解释时同一段报文校验失败（字节序选错就该失败）', () => {
    const bytes = frame([0x01, 0x03], 'le')
    const le = checkTrailingCrc(bytes, algorithm, 'le')
    const be = checkTrailingCrc(bytes, algorithm, 'be')
    expect(le !== 'tooShort' && le.ok).toBe(true)
    expect(be !== 'tooShort' && be.ok).toBe(false)
  })

  it('比 CRC 本身还短时报 tooShort', () => {
    expect(checkTrailingCrc(Uint8Array.from([0x01]), algorithm)).toBe('tooShort')
  })
})
