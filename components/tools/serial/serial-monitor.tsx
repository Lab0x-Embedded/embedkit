'use client'

import type { ChangeEvent } from 'react'
import type { ReadLoop } from '@/lib/browser/serial'
import type { ParseHexErrorCode, SerialFlowControl, SerialParity } from '@/lib/core/serial'
import type { SerialPreset, SerialToolState } from '@/lib/core/serial-store'
import { AnsiUp } from 'ansi_up'
import { Download, FolderOpen, Plus, RefreshCw, Send, Trash2, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  closePort,
  describePort,
  isSerialSupported,
  listAuthorizedPorts,
  openPort,
  requestPort,
  startReadLoop,
  writeBytes,
} from '@/lib/browser/serial'
import { serialStore } from '@/lib/browser/serial-store'
import {
  BAUD_RATES,
  bytesToText,
  DATA_BITS,
  FLOW_CONTROLS,
  formatByteCount,
  formatClockTime,
  formatHex,
  PacketAssembler,
  PARITIES,
  parseHexInput,
  STOP_BITS,
  textToBytes,
} from '@/lib/core/serial'
import { normalizeSerialState } from '@/lib/core/serial-store'
import { cn } from '@/lib/utils'

/** 日志最多保留的条数：长时间抓包不能把页面拖死 */
const MAX_ENTRIES = 200

type EntryKind = 'rx' | 'tx' | 'sys'

interface LogEntry {
  id: number
  kind: EntryKind
  bytes: Uint8Array<ArrayBuffer>
  at: Date
}

type PortStatus = 'idle' | 'open' | 'closed'

/** 不依赖任何外部变化，只为拿到「客户端才知道的值」 */
function subscribeNoop() {
  return () => {}
}

/** 服务端/ hydration 快照：常量函数，避免每次渲染换引用 */
function getServerUnsupported() {
  return false
}

