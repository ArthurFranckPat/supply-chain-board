/**
 * Cockpit poste (#119, lot 3) — ce qu'un poste a réellement produit et ce qui
 * lui est promis.
 *
 * Sélecteur : la liste des postes vient de la RÉPLIQUE de pointages (6 mois
 * glissants), pas du référentiel de gammes — un poste qui a pointé mais n'est
 * plus dans les gammes reste sélectionnable. Codes `PP_\d+` seulement, égalité
 * stricte : PP_093, PP_0931 et PP_09 sont trois postes distincts.
 *
 * Le bloc « Engagement » réutilise le pipeline #46 (`loadPosteEngagement`) tel
 * quel. Le passé productif (graphes) et les anomalies arrivent aux lots 4-5.
 *
 * Coquille Inertia + JSON différé, calque /controle-prod.
 */
import { useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import { Factory, RefreshCw, TriangleAlert } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import { OfDetailSheet } from '@r/components/of/of-detail-sheet'
import { X3Link } from '@r/components/x3-link'
import { ProductionChart } from '@r/components/cockpit/production-chart'
import { HeuresCapaciteChart } from '@r/components/cockpit/heures-capacite-chart'
import {
  PILL,
  Segment,
  SegmentButton,
  ToolbarRow,
  ToolbarSpacer,
} from '@r/components/vision/toolbar'
import { moisLabel } from '@r/components/cockpit/chart-common'
import {
  fetchBoardFeasibility,
  feasibilityWindowFromDates,
} from '@r/lib/board/feasibility-map'
import type { FeasStatus } from '@r/lib/board/types'
import { route } from '@r/lib/routes'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'
import {
  fmtH,
  fmtJ,
  saturation,
  urgencyColor,
  urgencyOf,
  type EngagementRow,
} from '@r/lib/board/engagement-format'

interface PosteListItem {
  code: string
  label: string
}

interface ReplicaState {
  disponible: boolean
  raison:
    | 'disabled'
    | 'never-ingested'
    | 'last-run-failed'
    | 'env-mismatch'
    | 'dirty'
    | 'stale'
    | null
  dernierRunIso: string | null
}

interface PostesPayload {
  postes: PosteListItem[]
  defaut: string | null
  fenetre: { fromIso: string; toIso: string }
  replica: ReplicaState
}

interface PosteInfo {
  code: string
  label: string
  atelier: string
  atelierLabel: string
  capaciteHebdoHeures: number | null
  regimeHebdo: number[] | null
  dernierPointageIso: string | null
}

interface MailleProduction {
  date: string
  qty: number
  heures: number
  dontHeuresReglage: number
}

interface PalettesMaille {
  date: string
  /** null = absence de coefficient palette, pas zéro (#119). */
  palettes: number | null
}

interface OfTermine {
  numOf: string
  article: string | null
  designation: string | null
  qty: number
  heures: number
  dernierJourIso: string
  palettes: number | null
}

interface PasseMoisHeures {
  mois: string
  capacite: number
  heuresPointees: number
  heuresConverties: number
}

interface Passe {
  nbPointages: number
  productionParJour: MailleProduction[]
  productionParSemaine: MailleProduction[]
  productionParMois: MailleProduction[]
  palettes: { parJour: PalettesMaille[]; parSemaine: PalettesMaille[]; parMois: PalettesMaille[] }
  heuresParMois: PasseMoisHeures[]
  ofTermines: OfTermine[]
}

interface FiabiliteArticle {
  article: string
  qty: number
  heuresPointees: number
  heuresTheoriques: number
  ratio: number | null
}

interface AdherenceSemaine {
  semaine: string
  prevus: number
  pointes: number
  taux: number | null
}

interface MixArticle {
  article: string
  qty: number
  palettes: number | null
  heures: number
  piecesParHeure: number | null
  cadenceGamme: number | null
}

interface AnalysesVue {
  fiabilite: {
    articles: FiabiliteArticle[]
    heuresPointees: number
    heuresTheoriques: number
    ratioGlobal: number | null
    exclusFauteCadence: number
  }
  adherence: AdherenceSemaine[]
  mix: MixArticle[]
}

type AnomalieKind =
  | 'jamais_pointe'
  | 'silence'
  | 'sans_heures'
  | 'heures_faibles'
  | 'doublon_declaration'

interface AnomalieVue {
  kind: AnomalieKind
  numOf: string
  article: string
  designation: string | null
  dateDebutIso: string | null
  dernierPointageIso: string | null
  jours: number | null
  qtyDeclaree: number | null
  heuresPointees: number | null
  heuresTheoriques: number | null
}

interface DoublonVue {
  numOf: string
  openum: number
  iptdat: string
  nombre: number
}

interface AnomaliesVue {
  jamaisPointes: AnomalieVue[]
  silences: AnomalieVue[]
  heures: AnomalieVue[]
  doublons: DoublonVue[]
}

interface PostePayload {
  poste: PosteInfo
  engagement: {
    poste: { code: string; label: string }
    count: number
    totalHours: number
    weeklyCapacityHours: number | null
    rows: EngagementRow[]
    x3Error: string | null
  } | null
  /** Passé constaté — null si la réplique est indisponible. */
  passe: Passe | null
  /** Anomalies de pointage — null si la réplique est indisponible. */
  anomalies: AnomaliesVue | null
  /** Fiabilité gamme, adhérence, mix articles — null si réplique indisponible. */
  analyses: AnalysesVue | null
  fenetre: { fromIso: string; toIso: string }
  replica: ReplicaState
  x3Error: string | null
}

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

const REPLICA_RAISON: Record<NonNullable<ReplicaState['raison']>, string> = {
  disabled: 'lecture réplique désactivée (REPLICA_READS)',
  'never-ingested': 'réplique jamais alimentée',
  'last-run-failed': 'dernière ingestion en échec',
  'env-mismatch': 'réplique alimentée depuis un autre environnement X3',
  dirty: 'réplique marquée sale après une écriture',
  stale: 'réplique trop ancienne',
}

interface Props {
  postesHref: string
  posteInitial: string | null
}

export default function CockpitPoste(props: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [chosen, setChosen] = useState(false)
  const [detailOf, setDetailOf] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [bump, setBump] = useState(0)

  const postes = useTimedFetch<PostesPayload>(props.postesHref)

  // Poste effectif : choix utilisateur > présélection ?poste= > défaut serveur.
  // Résolu seulement quand la liste est là, pour valider le code présélectionné.
  const effective = useMemo(() => {
    if (!postes.data) return null
    if (chosen && selected) return selected
    if (!chosen && props.posteInitial) {
      const known = postes.data.postes.some((p) => p.code === props.posteInitial)
      if (known) return props.posteInitial
    }
    return postes.data.defaut
  }, [postes.data, chosen, selected, props.posteInitial])

  const q = bump > 0 ? '?refresh=1' : ''
  const detailHref = effective
    ? `/api/v1/planning/cockpit/postes/${encodeURIComponent(effective)}${q}`
    : null
  const detail = useTimedFetch<PostePayload>(detailHref)

  const pick = (code: string) => {
    setChosen(true)
    setSelected(code)
  }

  const refresh = () => {
    setBump((b) => b + 1)
    router.visit(route('cockpit.index') + '?refresh=1', { preserveScroll: true })
  }

  const replicaDown = postes.data ? !postes.data.replica.disponible : false

  return (
    <AppLayout
      title="Cockpit poste"
      active="cockpit"
      subtitle="Production constatée et engagement, poste par poste"
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <>
          <div className="font-fraunces text-[12px] font-bold capitalize not-italic text-brand">
            Cockpit poste
          </div>
          {postes.data && (
            <div>
              <b className="font-bold text-foreground">{postes.data.postes.length}</b> postes ·{' '}
              {dateLong(postes.data.fenetre.fromIso)} → {dateLong(postes.data.fenetre.toIso)}
            </div>
          )}
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <ToolbarRow>
          {/* Sélecteur de poste — la liste est la donnée, pas un référentiel figé. */}
          <div className={cn(PILL, 'gap-2')}>
            <Factory size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <select
              className="max-w-[340px] cursor-pointer border-0 bg-transparent px-0 font-mono text-xs font-bold text-foreground shadow-none outline-none"
              value={effective ?? ''}
              onChange={(e) => pick(e.currentTarget.value)}
              disabled={!postes.data || postes.data.postes.length === 0}
              aria-label="Poste de charge"
            >
              {!postes.data && <option value="">Chargement…</option>}
              {postes.data?.postes.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.label}
                </option>
              ))}
            </select>
          </div>

          <ToolbarSpacer />

          <button
            type="button"
            onClick={refresh}
            className={cn(PILL, 'cursor-pointer px-2.5 text-muted-foreground hover:text-foreground')}
            title="Rafraîchir"
            aria-label="Rafraîchir"
          >
            <RefreshCw size={16} strokeWidth={1.75} />
          </button>
        </ToolbarRow>

        {/* Indisponibilité de la réplique : le passé constaté ne vient JAMAIS de la
            voie directe, on l'affiche au lieu de le calculer en douce. */}
        {replicaDown && postes.data && (
          <div className="flex flex-none items-center gap-2 border-b border-brand/30 bg-brand-soft px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-brand" />
            <span className="font-bold">Passé productif indisponible :</span>
            <span className="font-mono">
              {postes.data.replica.raison
                ? REPLICA_RAISON[postes.data.replica.raison]
                : 'réplique de pointages hors service'}
            </span>
          </div>
        )}

        {postes.loading && !postes.data ? (
          <LoadingState className="flex-1" variant="orb" orbState="searching" title="Postes…" />
        ) : !replicaDown && detail.loading && !detail.data ? (
          <LoadingState
            className="flex-1"
            variant="orb"
            orbState="searching"
            title={`Chargement du poste ${effective ?? ''}…`}
          />
        ) : detail.data ? (
          <PosteDetail
            // La clé force le remontage au changement de poste : l'état local
            // (faisabilité) repart de zéro au lieu de survivre à l'ancien poste.
            key={detail.data.poste.code}
            payload={detail.data}
            onSelectOf={(num) => {
              setDetailOf(num)
              setDetailOpen(true)
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
            {replicaDown
              ? 'Sélectionnez un poste pour consulter son engagement.'
              : 'Aucun poste à afficher.'}
          </div>
        )}
      </div>

      <OfDetailSheet num={detailOf} open={detailOpen} onOpenChange={setDetailOpen} />
    </AppLayout>
  )
}

