/**
 * Sous-navigation des pages de configuration — SOURCE UNIQUE.
 *
 * Ce ruban était recopié à l'identique dans chaque page de config : ajouter un
 * écran obligeait à retoucher tous les autres, et un oubli laissait une page
 * sans le lien vers la nouvelle. Une seule liste ici, chaque page ne déclarant
 * que l'onglet où elle se trouve.
 */
import type { ReactNode } from 'react'
import { Link } from '@inertiajs/react'

import { route } from '@r/lib/routes'

export type ConfigTab = 'calendrier' | 'impressions' | 'affichage'

const TABS: { key: ConfigTab; label: string; href: string }[] = [
  { key: 'calendrier', label: 'Calendrier usine', href: route('calendar_config.index') },
  { key: 'impressions', label: 'Impressions', href: route('print_config.index') },
  { key: 'affichage', label: 'Affichage', href: route('display_config.index') },
]

export interface ConfigNavProps {
  active: ConfigTab
  /** Lien secondaire poussé à droite (ex. « Journal des tirages → »). */
  trailing?: ReactNode
  className?: string
}

export function ConfigNav({ active, trailing, className }: ConfigNavProps) {
  return (
    <nav className={className ?? 'flex items-center gap-2 text-[12.5px]'}>
      {TABS.map((t) =>
        t.key === active ? (
          <span
            key={t.key}
            aria-current="page"
            className="rounded-md bg-brand-soft px-2.5 py-1 font-semibold text-brand"
          >
            {t.label}
          </span>
        ) : (
          <Link
            key={t.key}
            href={t.href}
            className="rounded-md px-2.5 py-1 font-semibold text-muted-foreground hover:text-foreground"
          >
            {t.label}
          </Link>
        )
      )}
      {trailing && <div className="ml-auto">{trailing}</div>}
    </nav>
  )
}

export default ConfigNav
