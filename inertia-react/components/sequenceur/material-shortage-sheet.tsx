import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, CircleX, Package, Search, TriangleAlert, Truck } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { LoadingState } from '@r/components/ui/loading-state'
import { PILL, Segment, SegmentButton } from '@r/components/vision/toolbar'
import type { FeasibilityMode } from '@r/lib/board/types'
import {
  fetchMaterialSummary,
  fmtDay,
  fmtQty,
  VERDICT_PRESET,
  type MaterialSummaryResponse,
  type MaterialSummaryRow,
  type MaterialVerdict,
} from '@r/lib/sequenceur/material-summary'

/**
 * Panneau « Matières manquantes » du séquenceur.
 *
 * Répond à la question posée après le calcul de faisabilité : le board dit que N OF sont
 * bloqués — le panneau dit PAR QUOI, combien il manque au total sur le périmètre affiché,
 * et ce qui rentre (fournisseur, quantité, date). Sans ouvrir les OF un par un.
 *
 * Périmètre = les OF VISIBLES à l'écran (filtres poste / atelier / statut / dates déjà
 * appliqués côté page), pas la fenêtre serveur de la faisabilité : c'est ce que
 * l'utilisateur a sous les yeux qui fait foi.
 *
 * v1 : composants ACHETÉS seulement. Les OF bloqués par un sous-ensemble fabriqué sont
 * comptés à part (bandeau) — les masquer sans le dire ferait croire à un board plus sain
 * qu'il ne l'est.
 */

const GRID = 'grid-cols-[2rem_8.5rem_1.4fr_5.5rem_5.5rem_1fr_5.5rem_6rem_7.5rem] items-center gap-3'

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface MaterialShortageSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Fenêtre de faisabilité (identique à celle du bouton « Faisabilité »). */
  window: { from: string; to: string } | null
  mode: FeasibilityMode
  /** Poste filtré, s'il y en a un — aligne la clé de cache serveur sur la faisabilité. */
  workstation: string | null
  /** OF visibles à l'écran + leur date de début (= date où la matière doit être là). */
  scope: { numOf: string; besoinIso: string | null }[]
}

