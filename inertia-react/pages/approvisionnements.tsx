import { useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import { CloudOff, Inbox, ArrowUp, ArrowDown, Ban, ShoppingCart } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'

/**
 * Page « Approvisionnements » (issue #103).
 *
 * Ce que le CBN de X3 propose côté achat, groupé en **dossiers fournisseur** —
 * la maille à laquelle une commande est réellement passée.
 *
 * Deux natures dans la même file : les suggestions d'achat, et les messages de
 * replanification sur commandes déjà passées (avancer / retarder / inutile).
 * Les seconds dominent à horizon court et n'étaient affichés nulle part.
 *
 * **Verdicts de triage (lot 1 #103).** Chaque ligne porte un verdict calculé par
 * le moteur déterministe (`appro_triage.ts`) — passer / surveiller / regrouper /
 * replanifier / investiguer — avec sa preuve sourcée, affichée sous la ligne.
 * Les labels restent une hypothèse de travail à valider en atelier acheteurs ;
 * l'écran montre aussi l'échéance brute, pour qu'aucune décision ne repose sur
 * le seul verdict.
 */

type MessageCode = 2 | 3 | 6

interface ApproTriage {
  cle: string
  verdict: 'passer' | 'surveiller' | 'regrouper' | 'replanifier' | 'investiguer'
  score: number
  preuves: string[]
}

interface ApproItem {
  cle: string
  nature: 'suggestion' | 'message'
  message: MessageCode | null
  article: string
  designation: string
  echeance: string | null
  jours: number | null
  dateProposee: string | null
  decalage: number | null
  quantite: number
  /** Délai de réappro (OFS_0) — suggestion seule ; `null` = non renseigné (signal). */
  delaiReappro: number | null
  triage: ApproTriage | null
}

interface ApproDossier {
  fournisseur: string
  nom: string
  items: ApproItem[]
  premiereEcheance: string | null
  jours: number | null
  nbArticles: number
  nbSuggestions: number
  nbMessages: number
}

interface ApproResponse {
  dossiers: ApproDossier[]
  stats: {
    nbDossiers: number
    nbItems: number
    nbArticles: number
    nbSuggestions: number
    nbMessages: number
    parMessage: Record<string, number>
  }
  range: { to: string; horizonDays: number | null }
  x3Error: string | null
}

interface PageProps {
  /** `null` = vue dérivée du délai (#114) ; nombre = fenêtre fixe (bascule). */
  horizon: number | null
  rowsHref: string
  defaultHorizon: number
}

/** Dates à l'écran en jj/mm/aaaa — jamais d'ISO brut. */
const fr = (iso: string | null): string => {
  if (iso === null) return '—'
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : '—'
}

const qte = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

/** Filtres de nature. `null` = tout. */
type Filtre = null | 'suggestion' | 'message'

/** Bascule d'horizon : dérivé (défaut, #114) ou fenêtres fixes. */
const HORIZONS: Array<{ v: number | null; label: string }> = [
  { v: null, label: 'Dérivé' },
  { v: 30, label: '30 j' },
  { v: 60, label: '60 j' },
  { v: 90, label: '90 j' },
]

const MESSAGE_META: Record<MessageCode, { label: string; icon: typeof ArrowUp; cls: string }> = {
  2: { label: 'Avancer', icon: ArrowUp, cls: 'text-[#c13515]' },
  3: { label: 'Retarder', icon: ArrowDown, cls: 'text-muted-foreground' },
  6: { label: 'Inutile', icon: Ban, cls: 'text-[#c13515]' },
}

/** Verdicts du moteur de triage (appro_triage.ts). Action = orange, données = rouge, reste = neutre. */
const VERDICT_META: Record<ApproTriage['verdict'], { label: string; cls: string }> = {
  passer: { label: 'Passer', cls: 'bg-[#fc642d]/13 text-[#b8430f]' },
  replanifier: { label: 'Replanifier', cls: 'bg-[#fc642d]/13 text-[#b8430f]' },
  regrouper: { label: 'Regrouper', cls: 'bg-muted text-muted-foreground' },
  surveiller: { label: 'Surveiller', cls: 'bg-muted text-muted-foreground' },
  investiguer: { label: 'Investiguer', cls: 'bg-[#c13515]/10 text-[#c13515]' },
}

function EcheanceChip({ jours }: { jours: number | null }) {
  if (jours === null) return <span className="text-xs text-muted-foreground">sans date</span>
  const retard = jours < 0
  const proche = jours >= 0 && jours <= 21
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap',
        retard && 'bg-[#c13515]/10 text-[#c13515]',
        proche && 'bg-[#fc642d]/13 text-[#b8430f]',
        !retard && !proche && 'bg-muted text-muted-foreground'
      )}
    >
      {retard ? `en retard ${-jours} j` : `dans ${jours} j`}
    </span>
  )
}

