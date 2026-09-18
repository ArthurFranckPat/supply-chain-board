/**
 * Cadre d'en-tête de la vue proactive (référence stodio-01-hero, sans photo) :
 * pastille, titre sur 3 lignes, ligne d'appui, rangée méta liée aux données et
 * deux actions (recharger, animer les changements).
 */
import type { CSSProperties } from 'react'
import { RefreshCw } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { useDisplayPrefsStore } from '@r/lib/display-prefs-store'
import { fmtFullDate } from '@r/lib/suivi/proactive-design'

export interface ProactiveHeaderProps {
  referenceDate: string
  total: number
  loading: boolean
  error: boolean
  onReload: () => void
}

const rank = (i: number) => ({ '--i': i }) as CSSProperties

const META_LABEL = 'text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'

export function ProactiveHeader(props: ProactiveHeaderProps) {
  const diffFlash = useDisplayPrefsStore((s) => s.diffFlash)
  const setDiffFlash = useDisplayPrefsStore((s) => s.setDiffFlash)

  const state = props.loading ? 'en cours' : props.error ? 'échec' : 'à jour'

  return (
    <header
      data-print-hide
      className="mx-4 mt-4 rounded-[14px] border border-rule bg-secondary p-5 sm:mx-7 sm:p-7 xl:min-h-[268px] print:hidden"
    >
      <div
        className="suivi-enter inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5"
        style={rank(0)}
      >
        <span className="size-3 rounded-[3px] bg-foreground" aria-hidden="true" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground">
          Suivi des commandes · Vue proactive
        </span>
      </div>

      <h1
        className="suivi-enter mt-4 text-[30px] font-bold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-[38px] xl:text-[44px]"
        style={rank(1)}
      >
        <span className="block">Quelles commandes</span>
        <span className="block">ne partiront</span>
        <span className="block">pas à temps ?</span>
      </h1>

      <p
        className="suivi-enter mt-3 max-w-[46ch] text-[16px] leading-snug text-muted-foreground"
        style={rank(2)}
      >
        Réalisabilité projetée de chaque ligne de commande à sa date d'expédition.
      </p>

      <div
        className="suivi-enter mt-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"
        style={rank(3)}
      >
        <dl className="flex flex-wrap gap-x-8 gap-y-2 tabular-nums">
          <div className="flex gap-1.5">
            <dt className={META_LABEL}>+ Date de référence :</dt>
            <dd className={cn(META_LABEL, 'text-foreground')}>
              {props.referenceDate ? fmtFullDate(props.referenceDate) : '…'}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className={META_LABEL}>+ Lignes chargées :</dt>
            <dd className={cn(META_LABEL, 'text-foreground')}>
              {props.loading ? '…' : props.total}
            </dd>
          </div>
          <div className="flex gap-1.5" role="status" aria-live="polite">
            <dt className={META_LABEL}>+ Chargement :</dt>
            <dd className={cn(META_LABEL, 'text-foreground')}>{state}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={props.onReload}
            disabled={props.loading}
            aria-busy={props.loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-center text-[14px] font-semibold leading-tight text-[var(--on-accent)] transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--brand-hover)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-40"
          >
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
            Recharger les données
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={diffFlash}
            onClick={() => setDiffFlash(!diffFlash)}
            className="inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full border border-[var(--control-border)] bg-card px-5 text-center text-[14px] font-semibold leading-tight text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-secondary active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <span
              aria-hidden="true"
              className={cn(
                'relative inline-block h-5 w-9 shrink-0 rounded-full border border-[var(--control-border)] transition-colors duration-150 ease-out',
                diffFlash ? 'bg-foreground' : 'bg-card'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-3.5 rounded-full transition-transform duration-150 ease-out',
                  diffFlash
                    ? 'translate-x-[18px] bg-card'
                    : 'translate-x-0.5 bg-[var(--control-border)]'
                )}
              />
            </span>
            <span>
              Animer les changements
              <span className="sr-only">{diffFlash ? ' : activé' : ' : désactivé'}</span>
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
