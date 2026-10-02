'use client'

import type { ChangeEvent } from 'react'
import type { AtBlock, OneNetBuild, OneNetErrorCode, OneNetMethod } from '@/lib/core/onenet'
import type { OneNetFormState } from '@/lib/core/onenet-store'
import { KeyRound, RotateCcw, Terminal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState, useSyncExternalStore } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { onenetStore } from '@/lib/browser/onenet-store'
import {
  buildAtBlocks,
  buildOneNetConfig,
  buildPropertyPayload,
  buildReplyPayload,
  dateTimeToTimestamp,
  expiryFromNow,
  flattenAtBlocks,
  ONENET_HOSTS,
  parsePropertyParams,
  timestampToDateTime,
} from '@/lib/core/onenet'
import { cn } from '@/lib/utils'

const METHODS: OneNetMethod[] = ['sha1', 'sha256']
const DAY_PRESETS = [1, 30, 365] as const

/** 表单里只有过期时间不进本地存储：它是绝对时间点，存下来下次打开就成了过去 */
interface ExpiryState {
  date: string
  time: string
}

const EMPTY_EXPIRY: ExpiryState = { date: '', time: '' }

export function OneNetMqtt() {
  const t = useTranslations('OneNet')

  /** 非敏感以外的全部字段都存在本地：SSR/hydration 走服务端快照，客户端自动切成真实值 */
  const form = useSyncExternalStore(
    onenetStore.subscribe,
    onenetStore.getSnapshot,
    onenetStore.getServerSnapshot,
  )
  const [expiry, setExpiry] = useState<ExpiryState>(EMPTY_EXPIRY)
  /** 属性上报文本的解析结果：边打边算，非法时禁掉生成按钮并给出原因 */
  const params = useMemo(() => parsePropertyParams(form.propertyParams), [form.propertyParams])
  const [result, setResult] = useState<OneNetBuild | null>(null)
  const [blocks, setBlocks] = useState<AtBlock[] | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (key: keyof OneNetFormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onenetStore.update({ [key]: event.target.value })

  /**
   * 用户填了日期/时间才是「明确的过期时间」；没填就按点击时的「现在 + 30 天」算，
   *  这样渲染结果与时间无关，SSG 出来的 HTML 不会和客户端算出不同的值。
   */
  const explicitExpiry = useMemo(
    () => dateTimeToTimestamp(expiry.date, expiry.time),
    [expiry.date, expiry.time],
  )

  const topicLabels: Record<string, string> = {
    propertyPost: t('topic.propertyPost'),
    propertyPostReply: t('topic.propertyPostReply'),
    propertySet: t('topic.propertySet'),
    propertySetReply: t('topic.propertySetReply'),
    propertyGet: t('topic.propertyGet'),
    propertyGetReply: t('topic.propertyGetReply'),
    eventPost: t('topic.eventPost'),
    eventPostReply: t('topic.eventPostReply'),
  }

  const atText = useMemo(() => {
    if (!blocks)
      return ''
    return flattenAtBlocks(blocks, {
      network: t('atBlock.network'),
      mqtt: t('atBlock.mqtt'),
      subscribe: t('atBlock.subscribe'),
      publish: t('atBlock.publish'),
      reply: t('atBlock.reply'),
      fallback: t('atBlock.fallback'),
    })
  }, [blocks, t])

  function errorText(code: OneNetErrorCode): string {
    switch (code) {
      case 'emptyProduct':
        return t('error.emptyProduct')
      case 'emptyDevice':
        return t('error.emptyDevice')
      case 'emptyKey':
        return t('error.emptyKey')
      case 'badKey':
        return t('error.badKey')
      case 'noWebCrypto':
        return t('error.noWebCrypto')
      default:
        return t('error.invalidExpire')
    }
  }

  async function handleGenerate() {
    setBusy(true)
    setBlocks(null)
    setResult(await buildOneNetConfig({
      productId: form.productId,
      deviceId: form.deviceId,
      deviceKey: form.deviceKey,
      et: explicitExpiry ?? expiryFromNow(30),
      method: form.method,
    }))
    setBusy(false)
  }

  function handleGenerateAt() {
    if (!result?.ok)
      return

    if (!params.ok)
      return

    const payload = buildPropertyPayload(params.params, '1')

    setBlocks(buildAtBlocks({
      wifiSsid: form.wifiSsid.trim() || 'MyWiFi',
      wifiPassword: form.wifiPassword,
      productId: result.username,
      deviceId: result.clientId,
      token: result.token,
      payload,
      replyPayload: buildReplyPayload('1'),
    }))
  }

  function handleReset() {
    onenetStore.reset()
    setResult(null)
    setBlocks(null)
  }

  function applyPreset(days: number) {
    const next = timestampToDateTime(expiryFromNow(days))
    setExpiry({ date: next.date, time: next.time })
  }

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t('deviceSection')}</CardTitle>
            <CardDescription>{t('lead')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="onenet-product">{t('productId')}</Label>
                <Input
                  id="onenet-product"
                  className="font-mono"
                  value={form.productId}
                  onChange={set('productId')}
                  placeholder={t('productIdPlaceholder')}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onenet-device">{t('deviceId')}</Label>
                <Input
                  id="onenet-device"
                  className="font-mono"
                  value={form.deviceId}
                  onChange={set('deviceId')}
                  placeholder={t('deviceIdPlaceholder')}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="onenet-key">{t('deviceKey')}</Label>
              <Input
                id="onenet-key"
                className="font-mono text-xs"
                value={form.deviceKey}
                onChange={set('deviceKey')}
                placeholder={t('deviceKeyPlaceholder')}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">{t('deviceKeyNote')}</p>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('method')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {METHODS.map(method => (
                    <Button
                      key={method}
                      size="xs"
                      variant={form.method === method ? 'default' : 'outline'}
                      className="font-mono"
                      onClick={() => onenetStore.update({ method })}
                    >
                      {method}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t('methodNote')}</p>
              </div>

              <div className="space-y-2">
                <Label>{t('expire')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    className="font-mono text-xs"
                    value={expiry.date}
                    onChange={event => setExpiry(previous => ({ ...previous, date: event.target.value }))}
                  />
                  <Input
                    type="time"
                    className="font-mono text-xs"
                    value={expiry.time}
                    onChange={event => setExpiry(previous => ({ ...previous, time: event.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {DAY_PRESETS.map(days => (
                    <Button
                      key={days}
                      variant="ghost"
                      size="xs"
                      className="text-muted-foreground"
                      onClick={() => applyPreset(days)}
                    >
                      {days === 1 ? t('preset1d') : days === 30 ? t('preset30d') : t('preset1y')}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t('expireNote')}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('expireTs')}</Label>
              <div className="flex flex-wrap items-center gap-2">
                {explicitExpiry === null
                  ? (
                      <>
                        <Badge variant="outline" className="rounded-4xl">
                          {t('expireDefault')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{t('expireNote')}</span>
                      </>
                    )
                  : (
                      <>
                        <code className="font-mono text-sm">{explicitExpiry}</code>
                        <CopyButton
                          value={String(explicitExpiry)}
                          label={t('copy')}
                          copiedLabel={t('copied')}
                        />
                      </>
                    )}
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleGenerate} disabled={busy}>
                <KeyRound className="size-4" />
                {busy ? t('generating') : t('generate')}
              </Button>
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="size-4" />
                {t('reset')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('result')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!result && <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>}

            {result && !result.ok && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {errorText(result.code)}
              </p>
            )}

            {result?.ok && (
              <>
                <ValueRow
                  label={t('broker')}
                  value={`${ONENET_HOSTS[0].host}:${ONENET_HOSTS[0].port}`}
                  copyLabel={t('copy')}
                  copiedLabel={t('copied')}
                />
                <ValueRow
                  label={t('clientId')}
                  value={result.clientId}
                  copyLabel={t('copy')}
                  copiedLabel={t('copied')}
                />
                <ValueRow
                  label={t('username')}
                  value={result.username}
                  copyLabel={t('copy')}
                  copiedLabel={t('copied')}
                />
                <ValueRow
                  label={t('token')}
                  value={result.token}
                  copyLabel={t('copy')}
                  copiedLabel={t('copied')}
                />
                <details className="rounded-lg border border-border/70 p-2.5">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {t('stringToSign')}
                  </summary>
                  <pre className="mt-2 overflow-x-auto font-mono text-xs whitespace-pre-wrap break-all">
                    {result.stringToSign}
                  </pre>
                </details>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t('atSection')}</CardTitle>
            <CardDescription>{t('noteEspAt')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="onenet-ssid">{t('wifiSsid')}</Label>
                <Input
                  id="onenet-ssid"
                  className="font-mono"
                  value={form.wifiSsid}
                  onChange={set('wifiSsid')}
                  placeholder="MyWiFi"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onenet-wifi-pwd">{t('wifiPassword')}</Label>
                <Input
                  id="onenet-wifi-pwd"
                  className="font-mono"
                  value={form.wifiPassword}
                  onChange={set('wifiPassword')}
                  placeholder="12345678"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="onenet-params">{t('payloadSection')}</Label>
              <Textarea
                id="onenet-params"
                className="min-h-28 font-mono text-xs leading-relaxed"
                value={form.propertyParams}
                onChange={set('propertyParams')}
                aria-invalid={!params.ok}
                aria-describedby="onenet-params-note"
                autoComplete="off"
                spellCheck={false}
              />
              {params.ok
                ? (
                    <p id="onenet-params-note" className="text-xs text-muted-foreground">
                      {t('paramsHint')}
                    </p>
                  )
                : (
                    <p id="onenet-params-note" className="text-xs text-destructive">
                      {{
                        'empty': t('paramsEmpty'),
                        'invalid-json': t('paramsInvalidJson'),
                        'not-object': t('paramsNotObject'),
                      }[params.code]}
                    </p>
                  )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleGenerateAt} disabled={!result?.ok || !params.ok}>
                <Terminal className="size-4" />
                {t('generateAt')}
              </Button>
              {!result?.ok && (
                <p className="self-center text-xs text-muted-foreground">{t('atHint')}</p>
              )}
            </div>

            {atText && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    ESP-AT
                  </span>
                  <CopyButton value={atText} label={t('copy')} copiedLabel={t('copied')} />
                </div>
                <pre className="max-h-80 overflow-auto rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                  {atText}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('topics')}</CardTitle>
            <CardDescription>{t('topicsNote')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(result?.ok ? result.topics : []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>
            )}
            {result?.ok && result.topics.map(topic => (
              <div key={topic.key} className="rounded-lg border border-border/70 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {topicLabels[topic.key] ?? topic.key}
                    <Badge
                      variant={topic.direction === 'up' ? 'secondary' : 'outline'}
                      className="rounded-4xl text-[10px]"
                    >
                      {topic.direction === 'up' ? t('directionUp') : t('directionDown')}
                    </Badge>
                  </span>
                  <CopyButton value={topic.topic} label={t('copy')} copiedLabel={t('copied')} />
                </div>
                <code className="mt-1 block break-all font-mono text-xs">{topic.topic}</code>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('notes')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{t('noteLocal')}</p>
          <p>{t('noteBytes')}</p>
          <p>{t('notePreset')}</p>
        </CardContent>
      </Card>
    </div>
  )
}

function ValueRow({
  label,
  value,
  copyLabel,
  copiedLabel,
  className,
}: {
  label: string
  value: string
  copyLabel: string
  copiedLabel: string
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-border/70 p-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <CopyButton value={value} label={copyLabel} copiedLabel={copiedLabel} />
      </div>
      <code className="mt-1 block break-all font-mono text-xs">{value}</code>
    </div>
  )
}
