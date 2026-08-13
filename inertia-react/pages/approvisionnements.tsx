/**
 * CONTRAT DE DIRECTION — refonte /approvisionnements (seed 69c2b364, mode operate).
 *
 * THESIS: la page n'est pas une file d'accordéons — c'est une pile de feuilles
 * de préparation fournisseur, car le fournisseur est la maille à laquelle une
 * commande est réellement passée. La feuille la plus urgente ouvre la page,
 * les dossiers entièrement décidés descendent dans « Dossiers traités » : la
 * pile se vide à vue. Refusé : l'accordéon fermé par défaut où l'urgence est
 * cachée dans le pli.
 * OWN-WORLD: design system cursor (vitrine `/design-system`) — toolbar §18
 * (portée / filtres / spacer / métriques + actualiser), tokens
 * `--sidebar-canvas` / `border-border` / `bg-card` ; verdicts en pastille +
 * petites capitales ; statuts métier suggéré/danger inchangés. Plus de
 * grammaire Airbnb (hairlines #ddd, Plus Jakarta, Rausch).
 * STORY: l'acheteur atterrit sur la feuille à traiter, lit le verdict et sa
 * preuve, enregistre Vu / Ignorer / À passer par ligne ; la feuille se vide,
 * la pile descend.
 * FIRST VIEWPORT: toolbar §18 (Feuilles/Tendances + horizon, menu Filtres,
 * N à décider, actualiser) ; en dessous, sur le champ gris, la première
 * feuille fournisseur : nom, première échéance, urgence, sections
 * « À commander » / « À replanifier ».
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
 *
 * Migrée sur le design system cursor (vitrine `/design-system`) :
 * • `theme="cursor"` ; la barre passe par la prop `toolbar` d'AppLayout ;
 * • la barre suit le standard §18 : portée (Feuilles/Tendances + horizon),
 *   menu Filtres unique (Nature, Expliqués, Comparaison J-1/J-7/J-30),
 *   actualiser — plus de `vision/toolbar` ;
 * • les feuilles restent une pile de dossiers — pas une DataTable unique ;
 *   à l'intérieur, `TableHead` / `TableRow` / `CellStack` / `CellNumber` /
 *   `CellVerdict` / `CellDate` ; cartes `Card` ; actions `Pill`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { router } from '@inertiajs/react'
import {
  ArrowDown,
  ArrowUp,
  Ban,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  Eye,
  Inbox,
  Info,
  Layers,
  Minus,
  ShoppingCart,
  TriangleAlert,
  Waves,
  type LucideIcon,
} from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import { ArticleExplanationSheet } from '@r/components/appro/article-explanation-sheet'
import { Badge } from '@r/components/ui/badge'
import { Card, CardFooter } from '@r/components/ui/card'
import { Pill } from '@r/components/ui/pill'
import { Separator } from '@r/components/ui/separator'
import {
  CellDate,
  CellEvidence,
  CellNumber,
  CellStack,
  CellVerdict,
  TableCell,
  TableHead,
  TableHeadRow,
  TableRow,
  type RowTone,
} from '@r/components/ui/table-row'
import {
  ToolbarFilterChip,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarGroup,
  ToolbarRefresh,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
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
  2: { label: 'Avancer', icon: ArrowUp, cls: 'text-destructive' },
  3: { label: 'Retarder', icon: ArrowDown, cls: 'text-muted-foreground' },
  6: { label: 'Inutile', icon: Ban, cls: 'text-destructive' },
}

interface CbnCorrelation {
  source: string
  nature: string
  detail: string
  poids: number
  /** Amplitude de la variation, en unités de l'article. */
  amplitude: number
  /** Part relative de l'explication (0-1), amplitude normalisée sur les convergentes. */
  part: number
  /** Confiance (0-1) de la corrélation. */
  confiance: number
}

type CbnNiveau = 'directe' | 'probable' | 'correlation' | 'non_explique'

interface CbnExplanation {
  cle: string
  article: string
  fournisseur: string | null
  mrpmes: number | null
  natureMessage: string
  correlations: CbnCorrelation[]
  contradictions: CbnCorrelation[]
  niveau: CbnNiveau
  couverture: number
  /** Part de la variation de l'article que le catalogue ne relie pas au message. */
  residuInexplique: number
  synthese: string
}