export function MaterialShortageSheet(props: MaterialShortageSheetProps) {
  const [data, setData] = useState<MaterialSummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [verdictFilter, setVerdictFilter] = useState<MaterialVerdict | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  /** Signature du périmètre effectivement chargé — rouvrir sans rien changer ne refetch pas. */
  const loadedKey = useRef<string | null>(null)
  const scopeKey = useMemo(
    () =>
      [
        props.window?.from ?? '',
        props.window?.to ?? '',
        props.mode,
        props.workstation ?? '',
        props.scope.map((o) => o.numOf).join(','),
      ].join('|'),
    [props.window, props.mode, props.workstation, props.scope]
  )

  useEffect(() => {
    if (!props.open || !props.window || props.scope.length === 0) return
    if (loadedKey.current === scopeKey) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchMaterialSummary({
      from: props.window.from,
      to: props.window.to,
      mode: props.mode,
      ...(props.workstation ? { workstation: props.workstation } : {}),
      ofs: props.scope,
      signal: controller.signal,
    })
      .then((payload) => {
        loadedKey.current = scopeKey
        setData(payload)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Échec du chargement')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [props.open, props.window, props.mode, props.workstation, props.scope, scopeKey])

  // Memo dédié : `data?.rows ?? []` recrée un tableau à chaque rendu et invaliderait
  // les memos qui en dépendent.
  const rows = useMemo(() => data?.rows ?? [], [data])
  const filtered = useMemo(() => {
    const q = fold(query.trim())
    return rows
      .filter((r) => verdictFilter === 'all' || r.verdict === verdictFilter)
      .filter(
        (r) =>
          !q ||
          fold(r.component).includes(q) ||
          fold(r.componentDesc).includes(q) ||
          fold(r.fournisseur).includes(q) ||
          r.ofs.some((o) => fold(o.numOf).includes(q) || fold(o.article).includes(q))
      )
  }, [rows, query, verdictFilter])

  const toggle = (component: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(component)) next.delete(component)
      else next.add(component)
      return next
    })
  }

  const stats = data?.stats
  const counts = useMemo(() => {
    const c: Record<MaterialVerdict, number> = { sans_couverture: 0, retard: 0, couvert: 0 }
    for (const r of rows) c[r.verdict]++
    return c
  }, [rows])

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        // Dimensions redéclarées en variantes `data-[side=bottom]:` — le primitive porte
        // `h-auto` / `max-w-[640px]`, dont le sélecteur d'attribut bat une classe nue.
        className="flex w-full flex-col gap-0 rounded-t-[16px] p-0 data-[side=bottom]:mx-0 data-[side=bottom]:h-[80vh] data-[side=bottom]:max-w-none"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-secondary px-5 py-3 pr-14">
          <Package size={18} strokeWidth={1.75} className="self-center text-brand" />
          <SheetTitle className="font-fraunces text-[15px] font-medium text-foreground">
            Matières manquantes
          </SheetTitle>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            composants achetés · {props.scope.length} OF à l’écran
          </span>
          <span className="flex-1" />
          {stats && (
            <div className="flex items-center gap-3 font-mono text-[11px] font-semibold">
              <span className="text-foreground">{stats.nbComposants} composants</span>
              <span className="h-4 w-px bg-border" />
              <span className="text-destructive">{stats.nbOfBloques} OF bloqués</span>
            </div>
          )}
        </div>

        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border px-5 py-2">
          <div className={PILL}>
            <Search size={16} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[220px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
              placeholder="Composant, désignation, fournisseur, OF…"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
          <Segment>
            {(['sans_couverture', 'retard', 'couvert'] as MaterialVerdict[]).map((k) => {
              const on = verdictFilter === k
              return (
                <SegmentButton key={k} active={on} onClick={() => setVerdictFilter(on ? 'all' : k)}>
                  {VERDICT_PRESET[k].label} ({counts[k]})
                </SegmentButton>
              )
            })}
          </Segment>
        </div>

        {data?.x3Error && (
          <div className="flex flex-none items-start gap-2 border-b border-brand/30 bg-brand-soft px-5 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="mt-px text-brand" />
            <span className="flex-none font-bold">Données partielles :</span>
            <span className="break-all font-mono">{data.x3Error}</span>
          </div>
        )}

        {stats && stats.nbOfHorsPerimetre > 0 && (
          <div className="flex flex-none items-center gap-2 border-b border-border bg-secondary/40 px-5 py-1.5 font-mono text-[10px] text-muted-foreground">
            <TriangleAlert size={13} strokeWidth={1.75} />
            <span>
              {stats.nbOfHorsPerimetre} OF bloqué(s) uniquement par des sous-ensembles fabriqués —
              hors de ce listing (périmètre : composants achetés).
            </span>
          </div>
        )}

        {loading ? (
          <LoadingState
            title="Analyse des composants…"
            description="Croisement des manques et des réceptions d’achat attendues"
          />
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-destructive">
            <CircleX size={26} strokeWidth={1.75} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
            <Package size={26} strokeWidth={1.75} />
            <span className="font-fraunces text-[13px] italic">
              {rows.length === 0
                ? 'Aucun composant acheté manquant sur les OF affichés.'
                : 'Aucun composant ne correspond à ces filtres.'}
            </span>
          </div>
        ) : (
          <div className="flex-1 overflow-auto pb-10">
            <div
              className={cn(
                'sticky top-0 z-10 grid border-b border-border bg-secondary px-5 py-2 font-mono text-[9px] font-bold tracking-wider text-muted-foreground',
                GRID
              )}
            >
              <span />
              <span>COMPOSANT</span>
              <span>DÉSIGNATION</span>
              <span className="text-right">MANQUE</span>
              <span>BESOIN LE</span>
              <span>FOURNISSEUR</span>
              <span className="text-right">ATTENDU</span>
              <span>COUVERT LE</span>
              <span>VERDICT</span>
            </div>
            {filtered.map((r) => (
              <MaterialRow
                key={r.component}
                row={r}
                open={expanded.has(r.component)}
                onToggle={() => toggle(r.component)}
              />
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function MaterialRow(props: { row: MaterialSummaryRow; open: boolean; onToggle: () => void }) {
  const r = props.row
  const preset = VERDICT_PRESET[r.verdict]
  return (
    <div className="border-b border-rule-soft">
      <button
        type="button"
        onClick={props.onToggle}
        className={cn(
          'grid w-full px-5 py-2 text-left transition-colors hover:bg-secondary/50',
          GRID
        )}
      >
        <ChevronRight
          size={14}
          strokeWidth={2}
          className={cn(
            'text-muted-foreground transition-transform',
            props.open && 'rotate-90 text-brand'
          )}
        />
        <span className="font-mono text-[12px] font-bold text-foreground">{r.component}</span>
        <span className="truncate text-[12px] text-muted-foreground" title={r.componentDesc}>
          {r.componentDesc || '—'}
        </span>
        <span className="text-right font-mono text-[12px] font-bold tabular-nums text-destructive">
          {fmtQty(r.qteManquante)}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-foreground">
          {fmtDay(r.besoinIso)}
        </span>
        <span className="truncate text-[12px] text-muted-foreground" title={r.fournisseur}>
          {r.fournisseur || '—'}
        </span>
        <span className="text-right font-mono text-[12px] tabular-nums text-foreground">
          {r.qteAttendue > 0 ? fmtQty(r.qteAttendue) : '—'}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-foreground">
          {fmtDay(r.dateCouvertureIso)}
          {r.joursRetard > 0 && (
            <span className="ml-1 font-bold text-destructive">+{r.joursRetard}j</span>
          )}
        </span>
        <span
          className={cn(
            'justify-self-start rounded px-1.5 py-0.5 font-mono text-[10px] font-bold',
            preset.cls
          )}
        >
          {preset.label}
        </span>
      </button>

      {props.open && (
        <div className="grid gap-4 bg-secondary/30 px-5 py-3 pl-[3.25rem] md:grid-cols-2">
          {/* Les OF que ce composant bloque — le « pourquoi ça compte ». */}
          <div>
            <div className="mb-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
              BLOQUE {r.ofs.length} OF
            </div>
            <div className="flex flex-col gap-1">
              {r.ofs.map((o) => (
                <div
                  key={o.numOf}
                  className="grid grid-cols-[7rem_6.5rem_1fr_4.5rem_5rem] items-center gap-2 text-[11px]"
                >
                  <span className="font-mono font-bold text-foreground">{o.numOf}</span>
                  <span className="font-mono text-muted-foreground">{o.article}</span>
                  <span className="truncate text-muted-foreground" title={o.designation ?? ''}>
                    {o.designation ?? '—'}
                  </span>
                  <span className="text-right font-mono tabular-nums text-destructive">
                    {fmtQty(o.qteManquante)}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {fmtDay(o.besoinIso)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Ce qui rentre : commandes d'achat ouvertes, dans l'ordre d'arrivée. */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
              <Truck size={12} strokeWidth={2} />
              RÉCEPTIONS ATTENDUES
              {r.delaiAppro !== null && (
                <span className="font-normal normal-case tracking-normal">
                  · délai appro {r.delaiAppro} j
                </span>
              )}
            </div>
            {r.receptions.length === 0 ? (
              <div className="text-[11px] italic text-destructive">
                Aucune commande d’achat ouverte sur ce composant.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {r.receptions.map((rec, i) => (
                  <div
                    key={`${rec.id}-${rec.dateIso}-${i}`}
                    className="grid grid-cols-[7rem_1fr_5rem_5rem_5rem] items-center gap-2 text-[11px]"
                  >
                    <span className="font-mono font-bold text-foreground">{rec.id || '—'}</span>
                    <span className="truncate text-muted-foreground" title={rec.supplier}>
                      {rec.supplier || '—'}
                    </span>
                    <span className="text-right font-mono tabular-nums text-foreground">
                      {fmtQty(rec.qty)}
                    </span>
                    <span
                      className={cn(
                        'font-mono tabular-nums',
                        rec.enRetard ? 'font-bold text-destructive' : 'text-foreground'
                      )}
                      title={rec.enRetard ? 'Attendue dans le passé, non reçue' : undefined}
                    >
                      {fmtDay(rec.dateIso)}
                    </span>
                    <span className="text-right font-mono tabular-nums text-muted-foreground">
                      Σ {fmtQty(rec.qteCumulee)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
