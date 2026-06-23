import { For, Show, createMemo, createSignal, type Component } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { cx } from '@/libs/cva'
import { Masthead } from '@/components/masthead'
import { route } from '@/lib/routes'

/**
 * Configuration du calendrier usine (issue #37) — design « Registre » (V2).
 *
 * Deux blocs : jours fériés FR (activer/désactiver) + fermetures par ligne de
 * production (CRUD). La capacité de /charge en découle directement. Un sélecteur
 * de vue prépare l'évolution future « Frise » (timeline par poste, design V3).
 */

interface Holiday {
  date: string
  name: string
  active: boolean
}
interface Closure {
  id: number
  scope: 'global' | 'wst' | 'stoloc'
  code: string
  from: string
  to: string
  factor: number
  motif: string
}
interface Poste {
  code: string
  label: string
  atelier: string
}
interface Atelier {
  code: string
  label: string
}
interface Props {
  year: number
  holidays: Holiday[]
  closures: Closure[]
  postes: Poste[]
  ateliers: Atelier[]
}

type View = 'registre' | 'frise'

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
/** ISO `YYYY-MM-DD` → « 14 juil. ». */
const frShort = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MOIS[m - 1]}`
}
/** ISO → « 14/07/26 ». */
const frNum = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const factorLabel = (f: number): string => (f <= 0 ? '0 %' : f >= 1 ? '100 %' : `${Math.round(f * 100)} %`)

const Calendrier: Component<Props> = (props) => {
  const [view, setView] = createSignal<View>('registre')
  const [holidays, setHolidays] = createStore<Holiday[]>(props.holidays)
  const [closures, setClosures] = createStore<Closure[]>(props.closures)
  const [adding, setAdding] = createSignal(false)

  const activeCount = createMemo(() => holidays.filter((h) => h.active).length)

  // ── Fériés ───────────────────────────────────────────────────────────────
  const toggleHoliday = (date: string) => {
    const i = holidays.findIndex((h) => h.date === date)
    if (i < 0) return
    const next = !holidays[i].active
    setHolidays(i, 'active', next) // optimiste
    fetch(route('calendar_config.toggle_holiday'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, active: next }),
    }).catch(() => setHolidays(i, 'active', !next))
  }

  // ── Fermetures ─────────────────────────────────────────────────────────────
  const removeClosure = (id: number) => {
    const snapshot = closures.find((c) => c.id === id)
    setClosures((cs) => cs.filter((c) => c.id !== id))
    fetch(route('calendar_config.delete_closure', { id }), { method: 'DELETE' }).catch(() => {
      if (snapshot) setClosures(produce((cs) => cs.push(snapshot)))
    })
  }

  const motifLabel = (m: string): string =>
    m === 'maintenance' ? 'Maintenance' : m === 'conges' ? 'Congés' : m || 'Autre'

  const scopeChip = (c: Closure): { label: string; dot: string } => {
    if (c.scope === 'global') return { label: 'Toute l\'usine', dot: 'var(--color-planifie)' }
    if (c.scope === 'stoloc') return { label: `Atelier ${c.code}`, dot: 'var(--color-planifie)' }
    return { label: c.code, dot: 'var(--color-ferme)' }
  }

  return (
    <div class="theme-papier flex min-h-screen flex-col bg-background text-foreground">
      <Masthead
        subtitle="Calendrier usine"
        active="config"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold italic text-terra">Année {props.year}</div>
            <div>
              <b class="font-bold text-foreground">{activeCount()}</b> fériés actifs ·{' '}
              <b class="font-bold text-foreground">{closures.length}</b> fermetures
            </div>
          </>
        }
        actions={
          <div class="inline-flex items-center gap-0.5 rounded-md border border-rule bg-card p-0.5">
            <For each={(['registre', 'frise'] as const)}>
              {(v) => (
                <button
                  type="button"
                  onClick={() => setView(v)}
                  class={cx(
                    'rounded-[5px] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                    view() === v ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v === 'registre' ? 'Registre' : 'Frise'}
                </button>
              )}
            </For>
          </div>
        }
      />

      <div class="mx-auto w-full max-w-[1280px] px-7 py-6">
        <h1 class="mb-1 font-fraunces text-[24px] font-extrabold tracking-tight">Calendrier usine {props.year}</h1>
        <p class="mb-5 text-[13px] text-muted-foreground">
          Jours ouvrés = calendrier français (fériés) moins les fermetures saisies par ligne. La capacité de{' '}
          <b class="text-foreground">/charge</b> en découle directement.
        </p>

        <Show
          when={view() === 'registre'}
          fallback={
            <div class="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-rule bg-card px-6 py-20 text-center">
              <span class="material-symbols-outlined text-[34px] text-terra/60">view_timeline</span>
              <div class="font-fraunces text-[16px] font-bold">Vue Frise — bientôt</div>
              <p class="max-w-md text-[12.5px] text-muted-foreground">
                Timeline par poste sur l'année (fériés + fermetures déplaçables). Conçue, pas encore câblée — la
                vue Registre reste la source d'édition.
              </p>
            </div>
          }
        >
          <div class="grid grid-cols-[380px_1fr] items-start gap-6">
            {/* Jours fériés */}
            <section class="overflow-hidden rounded-2xl border border-rule bg-card">
              <header class="flex items-center gap-2 border-b border-rule-soft px-4 py-3.5">
                <span class="material-symbols-outlined text-[18px] text-terra">event</span>
                <span class="font-fraunces text-[15px] font-bold">Jours fériés France</span>
                <span class="ml-auto font-mono text-[11px] font-bold text-muted-foreground">{activeCount()} actifs</span>
              </header>
              <For each={holidays}>
                {(h) => (
                  <div class="flex items-center gap-3 border-b border-rule-soft px-4 py-2.5 last:border-0">
                    <span class="w-[58px] flex-none font-mono text-[12px] font-bold text-terra">{frShort(h.date)}</span>
                    <span class="text-[13px] font-medium">
                      {h.name}
                      <span class="block text-[10.5px] font-normal text-muted-foreground">
                        {h.active ? 'chômé · capacité 0 h' : 'travaillé (désactivé)'}
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={h.active}
                      onClick={() => toggleHoliday(h.date)}
                      class={cx(
                        'relative ml-auto h-[22px] w-[38px] flex-none rounded-full transition-colors',
                        h.active ? 'bg-ferme' : 'bg-rule',
                      )}
                    >
                      <span
                        class="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
                        classList={{ 'left-[18px]': h.active, 'left-[2px]': !h.active }}
                      />
                    </button>
                  </div>
                )}
              </For>
            </section>

            {/* Fermetures par ligne */}
            <section class="overflow-hidden rounded-2xl border border-rule bg-card">
              <header class="flex items-center gap-2 border-b border-rule-soft px-4 py-3.5">
                <span class="material-symbols-outlined text-[18px] text-suggere">engineering</span>
                <span class="font-fraunces text-[15px] font-bold">Fermetures par ligne de production</span>
                <span class="ml-auto font-mono text-[11px] font-bold text-muted-foreground">{closures.length} actives</span>
              </header>

              <Show
                when={closures.length > 0}
                fallback={
                  <div class="px-4 py-8 text-center font-fraunces text-[13px] italic text-muted-foreground">
                    Aucune fermeture saisie.
                  </div>
                }
              >
                <table class="w-full border-collapse">
                  <thead>
                    <tr>
                      <For each={['Ligne', 'Du', 'Au', 'Motif', 'Capacité', '']}>
                        {(h) => (
                          <th class="border-b border-rule-soft px-3.5 py-2.5 text-left font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {h}
                          </th>
                        )}
                      </For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={closures}>
                      {(c) => {
                        const chip = scopeChip(c)
                        return (
                          <tr class="hover:bg-rule/10">
                            <td class="border-b border-rule-soft px-3.5 py-2.5">
                              <span class="inline-flex items-center gap-1.5 rounded-full border border-rule bg-card px-2.5 py-0.5 font-mono text-[11px] font-bold">
                                <span class="size-[7px] rounded-[2px]" style={{ background: chip.dot }} />
                                {chip.label}
                              </span>
                            </td>
                            <td class="border-b border-rule-soft px-3.5 py-2.5 font-mono text-[12.5px]">{frNum(c.from)}</td>
                            <td class="border-b border-rule-soft px-3.5 py-2.5 font-mono text-[12.5px]">{frNum(c.to)}</td>
                            <td class="border-b border-rule-soft px-3.5 py-2.5">
                              <span
                                class="inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                  background:
                                    c.motif === 'maintenance'
                                      ? 'color-mix(in srgb, var(--color-suggere) 18%, transparent)'
                                      : 'color-mix(in srgb, var(--color-planifie) 16%, transparent)',
                                  color: c.motif === 'maintenance' ? '#5a4410' : 'var(--color-planifie)',
                                }}
                              >
                                {motifLabel(c.motif)}
                              </span>
                            </td>
                            <td
                              class="border-b border-rule-soft px-3.5 py-2.5 font-mono text-[12.5px] font-bold"
                              style={{ color: c.factor <= 0 ? 'var(--color-danger)' : 'var(--color-suggere)' }}
                            >
                              {factorLabel(c.factor)}
                            </td>
                            <td class="border-b border-rule-soft px-3.5 py-2.5">
                              <button
                                type="button"
                                onClick={() => removeClosure(c.id)}
                                class="text-muted-foreground transition-colors hover:text-danger"
                                title="Supprimer"
                              >
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </td>
                          </tr>
                        )
                      }}
                    </For>
                  </tbody>
                </table>
              </Show>

              <Show
                when={adding()}
                fallback={
                  <div class="flex items-center justify-between px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-terra px-3 py-2 font-sans text-[12.5px] font-bold text-terra"
                    >
                      <span class="material-symbols-outlined text-[16px]">add</span>Nouvelle fermeture
                    </button>
                    <span class="font-fraunces text-[11.5px] italic text-muted-foreground">
                      Portée : poste (WST) ou atelier (STOLOC). 0 % = fermé · 50 % = demi-journée.
                    </span>
                  </div>
                }
              >
                <ClosureForm
                  postes={props.postes}
                  ateliers={props.ateliers}
                  onCancel={() => setAdding(false)}
                  onCreated={(c) => {
                    setClosures(produce((cs) => cs.push(c)))
                    setAdding(false)
                  }}
                />
              </Show>
            </section>
          </div>
        </Show>
      </div>
    </div>
  )
}

/* ── Formulaire d'ajout de fermeture ─────────────────────────────────────── */

const ClosureForm: Component<{
  postes: Poste[]
  ateliers: Atelier[]
  onCancel: () => void
  onCreated: (c: Closure) => void
}> = (props) => {
  const [scope, setScope] = createSignal<'global' | 'wst' | 'stoloc'>('wst')
  const [code, setCode] = createSignal(props.postes[0]?.code ?? '')
  const [from, setFrom] = createSignal('')
  const [to, setTo] = createSignal('')
  const [motif, setMotif] = createSignal('maintenance')
  const [factor, setFactor] = createSignal(0)
  const [busy, setBusy] = createSignal(false)

  const submit = async () => {
    if (!from()) return
    setBusy(true)
    const body = {
      scope: scope(),
      code: scope() === 'global' ? '' : code(),
      from: from(),
      to: to() || from(),
      motif: motif(),
      factor: factor(),
    }
    try {
      const res = await fetch(route('calendar_config.create_closure'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      props.onCreated({ id: json.id, ...body })
    } finally {
      setBusy(false)
    }
  }

  const field = 'rounded-lg border border-rule bg-card px-2.5 py-1.5 text-[12.5px]'
  return (
    <div class="flex flex-wrap items-end gap-2.5 border-t border-rule-soft bg-secondary px-4 py-3.5">
      <label class="flex flex-col gap-1">
        <span class="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Portée</span>
        <select class={field} value={scope()} onChange={(e) => setScope(e.currentTarget.value as any)}>
          <option value="wst">Poste</option>
          <option value="stoloc">Atelier</option>
          <option value="global">Toute l'usine</option>
        </select>
      </label>
      <Show when={scope() !== 'global'}>
        <label class="flex flex-col gap-1">
          <span class="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            {scope() === 'wst' ? 'Poste' : 'Atelier'}
          </span>
          <select class={field} value={code()} onChange={(e) => setCode(e.currentTarget.value)}>
            <Show
              when={scope() === 'wst'}
              fallback={<For each={props.ateliers}>{(a) => <option value={a.code}>{a.label}</option>}</For>}
            >
              <For each={props.postes}>{(p) => <option value={p.code}>{p.code}</option>}</For>
            </Show>
          </select>
        </label>
      </Show>
      <label class="flex flex-col gap-1">
        <span class="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Du</span>
        <input type="date" class={field} value={from()} onInput={(e) => setFrom(e.currentTarget.value)} />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Au</span>
        <input type="date" class={field} value={to()} onInput={(e) => setTo(e.currentTarget.value)} />
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Motif</span>
        <select class={field} value={motif()} onChange={(e) => setMotif(e.currentTarget.value)}>
          <option value="maintenance">Maintenance</option>
          <option value="conges">Congés</option>
          <option value="autre">Autre</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Capacité</span>
        <select class={field} value={String(factor())} onChange={(e) => setFactor(Number(e.currentTarget.value))}>
          <option value="0">Fermé (0 %)</option>
          <option value="0.5">Demi-journée (50 %)</option>
        </select>
      </label>
      <div class="ml-auto flex gap-2">
        <button type="button" onClick={props.onCancel} class="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-muted-foreground">
          Annuler
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy() || !from()}
          class="rounded-lg bg-terra px-4 py-2 text-[12.5px] font-bold text-[#fbf8ef] disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
    </div>
  )
}

export default Calendrier