function ItemRow({ item }: { item: ApproItem }) {
  const meta = item.message === null ? null : MESSAGE_META[item.message]
  const Icon = meta?.icon ?? ShoppingCart
  const verdict = item.triage ? VERDICT_META[item.triage.verdict] : null
  const preuve = item.triage?.preuves[0]
  return (
    <tr className="border-b border-[#ebebeb] last:border-0 hover:bg-[#fbfbfb]">
      <td className="py-2.5 pr-3 pl-4">
        <div className="flex items-center gap-2">
          <Icon className={cn('size-3.5 shrink-0', meta?.cls ?? 'text-muted-foreground')} />
          <span className="text-xs font-semibold">
            {meta === null ? 'À commander' : meta.label}
          </span>
          {verdict !== null && (
            <span
              className={cn(
                'inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap',
                verdict.cls
              )}
            >
              {verdict.label}
            </span>
          )}
        </div>
      </td>
      <td className="py-2.5 pr-3">
        <div className="font-semibold tracking-tight">{item.article}</div>
        <div className="text-xs text-muted-foreground">{item.designation}</div>
        {preuve !== undefined && (
          <div
            className="mt-0.5 max-w-[420px] truncate text-[10.5px] text-muted-foreground/80"
            title={preuve}
          >
            {preuve}
          </div>
        )}
        {item.nature === 'suggestion' && item.delaiReappro === null && (
          <div className="mt-0.5 text-[10.5px] text-[#c13515]/80">
            délai de réappro non renseigné — repli 14 j
          </div>
        )}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">{qte(item.quantite)}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">{fr(item.echeance)}</td>
      <td className="py-2.5 pr-3">
        <EcheanceChip jours={item.jours} />
      </td>
      <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap">
        {/* Le décalage n'a de sens que sur un message qui propose une date. */}
        {item.dateProposee === null
          ? '—'
          : `→ ${fr(item.dateProposee)}${
              item.decalage === null ? '' : ` (${item.decalage > 0 ? '+' : ''}${item.decalage} j)`
            }`}
      </td>
    </tr>
  )
}

function Dossier({ dossier }: { dossier: ApproDossier }) {
  const urgents = dossier.items.filter((i) => i.jours !== null && i.jours <= 21).length
  return (
    <details className="mb-2.5 overflow-hidden rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold tracking-tight">{dossier.nom}</div>
          <div className="text-xs text-muted-foreground">code {dossier.fournisseur || '—'}</div>
        </div>
        <div className="text-right text-xs whitespace-nowrap text-muted-foreground">
          <span className="font-bold text-foreground">{dossier.nbArticles}</span> article
          {dossier.nbArticles > 1 ? 's' : ''}
          {dossier.nbSuggestions > 0 && (
            <>
              {' · '}
              <span className="font-bold text-foreground">{dossier.nbSuggestions}</span> à commander
            </>
          )}
          {dossier.nbMessages > 0 && (
            <>
              {' · '}
              <span className="font-bold text-foreground">{dossier.nbMessages}</span> à replanifier
            </>
          )}
          <br />1<sup>re</sup> échéance {fr(dossier.premiereEcheance)}
        </div>
        <div className="min-w-[110px] text-right">
          {urgents > 0 ? (
            <span className="inline-block rounded-full bg-[#fc642d]/13 px-2 py-0.5 text-[10.5px] font-bold text-[#b8430f]">
              {urgents} sous 21 j
            </span>
          ) : (
            <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
              rien d’urgent
            </span>
          )}
        </div>
      </summary>
      <table className="w-full border-t border-[#ebebeb]">
        <tbody>
          {dossier.items.map((item) => (
            <ItemRow key={item.cle} item={item} />
          ))}
        </tbody>
      </table>
    </details>
  )
}

