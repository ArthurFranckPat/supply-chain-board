/**
 * CONTRAT DE DIRECTION — refonte /approvisionnements (seed 69c2b364, mode operate).
 *
 * THESIS: la page n'est pas une file d'accordéons — c'est une pile de feuilles
 * de préparation fournisseur, car le fournisseur est la maille à laquelle une
 * commande est réellement passée. La feuille la plus urgente ouvre la page,
 * les dossiers entièrement décidés descendent dans « Dossiers traités » : la
 * pile se vide à vue. Refusé : l'accordéon fermé par défaut où l'urgence est
 * cachée dans le pli.
 * OWN-WORLD: grammaire Airbnb — feuilles blanches posées sur un champ
 * surface-soft, hairlines #ddd, encre #222, Plus Jakarta Sans en
 * tabular-nums ; verdicts en pastille + petites capitales ; statuts métier
 * suggéré/danger inchangés ; Rausch absent (aucun CTA sur cette page).
 * STORY: l'acheteur atterrit sur la feuille à traiter, lit le verdict et sa
 * preuve, enregistre Vu / Ignorer / À passer par ligne ; la feuille se vide,
 * la pile descend.
 * FIRST VIEWPORT: toolbar 48px (segments nature + horizon, reste à décider,
 * actualiser) ; en dessous, sur le champ gris, la première feuille
 * fournisseur : nom, première échéance, urgence, sections « À commander » /
 * « À replanifier ».
 * FORM: feuille de préparation fournisseur — candidat 7 de la liste ordonnée.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 * finish review, the verdict, and DESIGN.md.
 */

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
 *
 * **Décisions acheteur (ledger #134).** Vu / Ignorer / À passer par ligne,
 * append-only côté serveur. Un dossier dont toutes les lignes visibles sont
 * décidées quitte la pile active pour l'index « Dossiers traités ».
 */
import { useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import {
  ArrowDown,
  ArrowUp,
  Ban,
  ChevronRight,
  CloudOff,
  Inbox,
  Info,
  ShoppingCart,
} from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import {
  RefreshPill,
  SEG,
  Segment,
  SegmentButton,
  ToolbarRow,
  ToolbarSpacer,
} from '@r/components/vision/toolbar'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'

type MessageCode = 2 | 3 | 6

interface ApproTriage {
  cle: string
  verdict: 'passer' | 'surveiller' | 'regrouper' | 'replanifier' | 'investiguer'
  score: number
  preuves: string[]
}

type DecisionStatut = 'vu' | 'ignorer' | 'a_passer'

interface ApproDecision {
  statut: DecisionStatut
  decidedAt: string
}

interface ApproItem {
  cle: string
  /**
   * `VCRNUM:VCRLIN:VCRSEQ` sur un message, `null` sur une suggestion — la seule
   * clé qui joigne EXACTEMENT une ligne à son explication (#138 lot 1).
   * `cle` ne suffit pas : elle omet la séquence, et 141 articles portent plus
   * d'un message.
   */
  cleSnapshot: string | null
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
  decision: ApproDecision | null
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
  decisions: { nb: number; overrides: number }
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

interface CbnCorrelation {
  source: string
  nature: string
  detail: string
  poids: number
}

interface CbnExplanation {
  cle: string
  article: string
  fournisseur: string | null
  mrpmes: number | null
  natureMessage: string
  correlations: CbnCorrelation[]
  contradictions: CbnCorrelation[]
}

interface ExplanationsResponse {
  avant: string | null
  apres: string | null
  /** Décomptes seuls — les diffs bruts vivent sur `/messages-diff` et `/drivers-diff`. */
  nbMessages: number
  nbDrivers: number
  explications: CbnExplanation[]
  message?: string
}

const NATURE_DIFF_LABEL: Record<string, string> = {
  apparue: 'apparu',
  disparue: 'disparu',
  intensifiee: 'intensifié',
  attenuee: 'atténué',
  modifiee: 'modifié',
}

/** Verdicts du moteur de triage (appro_triage.ts) — pastille + petites
 *  capitales (grammaire chips DESIGN.md). Action = orange, données = rouge,
 *  reste = neutre. */
const VERDICT_META: Record<ApproTriage['verdict'], { label: string; dot: string; cls: string }> = {
  passer: { label: 'Passer', dot: '#fc642d', cls: 'text-[#b8430f]' },
  replanifier: { label: 'Replanifier', dot: '#fc642d', cls: 'text-[#b8430f]' },
  regrouper: { label: 'Regrouper', dot: '#929292', cls: 'text-muted-foreground' },
  surveiller: { label: 'Surveiller', dot: '#929292', cls: 'text-muted-foreground' },
  investiguer: { label: 'Investiguer', dot: '#c13515', cls: 'text-[#c13515]' },
}

const DECISION_ACTIONS: DecisionStatut[] = ['vu', 'ignorer', 'a_passer']

const DECISION_LABEL: Record<DecisionStatut, string> = {
  vu: 'Vu',
  ignorer: 'Ignorer',
  a_passer: 'À passer',
}

/** Une ligne est « décidée » dès qu'un statut du ledger la couvre — `à passer`
 *  inclus : la décision est enregistrée, même si la commande reste à poser. */
const estDecidee = (statut: DecisionStatut | null): boolean => statut !== null

/** État du POST de décision d'une ligne. */
type EtatEnvoi = 'inerte' | 'en-cours' | 'echec'

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

function VerdictChip({ triage }: { triage: ApproTriage | null }) {
  if (triage === null) return null
  const meta = VERDICT_META[triage.verdict]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: meta.dot }}
      />
      <span className={cn('text-[10px] font-bold uppercase tracking-[0.08em]', meta.cls)}>
        {meta.label}
      </span>
    </span>
  )
}

