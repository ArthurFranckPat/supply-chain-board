import { Show, For, type Component } from 'solid-js'
import { cx } from '@/libs/cva'
import { BADGE_TONE, VERDICT_TONE, OF_STATUT } from '@/lib/suivi/tracking-shared'
import type { SuiviDisplayRow, ProactiveDisplayRow } from '@/lib/suivi/types'

interface SuiviDetailSheetProps {
  type: 'reactif' | 'proactif'
  row: SuiviDisplayRow | ProactiveDisplayRow
}

export const SuiviDetailSheet: Component<SuiviDetailSheetProps> = (props) => {
  const isReactif = () => props.type === 'reactif'
  const r = () => props.row

  // Helpers to cast to specific row type safely
  const reactiveRow = () => r() as SuiviDisplayRow
  const proactiveRow = () => r() as ProactiveDisplayRow

  return (
    <div class="flex flex-col gap-6 text-sans">
      {/* 1. Header Fiche Commande */}
      <div class="rounded-xl border border-rule-soft bg-secondary/20 p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <span class="font-mono text-[14px] font-bold text-foreground">
            {r().numCommande}
          </span>
          <Show when={r().refCommandeClient}>
            <span class="font-mono text-[11px] text-muted-foreground bg-secondary px-2 py-0.5 rounded">
              Ref: {r().refCommandeClient}
            </span>
          </Show>
        </div>

        <div class="grid grid-cols-2 gap-4 border-t border-rule-soft pt-3">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client</div>
            <div class="text-[13px] font-semibold text-foreground mt-0.5">{r().client}</div>
          </div>
          <div>
            <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type de flux</div>
            <div class="mt-1">
              <span class="rounded bg-brand-soft px-2 py-0.5 font-mono text-[10px] font-bold text-brand">
                {r().type}
              </span>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-2 border-t border-rule-soft pt-3">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Article</div>
            <div class="font-mono text-[12.5px] font-bold text-brand mt-0.5">{r().article}</div>
            <Show when={r().refArticleClient && r().refArticleClient !== r().article}>
              <div class="font-mono text-[10px] text-muted-foreground mt-0.5">Ref externe: {r().refArticleClient}</div>
            </Show>
          </div>
          <div>
            <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Désignation</div>
            <div class="text-[12.5px] font-medium text-secondary-foreground leading-normal mt-0.5">{r().designation || '—'}</div>
          </div>
        </div>
      </div>

      {/* 2. Statut & Recommandation */}
      <div class="rounded-xl border p-4 flex flex-col gap-3"
           classList={{
             'bg-brand-soft/20 border-brand/20': r().action.severity === 'info',
             'bg-suggere/10 border-suggere/20': r().action.severity === 'warning',
             'bg-destructive/5 border-destructive/10': r().action.severity === 'critical',
           }}>
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px]"
                classList={{
                  'text-brand': r().action.severity === 'info',
                  'text-suggere': r().action.severity === 'warning',
                  'text-destructive': r().action.severity === 'critical',
                }}>
            {r().action.severity === 'critical' ? 'report' : r().action.severity === 'warning' ? 'warning' : 'info'}
          </span>
          <span class="text-[12px] font-bold uppercase tracking-wider"
                classList={{
                  'text-brand': r().action.severity === 'info',
                  'text-suggere': r().action.severity === 'warning',
                  'text-destructive': r().action.severity === 'critical',
                }}>
            Action Recommandée
          </span>
        </div>
        <p class="text-[13px] font-semibold leading-relaxed text-foreground">
          {r().action.label}
        </p>
      </div>

      {/* 3. Date & Délais */}
      <div class="grid grid-cols-2 gap-4">
        <div class="rounded-xl border border-rule-soft p-4 bg-card">
          <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Date d'Expédition</div>
          <div class="font-mono text-[16px] font-bold text-foreground mt-1">{r().dateExp || '—'}</div>
        </div>
        <div class="rounded-xl border border-rule-soft p-4 bg-card">
          <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">État de Livraison</div>
          <div class="mt-1 flex flex-col gap-1">
            <Show when={isReactif()} fallback={
              <span class={cx("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold w-fit", VERDICT_TONE[proactiveRow().verdictKey])}>
                {proactiveRow().verdictLabel}
              </span>
            }>
              <span class={cx("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold w-fit", BADGE_TONE[reactiveRow().statusKey])}>
                {reactiveRow().statusLabel}
              </span>
            </Show>
            <Show when={r().late}>
              <span class="text-[11px] text-destructive font-semibold">
                Retard de {r().lateDays} jour(s) ouvré(s)
              </span>
            </Show>
          </div>
        </div>
      </div>

      {/* 4. Répartition des Quantités (Stock/CQ/Reste) */}
      <div class="rounded-xl border border-rule-soft p-4 bg-card flex flex-col gap-3">
        <h4 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-rule-soft pb-2">
          Répartition des Quantités
        </h4>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="bg-secondary/20 p-2 rounded">
            <div class="text-[10px] text-muted-foreground">Reste à livrer</div>
            <div class="font-mono text-[18px] font-black text-foreground mt-0.5">{r().qteRestante}</div>
          </div>
          <Show when={isReactif()} fallback={
            <>
              <div class="bg-secondary/20 p-2 rounded">
                <div class="text-[10px] text-muted-foreground">Quantité allouée</div>
                <div class="font-mono text-[18px] font-black text-foreground mt-0.5">{proactiveRow().qteAllouee}</div>
              </div>
              <div class="bg-secondary/20 p-2 rounded">
                <div class="text-[10px] text-muted-foreground">Reliquat</div>
                <div class="font-mono text-[18px] font-black text-foreground mt-0.5">{proactiveRow().reliquat}</div>
              </div>
            </>
          }>
            <div class="bg-secondary/20 p-2 rounded">
              <div class="text-[10px] text-muted-foreground">Allocation strict</div>
              <div class="font-mono text-[18px] font-black text-foreground mt-0.5">{reactiveRow().allocStrict}</div>
            </div>
            <div class="bg-secondary/20 p-2 rounded">
              <div class="text-[10px] text-muted-foreground">Allocation CQ</div>
              <div class="font-mono text-[18px] font-black text-foreground mt-0.5">{reactiveRow().allocCq}</div>
            </div>
          </Show>
        </div>
      </div>

      {/* 5. Goulots & Approvisionnements (Si présent) */}
      <Show when={!isReactif() && proactiveRow().composants.length > 0}>
        <div class="rounded-xl border border-rule-soft p-4 bg-card flex flex-col gap-3">
          <h4 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-rule-soft pb-2">
            Goulots d'Approvisionnement
          </h4>
          <div class="flex flex-col gap-3">
            <For each={proactiveRow().composants}>
              {(c) => (
                <div class="border-b border-rule-soft last:border-0 pb-3 last:pb-0 flex flex-col gap-1.5">
                  <div class="flex items-center justify-between">
                    <span class="font-mono text-[12px] font-bold text-destructive">{c.art}</span>
                    <span class="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-destructive">
                      −{c.qty} manquants
                    </span>
                  </div>
                  <div class="text-[11.5px] text-secondary-foreground">{c.desc}</div>

                  {/* Reception Directe */}
                  <Show when={c.reception} fallback={
                    <Show when={!c.descente}>
                      <div class="flex items-center gap-1 font-mono text-[10px] text-destructive font-semibold">
                        <span class="material-symbols-outlined text-[13px] leading-none">event_busy</span>
                        Aucune réception d'achat de couverture prévue.
                      </div>
                    </Show>
                  }>
                    {(r) => (
                      <div class="rounded-lg border border-rule-soft bg-secondary/10 p-2.5 flex flex-col gap-1">
                        <div class="flex items-center gap-1.5 text-[11px] font-semibold"
                             classList={{ 'text-destructive': r().overdue, 'text-muted-foreground': !r().overdue }}>
                          <span class="material-symbols-outlined text-[14px]">
                            {r().overdue ? 'warning' : 'local_shipping'}
                          </span>
                          <span>
                            {r().overdue
                              ? `En retard fournisseur de +${r().retardJ} jours`
                              : 'Commande d\'achat fournisseur en cours'}
                          </span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-[10.5px] mt-1 text-muted-foreground">
                          <div><span class="font-semibold text-foreground">Date d'arrivée :</span> {r().eta}</div>
                          <div><span class="font-semibold text-foreground">Commande PO :</span> {r().po}</div>
                          <div class="col-span-2"><span class="font-semibold text-foreground">Fournisseur :</span> {r().supplier}</div>
                        </div>
                      </div>
                    )}
                  </Show>

                  {/* Descente de Nomenclature */}
                  <Show when={c.descente}>
                    {(d) => (
                      <div class="rounded-lg border border-rule-soft bg-secondary/15 p-2.5 flex flex-col gap-1.5">
                        <div class="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                          <span class="material-symbols-outlined text-[14px]">subdirectory_arrow_right</span>
                          <span>Sous-ensemble fabriqué</span>
                        </div>
                        <Show when={d().statut === 'se_a_lancer'} fallback={
                          <div class="flex flex-col gap-2 pl-3.5 border-l border-rule-soft mt-1">
                            <div class="text-[10px] font-bold text-destructive uppercase tracking-wide">Bloqué par composants :</div>
                            <For each={d().par}>
                              {(p) => (
                                <div class="text-[10.5px] text-muted-foreground flex flex-col gap-0.5">
                                  <div class="flex items-center justify-between">
                                    <span>• <b class="text-destructive">{p.art}</b> ({p.desc})</span>
                                    <span class="font-mono font-bold text-destructive">−{p.manque}</span>
                                  </div>
                                  <Show when={p.reception} fallback={
                                    <div class="pl-2.5 text-[9.5px] text-destructive/80 font-medium">Aucune couverture prévue</div>
                                  }>
                                    {(pr) => (
                                      <div class="pl-2.5 text-[9.5px]" classList={{ 'text-destructive font-semibold': pr().overdue }}>
                                        {pr().overdue
                                          ? `En retard +${pr().retardJ}j (${pr().eta}) · PO ${pr().po}`
                                          : `Arrive ${pr().eta} · PO ${pr().po}`}
                                      </div>
                                    )}
                                  </Show>
                                </div>
                              )}
                            </For>
                          </div>
                        }>
                          <div class="pl-3.5 text-[10.5px] text-emerald-700 font-semibold flex items-center gap-1">
                            <span class="material-symbols-outlined text-[13px]">check_circle</span>
                            Composants disponibles — OF du sous-ensemble à lancer
                          </div>
                        </Show>
                      </div>
                    )}
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* 6. Ordres de Fabrication Associés (Si présent - Proactif) */}
      <Show when={!isReactif() && proactiveRow().ofs.length > 0}>
        <div class="rounded-xl border border-rule-soft p-4 bg-card flex flex-col gap-3">
          <h4 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-rule-soft pb-2">
            Ordres de Fabrication ({proactiveRow().ofs.length})
          </h4>
          <div class="flex flex-col gap-3">
            <For each={proactiveRow().ofs}>
              {(of) => {
                const st = OF_STATUT[of.statutNum]
                return (
                  <div class="border border-rule-soft rounded-lg p-3 flex flex-col gap-2 bg-secondary/10">
                    <div class="flex items-center justify-between">
                      <span class="font-mono text-[12.5px] font-bold text-foreground">{of.numOf}</span>
                      <div class="flex items-center gap-1.5">
                        <Show when={of.estDebuté}>
                          <span class="rounded bg-brand-soft px-1.5 py-0.5 font-sans text-[9px] font-bold text-brand">
                            Débuté
                          </span>
                        </Show>
                        <Show when={st}>
                          <span class={cx("rounded px-1.5 py-0.5 font-mono text-[9px] font-bold", st.tone)}>
                            {st.tag}
                          </span>
                        </Show>
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                      <div><span class="font-semibold text-foreground">Article OF :</span> {of.article}</div>
                      <div><span class="font-semibold text-foreground">Qté allouée :</span> {of.qteAllouee}</div>
                      <div><span class="font-semibold text-foreground">Date fin prévue :</span> {of.dateFin}</div>
                      <div>
                        <span class="font-semibold text-foreground">Faisabilité :</span>{' '}
                        <span class="font-bold" classList={{ 'text-emerald-600': of.feasible, 'text-destructive': !of.feasible }}>
                          {of.feasible === null ? '—' : of.feasible ? 'Prêt à produire' : 'Bloqué'}
                        </span>
                      </div>
                    </div>

                    <Show when={of.missingComponents.length > 0}>
                      <div class="border-t border-rule-soft pt-2 mt-1">
                        <div class="text-[10px] font-bold text-destructive uppercase tracking-wide mb-1">Composants manquants pour cet OF :</div>
                        <div class="flex flex-wrap gap-1">
                          <For each={of.missingComponents}>
                            {(mc) => (
                              <span class="rounded bg-destructive/5 border border-destructive/10 px-1.5 py-0.5 font-mono text-[9.5px] text-destructive font-semibold">
                                {mc.art} (−{mc.qty})
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* 7. Emplacements de Stock (Pour le Réactif) */}
      <Show when={isReactif() && reactiveRow().emplacements.length > 0}>
        <div class="rounded-xl border border-rule-soft p-4 bg-card flex flex-col gap-3">
          <h4 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-rule-soft pb-2">
            Emplacements & Palettes de Stock
          </h4>
          <div class="flex flex-col gap-2">
            <For each={reactiveRow().emplacements}>
              {(e) => (
                <div class="flex items-center justify-between border-b border-rule-soft last:border-0 pb-2 last:pb-0">
                  <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-[16px] text-muted-foreground">
                      {e.source === 'STOALL' ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span class="font-mono text-[12px] font-semibold text-foreground">{e.nom}</span>
                    <span class="text-[10.5px] rounded px-1.5 py-0.5"
                          classList={{
                            'bg-ferme/15 text-ferme': e.source === 'STOALL',
                            'bg-secondary text-secondary-foreground': e.source === 'STOCK'
                          }}>
                      {e.source === 'STOALL' ? 'Déjà Alloué' : 'Stock Libre'}
                    </span>
                  </div>
                  <div class="flex items-center gap-3">
                    <Show when={e.hum}>
                      <span class="font-mono text-[10px] text-muted-foreground bg-secondary/50 px-1.5 py-px rounded">
                        Palette {e.hum}
                      </span>
                    </Show>
                    <span class="font-mono text-[12px] font-bold text-foreground">{Math.round(e.qte)} u</span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  )
}
