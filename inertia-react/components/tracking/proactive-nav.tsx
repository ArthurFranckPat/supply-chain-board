/**
 * Barre de navigation de la vue proactive du Suivi.
 *
 * Nom de page à gauche (texte seul : aucun logo dédié), liens centrés
 * (bascule de mode + ancres vers les sections), pilote « Réglages d'affichage »
 * à droite. Sous 640 px : bouton menu, volet plein largeur, liens à 48 px.
 * Le lien actif porte `aria-current`.
 */
import { useState } from 'react'
import { Link } from '@inertiajs/react'
import { ArrowUpRight, Menu, SlidersHorizontal, X } from 'lucide-react'

import { cn } from '@r/lib/utils'

export interface ProactiveNavProps {
  mode: 'reactif' | 'proactif'
  onModeChange: (mode: 'reactif' | 'proactif') => void
}

/** Défile vers une section et place le focus sur son titre (sans second défilement). */
export function goToSection(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  const heading = target.querySelector<HTMLElement>('[data-section-title]')
  heading?.focus({ preventScroll: true })
}

const LINK =
  'inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-medium text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-foreground/[0.06] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground'
const LINK_ACTIVE = 'bg-brand-soft font-semibold'

export function ProactiveNav({ mode, onModeChange }: ProactiveNavProps) {
  const [open, setOpen] = useState(false)

  const items = [
    {
      label: 'Réactif',
      current: mode === 'reactif',
      run: () => onModeChange('reactif'),
    },
    {
      label: 'Proactif',
      current: mode === 'proactif',
      run: () => onModeChange('proactif'),
    },
    { label: 'Synthèse', current: false, run: () => goToSection('verdict_band') },
    { label: 'Commandes', current: false, run: () => goToSection('commandes') },
  ]

  const displayPill = (
    <Link
      href="/configuration/affichage"
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--control-border)] bg-card px-4 text-[14px] font-semibold text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-secondary active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className="max-xl:hidden">Réglages d'affichage</span>
      <span className="xl:hidden">Affichage</span>
      <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
    </Link>
  )

  return (
    <nav
      aria-label="Vue proactive"
      data-print-hide
      className="relative flex flex-none items-center justify-between gap-4 border-b border-rule px-4 py-1.5 sm:px-7 print:hidden"
    >
      <span className="text-[15px] font-bold tracking-tight text-foreground">
        Suivi des commandes
      </span>

      <ul className="hidden items-center gap-1 sm:flex xl:gap-2">
        {items.map((it) => (
          <li key={it.label}>
            <button
              type="button"
              aria-current={it.current ? 'page' : undefined}
              onClick={it.run}
              className={cn(LINK, it.current && LINK_ACTIVE)}
            >
              {it.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden sm:block">{displayPill}</div>

      <button
        type="button"
        className="inline-flex size-11 items-center justify-center rounded-full border border-[var(--control-border)] bg-card text-foreground transition-transform duration-150 ease-out active:scale-[0.98] sm:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        aria-expanded={open}
        aria-controls="proactive-nav-panel"
        aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={20} strokeWidth={1.75} /> : <Menu size={20} strokeWidth={1.75} />}
      </button>

      {open && (
        <div
          id="proactive-nav-panel"
          className="suivi-enter absolute inset-x-0 top-full z-30 flex flex-col border-b border-rule bg-card px-4 py-2 shadow-float sm:hidden"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              aria-current={it.current ? 'page' : undefined}
              className={cn(
                'flex min-h-12 items-center rounded-lg px-3 text-left text-[16px] font-medium text-foreground',
                it.current && LINK_ACTIVE
              )}
              onClick={() => {
                setOpen(false)
                it.run()
              }}
            >
              {it.label}
            </button>
          ))}
          <div className="py-2">{displayPill}</div>
        </div>
      )}
    </nav>
  )
}
