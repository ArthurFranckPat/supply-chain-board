/**
 * Barre de filtres de la vue proactive (référence saleunion-02-about) : champ
 * de recherche centré, puis trois éléments à disque d'icône — sous-ensembles,
 * dépendance au CQ, réinitialisation.
 */
import type { CSSProperties } from 'react'
import { FilterX, Layers, Search, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@r/lib/utils'

export interface ProactiveFiltersProps {
  query: string
  onQueryChange: (q: string) => void
  showSubAssemblies: boolean
  onToggleSubAssemblies: () => void
  cqOnly: boolean
  onToggleCq: () => void
  cqCount: number
  isFiltered: boolean
  onReset: () => void
}

interface ItemProps {
  icon: LucideIcon
  title: string
  hint: string
  active?: boolean
  pressed?: boolean
  onClick: () => void
  delay: number
  extra?: string
}

function FilterItem(p: ItemProps) {
  const Icon = p.icon
  return (
    <button
      type="button"
      aria-pressed={p.pressed}
      onClick={p.onClick}
      data-reveal="rise"
      data-reveal-delay={p.delay}
      className="group flex min-h-[64px] w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left transition-transform duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground text-foreground transition-colors duration-150 ease-out group-hover:bg-foreground/[0.06]',
          p.active && 'bg-brand-soft'
        )}
      >
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[14px] font-semibold leading-tight text-foreground">
          {p.title}
          {p.extra && (
            <span className="ml-1.5 rounded-full bg-foreground/[0.08] px-1.5 py-px text-[11px] font-bold tabular-nums text-muted-foreground">
              {p.extra}
            </span>
          )}
        </span>
        <span className="text-[12px] leading-snug text-muted-foreground">{p.hint}</span>
      </span>
    </button>
  )
}

export function ProactiveFilters(props: ProactiveFiltersProps) {
  return (
    <section
      id="filtres"
      aria-labelledby="filtres_title"
      data-print-hide
      className="bg-secondary px-4 py-7 sm:px-7 print:hidden"
    >
      <p className="text-center text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Filtres
      </p>
      <h2 id="filtres_title" className="sr-only">
        Rechercher une commande, un client ou un article
      </h2>

      <div className="mx-auto mt-3 w-full max-sm:max-w-none sm:w-4/5 xl:w-[62%]" data-reveal="rise">
        <label className="relative block">
          <span className="sr-only">Rechercher une commande, un client ou un article</span>
          <Search
            size={20}
            strokeWidth={1.75}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={props.query}
            onChange={(e) => props.onQueryChange(e.currentTarget.value)}
            placeholder="Commande, article, client, composant…"
            autoComplete="off"
            className="h-12 w-full rounded-full border border-[var(--control-border)] bg-card pl-12 pr-4 text-[18px] font-medium text-foreground shadow-none outline-none transition-shadow duration-150 ease-out placeholder:text-muted-foreground focus-visible:shadow-[0_0_0_2px_var(--foreground)]"
          />
        </label>
      </div>

      <div className="mx-auto mt-4 grid w-full grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-2 xl:w-[78%]">
        <FilterItem
          icon={Layers}
          title="Sous-ensembles"
          hint="Inclure les semi-finis en rupture"
          pressed={props.showSubAssemblies}
          active={props.showSubAssemblies}
          onClick={props.onToggleSubAssemblies}
          delay={0}
        />
        <FilterItem
          icon={ShieldAlert}
          title="Dépend du CQ"
          hint="Garder les lignes suspendues au contrôle qualité"
          pressed={props.cqOnly}
          active={props.cqOnly}
          onClick={props.onToggleCq}
          delay={70}
          extra={props.cqCount > 0 ? String(props.cqCount) : undefined}
        />
        <FilterItem
          icon={FilterX}
          title="Réinitialiser les filtres"
          hint="Revenir à toutes les lignes"
          active={props.isFiltered}
          onClick={props.onReset}
          delay={140}
        />
      </div>
    </section>
  )
}
