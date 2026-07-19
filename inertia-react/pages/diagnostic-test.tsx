import { useState, useCallback } from 'react'
import { Head } from '@inertiajs/react'
import { route } from '@/lib/routes'
import { cn } from '@r/lib/utils'

import { Masthead } from '@r/components/masthead'
import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'

/**
 * Page de TEST provisoire (issue #25) pour valider le diagnostic récursif sur un
 * vrai OF avant intégration au design final. Pas de rattachement nav durable —
 * on y accède par /diagnostic-test.
 *
 * Port depuis inertia/pages/diagnostic-test.tsx (SolidJS).
 */

type NodeStatus =
  | 'ok'
  | 'qc_a_controler'
  | 'rupture_matiere'
  | 'sous_ensemble_a_lancer'
  | 'indetermine'
type NodeSource = 'MFGMAT' | 'NOMENCLATURE'

interface DiagnosticNode {
  numOf: string
  article: string
  description: string
  statut: number
  quantityNeeded: number
  source: NodeSource
  feasible: boolean
  status: NodeStatus
  shorts: ShortComponentNode[]
  alerts: string[]
}
interface CoveringOf {
  numOf: string
  statut: number
  quantity: number
  node: DiagnosticNode
}
interface ShortComponentNode {
  article: string
  description: string
  quantityNeeded: number
  available: number | null
  stockQc?: number
  quantityMissing: number
  earliestReception: string | null
  fabricated: boolean
  covering: CoveringOf[]
  status: NodeStatus
}
interface DiagnosticResult {
  numOf: string
  article: string
  feasible: boolean
  rootCause: NodeStatus
  tree: DiagnosticNode
  componentsChecked: number
  maxDepthReached: number
  alerts: string[]
  _debug?: unknown
}

const STATUS_LABEL: Record<NodeStatus, string> = {
  ok: 'OK',
  qc_a_controler: 'Contrôle qualité',
  rupture_matiere: 'Rupture matière',
  sous_ensemble_a_lancer: 'Sous-ensemble à lancer',
  indetermine: 'Indéterminé',
}
const STATUS_VARIANT: Record<
  NodeStatus,
  'success' | 'destructive' | 'warning' | 'secondary'
> = {
  ok: 'success',
  qc_a_controler: 'warning',
  rupture_matiere: 'destructive',
  sous_ensemble_a_lancer: 'warning',
  indetermine: 'secondary',
}
const STATUT_OF: Record<number, string> = {
  1: 'ferme/lancé',
  2: 'planifié',
  3: 'suggéré',
}

function StatusBadge({ status }: { status: NodeStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
  )
}

/** Affiche un composant en manque + (récursivement) les OF couvrants et leurs composants. */
interface ShortRowProps {
  short: ShortComponentNode
  depth: number
}

