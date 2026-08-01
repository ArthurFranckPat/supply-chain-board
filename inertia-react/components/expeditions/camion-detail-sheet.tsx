import { useMemo, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@r/components/ui/sheet'
import { Badge } from '@r/components/ui/badge'
import { CircleHelp, Ruler, TriangleAlert, Truck } from 'lucide-react'
import { cn } from '@r/lib/utils'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'

/**
 * Détail d'un camion (cluster de lignes STOJOU) — port React iso du Solid
 * inertia/components/expeditions/camion-detail-sheet.tsx. S'ouvre au clic sur
 * une ligne du tableau Expéditions. Données en mémoire, ouverture instantanée.
 */

export type CamionSource = 'navette' | 'heuristique'

export interface Contenants {
  pal: number
  cart: number
  unites: number
}

export interface CamionLigne {
  itmref: string
  designation: string
  vcrnum: string
  vcrlin: number
  client: string
  palnum: string
  lpnnum: string
  qteUc: number
  ts: string
  sohnum: string
  pcu: string
  pcuStuCoe: number
  ucParPal: number
  yfamstat7: string
  pal: number
  cart: number
  unites: number
}

export interface CamionDtl {
  source: CamionSource
  navetteNum: string | null
  client: string
  bprnum: string
  debut: string
  fin: string
  qteUc: number
  nbPalettes: number
  nbContenants: number
  nbLignes: number
  anomalie: boolean
  palTheo: number
  tauxRemplissage: number
  ecartPalettes: number
  contenants: Contenants
  maxPalettesCamion: number
  lignes: CamionLigne[]
}

/** Formate une décomposition contenants en chaîne compacte : « 1 pal + 2 cart + 5 u. ». */
export function fmtContenants(c: Contenants): string {
  const parts: string[] = []
  if (c.pal > 0) parts.push(`${c.pal} pal`)
  if (c.cart > 0) parts.push(`${c.cart} cart`)
  if (c.unites > 0) parts.push(`${c.unites} u`)
  return parts.length > 0 ? parts.join(' + ') : '—'
}

const TH =
  'px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground'
const TD = 'px-3 py-[9px] align-middle'

/** Tri générique sur une colonne, palette puis heure en repli à égalité (ordre par défaut). */
function sortLignes(rows: CamionLigne[], sorting: SortingState[]): CamionLigne[] {
  const { id, desc } = sorting[0] ?? { id: 'palnum', desc: false }
  return [...rows].sort((a, b) => {
    const av = a[id as keyof CamionLigne]
    const bv = b[id as keyof CamionLigne]
    const cmp =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av ?? '').localeCompare(String(bv ?? ''))
    const signed = desc ? -cmp : cmp
    return signed !== 0 ? signed : a.ts.localeCompare(b.ts)
  })
}

const camionColumns: ColumnDef<CamionLigne>[] = [
  {
    accessorKey: 'itmref',
    header: 'Article',
    cell: ({ getValue }) => (
      <span className="font-mono text-[11px] font-semibold text-foreground">
        {(getValue() as string) || '—'}
      </span>
    ),
    meta: { thClass: cn(TH, 'w-[120px]'), tdClass: TD },
  },
  {
    accessorKey: 'designation',
    header: 'Désignation',
    cell: ({ row: { original: l } }) => (
      <>
        <div className="truncate text-[11px] text-muted-foreground" title={l.designation}>
          {l.designation || '—'}
        </div>
        {l.vcrnum && (
          <div className="font-mono text-[9px] text-muted-foreground/70">
            BL {l.vcrnum}
            {l.vcrlin ? `· L${l.vcrlin}` : ''}
            {l.lpnnum ? ` · ${l.lpnnum}` : ''}
          </div>
        )}
      </>
    ),
    meta: { thClass: TH, tdClass: TD },
  },
  {
    accessorKey: 'vcrnum',
    header: 'BL',
    cell: ({ getValue }) => (
      <span className="font-mono text-[11px] text-foreground">{(getValue() as string) || '—'}</span>
    ),
    meta: { thClass: cn(TH, 'w-[90px]'), tdClass: TD },
  },
  {
    accessorKey: 'sohnum',
    header: 'Commande',
    cell: ({ getValue }) => (
      <span className="font-mono text-[11px] text-brand">{(getValue() as string) || '—'}</span>
    ),
    meta: { thClass: cn(TH, 'w-[95px]'), tdClass: TD },
  },
  {
    accessorKey: 'palnum',
    header: 'Palette',
    cell: ({ getValue }) => (
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {(getValue() as string) || '—'}
      </span>
    ),
    meta: { thClass: cn(TH, 'w-[70px] text-right'), tdClass: cn(TD, 'text-right') },
  },
  {
    accessorKey: 'pcu',
    header: 'PCU',
    cell: ({ row: { original: l } }) => (
      <span
        title={`Unité de conditionnement : ${l.pcu || '—'}${l.yfamstat7 === 'ESH' ? ' · Palette 1000×1200' : ''}`}
      >
        <span className="font-mono text-[10px] text-muted-foreground">{l.pcu || '—'}</span>
        {l.yfamstat7 === 'ESH' && (
          <span className="ml-1 inline-block rounded bg-brand/10 px-1 text-[8px] font-bold text-brand">
            ESH
          </span>
        )}
      </span>
    ),
    meta: { thClass: cn(TH, 'w-[50px] text-right'), tdClass: cn(TD, 'text-right') },
  },
  {
    accessorKey: 'ucParPal',
    header: 'UC/Pal',
    cell: ({ row: { original: l } }) => (
      <span
        className="font-mono text-[10px] tabular-nums text-muted-foreground"
        title="UC par palette (PCUSTUCOE_1 — palettisation article)"
      >
        {l.ucParPal > 0 ? l.ucParPal : '—'}
      </span>
    ),
    meta: { thClass: cn(TH, 'w-[60px] text-right'), tdClass: cn(TD, 'text-right') },
  },
  {
    id: 'contenants',
    accessorFn: (l) => l.qteUc,
    enableSorting: false,
    header: 'Contenants',
    cell: ({ row: { original: l } }) => (
      <span
        className="whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums text-foreground"
        title={`${l.qteUc} UC décomposées`}
      >
        {fmtContenants(l)}
      </span>
    ),
    meta: { thClass: cn(TH, 'w-[110px] text-right'), tdClass: cn(TD, 'text-right') },
  },
  {
    accessorKey: 'ts',
    header: 'Heure',
    cell: ({ getValue }) => (
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {getValue() as string}
      </span>
    ),
    meta: { thClass: cn(TH, 'w-[80px] text-right'), tdClass: cn(TD, 'text-right') },
  },
]

