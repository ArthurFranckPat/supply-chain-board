import { For, Show, createMemo, type Component } from 'solid-js'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { cx } from '@/libs/cva'

/**
 * Détail d'un camion (cluster de lignes STOJOU). S'ouvre au clic sur une ligne du
 * tableau Expéditions. Les données sont déjà en mémoire (chargées avec la liste des
 * camions) — aucun fetch, ouverture instantanée.
 *
 * Affiche une ligne par mouvement STOJOU : article, désignation, bon de livraison
 * (VCRNUM), ligne pièce, palette, contenant, qté UC (valeur absolue), heure.
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

export const CamionDetailSheet: Component<{
  camion: CamionDtl | null
  open: boolean
  onOpenChange: (v: boolean) => void
}> = (props) => {
  // Tri : palette, puis heure — regroupe visuellement les mouvements d'une même palette.
  const lignes = createMemo(() => {
    const c = props.camion
    if (!c) return []
    return [...c.lignes].sort((a, b) =>
      a.palnum === b.palnum ? a.ts.localeCompare(b.ts) : a.palnum.localeCompare(b.palnum)
    )
  })

  // Palettes ESH distinctes (1000×1200) présentes dans le camion — pour info header.
  const nbPalEsh = createMemo(() => {
    const c = props.camion
    if (!c) return 0
    const eshPals = new Set<string>()
    for (const l of c.lignes) {
      if (l.yfamstat7 === 'ESH' && l.palnum) eshPals.add(l.palnum)
    }
    return eshPals.size
  })

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent class="sm:max-w-2xl">
        <Show when={props.camion}>
          {(c) => (
            <>
              <SheetHeader>
                <div class="flex items-center gap-2 pr-8 flex-wrap">
                  <span class="font-mono text-[11px] font-semibold tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {c().debut}
                    {c().fin !== c().debut ? ` → ${c().fin}` : ''}
                  </span>
                  <Show
                    when={c().source === 'navette'}
                    fallback={
                      <Badge variant="secondary" class="uppercase tracking-wider text-[10px] gap-1">
                        <span class="material-symbols-outlined text-[12px]">help_outline</span>
                        Hors navette
                      </Badge>
                    }
                  >
                    <Badge class="uppercase tracking-wider text-[10px] gap-1 bg-brand text-card">
                      <span class="material-symbols-outlined text-[12px]">local_shipping</span>
                      {c().navetteNum}
                    </Badge>
                  </Show>
                  <Show when={c().anomalie}>
                    <Badge variant="destructive" class="uppercase tracking-wider text-[10px] gap-1">
                      <span class="material-symbols-outlined text-[12px]">warning</span>
                      Anomalie
                    </Badge>
                  </Show>
                </div>
                <SheetTitle>{c().client || '—'}</SheetTitle>
                <SheetDescription>
                  {c().bprnum} · {c().nbLignes} ligne{c().nbLignes > 1 ? 's' : ''} ·{' '}
                  {c().nbPalettes} palette{c().nbPalettes > 1 ? 's' : ''} · {c().qteUc} UC
                </SheetDescription>
                {/* Métriques volumes (issue #44 affinage) : équivalent-palettes théorique,
                    taux de remplissage, et écart vs palettes comptées. -1 = N/A (pas de coef). */}
                <Show when={c().palTheo >= 0}>
                  <div class="flex flex-wrap gap-1.5 pt-1">
                    <span class="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                      <span class="text-muted-foreground">Pal. théo.</span>
                      {c().palTheo.toFixed(1)}
                    </span>
                    <span class="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                      <span class="text-muted-foreground">Remplissage</span>
                      {(c().tauxRemplissage * 100).toFixed(0)}%
                    </span>
                    <Show when={c().ecartPalettes >= 0}>
                      <span
                        class={cx(
                          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold',
                          c().ecartPalettes > 0.3
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-emerald-500/10 text-emerald-600'
                        )}
                        title="Écart entre palettes scannées et palettes théoriques (calcul UC)"
                      >
                        Δ {(c().ecartPalettes * 100).toFixed(0)}%
                      </span>
                    </Show>
                    <Show when={nbPalEsh() > 0}>
                      <span
                        class="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand"
                        title="Palettes 1000×1200 (famille ESH) — comptées pour 1,25 éq. standard dans le remplissage"
                      >
                        <span class="material-symbols-outlined text-[11px]">straighten</span>
                        {nbPalEsh()} pal. ESH
                      </span>
                    </Show>
                  </div>
                </Show>
              </SheetHeader>

              {/* ATTENTION : SheetBody fait `<div class="..." {...props} />` — le spread
                  écrase le `class` statique. Il faut donc réécrire TOUTES les classes
                  (flex-1 overflow-y-auto inclus), pas seulement le padding voulu. */}
              <SheetBody class="flex-1 overflow-y-auto px-0 py-0">
                <table class="w-full border-collapse text-left">
                  <thead class="sticky top-0 z-10 bg-secondary">
                    <tr>
                      <th class={cx(TH, 'w-[120px]')}>Article</th>
                      <th class={TH}>Désignation</th>
                      <th class={cx(TH, 'w-[90px]')}>BL</th>
                      <th class={cx(TH, 'w-[95px]')}>Commande</th>
                      <th class={cx(TH, 'w-[70px] text-right')}>Palette</th>
                      <th class={cx(TH, 'w-[50px] text-right')}>PCU</th>
                      <th class={cx(TH, 'w-[60px] text-right')}>UC/Pal</th>
                      <th class={cx(TH, 'w-[110px] text-right')}>Contenants</th>
                      <th class={cx(TH, 'w-[80px] text-right')}>Heure</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={lignes()}>
                      {(l, i) => (
                        <tr class="border-b border-rule-soft hover:bg-foreground/[0.03]">
                          <td class="px-3 py-[9px] align-middle font-mono text-[11px] font-semibold text-foreground">
                            {l.itmref || '—'}
                          </td>
                          <td class="px-3 py-[9px] align-middle text-[11px] text-muted-foreground">
                            <div class="truncate" title={l.designation}>
                              {l.designation || '—'}
                            </div>
                            <Show when={l.vcrnum}>
                              <div class="font-mono text-[9px] text-muted-foreground/70">
                                BL {l.vcrnum}
                                <Show when={l.vcrlin}>· L{l.vcrlin}</Show>
                                <Show when={l.lpnnum}> · {l.lpnnum}</Show>
                              </div>
                            </Show>
                          </td>
                          <td class="px-3 py-[9px] align-middle font-mono text-[11px] text-foreground">
                            {l.vcrnum || '—'}
                          </td>
                          <td class="px-3 py-[9px] align-middle font-mono text-[11px] text-brand">
                            {l.sohnum || '—'}
                          </td>
                          <td class="px-3 py-[9px] text-right align-middle font-mono text-[11px] tabular-nums text-muted-foreground">
                            {l.palnum || '—'}
                          </td>
                          <td
                            class="px-3 py-[9px] text-right align-middle font-mono text-[10px] text-muted-foreground"
                            title={`Unité de conditionnement : ${l.pcu || '—'}${l.yfamstat7 === 'ESH' ? ' · Palette 1000×1200' : ''}`}
                          >
                            <span>{l.pcu || '—'}</span>
                            <Show when={l.yfamstat7 === 'ESH'}>
                              <span class="ml-1 inline-block rounded bg-brand/10 px-1 text-[8px] font-bold text-brand">
                                ESH
                              </span>
                            </Show>
                          </td>
                          <td
                            class="px-3 py-[9px] text-right align-middle font-mono text-[10px] tabular-nums text-muted-foreground"
                            title="UC par palette (PCUSTUCOE_1 — palettisation article)"
                          >
                            {l.ucParPal > 0 ? l.ucParPal : '—'}
                          </td>
                          <td
                            class="px-3 py-[9px] text-right align-middle font-mono text-[10px] font-semibold tabular-nums text-foreground whitespace-nowrap"
                            title={`${l.qteUc} UC décomposées`}
                          >
                            {fmtContenants(l)}
                          </td>
                          <td class="px-3 py-[9px] text-right align-middle font-mono text-[11px] tabular-nums text-muted-foreground">
                            {l.ts}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </SheetBody>
            </>
          )}
        </Show>
      </SheetContent>
    </Sheet>
  )
}

export default CamionDetailSheet
