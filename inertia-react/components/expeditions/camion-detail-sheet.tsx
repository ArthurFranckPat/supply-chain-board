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
import { CellNumber, CellStack } from '@r/components/ui/table-row'

/**
 * Détail d'un camion (cluster de lignes STOJOU). S'ouvre au clic sur une
 * carte manifeste / barre de frise. Données en mémoire, ouverture instantanée.
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

const TH = 'bg-card'

const camionColumns: ColumnDef<CamionLigne>[] = [
  {
    accessorKey: 'itmref',
    header: 'Article',
    cell: ({ row: { original: l } }) => (
      <CellStack code={l.itmref || '—'} label={l.designation} labelTitle={l.designation} />
    ),
    meta: { thClass: `${TH} w-[28%]` },
  },
  {
    accessorKey: 'vcrnum',
    header: 'BL',
    cell: ({ row: { original: l } }) => (
      <CellStack
        code={l.vcrnum || '—'}
        label={l.vcrlin ? `L${l.vcrlin}${l.lpnnum ? ` · ${l.lpnnum}` : ''}` : l.lpnnum || undefined}
      />
    ),
    meta: { thClass: `${TH} w-[14%]` },
  },
  {
    accessorKey: 'sohnum',
    header: 'Commande',
    cell: ({ getValue }) => <CellStack code={(getValue() as string) || '—'} />,
    meta: { thClass: `${TH} w-[14%]` },
  },
  {
    accessorKey: 'palnum',
    header: 'Palette',
    cell: ({ getValue }) => <CellNumber value={(getValue() as string) || '—'} emphasis="plain" />,
    meta: { thClass: `${TH} w-[10%] text-right!`, tdClass: 'text-right' },
  },
  {
    accessorKey: 'pcu',
    header: 'PCU',
    cell: ({ row: { original: l } }) => (
      <span
        className="inline-flex items-center justify-end gap-1"
        title={`Unité de conditionnement : ${l.pcu || '—'}${l.yfamstat7 === 'ESH' ? ' · Palette 1000×1200' : ''}`}
      >
        <CellNumber value={l.pcu || '—'} emphasis="plain" />
        {l.yfamstat7 === 'ESH' && (
          <Badge variant="secondary" className="h-4 px-1 text-[8px] font-bold">
            ESH
          </Badge>
        )}
      </span>
    ),
    meta: { thClass: `${TH} w-[8%] text-right!`, tdClass: 'text-right' },
  },
  {
    accessorKey: 'ucParPal',
    header: 'UC/Pal',
    cell: ({ row: { original: l } }) => (
      <CellNumber
        value={l.ucParPal > 0 ? l.ucParPal : '—'}
        emphasis="plain"
        title="UC par palette (PCUSTUCOE_1 — palettisation article)"
      />
    ),
    meta: { thClass: `${TH} w-[8%] text-right!`, tdClass: 'text-right' },
  },
  {
    id: 'contenants',
    accessorFn: (l) => l.qteUc,
    enableSorting: false,
    header: 'Contenants',
    cell: ({ row: { original: l } }) => (
      <CellNumber value={fmtContenants(l)} emphasis="plain" title={`${l.qteUc} UC décomposées`} />
    ),
    meta: { thClass: `${TH} w-[12%] text-right!`, tdClass: 'text-right' },
  },
  {
    accessorKey: 'ts',
    header: 'Heure',
    cell: ({ getValue }) => <CellNumber value={getValue() as string} emphasis="plain" />,
    meta: { thClass: `${TH} w-[8%] text-right!`, tdClass: 'text-right' },
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
                  <Badge className="gap-1 text-[10px] uppercase tracking-wider">
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
                      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-foreground"
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
                theadRowClass="sticky top-0 z-10"
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
