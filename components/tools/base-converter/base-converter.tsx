'use client'

import type { BitWidth, Radix, RadixKey } from '@/lib/core/radix'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { CopyButton } from '@/components/tools/copy-button'
import { Badge } from '@/components/ui/badge'
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
import { byteOrder, convertAll, interpret, RADIX_ROWS, WIDTHS } from '@/lib/core/radix'
import { cn } from '@/lib/utils'

type SourceOption = Radix | 'auto'

const SOURCE_OPTIONS: { value: SourceOption, short: string }[] = [
  { value: 'auto', short: 'AUTO' },
  ...RADIX_ROWS.map(row => ({ value: row.radix as SourceOption, short: row.label })),
]

const EXAMPLES = ['0xFF', '0b1010 1010', '0o777', '4294967295', '-1']

export function BaseConverter() {
  const t = useTranslations('BaseConverter')
  const tr = useTranslations('Radix')

  const [input, setInput] = useState('0xFF')
  const [source, setSource] = useState<SourceOption>('auto')
  const [width, setWidth] = useState<BitWidth>(32)

  const radixNames: Record<RadixKey, string> = {
    hex: tr('hex'),
    dec: tr('dec'),
    bin: tr('bin'),
    oct: tr('oct'),
  }

  const converted = useMemo(
    () => convertAll(input, source === 'auto' ? undefined : source),
    [input, source],
  )

  const interpretation = converted.ok ? interpret(converted.value, width) : null
  const bytes = converted.ok ? byteOrder(converted.value, width) : null

  const isEmpty = input.trim() === ''

  const errorMessage = useMemo(() => {
    if (converted.ok)
      return null
    switch (converted.code) {
      case 'empty':
        return t('error.empty')
      case 'noDigits':
        return t('error.noDigits')
      case 'badDigit':
        return t('error.badDigit', { char: converted.detail ?? '?', radix: converted.radix ?? 10 })
      case 'prefixMismatch':
        return t('error.prefixMismatch', { prefix: converted.detail ?? '', radix: converted.radix ?? 10 })
      default:
        return t('error.invalidFormat')
    }
  }, [converted, t])

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t('result')}</CardTitle>
          <CardDescription>{t('lead')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="radix-input">{t('inputLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="radix-input"
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder={t('inputPlaceholder')}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <Button variant="outline" size="sm" onClick={() => setInput('')}>
                {t('clear')}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted-foreground">{t('examples')}</span>
              {EXAMPLES.map(example => (
                <Button
                  key={example}
                  variant="ghost"
                  size="xs"
                  className="font-mono text-muted-foreground"
                  onClick={() => setInput(example)}
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('sourceRadix')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {SOURCE_OPTIONS.map(option => (
                  <Button
                    key={option.short}
                    size="xs"
                    variant={source === option.value ? 'default' : 'outline'}
                    className="font-mono"
                    onClick={() => setSource(option.value)}
                  >
                    {option.value === 'auto' ? t('auto') : option.short}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('bitWidth')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {WIDTHS.map(item => (
                  <Button
                    key={item}
                    size="xs"
                    variant={width === item ? 'default' : 'outline'}
                    className="font-mono"
                    onClick={() => setWidth(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          {isEmpty
            ? <p className="py-2 text-sm text-muted-foreground">{t('emptyHint')}</p>
            : converted.ok
              ? (
                  <div className="space-y-2">
                    {converted.rows.map(row => (
                      <div
                        key={row.label}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border border-border/70 p-2.5',
                          row.isSource && 'border-primary/40 bg-primary/5',
                        )}
                      >
                        <span className="w-9 shrink-0 font-mono text-[11px] text-muted-foreground">
                          {row.label}
                        </span>
                        <span className="hidden w-14 shrink-0 text-xs text-muted-foreground sm:inline">
                          {radixNames[row.key]}
                        </span>
                        <code className="min-w-0 flex-1 break-all font-mono text-sm">
                          {row.display}
                        </code>
                        {row.isSource && (
                          <Badge variant="secondary" className="rounded-4xl">
                            {t('source')}
                          </Badge>
                        )}
                        <CopyButton
                          value={row.raw}
                          label={t('copy')}
                          copiedLabel={t('copied')}
                        />
                      </div>
                    ))}
                  </div>
                )
              : (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {errorMessage}
                  </p>
                )}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('interpret')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {interpretation
              ? (
                  <>
                    <ValueRow
                      label={t('unsigned')}
                      value={interpretation.unsigned}
                      copyLabel={t('copy')}
                      copiedLabel={t('copied')}
                    />
                    <ValueRow
                      label={t('signed')}
                      value={interpretation.signed}
                      copyLabel={t('copy')}
                      copiedLabel={t('copied')}
                    />
                    <ValueRow
                      label={t('signBit')}
                      value={interpretation.signBitSet ? t('signBitSet') : t('signBitClear')}
                      copyLabel={t('copy')}
                      copiedLabel={t('copied')}
                    />
                    <ValueRow
                      label="BIN"
                      value={interpretation.bin}
                      copyLabel={t('copy')}
                      copiedLabel={t('copied')}
                    />
                    <ValueRow
                      label="HEX"
                      value={interpretation.hex}
                      copyLabel={t('copy')}
                      copiedLabel={t('copied')}
                    />
                  </>
                )
              : <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('byteOrder')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bytes
              ? (
                  <>
                    <ValueRow
                      label={t('bigEndian')}
                      value={bytes.bigEndian}
                      copyLabel={t('copy')}
                      copiedLabel={t('copied')}
                    />
                    <ValueRow
                      label={t('littleEndian')}
                      value={bytes.littleEndian}
                      copyLabel={t('copy')}
                      copiedLabel={t('copied')}
                    />
                  </>
                )
              : <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('notes')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{t('noteInteger')}</p>
            <p>{t('noteCopy')}</p>
          </CardContent>
        </Card>
      </div>
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
      <code className="mt-1 block break-all font-mono text-sm">{value}</code>
    </div>
  )
}
