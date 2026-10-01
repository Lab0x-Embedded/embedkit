'use client'

import type { ModbusField, ModbusFunctionCode, ModbusMode, ModbusRequestInput } from '@/lib/core/modbus'
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { formatHexBytes, parseHexBytes, toCArray } from '@/lib/core/hexcodec'
import {
  buildModbusRequest,
  MODBUS_FUNCTION_META,
  MODBUS_FUNCTIONS,
  MODBUS_LIMITS,
  MODBUS_MODES,
  parseModbusFrame,
} from '@/lib/core/modbus'
import { cn } from '@/lib/utils'

type Panel = 'build' | 'parse'

/** 输入数字：接受 `0x1F` 与十进制，空串返回 null */
function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(/[\s_]/g, '')
  if (!text)
    return null
  const value = /^0x[0-9a-f]+$/i.test(text) ? Number.parseInt(text.slice(2), 16) : Number(text)
  return Number.isFinite(value) ? value : null
}

/** 值列表：逗号 / 空格 / 分号都行，`0x` 前缀可选 */
function parseValues(raw: string): number[] {
  return raw
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(parseNumber)
    .filter((value): value is number => value !== null)
}

export function ModbusFrame() {
  const t = useTranslations('Modbus')

  const [panel, setPanel] = useState<Panel>('build')

  const [mode, setMode] = useState<ModbusMode>('rtu')
  const [unitId, setUnitId] = useState('1')
  const [transactionId, setTransactionId] = useState('1')
  const [functionCode, setFunctionCode] = useState<ModbusFunctionCode>(3)
  const [address, setAddress] = useState('0x0000')
  const [quantity, setQuantity] = useState('10')
  const [values, setValues] = useState('0x000A 0x0102')

  const [parseMode, setParseMode] = useState<ModbusMode>('rtu')
  const [parseInput, setParseInput] = useState('01 03 00 00 00 0A C5 CD')

  const meta = MODBUS_FUNCTION_META[functionCode]
  const limits = MODBUS_LIMITS[functionCode]

  const built = useMemo(() => {
    const unit = parseNumber(unitId)
    const addr = parseNumber(address)
    const count = parseNumber(quantity)
    const list = parseValues(values)

    if (unit === null)
      return { ok: false as const, code: 'badUnitId' as const, detail: unitId }
    if (addr === null)
      return { ok: false as const, code: 'badAddress' as const, detail: address }

    const input: ModbusRequestInput = {
      mode,
      unitId: unit,
      functionCode,
      address: addr,
      quantity: count ?? undefined,
      values: list,
      transactionId: mode === 'tcp' ? (parseNumber(transactionId) ?? undefined) : undefined,
    }
    return buildModbusRequest(input)
  }, [mode, unitId, transactionId, functionCode, address, quantity, values])

  const parsed = useMemo(() => {
    if (parseInput.trim() === '')
      return null
    const bytes = parseHexBytes(parseInput)
    if (!bytes.ok)
      return { ok: false as const, code: bytes.code, detail: bytes.detail }
    return parseModbusFrame(bytes.bytes, parseMode)
  }, [parseInput, parseMode])

  const frameBytes = built.ok ? built.bytes : null

  /** 组帧与拆帧的错误码都从这里转成文案 */
  function errorText(code: string, detail?: string): string {
    switch (code) {
      case 'badUnitId':
        return t('error.badUnitId')
      case 'badTransactionId':
        return t('error.badTransactionId')
      case 'badAddress':
        return t('error.badAddress')
      case 'badQuantity':
        return t('error.badQuantity', { min: limits.min, max: limits.max })
      case 'badValue':
        return t('error.badValue', { detail: detail ?? '?' })
      case 'emptyValues':
        return t('error.emptyValues')
      case 'unsupportedFunction':
        return t('error.unsupportedFunction', { detail: detail ?? '?' })
      case 'tooShort':
        return t('error.tooShort')
      case 'badCrc':
        return t('error.badCrc')
      case 'badProtocolId':
        return t('error.badProtocolId', { detail: detail ?? '?' })
      case 'badLength':
        return t('error.badLength', { detail: detail ?? '?' })
      case 'empty':
        return t('error.emptyInput')
      case 'oddLength':
        return t('error.oddLength')
      case 'badChar':
        return t('error.badChar', { char: detail ?? '?' })
      default:
        return t('error.badValue', { detail: detail ?? '?' })
    }
  }

  const copyLabels = { copyLabel: t('copy'), copiedLabel: t('copied') }

  const functionLabel = (code: ModbusFunctionCode) =>
    t(`functions.${code}`)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={panel === 'build' ? 'default' : 'outline'} onClick={() => setPanel('build')}>
          {t('panelBuild')}
        </Button>
        <Button size="sm" variant={panel === 'parse' ? 'default' : 'outline'} onClick={() => setPanel('parse')}>
          {t('panelParse')}
        </Button>
      </div>

      {panel === 'build'
        ? (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>{t('request')}</CardTitle>
                  <CardDescription>{t('buildLead')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>{t('mode')}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {MODBUS_MODES.map(item => (
                        <Button
                          key={item}
                          size="xs"
                          variant={mode === item ? 'default' : 'outline'}
                          className="font-mono"
                          onClick={() => setMode(item)}
                        >
                          {item.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{t(`modeNote.${mode}`)}</p>
                  </div>

                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <NumberField label={t('unitId')} value={unitId} onChange={setUnitId} />
                    {mode === 'tcp'
                      ? <NumberField label={t('transactionId')} value={transactionId} onChange={setTransactionId} />
                      : null}
                  </div>

                  <div className="space-y-2">
                    <Label>{t('function')}</Label>
                    <Select
                      value={String(functionCode)}
                      onValueChange={value => setFunctionCode(Number(value) as ModbusFunctionCode)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODBUS_FUNCTIONS.map(code => (
                          <SelectItem key={code} value={String(code)}>
                            {functionLabel(code)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <NumberField label={t('address')} value={address} onChange={setAddress} />
                    {meta.kind === 'read'
                      ? <NumberField label={t('quantity')} value={quantity} onChange={setQuantity} />
                      : null}
                  </div>

                  {meta.kind === 'write' && (
                    <div className="space-y-2">
                      <Label htmlFor="modbus-values">
                        {meta.arity === 'single'
                          ? (meta.target === 'coil' ? t('coilValue') : t('registerValue'))
                          : t('values')}
                      </Label>
                      <Textarea
                        id="modbus-values"
                        value={values}
                        onChange={event => setValues(event.target.value)}
                        placeholder={meta.target === 'coil' ? t('valuesCoilPlaceholder') : t('valuesPlaceholder')}
                        className="min-h-16 font-mono"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <p className="text-xs text-muted-foreground">
                        {meta.target === 'coil' ? t('valuesCoilNote') : t('valuesNote')}
                      </p>
                    </div>
                  )}

                  {meta.kind === 'read' && (
                    <p className="text-xs text-muted-foreground">
                      {t('quantityNote', { min: limits.min, max: limits.max })}
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-6">
                {!built.ok
                  ? (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        {errorText(built.code, built.detail)}
                      </p>
                    )
                  : null}

                <Card>
                  <CardHeader>
                    <CardTitle>{t('frame')}</CardTitle>
                    <CardDescription>
                      {frameBytes ? t('byteCount', { count: frameBytes.length }) : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {frameBytes
                      ? (
                          <>
                            <ValueRow
                              label={mode.toUpperCase()}
                              value={formatHexBytes(frameBytes)}
                              {...copyLabels}
                            />
                            <ValueRow label={t('cArray')} value={toCArray(frameBytes)} {...copyLabels} />
                          </>
                        )
                      : <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('breakdown')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {built.ok
                      ? built.fields.map(field => (
                          <FieldRow key={`${field.key}-${field.value}`} field={field} label={t(`fields.${field.key}`)} />
                        ))
                      : <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('notes')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{t('noteRtu')}</p>
                    <p>{t('noteLimits')}</p>
                    <p>{t('noteLocal')}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )
        : (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>{t('parseInput')}</CardTitle>
                  <CardDescription>{t('parseLead')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>{t('mode')}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {MODBUS_MODES.map(item => (
                        <Button
                          key={item}
                          size="xs"
                          variant={parseMode === item ? 'default' : 'outline'}
                          className="font-mono"
                          onClick={() => setParseMode(item)}
                        >
                          {item.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    value={parseInput}
                    onChange={event => setParseInput(event.target.value)}
                    placeholder={t('parsePlaceholder')}
                    className="min-h-32 font-mono"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">{t('parseNote')}</p>
                </CardContent>
              </Card>

              <div className="grid gap-6">
                {parsed && !parsed.ok
                  ? (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        {errorText(parsed.code, 'detail' in parsed ? parsed.detail : undefined)}
                      </p>
                    )
                  : null}

                {parsed?.ok && (
                  <>
                    {parsed.crc && (
                      <p
                        className={cn(
                          'rounded-lg border p-2.5 text-sm',
                          parsed.crc.valid
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-destructive/30 bg-destructive/5 text-destructive',
                        )}
                      >
                        {parsed.crc.valid ? t('crcOk') : t('crcBad')}
                      </p>
                    )}
                    {parsed.exception !== undefined && (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        {t('exception', { code: parsed.exception })}
                      </p>
                    )}
                    <Card>
                      <CardHeader>
                        <CardTitle>{t('breakdown')}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {parsed.fields.map(field => (
                          <FieldRow key={`${field.key}-${field.value}`} field={field} label={t(`fields.${field.key}`)} />
                        ))}
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
            </div>
          )}
    </div>
  )
}

function NumberField({
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

function FieldRow({ field, label }: { field: ModbusField, label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="font-mono text-sm">{field.value}</code>
    </div>
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
      <code className="mt-1 block break-all font-mono text-sm whitespace-pre-wrap">{value}</code>
    </div>
  )
}
