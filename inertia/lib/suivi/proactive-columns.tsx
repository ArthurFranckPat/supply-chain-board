/**
 * Définitions de colonnes (TanStack) de la vue proactive du Suivi (issue #52 —
 * extrait de scheduler/tracking.tsx). Chaque cellule retourne le même JSX
 * qu'avant pour préserver pixel-perfect.
 */
import { For, Show } from 'solid-js'
import { createColumnHelper } from '@tanstack/solid-table'
import { cx } from '@/libs/cva'
import type { DataTableIndexColumn } from '@/components/ui/data-table'
import type { ProactiveDisplayRow } from '@/lib/suivi/types'
import { OF_STATUT, VERDICT_TONE, LATE_TONE, getRelativeDateLabel } from '@/lib/suivi/tracking-shared'

export interface ProactiveColumnsDeps {
  referenceDate: () => string
}

export function createProactiveColumns({ referenceDate }: ProactiveColumnsDeps) {
  const proHelper = createColumnHelper<ProactiveDisplayRow>()
  return [
    proHelper.accessor('numCommande', {
      header: () => 'Commande · Client',
      cell: (info) => (
        <>
          <div class="font-mono text-[13px] font-bold tracking-tight text-foreground">
            {info.getValue()}
          </div>
          <div class="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">
            {info.row.original.client || '—'}
          </div>
        </>
      ),
      meta: {
        thClass:
          'w-[150px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
    proHelper.accessor('article', {
      header: () => 'Article · Désignation',
      cell: (info) => (
        <>
          <div class="font-mono text-[13px] font-semibold text-brand">
            {info.getValue()}
          </div>
          <div class="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">
            {info.row.original.designation || '—'}
          </div>
        </>
      ),
      meta: {
        thClass:
          'w-[200px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
    proHelper.accessor('type', {
      header: () => 'Type',
      cell: (info) => {
        const val = info.getValue()
        const title =
          val === 'MTS'
            ? 'Make To Stock — Fabriqué pour le stock'
            : val === 'MTO'
              ? 'Make To Order — Fabriqué à la commande client'
              : 'Normal — Ligne standard'
        return (
          <span
            class="rounded bg-brand-soft px-[7px] py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-brand cursor-help"
            title={title}
          >
            {val}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[56px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
    proHelper.accessor('qteRestante', {
      header: () => 'Qté',
      cell: (info) => {
        const row = info.row.original
        const restante = info.getValue() || 1
        const alloc = row.qteAllouee
        const reliquat = row.reliquat
        const pctAlloc = Math.min(100, Math.round((alloc / restante) * 100))
        const pctReliquat = Math.min(100 - pctAlloc, Math.round((reliquat / restante) * 100))
        return (
          <div class="flex flex-col items-end gap-1">
            <div class="flex items-baseline gap-1">
              <span class="font-sans text-[18px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
                {info.getValue()}
              </span>
              <span class="font-mono text-[10px] font-medium text-muted-foreground/80">u</span>
            </div>
            <div
              class="w-full h-[3px] rounded-full bg-secondary overflow-hidden"
              title={`Restant ${restante} · Alloué ${alloc} · Reliquat ${reliquat}`}
            >
              <div class="h-full flex">
                <div class="h-full bg-emerald-500 transition-all" style={{ width: `${pctAlloc}%` }} />
                <div class="h-full bg-amber-400 transition-all" style={{ width: `${pctReliquat}%` }} />
              </div>
            </div>
          </div>
        )
      },
      sortingFn: 'basic',
      meta: {
        thClass:
          'w-[100px] px-4 py-[8px] text-right font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'whitespace-nowrap px-4 py-[9px] text-right align-middle',
      },
    }),
    proHelper.accessor('dateExp', {
      header: () => 'Expé',
      cell: (info) => {
        const late = info.row.original.late
        const rel = getRelativeDateLabel(info.row.original.dateExpIso, referenceDate())
        return (
          <div class="flex flex-col items-start gap-0.5">
            <span classList={{ 'font-bold text-destructive': late, 'text-foreground': !late }}>
              {info.getValue() || '—'}
            </span>
            <Show when={rel}>
              <span class={cx("rounded-[3px] px-1 py-[1px] text-[8.5px] font-sans leading-none tracking-normal font-semibold", rel!.tone)}>
                {rel!.label}
              </span>
            </Show>
          </div>
        )
      },
      sortingFn: (a, b) => {
        const da = a.original.dateExpIso ?? '9999-12-31'
        const db = b.original.dateExpIso ?? '9999-12-31'
        return da < db ? -1 : da > db ? 1 : 0
      },
      meta: {
        thClass:
          'w-[76px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass:
          'whitespace-nowrap px-4 py-[9px] align-middle font-mono text-[12.5px] font-semibold text-foreground',
      },
    }),
    proHelper.accessor('couverture', {
      header: () => 'Couverture',
      cell: (info) => {
        const v = info.getValue()
        const ofs = info.row.original.ofs
        // Couverture par OF : un n° + son statut X3 (WOF/WOP/WOS) par ordre.
        if (ofs.length > 0) {
          return (
            <div class="flex flex-col gap-1">
              <For each={ofs}>
                {(of) => {
                  const st = OF_STATUT[of.statutNum]
                  return (
                    <div class="flex items-center gap-1.5">
                      <span class="font-mono text-[11px] font-semibold leading-snug text-secondary-foreground break-all">
                        {of.numOf}
                      </span>
                      <Show when={st}>
                        <span
                          class={cx(
                            'shrink-0 rounded px-1 py-px font-mono text-[9px] font-bold leading-none cursor-help',
                            st.tone
                          )}
                          title={
                            st.tag === 'WOF'
                              ? 'Work Order Firm (OF Ferme) — Validé et verrouillé'
                              : st.tag === 'WOP'
                                ? 'Work Order Planned (OF Planifié) — Planifié en production'
                                : 'Work Order Suggested (OF Suggéré) — Proposition du calcul des besoins'
                          }
                        >
                          {st.tag}
                        </span>
                      </Show>
                    </div>
                  )
                }}
              </For>
            </div>
          )
        }
        const isGood = v === 'Stock' || v === 'Achat'
        return isGood ? (
          <span
            class="inline-flex items-center gap-1 rounded-md border border-transparent bg-ferme/15 px-2 py-0.5 font-mono text-[11px] font-bold text-ferme cursor-help"
            title={v === 'Stock' ? 'Couvert par le stock disponible' : "Couvert par une commande d'achat fournisseur"}
          >
            {v}
          </span>
        ) : (
          <span class="font-mono text-[11px] font-semibold leading-snug text-secondary-foreground break-all">
            {v}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[150px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
    proHelper.display({
      id: 'verdictKey',
      enableSorting: false,
      header: () => 'Verdict',
      cell: (info) => {
        const o = info.row.original
        return (
          <span
            class={cx(
              'inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
              VERDICT_TONE[o.verdictKey]
            )}
          >
            {o.verdictLabel}
          </span>
        )
      },
      meta: {
        thClass:
          'w-[120px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
    proHelper.display({
      id: 'chargeHeures',
      enableSorting: false,
      header: () => 'Charge',
      cell: (info) => {
        // Charge réelle gamme (Σ qteRestante/cadence) des OF de couverture — indépendante
        // du jalonnement CBN. '—' si couverte par stock/achat (pas d'OF) ou gamme inconnue.
        const known = info.row.original.ofs.filter((of) => of.chargeHeures !== null)
        if (known.length === 0) return <>—</>
        const total = known.reduce((sum, of) => sum + (of.chargeHeures ?? 0), 0)
        return <>{Math.round(total * 10) / 10}h</>
      },
      meta: {
        thClass:
          'w-[70px] px-4 py-[8px] text-right font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass:
          'whitespace-nowrap px-4 py-[9px] text-right align-middle font-mono text-[12.5px] font-semibold text-secondary-foreground',
      },
    }),
    proHelper.display({
      id: 'composants',
      enableSorting: false,
      header: () => 'Goulots',
      cell: (info) => {
        const comps = info.row.original.composants
        if (comps.length === 0)
          return (
            <span class="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">
              —
            </span>
          )
        return (
          <div class="flex flex-col gap-1">
            <For each={comps.slice(0, 4)}>
              {(c) => (
                <div class="flex flex-col gap-px">
                  <div class="flex items-center gap-1.5">
                    <span class="shrink-0 font-mono text-[10.5px] font-bold text-destructive">
                      {c.art}
                    </span>
                    <Show when={c.desc}>
                      <span
                        class="truncate font-sans text-[10px] leading-tight text-muted-foreground"
                        title={c.desc}
                      >
                        {c.desc}
                      </span>
                    </Show>
                    <span class="ml-auto shrink-0 rounded bg-destructive/10 px-1 font-mono text-[10px] font-bold tabular-nums text-destructive">
                      −{c.qty}
                    </span>
                  </div>
                  {/* Descente BOM d'un SE manquant : soit « OF à lancer » (composants dispo),
                      soit les feuilles réellement bloquantes avec leur réception. La lentille
                      réception directe ne s'affiche que pour les composants SANS descente
                      (achetés) — pour un SE elle serait du bruit (pas d'achat sur un fabriqué). */}
                  <Show
                    when={c.descente}
                    fallback={
                      <Show
                        when={c.reception}
                        fallback={
                          <div class="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-medium text-destructive/60">
                            <span class="material-symbols-outlined text-[11px] leading-none text-destructive/50">event_busy</span>
                            Aucune couverture prévue
                          </div>
                        }
                      >
                        {(r) => (
                          <div
                            class="mt-0.5 flex items-center gap-1 font-mono text-[9px] leading-none"
                            classList={{
                              'font-bold text-destructive': r().overdue,
                              'font-medium text-muted-foreground': !r().overdue,
                            }}
                            title={`Fournisseur: ${r().supplier}`}
                          >
                            <span class="material-symbols-outlined text-[11px] leading-none opacity-80">
                              {r().overdue ? 'warning' : 'local_shipping'}
                            </span>
                            <span>
                              {r().overdue
                                ? `En retard +${r().retardJ} j (${r().eta})`
                                : `Arrivée ${r().eta} · ${r().po}`}
                            </span>
                          </div>
                        )}
                      </Show>
                    }
                  >
                    {(d) => (
                      <Show
                        when={d().statut === 'bloque'}
                        fallback={
                          <div class="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-semibold text-emerald-700 leading-none">
                            <span class="material-symbols-outlined text-[11px] leading-none text-emerald-600">subdirectory_arrow_right</span>
                            ↳ SE à lancer (composants dispo)
                          </div>
                        }
                      >
                        <div class="flex flex-col gap-px pl-2 mt-0.5 border-l border-rule-soft">
                          <For each={d().par.slice(0, 3)}>
                            {(p) => (
                              <div
                                class="flex flex-col gap-px font-mono text-[9px] leading-snug text-muted-foreground"
                                title={p.desc}
                              >
                                <div class="flex items-center gap-1">
                                  <span class="material-symbols-outlined text-[10px] leading-none text-muted-foreground/60">subdirectory_arrow_right</span>
                                  <span>Bloqué par <span class="font-bold text-destructive">{p.art}</span> <span class="font-bold text-destructive">−{p.manque}</span></span>
                                </div>
                                <Show
                                  when={p.reception}
                                  fallback={
                                    <div class="pl-3.5 flex items-center gap-0.5 text-[8.5px] text-destructive/60 font-medium">
                                      <span class="material-symbols-outlined text-[10px] leading-none text-destructive/50">event_busy</span>
                                      Aucune couverture prévue
                                    </div>
                                  }
                                >
                                  {(pr) => (
                                    <div
                                      class="pl-3.5 flex items-center gap-0.5 text-[8.5px] font-medium"
                                      classList={{
                                        'text-destructive font-bold': pr().overdue,
                                        'text-muted-foreground/80': !pr().overdue,
                                      }}
                                      title={pr().supplier}
                                    >
                                      <span class="material-symbols-outlined text-[10px] leading-none opacity-80">
                                        {pr().overdue ? 'warning' : 'local_shipping'}
                                      </span>
                                      <span>
                                        {pr().overdue
                                          ? `En retard +${pr().retardJ} j (${pr().eta})`
                                          : `Arrivée ${pr().eta} · ${pr().po}`}
                                      </span>
                                    </div>
                                  )}
                                </Show>
                              </div>
                            )}
                          </For>
                          <Show when={d().par.length > 3}>
                            <div class="pl-3.5 font-mono text-[8.5px] font-medium text-muted-foreground/70">
                              +{d().par.length - 3} autre(s)
                            </div>
                          </Show>
                        </div>
                      </Show>
                    )}
                  </Show>
                </div>
              )}
            </For>
            <Show when={comps.length > 4}>
              <span class="font-mono text-[10px] font-medium text-muted-foreground/70">
                +{comps.length - 4} autre(s)
              </span>
            </Show>
          </div>
        )
      },
      meta: {
        thClass:
          'w-[300px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
  ]
}

/** Index column partagée (N°) pour la table proactive. */
export function createProactiveIndexCol(): DataTableIndexColumn<ProactiveDisplayRow> {
  return {
    headerLabel: 'N°',
    thClass:
      'w-[38px] px-4 py-[8px] text-left font-sans text-[11px] font-semibold tracking-wider text-muted-foreground border-b border-rule',
    tdClass: (row: ProactiveDisplayRow) => {
      // blocked / uncov : pas un retard calendaire mais un vrai problème → rouge foncé.
      // late : utilise la gravité (tolerance/critical).
      const s =
        row.verdictKey === 'blocked' || row.verdictKey === 'uncov'
          ? ('critical' as const)
          : row.lateSeverity
      return cx(
        'px-4 py-[9px] align-middle font-sans text-[12px] font-bold leading-none tracking-tight text-muted-foreground/80 tabular-nums',
        LATE_TONE.bar(s)
      )
    },
  }
}
