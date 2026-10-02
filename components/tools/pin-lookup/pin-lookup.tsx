'use client'

import { ExternalLink, Lightbulb } from 'lucide-react'
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
import { buildPinAtlasUrl, PINATLAS_ORIGIN, suggestCubeMxId } from '@/lib/core/pinatlas'

/**
 * 常用型号示例。
 *
 * 全部对着 PinAtlas 数据集（pinatlas-data `index/st/*.json`）逐条核对过 ——
 * 数据集里的 ID 用 `x` 占位封装/温度等级，写错会被 PinAtlas 静默退回默认型号，
 * 所以示例必须是真能命中的那种。
 */
const EXAMPLES = [
  'STM32F103C8Tx',
  'STM32F103RCTx',
  'STM32F103VETx',
  'STM32F401CCUx',
  'STM32F407VETx',
  'STM32F411CEUx',
  'STM32G030F6Px',
  'STM32G071CBTx',
  'STM32H743VITx',
  'STM32L431CBTx',
  'STM32C031C6Tx',
]

export function PinLookup() {
  const t = useTranslations('PinLookup')

  const [chip, setChip] = useState('STM32F103C8Tx')
  const [pin, setPin] = useState('')
  const [variant, setVariant] = useState('')

  const built = useMemo(
    () => buildPinAtlasUrl({ chip, pin, variant }),
    [chip, pin, variant],
  )

  /** 贴了订货号（STM32F103C8T6）时给出纠正建议 */
  const suggestion = useMemo(() => suggestCubeMxId(chip), [chip])

  const errorMessage = useMemo(() => {
    if (built.ok)
      return null
    switch (built.code) {
      case 'emptyChip':
        return t('error.emptyChip')
      case 'badChip':
        return t('error.badChip', { detail: built.detail ?? '?' })
      case 'badPin':
        return t('error.badPin', { detail: built.detail ?? '?' })
      default:
        return t('error.badVariant', { detail: built.detail ?? '?' })
    }
  }, [built, t])

  const url = built.ok ? built.url : ''

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>{t('query')}</CardTitle>
          <CardDescription>{t('lead')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="pin-lookup-chip">{t('chip')}</Label>
            <Input
              id="pin-lookup-chip"
              value={chip}
              onChange={event => setChip(event.target.value)}
              placeholder={t('chipPlaceholder')}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">{t('chipNote')}</p>

            {suggestion && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs">
                <Lightbulb className="size-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
                <span className="text-muted-foreground">
                  {t('suggestion', { suggested: suggestion })}
                </span>
                <Button size="xs" variant="outline" onClick={() => setChip(suggestion)}>
                  {t('suggestionUse')}
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pin-lookup-pin">{t('pin')}</Label>
              <Input
                id="pin-lookup-pin"
                value={pin}
                onChange={event => setPin(event.target.value)}
                placeholder={t('pinPlaceholder')}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">{t('pinNote')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin-lookup-variant">{t('variant')}</Label>
              <Input
                id="pin-lookup-variant"
                value={variant}
                onChange={event => setVariant(event.target.value)}
                placeholder={t('variantPlaceholder')}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">{t('variantNote')}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t('examples')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map(example => (
                <Button
                  key={example}
                  size="xs"
                  variant={chip === example ? 'default' : 'outline'}
                  className="font-mono"
                  onClick={() => setChip(example)}
                >
                  {example}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('examplesNote')}</p>
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
            {built.ok
              ? (
                  <>
                    <div className="rounded-lg border border-border/70 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{t('target')}</span>
                        <CopyButton value={url} label={t('copy')} copiedLabel={t('copied')} />
                      </div>
                      <code className="mt-1 block break-all font-mono text-xs">{url}</code>
                    </div>
                    <Button asChild className="w-full">
                      <a href={url} target="_blank" rel="noreferrer noopener">
                        <ExternalLink className="size-4" />
                        {t('open')}
                      </a>
                    </Button>
                  </>
                )
              : <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('about')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{t('noteExternal', { origin: PINATLAS_ORIGIN })}</p>
            <p>{t('noteFormat')}</p>
            <p>{t('noteData')}</p>
            <p>{t('notePrivacy')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