export function SerialMonitor() {
  const t = useTranslations('Serial')

  /** 本地存储里的配置：SSR/hydration 用服务端快照，客户端自动切到真实值 */
  const state = useSyncExternalStore(
    serialStore.subscribe,
    serialStore.getSnapshot,
    serialStore.getServerSnapshot,
  )
  /** Web Serial 只有客户端能判断，服务端快照固定 false，避免 hydration 不一致 */
  const supported = useSyncExternalStore(subscribeNoop, isSerialSupported, getServerUnsupported)

  const [entries, setEntries] = useState<LogEntry[]>([])
  const [totalEntries, setTotalEntries] = useState(0)
  const [stats, setStats] = useState({ rx: 0, tx: 0 })
  const [portLabel, setPortLabel] = useState('')
  const [status, setStatus] = useState<PortStatus>('idle')
  const [busy, setBusy] = useState(false)

  const entryIdRef = useRef(0)
  const portRef = useRef<SerialPort | null>(null)
  const loopRef = useRef<ReadLoop | null>(null)
  const assemblerRef = useRef(new PacketAssembler(state.display.mergeGapMs))
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualCloseRef = useRef(false)
  const logRef = useRef<HTMLDivElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  /** 重开串口用的延迟器（改参数 / 自动重连都要用它，便于统一清理） */
  const reopenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleReopen = useCallback((delayMs: number, action: () => void) => {
    if (reopenTimerRef.current)
      clearTimeout(reopenTimerRef.current)
    reopenTimerRef.current = setTimeout(() => {
      reopenTimerRef.current = null
      action()
    }, delayMs)
  }, [])

  const ansi = useMemo(() => {
    const instance = new AnsiUp()
    instance.escape_html = true
    return instance
  }, [])

  const errorText = useCallback((code: ParseHexErrorCode | 'portNotOpen' | 'empty', detail?: string): string => {
    switch (code) {
      case 'empty':
        return t('error.empty')
      case 'oddLength':
        return t('error.oddLength')
      case 'badChar':
        return t('error.badChar', { char: detail ?? '?' })
      default:
        return t('error.portNotOpen')
    }
  }, [t])

  const appendEntries = useCallback((items: LogEntry[]) => {
    if (items.length === 0)
      return
    setEntries((previous) => {
      const merged = [...previous, ...items]
      return merged.length > MAX_ENTRIES ? merged.slice(merged.length - MAX_ENTRIES) : merged
    })
    setTotalEntries(previous => previous + items.length)
  }, [])

  const makeEntry = useCallback((kind: EntryKind, bytes: Uint8Array<ArrayBuffer>): LogEntry => ({
    id: entryIdRef.current++,
    kind,
    bytes,
    at: new Date(),
  }), [])

  /** 把合并缓冲区里的数据落成一条日志 */
  const flushPending = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    const packet = assemblerRef.current.flush()
    if (packet)
      appendEntries([makeEntry('rx', packet)])
  }, [appendEntries, makeEntry])

  const handleChunk = useCallback((bytes: Uint8Array<ArrayBuffer>) => {
    setStats(previous => ({ ...previous, rx: previous.rx + bytes.length }))

    const { display } = serialStore.getSnapshot()
    assemblerRef.current.push(bytes, Date.now())

    if (display.mergeGapMs === 0) {
      flushPending()
      return
    }
    // 每来一段就重置计时器：间隔内的数据合成一包（同参考项目的做法）
    if (flushTimerRef.current)
      clearTimeout(flushTimerRef.current)
    flushTimerRef.current = setTimeout(flushPending, display.mergeGapMs)
  }, [flushPending])

  const teardown = useCallback(async (markManual: boolean) => {
    manualCloseRef.current = markManual
    flushPending()

    const loop = loopRef.current
    const port = portRef.current
    loopRef.current = null
    if (loop)
      await loop.stop()
    if (port) {
      try {
        if (port.readable || port.writable)
          await closePort(port)
      }
      catch {
        // 已经在拔线时关过
      }
    }
    setStatus(markManual ? 'idle' : 'closed')
  }, [flushPending])

  const handleOpen = useCallback(async () => {
    const port = portRef.current
    if (!port)
      return

    setBusy(true)
    manualCloseRef.current = false
    try {
      const { settings } = serialStore.getSnapshot()
      await openPort(port, settings)
      assemblerRef.current.reset()
      loopRef.current = startReadLoop(port, {
        onChunk: handleChunk,
        onEnd: () => {
          setStatus(previous => (previous === 'idle' ? previous : 'closed'))
        },
      })
      setStatus('open')
      toast.success(t('statusOpen'), { description: portLabel })
    }
    catch (error) {
      setStatus('idle')
      toast.error(t('error.openFailed', { message: String(error instanceof Error ? error.message : error) }))
    }
    finally {
      setBusy(false)
    }
  }, [handleChunk, portLabel, t])

  const handleSelectPort = useCallback(async () => {
    try {
      if (status === 'open')
        await teardown(true)
      const port = await requestPort()
      portRef.current = port
      setPortLabel(describePort(port, 0))
      setStatus('idle')
    }
    catch {
      // 用户取消了系统弹窗
    }
  }, [status, teardown])

  const handleReusePort = useCallback(async () => {
    const ports = await listAuthorizedPorts()
    const port = ports[0]
    if (!port) {
      toast.error(t('error.noAuthorizedPort'))
      return
    }
    if (status === 'open')
      await teardown(true)
    portRef.current = port
    setPortLabel(describePort(port, 0))
    setStatus('idle')
  }, [status, t, teardown])

  const handleSend = useCallback(async (rawContent: string, forceHex?: boolean) => {
    const port = portRef.current
    if (!port || status !== 'open') {
      toast.error(t('error.portNotOpen'))
      return
    }

    const { send } = serialStore.getSnapshot()
    const asHex = forceHex ?? send.mode === 'hex'
    let bytes: Uint8Array<ArrayBuffer>

    if (asHex) {
      const parsed = parseHexInput(rawContent)
      if (!parsed.ok) {
        toast.error(errorText(parsed.code, parsed.detail))
        return
      }
      bytes = parsed.bytes
    }
    else {
      if (!rawContent) {
        toast.error(t('error.empty'))
        return
      }
      bytes = textToBytes(rawContent)
    }

    if (send.appendCrlf)
      bytes = Uint8Array.from([...bytes, 0x0D, 0x0A]) as Uint8Array<ArrayBuffer>

    try {
      await writeBytes(port, bytes)
      setStats(previous => ({ ...previous, tx: previous.tx + bytes.length }))
      appendEntries([makeEntry('tx', bytes)])
    }
    catch (error) {
      toast.error(t('error.writeFailed', { message: String(error instanceof Error ? error.message : error) }))
    }
  }, [appendEntries, errorText, makeEntry, status, t])

  /** 定时发送：每次从 store 读最新配置，避免把输入内容塞进依赖数组 */
  useEffect(() => {
    if (!state.send.loopSend || status !== 'open')
      return
    const timer = setInterval(() => {
      const { send } = serialStore.getSnapshot()
      void handleSend(send.content)
    }, state.send.loopIntervalMs)
    return () => clearInterval(timer)
  }, [handleSend, state.send.loopSend, state.send.loopIntervalMs, status])

  /** 拔插事件：断开就收摊，重插且不是手动关闭过就自动重连 */
  useEffect(() => {
    const serialApi = typeof navigator === 'undefined' ? undefined : navigator.serial
    if (!supported || !serialApi)
      return

    const onDisconnect = (event: Event) => {
      const target = event.target as SerialPort
      if (portRef.current && target !== portRef.current)
        return
      void teardown(false)
    }
    const onConnect = (event: Event) => {
      const target = event.target as SerialPort
      if (manualCloseRef.current || !portRef.current || target !== portRef.current)
        return
      setStatus('closed')
      scheduleReopen(500, () => void handleOpen())
    }

    serialApi.addEventListener('disconnect', onDisconnect)
    serialApi.addEventListener('connect', onConnect)
    return () => {
      // 用捕获到的引用解绑：卸载时 navigator.serial 可能已经不在了
      serialApi.removeEventListener('disconnect', onDisconnect)
      serialApi.removeEventListener('connect', onConnect)
    }
  }, [handleOpen, scheduleReopen, supported, teardown])

  /** 合并间隔改动后重建合并器 */
  useEffect(() => {
    assemblerRef.current = new PacketAssembler(state.display.mergeGapMs)
  }, [state.display.mergeGapMs])

  /** 自动滚动（直接操作 DOM，不引入状态） */
  useEffect(() => {
    const element = logRef.current
    if (!element || !state.display.autoScroll)
      return
    element.scrollTop = element.scrollHeight
  }, [entries, state.display.autoScroll])

  /** 离开页面时别把串口占着 */
  useEffect(() => {
    return () => {
      if (reopenTimerRef.current)
        clearTimeout(reopenTimerRef.current)
      if (flushTimerRef.current)
        clearTimeout(flushTimerRef.current)
      void loopRef.current?.stop()
      const port = portRef.current
      if (port?.readable || port?.writable)
        void port.close().catch(() => {})
    }
  }, [])

  const updateDisplay = (patch: Partial<SerialToolState['display']>) =>
    serialStore.update({ display: { ...state.display, ...patch } })

  const updateSend = (patch: Partial<SerialToolState['send']>) =>
    serialStore.update({ send: { ...state.send, ...patch } })

  const updatePreset = (id: string, patch: Partial<SerialPreset>) =>
    serialStore.update({
      presets: state.presets.map(preset => (preset.id === id ? { ...preset, ...patch } : preset)),
    })

  const removePreset = (id: string) =>
    serialStore.update({ presets: state.presets.filter(preset => preset.id !== id) })

  const addPreset = () =>
    serialStore.update({
      presets: [...state.presets, { id: `p-${Date.now().toString(36)}`, name: '', content: '', hex: false }],
    })

  const logText = useCallback((mode: SerialToolState['display']['mode']) => entries.map((entry) => {
    const direction = entry.kind === 'rx' ? '<-' : entry.kind === 'tx' ? '->' : '--'
    const body = mode === 'hex' ? formatHex(entry.bytes) : bytesToText(entry.bytes)
    return `${formatClockTime(entry.at)} ${direction} ${body}`
  }).join('\n'), [entries])

  const handleCopyLog = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(logText(state.display.mode))
      toast.success(t('error.copied'))
    }
    catch (error) {
      toast.error(t('error.copyFailed', { message: String(error instanceof Error ? error.message : error) }))
    }
  }, [logText, state.display.mode, t])

  const handleSaveLog = useCallback(() => {
    const blob = new Blob([logText(state.display.mode)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `embedkit-serial-${Date.now()}.log`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(t('error.saved'))
  }, [logText, state.display.mode, t])

  const handleExportConfig = useCallback(() => {
    const blob = new Blob([JSON.stringify({ version: 1, ...state }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'embedkit-serial-config.json'
    link.click()
    URL.revokeObjectURL(url)
  }, [state])

  const handleImportConfig = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file)
      return
    try {
      const parsed = JSON.parse(await file.text())
      serialStore.update(normalizeSerialState(parsed))
      toast.success(t('error.imported'))
    }
    catch (error) {
      toast.error(t('error.importFailed', { message: String(error instanceof Error ? error.message : error) }))
    }
  }, [t])

  const handleSettingChange = useCallback(async (patch: Partial<SerialToolState['settings']>) => {
    serialStore.update({ settings: { ...serialStore.getSnapshot().settings, ...patch } })
    if (status === 'open') {
      // Web Serial 不支持动态改参：关掉再按新参数打开
      await teardown(false)
      scheduleReopen(60, () => void handleOpen())
    }
  }, [handleOpen, scheduleReopen, status, teardown])

  const handleClearLog = useCallback(() => {
    setEntries([])
    setTotalEntries(0)
  }, [])

  const statusBadge = {
    idle: { label: t('statusIdle'), variant: 'outline' as const },
    open: { label: t('statusOpen'), variant: 'default' as const },
    closed: { label: t('statusClosed'), variant: 'destructive' as const },
  }[status]

  const dropped = Math.max(0, totalEntries - entries.length)

  return (
    <div className="space-y-6">
      {!supported && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {t('unsupported')}
        </p>
      )}

      {/* 连接栏：重要入口放最上面 */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-x-4 gap-y-3 pt-6">
          <div className="space-y-2">
            <Label>{t('port')}</Label>
            <div className="flex items-center gap-2">
              <Badge variant={statusBadge.variant} className="rounded-4xl">
                {statusBadge.label}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">
                {portLabel || t('noPort')}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!supported || busy} onClick={handleSelectPort}>
              <FolderOpen className="size-4" />
              {t('selectPort')}
            </Button>
            <Button variant="ghost" size="sm" disabled={!supported || busy} onClick={handleReusePort}>
              <RefreshCw className="size-4" />
              {t('reusePort')}
            </Button>
          </div>

          <Separator orientation="vertical" className="hidden h-9 sm:block" />

          <div className="space-y-2">
            <Label htmlFor="serial-baud">{t('baudRate')}</Label>
            <Select
              value={String(state.settings.baudRate)}
              onValueChange={value => void handleSettingChange({ baudRate: Number(value) })}
            >
              <SelectTrigger id="serial-baud" className="w-32 font-mono text-xs" disabled={!supported}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAUD_RATES.map(rate => (
                  <SelectItem key={rate} value={String(rate)} className="font-mono text-xs">
                    {rate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serial-data">{t('dataBits')}</Label>
            <Select
              value={String(state.settings.dataBits)}
              onValueChange={value => void handleSettingChange({ dataBits: Number(value) as 7 | 8 })}
            >
              <SelectTrigger id="serial-data" className="w-20 font-mono text-xs" disabled={!supported}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATA_BITS.map(bits => (
                  <SelectItem key={bits} value={String(bits)} className="font-mono text-xs">
                    {bits}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serial-stop">{t('stopBits')}</Label>
            <Select
              value={String(state.settings.stopBits)}
              onValueChange={value => void handleSettingChange({ stopBits: Number(value) as 1 | 2 })}
            >
              <SelectTrigger id="serial-stop" className="w-20 font-mono text-xs" disabled={!supported}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOP_BITS.map(bits => (
                  <SelectItem key={bits} value={String(bits)} className="font-mono text-xs">
                    {bits}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serial-parity">{t('parity')}</Label>
            <Select
              value={state.settings.parity}
              onValueChange={value => void handleSettingChange({ parity: value as SerialParity })}
            >
              <SelectTrigger id="serial-parity" className="w-24 text-xs" disabled={!supported}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARITIES.map(parity => (
                  <SelectItem key={parity} value={parity} className="text-xs">
                    {parity === 'none' ? t('parityNone') : parity === 'even' ? t('parityEven') : t('parityOdd')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serial-flow">{t('flowControl')}</Label>
            <Select
              value={state.settings.flowControl}
              onValueChange={value => void handleSettingChange({ flowControl: value as SerialFlowControl })}
            >
              <SelectTrigger id="serial-flow" className="w-24 text-xs" disabled={!supported}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLOW_CONTROLS.map(flow => (
                  <SelectItem key={flow} value={flow} className="text-xs">
                    {flow === 'none' ? t('flowNone') : t('flowHardware')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            disabled={!supported || !portLabel || busy}
            onClick={status === 'open' ? () => void teardown(true) : handleOpen}
          >
            {busy ? t('opening') : status === 'open' ? t('close') : t('open')}
          </Button>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* 接收日志 */}
        <Card>
          <CardHeader>
            <CardTitle>{t('log')}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-xs">
                {t('received')}
                {' '}
                {formatByteCount(stats.rx)}
              </span>
              <span className="font-mono text-xs">
                {t('sent')}
                {' '}
                {formatByteCount(stats.tx)}
              </span>
              <span className="font-mono text-xs">
                {entries.length}
                {' '}
                /
                {MAX_ENTRIES}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5">
                {(['hex', 'text', 'ansi'] as const).map(mode => (
                  <Button
                    key={mode}
                    size="xs"
                    variant={state.display.mode === mode ? 'default' : 'outline'}
                    onClick={() => updateDisplay({ mode })}
                  >
                    {mode === 'hex' ? t('modeHex') : mode === 'text' ? t('modeText') : t('modeAnsi')}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="serial-show-time"
                  checked={state.display.showTime}
                  onCheckedChange={checked => updateDisplay({ showTime: checked })}
                />
                <Label htmlFor="serial-show-time" className="text-xs font-normal">
                  {t('showTime')}
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="serial-auto-scroll"
                  checked={state.display.autoScroll}
                  onCheckedChange={checked => updateDisplay({ autoScroll: checked })}
                />
                <Label htmlFor="serial-auto-scroll" className="text-xs font-normal">
                  {t('autoScroll')}
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="serial-merge" className="text-xs font-normal">
                  {t('mergeGap')}
                </Label>
                <Input
                  id="serial-merge"
                  type="number"
                  min={0}
                  max={5000}
                  step={10}
                  className="h-7 w-20 font-mono text-xs"
                  value={state.display.mergeGapMs}
                  onChange={event => updateDisplay({ mergeGapMs: Number(event.target.value) })}
                />
                <span className="text-xs text-muted-foreground">{t('mergeUnit')}</span>
              </div>

              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="xs" onClick={handleClearLog}>
                  <Trash2 className="size-3.5" />
                  {t('clear')}
                </Button>
                <Button variant="ghost" size="xs" disabled={entries.length === 0} onClick={handleCopyLog}>
                  {t('copyLog')}
                </Button>
                <Button variant="ghost" size="xs" disabled={entries.length === 0} onClick={handleSaveLog}>
                  <Download className="size-3.5" />
                  {t('saveLog')}
                </Button>
              </div>
            </div>

            <div
              ref={logRef}
              className="h-[420px] overflow-auto rounded-lg border border-border/70 bg-muted/30 p-2"
            >
              {entries.length === 0
                ? <p className="p-2 text-sm text-muted-foreground">{t('emptyLog')}</p>
                : (
                    <div className="space-y-0.5">
                      {dropped > 0 && (
                        <p className="px-1 pb-1 text-xs text-muted-foreground">
                          {t('dropped', { count: dropped, max: MAX_ENTRIES })}
                        </p>
                      )}
                      {entries.map(entry => (
                        <LogLine
                          key={entry.id}
                          entry={entry}
                          mode={state.display.mode}
                          showTime={state.display.showTime}
                          ansi={ansi}
                          labels={{ rx: t('received'), tx: t('sent'), sys: t('system') }}
                        />
                      ))}
                    </div>
                  )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {/* 发送 */}
          <Card>
            <CardHeader>
              <CardTitle>{t('send')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-1.5">
                  {(['text', 'hex'] as const).map(mode => (
                    <Button
                      key={mode}
                      size="xs"
                      variant={state.send.mode === mode ? 'default' : 'outline'}
                      onClick={() => updateSend({ mode })}
                    >
                      {mode === 'hex' ? t('modeHex') : t('modeText')}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="serial-crlf"
                    checked={state.send.appendCrlf}
                    onCheckedChange={checked => updateSend({ appendCrlf: checked })}
                  />
                  <Label htmlFor="serial-crlf" className="text-xs font-normal">
                    {t('appendCrlf')}
                  </Label>
                </div>
              </div>

              <Textarea
                className="min-h-[96px] font-mono text-xs"
                value={state.send.content}
                onChange={event => updateSend({ content: event.target.value })}
                placeholder={state.send.mode === 'hex' ? t('sendHexPlaceholder') : t('sendTextPlaceholder')}
                spellCheck={false}
              />

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button
                  disabled={status !== 'open'}
                  onClick={() => void handleSend(state.send.content)}
                >
                  <Send className="size-4" />
                  {t('sendButton')}
                </Button>

                <div className="flex items-center gap-2">
                  <Switch
                    id="serial-loop"
                    checked={state.send.loopSend}
                    onCheckedChange={checked => updateSend({ loopSend: checked })}
                  />
                  <Label htmlFor="serial-loop" className="text-xs font-normal">
                    {t('loopSend')}
                  </Label>
                  <Input
                    type="number"
                    min={20}
                    step={50}
                    className="h-7 w-20 font-mono text-xs"
                    value={state.send.loopIntervalMs}
                    onChange={event => updateSend({ loopIntervalMs: Number(event.target.value) })}
                    aria-label={t('loopInterval')}
                  />
                  <span className="text-xs text-muted-foreground">{t('mergeUnit')}</span>
                </div>
              </div>

              {status !== 'open' && (
                <p className="text-xs text-muted-foreground">{t('sendHint')}</p>
              )}
            </CardContent>
          </Card>

          {/* 快捷指令 */}
          <Card>
            <CardHeader>
              <CardTitle>{t('presets')}</CardTitle>
              <CardDescription>{t('presetsNote')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {state.presets.map(preset => (
                  <div key={preset.id} className="flex items-center gap-2">
                    <Input
                      className="w-24 shrink-0 text-xs"
                      value={preset.name}
                      onChange={event => updatePreset(preset.id, { name: event.target.value })}
                      placeholder={t('presetName')}
                      aria-label={t('presetName')}
                    />
                    <Input
                      className="min-w-0 flex-1 font-mono text-xs"
                      value={preset.content}
                      onChange={event => updatePreset(preset.id, { content: event.target.value })}
                      placeholder={t('presetContent')}
                      aria-label={t('presetContent')}
                      spellCheck={false}
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <Switch
                        checked={preset.hex}
                        onCheckedChange={checked => updatePreset(preset.id, { hex: checked })}
                        aria-label={t('presetHex')}
                      />
                      <span className="text-[10px] text-muted-foreground">{t('presetHex')}</span>
                    </div>
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={status !== 'open'}
                      onClick={() => void handleSend(preset.content, preset.hex)}
                    >
                      <Send className="size-3" />
                      {preset.name || t('presetSend')}
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t('presetRemove')}
                      onClick={() => removePreset(preset.id)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="outline" size="xs" onClick={addPreset}>
                  <Plus className="size-3.5" />
                  {t('presetAdd')}
                </Button>
                <Button variant="ghost" size="xs" onClick={() => importInputRef.current?.click()}>
                  <Upload className="size-3.5" />
                  {t('presetImport')}
                </Button>
                <Button variant="ghost" size="xs" onClick={handleExportConfig}>
                  <Download className="size-3.5" />
                  {t('presetExport')}
                </Button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleImportConfig}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('configNote')}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('notes')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{t('noteLocal')}</p>
          <p>{t('noteHex')}</p>
          <p>{t('noteAnsi')}</p>
          <p>{t('noteReconnect')}</p>
          <p>{t('noteLimit')}</p>
        </CardContent>
      </Card>
    </div>
  )
}

function LogLine({
  entry,
  mode,
  showTime,
  ansi,
  labels,
}: {
  entry: LogEntry
  mode: SerialToolState['display']['mode']
  showTime: boolean
  ansi: AnsiUp
  labels: Record<EntryKind, string>
}) {
  const direction = entry.kind === 'rx' ? '←' : entry.kind === 'tx' ? '→' : '·'
  const color = entry.kind === 'rx'
    ? 'text-emerald-600 dark:text-emerald-400'
    : entry.kind === 'tx'
      ? 'text-sky-600 dark:text-sky-400'
      : 'text-muted-foreground'

  const text = bytesToText(entry.bytes)
  const ansiHtml = mode === 'ansi' ? ansi.ansi_to_html(text) : ''

  return (
    <div className="flex gap-2 rounded px-1 py-0.5 font-mono text-xs leading-relaxed hover:bg-muted/50">
      {showTime && (
        <span className="shrink-0 text-muted-foreground">{formatClockTime(entry.at)}</span>
      )}
      <span className={cn('shrink-0', color)}>
        {direction}
        {labels[entry.kind]}
      </span>
      {mode === 'hex' && (
        <span className="min-w-0 break-all">{formatHex(entry.bytes)}</span>
      )}
      {mode === 'text' && (
        <span className="min-w-0 break-all whitespace-pre-wrap">{text}</span>
      )}
      {mode === 'ansi' && (
        // ansi_up 已把 HTML 转义（escape_html = true），只渲染它输出的颜色 span
        // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- 内容来自 ansi_up 的白名单转换，不是用户 HTML
        <span className="min-w-0 break-all whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: ansiHtml }} />
      )}
    </div>
  )
}
