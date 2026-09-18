/**
 * Feuille de détail d'une ligne de la vue proactive (référence fabrica-14-blog) :
 * titre sur deux lignes, description, bouton « Fermer le détail », puis trois
 * cartes — couverture par OF, composants en rupture, cause / poste / contrôle
 * qualité. Le diagnostic complet existant (SuiviDetailSheet) reste dessous.
 */
import type { CSSProperties, RefObject } from 'react'
import { ArrowUpRight, ClipboardList, Factory, FlaskConical, PackageX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@r/lib/utils'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@r/components/ui/sheet'
import { SuiviDetailSheet } from '@r/components/tracking/suivi-detail-sheet'
import type { ProactiveDisplayRow } from '@r/lib/suivi/types'
import { fmtFullDate, verdictCause } from '@r/lib/suivi/proactive-design'

export interface ProactiveDetailSheetProps {
  row: ProactiveDisplayRow | null
  onOpenChange: (open: boolean) => void
  onSelectOf: (numOf: string) => void
  onSelectPoste: (code: string) => void
  /** Élément à refocaliser à la fermeture (le bouton de la ligne d'origine). */
  returnFocusRef?: RefObject<HTMLElement | null>
}

const frNum = (n: number) => n.toString().replace('.', ',')
const rank = (i: number) => ({ '--i': i, '--enter-base': '120ms' }) as CSSProperties

const LINK_BTN =
  'inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-left font-mono text-[13px] font-semibold text-foreground underline decoration-foreground/30 underline-offset-2 transition-[background-color] duration-150 ease-out hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground'

function RoundAction(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-transform duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <span className="inline-flex size-[30px] items-center justify-center rounded-full bg-foreground text-background">
        <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </span>
    </button>
  )
}

function DetailCard(props: {
  icon: LucideIcon
  index: number
  className?: string
  action?: { label: string; onClick: () => void }
  label: string
  title: string
  children: React.ReactNode
}) {
  const Icon = props.icon
  return (
    <section
      style={rank(props.index)}
      className={cn(
        'suivi-enter flex min-h-[280px] flex-col gap-4 rounded-[22px] bg-card p-5',
        props.className
      )}
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex size-14 items-center justify-center rounded-[14px] bg-secondary text-foreground">
          <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
        </span>
        {props.action && <RoundAction {...props.action} />}
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {props.label}
        </p>
        <h3 className="text-[20px] font-medium leading-tight text-foreground">{props.title}</h3>
        <div className="text-[14px] leading-snug text-muted-foreground">{props.children}</div>
      </div>
    </section>
  )
}