export function CamionDetailSheet({
  camion,
  open,
  onOpenChange,
}: {
  camion: CamionDtl | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [sorting, setSorting] = useState<SortingState[]>([{ id: 'palnum', desc: false }])

  // Tri : palette, puis heure — regroupe visuellement les mouvements d'une même palette.
  const lignes = useMemo(() => sortLignes(camion?.lignes ?? [], sorting), [camion, sorting])

  // Palettes ESH distinctes (1000×1200) présentes dans le camion — pour info header.
  const nbPalEsh = useMemo(() => {
    if (!camion) return 0
    const eshPals = new Set<string>()
    for (const l of camion.lignes) {
      if (l.yfamstat7 === 'ESH' && l.palnum) eshPals.add(l.palnum)
    }
    return eshPals.size
  }, [camion])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        {camion && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-muted-foreground">
                  {camion.debut}
                  {camion.fin !== camion.debut ? ` → ${camion.fin}` : ''}
                </span>
                {camion.source === 'navette' ? (
                  <Badge className="gap-1 bg-brand text-[10px] uppercase tracking-wider text-card">
                    <Truck size={12} strokeWidth={1.75} />
                    {camion.navetteNum}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 text-[10px] uppercase tracking-wider">
                    <CircleHelp size={12} strokeWidth={1.75} />
                    Hors navette
                  </Badge>
                )}
                {camion.anomalie && (
                  <Badge
                    variant="destructive"
                    className="gap-1 text-[10px] uppercase tracking-wider"
                  >
                    <TriangleAlert size={12} strokeWidth={1.75} />
                    Anomalie
                  </Badge>
                )}
              </div>
              <SheetTitle>{camion.client || '—'}</SheetTitle>
              <SheetDescription>
                {camion.bprnum} · {camion.nbLignes} ligne{camion.nbLignes > 1 ? 's' : ''} ·{' '}
                {camion.nbPalettes} palette{camion.nbPalettes > 1 ? 's' : ''} · {camion.qteUc} UC
              </SheetDescription>
              {/* Métriques volumes (issue #44 affinage) : équivalent-palettes théorique,
                  taux de remplissage, et écart vs palettes comptées. -1 = N/A (pas de coef). */}
              {camion.palTheo >= 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                    <span className="text-muted-foreground">Pal. théo.</span>
                    {camion.palTheo.toFixed(1)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                    <span className="text-muted-foreground">Remplissage</span>
                    {(camion.tauxRemplissage * 100).toFixed(0)}%
                  </span>
                  {camion.ecartPalettes >= 0 && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold',
                        camion.ecartPalettes > 0.3
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-ferme/10 text-ferme'
                      )}
                      title="Écart entre palettes scannées et palettes théoriques (calcul UC)"
                    >
                      Δ {(camion.ecartPalettes * 100).toFixed(0)}%
                    </span>
                  )}
                  {nbPalEsh > 0 && (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand"
                      title="Palettes 1000×1200 (famille ESH) — comptées pour 1,25 éq. standard dans le remplissage"
                    >
                      <Ruler size={11} strokeWidth={1.75} />
                      {nbPalEsh} pal. ESH
                    </span>
                  )}
                </div>
              )}
            </SheetHeader>

            {/* ponytail: le Sheet React n'a pas de SheetBody (Base UI Dialog) — div scroll directe. */}
            <div className="flex-1 overflow-hidden px-0 py-0">
              <DataTable
                columns={camionColumns}
                rows={lignes}
                sorting={sorting}
                onSortingChange={setSorting}
                tableClass="w-full table-fixed"
                scrollContainerClass="h-full overflow-y-auto rounded-none border-0 shadow-none"
                theadRowClass="sticky top-0 z-10 bg-secondary"
                getRowClass={() => 'border-b border-rule-soft hover:bg-foreground/[0.03]'}
                getRowKey={(l) => `${l.sohnum}-${l.vcrnum}-${l.vcrlin}-${l.ts}`}
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default CamionDetailSheet
