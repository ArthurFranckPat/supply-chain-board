/**
 * Définitions de colonnes (TanStack) de la vue réactive du Suivi (issue #52 —
 * extrait de scheduler/tracking.tsx). Chaque cellule retourne le même JSX
 * qu'avant pour préserver pixel-perfect.
 */
import { createMemo, For, Show } from 'solid-js'
import { createColumnHelper } from '@tanstack/solid-table'
import { cx } from '@/libs/cva'
import type { DataTableIndexColumn } from '@/components/ui/data-table'
import type { SuiviDisplayRow } from '@/lib/suivi/types'
import { BADGE_TONE, LATE_TONE, empKey } from '@/lib/suivi/tracking-shared'

export interface ReactiveColumnsDeps {
  expandedEmps: () => Set<string>
  toggleEmp: (key: string) => void
}

export function createReactiveColumns({ expandedEmps, toggleEmp }: ReactiveColumnsDeps) {
  const reHelper = createColumnHelper<SuiviDisplayRow>()
  return [
    reHelper.accessor('numCommande', {
      header: () => 'Commande · Client',
      cell: (info) => (
        <>
          <div class="font-mono text-[13px] font-bold tracking-tight text-foreground">
            {info.getValue()}
          </div>
          <Show when={info.row.original.refCommandeClient}>
            <div class="mt-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              Réf: {info.row.original.refCommandeClient}
            </div>
          </Show>
          <div class="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">
            {info.row.original.client || '—'}
          </div>
        </>
      ),
      meta: {
        thClass:
          'w-[178px] px-4 py-[8px] text-left font-mono text-[11px] font-bold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
    reHelper.accessor('article', {
      header: () => 'Article · Désignation',
      cell: (info) => (
        <>
          <div class="font-mono text-[13px] font-semibold text-brand">
            {info.getValue()}
          </div>
          <Show
            when={
              info.row.original.refArticleClient &&
              info.row.original.refArticleClient !== info.getValue()
            }
          >
            <div class="mt-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              Réf: {info.row.original.refArticleClient}
            </div>
          </Show>
          <div class="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">
            {info.row.original.designation || '—'}
          </div>
        </>
      ),
      meta: {
        thClass:
          'w-[240px] px-4 py-[8px] text-left font-mono text-[11px] font-bold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
    reHelper.accessor('type', {
      header: () => 'Type',
      cell: (info) => (
        <span class="rounded bg-brand-soft px-[7px] py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-brand">
          {info.getValue()}
        </span>
      ),
      meta: {
        thClass:
          'w-[56px] px-4 py-[8px] text-left font-mono text-[11px] font-bold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
    reHelper.accessor('qteRestante', {
      header: () => 'Reste',
      cell: (info) => (
        <>
          <span class="font-sans text-[18px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
            {info.getValue()}
          </span>
          <span class="ml-0.5 font-mono text-[10px] font-medium text-muted-foreground/80">u</span>
        </>
      ),
      sortingFn: 'basic',
      meta: {
        thClass:
          'w-[92px] px-4 py-[8px] text-right font-mono text-[11px] font-bold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'whitespace-nowrap px-4 py-[9px] text-right align-middle',
      },
    }),
    reHelper.accessor('dateExp', {
      header: () => 'Expé',
      cell: (info) => {
        const late = info.row.original.late
        return (
          <span classList={{ 'font-bold text-destructive': late, 'text-foreground': !late }}>
            {info.getValue() || '—'}
          </span>
        )
      },
      sortingFn: (a, b) => {
        const da = a.original.dateExpIso ?? '9999-12-31'
        const db = b.original.dateExpIso ?? '9999-12-31'
        return da < db ? -1 : da > db ? 1 : 0
      },
      meta: {
        thClass:
          'w-[76px] px-4 py-[8px] text-left font-mono text-[11px] font-bold tracking-wider text-muted-foreground border-b border-rule',
        tdClass:
          'whitespace-nowrap px-4 py-[9px] align-middle font-mono text-[12.5px] font-semibold',
      },
    }),
    reHelper.display({
      id: 'emplacements',
      enableSorting: false,
      header: () => 'Emplacement',
      cell: (info) => {
        const r = info.row.original
        const emps = r.emplacements
        if (emps.length === 0)
          return (
            <span class="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">
              —
            </span>
          )
        const key = empKey(r)
        const expanded = createMemo(() => expandedEmps().has(key))
        // 1 pill visible par défaut ; les autres apparaissent au dépliage.
        const visible = () => (expanded() ? emps : emps.slice(0, 1))
        const hidden = () => emps.length - 1
        return (
          <div class="flex flex-col gap-[3px]">
            <For each={visible()}>
              {(e) => (
                <span
                  class={cx(
                    'flex w-full items-center gap-1.5 whitespace-nowrap rounded border px-2 py-1 font-mono text-[10.5px] leading-[1.4]',
                    e.source === 'STOALL'
                      ? 'border-ferme/30 bg-ferme/15 text-ferme'
                      : 'border-transparent bg-secondary text-secondary-foreground',
                    e.alreadyAllocated && 'line-through opacity-60'
                  )}
                  title={
                    e.source === 'STOALL'
                      ? 'STOALL — déjà alloué à la commande'
                      : e.alreadyAllocated
                        ? 'Déjà alloué à une autre commande'
                        : 'STOCK — en stock libre, allocation à faire'
                  }
                >
                  {/* Pill w-full = même largeur sur toutes les lignes (cellule fixe
                      300px). 3 zones : label (shrink-0, à gauche), spacer flex-1
                      (ressort), palette + qté (shrink-0, groupées à droite). Le spacer
                      garantit que la qté reste collée à droite même sans palette. */}
                  <span class="flex min-w-[52px] shrink-0 items-center gap-1">
                    <span
                      class={cx(
                        'material-symbols-outlined text-[13px] leading-none',
                        e.source === 'STOALL' ? 'text-ferme' : 'text-muted-foreground/70'
                      )}
                    >
                      {e.source === 'STOALL' ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span class="font-semibold">{e.nom}</span>
                  </span>
                  <span class="flex-1" />
                  <Show when={e.hum}>
                    <span
                      class="shrink-0 rounded bg-card/60 px-1.5 py-px font-mono text-[9.5px] font-bold text-foreground"
                      title={`Numéro de palette : ${e.hum}`}
                    >
                      {e.hum.length > 8 ? `...${e.hum.slice(-6)}` : e.hum}
                    </span>
                  </Show>
                  <span class="w-[20px] shrink-0 text-right font-bold tabular-nums">
                    {e.qte > 0 ? Math.round(e.qte) : '·'}
                  </span>
                </span>
              )}
            </For>
            {/* Toggle fold/unfold — n'apparaît que pour les lignes > 1 emplacement. */}
            <Show when={hidden() > 0}>
              <button
                type="button"
                class="flex w-full items-center gap-1 rounded border border-dashed border-rule px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground transition-colors hover:border-brand hover:text-brand"
                onClick={() => toggleEmp(key)}
              >
                <span class="material-symbols-outlined text-[13px] leading-none">
                  {expanded() ? 'expand_less' : 'expand_more'}
                </span>
                {expanded() ? 'Réduire' : `+${hidden()} emplacement${hidden()! > 1 ? 's' : ''}`}
              </button>
            </Show>
          </div>
        )
      },
      // Élargie (190→300px) pour loger le PALNUM complet sur une seule ligne,
      // sans troncature ni retour à la ligne (le tableau scrolle horizontalement).
      meta: {
        thClass:
          'w-[300px] px-4 py-[8px] text-left font-mono text-[11px] font-bold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
    reHelper.display({
      id: 'statusKey',
      enableSorting: false,
      header: () => 'Statut',
      cell: (info) => {
        const o = info.row.original
        return (
          <div class="flex flex-col items-start gap-1">
            <span
              class={cx(
                'inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
                BADGE_TONE[o.statusKey]
              )}
            >
              <span class="material-symbols-outlined grid size-[14px] place-items-center overflow-hidden text-[14px] leading-none">
                {o.statusIcon}
              </span>
              {o.statusLabel}
            </span>
            <Show when={o.cq}>
              <span class="inline-flex items-center gap-1 rounded-md border border-transparent bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand whitespace-nowrap">
                <span class="material-symbols-outlined grid size-[14px] place-items-center text-[14px] leading-none">
                  science
                </span>
                CQ
              </span>
            </Show>
            <Show when={o.attenteLignes}>
              <span
                class="inline-flex items-center gap-1 rounded-md border border-transparent bg-suggere/15 px-2 py-0.5 text-[11px] font-medium text-suggere whitespace-nowrap"
                title="Commande MTO — expédition partielle non autorisée, en attente des autres lignes"
              >
                <span class="material-symbols-outlined grid size-[14px] place-items-center text-[14px] leading-none">
                  pending
                </span>
                Attente lignes
              </span>
            </Show>
          </div>
        )
      },
      meta: {
        thClass:
          'w-[130px] px-4 py-[8px] text-left font-mono text-[11px] font-bold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
    reHelper.display({
      id: 'cause',
      enableSorting: false,
      header: () => 'Cause du retard',
      cell: (info) => {
        const cause = info.row.original.cause
        if (!cause)
          return (
            <span class="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">
              —
            </span>
          )
        return (
          <>
            <div class="text-[12px] leading-snug text-secondary-foreground">{cause.label}</div>
            <Show when={cause.comps.length > 0}>
              <span class="mt-[3px] block font-mono text-[10px] font-bold text-destructive">
                {cause.comps.map((c) => `${c.art} −${c.qty}`).join(' · ')}
              </span>
            </Show>
            <Show when={cause.reception}>
              <span class="mt-[2px] block font-mono text-[10px] font-medium text-muted-foreground">
                arrive {cause.reception!.eta} · {cause.reception!.po}
              </span>
            </Show>
            <Show when={cause.retro?.composant}>
              <span class="mt-[2px] block font-mono text-[10px] font-medium text-muted-foreground">
                {cause.retro!.composant!.art} dispo {cause.retro!.composant!.dispoA}
                <Show when={cause.retro!.composant!.cq}> (CQ)</Show>
              </span>
            </Show>
            <Show when={cause.retro?.affermissement}>
              <span class="mt-[1px] block font-mono text-[10px] text-muted-foreground/70">
                OF {cause.retro!.ofPegue} affermi {cause.retro!.affermissement}
              </span>
            </Show>
          </>
        )
      },
      meta: {
        thClass:
          'w-[280px] px-4 py-[8px] text-left font-mono text-[11px] font-bold tracking-wider text-muted-foreground border-b border-rule',
        tdClass: 'px-4 py-[9px] align-middle',
      },
    }),
  ]
}

/** Index column partagée (N°) pour la table réactive. */
export function createReactiveIndexCol(): DataTableIndexColumn<SuiviDisplayRow> {
  return {
    headerLabel: 'N°',
    thClass:
      'w-[38px] px-4 py-[8px] text-left font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground border-b border-rule',
    tdClass: (row: SuiviDisplayRow) =>
      cx(
        'px-4 py-[9px] align-middle font-sans text-[12px] font-bold leading-none tracking-tight text-muted-foreground/80 tabular-nums',
        LATE_TONE.bar(row.lateSeverity)
      ),
  }
}
