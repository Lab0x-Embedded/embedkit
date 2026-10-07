'use client'

import type { AdcBits, ElectricUnit, FreqTimeUnit, RateUnit, StorageUnit } from '@/lib/core/units'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CopyButton } from '@/components/tools/copy-button'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Link } from '@/i18n/navigation'
import { ADC_BIT_WIDTHS, adcLsb, adcToVoltage, ELECTRIC_STEPS, ELECTRIC_UNITS, electricFamily, formatNumber, FREQ_STEPS, FREQ_UNITS, parseDecimal, RATE_STEPS, RATE_UNITS, STORAGE_STEPS, STORAGE_UNITS, TIME_STEPS, TIME_UNITS, toBaseElectric, toBits, toBps, toHertz, toSeconds, voltageToAdcCode } from '@/lib/core/units'
import { cn } from '@/lib/utils'

/** 一个结果格子：单位符号 + 数值（可复制），高亮 = 当前选中的输入单位 */
interface Tile {
  symbol: string
  value: string
  highlight?: boolean
}

/**
 * 五个换算区块用 Tabs 切换，避免整页一拉到底。
 *
 * TabsContent 全部 forceMount：未激活的页签只是 hidden，组件不卸载 ——
 * 各卡已输入的数值切走再切回来还在。进制跳转卡与页签无关，常驻底部。
 */
