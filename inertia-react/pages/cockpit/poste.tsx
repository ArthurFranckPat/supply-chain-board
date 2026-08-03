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
import { PILL, ToolbarRow, ToolbarSpacer } from '@r/components/vision/toolbar'
import { route } from '@r/lib/routes'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'
import {
  fmtDateFr,
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

interface PasseMoisProduction {
  mois: string
  qty: number
  heures: number
  dontHeuresReglage: number
}

interface PasseMoisHeures {
  mois: string
  capacite: number
  heuresPointees: number
  heuresConverties: number
}

interface Passe {
  nbPointages: number
  productionParMois: PasseMoisProduction[]
  heuresParMois: PasseMoisHeures[]
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
              {fmtDateFr(postes.data.fenetre.fromIso)} → {fmtDateFr(postes.data.fenetre.toIso)}
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

/** Carte d'identité + passé constaté + bloc engagement d'un poste. */
function PosteDetail(props: { payload: PostePayload; onSelectOf: (numOf: string) => void }) {
  const { poste, engagement, passe, x3Error } = props.payload
  const sat = engagement
    ? saturation(engagement.totalHours, engagement.weeklyCapacityHours)
    : null

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
            {fmtDateFr(poste.dernierPointageIso)}
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

      {/* Passé constaté — réplique de pointages, graphe mensuel (#119, lot 4). */}
      {passe && (
        <div className="border-b border-border px-7 py-4">
          <div className="mb-2 flex items-center gap-3">
            <span className="font-fraunces text-[13px] font-bold not-italic text-foreground">
              Passé productif
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {passe.nbPointages} pointage{passe.nbPointages > 1 ? 's' : ''} sur la fenêtre
            </span>
          </div>

          {passe.nbPointages === 0 ? (
            <div className="rounded-lg border border-rule bg-card p-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
              Aucun pointage sur ce poste dans la fenêtre.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-rule bg-card p-3 shadow-float">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold text-foreground">Production</span>
                  <span className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-sm bg-brand" /> quantité
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-full bg-ferme" /> heures pointées
                    </span>
                  </span>
                </div>
                <ProductionChart data={passe.productionParMois} />
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
          )}
        </div>
      )}

      {/* Engagement futur — pipeline #46 réutilisé. */}
      <div className="px-7 py-4">
        <div className="mb-2 flex items-center gap-3">
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
        </div>

        {!engagement || engagement.rows.length === 0 ? (
          <div className="rounded-lg border border-rule bg-card p-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
            Aucun OF engagé sur ce poste.
          </div>
        ) : (
          <div className="divide-y divide-rule-soft rounded-lg border border-rule bg-card shadow-float">
            {engagement.rows.map((r) => (
              <EngagementLine key={r.numOf} row={r} onSelectOf={props.onSelectOf} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EngagementLine(props: { row: EngagementRow; onSelectOf: (numOf: string) => void }) {
  const r = props.row
  const u = urgencyOf(r.livraisonIso)
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

      {r.statusLabel && (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {r.statusLabel}
        </span>
      )}

      <span className={cn('shrink-0 font-mono text-[11px] font-bold tabular-nums', urgencyColor(u))}>
        {r.livraisonIso ? fmtDateFr(r.livraisonIso) : '—'}
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
