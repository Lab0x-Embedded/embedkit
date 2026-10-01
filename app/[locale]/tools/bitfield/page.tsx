import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Bitfield } from '@/components/tools/bitfield/bitfield'
import { ToolShell } from '@/components/tools/tool-shell'
import { routing } from '@/i18n/routing'
import { pageAlternates } from '@/lib/site'
import { getToolText } from '@/lib/tools-text'

const SLUG = 'bitfield'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale))
    notFound()

  const text = getToolText(await getMessages({ locale }), SLUG)

  return {
    title: text.name,
    description: text.desc,
    alternates: pageAlternates(locale, `/tools/${SLUG}`),
  }
}

export default async function BitfieldPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale))
    notFound()

  setRequestLocale(locale)

  const text = getToolText(await getMessages({ locale }), SLUG)

  return (
    <ToolShell text={text}>
      <Bitfield />
    </ToolShell>
  )
}
