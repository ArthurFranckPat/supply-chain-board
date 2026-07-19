import { useMemo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@r/components/ui/sheet'
import { Badge } from '@r/components/ui/badge'
import { cn } from '@r/lib/utils'

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
  'px-3 py-2 text-left font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground border-b border-rule'

export function CamionDetailSheet({
  camion,
  open,
  onOpenChange,
}: {
  camion: CamionDtl | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  // Tri : palette, puis heure — regroupe visuellement les mouvements d'une même palette.
  const lignes = useMemo(() => {
    if (!camion) return []
    return [...camion.lignes].sort((a, b) =>
      a.palnum === b.palnum ? a.ts.localeCompare(b.ts) : a.palnum.localeCompare(b.palnum)
    )
  }, [camion])

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
                    <span className="material-symbols-outlined text-[12px]">local_shipping</span>
                    {camion.navetteNum}
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="gap-1 text-[10px] uppercase tracking-wider"
                  >
                    <span className="material-symbols-outlined text-[12px]">help_outline</span>
                    Hors navette
                  </Badge>
                )}
                {camion.anomalie && (
                  <Badge
                    variant="destructive"
                    className="gap-1 text-[10px] uppercase tracking-wider"
                  >
                    <span className="material-symbols-outlined text-[12px]">warning</span>
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
                          : 'bg-emerald-500/10 text-emerald-600'
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
                      <span className="material-symbols-outlined text-[11px]">straighten</span>
                      {nbPalEsh} pal. ESH
                    </span>
                  )}
                </div>
              )}
            </SheetHeader>

            {/* ponytail: le Sheet React n'a pas de SheetBody (Base UI Dialog) — div scroll directe. */}
            <div className="flex-1 overflow-y-auto px-0 py-0">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-secondary">
                  <tr>
                    <th className={cn(TH, 'w-[120px]')}>Article</th>
                    <th className={TH}>Désignation</th>
                    <th className={cn(TH, 'w-[90px]')}>BL</th>
                    <th className={cn(TH, 'w-[95px]')}>Commande</th>
                    <th className={cn(TH, 'w-[70px] text-right')}>Palette</th>
                    <th className={cn(TH, 'w-[50px] text-right')}>PCU</th>
                    <th className={cn(TH, 'w-[60px] text-right')}>UC/Pal</th>
                    <th className={cn(TH, 'w-[110px] text-right')}>Contenants</th>
                    <th className={cn(TH, 'w-[80px] text-right')}>Heure</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => (
                    <tr key={`${l.sohnum}-${l.vcrnum}-${l.vcrlin}-${l.ts}-${i}`} className="border-b border-rule-soft hover:bg-foreground/[0.03]">
                      <td className="px-3 py-[9px] align-middle font-mono text-[11px] font-semibold text-foreground">
                        {l.itmref || '—'}
                      </td>
                      <td className="px-3 py-[9px] align-middle text-[11px] text-muted-foreground">
                        <div className="truncate" title={l.designation}>
                          {l.designation || '—'}
                        </div>
                        {l.vcrnum && (
                          <div className="font-mono text-[9px] text-muted-foreground/70">
                            BL {l.vcrnum}
                            {l.vcrlin ? `· L${l.vcrlin}` : ''}
                            {l.lpnnum ? ` · ${l.lpnnum}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-[9px] align-middle font-mono text-[11px] text-foreground">
                        {l.vcrnum || '—'}
                      </td>
                      <td className="px-3 py-[9px] align-middle font-mono text-[11px] text-brand">
                        {l.sohnum || '—'}
                      </td>
                      <td className="px-3 py-[9px] text-right align-middle font-mono text-[11px] tabular-nums text-muted-foreground">
                        {l.palnum || '—'}
                      </td>
                      <td
                        className="px-3 py-[9px] text-right align-middle font-mono text-[10px] text-muted-foreground"
                        title={`Unité de conditionnement : ${l.pcu || '—'}${l.yfamstat7 === 'ESH' ? ' · Palette 1000×1200' : ''}`}
                      >
                        <span>{l.pcu || '—'}</span>
                        {l.yfamstat7 === 'ESH' && (
                          <span className="ml-1 inline-block rounded bg-brand/10 px-1 text-[8px] font-bold text-brand">
                            ESH
                          </span>
                        )}
                      </td>
                      <td
                        className="px-3 py-[9px] text-right align-middle font-mono text-[10px] tabular-nums text-muted-foreground"
                        title="UC par palette (PCUSTUCOE_1 — palettisation article)"
                      >
                        {l.ucParPal > 0 ? l.ucParPal : '—'}
                      </td>
                      <td
                        className="px-3 py-[9px] whitespace-nowrap text-right align-middle font-mono text-[10px] font-semibold tabular-nums text-foreground"
                        title={`${l.qteUc} UC décomposées`}
                      >
                        {fmtContenants(l)}
                      </td>
                      <td className="px-3 py-[9px] text-right align-middle font-mono text-[11px] tabular-nums text-muted-foreground">
                        {l.ts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default CamionDetailSheet
