import { useEffect, useState } from 'react'

import { cn } from '@r/lib/utils'

/**
 * Kit de mise en page de la vitrine /design-system.
 * Ces primitives ne servent QUE la page de documentation : elles ne font pas
 * partie du design system exposé à l'application.
 */

/** Titre de section numéroté, avec filet de séparation. */
export function Section({
  id,
  n,
  title,
  intro,
  last,
  children,
}: {
  id: string
  n: string
  title: string
  intro?: React.ReactNode
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <section id={id} className={cn('scroll-mt-8 py-10', !last && 'border-b border-border')}>
      <div className="mb-1 flex items-baseline gap-3">
        <span className="font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
          {n}
        </span>
        <h2 className="text-[20px] font-medium leading-tight tracking-[-0.15px] text-foreground">
          {title}
        </h2>
      </div>
      {intro ? (
        <p className="mb-6 max-w-[620px] pl-[calc(11px+0.75rem)] text-[13px] leading-[18px] text-muted-foreground">
          {intro}
        </p>
      ) : (
        <div className="mb-6" />
      )}
      {children}
    </section>
  )
}

/** Sous-titre à l'intérieur d'une section. */
export function Sub({
  title,
  hint,
  className,
}: {
  title: string
  hint?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1', className)}>
      <h3 className="text-[13px] font-medium tracking-[-0.08px] text-foreground">{title}</h3>
      {hint ? (
        <span className="text-[12px] leading-[16px] text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  )
}

/** Surface élevée : la recette carte Cursor (radius 12, ring quaternary 1px). */
export function Panel({
  children,
  className,
  padding = 'md',
}: {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md'
}) {
  return (
    <div
      className={cn(
        'rounded-[12px] bg-card shadow-[0_0_0_1px_var(--border)]',
        padding === 'sm' && 'p-3',
        padding === 'md' && 'p-5',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Cellule de démonstration : un composant vivant, son étiquette et,
 * facultativement, la recette qui le produit.
 */
export function Demo({
  label,
  spec,
  children,
  className,
  align = 'start',
}: {
  label?: React.ReactNode
  spec?: string
  children: React.ReactNode
  className?: string
  align?: 'start' | 'center'
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label ? <Caption className="mb-2">{label}</Caption> : null}
      <div
        className={cn(
          'flex min-h-[52px] flex-wrap gap-3 rounded-[8px] bg-muted p-4 shadow-[0_0_0_1px_var(--border)]',
          align === 'center' ? 'items-center justify-center' : 'items-center'
        )}
      >
        {children}
      </div>
      {spec ? (
        <div className="mt-2 break-words font-mono text-[10px] leading-[14px] text-muted-foreground">
          {spec}
        </div>
      ) : null}
    </div>
  )
}

/** Étiquette mono discrète (rôle : nommer un exemple, pas un composant). */
export function Caption({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'block font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground',
        className
      )}
    >
      {children}
    </span>
  )
}

/** Jeton inline : nom de token, classe utilitaire, prop. */
export function Tok({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[4px] bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
      {children}
    </code>
  )
}

/** Tableau de spécification : colonnes mono, filets quaternary. */
export function SpecTable({
  head,
  rows,
  className,
}: {
  head: string[]
  rows: React.ReactNode[][]
  className?: string
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[440px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[color-mix(in_oklab,#141414_4%,transparent)]">
            {head.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-[12px] font-normal text-[color-mix(in_oklab,#141414_60%,transparent)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[color-mix(in_oklab,#141414_4%,transparent)] last:border-b-0"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-2 align-top text-[13px] leading-[18px] text-[color-mix(in_oklab,#141414_74%,transparent)]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Grille auto-ajustée pour aligner des cellules de démo. */
export function Grid({
  min = 220,
  children,
  className,
}: {
  min?: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('grid gap-4', className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  )
}

/** Encadré de règle : ce qu'il faut faire / ce qu'il ne faut pas faire. */
export function Rule({ kind, children }: { kind: 'do' | 'dont'; children: React.ReactNode }) {
  const ok = kind === 'do'
  return (
    <div
      className={cn(
        'rounded-[8px] p-3 text-[13px] leading-[18px]',
        ok
          ? 'bg-[color-mix(in_oklab,#007041_6%,transparent)] shadow-[0_0_0_1px_color-mix(in_oklab,#007041_28%,transparent)]'
          : 'bg-[color-mix(in_oklab,#be1744_6%,transparent)] shadow-[0_0_0_1px_color-mix(in_oklab,#be1744_28%,transparent)]'
      )}
    >
      <span
        className={cn(
          'mb-1 block font-mono text-[10px] font-medium uppercase tracking-[0.06em]',
          ok ? 'text-[#007041]' : 'text-[#be1744]'
        )}
      >
        {ok ? 'À faire' : 'À éviter'}
      </span>
      <span className="text-[color-mix(in_oklab,#141414_74%,transparent)]">{children}</span>
    </div>
  )
}

/**
 * État de migration d'une primitive vers le thème Cursor.
 * `cursor` = retargetée sous `.theme-cursor` ; `partiel` = partiellement ;
 * `airbnb` = encore en grammaire d'origine.
 */
export type EtatMigration = 'cursor' | 'partiel' | 'airbnb'

const ETAT_META: Record<EtatMigration, { label: string; fg: string; bg: string; titre: string }> = {
  cursor: {
    label: 'Cursor',
    fg: '#007041',
    bg: 'color-mix(in oklab, #007041 10%, transparent)',
    titre: 'Retargetée sous .theme-cursor',
  },
  partiel: {
    label: 'Partiel',
    fg: '#a46700',
    bg: 'color-mix(in oklab, #a46700 12%, transparent)',
    titre: 'Partiellement retargetée — reste des valeurs Airbnb',
  },
  airbnb: {
    label: 'À migrer',
    fg: 'color-mix(in oklab, #141414 60%, transparent)',
    bg: 'color-mix(in oklab, #141414 6%, transparent)',
    titre: 'Encore en grammaire Airbnb',
  },
}

export function Etat({ v }: { v: EtatMigration }) {
  const m = ETAT_META[v]
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center rounded-full px-2 font-mono text-[10px] font-medium uppercase tracking-[0.04em]"
      style={{ color: m.fg, background: m.bg }}
      title={m.titre}
    >
      {m.label}
    </span>
  )
}

/**
 * Axe indépendant de la migration : le composant existe, il est peut-être même
 * déjà retargeté, mais **aucune page de production ne le rend**. Un design
 * system qui présente ces composants comme partie du langage ment.
 */
export function Orphelin() {
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center rounded-full px-2 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-[color-mix(in_oklab,#141414_60%,transparent)]"
      style={{ boxShadow: 'inset 0 0 0 1px color-mix(in oklab, #141414 20%, transparent)' }}
      title="Aucun consommateur en production — seules react_lab et cette vitrine le rendent"
    >
      Sans usage
    </span>
  )
}

/** En-tête de fiche composant : nom, chemin d'import, état de migration. */
export function Fiche({
  nom,
  from,
  etat,
  orphelin,
  note,
  children,
}: {
  nom: string
  from: string
  etat: EtatMigration
  /** Aucune page de production ne rend ce composant. */
  orphelin?: boolean
  note?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mb-8 last:mb-0">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-medium tracking-[-0.08px] text-foreground">{nom}</h3>
        <Etat v={etat} />
        {orphelin ? <Orphelin /> : null}
        <code className="font-mono text-[11px] text-muted-foreground">{from}</code>
      </div>
      {note ? (
        <p className="mb-3 max-w-[620px] text-[12px] leading-[16px] text-muted-foreground">
          {note}
        </p>
      ) : null}
      {children}
    </div>
  )
}

/** Surligne l'entrée de nav correspondant à la section visible. */
export function useScrollSpy(ids: readonly string[]) {
  const [active, setActive] = useState(ids[0] ?? '')

  useEffect(() => {
    const seen = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          seen.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0)
        }
        let best = ''
        let bestRatio = 0
        for (const id of ids) {
          const ratio = seen.get(id) ?? 0
          if (ratio > bestRatio) {
            best = id
            bestRatio = ratio
          }
        }
        if (best) setActive(best)
      },
      { rootMargin: '-8% 0px -70% 0px', threshold: [0, 0.25, 0.5, 1] }
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [ids])

  return active
}
