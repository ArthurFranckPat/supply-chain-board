/**
 * Liste de blocs empilés — rendu compact (< 640 px) de la table proactive
 * (référence ritovex-04-services mobile) : index, titre, bouton rond d'ouverture,
 * puis les champs de la ligne toujours visibles sous le titre. Aucun champ n'est
 * retiré par rapport au tableau.
 */
import { ArrowUpRight, FlaskConical } from 'lucide-react'

import { cn } from '@r/lib/utils'
import type { ProactiveDisplayRow } from '@r/lib/suivi/types'
import { LATE_TONE, VERDICT_DOT, VERDICT_TEXT, suiviRowKey } from '@r/lib/suivi/tracking-shared'
import { fmtFullDate, verdictCause } from '@r/lib/suivi/proactive-design'

export interface ProactiveRowCardsProps {
  rows: ProactiveDisplayRow[]
  selectedRowKey?: string | null
  onRowClick?: (row: ProactiveDisplayRow) => void
  onSelectOf?: (numOf: string) => void
  onSelectPoste?: (code: string) => void
  showSubAssemblies?: boolean
}

const LINK_BTN =
  'inline-flex min-h-11 items-center rounded-md px-1 font-mono text-[13px] font-semibold text-foreground underline decoration-foreground/30 underline-offset-2 transition-[background-color] duration-150 ease-out hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground'

export function ProactiveRowCards(props: ProactiveRowCardsProps) {
  return (
    <ol className="divide-y divide-rule-soft overflow-y-auto rounded-[14px] border border-rule bg-card">
      {props.rows.map((row, i) => {
        const key = suiviRowKey(row)
        const severity =
          row.verdictKey === 'blocked' || row.verdictKey === 'uncov'
            ? ('critical' as const)
            : row.lateSeverity
        const composants = row.composants
          .filter((c) =>
            props.showSubAssemblies ? !c.cqSeul : !c.descente && !c.couvertParOf && !c.cqSeul
          )
          .map((c) => c.art)
        const selected = props.selectedRowKey === key
        return (
          <li
            key={`${key}#${i}`}
            className={cn(
              'flex gap-3 px-3 py-3 [contain-intrinsic-size:auto_132px] [content-visibility:auto]',
              selected && 'bg-brand-soft',
              LATE_TONE.bar(severity)
            )}
            onClick={() => props.onRowClick?.(row)}
          >
            <span className="w-6 shrink-0 pt-1 text-[12px] font-bold tabular-nums text-muted-foreground">
              {String(i + 1).padStart(2, '0')}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-semibold leading-tight text-foreground">
                {row.article}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                {row.client} · {row.numCommande}
              </p>

              <p
                className={cn(
                  'mt-2 flex items-center gap-1.5 text-[13px] font-semibold',
                  VERDICT_TEXT[row.verdictKey]
                )}
              >
                <span
                  className={cn('size-2 shrink-0 rounded-full', VERDICT_DOT[row.verdictKey])}
                  aria-hidden="true"
                />
                {row.verdictLabel}
                {row.joursRetard > 0 && (
                  <span className="font-mono text-[12px]">+{row.joursRetard} j</span>
                )}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-foreground">{verdictCause(row)}</p>

              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px] tabular-nums">
                <dt className="text-muted-foreground">Expédition</dt>
                <dd className="font-semibold text-foreground">{fmtFullDate(row.dateExpIso)}</dd>

                <dt className="text-muted-foreground">Couverture</dt>
                <dd className="flex flex-wrap items-center">
                  {row.ofs.length > 0 ? (
                    row.ofs.map((o) => (
                      <button
                        key={o.numOf}
                        type="button"
                        className={LINK_BTN}
                        onClick={(e) => {
                          e.stopPropagation()
                          props.onSelectOf?.(o.numOf)
                        }}
                      >
                        {o.numOf}
                      </button>
                    ))
                  ) : (
                    <span className="font-semibold text-foreground">
                      {row.couverture === '—' ? 'Aucune' : row.couverture}
                    </span>
                  )}
                </dd>

                <dt className="text-muted-foreground">Composants</dt>
                <dd className="break-words font-mono font-semibold text-foreground">
                  {composants.length > 0 ? composants.join(', ') : 'Aucun'}
                </dd>

                <dt className="text-muted-foreground">Poste</dt>
                <dd>
                  {row.poste ? (
                    <button
                      type="button"
                      className={LINK_BTN}
                      onClick={(e) => {
                        e.stopPropagation()
                        props.onSelectPoste?.(row.poste)
                      }}
                    >
                      {row.posteLabel || row.poste}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">Non renseigné</span>
                  )}
                </dd>
              </dl>

              {row.cq && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2 py-1 text-[12px] font-semibold text-foreground">
                  <FlaskConical size={13} strokeWidth={1.75} aria-hidden="true" />
                  {row.cq.seul ? 'Dépend du CQ' : `CQ ${row.cq.qty.toString().replace('.', ',')}`}
                </p>
              )}
            </div>

            <button
              type="button"
              aria-label={`Ouvrir le détail de la ligne ${row.numCommande}`}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground text-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              <ArrowUpRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ol>
  )
}