function ShortRow({ short, depth }: ShortRowProps) {
  return (
    <div
      className="border-l-2 border-border/60 pl-3"
      style={{ marginLeft: `${depth * 4}px` }}
    >
      <div className="flex flex-wrap items-center gap-2 py-1">
        <StatusBadge status={short.status} />
        <span className="font-mono text-[12px] font-bold text-foreground">
          {short.article}
        </span>
        {short.description && (
          <span className="text-[11px] text-muted-foreground">
            {short.description}
          </span>
        )}
        <span className="font-mono text-[11px] text-muted-foreground">
          besoin {short.quantityNeeded} · dispo {short.available ?? '?'}
          {short.stockQc !== undefined && (
            <>
              {' '}
              · <span className="text-warning font-semibold">CQ {short.stockQc}</span>
            </>
          )}{' '}
          · manque{' '}
          <span className="font-bold text-destructive">{short.quantityMissing}</span>
        </span>
        {short.earliestReception && (
          <span className="font-mono text-[11px] text-brand">
            récep. {short.earliestReception}
          </span>
        )}
        {short.fabricated && (
          <Badge variant="secondary" className="text-[9px]">
            fabriqué
          </Badge>
        )}
      </div>
      {short.status === 'qc_a_controler' && (
        <div className="ml-1 flex items-center gap-1.5 py-0.5 font-mono text-[11px] text-warning">
          <span className="material-symbols-outlined text-[13px]">
            verified
          </span>
          Action : lever le contrôle qualité ({short.stockQc} en CQ — couvre le
          besoin)
        </div>
      )}

      {/* OF/suggestions couvrants */}
      {short.covering.map((cov) => (
        <div
          key={`${cov.numOf}-${cov.statut}`}
          className="mt-1 rounded-md bg-secondary/50 px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="material-symbols-outlined text-[14px] text-muted-foreground">
              subdirectory_arrow_right
            </span>
            <span className="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
              COUVERT PAR
            </span>
            <span className="font-mono text-[12px] font-bold text-foreground">
              {cov.numOf}
            </span>
            <Badge
              variant={
                cov.statut === 1
                  ? 'success'
                  : cov.statut === 2
                    ? 'secondary'
                    : 'warning'
              }
              className="text-[9px]"
            >
              {STATUT_OF[cov.statut] ?? `statut ${cov.statut}`}
            </Badge>
            <span className="font-mono text-[11px] text-muted-foreground">
              qté {cov.quantity}
            </span>
            <StatusBadge status={cov.node.status} />
            <Badge
              variant={cov.node.source === 'MFGMAT' ? 'success' : 'secondary'}
              className="text-[9px]"
            >
              {cov.node.source === 'MFGMAT' ? 'réel' : 'théorique'}
            </Badge>
          </div>
          {/* Composants du sous-ensemble couvrant */}
          {cov.node.shorts.length > 0 ? (
            <div className="mt-1.5 flex flex-col gap-1">
              {cov.node.shorts.map((s) => (
                <ShortRow key={s.article} short={s} depth={depth + 1} />
              ))}
            </div>
          ) : (
            <div className="mt-1 pl-6 text-[11px] text-ferme">
              ✓ tous composants disponibles
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function DiagnosticTest() {
  const [input, setInput] = useState('F426-34030')
  const [req, setReq] = useState<{ of: string; n: number } | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [diag, setDiag] = useState<DiagnosticResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const v = input.trim()
      if (!v) return
      setReq({ of: v, n: Date.now() })
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          route('planning_board.of_materials_diagnostic', { of: v })
        )
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}${txt ? ` — ${txt}` : ''}`)
        }
        const data = (await res.json()) as DiagnosticResult
        setDiag(data)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [input]
  )

  return (
    <>
      <Head title="Diagnostic test" />
      <div className="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <Masthead
          subtitle="Diagnostic récursif · page de test (#25)"
          active="programme"
        />
        <div className="flex-1 overflow-auto px-7 py-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-5">
            <form className="flex items-end gap-3" onSubmit={run}>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                  OF
                </span>
                <input
                  className="w-72 rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-brand"
                  placeholder="ex. F426-34030"
                  value={input}
                  onChange={(e) => setInput(e.currentTarget.value)}
                />
              </label>
              <Button type="submit" className="gap-1.5">
                <span className="material-symbols-outlined text-[16px]">
                  search
                </span>
                Examiner
              </Button>
            </form>

            {loading && (
              <div className="flex items-center gap-2 rounded-md bg-secondary px-4 py-3 text-[13px] text-muted-foreground">
                <span className="material-symbols-outlined animate-spin text-[18px]">
                  progress_activity
                </span>
                Diagnostic en cours…
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
                <span className="material-symbols-outlined text-[18px]">
                  error
                </span>
                {error}
              </div>
            )}

            {diag && (
              <div className="flex flex-col gap-4">
                {/* En-tête verdict */}
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary px-4 py-3">
                  <span className="font-mono text-[14px] font-bold text-foreground">
                    {diag.numOf}
                  </span>
                  {diag.tree.description && (
                    <span className="text-[12px] text-muted-foreground">
                      {diag.tree.description}
                    </span>
                  )}
                  <StatusBadge status={diag.rootCause} />
                  <Badge
                    variant={
                      diag.feasible
                        ? 'success'
                        : diag.rootCause === 'qc_a_controler'
                          ? 'warning'
                          : 'destructive'
                    }
                  >
                    {diag.feasible
                      ? 'Faisable'
                      : diag.rootCause === 'qc_a_controler'
                        ? 'Faisable sous réserve CQ'
                        : 'Bloqué'}
                  </Badge>
                  <span className="ml-auto flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
                    <span>composants : {diag.componentsChecked}</span>
                    <span>profondeur : {diag.maxDepthReached}</span>
                  </span>
                </div>

                {/* Arbre : composants en manque de l'OF de tête */}
                {diag.tree.shorts.length > 0 ? (
                  <div className="flex flex-col gap-2 rounded-md border border-border bg-background px-4 py-3">
                    {diag.tree.shorts.map((s) => (
                      <ShortRow key={s.article} short={s} depth={0} />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md bg-ferme/10 px-4 py-3 text-[13px] font-medium text-ferme">
                    <span className="material-symbols-outlined text-[18px]">
                      check_circle
                    </span>
                    Aucun manque — tous les composants sont disponibles.
                  </div>
                )}

                {/* Alertes */}
                {diag.alerts.length > 0 && (
                  <div className="rounded-md bg-secondary px-4 py-3">
                    <div className="mb-1.5 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                      ALERTES
                    </div>
                    <ul className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
                      {diag.alerts.map((a, idx) => (
                        <li key={idx}>• {a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* JSON brut */}
                <div>
                  <button
                    className="font-mono text-[11px] font-semibold text-brand hover:underline"
                    type="button"
                    onClick={() => setShowRaw(!showRaw)}
                  >
                    {showRaw ? '▾ masquer le JSON brut' : '▸ afficher le JSON brut'}
                  </button>
                  {showRaw && (
                    <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-secondary p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                      {JSON.stringify(diag, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