/** Carte d'identité + passé constaté + anomalies + analyses + engagement. */
function PosteDetail(props: { payload: PostePayload; onSelectOf: (numOf: string) => void }) {
  const { poste, engagement, passe, anomalies, analyses, x3Error } = props.payload
  const sat = engagement
    ? saturation(engagement.totalHours, engagement.weeklyCapacityHours)
    : null

  // Faisabilité matières — même contrat API que le séquenceur (#119 : reprise du
  // bloc séquenceur sans dupliquer la logique). À la demande : le calcul est
  // lourd, on ne le paie qu'à l'ouverture du cockpit d'un poste donné.
  const [feasMap, setFeasMap] = useState<Record<string, FeasStatus> | null>(null)
  const [feasLoading, setFeasLoading] = useState(false)
  const [feasError, setFeasError] = useState<string | null>(null)

  const runFeasibility = async () => {
    if (!engagement || engagement.rows.length === 0 || feasLoading) return
    setFeasLoading(true)
    setFeasError(null)
    try {
      const { from, to } = feasibilityWindowFromDates(engagement.rows.map((r) => r.dateDebutIso))
      const { map, nbOk, nbBlocked, nbQc } = await fetchBoardFeasibility({
        from,
        to,
        mode: 'sequential',
        workstation: poste.code,
      })
      setFeasMap(map)
      setFeasCounts({ ok: nbOk, blocked: nbBlocked, qc: nbQc })
    } catch (e) {
      setFeasError((e as Error).message)
    } finally {
      setFeasLoading(false)
    }
  }

  const [feasCounts, setFeasCounts] = useState({ ok: 0, blocked: 0, qc: 0 })

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* Identité du poste : libellé, atelier, capacité et régime, dernier pointage. */}
      <div className="flex flex-none flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-secondary px-7 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[15px] font-bold text-foreground">{poste.code}</span>
          <span className="text-[13px] font-medium text-muted-foreground">{poste.label}</span>
        </div>
        {poste.atelier && (
          <span className="text-[12px] font-medium text-muted-foreground">{poste.atelierLabel}</span>
        )}

        <span className="flex-1" />

        {/* Régime hebdo (Lun→Dim) — le schéma horaire derrière la capacité. */}
        {poste.regimeHebdo && (
          <div className="flex items-center gap-1" title="Capacité journalière (Lun → Dim)">
            {poste.regimeHebdo.map((h, i) => (
              <div key={i} className="flex flex-col items-center">
                <span
                  className={cn(
                    'font-mono text-[10px] font-semibold tabular-nums',
                    h > 0 ? 'text-foreground' : 'text-muted-foreground/50'
                  )}
                >
                  {h > 0 ? h : '·'}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground/60">{JOURS[i]}</span>
              </div>
            ))}
          </div>
        )}

        {poste.capaciteHebdoHeures != null && (
          <div className="flex items-baseline gap-1">
            <span className="text-[15px] font-bold tabular-nums text-foreground">
              {fmtH(poste.capaciteHebdoHeures)}
            </span>
            <span className="font-mono text-[10px] font-semibold text-muted-foreground">
              h/sem
            </span>
          </div>
        )}

        <div className="flex items-baseline gap-1.5" title="Dernier pointage dans la fenêtre">
          <span className="text-[11px] font-medium text-muted-foreground">Dernier pointage</span>
          <span className="font-mono text-[12px] font-bold tabular-nums text-foreground">
            {dateLong(poste.dernierPointageIso)}
          </span>
        </div>
      </div>

      {x3Error && (
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
          <span className="font-bold">Erreur chargement :</span>
          <span className="font-mono">{x3Error}</span>
        </div>
      )}

      {/* Passé constaté — réplique de pointages, mailles j/s/m (#119, lots 4/6). */}
      {passe && <PasseSection passe={passe} onSelectOf={props.onSelectOf} />}

      {/* Anomalies de pointage — quatre détecteurs (#119, lot 5). */}
      {passe && anomalies && <AnomaliesSection anomalies={anomalies} onSelectOf={props.onSelectOf} />}

      {/* Analyses — fiabilité gamme, adhérence, mix articles (#119, lot 6). */}
      {passe && analyses && <AnalysesSection analyses={analyses} />}

      {/* Engagement futur — pipeline #46 réutilisé. */}
      <div className="px-7 py-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <span className="font-fraunces text-[13px] font-bold not-italic text-foreground">
            Engagement
          </span>
          {engagement && (
            <>
              <span className="font-mono text-[11px] text-muted-foreground">
                {engagement.count} OF · {fmtH(engagement.totalHours)} h
              </span>
              {sat && sat.pct !== null && (
                <span
                  className={cn(
                    'font-mono text-[11px] font-bold tabular-nums',
                    sat.level === 'ok' && 'text-ferme',
                    sat.level === 'high' && 'text-suggere',
                    sat.level === 'crit' && 'text-danger'
                  )}
                >
                  {sat.pct}% de la capacité
                </span>
              )}
            </>
          )}
          <span className="flex-1" />
          {feasMap && (
            <span className="flex items-center gap-3 font-mono text-[11px] font-semibold">
              <span className="text-ferme">{feasCounts.ok} faisables</span>
              {feasCounts.qc > 0 && <span className="text-suggere">{feasCounts.qc} sous CQ</span>}
              {feasCounts.blocked > 0 && (
                <span className="text-destructive">{feasCounts.blocked} bloqués</span>
              )}
            </span>
          )}
          {engagement && engagement.rows.length > 0 && (
            <button
              type="button"
              onClick={() => void runFeasibility()}
              disabled={feasLoading}
              className={cn(
                PILL,
                'cursor-pointer px-3 font-mono text-[11px] font-semibold text-foreground hover:border-brand/50 disabled:opacity-60'
              )}
              title="Couverture matières des OF engagés (même moteur que /programme)"
            >
              <RefreshCw size={14} strokeWidth={1.75} className={cn(feasLoading && 'animate-spin')} />
              {feasLoading ? 'Calcul…' : feasMap ? 'Recalculer la faisabilité' : 'Faisabilité'}
            </button>
          )}
        </div>

        {feasError && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-foreground">
            <TriangleAlert size={14} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Faisabilité :</span>
            <span className="font-mono">{feasError}</span>
          </div>
        )}

        {!engagement || engagement.rows.length === 0 ? (
          <div className="rounded-lg border border-rule bg-card p-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
            Aucun OF engagé sur ce poste.
          </div>
        ) : (
          <div className="divide-y divide-rule-soft rounded-lg border border-rule bg-card shadow-float">
            {engagement.rows.map((r) => (
              <EngagementLine
                key={r.numOf}
                row={r}
                onSelectOf={props.onSelectOf}
                feas={feasMap?.[r.numOf] ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EngagementLine(props: {
  row: EngagementRow
  onSelectOf: (numOf: string) => void
  feas: FeasStatus | null
}) {
  const r = props.row
  const u = urgencyOf(r.livraisonIso)
  const feas = props.feas
  return (
    <div className="flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-foreground/[0.05]">
      <button
        type="button"
        className="shrink-0 cursor-pointer font-mono text-[12px] font-bold tracking-tight text-brand hover:underline"
        onClick={() => props.onSelectOf(r.numOf)}
      >
        {r.numOf}
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{r.article}</span>
          {r.designation && <span className="font-sans font-normal"> · {r.designation}</span>}
        </div>
        {r.commandes.length > 0 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {r.commandes.slice(0, 3).map((c) => (
              <span key={c.numCommande + (c.ligne ?? '')} className="font-mono text-[10px]">
                <X3Link
                  fonction="GESSOH"
                  cle={c.numCommande}
                  title={`Ouvrir la commande ${c.numCommande} dans Sage X3`}
                  className="font-bold text-foreground hover:underline"
                >
                  {c.numCommande}
                </X3Link>
                {c.client && <span className="text-muted-foreground"> · {c.client}</span>}
              </span>
            ))}
            {r.commandes.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{r.commandes.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Badge faisabilité matières — seulement après un calcul explicite. */}
      {feas && (
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
            feas.st === 'ok' && 'bg-ferme/15 text-ferme',
            feas.st === 'qc' && 'bg-suggere/15 text-suggere',
            feas.st === 'blocked' && 'bg-destructive/15 text-destructive'
          )}
          title={
            feas.st === 'blocked'
              ? `Composants manquants : ${feas.missing.join(', ') || '—'}`
              : feas.st === 'qc'
                ? `Couvert grâce au stock sous contrôle qualité : ${Object.keys(feas.qcComponents ?? {}).join(', ')}`
                : 'Faisable'
          }
        >
          {feas.st === 'ok' ? 'faisable' : feas.st === 'qc' ? 'sous CQ' : 'bloqué'}
        </span>
      )}

      {r.statusLabel && (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {r.statusLabel}
        </span>
      )}

      <span className={cn('shrink-0 font-mono text-[11px] font-bold tabular-nums', urgencyColor(u))}>
        {r.livraisonIso ? dateLong(r.livraisonIso) : '—'}
      </span>

      <span className="w-16 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-foreground">
        {fmtH(r.hours)} h
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {fmtJ(r.hours)} j
      </span>
    </div>
  )
}

/** Les quatre détecteurs d'anomalies (#119, lot 5). Chaque OF est cliquable
 *  (détail OF), les doublons renvoient vers l'OF concerné. */
function AnomaliesSection(props: { anomalies: AnomaliesVue; onSelectOf: (numOf: string) => void }) {
  const { anomalies, onSelectOf } = props
  const total =
    anomalies.jamaisPointes.length +
    anomalies.silences.length +
    anomalies.heures.length +
    anomalies.doublons.length

  return (
    <div className="border-b border-border px-7 py-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="font-fraunces text-[13px] font-bold not-italic text-foreground">
          Anomalies de pointage
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {total === 0 ? 'aucune détectée' : `${total} signalée${total > 1 ? 's' : ''}`}
        </span>
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-rule bg-card p-4 text-center font-fraunces text-[13px] italic text-muted-foreground">
          Rien à signaler : tous les OF en cours pointent normalement.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <AnomalieCard
            titre="Lancés, jamais pointés"
            note="OF en cours sans aucun pointage sur ce poste"
            count={anomalies.jamaisPointes.length}
          >
            {anomalies.jamaisPointes.map((a) => (
              <AnomalieRow key={a.numOf} numOf={a.numOf} onSelectOf={onSelectOf}>
                <span className="text-muted-foreground">{a.article}</span>
                <span className="ml-auto text-muted-foreground">
                  lancé {dateLong(a.dateDebutIso)}
                </span>
                <span className="font-bold text-danger">{a.jours} j</span>
              </AnomalieRow>
            ))}
          </AnomalieCard>

          <AnomalieCard
            titre="Sans déclaration récente"
            note="Dernier pointage trop ancien pour un OF toujours en cours"
            count={anomalies.silences.length}
          >
            {anomalies.silences.map((a) => (
              <AnomalieRow key={a.numOf} numOf={a.numOf} onSelectOf={onSelectOf}>
                <span className="text-muted-foreground">{a.article}</span>
                <span className="ml-auto text-muted-foreground">
                  dernier {dateLong(a.dernierPointageIso)}
                </span>
                <span className="font-bold text-danger">{a.jours} j</span>
              </AnomalieRow>
            ))}
          </AnomalieCard>

          <AnomalieCard
            titre="Déclaré sans heures"
            note="Quantité déclarée mais temps pointé nul ou anormalement faible"
            count={anomalies.heures.length}
          >
            {anomalies.heures.map((a) => (
              <AnomalieRow key={a.numOf} numOf={a.numOf} onSelectOf={onSelectOf}>
                <span className="text-muted-foreground">
                  {a.article} · décl. {a.qtyDeclaree ?? 0}
                </span>
                <span className="ml-auto">
                  <span className={cn('font-bold', a.kind === 'sans_heures' ? 'text-danger' : 'text-suggere')}>
                    {fmtH(a.heuresPointees ?? 0)} h
                  </span>
                  <span className="text-muted-foreground">
                    {' '}
                    / {fmtH(a.heuresTheoriques ?? 0)} h théo.
                  </span>
                </span>
              </AnomalieRow>
            ))}
          </AnomalieCard>

          <AnomalieCard
            titre="Déclarations en double"
            note="Mêmes (OF, opération, jour) en plusieurs exemplaires — à vérifier"
            count={anomalies.doublons.length}
          >
            {anomalies.doublons.map((d) => (
              <AnomalieRow key={`${d.numOf}-${d.openum}-${d.iptdat}`} numOf={d.numOf} onSelectOf={onSelectOf}>
                <span className="text-muted-foreground">
                  op. {d.openum} · {dateLong(d.iptdat)}
                </span>
                <span className="ml-auto font-bold text-suggere">×{d.nombre}</span>
              </AnomalieRow>
            ))}
          </AnomalieCard>
        </div>
      )}
    </div>
  )
}

function AnomalieCard(props: { titre: string; note: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-rule bg-card p-3 shadow-float">
      <div className="mb-1 flex items-baseline gap-2 px-1">
        <span className="text-[11px] font-semibold text-foreground">{props.titre}</span>
        {props.count > 0 && (
          <span className="font-mono text-[10px] font-bold text-danger">{props.count}</span>
        )}
      </div>
      <div className="px-1 pb-1 font-mono text-[9px] leading-tight text-muted-foreground/80">
        {props.note}
      </div>
      {props.count === 0 ? (
        <div className="px-1 pb-1 font-fraunces text-[12px] italic text-muted-foreground">
          Aucun.
        </div>
      ) : (
        <div className="divide-y divide-rule-soft">{props.children}</div>
      )}
    </div>
  )
}

function AnomalieRow(props: { numOf: string; onSelectOf: (numOf: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-1 py-1.5 font-mono text-[11px] tabular-nums">
      <button
        type="button"
        className="shrink-0 cursor-pointer font-bold tracking-tight text-brand hover:underline"
        onClick={() => props.onSelectOf(props.numOf)}
      >
        {props.numOf}
      </button>
      {props.children}
    </div>
  )
}

type Maille = 'jour' | 'semaine' | 'mois'
type Unite = 'pieces' | 'palettes'

/** ISO → JJ/MM/AAAA — le critère d'acceptation #119 pour les dates du cockpit. */
const dateLong = (iso: string | null) => {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
const semaineLabel = (lundiIso: string) => `S ${dateLong(lundiIso)}`

/** Passé constaté : production (maille + unité au choix), heures vs capacité,
 *  OF terminés. Les chiffres ne viennent QUE des pointages de ce poste. */
function PasseSection(props: { passe: Passe; onSelectOf: (numOf: string) => void }) {
  const { passe } = props
  const [maille, setMaille] = useState<Maille>('mois')
  const [unite, setUnite] = useState<Unite>('pieces')

  const prod =
    maille === 'jour'
      ? passe.productionParJour
      : maille === 'semaine'
        ? passe.productionParSemaine
        : passe.productionParMois
  const palettes =
    maille === 'jour' ? passe.palettes.parJour : maille === 'semaine' ? passe.palettes.parSemaine : passe.palettes.parMois

  const palettesParDate = new Map(palettes.map((p) => [p.date, p.palettes]))
  const palettesDisponibles = palettes.some((p) => p.palettes !== null)

  // Axe des mailles : jour et semaine en JJ/MM/AAAA (#119), mois en clair.
  const labelDe = (date: string) =>
    maille === 'jour' ? dateLong(date) : maille === 'semaine' ? semaineLabel(date) : moisLabel(date)

  const chartData = prod.map((m) => ({
    label: labelDe(m.date),
    qty: unite === 'pieces' ? m.qty : (palettesParDate.get(m.date) ?? 0),
    heures: m.heures,
    dontHeuresReglage: m.dontHeuresReglage,
  }))

  return (
    <div className="border-b border-border px-7 py-4">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="font-fraunces text-[13px] font-bold not-italic text-foreground">
          Passé productif
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {passe.nbPointages} pointage{passe.nbPointages > 1 ? 's' : ''} sur la fenêtre
        </span>
        <span className="flex-1" />
        {passe.nbPointages > 0 && (
          <>
            <Segment role="radiogroup" ariaLabel="Unité">
              <SegmentButton active={unite === 'pieces'} onClick={() => setUnite('pieces')}>
                Pièces
              </SegmentButton>
              <SegmentButton active={unite === 'palettes'} onClick={() => setUnite('palettes')}>
                Palettes
              </SegmentButton>
            </Segment>
            <Segment role="radiogroup" ariaLabel="Maille">
              <SegmentButton active={maille === 'jour'} onClick={() => setMaille('jour')}>
                Jour
              </SegmentButton>
              <SegmentButton active={maille === 'semaine'} onClick={() => setMaille('semaine')}>
                Semaine
              </SegmentButton>
              <SegmentButton active={maille === 'mois'} onClick={() => setMaille('mois')}>
                Mois
              </SegmentButton>
            </Segment>
          </>
        )}
      </div>

      {passe.nbPointages === 0 ? (
        <div className="rounded-lg border border-rule bg-card p-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
          Aucun pointage sur ce poste dans la fenêtre.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-rule bg-card p-3 shadow-float">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-foreground">
                  Production {unite === 'pieces' ? '(pièces)' : '(équivalent palettes)'}
                </span>
                <span className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-sm bg-brand" />
                    {unite === 'pieces' ? 'quantité' : 'palettes'}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-ferme" /> heures pointées
                  </span>
                </span>
              </div>
              {unite === 'palettes' && !palettesDisponibles ? (
                <div className="flex h-[170px] items-center justify-center p-4 text-center font-fraunces text-[13px] italic text-muted-foreground">
                  Équivalent palette indisponible : aucun coefficient PCUSTUCOE_1 sur les
                  articles produits.
                </div>
              ) : (
                <ProductionChart data={chartData} />
              )}
            </div>

            <div className="rounded-lg border border-rule bg-card p-3 shadow-float">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold text-foreground">
                  Heures vs capacité
                </span>
                <span className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-sm bg-foreground/20" /> capacité
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-brand" /> pointées
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-ferme" /> converties
                  </span>
                </span>
              </div>
              <HeuresCapaciteChart data={passe.heuresParMois} />
            </div>
          </div>

          {/* OF terminés — pointés dans la fenêtre et plus en cours. */}
          {passe.ofTermines.length > 0 && (
            <div className="rounded-lg border border-rule bg-card shadow-float">
              <div className="flex items-baseline gap-2 border-b border-rule-soft px-3 py-2">
                <span className="text-[11px] font-semibold text-foreground">
                  OF terminés sur la fenêtre
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {passe.ofTermines.length} · sortie approchée par le dernier pointage
                </span>
              </div>
              <div className="max-h-[260px] overflow-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-secondary">
                    <tr className="text-left font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-1.5">OF</th>
                      <th className="px-3 py-1.5">Article</th>
                      <th className="px-3 py-1.5">Désignation</th>
                      <th className="px-3 py-1.5 text-right">Qté</th>
                      <th className="px-3 py-1.5 text-right">Palettes</th>
                      <th className="px-3 py-1.5 text-right">Heures</th>
                      <th className="px-3 py-1.5 text-right">Dernier jour</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule-soft">
                    {passe.ofTermines.map((of) => (
                      <tr key={of.numOf} className="font-mono text-[11px] tabular-nums">
                        <td className="px-3 py-1.5">
                          <button
                            type="button"
                            className="cursor-pointer font-bold tracking-tight text-brand hover:underline"
                            onClick={() => props.onSelectOf(of.numOf)}
                          >
                            {of.numOf}
                          </button>
                        </td>
                        <td className="px-3 py-1.5">{of.article ?? '—'}</td>
                        <td className="max-w-[220px] truncate px-3 py-1.5 font-sans text-muted-foreground">
                          {of.designation ?? '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold">{of.qty}</td>
                        {/* Pas de coefficient → absence de donnée, jamais « 0 palette » (#119). */}
                        <td className="px-3 py-1.5 text-right text-muted-foreground">
                          {of.palettes !== null ? of.palettes : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right">{of.heures}</td>
                        <td className="px-3 py-1.5 text-right">{dateLong(of.dernierJourIso)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Analyses (#119, lot 6) : fiabilité des temps de gamme, adhérence au
 *  programme, mix articles. Affichage seul — aucune boucle vers la charge. */
function AnalysesSection({ analyses }: { analyses: AnalysesVue }) {
  const { fiabilite, adherence, mix } = analyses
  const ratioPct = (r: number | null) => (r !== null ? `${Math.round(r * 100)} %` : '—')

  return (
    <div className="border-b border-border px-7 py-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="font-fraunces text-[13px] font-bold not-italic text-foreground">
          Analyses
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          lecture seule — aucun recalage automatique de la charge en v1
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Fiabilité des temps de gamme. */}
        <div className="rounded-lg border border-rule bg-card p-3 shadow-float">
          <div className="mb-1 flex items-baseline gap-2 px-1">
            <span className="text-[11px] font-semibold text-foreground">
              Fiabilité des temps de gamme
            </span>
            <span
              className={cn(
                'ml-auto font-mono text-[12px] font-bold tabular-nums',
                fiabilite.ratioGlobal !== null && fiabilite.ratioGlobal < 0.9 && 'text-danger',
                fiabilite.ratioGlobal !== null && fiabilite.ratioGlobal >= 0.9 && 'text-ferme'
              )}
            >
              {ratioPct(fiabilite.ratioGlobal)}
            </span>
          </div>
          <div className="px-1 pb-1.5 font-mono text-[9px] leading-tight text-muted-foreground/80">
            théorique / pointé · {fmtH(fiabilite.heuresTheoriques)} h théo pour{' '}
            {fmtH(fiabilite.heuresPointees)} h pointées
            {fiabilite.exclusFauteCadence > 0 &&
              ` · ${fiabilite.exclusFauteCadence} article(s) sans cadence exploitable, exclus`}
          </div>
          {fiabilite.articles.length === 0 ? (
            <div className="px-1 pb-1 font-fraunces text-[12px] italic text-muted-foreground">
              Aucune production avec cadence de gamme.
            </div>
          ) : (
            <div className="max-h-[220px] divide-y divide-rule-soft overflow-auto">
              {fiabilite.articles.map((a) => (
                <div key={a.article} className="flex items-center gap-2 px-1 py-1 font-mono text-[11px] tabular-nums">
                  <span className="font-semibold">{a.article}</span>
                  <span className="ml-auto text-muted-foreground">
                    {fmtH(a.heuresTheoriques)} / {fmtH(a.heuresPointees)} h
                  </span>
                  <span
                    className={cn(
                      'w-11 text-right font-bold',
                      a.ratio !== null && a.ratio < 0.9 ? 'text-danger' : 'text-ferme'
                    )}
                  >
                    {ratioPct(a.ratio)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adhérence au programme. */}
        <div className="rounded-lg border border-rule bg-card p-3 shadow-float">
          <div className="mb-1 flex items-baseline gap-2 px-1">
            <span className="text-[11px] font-semibold text-foreground">Adhérence au programme</span>
          </div>
          <div className="px-1 pb-1.5 font-mono text-[9px] leading-tight text-muted-foreground/80">
            OF prévus (lancement des OF ouverts) vs réellement pointés, par semaine — semaine en
            cours exclue. Les OF passés en stock ne sont plus dans ORDERS : périmètre vivant
            seulement.
          </div>
          {adherence.length === 0 ? (
            <div className="px-1 pb-1 font-fraunces text-[12px] italic text-muted-foreground">
              Pas de semaine complète dans la fenêtre.
            </div>
          ) : (
            <div className="max-h-[220px] divide-y divide-rule-soft overflow-auto">
              {adherence.map((s) => (
                <div key={s.semaine} className="flex items-center gap-2 px-1 py-1 font-mono text-[11px] tabular-nums">
                  <span>{semaineLabel(s.semaine)}</span>
                  <span className="ml-auto text-muted-foreground">
                    {s.pointes}/{s.prevus} pointés
                  </span>
                  <span
                    className={cn(
                      'w-11 text-right font-bold',
                      s.taux === null
                        ? 'text-muted-foreground'
                        : s.taux >= 0.7
                          ? 'text-ferme'
                          : s.taux >= 0.4
                            ? 'text-suggere'
                            : 'text-danger'
                    )}
                  >
                    {s.taux !== null ? `${Math.round(s.taux * 100)} %` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mix articles et cadence réelle. */}
        <div className="rounded-lg border border-rule bg-card p-3 shadow-float">
          <div className="mb-1 flex items-baseline gap-2 px-1">
            <span className="text-[11px] font-semibold text-foreground">Mix articles & cadence réelle</span>
          </div>
          <div className="px-1 pb-1.5 font-mono text-[9px] leading-tight text-muted-foreground/80">
            top productions de la fenêtre · u/h constatées vs cadence gamme
          </div>
          {mix.length === 0 ? (
            <div className="px-1 pb-1 font-fraunces text-[12px] italic text-muted-foreground">
              Aucune production quantifiée.
            </div>
          ) : (
            <div className="max-h-[220px] divide-y divide-rule-soft overflow-auto">
              {mix.map((m) => (
                <div key={m.article} className="px-1 py-1 font-mono text-[11px] tabular-nums">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{m.article}</span>
                    <span className="ml-auto text-muted-foreground">{m.qty} u</span>
                    {/* Absence de coefficient palette = « — », jamais 0 (#119). */}
                    <span className="w-14 text-right text-muted-foreground">
                      {m.palettes !== null ? `${m.palettes} pal` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>
                      constaté{' '}
                      <b className="text-foreground">
                        {m.piecesParHeure !== null ? m.piecesParHeure : '—'} u/h
                      </b>
                    </span>
                    <span className="ml-auto">
                      gamme{' '}
                      <b className="text-foreground">
                        {m.cadenceGamme !== null ? m.cadenceGamme : '—'} u/h
                      </b>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
