import { createMemo, createResource, createSignal, For, Show, type Component } from 'solid-js'
import { Link } from '@/lib/inertia-solid'
import { route } from '@/lib/routes'
import { cx } from '@/libs/cva'
import type {
  SuiviPageProps,
  SuiviRowsResponse,
  SuiviStatusKey,
} from '@/lib/suivi/types'
import UserMenu from '@/components/user-menu'

/**
 * Page « Suivi des commandes » (issue #19) — axe allocation / expédition.
 *
 * Shell Inertia rendu instantanément (SuiviController.board) ; les lignes (calcul
 * lourd : assignation des 4 statuts + causes + signal CQ depuis X3) sont chargées
 * en différé par fetch JSON (SuiviController.rows). Même motif que la page
 * ruptures (scheduler/shortages). Registre Papier harmonisé avec shortage-table
 * + Rangée rupture (design_system §07).
 */

const EMPTY: SuiviRowsResponse = {
  total: 0,
  statusCounts: { A_EXPEDIER: 0, ALLOCATION_A_FAIRE: 0, RETARD_PROD: 0, RAS: 0 },
  cqCount: 0,
  rows: [],
  x3Error: null,
  referenceDate: '',
}

/** Couleur du badge par statut (grammar uniforme ui/badge — un seul shape). */
const BADGE_TONE: Record<SuiviStatusKey, string> = {
  exp: 'bg-ferme/15 text-ferme',
  alc: 'bg-suggere/15 text-suggere',
  ret: 'bg-destructive/10 text-destructive',
  ras: 'bg-secondary text-muted-foreground',
}

