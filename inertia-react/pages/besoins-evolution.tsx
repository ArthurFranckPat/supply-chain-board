/**
 * Page « Évolution des besoins » (#138 lot 1 bis).
 *
 * THESIS: Rendre visible ce que le CBN a vu bouger entre deux nuits — pas le
 * message, mais le besoin brut qui l'a provoqué. La table n'est pas une fin,
 * le bandeau de synthèse est le point d'entrée : 8 tuiles qui disent où
 * regarder, filtrent au clic, séparent la réalité (stocks, commandes,
 * prévisions, réceptions, OF fermes) des propositions CBN (OF suggérés,
 * suggestions d'achat, OF planifiés). Refusé : l'accordéon fournisseur ou le
 * graphe multi-jours — lot 1 = lecture, pas décision.
 * OWN-WORLD: grammaire Airbnb — feuilles blanches sur surface-soft, hairlines
 * #ddd, encre #222, Plus Jakarta Sans tabular-nums, pastilles d'état
 * existantes conservées. Rausch absent (pas de CTA sur une surface de lecture).
 * STORY: l'approvisionneur choisit deux photos, voit en un coup d'œil quelles
 * sources ont bougé, affine par source/nature/recherche, ouvre la fiche article.
 * FIRST VIEWPORT: en-tête + sélecteur de couple (jj/mm/aaaa) ; bandeau 8 tuiles
 * groupées (réalité vs CBN) ; toolbar filtres (nature, recherche) ; tableau.
 * FORM: table + tuiles de synthèse — candidate 3 de la liste ordonnée.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 * finish review, the verdict, and DESIGN.md.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Boxes,
  CalendarRange,
  Factory,
  FileText,
  Inbox,
  Package,
  Search,
  ShoppingCart,
  Truck,
  Layers,
  RefreshCw,
  CloudOff,
  Info,
} from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import { Input } from '@r/components/ui/input'
import { Button } from '@r/components/ui/button'
import { Badge } from '@r/components/ui/badge'
import { StockArticleSheet } from '@r/components/board/stock-article-sheet'
import { cn } from '@r/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constantes métier (§6 PRD)
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<DriverSource, string> = {
  demande_ferme: 'Commandes client',
  demande_prevision: 'Prévisions',
  stock: 'Stock strict',
  appro: 'Réceptions attendues',
  of_ferme: 'OF fermes',
  of_planifie: 'OF planifiés',
  of_suggestion: 'OF suggérés',
  appro_suggestion: "Suggestions d'achat CBN",
}

const SOURCE_ICON: Record<DriverSource, typeof Package> = {
  stock: Boxes,
  demande_ferme: ShoppingCart,
  demande_prevision: FileText,
  appro: Truck,
  of_ferme: Factory,
  of_planifie: Layers,
  of_suggestion: Layers,
  appro_suggestion: Package,
}

const SOURCES_REALITE: DriverSource[] = [
  'stock',
  'demande_ferme',
  'demande_prevision',
  'appro',
  'of_ferme',
]
const SOURCES_PROPOSITIONS: DriverSource[] = ['of_planifie', 'of_suggestion', 'appro_suggestion']
const ALL_SOURCES = [...SOURCES_REALITE, ...SOURCES_PROPOSITIONS] as DriverSource[]

const NATURE_LABEL: Record<DriverNature, string> = {
  apparue: 'Apparue',
  disparue: 'Disparue',
  quantite: 'Quantité',
  date: 'Date',
}

const NATURES: DriverNature[] = ['apparue', 'disparue', 'quantite', 'date']

// ---------------------------------------------------------------------------
// Helpers dates / format
// ---------------------------------------------------------------------------

const fmtJJMMAAAA = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

const fmtJJMM = (iso: string | null): string => {
  if (!iso) return '—'
  return fmtJJMMAAAA(iso)
}

const fmtQte = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtQteSigned = (n: number): string => {
  const s = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${s}${fmtQte.format(Math.abs(n))}`
}

const joursEntre = (a: string | null, b: string | null): number | null => {
  if (!a || !b) return null
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null
  return Math.round((db - da) / 86_400_000)
}

const ecartLabel = (e: DriverDiffEntry): string => {
  if (e.nature === 'apparue') {
    const q = e.quantiteApres ?? 0
    return `+${fmtQte.format(q)}`
  }
  if (e.nature === 'disparue') {
    const q = e.quantiteAvant ?? 0
    return `−${fmtQte.format(q)}`
  }
  if (e.nature === 'date') {
    const d = joursEntre(e.echeanceAvant, e.echeanceApres)
    if (d === null) return '—'
    return `${d > 0 ? '+' : ''}${d} j`
  }
  // quantite
  if (e.quantiteAvant !== null && e.quantiteApres !== null) {
    const delta = e.quantiteApres - e.quantiteAvant
    const base = Math.abs(Math.min(e.quantiteAvant, e.quantiteApres)) || 1
    const ratio = Math.abs(delta) / base
    const pct = Math.round(ratio * 100)
    return `${fmtQteSigned(delta)}  ·  ${delta > 0 ? '+' : '−'}${pct} %`
  }
  return '—'
}

const avantApresLabel = (e: DriverDiffEntry): string => {
  if (e.nature === 'date') {
    return `${fmtJJMM(e.echeanceAvant)} → ${fmtJJMM(e.echeanceApres)}`
  }
  const av = e.quantiteAvant === null ? '—' : fmtQte.format(e.quantiteAvant)
  const ap = e.quantiteApres === null ? '—' : fmtQte.format(e.quantiteApres)
  return `${av} → ${ap}`
}

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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

  // Fetch snapshots
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
        // Défaut = deux dernières (plus récentes d'abord)
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

  // Fetch diff when couple changes
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

  // Filtrage client (affine) sur les entrées reçues — le serveur a déjà borné/trié.
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

  const handleArticleClick = (article: string) => {
    setSheetArticle(article)
    setSheetOpen(true)
  }

  // Options pour sélecteurs : tri décroissant
  const photoOptions = useMemo(
    () => [...photos].sort((a, b) => b.date.localeCompare(a.date)),
    [photos]
  )

  const swapDates = () => {
    if (avant && apres) {
      setAvant(apres)
      setApres(avant)
    }
  }

  return (
    <AppLayout
      active="besoins-evolution"
      subtitle="Évolution des besoins"
      title="Évolution des besoins — Supply Chain Board"
    >
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-7">
        {/* En-tête */}
        <div className="mb-6">
          <h1 className="font-[700] text-[22px] tracking-[-0.02em] text-foreground">
            Évolution des besoins
          </h1>
          <p className="mt-1 max-w-[65ch] text-[13px] leading-[1.5] text-muted-foreground">
            Ce que le CBN a vu bouger entre deux nuits — prévisions, commandes client, stock,
            réceptions, OF — sans le filtre « cet article porte un message ».
          </p>
        </div>

        {/* Sélecteur de couple de photos */}
        <div className="rounded-[14px] border border-hairline bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Photo de référence
              </label>
              {photosLoading ? (
                <div className="h-9 w-[160px] animate-pulse rounded-[8px] bg-surface-soft" />
              ) : (
                <select
                  value={avant ?? ''}
                  onChange={(e) => setAvant(e.target.value || null)}
                  className="h-9 min-w-[160px] rounded-[8px] border border-hairline bg-card px-3 text-sm font-medium text-foreground"
                >
                  <option value="">— choisir —</option>
                  {photoOptions.map((p) => (
                    <option key={p.date} value={p.date}>
                      {fmtJJMMAAAA(p.date)} · {fmtQte.format(p.lignes)} lignes
                    </option>
                  ))}
                </select>
              )}
              {avant && (
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {fmtJJMMAAAA(avant)}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={swapDates}
              title="Inverser les deux dates"
              className="mb-1 inline-flex size-9 items-center justify-center rounded-full border border-hairline bg-card text-muted-foreground transition hover:border-foreground hover:text-foreground"
            >
              <RefreshCw size={14} />
            </button>

            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Photo comparée
              </label>
              {photosLoading ? (
                <div className="h-9 w-[160px] animate-pulse rounded-[8px] bg-surface-soft" />
              ) : (
                <select
                  value={apres ?? ''}
                  onChange={(e) => setApres(e.target.value || null)}
                  className="h-9 min-w-[160px] rounded-[8px] border border-hairline bg-card px-3 text-sm font-medium text-foreground"
                >
                  <option value="">— choisir —</option>
                  {photoOptions.map((p) => (
                    <option key={p.date} value={p.date}>
                      {fmtJJMMAAAA(p.date)} · {fmtQte.format(p.lignes)} lignes
                    </option>
                  ))}
                </select>
              )}
              {apres && (
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {fmtJJMMAAAA(apres)}
                </span>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {photos.length > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {photos.length} photo{photos.length > 1 ? 's' : ''} · du{' '}
                  {fmtJJMMAAAA(photoOptions[photoOptions.length - 1]?.date ?? '')} au{' '}
                  {fmtJJMMAAAA(photoOptions[0]?.date ?? '')}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={reloadPhotos}
                className="h-9 rounded-full border border-hairline"
              >
                <RefreshCw size={14} className={photosLoading ? 'animate-spin' : ''} />
                Actualiser
              </Button>
            </div>
          </div>

          {photosError && (
            <div className="mt-3 flex items-center gap-2 rounded-[8px] border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              <AlertTriangle size={14} />
              {photosError}
            </div>
          )}
        </div>

        {/* États d'erreur / moins de 2 photos / illisible */}
        {photosLoading ? null : photos.length < 2 ? (
          <div className="mt-6 rounded-[14px] border border-hairline bg-surface-soft p-8 text-center">
            <div className="mx-auto flex max-w-[520px] flex-col items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-full bg-card border border-hairline">
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
                {photos.length === 0 && ' Aucune photo disponible pour le moment.'}
              </p>
            </div>
          </div>
        ) : hasMessage ? (
          <div className="mt-6 rounded-[14px] border border-hairline bg-card p-6">
            <div className="flex gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 border border-amber-200">
                <CloudOff size={16} className="text-amber-700" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Photo indisponible</h3>
                <p className="mt-1 text-sm leading-[1.5] text-muted-foreground">{diff?.message}</p>
                {avant && apres && (
                  <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                    Couple demandé : {fmtJJMMAAAA(avant)} → {fmtJJMMAAAA(apres)}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-full"
                  onClick={reloadDiff}
                >
                  <RefreshCw size={14} />
                  Réessayer
                </Button>
              </div>
            </div>
          </div>
        ) : diffError ? (
          <div className="mt-6 rounded-[14px] border border-danger/20 bg-danger/5 p-6">
            <div className="flex gap-3">
              <AlertTriangle size={18} className="text-danger" />
              <div>
                <h3 className="text-sm font-semibold text-danger">Erreur de chargement</h3>
                <p className="mt-1 text-sm text-muted-foreground">{diffError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-full"
                  onClick={reloadDiff}
                >
                  <RefreshCw size={14} />
                  Réessayer
                </Button>
              </div>
            </div>
          </div>
        ) : diffLoading ? (
          <div className="mt-6">
            <LoadingState title="Comparaison des deux photos…" description="~73 000 lignes lues" />
          </div>
        ) : (
          <>
            {/* Bandeau synthèse */}
            <div className="mt-6 space-y-4">
              {/* Groupe réalité */}
              <div>
                <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Ce qui a changé dans la réalité
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {SOURCES_REALITE.map((src) => {
                    const count = parSource[src] ?? 0
                    const isActive = sourceFilter === src
                    const Icon = SOURCE_ICON[src]
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setSourceFilter((v) => (v === src ? null : src))}
                        className={cn(
                          'flex items-center gap-2.5 rounded-[14px] border bg-card px-3.5 py-3 text-left transition',
                          count === 0
                            ? 'border-hairline-soft bg-surface-soft/60 opacity-60'
                            : isActive
                              ? 'border-foreground bg-foreground text-card shadow-sm'
                              : 'border-hairline hover:border-foreground/20 hover:bg-surface-soft'
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-full border',
                            isActive
                              ? 'border-card/20 bg-card/10 text-card'
                              : count === 0
                                ? 'border-hairline bg-card text-muted-soft'
                                : 'border-hairline bg-surface-soft text-foreground'
                          )}
                        >
                          <Icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block text-xs font-semibold leading-tight',
                              isActive
                                ? 'text-card'
                                : count === 0
                                  ? 'text-muted-foreground'
                                  : 'text-foreground'
                            )}
                          >
                            {SOURCE_LABEL[src]}
                          </span>
                          <span
                            className={cn(
                              'font-mono text-[11px] tabular-nums',
                              isActive ? 'text-card/80' : 'text-muted-foreground'
                            )}
                          >
                            {count === 0
                              ? 'aucun mouvement'
                              : `${fmtQte.format(count)} mouvement${count > 1 ? 's' : ''}`}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Groupe propositions CBN */}
              <div>
                <h2 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Ce que le CBN propose
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                    Sortie CBN
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {SOURCES_PROPOSITIONS.map((src) => {
                    const count = parSource[src] ?? 0
                    const isActive = sourceFilter === src
                    const Icon = SOURCE_ICON[src]
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setSourceFilter((v) => (v === src ? null : src))}
                        className={cn(
                          'flex items-center gap-2.5 rounded-[14px] border px-3.5 py-3 text-left transition',
                          count === 0
                            ? 'border-hairline-soft bg-amber-50/30 opacity-60'
                            : isActive
                              ? 'border-foreground bg-foreground text-card'
                              : 'border-amber-200/50 bg-amber-50/40 hover:border-amber-300 hover:bg-amber-50'
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-full border',
                            isActive
                              ? 'border-card/20 bg-card/10 text-card'
                              : 'border-amber-200 bg-card text-amber-800'
                          )}
                        >
                          <Icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block text-xs font-semibold leading-tight',
                              isActive ? 'text-card' : 'text-foreground'
                            )}
                          >
                            {SOURCE_LABEL[src]}
                          </span>
                          <span
                            className={cn(
                              'font-mono text-[11px] tabular-nums',
                              isActive ? 'text-card/80' : 'text-muted-foreground'
                            )}
                          >
                            {count === 0
                              ? 'aucun mouvement'
                              : `${fmtQte.format(count)} mouvement${count > 1 ? 's' : ''}`}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Toolbar filtres */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-0.5 rounded-full border border-hairline bg-card p-0.5">
                {NATURES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNatureFilter((v) => (v === n ? null : n))}
                    className={cn(
                      'rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold transition',
                      natureFilter === n
                        ? 'bg-foreground text-card shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {NATURE_LABEL[n]}
                  </button>
                ))}
                {natureFilter && (
                  <button
                    type="button"
                    onClick={() => setNatureFilter(null)}
                    className="rounded-full px-2 py-1.5 font-mono text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher article ou désignation…"
                  className="h-8 w-[260px] rounded-full border-hairline bg-card pl-8 text-sm"
                />
              </div>

              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {filtered.length} sur {entrees.length} affichés
                {total > entrees.length && ` · ${fmtQte.format(total)} au total`}
              </span>

              {(sourceFilter || natureFilter || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full"
                  onClick={() => {
                    setSourceFilter(null)
                    setNatureFilter(null)
                    setSearch('')
                  }}
                >
                  Effacer les filtres
                </Button>
              )}

              <div className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                Tri par amplitude · ratio, pas absolu
              </div>
            </div>

            {/* Info bornage */}
            {total > entrees.length && (
              <div className="mt-3 flex items-center gap-2 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <Info size={14} />
                {entrees.length} mouvements affichés sur {fmtQte.format(total)} — affinez par source
                ou par nature.
              </div>
            )}

            {/* Tableau / états vides */}
            {total === 0 ? (
              <div className="mt-4 rounded-[14px] border border-hairline bg-card p-8 text-center">
                <div className="mx-auto flex max-w-[560px] flex-col items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-full bg-surface-soft border border-hairline">
                    <Inbox size={18} className="text-muted-foreground" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-foreground">
                    Aucun mouvement au-delà des seuils
                  </h3>
                  <p className="text-sm leading-[1.5] text-muted-foreground">
                    Entre le{' '}
                    <span className="font-mono tabular-nums text-foreground">
                      {fmtJJMMAAAA(avant!)}
                    </span>{' '}
                    et le{' '}
                    <span className="font-mono tabular-nums text-foreground">
                      {fmtJJMMAAAA(apres!)}
                    </span>
                    , aucune des 8 sources n&apos;a bougé au-delà du bruit.
                  </p>
                  <div className="rounded-[8px] bg-surface-soft border border-hairline px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                    Seuils : quantité ±20 % · échéance ±7 jours · Élargissez l&apos;écart de dates
                    pour voir plus d&apos;écart.
                  </div>
                  <p className="text-xs text-muted-foreground">
                    « 5 mouvements sur 36 641 lignes » est une information, pas une panne.
                  </p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-4 rounded-[14px] border border-hairline bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">Aucun résultat avec ces filtres.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 rounded-full"
                  onClick={() => {
                    setSourceFilter(null)
                    setNatureFilter(null)
                    setSearch('')
                  }}
                >
                  Effacer les filtres
                </Button>
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-[14px] border border-hairline bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-hairline bg-surface-soft">
                        <th className="px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          Article
                        </th>
                        <th className="px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          Source
                        </th>
                        <th className="px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          Nature
                        </th>
                        <th className="px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          Avant → Après
                        </th>
                        <th className="px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          Écart
                        </th>
                        <th className="px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          Détail
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((e, idx) => (
                        <tr
                          key={`${e.article}-${e.source}-${e.nature}-${idx}`}
                          onClick={() => handleArticleClick(e.article)}
                          className="cursor-pointer border-b border-hairline-soft last:border-0 hover:bg-surface-soft/60"
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col">
                              <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                                {e.article}
                              </span>
                              <span
                                className="max-w-[220px] truncate text-xs leading-tight text-muted-foreground"
                                title={e.designation ?? ''}
                              >
                                {e.designation ?? (
                                  <span className="italic text-muted-soft">sans désignation</span>
                                )}
                              </span>
                              {e.famille && (
                                <span className="font-mono text-[10px] tabular-nums text-muted-soft">
                                  {e.famille}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center rounded-full border border-hairline bg-surface-soft px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
                              {SOURCE_LABEL[e.source]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                'rounded-full font-mono text-[11px]',
                                e.nature === 'apparue' &&
                                  'border-emerald-200 bg-emerald-50 text-emerald-800',
                                e.nature === 'disparue' &&
                                  'border-hairline bg-surface-soft text-muted-foreground',
                                e.nature === 'quantite' &&
                                  'border-amber-200 bg-amber-50 text-amber-900',
                                e.nature === 'date' && 'border-sky-200 bg-sky-50 text-sky-900'
                              )}
                            >
                              {NATURE_LABEL[e.nature]}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-foreground">
                            {avantApresLabel(e)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs tabular-nums font-semibold text-foreground">
                            {ecartLabel(e)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className="line-clamp-2 max-w-[320px] text-xs leading-[1.4] text-muted-foreground"
                              title={e.detail}
                            >
                              {e.detail}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {total > entrees.length && (
                  <div className="border-t border-hairline bg-surface-soft px-3 py-2 text-center font-mono text-xs tabular-nums text-muted-foreground">
                    {entrees.length} affichés — {fmtQte.format(total - entrees.length)} restants
                    hors affichage (tri par amplitude)
                  </div>
                )}
              </div>
            )}

            <p className="mt-3 text-center font-mono text-[11px] text-muted-soft">
              Tri par amplitude relative (ratio), pas par quantité absolue · Un article 10 → 0 passe
              avant un stock qui bouge de 2 %.
            </p>
          </>
        )}
      </div>

      <StockArticleSheet article={sheetArticle} open={sheetOpen} onOpenChange={setSheetOpen} />
    </AppLayout>
  )
}
