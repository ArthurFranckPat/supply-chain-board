import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
  type Component,
} from 'solid-js'
import { cx } from '@/libs/cva'
import { Button } from '@/components/ui/button'
import { router } from '@/lib/inertia-solid'
import { route } from '@/lib/routes'
import { promiseReasonText } from '@/lib/promesse/types'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPortal,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ScenarioStore } from '@/lib/scenarios/store'
import type { PlanMutation } from '@/lib/scenarios/types'

/**
 * Bandeau du mode scénario (issue #57) : « Scénario ‹nom› — N mutations — Impacts
 * — Enregistrer / Appliquer / Jeter » + liste des scénarios enregistrés (rouvrir /
 * supprimer). Affiché sous la toolbar quand le mode scénario est actif.
 *
 * Le bandeau ne touche pas au board : Appliquer/Jeter/Rouvrir délèguent à
 * programme.tsx (seul détenteur des board stores) via callbacks.
 *
 * Issue #58 : bouton « + Commande virtuelle » — formulaire (article, qté, date de
 * besoin, client libre) qui empile une mutation `inject_demand`. Rien n'est écrit
 * en X3 ; la carte n'existe que dans le scénario (cf. VirtualCell sur le board).
 */
export const ScenarioBar: Component<{
  scenario: ScenarioStore
  windowFrom: string
  windowTo: string
  applying: Accessor<boolean>
  articleOptions: string[]
  onApply: () => void
  onDiscard: () => void
  onOpenScenario: (id: number) => void
  onShowDiff: () => void
  onInjectDemand: (m: Extract<PlanMutation, { type: 'inject_demand' }>) => void
}> = (props) => {
  const s = props.scenario
  const [listOpen, setListOpen] = createSignal(false)
  const [formOpen, setFormOpen] = createSignal(false)
  // #62 (lot 0) : « Jeter » détruit N mutations sans retour possible → confirmation
  // explicite dès qu'il y a quelque chose à perdre (scénario vide : jet direct).
  const [confirmDiscardOpen, setConfirmDiscardOpen] = createSignal(false)
  const [selectedIds, setSelectedIds] = createSignal<number[]>([])
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }
  const requestDiscard = () => {
    if (s.mutationCount() === 0) props.onDiscard()
    else setConfirmDiscardOpen(true)
  }
  const confirmDiscard = () => {
    setConfirmDiscardOpen(false)
    props.onDiscard()
  }
  const [article, setArticle] = createSignal('')
  const [quantity, setQuantity] = createSignal('1')
  // CTP §6.1 : champ vide = « au plus tôt » (le moteur calcule la date engageante).
  const [date, setDate] = createSignal('')
  const [client, setClient] = createSignal('')

  onMount(() => {
    s.loadList()
  })

  // CTP §6.1 — date au plus tôt (mode engageante) recalculée en arrière-plan
  // dès que (article, qté) est valide. Sert à pré-remplir le champ date laissé
  // vide et à avertir si la date saisie est avant le possible.
  const [earliest, setEarliest] = createSignal<null | { date: string; limiting: string }>(null)
  const [earliestLoading, setEarliestLoading] = createSignal(false)
  let debounceId: ReturnType<typeof setTimeout> | undefined

  const fetchEarliest = async (
    art: string,
    qty: number
  ): Promise<{ date: string; limiting: string } | null> => {
    setEarliestLoading(true)
    try {
      const params = new URLSearchParams({ article: art, quantity: String(qty) })
      const res = await fetch(`${route('promesse.index')}?${params}`)
      if (!res.ok) return null
      const data = await res.json()
      if (data.engageante?.infeasible) {
        const out = { date: '', limiting: 'infaisable (ni stock, ni flux, ni nomenclature)' }
        setEarliest(out)
        return out
      }
      const lf = data.engageante.limitingFactor
      const out = {
        date: String(data.engageante.promiseDate).slice(0, 10),
        limiting: lf ? `${lf.article} — ${promiseReasonText(lf.reason)}` : '',
      }
      setEarliest(out)
      return out
    } catch {
      return null
    } finally {
      setEarliestLoading(false)
    }
  }

  createEffect(() => {
    const art = article().trim()
    const qty = Number(quantity())
    setEarliest(null)
    clearTimeout(debounceId)
    if (!formOpen() || !art || !Number.isFinite(qty) || qty <= 0) return
    debounceId = setTimeout(() => fetchEarliest(art, qty), 400)
  })
  onCleanup(() => clearTimeout(debounceId))

  const submitInject = async (e: SubmitEvent) => {
    e.preventDefault()
    const art = article().trim()
    const qty = Number(quantity())
    if (!art || !Number.isFinite(qty) || qty <= 0) return
    let besoin = date()
    let fromEngine = false
    if (!besoin) {
      // Date vide → date au plus tôt du moteur CTP (déjà chargée ou à la volée).
      const e2 = earliest() ?? (await fetchEarliest(art, qty))
      if (!e2?.date) return
      besoin = e2.date
      fromEngine = true
    }
    props.onInjectDemand({
      type: 'inject_demand',
      id: `VIRT-${Date.now().toString(36)}`,
      article: art,
      quantity: qty,
      date: besoin,
      client: client().trim() || undefined,
      earliest: fromEngine || undefined,
    })
    setArticle('')
    setQuantity('1')
    setDate('')
    setClient('')
    setFormOpen(false)
  }

  const openDiff = () => {
    s.computeDiff(props.windowFrom, props.windowTo)
    props.onShowDiff()
  }

  return (
    <div class="flex flex-none flex-wrap items-center gap-3 border-b border-brand/40 bg-brand-soft px-7 py-2">
      <span class="material-symbols-outlined text-[18px] text-brand">science</span>
      <span class="font-fraunces text-[13px] font-bold text-brand">Scénario</span>

      {/* Nom éditable */}
      <input
        type="text"
        value={s.current.nom}
        placeholder="Nommer le scénario…"
        onInput={(e) => s.setNom(e.currentTarget.value)}
        class="h-[28px] w-[200px] rounded-full border border-brand/30 bg-card px-3 text-[12px] font-semibold text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
      />

      {/* Règle d'allocation */}
      <select
        value={s.current.strategy ?? 'date_besoin'}
        onChange={(e) => s.setStrategy(e.currentTarget.value as any)}
        class="h-[28px] rounded-full border border-brand/30 bg-card px-3 text-[11px] font-semibold text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
      >
        <option value="date_besoin">Date de besoin (défaut)</option>
        <option value="date_passation">Date de passation (anticipation)</option>
        <option value="priorite_previsions">Priorité clients à prévisions</option>
      </select>

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
          <span
            class={cx('material-symbols-outlined text-[15px]', s.diffLoading() && 'animate-spin')}
          >
            {s.diffLoading() ? 'progress_activity' : 'insights'}
          </span>
          Impacts
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={s.saving()}
          onClick={() => s.save()}
          class="gap-1.5"
        >
          <span class="material-symbols-outlined text-[15px]">save</span>
          {s.saving() ? 'Enregistrement…' : 'Enregistrer'}
        </Button>

        <Button
          size="sm"
          disabled={s.mutationCount() === 0 || props.applying()}
          onClick={props.onApply}
          class="gap-1.5"
        >
          <span
            class={cx('material-symbols-outlined text-[15px]', props.applying() && 'animate-spin')}
          >
            {props.applying() ? 'progress_activity' : 'play_arrow'}
          </span>
          {props.applying() ? 'Application…' : 'Appliquer'}
        </Button>

        <Button size="sm" variant="ghost" onClick={requestDiscard} class="gap-1.5">
          <span class="material-symbols-outlined text-[15px]">delete</span>
          Jeter
        </Button>

        <AlertDialog open={confirmDiscardOpen()} onOpenChange={setConfirmDiscardOpen}>
          <AlertDialogPortal>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Jeter le scénario ?</AlertDialogTitle>
                <AlertDialogDescription>
                  {s.mutationCount()} mutation{s.mutationCount() > 1 ? 's' : ''} non appliquée
                  {s.mutationCount() > 1 ? 's' : ''} ser{s.mutationCount() > 1 ? 'ont' : 'a'} perdue
                  {s.mutationCount() > 1 ? 's' : ''} et le board reviendra à l'état réel. Cette
                  action est irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <Button size="sm" variant="outline" onClick={() => setConfirmDiscardOpen(false)}>
                  Annuler
                </Button>
                <Button size="sm" variant="destructive" onClick={confirmDiscard} class="gap-1.5">
                  <span class="material-symbols-outlined text-[15px]">delete</span>
                  Jeter le scénario
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>

        {/* #58 — commande virtuelle (mutation inject_demand, what-if) */}
        <div class="relative">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFormOpen((o) => !o)}
            class="gap-1.5"
          >
            <span class="material-symbols-outlined text-[15px]">add_circle</span>
            Commande virtuelle
          </Button>
          <Show when={formOpen()}>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              class="fixed inset-0 z-40 cursor-default"
              onClick={() => setFormOpen(false)}
            />
            <form
              onSubmit={submitInject}
              class="absolute right-0 top-full z-50 mt-2 w-[280px] space-y-2 rounded-lg border border-brand/40 bg-card p-3 shadow-lg"
            >
              <p class="font-fraunces text-[12px] font-bold text-brand">+ Commande virtuelle</p>
              <input
                list="scenario-article-options"
                required
                value={article()}
                onInput={(e) => setArticle(e.currentTarget.value)}
                placeholder="Article"
                class="h-[28px] w-full rounded-md border border-rule bg-background px-2 text-[12px] focus:border-brand focus:outline-none"
              />
              <datalist id="scenario-article-options">
                <For each={props.articleOptions}>{(a) => <option value={a} />}</For>
              </datalist>
              <div class="flex gap-2">
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity()}
                  onInput={(e) => setQuantity(e.currentTarget.value)}
                  placeholder="Qté"
                  class="h-[28px] w-[80px] rounded-md border border-rule bg-background px-2 text-[12px] focus:border-brand focus:outline-none"
                />
                <input
                  type="date"
                  value={date()}
                  onInput={(e) => setDate(e.currentTarget.value)}
                  title="Vide = date au plus tôt (calculée par le moteur CTP)"
                  class="h-[28px] flex-1 rounded-md border border-rule bg-background px-2 text-[12px] focus:border-brand focus:outline-none"
                />
              </div>
              {/* CTP §6.1 — date vide : le moteur propose ; date saisie trop tôt : avertit. */}
              <Show when={!date() && (earliestLoading() || earliest())}>
                <p class="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span class="material-symbols-outlined text-[13px] text-brand">bolt</span>
                  <Show when={!earliestLoading()} fallback="Calcul de la date au plus tôt…">
                    <Show
                      when={earliest()?.date}
                      fallback={<span class="text-error">Article {earliest()?.limiting}</span>}
                    >
                      Au plus tôt le{' '}
                      <strong>{new Date(earliest()!.date).toLocaleDateString('fr-FR')}</strong>
                      <Show when={earliest()?.limiting}> — {earliest()!.limiting}</Show>
                    </Show>
                  </Show>
                </p>
              </Show>
              <Show when={date() && earliest()?.date && date() < earliest()!.date}>
                <p class="flex items-center gap-1 text-[11px] font-semibold text-warning">
                  <span class="material-symbols-outlined text-[13px]">warning</span>
                  Infaisable à cette date — sinon possible au plus tôt le{' '}
                  {new Date(earliest()!.date).toLocaleDateString('fr-FR')}
                </p>
              </Show>
              <input
                value={client()}
                onInput={(e) => setClient(e.currentTarget.value)}
                placeholder="Client (libre, optionnel)"
                class="h-[28px] w-full rounded-md border border-rule bg-background px-2 text-[12px] focus:border-brand focus:outline-none"
              />
              <Button type="submit" size="sm" class="w-full gap-1.5">
                <span class="material-symbols-outlined text-[15px]">add</span>
                {date() ? 'Ajouter au scénario' : 'Ajouter au plus tôt'}
              </Button>
            </form>
          </Show>
        </div>

        {/* Liste des scénarios enregistrés */}
        <div class="relative">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setListOpen((o) => !o)}
            class="gap-1.5"
          >
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
                fallback={
                  <div class="px-3 py-4 text-center text-[12px] italic text-muted-foreground">
                    Aucun scénario enregistré.
                  </div>
                }
              >
                <For each={s.list}>
                  {(sc) => (
                    <div class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={selectedIds().includes(sc.id)}
                        onChange={() => toggleSelect(sc.id)}
                        class="h-3.5 w-3.5 rounded border-brand/30 text-brand focus:ring-brand"
                      />
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
                            <span class="font-mono text-[9px] font-bold uppercase text-emerald-600">
                              appliqué
                            </span>
                          </Show>
                        </div>
                        <div class="font-mono text-[10px] text-muted-foreground">
                          {sc.mutations.length} mut. · {sc.strategy === 'date_passation' ? 'passation' : sc.strategy === 'priorite_previsions' ? 'prévisions' : 'besoin'} · {sc.auteur ?? '—'}
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
              <Show when={selectedIds().length >= 2}>
                <div class="border-t border-brand/20 p-2">
                  <Button
                    size="sm"
                    class="w-full gap-1.5"
                    onClick={() => {
                      router.visit(`/programme/scenarios/comparer?ids=${selectedIds().join(',')}`)
                    }}
                  >
                    <span class="material-symbols-outlined text-[15px]">compare_arrows</span>
                    Comparer ({selectedIds().length})
                  </Button>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