const Suivi: Component<SuiviPageProps> = (props) => {
  // Calcul lourd différé : fetch client-side, relancé à chaque changement de date
  // ou de bust (bouton refresh → ?refresh=N invalide le cache serveur).
  const [bust, setBust] = createSignal(0)
  const [data] = createResource(
    () => `${props.rowsHref}${bust() ? `&refresh=${bust()}` : ''}`,
    async (url): Promise<SuiviRowsResponse> => {
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as SuiviRowsResponse
    },
  )

  // Filtres + tri côté client.
  const [query, setQuery] = createSignal('')
  const [statusFilter, setStatusFilter] = createSignal<SuiviStatusKey | 'all'>('all')
  const [typeFilter, setTypeFilter] = createSignal<Set<string>>(new Set(['MTS', 'MTO', 'NOR']))

  const toggleType = (t: string) =>
    setTypeFilter((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })

  const visibleRows = createMemo(() => {
    const all = (data() ?? EMPTY).rows
    const q = query().trim().toLowerCase()
    const sf = statusFilter()
    const tf = typeFilter()
    let r = all.filter((row) => (sf === 'all' || row.statusKey === sf) && tf.has(row.type))
    if (q) r = r.filter((row) => row.filter.includes(q))
    // Retards en haut, puis tri chronologique ascendant (plus urgents avant).
    // Lignes sans date → en bas.
    r = [...r].sort((a, b) => {
      const ra = a.statusKey === 'ret' ? 0 : 1
      const rb = b.statusKey === 'ret' ? 0 : 1
      if (ra !== rb) return ra - rb
      const da = a.dateExpIso ?? '9999-12-31'
      const db = b.dateExpIso ?? '9999-12-31'
      return da.localeCompare(db)
    })
    return r
  })

  const counts = () => (data() ?? EMPTY).statusCounts
  const refLabel = () =>
    new Date(props.referenceDate + 'T00:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

  const navCls = (active?: boolean) =>
    `border-b-2 px-3.5 py-2.5 text-[12px] font-semibold transition-colors ${
      active ? 'border-terra text-terra' : 'border-transparent text-secondary-foreground hover:text-terra'
    }`

  const statusChip = (k: SuiviStatusKey | 'all', label: string) => {
    const on = statusFilter() === k
    return (
      <button
        type="button"
        class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
          on ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setStatusFilter(on ? 'all' : k)}
      >
        {label}
      </button>
    )
  }

  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ═══ Masthead ═══ */}
      <header class="flex-none border-b border-rule bg-background">
        <div class="flex items-end justify-between gap-5 px-7 pb-2 pt-3.5">
          <div class="flex items-baseline gap-3.5">
            <div class="font-fraunces text-[28px] font-black leading-[0.9] tracking-tight">
              Factory<span class="font-medium italic text-terra">OS</span>
            </div>
            <div class="pb-1 font-mono text-[10px] font-medium tracking-[0.12em] text-muted-foreground">
              Suivi · Allocation &amp; expédition
            </div>
          </div>
          <div class="text-right font-mono text-[11px] font-medium leading-relaxed text-muted-foreground">
            <div class="font-fraunces text-[12px] font-bold capitalize not-italic text-terra">{refLabel()}</div>
            <div>
              <b class="font-bold text-foreground">{(data() ?? EMPTY).total}</b> lignes ouvertes
              <Show when={(data() ?? EMPTY).referenceDate}> · réf. <b class="font-bold text-foreground">{(data() ?? EMPTY).referenceDate}</b></Show>
            </div>
          </div>
        </div>

        <nav class="flex items-center gap-1 border-t border-rule px-7">
          <a href="#" class={navCls()}>Tableau</a>
          <Link href={route('order_planning.board')} class={navCls()}>Planification</Link>
          <Link href={route('scheduler.expert_board')} class={navCls()}>Ordonnancement</Link>
          <Link href={route('scheduler.shortage_tracker')} class={navCls()}>Ruptures</Link>
          <Link href={route('suivi.board')} class={navCls(true)}>Suivi</Link>
          <a href="#" class={navCls()}>Ressources</a>

          <div class="ml-auto flex items-center gap-2 py-1.5">
            <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25">
              <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
              <input
                class="w-[200px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
                placeholder="Commande, article, client…"
                type="text"
                autocomplete="off"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
            <UserMenu />
          </div>
        </nav>
      </header>

      {/* ═══ Bandeau KPI = status_counts ═══ */}
      <section class="flex-none grid grid-cols-5 border-b border-rule">
        <Kpi label="À expédier" value={counts().A_EXPEDIER} sub="besoin net ≤ 0 · prêtes" dot="var(--color-ferme)" valClass="text-ferme" />
        <Kpi label="Allocation à faire" value={counts().ALLOCATION_A_FAIRE} sub="couvertes par stock virtuel" dot="var(--color-suggere)" valClass="text-suggere" />
        <Kpi label="Retard" value={counts().RETARD_PROD} sub="date expé dépassée" dot="var(--color-destructive)" valClass="text-destructive" />
        <Kpi label="Signal CQ" value={(data() ?? EMPTY).cqCount} sub="stock sous contrôle qualité" dot="var(--color-terra)" valClass="text-terra" />
        <Kpi label="RAS" value={counts().RAS} sub="sous contrôle" dot="var(--color-muted-foreground)" valClass="text-planifie" last />
      </section>

      {/* ═══ Toolbar ═══ */}
      <div class="flex flex-none flex-wrap items-center gap-2.5 border-b border-rule px-7 py-2">
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Statut</span>
          {statusChip('all', 'Tous')}
          {statusChip('ret', 'Retard')}
          {statusChip('alc', 'À allouer')}
          {statusChip('exp', 'À expédier')}
        </div>
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Type</span>
          <For each={['MTS', 'MTO', 'NOR']}>
            {(t) => (
              <button
                type="button"
                class={`rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  typeFilter().has(t) ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => toggleType(t)}
              >
                {t}
              </button>
            )}
          </For>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBust((b) => b + 1)}
            disabled={data.loading}
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-terra disabled:opacity-50"
            title="Recharger les données X3 (cache → re-fetch live)"
          >
            <span class="material-symbols-outlined text-[14px] text-muted-foreground" classList={{ 'animate-spin': data.loading }}>
              refresh
            </span>
            Actualiser
          </button>
          <Link
            href={`${route('suivi.board')}?referenceDate=${encodeURIComponent(new Date().toISOString().slice(0, 10))}`}
            preserveScroll
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-terra"
            title="Recharger à aujourd'hui"
          >
            <span class="material-symbols-outlined text-[14px] text-muted-foreground">calendar_month</span>
            Aujourd'hui
          </Link>
        </div>
      </div>

      {/* ═══ X3 injoignable ═══ */}
      <Show when={(data() ?? EMPTY).x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-destructive">warning</span>
          <span class="font-bold">Erreur chargement suivi :</span>
          <span class="font-mono">{(data() ?? EMPTY).x3Error}</span>
        </div>
      </Show>

      {/* ═══ Table ═══ */}
      <Show
        when={!data.loading}
        fallback={
          <div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
            <span class="text-[13px] font-medium">Calcul du suivi…</span>
          </div>
        }
      >
        <Show
          when={!data.error}
          fallback={
            <div class="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
              <span class="material-symbols-outlined text-[20px]">error</span>
              Échec du calcul du suivi.
            </div>
          }
        >
          <Show
            when={visibleRows().length > 0}
            fallback={
              <div class="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
                <div class="flex flex-col items-center gap-2">
                  <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">
                    {(data() ?? EMPTY).x3Error ? 'cloud_off' : 'inbox'}
                  </span>
                  {(data() ?? EMPTY).x3Error
                    ? 'Données de suivi indisponibles (X3 injoignable).'
                    : 'Aucune ligne de commande à suivre à cette date.'}
                </div>
              </div>
            }
          >
            <div class="flex-1 overflow-hidden p-5">
              <div class="h-full overflow-auto rounded-xl border border-rule bg-card shadow-[0_1px_2px_rgba(31,26,19,.05)]">
                <table class="w-full min-w-[1076px] border-collapse text-left">
                  <thead>
                    <tr class="sticky top-0 z-10 bg-secondary">
                      <th class="w-[38px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft">N°</th>
                      <th class="w-[178px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft">Commande · Client</th>
                      <th class="px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft">Article · Désignation</th>
                      <th class="w-[56px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft">Type</th>
                      <th class="w-[92px] px-4 py-[11px] text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft">Reste</th>
                      <th class="w-[104px] px-4 py-[11px] text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft">Alloué virt.</th>
                      <th class="w-[76px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft">Expé</th>
                      <th class="w-[140px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft">Emplacement</th>
                      <th class="w-[130px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft">Statut</th>
                      <th class="w-[280px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule">Cause du retard</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={visibleRows()}>
                      {(o, i) => (
                        <tr class={cx('border-t border-rule-soft transition-colors hover:bg-terra-soft', o.late && 'bg-destructive/10 hover:bg-destructive/[0.14]')}>
                          <td class={cx('px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80 border-r border-rule-soft', o.late && '[box-shadow:inset_3px_0_var(--color-destructive)]')}>
                            {String(i() + 1).padStart(2, '0')}
                          </td>
                          <td class="px-4 py-[13px] align-middle border-r border-rule-soft">
                            <div class="font-mono text-[13px] font-bold tracking-tight text-foreground">{o.numCommande}</div>
                            <div class="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">{o.client || '—'}</div>
                          </td>
                          <td class="px-4 py-[13px] align-middle border-r border-rule-soft">
                            <div class="font-mono text-[13px] font-semibold text-terra">{o.article}</div>
                            <div class="mt-0.5 font-sans text-[12px] font-medium leading-snug text-secondary-foreground">{o.designation || '—'}</div>
                          </td>
                          <td class="px-4 py-[13px] align-middle border-r border-rule-soft">
                            <span class="rounded bg-terra-soft px-[7px] py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-terra">{o.type}</span>
                          </td>
                          <td class="whitespace-nowrap border-r border-rule-soft px-4 py-[13px] text-right align-middle">
                            <span class="font-fraunces text-[21px] font-black leading-none tracking-tight text-foreground">{o.qteRestante}</span>
                            <span class="ml-0.5 font-mono text-[10px] font-medium text-muted-foreground/80">u</span>
                          </td>
                          <td class={cx('whitespace-nowrap border-r border-rule-soft px-4 py-[13px] align-middle font-mono text-[12.5px] font-semibold', o.late ? 'font-bold text-destructive' : 'text-foreground')}>
                            {o.dateExp || '—'}
                          </td>
                          <td class="border-r border-rule-soft px-4 py-[13px] align-middle">
                            <Show
                              when={o.emplacements.length > 0}
                              fallback={<span class="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">—</span>}
                            >
                              <div class="flex flex-col gap-[3px]">
                                <For each={o.emplacements}>
                                  {(e) => (
                                    <span
                                      class={cx(
                                        'flex w-full items-center justify-between gap-1 rounded border px-1.5 py-px font-mono text-[10.5px] leading-[1.4]',
                                        e.source === 'STOALL'
                                          ? 'border-ferme/30 bg-ferme/15 text-ferme'
                                          : 'border-rule bg-card text-secondary-foreground',
                                        e.alreadyAllocated && 'line-through opacity-60',
                                      )}
                                      title={e.source === 'STOALL' ? 'STOALL — déjà alloué à la commande' : (e.alreadyAllocated ? 'Déjà alloué à une autre commande' : 'STOCK — en stock libre, allocation à faire')}
                                    >
                                      <span class="flex items-center gap-1 whitespace-nowrap">
                                        <span
                                          class={cx(
                                            'material-symbols-outlined text-[11px] leading-none',
                                            e.source === 'STOALL' ? 'text-ferme' : 'text-muted-foreground/70',
                                          )}
                                        >
                                          {e.source === 'STOALL' ? 'check_circle' : 'radio_button_unchecked'}
                                        </span>
                                        <span class="font-semibold">{e.nom}</span>
                                      </span>
                                      <span class="flex items-center gap-1">
                                        <Show when={e.hum}>
                                          <span class="rounded bg-card px-1.5 font-mono text-[10.5px] font-bold text-foreground">{e.hum}</span>
                                        </Show>
                                        <span class="font-bold tabular-nums">
                                          {e.qte > 0 ? Math.round(e.qte) : '·'}
                                        </span>
                                      </span>
                                    </span>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </td>
                          <td class="border-r border-rule-soft px-4 py-[13px] align-middle">
                            <div class="flex flex-col items-start gap-1">
                              <span class={cx('inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', BADGE_TONE[o.statusKey])}>
                                <span class="material-symbols-outlined grid size-[14px] place-items-center overflow-hidden text-[14px] leading-none">{o.statusIcon}</span>
                                {o.statusLabel}
                              </span>
                              <Show when={o.cq}>
                                <span class="inline-flex items-center gap-1 rounded-md border border-transparent bg-terra-soft px-2 py-0.5 text-[11px] font-medium text-terra whitespace-nowrap">
                                  <span class="material-symbols-outlined grid size-[14px] place-items-center text-[14px] leading-none">science</span>CQ
                                </span>
                              </Show>
                            </div>
                          </td>
                          <td class="border-r border-rule-soft px-4 py-[13px] align-middle">
                            <Show
                              when={o.cause}
                              fallback={<span class="font-sans text-[12px] font-medium leading-snug text-muted-foreground/70">—</span>}
                            >
                              <div class="text-[12px] leading-snug text-secondary-foreground">{o.cause!.label}</div>
                              <Show when={o.cause!.comps.length > 0}>
                                <span class="mt-[3px] block font-mono text-[10px] font-bold text-destructive">
                                  {o.cause!.comps.map((c) => `${c.art} −${c.qty}`).join(' · ')}
                                </span>
                              </Show>
                            </Show>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  )
}

/** Tuile KPI (status_counts). */
const Kpi: Component<{
  label: string
  value: number
  sub: string
  dot: string
  valClass: string
  last?: boolean
}> = (p) => (
  <div class={cx('flex flex-col gap-[3px] px-[22px] py-[13px]', !p.last && 'border-r border-rule-soft')}>
    <span class="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
      <span class="size-2 rounded-[2px]" style={{ background: p.dot }} />
      {p.label}
    </span>
    <span class={cx('font-fraunces text-[34px] font-black leading-none tracking-tight', p.valClass)}>{p.value}</span>
    <span class="font-mono text-[11px] font-medium text-muted-foreground">{p.sub}</span>
  </div>
)

export default Suivi
