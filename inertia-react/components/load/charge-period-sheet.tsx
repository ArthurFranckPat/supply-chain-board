import { useEffect, useMemo, useState } from 'react'
import { CircleX, RefreshCw, TriangleAlert, Gauge } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { route } from '@/lib/routes'
import type { LoadPeriod, LoadView } from '@/lib/load/types'
import { type Gran, segKeys, segLabel } from '@/lib/load/chart-math'

/**
 * Détail d'une période de charge — ce qui compose UNE barre du graphe /charge.
 *
 * Alimenté par GET /api/v1/planning/charge/detail, qui repart des mêmes entrées
 * que l'agrégat et filtre sur (poste, bucket) au lieu de sommer.
 *
 * Le filtre statut/nature et la bascule brut/net sont appliqués ICI, avec le
 * jeu de segments que la page applique déjà au graphe : le total de la table
 * suit donc la hauteur de la barre par construction, sans re-fetch quand
 * l'utilisateur change de filtre.
 */

type SegField = keyof LoadPeriod

interface DetailOfRow {
  numOf: string
  article: string
  designation: string | null
  statutLabel: string | null
  quantite: number
  dateIso: string
  field: 'f' | 'p' | 's'
  hours: number
}

interface DetailCmdRow {
  article: string
  designation: string | null
  depth: number
  parent: string | null
  pfArticle: string
  numCommande: string | null
  ligne: string | null
  client: string | null
  dateIso: string
  field: SegField
  brutQty: number
  netQty: number
  brutHours: number
  netHours: number
}

interface DetailPayload {
  view: LoadView
  poste: { code: string; label: string }
  bucket: { key: string; gran: Gran; label: string; fromIso: string; toIso: string }
  ofRows: DetailOfRow[]
  cmdRows: DetailCmdRow[]
  x3Error: string | null
}

export interface ChargePeriodSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Poste + période demandés (null = rien à charger). */
  target: { poste: string; bucketKey: string; gran: Gran; periodLabel: string } | null
  view: LoadView
  /** Ancrage d'horizon de la page — le détail doit viser la même fenêtre. */
  start?: string
  /** Segments actifs (ids d'option), miroir du filtre de la toolbar. */
  activeSegs: ReadonlySet<string>
  /** Bascule brut/net de la vue commande. */
  net: boolean
}

/** ISO YYYY-MM-DD → JJ/MM/AAAA (jamais d'ISO brut à l'écran). */
const fmtDateFr = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

const fmtH = (h: number) => (Math.round(h * 10) / 10).toFixed(1).replace('.', ',')
const fmtQ = (q: number) => Math.round(q).toLocaleString('fr-FR')

/** Niveau BOM : depth 0 = produit fini, au-delà = composant induit. */
const nivLabel = (depth: number) => (depth === 0 ? 'PF' : `N-${depth}`)

