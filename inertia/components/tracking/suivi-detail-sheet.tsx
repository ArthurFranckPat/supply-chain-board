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

  // Stepper calculations
  const step1 = () => true // Commande toujours enregistrée
  const step2 = () => isReactif() ? true : (proactiveRow().ofs.length > 0 || proactiveRow().couverture === 'Stock' || proactiveRow().couverture === 'Achat')
  const step3 = () => {
    const allocVal = isReactif() 
      ? (reactiveRow().allocStrict + reactiveRow().allocCq) 
      : proactiveRow().qteAllouee
    return allocVal >= r().qteRestante
  }
  const step4 = () => isReactif() ? !reactiveRow().cq : true // Si pas de signal CQ, alors c'est vert
  const step5 = () => r().enZoneExpe

  // Quantity bar calculations
  const total = () => r().qteRestante || 1
  const strictVal = () => isReactif() ? reactiveRow().allocStrict : proactiveRow().qteAllouee
  const cqVal = () => isReactif() ? reactiveRow().allocCq : 0
  const reliquatVal = () => isReactif() ? Math.max(0, total() - strictVal() - cqVal()) : proactiveRow().reliquat

  const pctStrict = () => Math.round((strictVal() / total()) * 100)
  const pctCq = () => Math.round((cqVal() / total()) * 100)
  const pctReliquat = () => Math.round((reliquatVal() / total()) * 100)

  return (
    <div class="flex flex-col gap-6 text-sans pb-8">
      {/* 1. Stepper de Cycle de Commande */}
      <div class="flex items-center justify-between px-3 py-4 bg-secondary/15 rounded-2xl border border-rule-soft/60 relative overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)]">
        <div class="absolute left-10 right-10 top-[2.25rem] h-0.5 bg-secondary border-t border-rule-soft z-0" />
        
        {/* Etape 1: Commande */}
        <div class="flex flex-col items-center gap-1.5 z-10 w-16">
          <div class="size-8 rounded-full flex items-center justify-center font-bold text-[12px] transition-all"
               classList={{
                 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]': step1(),
                 'bg-secondary text-muted-foreground': !step1()
               }}>
            <span class="material-symbols-outlined text-[16px]">receipt_long</span>
          </div>
          <span class="text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground text-center">Enregistré</span>
        </div>

        {/* Etape 2: OF Planifié */}
        <div class="flex flex-col items-center gap-1.5 z-10 w-16">
          <div class="size-8 rounded-full flex items-center justify-center font-bold text-[12px] transition-all"
               classList={{
                 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]': step2(),
                 'bg-secondary text-muted-foreground': !step2()
               }}>
            <span class="material-symbols-outlined text-[16px]">precision_manufacturing</span>
          </div>
          <span class="text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground text-center">OF Planifié</span>
        </div>

        {/* Etape 3: Stock Alloué */}
        <div class="flex flex-col items-center gap-1.5 z-10 w-16">
          <div class="size-8 rounded-full flex items-center justify-center font-bold text-[12px] transition-all"
               classList={{
                 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]': step3(),
                 'bg-amber-500 text-white animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.3)]': !step3() && (strictVal() + cqVal() > 0),
                 'bg-secondary text-muted-foreground': !step3() && !(strictVal() + cqVal() > 0)
               }}>
            <span class="material-symbols-outlined text-[16px]">inventory_2</span>
          </div>
          <span class="text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground text-center">Alloué</span>
        </div>

        {/* Etape 4: Labo (CQ) */}
        <div class="flex flex-col items-center gap-1.5 z-10 w-16">
          <div class="size-8 rounded-full flex items-center justify-center font-bold text-[12px] transition-all"
               classList={{
                 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]': step4(),
                 'bg-purple-500 text-white animate-pulse shadow-[0_0_12px_rgba(168,85,247,0.3)]': !step4()
               }}>
            <span class="material-symbols-outlined text-[16px]">science</span>
          </div>
          <span class="text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground text-center">Labo (CQ)</span>
        </div>

        {/* Etape 5: Zone Expé */}
        <div class="flex flex-col items-center gap-1.5 z-10 w-16">
          <div class="size-8 rounded-full flex items-center justify-center font-bold text-[12px] transition-all"
               classList={{
                 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]': step5(),
                 'bg-secondary text-muted-foreground': !step5()
               }}>
            <span class="material-symbols-outlined text-[16px]">local_shipping</span>
          </div>
          <span class="text-[8.5px] font-extrabold uppercase tracking-wider text-muted-foreground text-center">Zone Expé</span>
        </div>
      </div>

      {/* 2. Header Card (Fiche Commande) */}
      <div class="relative overflow-hidden rounded-2xl border border-rule bg-gradient-to-br from-secondary/30 via-secondary/10 to-transparent p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-sm">
        <div class="absolute -right-6 -top-6 size-24 rounded-full bg-brand/5 opacity-[0.03] blur-xl" />
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-[13px] font-extrabold tracking-tight text-foreground bg-foreground/[0.05] px-2.5 py-0.5 rounded-lg border border-rule">
                {r().numCommande}
              </span>
              <span class="text-[11px] font-sans font-bold text-muted-foreground/75">
                • Commande client
              </span>
            </div>
            <Show when={r().refCommandeClient}>
              <div class="mt-2 font-mono text-[10.5px] text-muted-foreground font-medium">
                Réf ext: <span class="text-foreground/80">{r().refCommandeClient}</span>
              </div>
            </Show>
          </div>
          <div class="shrink-0">
            <span class="rounded-full bg-brand-soft/80 border border-brand/20 px-2.5 py-1 font-mono text-[10px] font-extrabold tracking-wide text-brand uppercase">
              {r().type}
            </span>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-4 border-t border-rule-soft/60 pt-4">
          <div>
            <span class="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">Client</span>
            <div class="text-[13px] font-bold text-foreground mt-0.5">{r().client}</div>
          </div>
          <div>
            <span class="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">Atelier / Ligne</span>
            <div class="text-[13px] font-bold text-foreground mt-0.5">{r().atelierLabel || '—'}</div>
          </div>
        </div>

        <div class="mt-4 border-t border-rule-soft/60 pt-4">
          <span class="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">Article & Désignation</span>
          <div class="mt-1 flex items-baseline gap-2">
            <span class="font-mono text-[12.5px] font-bold text-brand">{r().article}</span>
            <Show when={r().refArticleClient && r().refArticleClient !== r().article}>
              <span class="font-mono text-[10px] text-muted-foreground bg-secondary/40 px-1.5 py-px rounded">(Client: {r().refArticleClient})</span>
            </Show>
          </div>
          <div class="text-[12.5px] font-medium text-secondary-foreground leading-relaxed mt-1">{r().designation || '—'}</div>
        </div>
      </div>

      {/* 3. Alert Notification (Recommandation) */}
      <div class="relative overflow-hidden rounded-2xl border p-5 flex flex-col gap-2.5 transition-all shadow-[0_4px_20px_-6px_rgba(0,0,0,0.02)] border-rule"
           classList={{
             'bg-brand/5 border-brand/20 text-brand': r().action.severity === 'info',
             'bg-amber-500/[0.04] border-amber-500/25 text-amber-600 dark:text-amber-400': r().action.severity === 'warning',
             'bg-destructive/[0.03] border-destructive/20 text-destructive': r().action.severity === 'critical',
           }}>
        <div class="absolute right-0 top-0 translate-x-3 -translate-y-3 opacity-[0.04]">
          <span class="material-symbols-outlined text-[72px] leading-none">
            {r().action.severity === 'critical' ? 'report' : r().action.severity === 'warning' ? 'warning' : 'info'}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px]">
            {r().action.severity === 'critical' ? 'report' : r().action.severity === 'warning' ? 'warning' : 'info'}
          </span>
          <span class="text-[10px] font-extrabold uppercase tracking-wider">
            Recommandation Supply-Chain
          </span>
        </div>
        <p class="text-[13px] font-bold leading-relaxed text-foreground">
          {r().action.label}
        </p>
      </div>

      {/* 4. Expé & Délais */}
      <div class="grid grid-cols-2 gap-4">
        <div class="rounded-2xl border border-rule p-4 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between h-20">
          <span class="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">Date d'Expédition</span>
          <div class="font-mono text-[16px] font-black text-foreground">{r().dateExp || '—'}</div>
        </div>
        <div class="rounded-2xl border border-rule p-4 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col justify-between h-20">
          <span class="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/80">État de Livraison</span>
          <div class="flex flex-col gap-0.5">
            <Show when={isReactif()} fallback={
              <span class={cx("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-extrabold w-fit uppercase tracking-wide", VERDICT_TONE[proactiveRow().verdictKey])}>
                {proactiveRow().verdictLabel}
              </span>
            }>
              <span class={cx("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-extrabold w-fit uppercase tracking-wide", BADGE_TONE[reactiveRow().statusKey])}>
                {reactiveRow().statusLabel}
              </span>
            </Show>
            <Show when={r().late}>
              <span class="text-[10.5px] text-destructive font-bold mt-0.5 flex items-center gap-0.5">
                <span class="material-symbols-outlined text-[12px] leading-none">schedule</span>
                Retard: +{r().lateDays} jour{r().lateDays > 1 ? 's' : ''}
              </span>
            </Show>
          </div>
        </div>
      </div>

      {/* 5. Gauge Visuelle & Répartition des Quantités */}
      <div class="rounded-2xl border border-rule p-5 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col gap-4">
        <h4 class="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80 border-b border-rule-soft pb-2">
          Répartition des Quantités
        </h4>
        
        {/* Stacked Progress Bar */}
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-[11px] font-semibold text-foreground/85">
            <span>Rapport d'allocation</span>
            <span>{strictVal() + cqVal()} / {total()} u ({pctStrict() + pctCq()}%)</span>
          </div>
          <div class="relative h-3 w-full bg-secondary/50 rounded-full overflow-hidden flex border border-rule-soft">
            <div class="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${pctStrict()}%` }} />
            <div class="bg-purple-500 h-full transition-all duration-500" style={{ width: `${pctCq()}%` }} />
            <div class="bg-secondary h-full transition-all duration-500" style={{ width: `${pctReliquat()}%` }} />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center mt-2">
          <div class="bg-secondary/15 p-2.5 rounded-xl border border-rule-soft/40">
            <div class="text-[9.5px] font-semibold text-muted-foreground">Reste à livrer</div>
            <div class="font-mono text-[16px] font-black text-foreground mt-0.5">{total()}</div>
          </div>
          <Show when={isReactif()} fallback={
            <>
              <div class="bg-secondary/15 p-2.5 rounded-xl border border-rule-soft/40">
                <div class="text-[9.5px] font-semibold text-emerald-600">Alloué</div>
                <div class="font-mono text-[16px] font-black text-emerald-600 mt-0.5">{proactiveRow().qteAllouee}</div>
              </div>
              <div class="bg-secondary/15 p-2.5 rounded-xl border border-rule-soft/40">
                <div class="text-[9.5px] font-semibold text-muted-foreground">Reliquat</div>
                <div class="font-mono text-[16px] font-black text-foreground mt-0.5">{proactiveRow().reliquat}</div>
              </div>
            </>
          }>
            <div class="bg-secondary/15 p-2.5 rounded-xl border border-rule-soft/40">
              <div class="text-[9.5px] font-semibold text-emerald-600">Strict</div>
              <div class="font-mono text-[16px] font-black text-emerald-600 mt-0.5">{reactiveRow().allocStrict}</div>
            </div>
            <div class="bg-secondary/15 p-2.5 rounded-xl border border-rule-soft/40">
              <div class="text-[9.5px] font-semibold text-purple-600">Sous CQ</div>
              <div class="font-mono text-[16px] font-black text-purple-600 mt-0.5">{reactiveRow().allocCq}</div>
            </div>
          </Show>
        </div>
      </div>

      {/* 6. Goulots & Approvisionnements (BOM) */}
      <Show when={!isReactif() && proactiveRow().composants.length > 0}>
        <div class="rounded-2xl border border-rule p-4 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col gap-4">
          <h4 class="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80 border-b border-rule-soft pb-2">
            Goulots d'Approvisionnement
          </h4>
          <div class="flex flex-col gap-4">
            <For each={proactiveRow().composants}>
              {(c) => (
                <div class="border-b border-rule-soft last:border-0 pb-4 last:pb-0 flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <span class="font-mono text-[12.5px] font-bold text-destructive">{c.art}</span>
                    <span class="rounded bg-destructive/10 px-2 py-0.5 font-mono text-[10px] font-extrabold text-destructive">
                      −{c.qty} manquants
                    </span>
                  </div>
                  <div class="text-[12px] font-medium text-secondary-foreground leading-normal">{c.desc}</div>

                  {/* Reception Directe (Acheminement) */}
                  <Show when={c.reception} fallback={
                    <Show when={!c.descente}>
                      <div class="flex items-center gap-1 font-mono text-[10px] text-destructive/80 font-bold bg-destructive/5 px-2.5 py-1 rounded-lg w-fit border border-destructive/10">
                        <span class="material-symbols-outlined text-[13px] leading-none">event_busy</span>
                        Aucune réception d'achat de couverture prévue.
                      </div>
                    </Show>
                  }>
                    {(rcpt) => (
                      <div class="rounded-xl border border-rule-soft bg-gradient-to-r from-secondary/15 to-transparent p-4 flex flex-col gap-3">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-1.5 text-[11px] font-bold"
                               classList={{ 'text-destructive': rcpt().overdue, 'text-brand': !rcpt().overdue }}>
                            <span class="material-symbols-outlined text-[16px]">
                              {rcpt().overdue ? 'warning' : 'local_shipping'}
                            </span>
                            <span>{rcpt().overdue ? `Retard d'approvisionnement (+${rcpt().retardJ}j)` : 'Acheminement en cours'}</span>
                          </div>
                          <span class="font-mono text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-rule-soft">
                            PO: {rcpt().po}
                          </span>
                        </div>

                        {/* Delivery Timeline Track */}
                        <div class="flex items-center gap-2 mt-1 px-1">
                          {/* Sourced */}
                          <div class="flex-1 flex flex-col gap-1">
                            <div class="h-1.5 bg-emerald-500 rounded-full" />
                            <span class="text-[8px] font-extrabold text-emerald-600 uppercase">Commandé</span>
                          </div>
                          {/* In transit */}
                          <div class="flex-1 flex flex-col gap-1">
                            <div class="h-1.5 rounded-full" classList={{ 'bg-destructive/40': rcpt().overdue, 'bg-emerald-500': !rcpt().overdue }} />
                            <span class="text-[8px] font-extrabold uppercase" classList={{ 'text-destructive font-bold': rcpt().overdue, 'text-emerald-600': !rcpt().overdue }}>Transit</span>
                          </div>
                          {/* ETA */}
                          <div class="flex-1 flex flex-col gap-1">
                            <div class="h-1.5 rounded-full" classList={{ 'bg-destructive': rcpt().overdue, 'bg-secondary': !rcpt().overdue }} />
                            <span class="text-[8px] font-extrabold uppercase" classList={{ 'text-destructive font-bold': rcpt().overdue, 'text-muted-foreground': !rcpt().overdue }}>Arrivée ({rcpt().eta})</span>
                          </div>
                        </div>

                        <div class="text-[11px] mt-1 border-t border-rule-soft/60 pt-2 text-muted-foreground flex flex-col gap-0.5">
                          <div><span class="font-semibold text-foreground/80">Fournisseur :</span> {rcpt().supplier}</div>
                        </div>
                      </div>
                    )}
                  </Show>

                  {/* Descente de Nomenclature (Niveau Cascade) */}
                  <Show when={c.descente}>
                    {(d) => (
                      <div class="rounded-xl border border-rule-soft bg-secondary/15 p-3 flex flex-col gap-2">
                        <div class="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                          <span class="material-symbols-outlined text-[14px]">subdirectory_arrow_right</span>
                          <span>Nomenclature sous-ensemble</span>
                        </div>
                        <Show when={d().statut === 'se_a_lancer'} fallback={
                          <div class="flex flex-col gap-2.5 pl-3 border-l-2 border-dotted border-destructive/20 ml-2 mt-1">
                            <div class="text-[9.5px] font-extrabold text-destructive uppercase tracking-wide">Composants parents bloquants :</div>
                            <For each={d().par}>
                              {(p) => (
                                <div class="text-[11px] text-muted-foreground flex flex-col gap-1 relative pl-2">
                                  <div class="absolute left-0 top-1.5 size-1.5 rounded-full bg-destructive/40 -translate-x-[15px]" />
                                  <div class="flex items-baseline justify-between gap-2">
                                    <span class="text-foreground/80"><b class="font-mono font-bold text-destructive text-[11.5px]">{p.art}</b> <span class="text-[10px] opacity-80">({p.desc})</span></span>
                                    <span class="font-mono font-bold text-destructive shrink-0">−{p.manque}</span>
                                  </div>
                                  <Show when={p.reception} fallback={
                                    <div class="flex items-center gap-0.5 text-[9.5px] text-destructive/80 font-bold bg-destructive/5 px-2 py-0.5 rounded w-fit">
                                      <span class="material-symbols-outlined text-[11px] leading-none">event_busy</span>
                                      Aucune couverture
                                    </div>
                                  }>
                                    {(pr) => (
                                      <div class="rounded bg-secondary/40 p-2.5 flex flex-col gap-0.5 text-[10px] mt-0.5 border border-rule-soft">
                                        <div class="flex items-center gap-1 font-semibold" classList={{ 'text-destructive': pr().overdue, 'text-foreground/75': !pr().overdue }}>
                                          <span class="material-symbols-outlined text-[12px]">
                                            {pr().overdue ? 'warning' : 'local_shipping'}
                                          </span>
                                          <span>{pr().overdue ? `Retard +${pr().retardJ}j` : 'Livraison prévue'}</span>
                                        </div>
                                        <div class="flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground mt-0.5">
                                          <span>PO: <span class="text-foreground/80">{pr().po}</span></span>
                                          <span>Arrivée: <span class="text-foreground/80">{pr().eta}</span></span>
                                        </div>
                                      </div>
                                    )}
                                  </Show>
                                </div>
                              )}
                            </For>
                          </div>
                        }>
                          <div class="pl-3.5 text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">check_circle</span>
                            Composants disponibles — OF du sous-ensemble prêt à lancer
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

      {/* 7. Ordres de Fabrication Associés */}
      <Show when={!isReactif() && proactiveRow().ofs.length > 0}>
        <div class="rounded-2xl border border-rule p-4 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col gap-4">
          <h4 class="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80 border-b border-rule-soft pb-2">
            Ordres de Fabrication ({proactiveRow().ofs.length})
          </h4>
          <div class="flex flex-col gap-4">
            <For each={proactiveRow().ofs}>
              {(of) => {
                const st = OF_STATUT[of.statutNum]
                return (
                  <div class="border border-rule-soft rounded-xl p-4 flex flex-col gap-3 bg-secondary/15 relative overflow-hidden">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span class="font-mono text-[13px] font-bold text-foreground bg-card border border-rule px-2.5 py-0.5 rounded shadow-sm">
                          {of.numOf}
                        </span>
                        <Show when={of.estDebuté}>
                          <span class="relative flex h-2 size-2 rounded-full bg-brand-soft/80" title="OF Débuté">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-2 size-2 bg-brand"></span>
                          </span>
                        </Show>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <Show when={of.estDebuté}>
                          <span class="rounded px-2 py-0.5 font-sans text-[8.5px] font-extrabold uppercase text-brand bg-brand-soft border border-brand/10">
                            En cours
                          </span>
                        </Show>
                        <Show when={st}>
                          <span class={cx("rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider border border-transparent", st.tone)}>
                            {st.tag}
                          </span>
                        </Show>
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground border-t border-rule-soft/60 pt-3">
                      <div>
                        <span class="text-foreground/60 font-semibold">Composant de tête :</span>
                        <div class="font-mono text-foreground font-semibold mt-0.5">{of.article}</div>
                      </div>
                      <div>
                        <span class="text-foreground/60 font-semibold">Quantité allouée :</span>
                        <div class="font-mono text-foreground font-semibold mt-0.5">{of.qteAllouee} u</div>
                      </div>
                      <div>
                        <span class="text-foreground/60 font-semibold">Fin planifiée :</span>
                        <div class="font-mono text-foreground font-semibold mt-0.5">{of.dateFin}</div>
                      </div>
                      <div>
                        <span class="text-foreground/60 font-semibold">État de faisabilité :</span>
                        <div class="mt-0.5">
                          <span class="inline-flex items-center gap-1 text-[11px] font-bold"
                                classList={{ 'text-emerald-600': of.feasible, 'text-destructive': !of.feasible }}>
                            <span class="material-symbols-outlined text-[13px] leading-none">
                              {of.feasible ? 'check_circle' : 'cancel'}
                            </span>
                            {of.feasible === null ? '—' : of.feasible ? 'Prêt à produire' : 'Bloqué'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Show when={of.missingComponents.length > 0}>
                      <div class="border-t border-rule-soft/60 pt-3 mt-1 flex flex-col gap-1.5">
                        <div class="text-[9.5px] font-bold text-destructive uppercase tracking-wide">Composants manquants :</div>
                        <div class="flex flex-wrap gap-1.5">
                          <For each={of.missingComponents}>
                            {(mc) => (
                              <span class="rounded bg-destructive/5 border border-destructive/10 px-2 py-0.5 font-mono text-[9px] text-destructive font-semibold">
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

      {/* 8. Emplacements de Stock */}
      <Show when={isReactif() && reactiveRow().emplacements.length > 0}>
        <div class="rounded-2xl border border-rule p-4 bg-card shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col gap-4">
          <h4 class="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80 border-b border-rule-soft pb-2">
            Emplacements & Palettes de Stock
          </h4>
          <div class="flex flex-col gap-2.5">
            <For each={reactiveRow().emplacements}>
              {(e) => (
                <div class="flex items-center justify-between border border-rule-soft/60 rounded-xl p-3 bg-secondary/5 hover:bg-secondary/15 transition-all">
                  <div class="flex items-center gap-3">
                    <div class="size-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground/75 border border-rule-soft">
                      <span class="material-symbols-outlined text-[18px]">
                        {e.source === 'STOALL' ? 'inventory' : 'shelves'}
                      </span>
                    </div>
                    <div>
                      <div class="font-mono text-[12px] font-bold text-foreground">{e.nom}</div>
                      <div class="text-[9px] text-muted-foreground uppercase font-extrabold tracking-wider mt-0.5"
                           classList={{ 'text-emerald-600': e.source === 'STOALL', 'text-amber-600': e.source === 'STOCK' }}>
                        {e.source === 'STOALL' ? 'Stock Alloué' : 'Stock Libre'}
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <Show when={e.hum}>
                      <span class="font-mono text-[10px] text-muted-foreground bg-secondary/55 px-2 py-0.5 rounded-lg border border-rule-soft">
                        HU: {e.hum}
                      </span>
                    </Show>
                    <span class="font-mono text-[12.5px] font-extrabold text-foreground bg-secondary/30 px-2 py-1 rounded border border-rule-soft">
                      {Math.round(e.qte)} u
                    </span>
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
