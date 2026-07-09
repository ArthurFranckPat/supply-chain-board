import { For, Show, createSignal, onMount, type Accessor, type Component } from 'solid-js'
import { cx } from '@/libs/cva'
import { Button } from '@/components/ui/button'
import type { ScenarioStore } from '@/lib/scenarios/store'

/**
 * Bandeau du mode scénario (issue #57) : « Scénario ‹nom› — N mutations — Impacts
 * — Enregistrer / Appliquer / Jeter » + liste des scénarios enregistrés (rouvrir /
 * supprimer). Affiché sous la toolbar quand le mode scénario est actif.
 *
 * Le bandeau ne touche pas au board : Appliquer/Jeter/Rouvrir délèguent à
 * programme.tsx (seul détenteur des board stores) via callbacks.
 */
export const ScenarioBar: Component<{
  scenario: ScenarioStore
  windowFrom: string
  windowTo: string
  applying: Accessor<boolean>
  onApply: () => void
  onDiscard: () => void
  onOpenScenario: (id: number) => void
  onShowDiff: () => void
}> = (props) => {
  const s = props.scenario
  const [listOpen, setListOpen] = createSignal(false)

  onMount(() => {
    s.loadList()
  })

  const openDiff = () => {
    s.computeDiff(props.windowFrom, props.windowTo)
    props.onShowDiff()
  }

  return (
    <div class="flex flex-none flex-wrap items-center gap-3 border-b border-terra/40 bg-terra-soft px-7 py-2">
      <span class="material-symbols-outlined text-[18px] text-terra">science</span>
      <span class="font-fraunces text-[13px] font-bold text-terra">Scénario</span>

      {/* Nom éditable */}
      <input
        type="text"
        value={s.current.nom}
        placeholder="Nommer le scénario…"
        onInput={(e) => s.setNom(e.currentTarget.value)}
        class="h-[28px] w-[200px] rounded-full border border-terra/30 bg-card px-3 text-[12px] font-semibold text-foreground focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/25"
      />

      <span class="rounded-full bg-card px-2.5 py-1 font-mono text-[11px] font-bold text-foreground">
        {s.mutationCount()} mutation{s.mutationCount() > 1 ? 's' : ''}
      </span>

      <Show when={s.current.statut === 'applique'}>
        <span class="rounded-full bg-emerald-100 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-700">
          Appliqué
        </span>
      </Show>

      <div class="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={s.mutationCount() === 0 || s.diffLoading()}
          onClick={openDiff}
          class="gap-1.5"
        >
          <span class={cx('material-symbols-outlined text-[15px]', s.diffLoading() && 'animate-spin')}>
            {s.diffLoading() ? 'progress_activity' : 'insights'}
          </span>
          Impacts
        </Button>

        <Button size="sm" variant="outline" disabled={s.saving()} onClick={() => s.save()} class="gap-1.5">
          <span class="material-symbols-outlined text-[15px]">save</span>
          {s.saving() ? 'Enregistrement…' : 'Enregistrer'}
        </Button>

        <Button
          size="sm"
          disabled={s.mutationCount() === 0 || props.applying()}
          onClick={props.onApply}
          class="gap-1.5"
        >
          <span class={cx('material-symbols-outlined text-[15px]', props.applying() && 'animate-spin')}>
            {props.applying() ? 'progress_activity' : 'play_arrow'}
          </span>
          {props.applying() ? 'Application…' : 'Appliquer'}
        </Button>

        <Button size="sm" variant="ghost" onClick={props.onDiscard} class="gap-1.5">
          <span class="material-symbols-outlined text-[15px]">delete</span>
          Jeter
        </Button>

        {/* Liste des scénarios enregistrés */}
        <div class="relative">
          <Button size="sm" variant="outline" onClick={() => setListOpen((o) => !o)} class="gap-1.5">
            <span class="material-symbols-outlined text-[15px]">folder_open</span>
            Ouvrir
          </Button>
          <Show when={listOpen()}>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              class="fixed inset-0 z-40 cursor-default"
              onClick={() => setListOpen(false)}
            />
            <div class="absolute right-0 top-full z-50 mt-2 max-h-[60vh] w-[300px] overflow-y-auto rounded-lg border border-rule bg-card p-1 shadow-lg">
              <Show
                when={s.list.length > 0}
                fallback={<div class="px-3 py-4 text-center text-[12px] italic text-muted-foreground">Aucun scénario enregistré.</div>}
              >
                <For each={s.list}>
                  {(sc) => (
                    <div class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                      <button
                        type="button"
                        class="flex-1 text-left"
                        onClick={() => {
                          props.onOpenScenario(sc.id)
                          setListOpen(false)
                        }}
                      >
                        <div class="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                          {sc.nom}
                          <Show when={sc.statut === 'applique'}>
                            <span class="font-mono text-[9px] font-bold uppercase text-emerald-600">appliqué</span>
                          </Show>
                        </div>
                        <div class="font-mono text-[10px] text-muted-foreground">
                          {sc.mutations.length} mut. · {sc.auteur ?? '—'}
                        </div>
                      </button>
                      <button
                        type="button"
                        title="Supprimer"
                        class="material-symbols-outlined text-[16px] text-muted-foreground hover:text-error"
                        onClick={() => s.remove(sc.id)}
                      >
                        delete
                      </button>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
