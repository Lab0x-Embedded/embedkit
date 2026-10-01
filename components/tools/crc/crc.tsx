'use client'

import type { ReactNode } from 'react'
import type { CrcAlgorithm, CrcParams, CrcWidth } from '@/lib/core/crc'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  checkTrailingCrc,
  computeCrc,
  CRC_PRESETS,
  CRC_WIDTHS,
  crcToBytesBE,
  crcToBytesLE,
  formatCrc,
  getPreset,
} from '@/lib/core/crc'
import { encodeText, formatHexBytes, parseHexBytes } from '@/lib/core/hexcodec'
import { cn } from '@/lib/utils'

type InputMode = 'text' | 'hex'

const INPUT_MODES: InputMode[] = ['text', 'hex']

/** 预设按位宽分组，下拉里好找 */
const PRESETS_BY_WIDTH = CRC_WIDTHS.map(width => ({
  width,
  items: CRC_PRESETS.filter(preset => preset.width === width),
}))

const DEFAULT_PRESET = 'crc-16-modbus'

/** 参数框接受 `0x1EDC6F41` 或十进制 */
function parseParam(raw: string): bigint | null {
  const text = raw.trim().replace(/[\s_]/g, '')
  if (!text)
    return null
  try {
    return BigInt(/^0x[0-9a-f]+$/i.test(text) ? text : `0x${BigInt(text).toString(16)}`)
  }
  catch {
    return null
  }
}

