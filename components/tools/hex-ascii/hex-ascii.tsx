'use client'

import type { TextEncoding } from '@/lib/core/hexcodec'
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
import { Textarea } from '@/components/ui/textarea'
import {
  decodeBytes,
  encodeText,
  formatHexBytes,
  formatHexDump,
  parseCArray,
  parseHexBytes,
  toCArray,
} from '@/lib/core/hexcodec'
import { cn } from '@/lib/utils'

/** 输入是什么格式 —— 输出始终是 HEX / 文本 / C 数组 / hexdump 四种视图 */
type InputMode = 'text' | 'hex' | 'carray'

const INPUT_MODES: InputMode[] = ['text', 'hex', 'carray']

const ENCODINGS: TextEncoding[] = ['utf8', 'latin1']

/** 分隔符候选：空格（默认）、无、逗号 */
const SEPARATORS = [' ', '', ', '] as const
type HexSeparator = (typeof SEPARATORS)[number]

const SEPARATOR_LABELS = {
  ' ': 'separatorSpace',
  '': 'separatorNone',
  ', ': 'separatorComma',
} as const satisfies Record<HexSeparator, string>

const EXAMPLES: Record<InputMode, string> = {
  text: 'Hello 温度',
  hex: '48 65 6C 6C 6F 20 E6 B8 A9 E5 BA A6',
  carray: 'const uint8_t buf[] = {\n  0x48, 0x65, 0x6C, 0x6C, 0x6F,\n};',
}

export function HexAscii() {
  const t = useTranslations('HexAscii')

  const [mode, setMode] = useState<InputMode>('text')
  const [input, setInput] = useState(EXAMPLES.text)
  const [encoding, setEncoding] = useState<TextEncoding>('utf8')
  const [uppercase, setUppercase] = useState(true)
  const [prefix, setPrefix] = useState(false)
  const [separator, setSeparator] = useState<HexSeparator>(' ')
  const [arrayName, setArrayName] = useState('buf')

  const decoded = useMemo(() => {
    if (input.trim() === '')
      return { ok: true as const, bytes: new Uint8Array(new ArrayBuffer(0)) }

    if (mode === 'text')
      return { ok: true as const, bytes: encodeText(input, encoding) }

    if (mode === 'hex')
      return parseHexBytes(input)

    return parseCArray(input)
  }, [input, mode, encoding])

  const bytes = decoded.ok ? decoded.bytes : null

  const hex = bytes ? formatHexBytes(bytes, { uppercase, prefix, separator }) : ''
  const text = bytes ? decodeBytes(bytes, encoding) : ''
  const cArray = bytes ? toCArray(bytes, { name: arrayName || 'buf', uppercase }) : ''
  const dump = bytes ? formatHexDump(bytes) : ''

  const errorMessage = useMemo(() => {
    if (decoded.ok)
      return null
    switch (decoded.code) {
      case 'empty':
        return t('error.empty')
      case 'oddLength':
        return t('error.oddLength')
      case 'badChar':
        return t('error.badChar', { char: decoded.detail ?? '?' })
      case 'badToken':
        return t('error.badToken', { detail: decoded.detail ?? '?' })
      default:
        return t('error.outOfRange', { detail: decoded.detail ?? '?' })
    }
  }, [decoded, t])

  const modeLabel: Record<InputMode, string> = {
    text: t('modeText'),
    hex: t('modeHex'),
    carray: t('modeCArray'),
  }

  function switchMode(next: InputMode) {
    setMode(next)
    setInput(EXAMPLES[next])
  }

  const copyLabels = { label: t('copy'), copiedLabel: t('copied') }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t('input')}</CardTitle>
          <CardDescription>{t('lead')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>{t('inputMode')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {INPUT_MODES.map(item => (
                <Button
                  key={item}
                  size="xs"
                  variant={mode === item ? 'default' : 'outline'}
                  onClick={() => switchMode(item)}
                >
                  {modeLabel[item]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="hexascii-input">
                {modeLabel[mode]}
              </Label>
              <Button variant="outline" size="xs" onClick={() => setInput('')}>
                {t('clear')}
              </Button>
            </div>
            <Textarea
              id="hexascii-input"
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder={t(`placeholder.${mode}`)}
              className="min-h-32 font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t('encoding')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {ENCODINGS.map(item => (
                <Button
                  key={item}
                  size="xs"
                  variant={encoding === item ? 'default' : 'outline'}
                  className="font-mono"
                  onClick={() => setEncoding(item)}
                >
                  {item === 'utf8' ? t('encodingUtf8') : t('encodingLatin1')}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('encodingNote')}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('separator')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {SEPARATORS.map(item => (
                  <Button
                    key={item || 'none'}
                    size="xs"
                    variant={separator === item ? 'default' : 'outline'}
                    onClick={() => setSeparator(item)}
                  >
                    {t(SEPARATOR_LABELS[item])}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('hexOptions')}</Label>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="xs"
                  variant={uppercase ? 'default' : 'outline'}
                  onClick={() => setUppercase(value => !value)}
                >
                  {t('uppercase')}
                </Button>
                <Button
                  size="xs"
                  variant={prefix ? 'default' : 'outline'}
                  className="font-mono"
                  onClick={() => setPrefix(value => !value)}
                >
                  0x
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <Label htmlFor="hexascii-array-name">{t('arrayName')}</Label>
              <Input
                id="hexascii-array-name"
                value={arrayName}
                onChange={event => setArrayName(event.target.value)}
                className="w-40 font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {bytes ? t('byteCount', { count: bytes.length }) : ''}
            </p>
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
          </CardHeader>
          <CardContent className="space-y-3">
            {bytes && bytes.length > 0
              ? (
                  <>
                    <ResultRow title="HEX" value={hex} {...copyLabels} />
                    <ResultRow title={t('text')} value={text} {...copyLabels} />
                  </>
                )
              : <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>{t('cArray')}</CardTitle>
              <CopyButton value={cArray} {...copyLabels} />
            </div>
            <CardDescription>{t('cArrayNote')}</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border border-border/70 bg-muted/30 p-3 font-mono text-xs leading-relaxed">
              {cArray || t('emptyHint')}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>{t('hexdump')}</CardTitle>
              <CopyButton value={dump} {...copyLabels} />
            </div>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border border-border/70 bg-muted/30 p-3 font-mono text-xs leading-relaxed">
              {dump || t('emptyHint')}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('notes')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{t('noteLocal')}</p>
            <p>{t('noteEncoding')}</p>
            <p>{t('noteRoundTrip')}</p>
            <p>{t('noteHexdump')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ResultRow({
  title,
  value,
  label,
  copiedLabel,
}: {
  title: string
  value: string
  label: string
  copiedLabel: string
}) {
  return (
    <div className={cn('rounded-lg border border-border/70 p-2.5')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{title}</span>
        <CopyButton value={value} label={label} copiedLabel={copiedLabel} />
      </div>
      <code className="mt-1 block break-all font-mono text-sm whitespace-pre-wrap">{value}</code>
    </div>
  )
}