export function ChargePeriodSheet(props: ChargePeriodSheetProps) {
  const { target, view, start, activeSegs, net } = props
  const [data, setData] = useState<DetailPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const poste = target?.poste ?? null
  const bucketKey = target?.bucketKey ?? null
  const gran = target?.gran ?? null

  useEffect(() => {
    if (!props.open || !poste || !bucketKey || !gran) return
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ poste, bucket: bucketKey, gran, view })
    if (start) qs.set('start', start)
    fetch(`${route('charge.detail')}?${qs.toString()}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<DetailPayload>
      })
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Échec du chargement')
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [props.open, poste, bucketKey, gran, view, start])

  // Masque identique à celui du graphe — même source (`segKeys`).
  const keep = useMemo(() => segKeys(view, activeSegs), [view, activeSegs])

  const ofRows = useMemo(
    () => (data?.view === 'of' ? data.ofRows.filter((r) => keep.has(r.field)) : []),
    [data, keep]
  )
  const cmdRows = useMemo(
    () => (data?.view === 'commande' ? data.cmdRows.filter((r) => keep.has(r.field)) : []),
    [data, keep]
  )

  const cmdHours = (r: DetailCmdRow) => (net ? r.netHours : r.brutHours)
  const totalHours = useMemo(() => {
    if (data?.view === 'of') return ofRows.reduce((a, r) => a + r.hours, 0)
    return cmdRows.reduce((a, r) => a + cmdHours(r), 0)
  }, [data, ofRows, cmdRows, net])

  const rowCount = data?.view === 'of' ? ofRows.length : cmdRows.length
  // Les lignes à 0 h nette existent (besoin entièrement couvert par le stock) :
  // elles restent visibles en net, sinon la table ne totaliserait pas la barre
  // mais n'expliquerait pas non plus pourquoi la charge a disparu.

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[72vh] w-full max-w-none flex-col gap-0 rounded-t-[16px] p-0"
      >
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
            <RefreshCw size={26} strokeWidth={1.75} className="animate-spin" />
            <span className="text-sm">Chargement…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-destructive">
            <CircleX size={26} strokeWidth={1.75} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : !data ? null : (
          <>
            {/* Identité poste + période + total (recalculé selon le filtre actif). */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-secondary px-5 py-3 pr-14">
              <Gauge size={18} strokeWidth={1.75} className="self-center text-brand" />
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[13px] font-bold text-foreground">
                  {data.poste.code}
                </span>
                <SheetTitle className="font-fraunces text-[14px] font-medium italic text-muted-foreground">
                  {data.poste.label}
                </SheetTitle>
              </div>
              <span className="rounded-full border border-rule bg-card px-2.5 py-1 font-mono text-[10px] font-semibold text-secondary-foreground">
                {data.bucket.label}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {fmtDateFr(data.bucket.fromIso)} → {fmtDateFr(data.bucket.toIso)}
              </span>
              <span className="flex-1" />
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {rowCount} {view === 'of' ? 'OF' : 'besoins'}
                </span>
                <span className="h-4 w-px bg-border" />
                <div className="flex items-baseline gap-1">
                  <span className="font-fraunces text-[17px] font-bold tabular-nums text-foreground">
                    {fmtH(totalHours)}
                  </span>
                  <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                    h {view === 'commande' && (net ? '· net' : '· brut')}
                  </span>
                </div>
              </div>
            </div>

            {data.x3Error && (
              <div className="flex flex-none items-start gap-2 border-b border-brand/30 bg-brand-soft px-5 py-2 text-[12px] text-foreground">
                <TriangleAlert size={16} strokeWidth={1.75} className="mt-px text-brand" />
                <span className="flex-none font-bold">Chargement partiel :</span>
                <span className="break-all font-mono">{data.x3Error}</span>
              </div>
            )}

            {rowCount === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
                <Gauge size={26} strokeWidth={1.75} />
                <span className="font-fraunces text-[13px] italic">
                  Aucune charge sur cette période avec le filtre actif.
                </span>
              </div>
            ) : view === 'of' ? (
              <div className="flex-1 overflow-auto">
                <div className="sticky top-0 z-10 grid grid-cols-[7rem_7rem_1.6fr_6rem_6rem_5rem_5rem] items-center gap-3 border-b border-border bg-secondary px-5 py-2 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                  <span>OF</span>
                  <span>ARTICLE</span>
                  <span>DÉSIGNATION</span>
                  <span>STATUT</span>
                  <span>DÉBUT</span>
                  <span className="text-right">QTÉ</span>
                  <span className="text-right">HEURES</span>
                </div>
                {ofRows.map((r) => (
                  <div
                    key={r.numOf}
                    className="grid grid-cols-[7rem_7rem_1.6fr_6rem_6rem_5rem_5rem] items-center gap-3 border-b border-rule-soft px-5 py-2 text-[12px]"
                  >
                    <span className="font-mono font-semibold text-foreground">{r.numOf}</span>
                    <span className="font-mono text-secondary-foreground">{r.article}</span>
                    <span className="truncate text-muted-foreground">{r.designation ?? '—'}</span>
                    <span className="flex items-center gap-1.5">
                      <i
                        className="inline-block size-2 rounded-[2px]"
                        style={{ background: `var(--color-${segColorVar(r.field)})` }}
                      />
                      <span className="text-secondary-foreground">{segLabel('of', r.field)}</span>
                    </span>
                    <span className="font-mono text-secondary-foreground">
                      {fmtDateFr(r.dateIso)}
                    </span>
                    <span className="text-right font-mono tabular-nums text-secondary-foreground">
                      {fmtQ(r.quantite)}
                    </span>
                    <span className="text-right font-mono font-bold tabular-nums text-foreground">
                      {fmtH(r.hours)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <div className="sticky top-0 z-10 grid grid-cols-[7rem_1.4fr_4rem_7rem_8rem_1fr_6rem_5rem_5rem] items-center gap-3 border-b border-border bg-secondary px-5 py-2 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                  <span>ARTICLE</span>
                  <span>DÉSIGNATION</span>
                  <span>NIVEAU</span>
                  <span>VIA</span>
                  <span>COMMANDE</span>
                  <span>CLIENT</span>
                  <span>ÉCHÉANCE</span>
                  <span className="text-right">QTÉ</span>
                  <span className="text-right">HEURES</span>
                </div>
                {cmdRows.map((r, i) => (
                  <div
                    key={`${r.article}-${r.numCommande ?? ''}-${r.ligne ?? ''}-${i}`}
                    className="grid grid-cols-[7rem_1.4fr_4rem_7rem_8rem_1fr_6rem_5rem_5rem] items-center gap-3 border-b border-rule-soft px-5 py-2 text-[12px]"
                  >
                    <span className="font-mono font-semibold text-foreground">{r.article}</span>
                    <span className="truncate text-muted-foreground">{r.designation ?? '—'}</span>
                    <span
                      className={cn(
                        'font-mono text-[10px] font-bold',
                        r.depth === 0 ? 'text-brand' : 'text-muted-foreground'
                      )}
                      title={
                        r.depth === 0
                          ? 'Produit fini — charge directe'
                          : `Composant induit, niveau ${r.depth}`
                      }
                    >
                      {nivLabel(r.depth)}
                    </span>
                    {/* Chemin BOM : parent immédiat, et le PF de tête s'il diffère. */}
                    <span className="truncate font-mono text-[11px] text-secondary-foreground">
                      {r.depth === 0 ? '—' : (r.parent ?? '—')}
                    </span>
                    <span className="font-mono text-[11px] text-secondary-foreground">
                      {r.numCommande ?? '—'}
                      {r.ligne && <span className="text-muted-foreground">/{r.ligne}</span>}
                    </span>
                    {/* Une prévision n'a pas de client côté X3 : on le dit. */}
                    <span className="truncate text-muted-foreground">
                      {r.client ?? (
                        <span className="font-fraunces italic">prévision — sans client</span>
                      )}
                    </span>
                    <span className="font-mono text-secondary-foreground">
                      {fmtDateFr(r.dateIso)}
                    </span>
                    <span className="text-right font-mono tabular-nums text-secondary-foreground">
                      {fmtQ(net ? r.netQty : r.brutQty)}
                    </span>
                    <span className="text-right font-mono font-bold tabular-nums text-foreground">
                      {fmtH(cmdHours(r))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** Champ de segment → nom de variable CSS de couleur (parité avec le graphe). */
function segColorVar(field: 'f' | 'p' | 's'): string {
  return field === 'f' ? 'ferme' : field === 'p' ? 'planifie' : 'suggere'
}
