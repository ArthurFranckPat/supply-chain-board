import { For, Show, type Component } from 'solid-js'
import type { ShortageDisplayRow, ShortageStats } from '@/lib/shortages/types'
import { cn } from '@/libs/cn'

/**
 * Tableau du suivi des ruptures. Port Solid de `shortage_table.edge` : bandeau stats +
 * grille (une ligne par couple composant × OF bloqué) + états vide / erreur X3.
 * Les lignes arrivent déjà formatées du serveur (cf. ShortageDisplayRow).
 */
export const ShortageTable: Component<{
  rows: ShortageDisplayRow[]
  stats: ShortageStats
  x3Error: string | null
  onSelectOf: (numOf: string) => void
}> = (props) => {
  return (
    <div class="flex-1 flex flex-col min-h-0">
      <Show when={props.x3Error}>
        <div class="mb-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-xs rounded flex items-center gap-2">
          <span class="material-symbols-outlined text-sm">warning</span>
          X3 injoignable — {props.x3Error}.
        </div>
      </Show>

      {/* Bandeau stats */}
      <div class="mb-2 flex items-center gap-2">
        <div class="flex items-center gap-2 bg-card border border-border rounded px-3 py-1.5 shadow-sm">
          <span class="material-symbols-outlined text-[16px] text-muted-foreground">analytics</span>
          <span class="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {props.stats.nbRuptures} rupture(s)
          </span>
        </div>
        <div class="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded px-3 py-1.5">
          <span class="w-2 h-2 rounded-full bg-emerald-500" />
          <span class="text-[11px] font-bold text-emerald-700">{props.stats.nbCouvertes} couverte(s)</span>
        </div>
        <div class="flex items-center gap-1.5 bg-error/10 border border-error/20 rounded px-3 py-1.5">
          <span class="w-2 h-2 rounded-full bg-error" />
          <span class="text-[11px] font-bold text-error">{props.stats.nbSansCouverture} sans couverture</span>
        </div>
      </div>

      <div class="flex-1 bg-card border border-border rounded shadow-sm overflow-auto">
        <table class="w-full text-xs border-collapse">
          <thead class="sticky top-0 bg-muted/50 z-10">
            <tr class="text-[10px] font-bold uppercase text-muted-foreground border-b border-border">
              <th class="text-left px-3 py-2">Composant</th>
              <th class="text-right px-3 py-2 w-24">Qté manq.</th>
              <th class="text-left px-3 py-2 w-44">OF bloqué</th>
              <th class="text-left px-3 py-2 w-44">Commande client</th>
              <th class="text-left px-3 py-2 w-24">Date expé.</th>
              <th class="text-left px-3 py-2">Réception attendue</th>
              <th class="text-left px-3 py-2 w-24">Date arrivée</th>
              <th class="text-left px-3 py-2 w-40">Verdict</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr class="border-b border-border/60 hover:bg-muted/40 transition-colors">
                  <td class="px-3 py-2 align-top">
                    <div class="font-bold text-foreground mono">{row.component}</div>
                    <div class="text-[10px] text-muted-foreground truncate max-w-[18rem]">{row.componentDesc}</div>
                  </td>
                  <td class="px-3 py-2 text-right mono font-bold text-error align-top">{row.qteManquante}</td>
                  <td class="px-3 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => props.onSelectOf(row.numOf)}
                      class="font-bold text-primary hover:underline mono cursor-pointer"
                    >
                      {row.numOf}
                    </button>
                    <div class="text-[10px] text-muted-foreground mono truncate max-w-[10rem]">{row.articleParent}</div>
                  </td>
                  <td class="px-3 py-2 align-top">
                    <Show
                      when={row.hasCommande}
                      fallback={<span class="text-muted-foreground/60 italic">—</span>}
                    >
                      <div class="font-bold text-foreground mono">{row.numCommande}</div>
                      <div class="text-[10px] text-muted-foreground truncate max-w-[10rem]">{row.client}</div>
                    </Show>
                  </td>
                  <td class="px-3 py-2 mono text-muted-foreground align-top whitespace-nowrap">
                    {row.dateExpedition || '—'}
                  </td>
                  <td class="px-3 py-2 align-top">
                    <Show
                      when={row.reception}
                      fallback={
                        <span class="inline-flex items-center gap-1 text-[10px] font-bold text-error uppercase">
                          <span class="material-symbols-outlined text-[13px]">block</span> Aucune couverture prévue
                        </span>
                      }
                    >
                      {(rec) => (
                        <>
                          <div class="font-bold text-foreground mono">{rec().id}</div>
                          <div class="text-[10px] text-muted-foreground truncate max-w-[16rem]">
                            {rec().supplier} · {rec().qty}
                          </div>
                        </>
                      )}
                    </Show>
                  </td>
                  <td
                    class={cn(
                      'px-3 py-2 mono align-top whitespace-nowrap',
                      row.arriveeLate ? 'text-error font-bold' : 'text-muted-foreground'
                    )}
                  >
                    <Show when={row.dateArrivee} fallback={<span class="text-muted-foreground/60">—</span>}>
                      <span class="inline-flex items-center gap-1">
                        <Show when={row.arriveeLate}>
                          <span class="material-symbols-outlined text-[13px]">warning</span>
                        </Show>
                        {row.dateArrivee}
                      </span>
                    </Show>
                  </td>
                  <td class="px-3 py-2 align-top">
                    <span
                      class={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 border rounded-full text-[10px] font-bold whitespace-nowrap',
                        row.verdictCls
                      )}
                    >
                      <span class="material-symbols-outlined text-[12px]">{row.verdictIcon}</span>
                      {row.verdictLabel}
                    </span>
                  </td>
                </tr>
              )}
            </For>
            <Show when={props.rows.length === 0}>
              <tr>
                <td colspan="8" class="px-3 py-16 text-center text-muted-foreground">
                  <Show
                    when={!props.x3Error}
                    fallback={<span class="italic">Données indisponibles.</span>}
                  >
                    <div class="flex flex-col items-center gap-2">
                      <span class="material-symbols-outlined text-[32px] text-emerald-400">check_circle</span>
                      <span class="text-sm font-medium">Aucune rupture détectée dans la fenêtre.</span>
                    </div>
                  </Show>
                </td>
              </tr>
            </Show>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ShortageTable