export function ProactiveDetailSheet(props: ProactiveDetailSheetProps) {
  const row = props.row
  const composants = row?.composants ?? []
  const enRupture = composants.filter((c) => !c.cqSeul)

  return (
    <Sheet open={row !== null} onOpenChange={props.onOpenChange}>
      {row && (
        <SheetContent
          showCloseButton={false}
          finalFocus={props.returnFocusRef}
          className="no-scrollbar gap-0 overflow-y-auto bg-secondary duration-[480ms] data-ending-style:duration-200 data-[side=right]:w-full data-[side=right]:max-w-none data-[side=right]:data-ending-style:translate-x-6 data-[side=right]:data-starting-style:translate-x-6 data-[side=right]:sm:w-[640px] data-[side=right]:sm:max-w-[640px] data-[side=right]:xl:w-[960px] data-[side=right]:xl:max-w-[960px] data-[side=right]:rounded-l-[14px]"
        >
          <header className="flex flex-wrap items-start gap-x-4 gap-y-3 p-5 xl:flex-nowrap xl:p-8">
            <SheetTitle className="suivi-enter order-2 basis-full text-[26px] font-bold leading-[1.1] tracking-[-0.02em] xl:basis-[42%] xl:text-[34px]">
              <span className="block text-foreground">Ligne de commande</span>
              <span className="block break-words text-muted-foreground">
                {row.client} · {row.article}
              </span>
            </SheetTitle>
            <SheetDescription className="suivi-enter order-3 max-w-[36ch] flex-1 text-[14px] leading-snug xl:pt-1">
              Cause du verdict, couverture par OF, composants en rupture et poste retenu.
            </SheetDescription>
            <SheetClose className="suivi-enter order-1 ml-auto inline-flex min-h-11 items-center gap-2.5 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background transition-transform duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground xl:order-4 xl:ml-0">
              Fermer le détail
              <span className="size-2 rounded-full bg-background" aria-hidden="true" />
            </SheetClose>
          </header>

          <div className="grid grid-cols-1 gap-2 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_2.05fr] xl:px-8">
            <DetailCard
              icon={Factory}
              index={0}
              label="OF de couverture"
              title={
                row.ofs.length > 0
                  ? `${row.ofs.length} OF ${row.ofs.length > 1 ? 'couvrent' : 'couvre'} la ligne`
                  : row.couverture === '—'
                    ? 'Aucune couverture'
                    : `Couverte : ${row.couverture.toLowerCase()}`
              }
              action={
                row.ofs.length > 0
                  ? {
                      label: `Ouvrir l'OF ${row.ofs[0].numOf}`,
                      onClick: () => props.onSelectOf(row.ofs[0].numOf),
                    }
                  : undefined
              }
            >
              {row.ofs.length > 0 ? (
                <ul className="flex flex-col">
                  {row.ofs.map((o) => (
                    <li key={o.numOf} className="flex flex-wrap items-center gap-x-2">
                      <button
                        type="button"
                        className={LINK_BTN}
                        onClick={() => props.onSelectOf(o.numOf)}
                      >
                        {o.numOf}
                      </button>
                      <span className="tabular-nums">
                        {frNum(o.qteAllouee)} u · fin {fmtFullDate(o.dateFin)} ·{' '}
                        {o.feasible === null
                          ? 'à évaluer'
                          : o.feasible
                            ? 'réalisable'
                            : 'non réalisable'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Aucun OF ne porte cette ligne.</p>
              )}
            </DetailCard>

            <DetailCard
              icon={PackageX}
              index={1}
              label="Composants"
              title={
                enRupture.length > 0
                  ? `${enRupture.length} composant${enRupture.length > 1 ? 's' : ''} en rupture`
                  : 'Aucun composant en rupture'
              }
            >
              {enRupture.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {enRupture.map((c) => (
                    <li key={c.art} className="tabular-nums">
                      <span className="font-mono font-semibold text-foreground">{c.art}</span>{' '}
                      <span>manque {frNum(c.qty)}</span>
                      {c.reception && (
                        <span
                          className={cn(
                            c.reception.apresExpedition && 'font-semibold text-destructive'
                          )}
                        >
                          {' '}
                          · arrivée {c.reception.eta}
                          {c.reception.apresExpedition ? ' (après expédition)' : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Les matières couvrent les OF de cette ligne.</p>
              )}
            </DetailCard>

            <DetailCard
              icon={ClipboardList}
              index={2}
              className="sm:col-span-2 xl:col-span-1"
              label="Cause, poste et contrôle qualité"
              title={`${row.verdictLabel}${row.joursRetard > 0 ? ` · +${row.joursRetard} j` : ''}`}
              action={
                row.poste
                  ? {
                      label: `Ouvrir le poste ${row.poste}`,
                      onClick: () => props.onSelectPoste(row.poste),
                    }
                  : undefined
              }
            >
              <p>{verdictCause(row)}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
                <dt>Expédition</dt>
                <dd className="font-semibold text-foreground">{fmtFullDate(row.dateExpIso)}</dd>
                <dt>À disposition au plus tard</dt>
                <dd className="font-semibold text-foreground">{fmtFullDate(row.madMaxIso)}</dd>
                <dt>Poste retenu</dt>
                <dd>
                  {row.poste ? (
                    <button
                      type="button"
                      className={LINK_BTN}
                      onClick={() => props.onSelectPoste(row.poste)}
                    >
                      {row.posteLabel ? `${row.posteLabel} (${row.poste})` : row.poste}
                    </button>
                  ) : (
                    <span>Non renseigné</span>
                  )}
                </dd>
              </dl>
              {row.cq && (
                <p className="mt-2 inline-flex items-start gap-2 rounded-[10px] bg-warning/15 px-2.5 py-1.5 text-[13px] font-semibold text-foreground">
                  <FlaskConical
                    size={15}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    {row.cq.seul ? 'Dépend du CQ' : 'Dépend en partie du CQ'} : {frNum(row.cq.qty)}{' '}
                    u en statut Q sur {row.cq.articles} article{row.cq.articles > 1 ? 's' : ''}.
                    Faire lever le contrôle réception.
                  </span>
                </p>
              )}
            </DetailCard>
          </div>

          <div className="px-5 pb-8 xl:px-8">
            <div className="rounded-[22px] bg-card p-4">
              <SuiviDetailSheet type="proactif" row={row} />
            </div>
          </div>
        </SheetContent>
      )}
    </Sheet>
  )
}
