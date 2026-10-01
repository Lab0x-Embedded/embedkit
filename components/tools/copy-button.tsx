'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CopyButton({
  value,
  label,
  copiedLabel,
  className,
}: {
  value: string
  label: string
  copiedLabel: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied)
      return
    const timer = setTimeout(setCopied, 1500, false)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      title={label}
      className={cn('shrink-0 text-muted-foreground', className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
        }
        catch {
          // 非 https / 无权限时 clipboard 不可用，静默降级成不可复制
          setCopied(false)
        }
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      <span className="hidden sm:inline">{copied ? copiedLabel : label}</span>
    </Button>
  )
}