export function Crc() {
  const t = useTranslations('Crc')

  const [mode, setMode] = useState<InputMode>('hex')
  // 默认给一段纯数据（Modbus「读保持寄存器」的 PDU），结果卡直接给出它的 CRC
  const [input, setInput] = useState('01 03 00 00 00 0A')
  const [presetId, setPresetId] = useState(DEFAULT_PRESET)
  const [tailOrder, setTailOrder] = useState<'le' | 'be'>('le')
  const [checkFrame, setCheckFrame] = useState(false)

  const [customWidth, setCustomWidth] = useState<CrcWidth>(16)
  const [customPoly, setCustomPoly] = useState('0x8005')
  const [customInit, setCustomInit] = useState('0xFFFF')
  const [customRefin, setCustomRefin] = useState(true)
  const [customRefout, setCustomRefout] = useState(true)
  const [customXorout, setCustomXorout] = useState('0x0000')

  const decoded = useMemo(() => {
    if (input.trim() === '')
      return { ok: true as const, bytes: new Uint8Array(new ArrayBuffer(0)) }
    return mode === 'text'
      ? { ok: true as const, bytes: encodeText(input, 'utf8') }
      : parseHexBytes(input)
  }, [input, mode])

  /** 自定义参数解析失败时给出错误码，UI 决定怎么提示 */
  const custom = useMemo(() => {
    const poly = parseParam(customPoly)
    const init = parseParam(customInit)
    const xorout = parseParam(customXorout)
    if (poly === null || init === null || xorout === null)
      return { ok: false as const, code: 'badParam' as const }

    const params: CrcParams = {
      width: customWidth,
      poly,
      init,
      refin: customRefin,
      refout: customRefout,
      xorout,
    }
    return { ok: true as const, params }
  }, [customWidth, customPoly, customInit, customRefin, customRefout, customXorout])

  const isCustom = presetId === 'custom'

  const algorithm: CrcAlgorithm | null = useMemo(() => {
    if (!isCustom)
      return getPreset(presetId) ?? null
    if (!custom.ok)
      return null
    // 重量级的是建表，js-crc 内部按参数缓存，这里不用再套一层 memo
    return { id: 'custom', width: custom.params.width, compute: (bytes: Uint8Array) => computeCrc(bytes, custom.params) }
  }, [isCustom, presetId, custom])

  const bytes = decoded.ok ? decoded.bytes : null
  const value = bytes && algorithm ? algorithm.compute(bytes) : null

  /** 把末尾若干字节当作报文里的 CRC 一起校验（粘贴一整帧就能立刻看出对错） */
  const trailing = useMemo(() => {
    if (!checkFrame || !bytes || !algorithm)
      return null
    const size = algorithm.width / 8
    if (bytes.length <= size)
      return null
    return checkTrailingCrc(bytes, algorithm, tailOrder)
  }, [checkFrame, bytes, algorithm, tailOrder])

  const errorMessage = useMemo(() => {
    if (!decoded.ok) {
      switch (decoded.code) {
        case 'empty':
          return t('error.empty')
        case 'oddLength':
          return t('error.oddLength')
        case 'badChar':
          return t('error.badChar', { char: decoded.detail ?? '?' })
        default:
          return t('error.empty')
      }
    }
    if (isCustom && !custom.ok)
      return t('error.badParam')
    return null
  }, [decoded, isCustom, custom, t])

  const copyLabels = { copyLabel: t('copy'), copiedLabel: t('copied') }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t('input')}</CardTitle>
          <CardDescription>{t('lead')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="crc-input">{t('data')}</Label>
              <Button variant="outline" size="xs" onClick={() => setInput('')}>
                {t('clear')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {INPUT_MODES.map(item => (
                <Button
                  key={item}
                  size="xs"
                  variant={mode === item ? 'default' : 'outline'}
                  onClick={() => setMode(item)}
                >
                  {item === 'text' ? t('modeText') : t('modeHex')}
                </Button>
              ))}
            </div>
            <Textarea
              id="crc-input"
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder={mode === 'text' ? t('placeholderText') : t('placeholderHex')}
              className="min-h-28 font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t('algorithm')}</Label>
            <Select value={presetId} onValueChange={setPresetId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS_BY_WIDTH.map(group => (
                  <SelectGroup key={group.width}>
                    <SelectLabel>
                      {group.width}
                      {' bit'}
                    </SelectLabel>
                    {group.items.map(preset => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {t(`presets.${preset.id}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                <SelectGroup>
                  <SelectLabel>{t('customGroup')}</SelectLabel>
                  <SelectItem value="custom">{t('custom')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {isCustom && (
            <div className="space-y-4 rounded-lg border border-border/70 p-3">
              <div className="space-y-2">
                <Label>{t('width')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {CRC_WIDTHS.map(width => (
                    <Button
                      key={width}
                      size="xs"
                      variant={customWidth === width ? 'default' : 'outline'}
                      className="font-mono"
                      onClick={() => setCustomWidth(width)}
                    >
                      {width}
                    </Button>
                  ))}
                </div>
              </div>

              <ParamField label={t('poly')} value={customPoly} onChange={setCustomPoly} />
              <ParamField label={t('init')} value={customInit} onChange={setCustomInit} />
              <ParamField label={t('xorout')} value={customXorout} onChange={setCustomXorout} />

              <div className="flex flex-wrap gap-1.5">
                <ToggleButton active={customRefin} onClick={() => setCustomRefin(value => !value)}>
                  {t('refin')}
                </ToggleButton>
                <ToggleButton active={customRefout} onClick={() => setCustomRefout(value => !value)}>
                  {t('refout')}
                </ToggleButton>
              </div>
              <p className="text-xs text-muted-foreground">{t('customNote')}</p>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <Label>{t('frameCheck')}</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="xs"
                variant={checkFrame ? 'default' : 'outline'}
                onClick={() => setCheckFrame(value => !value)}
              >
                {t('frameCheckToggle')}
              </Button>
              <Button
                size="xs"
                variant={tailOrder === 'le' ? 'default' : 'outline'}
                disabled={!checkFrame}
                onClick={() => setTailOrder('le')}
              >
                {t('littleEndian')}
              </Button>
              <Button
                size="xs"
                variant={tailOrder === 'be' ? 'default' : 'outline'}
                disabled={!checkFrame}
                onClick={() => setTailOrder('be')}
              >
                {t('bigEndian')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('frameCheckNote')}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        {errorMessage
          ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {errorMessage}
              </p>
            )
          : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('result')}</CardTitle>
            <CardDescription>
              {bytes ? t('byteCount', { count: bytes.length }) : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {value !== null && algorithm
              ? (
                  <>
                    <ValueRow
                      label={t('crcValue')}
                      value={formatCrc(value, algorithm.width)}
                      {...copyLabels}
                    />
                    <ValueRow label={t('decimal')} value={value.toString(10)} {...copyLabels} />
                    <ValueRow
                      label={t('bytesBE')}
                      value={formatHexBytes(crcToBytesBE(value, algorithm.width))}
                      {...copyLabels}
                    />
                    <ValueRow
                      label={t('bytesLE')}
                      value={formatHexBytes(crcToBytesLE(value, algorithm.width))}
                      {...copyLabels}
                    />
                  </>
                )
              : <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>}
          </CardContent>
        </Card>

        {trailing && trailing !== 'tooShort' && algorithm && (
          <Card>
            <CardHeader>
              <CardTitle>{t('frameCheck')}</CardTitle>
              <CardDescription>{t('frameCheckNote')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={cn(
                  'rounded-lg border p-2.5 text-sm',
                  trailing.ok
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : 'border-destructive/30 bg-destructive/5 text-destructive',
                )}
              >
                {trailing.ok ? t('frameOk') : t('frameBad')}
              </div>
              <ValueRow label={t('trailing')} value={formatCrc(trailing.trailing, algorithm.width)} {...copyLabels} />
              <ValueRow label={t('computed')} value={formatCrc(trailing.computed, algorithm.width)} {...copyLabels} />
              {bytes && (
                <ValueRow
                  label={t('payload')}
                  value={formatHexBytes(bytes.subarray(0, bytes.length - algorithm.width / 8))}
                  {...copyLabels}
                />
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('notes')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{t('noteLibrary')}</p>
            <p>{t('noteCheck')}</p>
            <p>{t('noteZero')}</p>
            <p>{t('noteLocal')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ParamField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={event => onChange(event.target.value)}
        className="font-mono"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button size="xs" variant={active ? 'default' : 'outline'} onClick={onClick}>
      {children}
    </Button>
  )
}

function ValueRow({
  label,
  value,
  copyLabel,
  copiedLabel,
}: {
  label: string
  value: string
  copyLabel: string
  copiedLabel: string
}) {
  return (
    <div className="rounded-lg border border-border/70 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <CopyButton value={value} label={copyLabel} copiedLabel={copiedLabel} />
      </div>
      <code className="mt-1 block break-all font-mono text-sm">{value}</code>
    </div>
  )
}