/** Libellés des niveaux de confiance — jamais le mot « cause » (règle d'UI). */
const NIVEAU_META: Record<CbnNiveau, { label: string; cls: string; bar: string }> = {
  directe: {
    label: 'Corrélation directe',
    cls: 'bg-ferme/15 text-ferme',
    bar: 'bg-ferme',
  },
  probable: { label: 'Probable', cls: 'bg-suggere/15 text-suggere', bar: 'bg-suggere' },
  correlation: {
    label: 'Corrélation',
    cls: 'bg-muted text-muted-foreground',
    bar: 'bg-muted-foreground',
  },
  non_explique: {
    label: 'Non expliqué',
    cls: 'bg-destructive/10 text-destructive',
    bar: 'bg-destructive',
  },
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

/** Patterns émergents (#138 lot 2) — l'onglet « Tendances ». */
interface PatternArticle {
  article: string
  /** Messages DISTINCTS (clé stable) sur la fenêtre, pas lignes de photo. */
  nbMessages: number
  joursSousMessage: number
  messagesSemaine: number
  sourceDominante: string | null
  partSourceDominante: number | null
  /** Diffs de la fenêtre où l'article portait une corrélation. */
  diffsExpliques: number
  volatilite: 'haute' | 'moyenne' | 'basse'
}

interface PatternFournisseur {
  fournisseur: string
  nbMessages: number
  partReceptionsGlissees: number | null
}

/** Qualité mesurée du moteur sur le diff le plus récent de la fenêtre. */
interface QualiteExplications {
  messages: number
  nonExpliques: number
  tauxNonExplique: number | null
  couvertureMoyenne: number | null
  residuMoyen: number | null
}

interface PatternsResponse {
  apres: string | null
  avant: string | null
  fenetreJours: number
  joursCouverts: number
  diffsAnalyses: number
  articles: PatternArticle[]
  fournisseurs: PatternFournisseur[]
  qualite: QualiteExplications
  message?: string
}

interface OverrideParSource {
  source: string
  total: number
  overrides: number
  taux: number | null
  /** Part des décisions « à passer » — l'acheteur a suivi le moteur. */
  concordance: number | null
}

interface OverrideParNiveau {
  niveau: string
  total: number
  overrides: number
  taux: number | null
}

interface AutoEvaluationResponse {
  total: number
  overrides: number
  tauxGlobal: number | null
  parSource: OverrideParSource[]
  parNiveau: OverrideParNiveau[]
}

const VOLATILITE_LABEL: Record<PatternArticle['volatilite'], string> = {
  haute: 'Volatile',
  moyenne: 'Moyen',
  basse: 'Stable',
}

/**
 * Alphabet de volatilité — trois canaux, dont deux non chromatiques : la forme
 * de l'icône, la barre de bord de la rangée, et la couleur qui les double.
 * La pastille pleine d'origine ne codait QUE la couleur.
 */
const VOLATILITE_ICON: Record<PatternArticle['volatilite'], LucideIcon> = {
  haute: TriangleAlert,
  moyenne: Waves,
  basse: Minus,
}
const VOLATILITE_TEXT: Record<PatternArticle['volatilite'], string> = {
  haute: 'text-destructive',
  moyenne: 'text-suggere',
  basse: 'text-muted-foreground',
}
const VOLATILITE_TONE: Record<PatternArticle['volatilite'], RowTone> = {
  haute: 'critical',
  moyenne: 'warning',
  basse: null,
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
const VERDICT_META: Record<
  ApproTriage['verdict'],
  { label: string; icon: LucideIcon; cls: string }
> = {
  passer: { label: 'Passer', icon: CircleCheck, cls: 'text-suggere' },
  replanifier: { label: 'Replanifier', icon: CalendarClock, cls: 'text-suggere' },
  regrouper: { label: 'Regrouper', icon: Layers, cls: 'text-muted-foreground' },
  surveiller: { label: 'Surveiller', icon: Eye, cls: 'text-muted-foreground' },
  investiguer: { label: 'Investiguer', icon: TriangleAlert, cls: 'text-destructive' },
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

function echeanceRelative(jours: number | null): { relative: string; tone: RowTone } {
  if (jours === null) return { relative: 'sans date', tone: null }
  if (jours < 0) return { relative: `Retard ${-jours} j`, tone: 'critical' }
  if (jours <= 21) return { relative: `Dans ${jours} j`, tone: 'warning' }
  return { relative: `Dans ${jours} j`, tone: null }
}

function VerdictChip({ triage }: { triage: ApproTriage | null }) {
  if (triage === null) return null
  const meta = VERDICT_META[triage.verdict]
  return <CellVerdict icon={meta.icon} label={meta.label} tone={meta.cls} />
}

function UrgenceChip({ nbRetard, nbUrgents }: { nbRetard: number; nbUrgents: number }) {
  if (nbRetard > 0) {
    return <Badge variant="destructive">{nbRetard} en retard</Badge>
  }
  if (nbUrgents > 0) {
    return <Badge variant="warning">{nbUrgents} sous 21 j</Badge>
  }
  return <Badge variant="secondary">rien d’urgent</Badge>
}

/** Micro-segment de décision (Vu / Ignorer / À passer) — actif = encre
 *  pleine, Rausch reste hors de la maille ligne. */
function DecisionControl({
  actuelle,
  etatEnvoi,
  onDecide,
  desactivee = false,
}: {
  actuelle: DecisionStatut | null
  etatEnvoi: EtatEnvoi
  onDecide: (statut: DecisionStatut) => void
  /** Blocage hors envoi : explications de la fenêtre active pas encore là. */
  desactivee?: boolean
}) {
  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <div className="flex flex-wrap justify-end gap-1">
        {DECISION_ACTIONS.map((statut) => (
          <Pill
            key={statut}
            size="sm"
            variant={actuelle === statut ? 'outline' : 'ghost'}
            disabled={etatEnvoi === 'en-cours' || desactivee}
            aria-pressed={actuelle === statut}
            onClick={() => onDecide(statut)}
            className={cn(
              'h-6 px-2 text-[10px]',
              actuelle === statut &&
                'border-foreground bg-foreground text-background hover:border-foreground hover:text-background'
            )}
          >
            {DECISION_LABEL[statut]}
          </Pill>
        ))}
      </div>
      {/* Un POST refusé ne doit pas être muet : l'acheteur croirait avoir décidé. */}
      {etatEnvoi === 'echec' && (
        <span role="status" className="text-[10px] font-semibold text-destructive">
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

/**
 * Contexte historique d'un article (#138 lot 2, § 2.4) : ce que les patterns de
 * la fenêtre disent de lui. Rendu seulement s'il apporte quelque chose — un
 * article vu une fois, sans source dominante, n'a pas d'histoire à raconter.
 */
function ContexteHistorique({ pattern }: { pattern: PatternArticle | undefined }) {
  if (pattern === undefined) return null
  if (pattern.nbMessages <= 1 && pattern.sourceDominante === null) return null
  return (
    <div className="text-[10.5px] text-muted-foreground">
      Historique : {pattern.nbMessages} message{pattern.nbMessages > 1 ? 's' : ''} sur{' '}
      {pattern.joursSousMessage} jour{pattern.joursSousMessage > 1 ? 's' : ''} de photos
      {pattern.sourceDominante !== null &&
        ` · corrélation dominante ${pattern.sourceDominante}${
          pattern.partSourceDominante === null
            ? ''
            : ` (${Math.round(pattern.partSourceDominante * 100)} % sur ${pattern.diffsExpliques} diff${
                pattern.diffsExpliques > 1 ? 's' : ''
              })`
        }`}
      {pattern.volatilite === 'haute' && ' · article volatil, bruit structurel'}
    </div>
  )
}

function ExplanationBlock({
  explications,
  patternsParArticle,
}: {
  explications: CbnExplanation[]
  patternsParArticle?: Map<string, PatternArticle>
}) {
  if (explications.length === 0) return null
  return (
    <div className="mt-2 rounded-md border border-border bg-secondary/40 px-3 py-2">
      {explications.map((exp) => (
        <div key={exp.cle} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]',
                exp.natureMessage === 'apparue' && 'bg-destructive/10 text-destructive',
                exp.natureMessage === 'disparue' && 'bg-muted text-muted-foreground',
                exp.natureMessage === 'intensifiee' && 'bg-destructive/10 text-destructive',
                exp.natureMessage === 'attenuee' && 'bg-suggere/15 text-suggere',
                exp.natureMessage === 'modifiee' && 'bg-suggere/15 text-suggere',
                !['apparue', 'disparue', 'intensifiee', 'attenuee', 'modifiee'].includes(
                  exp.natureMessage
                ) && 'bg-muted text-muted-foreground'
              )}
            >
              {NATURE_DIFF_LABEL[exp.natureMessage] ?? exp.natureMessage}
            </span>
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {exp.article} · {exp.cle}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]',
                NIVEAU_META[exp.niveau]?.cls ?? 'bg-muted text-muted-foreground'
              )}
            >
              {NIVEAU_META[exp.niveau]?.label ?? exp.niveau}
            </span>
          </div>
          {exp.correlations.length > 0 ? (
            <>
              {/* La synthèse n'est rendue que dans cette branche : pour un
                  « non expliqué » elle est déjà le texte du repli ci-dessous,
                  la rendre deux fois doublerait l'information. */}
              <div className="text-[11px] font-medium text-foreground">{exp.synthese}</div>
              <ul className="space-y-0.5">
                {exp.correlations.map((c, i) => {
                  const meta = NIVEAU_META[exp.niveau]
                  const largeur = Math.round((c.part ?? 0) * 100)
                  return (
                    <li key={i} className="text-[11px] leading-snug">
                      <div className="flex items-baseline gap-1.5">
                        <Info size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                        <span>
                          <span className="font-semibold">{c.source}</span> — {c.detail}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 pl-[18px]">
                        {/* Barre de part : poids normalisé de la corrélation dans
                            l'explication (lot 2). */}
                        <span className="h-1 w-24 overflow-hidden rounded-full bg-border">
                          <span
                            className={cn(
                              'block h-full rounded-full',
                              meta?.bar ?? 'bg-muted-foreground'
                            )}
                            style={{ width: `${Math.max(4, Math.min(100, largeur))}%` }}
                          />
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {largeur} % · confiance {Math.round((c.confiance ?? 0) * 100)} %
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <div className="text-[11px] italic text-muted-foreground">
              {exp.synthese ?? 'Non expliqué'}
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
          <ContexteHistorique pattern={patternsParArticle?.get(exp.article)} />
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
  onExplain,
  explications,
  patternsParArticle,
  explicationsEnChargement = false,
}: {
  item: ApproItem
  decisionActuelle: DecisionStatut | null
  /** État du dernier POST de décision sur cette ligne. */
  etatEnvoi: EtatEnvoi
  onDecide: (statut: DecisionStatut) => void
  onExplain?: () => void
  explications?: CbnExplanation[]
  patternsParArticle?: Map<string, PatternArticle>
  /** Vrai pendant un re-fetch des explications (changement de fenêtre). Les
   *  décisions de MESSAGE sont alors bloquées : figer une prédiction de J-1
   *  sous la fenêtre J-7, ou à null avant le premier chargement, corromprait
   *  l'auto-évaluation sans recours possible (revue lot 2). */
  explicationsEnChargement?: boolean
}) {
  const meta = item.message === null ? null : MESSAGE_META[item.message]
  const Icon = meta?.icon ?? ShoppingCart
  const preuve = item.triage?.preuves[0]
  /* Vu / Ignorer = traité : la ligne s'efface. À passer reste à pleine
     encre — la commande n'est pas encore posée dans X3. */
  const traitee =
    decisionActuelle === 'vu' || decisionActuelle === 'ignorer' || etatEnvoi === 'en-cours'
  const decisionsBloquees = item.nature === 'message' && explicationsEnChargement
  const cliquable = item.nature === 'message' && onExplain !== undefined
  const echeance = echeanceRelative(item.jours)
  const rowTone: RowTone = echeance.tone
  return (
    <>
      <TableRow
        clickable={cliquable}
        tone={rowTone}
        onClick={cliquable ? onExplain : undefined}
        title={cliquable ? 'Voir l’explication CBN — clic pour ouvrir le drawer' : undefined}
        className={cn(traitee && 'opacity-55')}
      >
        <TableCell>
          <div className="flex flex-col gap-1">
            <CellVerdict
              icon={Icon}
              label={meta === null ? 'À commander' : meta.label}
              tone={meta?.cls ?? 'text-muted-foreground'}
            />
            <VerdictChip triage={item.triage} />
          </div>
        </TableCell>
        <TableCell>
          <CellStack code={item.article} label={item.designation} />
          {preuve !== undefined && <CellEvidence title={preuve}>{preuve}</CellEvidence>}
          {item.nature === 'suggestion' &&
            (item.delaiReappro === null ? (
              <CellEvidence tone="critical">
                délai de réappro non renseigné — repli 14 j
              </CellEvidence>
            ) : (
              <CellEvidence>délai de réappro {item.delaiReappro} j</CellEvidence>
            ))}
        </TableCell>
        <TableCell align="right">
          <CellNumber value={qte(item.quantite)} />
        </TableCell>
        <TableCell>
          <CellDate date={fr(item.echeance)} relative={echeance.relative} tone={echeance.tone} />
          {item.dateProposee !== null && (
            <CellEvidence>
              → {fr(item.dateProposee)}
              {item.decalage === null ? '' : ` (${item.decalage > 0 ? '+' : ''}${item.decalage} j)`}
            </CellEvidence>
          )}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col items-start gap-1.5 md:items-end">
            <DecisionControl
              actuelle={decisionActuelle}
              etatEnvoi={etatEnvoi}
              onDecide={onDecide}
              desactivee={decisionsBloquees}
            />
            {cliquable && (
              <Pill
                variant="outline"
                size="sm"
                onClick={onExplain}
                className="h-6 px-2 text-[10px]"
              >
                Expliquer <ChevronRight size={10} />
              </Pill>
            )}
          </div>
        </TableCell>
      </TableRow>
      {item.nature === 'message' && explications !== undefined && explications.length > 0 && (
        <TableRow>
          <TableCell colSpan={5}>
            <ExplanationBlock explications={explications} patternsParArticle={patternsParArticle} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function ItemsHead() {
  return (
    <TableHeadRow>
      <TableHead>Nature</TableHead>
      <TableHead>Article</TableHead>
      <TableHead align="right" className="text-right!">
        Qté
      </TableHead>
      <TableHead>Échéance</TableHead>
      <TableHead>Décision</TableHead>
    </TableHeadRow>
  )
}

/** En-tête de section d'une feuille : libellé uppercase + compteur de lignes. */
function SectionLabel({ label, nb }: { label: string; nb: number }) {
  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-1">
      <span className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[10px] font-semibold tabular-nums text-muted-foreground/70">
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
  onExplain,
  explicationsParCle,
  patternsParArticle,
  explicationsEnChargement = false,
}: {
  vue: FeuilleVue
  decisions: Record<string, DecisionStatut>
  envois: Record<string, EtatEnvoi>
  onDecide: (item: ApproItem, statut: DecisionStatut) => void
  onExplain?: (item: ApproItem) => void
  explicationsParCle?: Map<string, CbnExplanation[]>
  patternsParArticle?: Map<string, PatternArticle>
  explicationsEnChargement?: boolean
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
        onExplain={onExplain ? () => onExplain(item) : undefined}
        explications={explicationsPour(explicationsParCle, item)}
        patternsParArticle={patternsParArticle}
        explicationsEnChargement={explicationsEnChargement}
      />
    ))
  return (
    <Card className="gap-0 overflow-hidden hover:shadow-none">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight">{dossier.nom}</h2>
          <p className="mt-0.5 text-1.5xs text-muted-foreground">
            code <span className="font-mono">{dossier.fournisseur || '—'}</span>
            {' · '}
            <span className="font-mono font-bold tabular-nums text-foreground">
              {dossier.nbArticles}
            </span>{' '}
            article
            {dossier.nbArticles > 1 ? 's' : ''}
            {suggestions.length > 0 && (
              <>
                {' · '}
                <span className="font-mono font-bold tabular-nums text-foreground">
                  {suggestions.length}
                </span>{' '}
                à commander
              </>
            )}
            {messages.length > 0 && (
              <>
                {' · '}
                <span className="font-mono font-bold tabular-nums text-foreground">
                  {messages.length}
                </span>{' '}
                à replanifier
              </>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Première échéance
          </div>
          <div className="mt-0.5">
            <CellNumber value={fr(dossier.premiereEcheance)} />
          </div>
        </div>
        <UrgenceChip nbRetard={vue.nbRetard} nbUrgents={vue.nbUrgents} />
      </header>

      <div className="border-t border-border">
        {suggestions.length > 0 && (
          <section>
            <SectionLabel label="À commander" nb={suggestions.length} />
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <ItemsHead />
              </thead>
              <tbody>{renderRows(suggestions)}</tbody>
            </table>
          </section>
        )}
        {messages.length > 0 && (
          <section className={cn(suggestions.length > 0 && 'border-t border-border')}>
            <SectionLabel label="À replanifier" nb={messages.length} />
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <ItemsHead />
              </thead>
              <tbody>{renderRows(messages)}</tbody>
            </table>
          </section>
        )}
      </div>

      {/* La progression fait partie du document : c'est elle qui vide la pile. */}
      <CardFooter className="justify-between border-t border-border bg-secondary/50 px-5 py-2">
        <span className="text-[10.5px] text-muted-foreground">
          Décisions{' '}
          <span className="font-mono font-bold tabular-nums text-foreground">
            {vue.nbDecidees}/{nbItems}
          </span>{' '}
          enregistrées
        </span>
        {vue.minJoursADecider !== null && vue.minJoursADecider < 0 && (
          <span className="text-[10.5px] font-semibold text-destructive">
            échéance dépassée — à traiter
          </span>
        )}
      </CardFooter>
    </Card>
  )
}

/** Index des dossiers entièrement décidés — une ligne repliable par dossier. */
function DossiersTraités({
  vues,
  decisions,
  envois,
  onDecide,
  onExplain,
  explicationsParCle,
  patternsParArticle,
  explicationsEnChargement = false,
}: {
  vues: FeuilleVue[]
  decisions: Record<string, DecisionStatut>
  envois: Record<string, EtatEnvoi>
  onDecide: (item: ApproItem, fournisseur: string, statut: DecisionStatut) => void
  onExplain?: (item: ApproItem) => void
  explicationsParCle?: Map<string, CbnExplanation[]>
  patternsParArticle?: Map<string, PatternArticle>
  explicationsEnChargement?: boolean
}) {
  if (vues.length === 0) return null
  return (
    <div className="mt-8">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Dossiers traités
        </h2>
        <span className="font-mono text-[10px] font-semibold tabular-nums text-muted-foreground/70">
          {vues.length}
        </span>
      </div>
      <Card className="gap-0 overflow-hidden hover:shadow-none">
        {vues.map((vue, i) => {
          const items = [...vue.suggestions, ...vue.messages]
          const nb = items.length
          return (
            <details
              key={vue.dossier.fournisseur || '∅'}
              className={cn('group', i > 0 && 'border-t border-border')}
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-2.5 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  size={14}
                  strokeWidth={2}
                  className="shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                  {vue.dossier.nom}
                </span>
                <span className="hidden text-1.5xs whitespace-nowrap text-muted-foreground sm:inline">
                  <span className="font-mono font-bold tabular-nums text-foreground">{nb}</span>{' '}
                  ligne
                  {nb > 1 ? 's' : ''} · première échéance {fr(vue.dossier.premiereEcheance)}
                </span>
                <Badge variant="secondary">
                  {vue.nbDecidees}/{nb} décidées
                </Badge>
              </summary>
              <table className="w-full border-collapse border-t border-border text-left text-sm">
                <thead>
                  <ItemsHead />
                </thead>
                <tbody>
                  {items.map((item) => (
                    <ItemRow
                      key={cleAffichage(item)}
                      item={item}
                      decisionActuelle={decisions[item.cle] ?? item.decision?.statut ?? null}
                      etatEnvoi={envois[item.cle] ?? 'inerte'}
                      onDecide={(statut) => onDecide(item, vue.dossier.fournisseur, statut)}
                      onExplain={onExplain ? () => onExplain(item) : undefined}
                      explications={explicationsPour(explicationsParCle, item)}
                      patternsParArticle={patternsParArticle}
                      explicationsEnChargement={explicationsEnChargement}
                    />
                  ))}
                </tbody>
              </table>
            </details>
          )
        })}
      </Card>
    </div>
  )
}

/** Barre de part d'une source dans l'auto-évaluation (lot 2). */
function TauxBar({ taux }: { taux: number | null }) {
  if (taux === null) return <span className="font-mono text-[10px] text-muted-foreground">—</span>
  const pct = Math.round(taux * 100)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1 w-16 overflow-hidden rounded-full bg-border">
        <span
          className={cn(
            'block h-full rounded-full',
            pct >= 50 ? 'bg-destructive' : pct >= 25 ? 'bg-suggere' : 'bg-ferme'
          )}
          style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
        />
      </span>
      <span className="font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">
        {pct} %
      </span>
    </span>
  )
}

function TendancesCard({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <Card className="gap-0 overflow-hidden hover:shadow-none">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="text-1.5xs text-muted-foreground">{hint}</p>
      </header>
      {children}
    </Card>
  )
}

/**
 * Onglet « Tendances » (#138 lot 2) : patterns émergents (articles volatils,
 * fournisseurs à réceptions glissées) et auto-évaluation du moteur par source
 * prédite. Lecture seule — aucun appel X3, tout vient des photos et du ledger.
 */
function TendancesPanel({
  patterns,
  autoEval,
}: {
  patterns: PatternsResponse | null
  autoEval: AutoEvaluationResponse | null
}) {
  const qualite = patterns?.qualite
  return (
    <div className="space-y-4">
      <TendancesCard
        title="Qualité des explications"
        hint="Mesurée sur le diff le plus récent de la fenêtre — les critères d'acceptation du lot 2, pas une promesse."
      >
        {qualite === undefined || qualite.messages === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">
            {patterns?.message ?? 'Aucun message à mesurer sur la fenêtre.'}
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 text-xs">
            <span>
              <span className="font-mono font-bold tabular-nums text-foreground">
                {qualite.messages}
              </span>{' '}
              message
              {qualite.messages > 1 ? 's' : ''} expliqué{qualite.messages > 1 ? 's' : ''}
            </span>
            <span>
              non expliqués{' '}
              <span className="font-mono font-bold tabular-nums text-foreground">
                {qualite.nonExpliques}
                {qualite.tauxNonExplique !== null &&
                  ` (${Math.round(qualite.tauxNonExplique * 100)} %)`}
              </span>
            </span>
            {qualite.couvertureMoyenne !== null && (
              <span>
                couverture moyenne{' '}
                <span className="font-mono font-bold tabular-nums text-foreground">
                  {Math.round(qualite.couvertureMoyenne * 100)} %
                </span>
              </span>
            )}
            {qualite.residuMoyen !== null && (
              <span>
                variation inexpliquée{' '}
                <span className="font-mono font-bold tabular-nums text-foreground">
                  {Math.round(qualite.residuMoyen * 100)} %
                </span>
              </span>
            )}
          </div>
        )}
      </TendancesCard>

      <TendancesCard
        title="Auto-évaluation du moteur"
        hint="Taux d'override du ledger par source prédite — le signal d'une règle fausse ou d'un master data pourri (#106). Corrélations, jamais « causes »."
      >
        {autoEval === null ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">
            Aucune décision enregistrée avec source prédite — l'auto-évaluation se remplit quand
            l'acheteur décide des lignes expliquées.
          </div>
        ) : (
          <div className="px-5 py-4">
            <div className="mb-3 flex flex-wrap gap-4 text-xs">
              <span>
                <span className="font-mono font-bold tabular-nums text-foreground">
                  {autoEval.total}
                </span>{' '}
                décision
                {autoEval.total > 1 ? 's' : ''} analysée
                {autoEval.total > 1 ? 's' : ''}
              </span>
              <span>
                <span className="font-mono font-bold tabular-nums text-foreground">
                  {autoEval.overrides}
                </span>{' '}
                override{autoEval.overrides > 1 ? 's' : ''}
              </span>
              {autoEval.tauxGlobal !== null && (
                <span>
                  taux global{' '}
                  <span className="font-mono font-bold tabular-nums text-foreground">
                    {Math.round(autoEval.tauxGlobal * 100)} %
                  </span>
                </span>
              )}
            </div>
            {autoEval.parSource.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Aucune source prédite agrégée pour l'instant.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <TableHeadRow>
                    <TableHead>Source</TableHead>
                    <TableHead align="right" className="text-right!">
                      Décisions
                    </TableHead>
                    <TableHead align="right" className="text-right!">
                      Overrides
                    </TableHead>
                    <TableHead>Taux</TableHead>
                    <TableHead
                      align="right"
                      className="text-right!"
                      title="Part des décisions « à passer »"
                    >
                      Concordance
                    </TableHead>
                  </TableHeadRow>
                </thead>
                <tbody>
                  {autoEval.parSource.map((c) => (
                    <TableRow key={c.source}>
                      <TableCell>
                        <CellStack code={c.source} />
                      </TableCell>
                      <TableCell align="right">
                        <CellNumber value={c.total} />
                      </TableCell>
                      <TableCell align="right">
                        <CellNumber value={c.overrides} emphasis="plain" />
                      </TableCell>
                      <TableCell>
                        <TauxBar taux={c.taux} />
                      </TableCell>
                      <TableCell align="right">
                        <CellNumber
                          value={
                            c.concordance === null ? '—' : `${Math.round(c.concordance * 100)} %`
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </table>
            )}
            {autoEval.parNiveau.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Par niveau affiché
                </h3>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  {autoEval.parNiveau.map((n) => (
                    <span key={n.niveau} className="inline-flex items-center gap-1.5">
                      {NIVEAU_META[n.niveau as CbnNiveau]?.label ?? n.niveau} ·{' '}
                      <span className="font-mono font-bold tabular-nums text-foreground">
                        {n.total}
                      </span>
                      <TauxBar taux={n.taux} />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </TendancesCard>

      <TendancesCard
        title="Articles volatils"
        hint="Fréquence de messages sur la fenêtre — le bruit structurel qu'il faut signaler plutôt que laisser encombrer la file."
      >
        {patterns === null || patterns.apres === null ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">
            {patterns?.message ??
              'Historique insuffisant — les patterns demandent au moins deux photos.'}
          </div>
        ) : patterns.articles.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">
            Aucun message sur la fenêtre {fr(patterns.avant)} → {fr(patterns.apres)}.
          </div>
        ) : (
          <div className="px-5 py-4">
            <p className="mb-3 text-1.5xs text-muted-foreground">
              Fenêtre {fr(patterns.avant)} → {fr(patterns.apres)} · {patterns.joursCouverts} jour
              {patterns.joursCouverts > 1 ? 's' : ''} couvert{patterns.joursCouverts > 1 ? 's' : ''}{' '}
              sur {patterns.fenetreJours} demandés · {patterns.diffsAnalyses} diff
              {patterns.diffsAnalyses > 1 ? 's' : ''} analysé
              {patterns.diffsAnalyses > 1 ? 's' : ''} pour la dominance. Un message qui dure compte
              une fois.
            </p>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <TableHeadRow>
                  <TableHead>Article</TableHead>
                  <TableHead>Volatilité</TableHead>
                  <TableHead align="right" className="text-right!">
                    Messages
                  </TableHead>
                  <TableHead align="right" className="text-right!">
                    Jours
                  </TableHead>
                  <TableHead align="right" className="text-right!">
                    /semaine
                  </TableHead>
                  <TableHead>Source dominante</TableHead>
                </TableHeadRow>
              </thead>
              <tbody>
                {patterns.articles.slice(0, 20).map((a) => (
                  // La volatilité EST la gravité de la ligne : elle se lit au bord
                  // gauche, la colonne ne fait que la nommer.
                  <TableRow key={a.article} tone={VOLATILITE_TONE[a.volatilite]}>
                    <TableCell>
                      <CellStack code={a.article} />
                    </TableCell>
                    <TableCell>
                      <CellVerdict
                        icon={VOLATILITE_ICON[a.volatilite]}
                        label={VOLATILITE_LABEL[a.volatilite]}
                        tone={VOLATILITE_TEXT[a.volatilite]}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <CellNumber value={a.nbMessages} />
                    </TableCell>
                    <TableCell align="right">
                      <CellNumber value={a.joursSousMessage} emphasis="plain" />
                    </TableCell>
                    <TableCell align="right">
                      <CellNumber value={a.messagesSemaine} emphasis="plain" />
                    </TableCell>
                    <TableCell>
                      {a.sourceDominante === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <CellStack
                          code={a.sourceDominante}
                          label={
                            a.partSourceDominante !== null
                              ? `${Math.round(a.partSourceDominante * 100)} % · ${a.diffsExpliques} diff${a.diffsExpliques > 1 ? 's' : ''}`
                              : undefined
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TendancesCard>

      <TendancesCard
        title="Fournisseurs à surveiller"
        hint="Part des messages liés à des réceptions glissées — un signal fournisseur, pas un signal CBN."
      >
        {patterns === null || patterns.apres === null ? (
          // Même cause, même phrase que la section au-dessus : dire « aucun
          // fournisseur » quand l'historique manque était une contradiction
          // avec le bloc « Articles volatils » sur le même écran.
          <div className="px-5 py-6 text-sm text-muted-foreground">
            {patterns?.message ??
              'Historique insuffisant — les patterns demandent au moins deux photos.'}
          </div>
        ) : patterns.fournisseurs.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">
            Aucun fournisseur avec messages sur la fenêtre {fr(patterns.avant)} →{' '}
            {fr(patterns.apres)}.
          </div>
        ) : (
          <div className="px-5 py-4">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <TableHeadRow>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead align="right" className="text-right!">
                    Messages
                  </TableHead>
                  <TableHead>Part réceptions glissées</TableHead>
                </TableHeadRow>
              </thead>
              <tbody>
                {patterns.fournisseurs.slice(0, 20).map((f) => (
                  <TableRow key={f.fournisseur}>
                    <TableCell>
                      <CellStack code={f.fournisseur} />
                    </TableCell>
                    <TableCell align="right">
                      <CellNumber value={f.nbMessages} />
                    </TableCell>
                    <TableCell>
                      <TauxBar taux={f.partReceptionsGlissees} />
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TendancesCard>
    </div>
  )
}

export default function Approvisionnements({ horizon, rowsHref }: PageProps) {
  const { data, loading, error } = useTimedFetch<ApproResponse>(rowsHref)
  // Lot 2 : fenêtre de comparaison des explications (J-1 / J-7 / J-30). La
  // fenêtre pilote l'URL de fetch : changer de fenêtre relance le fetch, et
  // l'explication affichée correspond aux dates réelles des photos (trous
  // week-ends/pannes gérés côté serveur, `photosMessagesFenetre`).
  const [fenetre, setFenetre] = useState<number>(1)
  // Ancien moteur retiré ticket 07 — fetches désactivés pour stopper les 404.
  // Le drawer article-explanation (02+04+05) est désormais la seule explication.
  const explicationsHref: string | null = null
  const { data: explData, loading: explLoading } =
    useTimedFetch<ExplanationsResponse>(explicationsHref)
  // La fenêtre qui a produit les explications actuellement en main. `useTimedFetch`
  // GARDE la donnée précédente pendant un re-fetch : sans cette référence, une
  // décision prise juste après un changement de fenêtre figerait la prédiction
  // de J-1 sous la fenêtre J-7, et une décision prise avant le premier
  // chargement figerait des prédictions à null — irrécupérables dans le ledger
  // (revue lot 2). Tant que la réponse de la fenêtre active n'est pas là, les
  // explications sont considérées absentes et les décisions de message bloquées.
  const fenetreExplRef = useRef<number>(fenetre)
  useEffect(() => {
    if (!explLoading && explData !== null) fenetreExplRef.current = fenetre
  }, [explLoading, explData, fenetre])
  const explicationsValides =
    !explLoading && explData !== null && fenetreExplRef.current === fenetre
  // Lot 2 : patterns émergents sur 21 jours (3 semaines de maturation). Chargés
  // dans les DEUX vues, parce que le contexte historique d'un article
  // (« 7 messages sur 12 jours de photos, corrélation dominante stock ») se lit
  // sous l'explication de la ligne, pas seulement dans l'onglet Tendances. Un
  // seul appel : le serveur le sert depuis le cache des photos.
  const [vue, setVue] = useState<'feuilles' | 'tendances'>('feuilles')
  // Ancien moteur retiré — patterns/auto-evaluation désactivés (404 stoppés)
  const { data: patternsData } = useTimedFetch<PatternsResponse>(null)
  const autoEvalHref: string | null = null
  const { data: autoEvalData } = useTimedFetch<AutoEvaluationResponse>(autoEvalHref)
  const patternsParArticle = useMemo(() => {
    if (patternsData === null || patternsData.articles.length === 0) return undefined
    const m = new Map<string, PatternArticle>()
    for (const a of patternsData.articles) m.set(a.article, a)
    return m
  }, [patternsData])
  const explicationsParCle = useMemo(() => {
    if (!explicationsValides || !explData.explications || explData.explications.length === 0)
      return undefined
    const m = new Map<string, CbnExplanation[]>()
    for (const e of explData.explications) {
      const list = m.get(e.cle)
      if (list === undefined) m.set(e.cle, [e])
      else list.push(e)
    }
    return m
  }, [explicationsValides, explData])
  const maturationInfo =
    explData && explData.avant === null && explData.apres === null ? explData.message : null
  // Un message DISPARU n'existe plus dans X3, donc plus dans la file : son
  // explication est juste mais aucune ligne ne peut la porter. Les compter
  // comme « analysés » promettait des explications introuvables à l'écran ;
  // annoncés comme soldés, ils disent quelque chose d'utile à l'acheteur.
  const nbSoldes = explData?.explications.filter((e) => e.natureMessage === 'disparue').length ?? 0
  const [filtre, setFiltre] = useState<Filtre>(null)
  const [filtreExpl, setFiltreExpl] = useState(false)
  // Décisions locales (ledger #134) — priorité sur le payload au re-rendu.
  const [decisions, setDecisions] = useState<Record<string, DecisionStatut>>({})
  // État du POST par ligne : un envoi refusé doit se voir, sans quoi l'acheteur
  // repart en croyant avoir décidé — et le ledger étant append-only, chaque
  // nouvel essai qui passe écrit une ligne de plus.
  const [envois, setEnvois] = useState<Record<string, EtatEnvoi>>({})
  // Drawer d'explication CBN (ticket 03) — grille time-phased + pegging WIPTYP=6.
  const [explainSelection, setExplainSelection] = useState<{
    article: string
    cle: string
    message: number | null
  } | null>(null)
  const [explainOpen, setExplainOpen] = useState(false)
  const handleExplain = (item: ApproItem) => {
    if (item.cleSnapshot === null) return
    setExplainSelection({ article: item.article, cle: item.cleSnapshot, message: item.message })
    setExplainOpen(true)
  }

  /** POST d'une décision — append-only côté serveur, mise à jour locale immédiate. */
  const poster = async (item: ApproItem, fournisseur: string, statut: DecisionStatut) => {
    // Lot 2 : figer ce que le moteur disait au moment de la décision — la
    // source dominante, sa confiance et le verdict du triage — pour
    // l'auto-évaluation (`cause_predit` etc.). Récupéré depuis l'explication
    // de CETTE ligne (`cleSnapshot`), jamais une autre.
    const explications = explicationsPour(explicationsParCle, item)
    const explication = explications?.[0]
    const principale = explication?.correlations[0]
    const predits =
      item.nature === 'message' && explication !== undefined && principale !== undefined
        ? {
            causePredit: principale.source,
            confiancePredit: principale.confiance,
            // Le niveau est le seul de ces champs que l'acheteur avait sous les
            // yeux en décidant — sans lui, l'auto-évaluation ne peut pas dire
            // si les explications présentées comme sûres tiennent mieux.
            niveauPredit: explication.niveau,
            verdictPredit: item.triage?.verdict ?? null,
          }
        : {}
    const body =
      item.nature === 'message'
        ? {
            nature: 'message' as const,
            statut,
            // La clé du serveur est renvoyée telle quelle : la découper ici pour
            // que le serveur la recompose, c'est deux définitions d'un format.
            cle: item.cle,
            article: item.article,
            ...predits,
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
    let dossiers = data.dossiers
    if (filtre !== null)
      dossiers = dossiers
        .map((d) => ({ ...d, items: d.items.filter((i) => i.nature === filtre) }))
        .filter((d) => d.items.length > 0)
    if (filtreExpl && explicationsParCle !== undefined) {
      const cles = new Set(explicationsParCle.keys())
      dossiers = dossiers
        .map((d) => ({
          ...d,
          items: d.items.filter((i) => i.cleSnapshot !== null && cles.has(i.cleSnapshot)),
        }))
        .filter((d) => d.items.length > 0)
    }
    return dossiers
  }, [data, filtre, filtreExpl, explicationsParCle])

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

  /** Nombre de messages sur la page qui ont réellement une explication
   *  corrélée (jointure sur cleSnapshot). Évite d'annoncer « 4 messages sur
   *  cette page » quand aucun des 4 n'est dans les dossiers affichés. */
  const nbExplSurPage = useMemo(() => {
    if (data === null || explicationsParCle === undefined) return 0
    const clesPage = new Set<string>()
    for (const d of dossiersFiltres)
      for (const i of d.items) if (i.cleSnapshot !== null) clesPage.add(i.cleSnapshot)
    let nb = 0
    for (const cles of explicationsParCle.values())
      if (cles[0] && cles[0].natureMessage !== 'disparue')
        for (const c of cles)
          if (clesPage.has(c.cle)) {
            nb++
            break
          }
    return nb
  }, [data, dossiersFiltres, explicationsParCle])

  const stats = data?.stats

  const refreshHref =
    horizon === null ? '/approvisionnements' : `/approvisionnements?horizon=${horizon}`

  /* RefreshPill prenait `href` (Inertia <Link>). ToolbarRefresh n'expose que
     `onClick` : même GET, même URL, pas de preserveState (le Link n'en avait pas). */
  const refresh = () => {
    router.visit(refreshHref)
  }

  const activeFilterCount =
    (filtre !== null ? 1 : 0) +
    (vue === 'feuilles' && filtreExpl ? 1 : 0) +
    (vue === 'feuilles' && fenetre !== 1 ? 1 : 0)

  /* Barre d'outils (standard §18). Pas de conteneur `<Toolbar>` : AppLayout
     pose déjà `data-slot="toolbar-row"`. Zone 03 : pas de recherche. */
  const toolbar = (
    <>
      <ToolbarGroup>
        <ToolbarSegmented semantics="tabs" aria-label="Vue">
          <ToolbarSegment
            active={vue === 'feuilles'}
            onClick={() => setVue('feuilles')}
            title="Feuilles de préparation fournisseur"
          >
            Feuilles
          </ToolbarSegment>
          <ToolbarSegment
            active={vue === 'tendances'}
            onClick={() => setVue('tendances')}
            title="Patterns émergents et auto-évaluation (#138 lot 2)"
          >
            Tendances
          </ToolbarSegment>
        </ToolbarSegmented>

        <ToolbarSegmented semantics="tabs" aria-label="Horizon">
          {HORIZONS.map((h) => (
            <ToolbarSegment
              key={h.label}
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
            </ToolbarSegment>
          ))}
        </ToolbarSegmented>

        <ToolbarFilterMenu activeCount={activeFilterCount} width={300}>
          <ToolbarFilterSection>Nature</ToolbarFilterSection>
          <ToolbarSegmented semantics="tabs" flat className="w-full flex-wrap">
            <ToolbarFilterChip
              label="Tout"
              count={stats?.nbItems ?? 0}
              tone="neutral"
              active={filtre === null}
              onClick={() => setFiltre(null)}
              title="Tout"
            />
            <ToolbarFilterChip
              label="À commander"
              count={stats?.nbSuggestions ?? 0}
              tone="ok"
              active={filtre === 'suggestion'}
              onClick={() => setFiltre('suggestion')}
              title="À commander"
            />
            <ToolbarFilterChip
              label="À replanifier"
              count={stats?.nbMessages ?? 0}
              tone="warning"
              active={filtre === 'message'}
              onClick={() => setFiltre('message')}
              title="À replanifier"
            />
          </ToolbarSegmented>

          {vue === 'feuilles' && nbExplSurPage > 0 && (
            <>
              <Separator className="my-2" />
              <ToolbarFilterSection>Explications</ToolbarFilterSection>
              <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
                <ToolbarFilterChip
                  label="Expliqués"
                  count={nbExplSurPage}
                  tone="ok"
                  active={filtreExpl}
                  onClick={() => setFiltreExpl(!filtreExpl)}
                  title="Ne montrer que les lignes avec une explication corrélée"
                />
              </ToolbarSegmented>
            </>
          )}

          {vue === 'feuilles' && (
            <>
              <Separator className="my-2" />
              <ToolbarFilterSection>Comparaison</ToolbarFilterSection>
              <ToolbarSegmented semantics="tabs" flat className="w-full flex-wrap">
                {(
                  [
                    [1, 'J-1'],
                    [7, 'J-7'],
                    [30, 'J-30'],
                  ] as Array<[number, string]>
                ).map(([val, label]) => (
                  <ToolbarFilterChip
                    key={val}
                    label={label}
                    tone="neutral"
                    active={fenetre === val}
                    onClick={() => setFenetre(val)}
                    title={`Explications sur la fenêtre ${label} (trous week-ends/pannes tolérés)`}
                  />
                ))}
              </ToolbarSegmented>
            </>
          )}
        </ToolbarFilterMenu>
      </ToolbarGroup>

      <ToolbarSpacer />

      <ToolbarRefresh loading={loading} onClick={refresh} />
    </>
  )

  return (
    <AppLayout
      active="approvisionnements"
      title="Approvisionnements"
      subtitle="Approvisionnements · Suggestions du CBN"
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
    >
      {/* AppLayout dense rend ses children en flux bloc : ce wrapper porte la
          colonne zone scrollable (la rangée d'outils est la prop `toolbar`). */}
      <div className="flex h-full min-h-0 flex-col">
        {!loading && error !== null && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
            <span className="font-semibold">Chargement impossible :</span>
            <span className="truncate font-mono">{error.message}</span>
          </div>
        )}
        {!loading && error === null && data?.x3Error != null && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
            <span className="font-semibold">X3 n’a pas répondu :</span>
            <span className="truncate font-mono">{data.x3Error}</span>
          </div>
        )}
        {/* Champ de travail : les feuilles sur le gris `bg-secondary`. */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-secondary">
          <div className="mx-auto max-w-[1180px] px-5 py-5 md:px-6">
            {loading && <LoadingState title="Lecture du calcul des besoins X3…" />}

            {vue === 'tendances' ? (
              <TendancesPanel patterns={patternsData} autoEval={autoEvalData} />
            ) : (
              <>
                {!loading &&
                  error === null &&
                  data?.x3Error == null &&
                  actives.length === 0 &&
                  traitees.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 px-5 py-16 text-center">
                      <Inbox size={20} strokeWidth={1.75} className="text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">
                        Rien à décider sur cet horizon.
                      </p>
                    </div>
                  )}

                {maturationInfo !== null && !loading && error === null && data?.x3Error == null && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    <Info size={16} className="shrink-0" />
                    <span>
                      {maturationInfo} — historique en cours de constitution (J+2 pour
                      explications).
                    </span>
                  </div>
                )}
                {explicationsValides &&
                  explData.avant !== null &&
                  explData.apres !== null &&
                  explData.explications.length > 0 &&
                  nbExplSurPage > 0 &&
                  !loading &&
                  error === null &&
                  data?.x3Error == null && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-800">
                      <Info size={14} className="shrink-0" />
                      <span>
                        Explications corrélées {fr(explData.avant)} → {fr(explData.apres)} :{' '}
                        {nbExplSurPage} message{nbExplSurPage > 1 ? 's' : ''} expliqué
                        {nbExplSurPage > 1 ? 's' : ''} sur cette page
                        {nbSoldes > 0 && `, ${nbSoldes} soldé${nbSoldes > 1 ? 's' : ''} depuis`}
                      </span>
                    </div>
                  )}
                {!loading && error === null && data?.x3Error == null && (
                  <>
                    <div className="space-y-3">
                      {actives.map((feuille) => (
                        <Feuille
                          key={feuille.dossier.fournisseur || '∅'}
                          vue={feuille}
                          decisions={decisions}
                          envois={envois}
                          onDecide={(item, statut) =>
                            poster(item, feuille.dossier.fournisseur, statut)
                          }
                          onExplain={handleExplain}
                          explicationsParCle={explicationsParCle}
                          patternsParArticle={patternsParArticle}
                          explicationsEnChargement={!explicationsValides}
                        />
                      ))}
                    </div>
                    <DossiersTraités
                      vues={traitees}
                      decisions={decisions}
                      envois={envois}
                      onDecide={poster}
                      onExplain={handleExplain}
                      explicationsParCle={explicationsParCle}
                      patternsParArticle={patternsParArticle}
                      explicationsEnChargement={!explicationsValides}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <ArticleExplanationSheet
        article={explainSelection?.article ?? null}
        cle={explainSelection?.cle ?? null}
        messageCode={explainSelection?.message ?? null}
        open={explainOpen}
        onOpenChange={setExplainOpen}
      />
    </AppLayout>
  )
}
