/**
 * Page « Évolution des besoins » — réécrite en réutilisant strictement les
 * composants existants (AppLayout dense, ToolbarRow/Segment/PILL/RefreshPill,
 * Card, DataTable, Badge, Select, LoadingState). Aucune tuile custom, aucun
 * style inventé : même tokens, mêmes primitives que Réceptions et
 * Conditionnements.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, CloudOff, Info, Search } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import { Badge } from '@r/components/ui/badge'
import { Card, CardContent } from '@r/components/ui/card'
import { StockArticleSheet } from '@r/components/board/stock-article-sheet'
import { DataTable, type ColumnDef } from '@r/components/ui/data-table'
import {
  PILL,
  RefreshPill,
  Segment,
  SegmentButton,
  ToolbarRow,
  ToolbarSpacer,
} from '@r/components/vision/toolbar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@r/components/ui/select'
import { cn } from '@r/lib/utils'

type Photo = { date: string; lignes: number; sources: number }
type DriverSource =
  | 'of_ferme'
  | 'of_planifie'
  | 'of_suggestion'
  | 'demande_ferme'
  | 'demande_prevision'
  | 'stock'
  | 'appro'
  | 'appro_suggestion'
type DriverNature = 'apparue' | 'disparue' | 'quantite' | 'date'
interface DriverDiffEntry {
  article: string
  source: DriverSource
  nature: DriverNature
  quantiteAvant: number | null
  quantiteApres: number | null
  echeanceAvant: string | null
  echeanceApres: string | null
  detail: string
  designation: string | null
  famille: string | null
  vcrnum: string | null
  vcrlin: string | null
}
interface DriversDiffResponse {
  avant: string | null
  apres: string | null
  total: number
  parSource?: Record<string, number>
  parNature?: Record<string, number>
  entrees: DriverDiffEntry[]
  message?: string
}

const SOURCE_LABEL: Record<DriverSource, string> = {
  demande_ferme: 'Commandes',
  demande_prevision: 'Prévisions',
  stock: 'Stock',
  appro: 'Réceptions',
  of_ferme: 'OF fermes',
  of_planifie: 'OF planifiés',
  of_suggestion: 'OF suggérés',
  appro_suggestion: 'Suggestions CBN',
}
const SOURCES_REALITE: DriverSource[] = [
  'stock',
  'demande_ferme',
  'demande_prevision',
  'appro',
  'of_ferme',
]
const SOURCES_PROPOSITIONS: DriverSource[] = ['of_planifie', 'of_suggestion', 'appro_suggestion']
const NATURE_LABEL: Record<DriverNature, string> = {
  apparue: 'Apparue',
  disparue: 'Disparue',
  quantite: 'Qté',
  date: 'Date',
}
const NATURES: DriverNature[] = ['apparue', 'disparue', 'quantite', 'date']

const fmtJJMMAAAA = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}
const fmtJJMM = (iso: string | null): string => (iso ? fmtJJMMAAAA(iso) : '—')
const fmtQte = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtQteSigned = (n: number): string =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtQte.format(Math.abs(n))}`
const joursEntre = (a: string | null, b: string | null): number | null => {
  if (!a || !b) return null
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null
  return Math.round((db - da) / 86_400_000)
}
const ecartLabel = (e: DriverDiffEntry): string => {
  if (e.nature === 'apparue') return `+${fmtQte.format(e.quantiteApres ?? 0)}`
  if (e.nature === 'disparue') return `−${fmtQte.format(e.quantiteAvant ?? 0)}`
  if (e.nature === 'date') {
    const d = joursEntre(e.echeanceAvant, e.echeanceApres)
    return d === null ? '—' : `${d > 0 ? '+' : ''}${d} j`
  }
  if (e.quantiteAvant !== null && e.quantiteApres !== null) {
    const delta = e.quantiteApres - e.quantiteAvant
    const base = Math.abs(Math.min(e.quantiteAvant, e.quantiteApres)) || 1
    const pct = Math.round((Math.abs(delta) / base) * 100)
    return `${fmtQteSigned(delta)} · ${delta > 0 ? '+' : '−'}${pct}%`
  }
  return '—'
}
const avantApresLabel = (e: DriverDiffEntry): string => {
  if (e.nature === 'date') return `${fmtJJMM(e.echeanceAvant)} → ${fmtJJMM(e.echeanceApres)}`
  const av = e.quantiteAvant === null ? '—' : fmtQte.format(e.quantiteAvant)
  const ap = e.quantiteApres === null ? '—' : fmtQte.format(e.quantiteApres)
  return `${av} → ${ap}`
}
const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export default function BesoinsEvolution() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photosLoading, setPhotosLoading] = useState(true)
  const [photosError, setPhotosError] = useState<string | null>(null)
  const [avant, setAvant] = useState<string | null>(null)
  const [apres, setApres] = useState<string | null>(null)
  const [diff, setDiff] = useState<DriversDiffResponse | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<DriverSource | null>(null)
  const [natureFilter, setNatureFilter] = useState<DriverNature | null>(null)
  const [search, setSearch] = useState('')
  const [sheetArticle, setSheetArticle] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const reloadPhotos = async () => {
    setPhotosLoading(true)
    setPhotosError(null)
    try {
      const res = await fetch('/api/v1/appro/snapshots')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { photos: Photo[] }
      const list = json.photos ?? []
      setPhotos(list)
      if (list.length >= 2) {
        const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date))
        setApres(sorted[0].date)
        setAvant(sorted[1].date)
      } else if (list.length === 1) {
        setApres(list[0].date)
        setAvant(null)
      }
    } catch (e) {
      setPhotosError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhotosLoading(false)
    }
  }
  useEffect(() => {
    reloadPhotos()
  }, [])

  const reloadDiff = async () => {
    if (!avant || !apres) return
    setDiffLoading(true)
    setDiffError(null)
    try {
      const url = `/api/v1/appro/drivers-diff?avant=${encodeURIComponent(avant)}&apres=${encodeURIComponent(apres)}&limit=1000`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as DriversDiffResponse
      setDiff(json)
    } catch (e) {
      setDiffError(e instanceof Error ? e.message : String(e))
    } finally {
      setDiffLoading(false)
    }
  }
  useEffect(() => {
    if (avant && apres) reloadDiff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avant, apres])

  const filtered = useMemo(() => {
    if (!diff) return []
    let out = diff.entrees
    if (sourceFilter) out = out.filter((e) => e.source === sourceFilter)
    if (natureFilter) out = out.filter((e) => e.nature === natureFilter)
    if (search.trim()) {
      const q = fold(search.trim())
      out = out.filter(
        (e) => fold(e.article).includes(q) || (e.designation && fold(e.designation).includes(q))
      )
    }
    return out
  }, [diff, sourceFilter, natureFilter, search])

  const total = diff?.total ?? 0
  const entrees = diff?.entrees ?? []
  const parSource = diff?.parSource ?? {}
  const hasMessage = Boolean(diff?.message)
  const photoOptions = useMemo(
    () => [...photos].sort((a, b) => b.date.localeCompare(a.date)),
    [photos]
  )
  const rangeLabel =
    avant && apres ? `${fmtJJMMAAAA(avant)} → ${fmtJJMMAAAA(apres)}` : photosLoading ? '…' : '—'

  const columns = useMemo<ColumnDef<DriverDiffEntry>[]>(
    () => [
      {
        id: 'article',
        header: 'Article',
        accessorFn: (r) => r.article,
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex flex-col">
              <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                {r.article}
              </span>
              <span
                className="max-w-[220px] truncate text-xs leading-tight text-muted-foreground"
                title={r.designation ?? ''}
              >
                {r.designation ?? <span className="italic text-muted-soft">sans désignation</span>}
              </span>
              {r.famille && (
                <span className="font-mono text-[10px] tabular-nums text-muted-soft">
                  {r.famille}
                </span>
              )}
            </div>
          )
        },
        meta: { tdClass: 'px-3 py-2', thClass: 'px-3 py-2' },
      },
      {
        id: 'piece',
        header: 'Pièce',
        accessorFn: (r) => r.vcrnum ?? '',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          if (!r.vcrnum) return <span className="font-mono text-xs text-muted-soft">—</span>
          const label = r.vcrlin ? `${r.vcrnum} L${r.vcrlin}` : r.vcrnum
          return (
            <span className="font-mono text-xs tabular-nums text-foreground" title={label}>
              {label}
            </span>
          )
        },
        meta: { tdClass: 'px-3 py-2', thClass: 'px-3 py-2' },
      },
      {
        id: 'source',
        header: 'Source',
        accessorFn: (r) => r.source,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
            {SOURCE_LABEL[row.original.source]}
          </span>
        ),
      },
      {
        id: 'nature',
        header: 'Nature',
        accessorFn: (r) => r.nature,
        enableSorting: false,
        cell: ({ row }) => {
          const n = row.original.nature
          return (
            <Badge
              variant="outline"
              className={cn(
                'rounded-full font-mono text-[11px]',
                n === 'apparue' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
                n === 'disparue' && 'border-border bg-muted text-muted-foreground',
                n === 'quantite' && 'border-amber-200 bg-amber-50 text-amber-900',
                n === 'date' && 'border-sky-200 bg-sky-50 text-sky-900'
              )}
            >
              {NATURE_LABEL[n]}
            </Badge>
          )
        },
      },
      {
        id: 'avantApres',
        header: 'Avant → Après',
        enableSorting: false,
        accessorFn: (r) => `${r.quantiteAvant ?? ''}->${r.quantiteApres ?? ''}`,
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-foreground">
            {avantApresLabel(row.original)}
          </span>
        ),
      },
      {
        id: 'ecart',
        header: 'Écart',
        accessorFn: (r) => ecartLabel(r),
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
            {ecartLabel(row.original)}
          </span>
        ),
      },
      {
        id: 'detail',
        header: 'Détail',
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className="line-clamp-2 max-w-[360px] text-xs leading-[1.4] text-muted-foreground"
            title={row.original.detail}
          >
            {row.original.detail}
          </span>
        ),
      },
    ],
    []
  )

  return (
    <AppLayout
      active="besoins-evolution"
      subtitle="Évolution des besoins"
      title="Évolution des besoins — Supply Chain Board"
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <>
          <div className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
            {rangeLabel}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {diff
              ? `${fmtQte.format(total)} mouvement${total > 1 ? 's' : ''}`
              : photosLoading
                ? '…'
                : '—'}
          </div>
        </>
      }
    >
      <div className="flex h-full flex-col overflow-hidden">
        <ToolbarRow>
          <span className="hidden sm:inline font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Photos
          </span>
          <Select value={avant ?? ''} onValueChange={(v) => setAvant(v || null)}>
            <SelectTrigger className="h-8 min-w-[148px] rounded-full border-border bg-card font-mono text-xs tabular-nums">
              <SelectValue placeholder="Référence" />
            </SelectTrigger>
            <SelectContent>
              {photoOptions.map((p) => (
                <SelectItem key={p.date} value={p.date}>
                  {fmtJJMMAAAA(p.date)} · {fmtQte.format(p.lignes)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="font-mono text-xs text-muted-foreground">→</span>
          <Select value={apres ?? ''} onValueChange={(v) => setApres(v || null)}>
            <SelectTrigger className="h-8 min-w-[148px] rounded-full border-border bg-card font-mono text-xs tabular-nums">
              <SelectValue placeholder="Comparée" />
            </SelectTrigger>
            <SelectContent>
              {photoOptions.map((p) => (
                <SelectItem key={p.date} value={p.date}>
                  {fmtJJMMAAAA(p.date)} · {fmtQte.format(p.lignes)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Segment>
            {NATURES.map((n) => (
              <SegmentButton
                key={n}
                active={natureFilter === n}
                onClick={() => setNatureFilter((v) => (v === n ? null : n))}
              >
                {NATURE_LABEL[n]}
              </SegmentButton>
            ))}
          </Segment>
          <ToolbarSpacer />
          <div className={PILL}>
            <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[200px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
              placeholder="Article ou désignation"
              type="text"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="hidden xl:inline font-mono text-xs tabular-nums text-muted-foreground">
            {filtered.length} / {entrees.length}
            {total > entrees.length ? ` · ${fmtQte.format(total)}` : ''}
          </span>
          <RefreshPill
            loading={photosLoading || diffLoading}
            onClick={() => (avant && apres ? reloadDiff() : reloadPhotos())}
          />
        </ToolbarRow>

        <div className="hidden flex-none items-baseline justify-between border-b border-border px-7 pb-3 pt-1 print:flex">
          <span className="text-[20px] font-semibold tracking-tight text-foreground">
            Évolution des besoins{' '}
            <span className="ml-3 font-mono text-[13px] font-normal text-muted-foreground">
              {rangeLabel}
            </span>
          </span>
          <span className="font-mono text-[12px] text-muted-foreground">
            {fmtQte.format(total)} mouvements
          </span>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden bg-surface-soft">
          <div className="flex-1 overflow-auto">
            <div className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 lg:px-7">
              <div className="mb-4">
                <h1 className="text-[20px] font-extrabold leading-none tracking-[-0.02em] text-foreground">
                  Évolution des besoins
                </h1>
                <p className="mt-1.5 max-w-[68ch] text-[13px] leading-[1.5] text-muted-foreground">
                  Ce que le CBN a vu bouger entre deux nuits — le besoin brut, pas le message. Le
                  bandeau dit où regarder, la table est triée par amplitude relative (ratio, pas
                  absolu).
                </p>
              </div>

              {photosError && (
                <div className="mb-4 flex items-center gap-2 rounded-[8px] border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle size={14} /> {photosError}
                </div>
              )}

              {photosLoading ? null : photos.length < 2 ? (
                <Card className="p-8 text-center">
                  <div className="mx-auto flex max-w-[520px] flex-col items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-full border border-border bg-card">
                      <CalendarRange size={18} className="text-muted-foreground" />
                    </div>
                    <h2 className="text-[15px] font-semibold text-foreground">
                      L&apos;historique commence
                    </h2>
                    <p className="text-sm leading-[1.5] text-muted-foreground">
                      Une seconde photo est nécessaire — elle arrivera cette nuit.
                      {photos.length === 1 && (
                        <>
                          <br />
                          Photo existante :{' '}
                          <span className="font-mono tabular-nums text-foreground">
                            {fmtJJMMAAAA(photos[0].date)}
                          </span>{' '}
                          · {fmtQte.format(photos[0].lignes)} lignes
                        </>
                      )}
                      {photos.length === 0 && ' Aucune photo disponible.'}
                    </p>
                  </div>
                </Card>
              ) : hasMessage ? (
                <Card className="p-6">
                  <div className="flex gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50">
                      <CloudOff size={16} className="text-amber-700" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Photo indisponible</h3>
                      <p className="mt-1 text-sm leading-[1.5] text-muted-foreground">
                        {diff?.message}
                      </p>
                      {avant && apres && (
                        <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                          Couple demandé : {fmtJJMMAAAA(avant)} → {fmtJJMMAAAA(apres)}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ) : diffError ? (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
                  <AlertTriangle size={16} strokeWidth={1.75} className="text-destructive" />
                  <span className="font-bold">Erreur chargement :</span>
                  <span className="font-mono">{diffError}</span>
                </div>
              ) : diffLoading ? (
                <LoadingState
                  title="Comparaison des deux photos…"
                  description="~73 000 lignes lues"
                  variant="orb"
                  orbState="searching"
                  className="py-10"
                />
              ) : (
                <>
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Ce qui a changé dans la réalité
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                        {SOURCES_REALITE.map((src) => {
                          const count = parSource[src] ?? 0
                          const active = sourceFilter === src
                          return (
                            <Card
                              key={src}
                              onClick={() => setSourceFilter((v) => (v === src ? null : src))}
                              className={cn(
                                'cursor-pointer p-3 transition',
                                count === 0 && 'opacity-60',
                                active && 'border-foreground bg-foreground text-card',
                                !active && count > 0 && 'hover:border-foreground/15'
                              )}
                            >
                              <CardContent className="p-0">
                                <div
                                  className={cn(
                                    'text-xs font-semibold leading-tight',
                                    active ? 'text-card' : 'text-foreground'
                                  )}
                                >
                                  {SOURCE_LABEL[src]}
                                </div>
                                <div
                                  className={cn(
                                    'mt-0.5 font-mono text-[11px] tabular-nums',
                                    active ? 'text-card/80' : 'text-muted-foreground'
                                  )}
                                >
                                  {count === 0 ? '—' : fmtQte.format(count)}
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Ce que le CBN propose
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                          Sortie CBN
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {SOURCES_PROPOSITIONS.map((src) => {
                          const count = parSource[src] ?? 0
                          const active = sourceFilter === src
                          return (
                            <Card
                              key={src}
                              onClick={() => setSourceFilter((v) => (v === src ? null : src))}
                              className={cn(
                                'cursor-pointer p-3 transition',
                                count === 0 && 'opacity-60',
                                active && 'border-foreground bg-foreground text-card',
                                !active && 'hover:border-foreground/15'
                              )}
                            >
                              <CardContent className="p-0">
                                <div
                                  className={cn(
                                    'text-xs font-semibold leading-tight',
                                    active ? 'text-card' : 'text-foreground'
                                  )}
                                >
                                  {SOURCE_LABEL[src]}
                                </div>
                                <div
                                  className={cn(
                                    'mt-0.5 font-mono text-[11px] tabular-nums',
                                    active ? 'text-card/80' : 'text-muted-foreground'
                                  )}
                                >
                                  {count === 0 ? '—' : fmtQte.format(count)}
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {total > entrees.length && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <Info size={14} /> {entrees.length} affichés sur {fmtQte.format(total)} —
                      affinez par source ou nature.
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2 border-b border-border/50 px-1 py-1.5">
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {filtered.length} ligne{filtered.length > 1 ? 's' : ''} · tri ratio
                    </span>
                    {(sourceFilter || natureFilter || search) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSourceFilter(null)
                          setNatureFilter(null)
                          setSearch('')
                        }}
                        className="ml-auto font-mono text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Effacer les filtres
                      </button>
                    )}
                  </div>

                  {total === 0 ? (
                    <Card className="mt-4 p-8 text-center">
                      <p className="text-sm font-semibold text-foreground">
                        Aucun mouvement au-delà des seuils
                      </p>
                      <p className="mt-1 text-sm leading-[1.5] text-muted-foreground">
                        Entre le{' '}
                        <span className="font-mono tabular-nums text-foreground">
                          {fmtJJMMAAAA(avant!)}
                        </span>{' '}
                        et le{' '}
                        <span className="font-mono tabular-nums text-foreground">
                          {fmtJJMMAAAA(apres!)}
                        </span>
                        , aucune des 8 sources n&apos;a bougé.
                      </p>
                      <div className="mt-3 inline-block rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                        Seuils : quantité ±20 % · échéance ±7 j
                      </div>
                    </Card>
                  ) : (
                    <div className="mt-4">
                      <DataTable
                        columns={columns}
                        rows={filtered}
                        sorting={[]}
                        onSortingChange={() => {}}
                        getRowKey={(r) => `${r.article}-${r.source}-${r.nature}`}
                        onRowClick={(r) => {
                          setSheetArticle(r.article)
                          setSheetOpen(true)
                        }}
                        emptyState={
                          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                            <span className="text-sm text-muted-foreground">
                              Aucun résultat avec ces filtres.
                            </span>
                          </div>
                        }
                      />
                      <p className="mt-3 text-center font-mono text-[11px] text-muted-foreground">
                        Tri par amplitude relative (ratio), pas absolu · Un article 10 → 0 passe
                        avant un stock qui bouge de 2 %.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <StockArticleSheet article={sheetArticle} open={sheetOpen} onOpenChange={setSheetOpen} />
    </AppLayout>
  )
}