export function UnitConverter() {
  const t = useTranslations('UnitConverter')

  return (
    <div className="grid gap-6">
      <Tabs defaultValue="freq">
        <TabsList className="h-auto max-w-full flex-wrap">
          <TabsTrigger value="freq">{t('freqTitle')}</TabsTrigger>
          <TabsTrigger value="storage">{t('storageTitle')}</TabsTrigger>
          <TabsTrigger value="rate">{t('rateTitle')}</TabsTrigger>
          <TabsTrigger value="electric">{t('electricTitle')}</TabsTrigger>
          <TabsTrigger value="adc">{t('adcTitle')}</TabsTrigger>
        </TabsList>
        {/* forceMount 只负责常挂载，inactive 的显隐要自己管（Radix 文档约定） */}
        <TabsContent value="freq" forceMount className="data-[state=inactive]:hidden">
          <FreqPeriodCard />
        </TabsContent>
        <TabsContent value="storage" forceMount className="data-[state=inactive]:hidden">
          <StorageCard />
        </TabsContent>
        <TabsContent value="rate" forceMount className="data-[state=inactive]:hidden">
          <RateCard />
        </TabsContent>
        <TabsContent value="electric" forceMount className="data-[state=inactive]:hidden">
          <ElectricCard />
        </TabsContent>
        <TabsContent value="adc" forceMount className="data-[state=inactive]:hidden">
          <AdcCard />
        </TabsContent>
      </Tabs>
      <RadixCard />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 共享小块
// ---------------------------------------------------------------------------

function UnitButtons<T extends string>({
  units,
  value,
  onChange,
}: {
  units: readonly T[]
  value: string
  onChange: (unit: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {units.map(unit => (
        <Button
          key={unit}
          size="xs"
          variant={unit === value ? 'default' : 'outline'}
          className="font-mono"
          onClick={() => onChange(unit)}
        >
          {unit}
        </Button>
      ))}
    </div>
  )
}

function TileGrid({
  tiles,
  copyLabel,
  copiedLabel,
}: {
  tiles: Tile[]
  copyLabel: string
  copiedLabel: string
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {tiles.map(tile => (
        <div
          key={tile.symbol}
          className={cn(
            'rounded-lg border border-border/70 p-2.5',
            tile.highlight && 'border-primary/40 bg-primary/5',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{tile.symbol}</span>
            <CopyButton value={tile.value} label={copyLabel} copiedLabel={copiedLabel} />
          </div>
          <code className="mt-1 block break-all font-mono text-sm">{tile.value}</code>
        </div>
      ))}
    </div>
  )
}

/** 结果区三态：空输入提示 / 错误框 / 结果格子 */
function ResultArea({
  empty,
  error,
  emptyHint,
  children,
}: {
  empty: boolean
  error: string | null
  emptyHint: string
  children: React.ReactNode
}) {
  if (empty)
    return <p className="py-2 text-sm text-muted-foreground">{emptyHint}</p>
  if (error) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        {error}
      </p>
    )
  }
  return <>{children}</>
}

function NumberInput({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (text: string) => void
}) {
  return (
    <Input
      id={id}
      value={value}
      onChange={event => onChange(event.target.value)}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      className="font-mono"
    />
  )
}

// ---------------------------------------------------------------------------
// 频率 ↔ 周期：T = 1/f，两边单位都能当输入
// ---------------------------------------------------------------------------

function FreqPeriodCard() {
  const t = useTranslations('UnitConverter')
  const [input, setInput] = useState('1')
  const [unit, setUnit] = useState<FreqTimeUnit>('MHz')

  const parsed = parseDecimal(input)
  const empty = !parsed.ok && parsed.reason === 'empty'
  const error = !parsed.ok
    ? (parsed.reason === 'invalid' ? t('errorInvalid') : null)
    : (parsed.value.gt(0) ? null : t('errorPositive'))

  let freqTiles: Tile[] = []
  let periodTiles: Tile[] = []
  if (parsed.ok && parsed.value.gt(0)) {
    const hz = toHertz(parsed.value, unit)
    const seconds = toSeconds(parsed.value, unit)
    freqTiles = FREQ_UNITS.map(u => ({
      symbol: u,
      value: formatNumber(hz.div(FREQ_STEPS[u])),
      highlight: unit === u,
    }))
    periodTiles = TIME_UNITS.map(u => ({
      symbol: u,
      value: formatNumber(seconds.div(TIME_STEPS[u])),
      highlight: unit === u,
    }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('freqTitle')}</CardTitle>
        <CardDescription>{t('freqLead')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="freq-input">{t('inputLabel')}</Label>
          <NumberInput id="freq-input" value={input} onChange={setInput} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">f</span>
              <UnitButtons units={FREQ_UNITS} value={unit} onChange={setUnit} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">T</span>
              <UnitButtons units={TIME_UNITS} value={unit} onChange={setUnit} />
            </div>
          </div>
        </div>
        <ResultArea empty={empty} error={error} emptyHint={t('emptyHint')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('freqGroup')}</p>
              <TileGrid tiles={freqTiles} copyLabel={t('copy')} copiedLabel={t('copied')} />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('periodGroup')}</p>
              <TileGrid tiles={periodTiles} copyLabel={t('copy')} copiedLabel={t('copied')} />
            </div>
          </div>
        </ResultArea>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 存储容量：严格 1024 进制
// ---------------------------------------------------------------------------

function StorageCard() {
  const t = useTranslations('UnitConverter')
  const [input, setInput] = useState('1')
  const [unit, setUnit] = useState<StorageUnit>('KB')

  const parsed = parseDecimal(input)
  const empty = !parsed.ok && parsed.reason === 'empty'
  const error = !parsed.ok
    ? (parsed.reason === 'invalid' ? t('errorInvalid') : null)
    : (parsed.value.lt(0) ? t('errorNegative') : null)

  let tiles: Tile[] = []
  if (parsed.ok && !parsed.value.lt(0)) {
    const bits = toBits(parsed.value, unit)
    tiles = STORAGE_UNITS.map(u => ({
      symbol: u,
      value: formatNumber(bits.div(STORAGE_STEPS[u])),
      highlight: u === unit,
    }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('storageTitle')}</CardTitle>
        <CardDescription>{t('storageLead')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="storage-input">{t('inputLabel')}</Label>
          <NumberInput id="storage-input" value={input} onChange={setInput} />
          <UnitButtons units={STORAGE_UNITS} value={unit} onChange={setUnit} />
        </div>
        <ResultArea empty={empty} error={error} emptyHint={t('emptyHint')}>
          <TileGrid tiles={tiles} copyLabel={t('copy')} copiedLabel={t('copied')} />
        </ResultArea>
        <p className="text-xs text-muted-foreground">{t('storageNote')}</p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 通信速率：1000 进制 + bit/Byte ×8
// ---------------------------------------------------------------------------

/** UART 标准波特率阶梯（9600 × 2ⁿ），点击填入并切到 bps */
const RATE_PRESETS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

function RateCard() {
  const t = useTranslations('UnitConverter')
  const [input, setInput] = useState('115200')
  const [unit, setUnit] = useState<RateUnit>('bps')

  const parsed = parseDecimal(input)
  const empty = !parsed.ok && parsed.reason === 'empty'
  const error = !parsed.ok
    ? (parsed.reason === 'invalid' ? t('errorInvalid') : null)
    : (parsed.value.lt(0) ? t('errorNegative') : null)

  let tiles: Tile[] = []
  if (parsed.ok && !parsed.value.lt(0)) {
    const bps = toBps(parsed.value, unit)
    tiles = RATE_UNITS.map(u => ({
      symbol: u,
      value: formatNumber(bps.div(RATE_STEPS[u])),
      highlight: u === unit,
    }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('rateTitle')}</CardTitle>
        <CardDescription>{t('rateLead')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="rate-input">{t('inputLabel')}</Label>
          <NumberInput id="rate-input" value={input} onChange={setInput} />
          <UnitButtons units={RATE_UNITS} value={unit} onChange={setUnit} />
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">{t('ratePresets')}</span>
            {RATE_PRESETS.map(preset => (
              <Button
                key={preset}
                variant="ghost"
                size="xs"
                className="font-mono text-muted-foreground"
                onClick={() => {
                  setInput(String(preset))
                  setUnit('bps')
                }}
              >
                {preset}
              </Button>
            ))}
          </div>
        </div>
        <ResultArea empty={empty} error={error} emptyHint={t('emptyHint')}>
          <TileGrid tiles={tiles} copyLabel={t('copy')} copiedLabel={t('copied')} />
        </ResultArea>
        <p className="text-xs text-muted-foreground">{t('rateNote')}</p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 电压 / 电流：1000 进制阶梯，只显示同量纲
// ---------------------------------------------------------------------------

function ElectricCard() {
  const t = useTranslations('UnitConverter')
  const [input, setInput] = useState('1')
  const [unit, setUnit] = useState<ElectricUnit>('mV')

  const parsed = parseDecimal(input)
  const empty = !parsed.ok && parsed.reason === 'empty'
  const error = !parsed.ok && parsed.reason === 'invalid' ? t('errorInvalid') : null

  // 负电压 / 负电流有物理意义，不拦
  const family = electricFamily(unit)
  const familyUnits = ELECTRIC_UNITS.filter(u => electricFamily(u) === family)

  let tiles: Tile[] = []
  if (parsed.ok) {
    const base = toBaseElectric(parsed.value, unit)
    tiles = familyUnits.map(u => ({
      symbol: u,
      value: formatNumber(base.div(ELECTRIC_STEPS[u])),
      highlight: u === unit,
    }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('electricTitle')}</CardTitle>
        <CardDescription>{t('electricLead')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="electric-input">{t('inputLabel')}</Label>
          <NumberInput id="electric-input" value={input} onChange={setInput} />
          <UnitButtons units={ELECTRIC_UNITS} value={unit} onChange={setUnit} />
        </div>
        <ResultArea empty={empty} error={error} emptyHint={t('emptyHint')}>
          <TileGrid tiles={tiles} copyLabel={t('copy')} copiedLabel={t('copied')} />
        </ResultArea>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ADC：原始值 ↔ 电压（满量程 2ⁿ−1 映射），Vref 与分辨率双向共享
// ---------------------------------------------------------------------------

function AdcCard() {
  const t = useTranslations('UnitConverter')
  const [vrefText, setVrefText] = useState('3.3')
  const [bits, setBits] = useState<AdcBits>(12)
  const [rawText, setRawText] = useState('2048')
  const [voltageText, setVoltageText] = useState('1.65')

  const vref = parseDecimal(vrefText)
  const vrefEmpty = !vref.ok && vref.reason === 'empty'
  const vrefError = !vref.ok
    ? (vref.reason === 'invalid' ? t('errorInvalid') : null)
    : (vref.value.gt(0) ? null : t('errorPositive'))

  const maxCode = 2 ** bits - 1
  const raw = parseDecimal(rawText)
  const rawInRange = raw.ok
    && raw.value.gte(0) && raw.value.lte(maxCode) && raw.value.isInteger()
  const rawError = !raw.ok
    ? (raw.reason === 'invalid' ? t('errorInvalid') : null)
    : (rawInRange ? null : t('adcRawRange', { max: String(maxCode) }))

  const voltage = parseDecimal(voltageText)
  const voltageEmpty = !voltage.ok && voltage.reason === 'empty'
  const voltageError = !voltage.ok && voltage.reason === 'invalid' ? t('errorInvalid') : null

  let voltageTiles: Tile[] = []
  if (vref.ok && vref.value.gt(0) && raw.ok && rawInRange) {
    const v = adcToVoltage(raw.value, vref.value, bits)
    const lsbMillivolts = adcLsb(vref.value, bits).div(ELECTRIC_STEPS.mV)
    voltageTiles = [
      ...(['V', 'mV', 'μV'] as ElectricUnit[]).map(u => ({
        symbol: u,
        value: formatNumber(v.div(ELECTRIC_STEPS[u])),
      })),
      { symbol: '1 LSB (mV)', value: formatNumber(lsbMillivolts) },
    ]
  }

  let codeTiles: Tile[] = []
  if (vref.ok && vref.value.gt(0) && voltage.ok) {
    const { exact, code } = voltageToAdcCode(voltage.value, vref.value, bits)
    codeTiles = [
      { symbol: t('adcCodeDec'), value: String(code) },
      { symbol: t('adcCodeHex'), value: `0x${code.toString(16).toUpperCase()}` },
      { symbol: t('adcCodeExact'), value: formatNumber(exact) },
    ]
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('adcTitle')}</CardTitle>
        <CardDescription>{t('adcLead')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="adc-vref">{t('adcVref')}</Label>
            <NumberInput id="adc-vref" value={vrefText} onChange={setVrefText} />
          </div>
          <div className="space-y-2">
            <Label>{t('adcBits')}</Label>
            <UnitButtons
              units={ADC_BIT_WIDTHS.map(String)}
              value={String(bits)}
              onChange={unit => setBits(Number(unit) as AdcBits)}
            />
          </div>
        </div>

        <ResultArea empty={vrefEmpty} error={vrefError} emptyHint={t('emptyHint')}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('adcRawSection')}</p>
              <div className="space-y-2">
                <Label htmlFor="adc-raw">{t('adcRawLabel')}</Label>
                <NumberInput id="adc-raw" value={rawText} onChange={setRawText} />
                {rawError && <p className="text-sm text-destructive">{rawError}</p>}
              </div>
              {voltageTiles.length > 0 && (
                <TileGrid tiles={voltageTiles} copyLabel={t('copy')} copiedLabel={t('copied')} />
              )}
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('adcVoltageSection')}</p>
              <div className="space-y-2">
                <Label htmlFor="adc-voltage">{t('adcVoltageLabel')}</Label>
                <NumberInput id="adc-voltage" value={voltageText} onChange={setVoltageText} />
                {voltageError && <p className="text-sm text-destructive">{voltageError}</p>}
                {voltageEmpty && <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>}
              </div>
              {codeTiles.length > 0 && (
                <TileGrid tiles={codeTiles} copyLabel={t('copy')} copiedLabel={t('copied')} />
              )}
            </div>
          </div>
        </ResultArea>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 进制转换跳转：HEX / DEC / BIN 已经有专门工具，不在这里重建
// ---------------------------------------------------------------------------

function RadixCard() {
  const t = useTranslations('UnitConverter')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('radixTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t('radixText')}</p>
        <Button asChild className="shrink-0">
          <Link href="/tools/base-converter">{t('radixLink')}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
