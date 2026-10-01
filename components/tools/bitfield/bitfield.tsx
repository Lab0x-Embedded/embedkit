'use client'

import type { BitFieldDef, BitWidth } from '@/lib/core/bitfield'
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
import { Separator } from '@/components/ui/separator'
import {
  bitCells,
  clampToWidth,
  clearAll,
  extractField,
  invertAll,
  parseRegisterInput,
  registerView,
  setAll,
  toCMacros,
  toggleBit,
  validateField,
  WIDTHS,
} from '@/lib/core/bitfield'
import { cn } from '@/lib/utils'

const HEX_DIGITS: Record<BitWidth, number> = { 8: 2, 16: 4, 32: 8, 64: 16 }

function toHexText(value: bigint, width: BitWidth): string {
  return `0x${value.toString(16).toUpperCase().padStart(HEX_DIGITS[width], '0')}`
}

let fieldSeq = 0
function newField(width: BitWidth): BitFieldDef {
  fieldSeq += 1
  const msb = width - 1
  return { id: `f${fieldSeq}`, name: '', msb, lsb: msb }
}

export function Bitfield() {
  const t = useTranslations('Bitfield')

  const [width, setWidth] = useState<BitWidth>(32)
  const [value, setValue] = useState<bigint>(0x0000_2301n)
  const [text, setText] = useState(() => toHexText(0x0000_2301n, 32))
  const [fields, setFields] = useState<BitFieldDef[]>([
    { id: 'f0', name: 'PLLM', msb: 5, lsb: 0 },
  ])
  const [registerName, setRegisterName] = useState('RCC_CFGR')

  const parsed = useMemo(() => parseRegisterInput(text, width), [text, width])
  const view = useMemo(() => registerView(value, width), [value, width])
  const cells = useMemo(() => bitCells(value, width), [value, width])

  /** 值变化时同步显示用的 HEX 文本 */
  function commit(next: bigint) {
    const clamped = clampToWidth(next, width)
    setValue(clamped)
    setText(toHexText(clamped, width))
  }

  function changeWidth(next: BitWidth) {
    setWidth(next)
    const clamped = clampToWidth(value, next)
    setValue(clamped)
    setText(toHexText(clamped, next))
  }

  const errorMessage = useMemo(() => {
    if (parsed.ok)
      return null
    switch (parsed.code) {
      case 'empty':
        return t('error.empty')
      case 'badChar':
        return t('error.badChar', { char: parsed.detail ?? '?' })
      default:
        return t('error.outOfRange', { detail: parsed.detail ?? '?', width })
    }
  }, [parsed, t, width])

  const copyLabels = { copyLabel: t('copy'), copiedLabel: t('copied') }
  const macros = useMemo(
    () => toCMacros(value, width, fields, registerName),
    [value, width, fields, registerName],
  )

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t('register')}</CardTitle>
          <CardDescription>{t('lead')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>{t('width')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {WIDTHS.map(item => (
                <Button
                  key={item}
                  size="xs"
                  variant={width === item ? 'default' : 'outline'}
                  className="font-mono"
                  onClick={() => changeWidth(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bitfield-input">{t('input')}</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="bitfield-input"
                value={text}
                onChange={(event) => {
                  setText(event.target.value)
                  const result = parseRegisterInput(event.target.value, width)
                  if (result.ok)
                    setValue(result.value)
                }}
                placeholder={t('inputPlaceholder')}
                className="min-w-40 flex-1 font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <Button variant="outline" size="sm" onClick={() => commit(clearAll())}>
                {t('clearAll')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => commit(setAll(width))}>
                {t('setAll')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => commit(invertAll(value, width))}>
                {t('invert')}
              </Button>
            </div>
            {errorMessage && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t('grid')}</Label>
            <div className="space-y-1.5">
              {chunk(cells, 8).map(row => (
                <div key={row[0].index} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    {`bit ${row[0].index}`}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {row.map(cell => (
                      <button
                        key={cell.index}
                        type="button"
                        title={`bit ${cell.index}`}
                        aria-pressed={cell.set}
                        onClick={() => commit(toggleBit(value, cell.index, width))}
                        className={cn(
                          'size-8 rounded-md border font-mono text-xs transition-colors',
                          cell.set
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {cell.set ? 1 : 0}
                      </button>
                    ))}
                  </div>
                  <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                    {`.. bit ${row[row.length - 1].index}`}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('gridNote')}</p>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <ViewRow label="HEX" value={view.hex} {...copyLabels} />
              <ViewRow label="BIN" value={view.bin} {...copyLabels} />
              <ViewRow label="DEC" value={view.dec} {...copyLabels} />
              <ViewRow label={t('signed')} value={view.signed} {...copyLabels} />
            </div>
            <p className="text-xs text-muted-foreground">
              {view.signBitSet ? t('signBitSet', { width }) : t('signBitClear', { width })}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('fields')}</CardTitle>
            <CardDescription>{t('fieldsNote')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('fieldsEmpty')}</p>
            )}

            {fields.map(field => (
              <FieldEditor
                key={field.id}
                field={field}
                width={width}
                value={value}
                labels={{
                  name: t('fieldName'),
                  remove: t('fieldRemove'),
                  msb: t('fieldMsb'),
                  lsb: t('fieldLsb'),
                  fieldValue: t('fieldValue'),
                  emptyName: t('fieldError.emptyName'),
                  badRange: t('fieldError.badRange'),
                  outOfWidth: t('fieldError.outOfWidth', { width }),
                }}
                onChange={next =>
                  setFields(list => list.map(item => (item.id === field.id ? next : item)))}
                onRemove={() => setFields(list => list.filter(item => item.id !== field.id))}
              />
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setFields(list => [...list, newField(width)])}
            >
              {t('fieldAdd')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>{t('macros')}</CardTitle>
              <CopyButton value={macros} label={t('copy')} copiedLabel={t('copied')} />
            </div>
            <CardDescription>{t('macrosNote')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">{t('registerName')}</Label>
              <Input
                value={registerName}
                onChange={event => setRegisterName(event.target.value)}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border/70 bg-muted/30 p-3 font-mono text-xs leading-relaxed">
              {macros}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('notes')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{t('noteClick')}</p>
            <p>{t('noteSigned', { width })}</p>
            <p>{t('noteLocal')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size)
    out.push(list.slice(i, i + size))
  return out
}

interface FieldLabels {
  name: string
  remove: string
  msb: string
  lsb: string
  fieldValue: string
  emptyName: string
  badRange: string
  outOfWidth: string
}

function FieldEditor({
  field,
  width,
  value,
  labels,
  onChange,
  onRemove,
}: {
  field: BitFieldDef
  width: BitWidth
  value: bigint
  labels: FieldLabels
  onChange: (field: BitFieldDef) => void
  onRemove: () => void
}) {
  const validation = validateField(field, width)
  const extracted = validation.ok ? extractField(value, field) : null

  return (
    <div className="space-y-2 rounded-lg border border-border/70 p-3">
      <div className="flex items-center gap-2">
        <Input
          value={field.name}
          onChange={event => onChange({ ...field, name: event.target.value })}
          placeholder={labels.name}
          className="flex-1 font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <Button variant="ghost" size="xs" onClick={onRemove}>
          {labels.remove}
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <div className="w-20 space-y-1">
          <Label className="text-[11px]">{labels.msb}</Label>
          <Input
            value={String(field.msb)}
            onChange={event => onChange({ ...field, msb: Number(event.target.value) || 0 })}
            className="font-mono"
            autoComplete="off"
          />
        </div>
        <div className="w-20 space-y-1">
          <Label className="text-[11px]">{labels.lsb}</Label>
          <Input
            value={String(field.lsb)}
            onChange={event => onChange({ ...field, lsb: Number(event.target.value) || 0 })}
            className="font-mono"
            autoComplete="off"
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-[11px]">{labels.fieldValue}</Label>
          <code className="block rounded-lg border border-border/70 px-2.5 py-1.5 font-mono text-sm">
            {extracted === null ? '—' : `${extracted} (0x${extracted.toString(16).toUpperCase()})`}
          </code>
        </div>
      </div>
      {!validation.ok && (
        <p className="text-xs text-destructive">
          {validation.code === 'emptyName'
            ? labels.emptyName
            : validation.code === 'badRange' ? labels.badRange : labels.outOfWidth}
        </p>
      )}
    </div>
  )
}

function ViewRow({
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