export default function Approvisionnements({ horizon, rowsHref }: PageProps) {
  const { data, loading, error, ms } = useTimedFetch<ApproResponse>(rowsHref)
  const [filtre, setFiltre] = useState<Filtre>(null)

  const dossiers = useMemo(() => {
    if (data === null) return []
    if (filtre === null) return data.dossiers
    // Filtrer DANS les dossiers, puis écarter ceux qui se vident : un dossier
    // vide sous un filtre n'apprend rien et casse le comptage affiché.
    return data.dossiers
      .map((d) => ({ ...d, items: d.items.filter((i) => i.nature === filtre) }))
      .filter((d) => d.items.length > 0)
  }, [data, filtre])

  const stats = data?.stats

  return (
    <AppLayout active="approvisionnements" subtitle="Approvisionnements · Suggestions du CBN">
      <div className="mx-auto max-w-[1180px] px-5 pt-7 pb-20">
        <h1 className="text-[22px] font-bold tracking-tight">Approvisionnements</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] text-muted-foreground">
          Ce que le calcul des besoins propose côté achat, regroupé par fournisseur. Les suggestions
          à commander et les commandes déjà passées que X3 demande de déplacer.
        </p>

        {stats !== undefined && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {(
              [
                [null, `${stats.nbItems} lignes`],
                ['suggestion', `${stats.nbSuggestions} à commander`],
                ['message', `${stats.nbMessages} à replanifier`],
              ] as Array<[Filtre, string]>
            ).map(([val, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setFiltre(val)}
                aria-pressed={filtre === val}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-[12.5px]',
                  filtre === val
                    ? 'border-foreground bg-foreground font-semibold text-white'
                    : 'border-border bg-card text-muted-foreground hover:bg-secondary'
                )}
              >
                {label}
              </button>
            ))}
            <span
              className={cn(
                'ml-3 inline-flex items-center gap-0.5 rounded-lg border p-0.5',
                'border-border bg-card'
              )}
            >
              {HORIZONS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() =>
                    router.get('/approvisionnements', h.v === null ? {} : { horizon: h.v })
                  }
                  aria-pressed={horizon === h.v}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[12px]',
                    horizon === h.v
                      ? 'bg-foreground font-semibold text-white'
                      : 'text-muted-foreground hover:bg-secondary'
                  )}
                >
                  {h.label}
                </button>
              ))}
            </span>
            <span className="ml-auto text-[12.5px] text-muted-foreground">
              {dossiers.length} fournisseur{dossiers.length > 1 ? 's' : ''} ·{' '}
              {horizon === null ? 'horizon dérivé' : `horizon ${horizon} j`}
              {ms !== null && ` · ${(ms / 1000).toFixed(1)} s`}
            </span>
          </div>
        )}

        <div className="mt-5">
          {loading && <LoadingState title="Lecture du calcul des besoins X3…" />}

          {!loading && error !== null && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary px-4 py-3 text-[13px]">
              <CloudOff className="size-4 shrink-0 text-[#c13515]" />
              <span>Chargement impossible : {error.message}</span>
            </div>
          )}

          {!loading && error === null && data?.x3Error != null && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary px-4 py-3 text-[13px]">
              <CloudOff className="size-4 shrink-0 text-[#c13515]" />
              <span>X3 n’a pas répondu : {data.x3Error}</span>
            </div>
          )}

          {!loading && error === null && data?.x3Error == null && dossiers.length === 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary px-4 py-3 text-[13px] text-muted-foreground">
              <Inbox className="size-4 shrink-0" />
              <span>Rien à décider sur cet horizon.</span>
            </div>
          )}

          {!loading &&
            error === null &&
            dossiers.map((d) => <Dossier key={d.fournisseur || '∅'} dossier={d} />)}
        </div>
      </div>
    </AppLayout>
  )
}