function UrgenceChip({ nbRetard, nbUrgents }: { nbRetard: number; nbUrgents: number }) {
  if (nbRetard > 0) {
    return (
      <span className="inline-block rounded-full bg-[#c13515]/10 px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap text-[#c13515]">
        {nbRetard} en retard
      </span>
    )
  }
  if (nbUrgents > 0) {
    return (
      <span className="inline-block rounded-full bg-[#fc642d]/13 px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap text-[#b8430f]">
        {nbUrgents} sous 21 j
      </span>
    )
  }
  return (
    <span className="inline-block rounded-full bg-muted px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap text-muted-foreground">
      rien d’urgent
    </span>
  )
}

/** Micro-segment de décision (Vu / Ignorer / À passer) — grammar SEG en
 *  miniature : actif = encre pleine, Rausch reste hors de la maille ligne. */
function DecisionControl({
  actuelle,
  etatEnvoi,
  onDecide,
}: {
  actuelle: DecisionStatut | null
  etatEnvoi: EtatEnvoi
  onDecide: (statut: DecisionStatut) => void
}) {
  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <div className={SEG}>
        {DECISION_ACTIONS.map((statut) => (
          <button
            key={statut}
            type="button"
            onClick={() => onDecide(statut)}
            disabled={etatEnvoi === 'en-cours'}
            aria-pressed={actuelle === statut}
            className={cn(
              'rounded-md px-2 py-1 text-[10px] font-semibold whitespace-nowrap transition-colors duration-150 disabled:opacity-50',
              actuelle === statut
                ? 'bg-foreground text-white'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            {DECISION_LABEL[statut]}
          </button>
        ))}
      </div>
      {/* Un POST refusé ne doit pas être muet : l'acheteur croirait avoir décidé. */}
      {etatEnvoi === 'echec' && (
        <span role="status" className="text-[10px] font-semibold text-[#c13515]">
          non enregistré — réessayer
        </span>
      )}
    </div>
  )
}

/**
 * Identité d'AFFICHAGE d'une ligne — unique, contrairement à `cle`.
 *
 * `cle` est la clé du ledger (`M:VCRNUM:VCRLIN`) : `COA2400006` ligne 1 porte
 * cinq messages qui la partagent. Utilisée en `key` React, elle faisait
 * cohabiter cinq lignes sous la même identité.
 */
const cleAffichage = (item: ApproItem): string => item.cleSnapshot ?? item.cle

/**
 * Explications d'une ligne — jointure EXACTE sur `cleSnapshot`
 * (`VCRNUM:VCRLIN:VCRSEQ`), jamais approchée.
 *
 * Un repli par article a existé ici : il attribuait à un message les
 * explications d'une AUTRE ligne de commande dès que l'article en portait
 * plusieurs — 141 articles sur les 400 du parc (photo du 06/08/2026), et
 * `COA2400006` ligne 1 en porte cinq à elle seule. Rien à l'écran ne
 * distinguait alors une explication empruntée d'une vraie. « Non expliqué »
 * est honnête ; une explication d'à côté ne l'est pas.
 */
function explicationsPour(
  parCle: Map<string, CbnExplanation[]> | undefined,
  item: ApproItem
): CbnExplanation[] | undefined {
  if (parCle === undefined || item.cleSnapshot === null) return undefined
  return parCle.get(item.cleSnapshot)
}

function ExplanationBlock({ explications }: { explications: CbnExplanation[] }) {
  if (explications.length === 0) return null
  return (
    <div className="mt-2 rounded-md border border-[#e8e8e8] bg-[#fafaf8] px-3 py-2">
      {explications.map((exp) => (
        <div key={exp.cle} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]',
                exp.natureMessage === 'apparue' && 'bg-[#c13515]/10 text-[#c13515]',
                exp.natureMessage === 'disparue' && 'bg-muted text-muted-foreground',
                exp.natureMessage === 'intensifiee' && 'bg-[#c13515]/10 text-[#c13515]',
                exp.natureMessage === 'attenuee' && 'bg-[#fc642d]/15 text-[#b8430f]',
                exp.natureMessage === 'modifiee' && 'bg-amber-100 text-amber-800',
                !['apparue', 'disparue', 'intensifiee', 'attenuee', 'modifiee'].includes(
                  exp.natureMessage
                ) && 'bg-muted text-muted-foreground'
              )}
            >
              {NATURE_DIFF_LABEL[exp.natureMessage] ?? exp.natureMessage}
            </span>
            <span className="text-[10.5px] text-muted-foreground">
              {exp.article} · {exp.cle}
            </span>
          </div>
          {exp.correlations.length > 0 ? (
            <ul className="space-y-0.5">
              {exp.correlations.map((c, i) => (
                <li key={i} className="flex gap-1.5 text-[11px] leading-snug">
                  <Info size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="font-semibold">{c.source}</span> — {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[11px] italic text-muted-foreground">
              Non expliqué — aucune variation convergente au-delà des seuils (±20 % quantité, ±7 j)
              sur cet article entre les deux photos.
            </div>
          )}
          {exp.contradictions.length > 0 && (
            <details className="text-[10.5px]">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {exp.contradictions.length} variation{exp.contradictions.length > 1 ? 's' : ''}{' '}
                contradictoire{exp.contradictions.length > 1 ? 's' : ''} (atténue le message)
              </summary>
              <ul className="mt-1 space-y-0.5">
                {exp.contradictions.map((c, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="font-medium">{c.source}</span> — {c.detail}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="text-[10px] text-muted-foreground/70">
            Corrélations, non causes — le CBN fait du netting par fenêtres.
          </div>
        </div>
      ))}
    </div>
  )
}

function ItemRow({
  item,
  decisionActuelle,
  etatEnvoi,
  onDecide,
  explications,
}: {
  item: ApproItem
  decisionActuelle: DecisionStatut | null
  /** État du dernier POST de décision sur cette ligne. */
  etatEnvoi: EtatEnvoi
  onDecide: (statut: DecisionStatut) => void
  explications?: CbnExplanation[]
}) {
  const meta = item.message === null ? null : MESSAGE_META[item.message]
  const Icon = meta?.icon ?? ShoppingCart
  const preuve = item.triage?.preuves[0]
  /* Vu / Ignorer = traité : la ligne s'efface. À passer reste à pleine
     encre — la commande n'est pas encore posée dans X3. */
  const traitee =
    decisionActuelle === 'vu' || decisionActuelle === 'ignorer' || etatEnvoi === 'en-cours'
  return (
    <li
      className={cn(
        'grid grid-cols-1 gap-x-4 gap-y-2 px-5 py-3 transition-opacity duration-200 hover:bg-secondary/60 md:grid-cols-[144px_minmax(0,1fr)_84px_148px_176px]',
        traitee && 'opacity-55'
      )}
    >
      {/* Nature + verdict */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:flex-col md:items-start md:gap-y-1.5">
        <span className="inline-flex items-center gap-1.5">
          <Icon className={cn('size-3.5 shrink-0', meta?.cls ?? 'text-muted-foreground')} />
          <span className="text-xs font-semibold">
            {meta === null ? 'À commander' : meta.label}
          </span>
        </span>
        <VerdictChip triage={item.triage} />
      </div>

      {/* Article + preuve */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-cell-lg font-semibold tracking-tight">{item.article}</span>
          <span className="truncate text-xs text-muted-foreground">{item.designation}</span>
        </div>
        {preuve !== undefined && (
          <div
            className="mt-0.5 max-w-[560px] truncate text-[10.5px] text-muted-foreground"
            title={preuve}
          >
            {preuve}
          </div>
        )}
        {item.nature === 'suggestion' &&
          (item.delaiReappro === null ? (
            <div className="mt-0.5 text-[10.5px] text-[#c13515]/80">
              délai de réappro non renseigné — repli 14 j
            </div>
          ) : (
            <div className="mt-0.5 text-[10.5px] text-muted-foreground">
              délai de réappro {item.delaiReappro} j
            </div>
          ))}
      </div>

      {/* Quantité */}
      <div className="text-cell-lg font-semibold tabular-nums md:text-right">
        {qte(item.quantite)}
      </div>

      {/* Échéance + proposition de replanification */}
      <div className="md:text-right">
        <div className="text-[12.5px] font-semibold tabular-nums whitespace-nowrap">
          {fr(item.echeance)}
        </div>
        <div className="mt-1 flex md:justify-end">
          <EcheanceChip jours={item.jours} />
        </div>
        {item.dateProposee !== null && (
          <div className="mt-1 text-[10.5px] whitespace-nowrap text-muted-foreground">
            {/* Le décalage n'a de sens que sur un message qui propose une date. */}→{' '}
            {fr(item.dateProposee)}
            {item.decalage === null ? '' : ` (${item.decalage > 0 ? '+' : ''}${item.decalage} j)`}
          </div>
        )}
      </div>

      {/* Décision acheteur (ledger #134) */}
      <div className="md:pt-0.5">
        <DecisionControl actuelle={decisionActuelle} etatEnvoi={etatEnvoi} onDecide={onDecide} />
      </div>
      {item.nature === 'message' && explications !== undefined && explications.length > 0 && (
        <div className="col-span-full">
          <ExplanationBlock explications={explications} />
        </div>
      )}
    </li>
  )
}

/** En-tête de section d'une feuille : libellé uppercase + compteur de lignes. */
function SectionLabel({ label, nb }: { label: string; nb: number }) {
  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <span className="text-[10px] font-semibold tabular-nums text-muted-foreground/70">
        {nb} ligne{nb > 1 ? 's' : ''}
      </span>
    </div>
  )
}

/** Vue préparée d'un dossier : lignes triées par échéance + compte de décisions. */
interface FeuilleVue {
  dossier: ApproDossier
  suggestions: ApproItem[]
  messages: ApproItem[]
  nbDecidees: number
  nbRetard: number
  nbUrgents: number
  /** Plus petite échéance parmi les lignes non décidées (null = tout décidé). */
  minJoursADecider: number | null
}

const parEcheance = (a: ApproItem, b: ApproItem): number =>
  (a.jours ?? Number.POSITIVE_INFINITY) - (b.jours ?? Number.POSITIVE_INFINITY)

/** Feuille de préparation fournisseur — le document de travail, toujours ouvert. */
function Feuille({
  vue,
  decisions,
  envois,
  onDecide,
  explicationsParCle,
}: {
  vue: FeuilleVue
  decisions: Record<string, DecisionStatut>
  envois: Record<string, EtatEnvoi>
  onDecide: (item: ApproItem, statut: DecisionStatut) => void
  explicationsParCle?: Map<string, CbnExplanation[]>
}) {
  const { dossier, suggestions, messages } = vue
  const nbItems = suggestions.length + messages.length
  const renderRows = (items: ApproItem[]) =>
    items.map((item) => (
      <ItemRow
        key={cleAffichage(item)}
        item={item}
        decisionActuelle={decisions[item.cle] ?? item.decision?.statut ?? null}
        etatEnvoi={envois[item.cle] ?? 'inerte'}
        onDecide={(statut) => onDecide(item, statut)}
        explications={explicationsPour(explicationsParCle, item)}
      />
    ))
  return (
    <article className="overflow-hidden rounded-lg border border-rule bg-card">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold tracking-tight">{dossier.nom}</h2>
          <p className="mt-0.5 text-1.5xs text-muted-foreground">
            code <span className="font-mono">{dossier.fournisseur || '—'}</span>
            {' · '}
            <b className="font-bold text-foreground">{dossier.nbArticles}</b> article
            {dossier.nbArticles > 1 ? 's' : ''}
            {suggestions.length > 0 && (
              <>
                {' · '}
                <b className="font-bold text-foreground">{suggestions.length}</b> à commander
              </>
            )}
            {messages.length > 0 && (
              <>
                {' · '}
                <b className="font-bold text-foreground">{messages.length}</b> à replanifier
              </>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Première échéance
          </div>
          <div className="mt-0.5 text-cell-lg font-bold tabular-nums">
            {fr(dossier.premiereEcheance)}
          </div>
        </div>
        <UrgenceChip nbRetard={vue.nbRetard} nbUrgents={vue.nbUrgents} />
      </header>

      <div className="border-t border-[#ebebeb]">
        {suggestions.length > 0 && (
          <section>
            <SectionLabel label="À commander" nb={suggestions.length} />
            <ul className="divide-y divide-[#ebebeb]">{renderRows(suggestions)}</ul>
          </section>
        )}
        {messages.length > 0 && (
          <section className={cn(suggestions.length > 0 && 'border-t border-[#ebebeb]')}>
            <SectionLabel label="À replanifier" nb={messages.length} />
            <ul className="divide-y divide-[#ebebeb]">{renderRows(messages)}</ul>
          </section>
        )}
      </div>

      {/* La progression fait partie du document : c'est elle qui vide la pile. */}
      <footer className="flex items-center justify-between border-t border-rule bg-secondary/50 px-5 py-2">
        <span className="text-[10.5px] text-muted-foreground">
          Décisions{' '}
          <b className="font-bold tabular-nums text-foreground">
            {vue.nbDecidees}/{nbItems}
          </b>{' '}
          enregistrées
        </span>
        {vue.minJoursADecider !== null && vue.minJoursADecider < 0 && (
          <span className="text-[10.5px] font-semibold text-[#c13515]">
            échéance dépassée — à traiter
          </span>
        )}
      </footer>
    </article>
  )
}

/** Index des dossiers entièrement décidés — une ligne repliable par dossier. */
function DossiersTraités({
  vues,
  decisions,
  envois,
  onDecide,
  explicationsParCle,
}: {
  vues: FeuilleVue[]
  decisions: Record<string, DecisionStatut>
  envois: Record<string, EtatEnvoi>
  onDecide: (item: ApproItem, fournisseur: string, statut: DecisionStatut) => void
  explicationsParCle?: Map<string, CbnExplanation[]>
}) {
  if (vues.length === 0) return null
  return (
    <div className="mt-8">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Dossiers traités
        </h2>
        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground/70">
          {vues.length}
        </span>
      </div>
      <div className="divide-y divide-[#ebebeb] overflow-hidden rounded-lg border border-rule bg-card">
        {vues.map((vue) => {
          const items = [...vue.suggestions, ...vue.messages]
          const nb = items.length
          return (
            <details key={vue.dossier.fournisseur || '∅'} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-2.5 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  size={14}
                  strokeWidth={2}
                  className="shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90"
                />
                <span className="min-w-0 flex-1 truncate text-cell-lg font-semibold tracking-tight">
                  {vue.dossier.nom}
                </span>
                <span className="hidden text-1.5xs whitespace-nowrap text-muted-foreground sm:inline">
                  <b className="font-bold tabular-nums text-foreground">{nb}</b> ligne
                  {nb > 1 ? 's' : ''} · première échéance {fr(vue.dossier.premiereEcheance)}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-muted-foreground">
                  {vue.nbDecidees}/{nb} décidées
                </span>
              </summary>
              <ul className="border-t border-[#ebebeb]">
                {items.map((item) => (
                  <ItemRow
                    key={cleAffichage(item)}
                    item={item}
                    decisionActuelle={decisions[item.cle] ?? item.decision?.statut ?? null}
                    etatEnvoi={envois[item.cle] ?? 'inerte'}
                    onDecide={(statut) => onDecide(item, vue.dossier.fournisseur, statut)}
                    explications={explicationsPour(explicationsParCle, item)}
                  />
                ))}
              </ul>
            </details>
          )
        })}
      </div>
    </div>
  )
}

export default function Approvisionnements({ horizon, rowsHref }: PageProps) {
  const { data, loading, error, ms } = useTimedFetch<ApproResponse>(rowsHref)
  // Lot 1 : explications corrélées (besoin de 2 photos). Indépendant du rowsHref.
  const { data: explData } = useTimedFetch<ExplanationsResponse>('/api/v1/appro/explanations')
  const explicationsParCle = useMemo(() => {
    if (!explData || !explData.explications || explData.explications.length === 0) return undefined
    const m = new Map<string, CbnExplanation[]>()
    for (const e of explData.explications) {
      const list = m.get(e.cle)
      if (list === undefined) m.set(e.cle, [e])
      else list.push(e)
    }
    return m
  }, [explData])
  const maturationInfo =
    explData && explData.avant === null && explData.apres === null ? explData.message : null
  // Un message DISPARU n'existe plus dans X3, donc plus dans la file : son
  // explication est juste mais aucune ligne ne peut la porter. Les compter
  // comme « analysés » promettait des explications introuvables à l'écran ;
  // annoncés comme soldés, ils disent quelque chose d'utile à l'acheteur.
  const nbSoldes = explData?.explications.filter((e) => e.natureMessage === 'disparue').length ?? 0
  const nbAffichables = (explData?.explications.length ?? 0) - nbSoldes
  const [filtre, setFiltre] = useState<Filtre>(null)
  // Décisions locales (ledger #134) — priorité sur le payload au re-rendu.
  const [decisions, setDecisions] = useState<Record<string, DecisionStatut>>({})
  // État du POST par ligne : un envoi refusé doit se voir, sans quoi l'acheteur
  // repart en croyant avoir décidé — et le ledger étant append-only, chaque
  // nouvel essai qui passe écrit une ligne de plus.
  const [envois, setEnvois] = useState<Record<string, EtatEnvoi>>({})

  /** POST d'une décision — append-only côté serveur, mise à jour locale immédiate. */
  const poster = async (item: ApproItem, fournisseur: string, statut: DecisionStatut) => {
    const body =
      item.nature === 'message'
        ? {
            nature: 'message' as const,
            statut,
            // La clé du serveur est renvoyée telle quelle : la découper ici pour
            // que le serveur la recompose, c'est deux définitions d'un format.
            cle: item.cle,
            article: item.article,
          }
        : {
            nature: 'suggestion' as const,
            statut,
            article: item.article,
            fournisseur,
            echeance: item.echeance,
            quantite: item.quantite,
          }
    setEnvois((e) => ({ ...e, [item.cle]: 'en-cours' }))
    try {
      const res = await fetch('/api/v1/appro/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDecisions((d) => ({ ...d, [item.cle]: statut }))
      setEnvois((e) => ({ ...e, [item.cle]: 'inerte' }))
    } catch {
      // La file ne casse pas sur un POST refusé, mais la ligne le dit.
      setEnvois((e) => ({ ...e, [item.cle]: 'echec' }))
    }
  }

  /** Décision effective d'une ligne : locale d'abord, payload ensuite. */
  const decisionEffective = (item: ApproItem): DecisionStatut | null =>
    decisions[item.cle] ?? item.decision?.statut ?? null

  // Filtrer DANS les dossiers, puis écarter ceux qui se vident : un dossier
  // vide sous un filtre n'apprend rien et casse le comptage affiché.
  const dossiersFiltres = useMemo(() => {
    if (data === null) return []
    if (filtre === null) return data.dossiers
    return data.dossiers
      .map((d) => ({ ...d, items: d.items.filter((i) => i.nature === filtre) }))
      .filter((d) => d.items.length > 0)
  }, [data, filtre])

  /** Feuilles préparées : lignes par échéance, pile active vs dossiers traités.
   *  Le tri d'affichage ne touche jamais la donnée serveur. */
  const { actives, traitees } = useMemo(() => {
    const vues: FeuilleVue[] = dossiersFiltres.map((dossier) => {
      const suggestions = dossier.items.filter((i) => i.nature === 'suggestion').sort(parEcheance)
      const messages = dossier.items.filter((i) => i.nature === 'message').sort(parEcheance)
      const items = [...suggestions, ...messages]
      const nonDecidees = items.filter((i) => !estDecidee(decisionEffective(i)))
      return {
        dossier,
        suggestions,
        messages,
        nbDecidees: items.length - nonDecidees.length,
        nbRetard: items.filter((i) => i.jours !== null && i.jours < 0).length,
        nbUrgents: items.filter((i) => i.jours !== null && i.jours <= 21).length,
        minJoursADecider:
          nonDecidees.length === 0
            ? null
            : Math.min(...nonDecidees.map((i) => i.jours ?? Number.POSITIVE_INFINITY)),
      }
    })
    const actifs = vues
      .filter((v) => v.minJoursADecider !== null)
      // Comparateur total : deux dossiers « sans date » (Infinity) doivent
      // rester stables entre eux — une soustraction Infinity - Infinity = NaN.
      .sort((a, b) => {
        const ja = a.minJoursADecider ?? 0
        const jb = b.minJoursADecider ?? 0
        if (ja === jb) return 0
        return ja < jb ? -1 : 1
      })
    const traites = vues
      .filter((v) => v.minJoursADecider === null)
      .sort((a, b) => a.dossier.nom.localeCompare(b.dossier.nom, 'fr'))
    return { actives: actifs, traitees: traites }
    // `decisionEffective` lit `decisions` — la dépendance est bien là.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossiersFiltres, decisions])

  /** Reste à décider sur l'horizon complet (indépendant du filtre nature). */
  const aDecider = useMemo(() => {
    if (data === null) return 0
    let nb = 0
    for (const d of data.dossiers)
      for (const i of d.items) if (!estDecidee(decisionEffective(i))) nb++
    return nb
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, decisions])

  const stats = data?.stats

  const horizonLabel =
    horizon === null
      ? `horizon dérivé${data !== null ? ` · au ${fr(data.range.to)}` : ''}`
      : `horizon ${horizon} j`

  const refreshHref =
    horizon === null ? '/approvisionnements' : `/approvisionnements?horizon=${horizon}`

  return (
    <AppLayout
      active="approvisionnements"
      title="Approvisionnements"
      subtitle="Approvisionnements · Suggestions du CBN"
      dense
      scrollable={false}
      meta={
        stats !== undefined ? (
          <>
            <div>
              <b className="font-bold text-foreground">{stats.nbItems}</b> lignes ·{' '}
              <b className="font-bold text-foreground">{stats.nbDossiers}</b> dossiers
            </div>
            <div className="text-muted-foreground">{horizonLabel}</div>
          </>
        ) : null
      }
    >
      {/* AppLayout dense rend ses children en flux bloc : ce wrapper porte la
          colonne toolbar + zone scrollable (même montage que /ruptures). */}
      <div className="flex h-full min-h-0 flex-col">
        <ToolbarRow>
          <Segment ariaLabel="Nature" label="Nature">
            {(
              [
                [null, 'Tout', stats?.nbItems ?? 0],
                ['suggestion', 'À commander', stats?.nbSuggestions ?? 0],
                ['message', 'À replanifier', stats?.nbMessages ?? 0],
              ] as Array<[Filtre, string, number]>
            ).map(([val, label, count]) => (
              <SegmentButton
                key={label}
                active={filtre === val}
                onClick={() => setFiltre(val)}
                title={label}
              >
                {label}
                {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
              </SegmentButton>
            ))}
          </Segment>

          <Segment role="radiogroup" ariaLabel="Horizon" label="Horizon">
            {HORIZONS.map((h) => (
              <SegmentButton
                key={h.label}
                role="radio"
                active={horizon === h.v}
                title={
                  h.v === null
                    ? 'Horizon dérivé du délai de réappro (#114)'
                    : `Fenêtre fixe ${h.v} jours`
                }
                onClick={() =>
                  router.get('/approvisionnements', h.v === null ? {} : { horizon: h.v })
                }
              >
                {h.label}
              </SegmentButton>
            ))}
          </Segment>

          <ToolbarSpacer />

          <span className="font-mono text-2xs whitespace-nowrap text-muted-foreground">
            <b className="font-bold text-foreground">{aDecider}</b> à décider ·{' '}
            {dossiersFiltres.length} fournisseur{dossiersFiltres.length > 1 ? 's' : ''}
            {ms !== null && ` · ${(ms / 1000).toFixed(1)} s`}
          </span>

          <RefreshPill loading={loading} href={refreshHref} />
        </ToolbarRow>

        {/* Champ de travail : les feuilles blanches sur le gris surface-soft. */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-secondary">
          <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-7">
            {loading && <LoadingState title="Lecture du calcul des besoins X3…" />}

            {!loading && error !== null && (
              <div className="flex items-center gap-3 rounded-lg border border-rule bg-card px-4 py-3 text-sm">
                <CloudOff className="size-4 shrink-0 text-[#c13515]" />
                <span>Chargement impossible : {error.message}</span>
              </div>
            )}

            {!loading && error === null && data?.x3Error != null && (
              <div className="flex items-center gap-3 rounded-lg border border-rule bg-card px-4 py-3 text-sm">
                <CloudOff className="size-4 shrink-0 text-[#c13515]" />
                <span>X3 n’a pas répondu : {data.x3Error}</span>
              </div>
            )}

            {!loading &&
              error === null &&
              data?.x3Error == null &&
              actives.length === 0 &&
              traitees.length === 0 && (
                <div className="flex items-center justify-center gap-3 rounded-lg border border-rule bg-card px-4 py-10 text-sm text-muted-foreground">
                  <Inbox className="size-4 shrink-0" />
                  <span>Rien à décider sur cet horizon.</span>
                </div>
              )}

            {maturationInfo !== null && !loading && error === null && data?.x3Error == null && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                <Info size={16} className="shrink-0" />
                <span>
                  {maturationInfo} — historique en cours de constitution (J+2 pour explications).
                </span>
              </div>
            )}
            {explData !== null &&
              explData.avant !== null &&
              explData.apres !== null &&
              explData.explications.length > 0 &&
              !loading &&
              error === null &&
              data?.x3Error == null && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-800">
                  <Info size={14} className="shrink-0" />
                  <span>
                    Explications corrélées {fr(explData.avant)} → {fr(explData.apres)} :{' '}
                    {nbAffichables} message{nbAffichables > 1 ? 's' : ''} sur cette page
                    {nbSoldes > 0 && `, ${nbSoldes} soldé${nbSoldes > 1 ? 's' : ''} depuis`}
                  </span>
                </div>
              )}
            {!loading && error === null && data?.x3Error == null && (
              <>
                <div className="space-y-3">
                  {actives.map((vue) => (
                    <Feuille
                      key={vue.dossier.fournisseur || '∅'}
                      vue={vue}
                      decisions={decisions}
                      envois={envois}
                      onDecide={(item, statut) => poster(item, vue.dossier.fournisseur, statut)}
                      explicationsParCle={explicationsParCle}
                    />
                  ))}
                </div>
                <DossiersTraités
                  vues={traitees}
                  decisions={decisions}
                  envois={envois}
                  onDecide={poster}
                  explicationsParCle={explicationsParCle}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
