import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { hasLocale } from 'next-intl'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { OneNetMqtt } from '@/components/tools/onenet-mqtt/onenet-mqtt'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { getToolText } from '@/lib/tools-text'

const SLUG = 'onenet-mqtt'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale))
    notFound()

  const text = getToolText(await getMessages({ locale }), SLUG)

  return { title: text.name, description: text.desc }
}

export default async function OneNetMqttPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale))
    notFound()

  setRequestLocale(locale)

  const t = await getTranslations()
  const text = getToolText(await getMessages({ locale }), SLUG)

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t('Nav.home')}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {text.name}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {text.desc}
        </p>
      </div>

      <OneNetMqtt />
    </div>
  )
}
