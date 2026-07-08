import { For, Show, createSignal, type Accessor, type Component } from 'solid-js'
import { DataTable, type SortingState } from '@/components/ui/data-table'
import type { ShortageDisplayRow } from '@/lib/shortages/types'
import { cx } from '@/libs/cva'

/**
 * Vues du suivi des ruptures (design system « Papier », harmonisé avec /suivi).
 *
 * - `ShortageRegistre` : table éditoriale dense (R1) — une ligne par couple
 *   composant × OF bloqué, colonnes triables via le DataTable maison.
 * - `ShortageComposants` : agrégation par composant (R2) — « quel composant fait le
 *   plus de dégâts ? » (nb OFs bloqués, qté totale, commande la plus urgente).
 * - `ShortageTimeline` : frise temporelle (R3) — réception couvrante ↔ date
 *   d'expédition, pour lire d'un coup le retard d'arrivée (gap hachuré) ou la marge.
 *
 * Les lignes arrivent déjà filtrées du parent (scheduler/shortages) ; le tri (registre)
 * est géré localement par le DataTable.
 */

const TH =
  'px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft'
const TH_R = TH.replace('text-left', 'text-right')
const TD = 'px-4 py-[13px] align-middle border-r border-rule-soft'

/** True si la ligne traduit un risque grave (sans couverture, ou retard client réel).
 *  Pilote le fond de ligne rouge + la bordure gauche — l'unique signal « alerte forte ». */
const isLate = (r: ShortageDisplayRow) => r.verdictKey === 'retard' || r.verdictKey === 'sans_couverture'
/** True si la ligne est une tension logistique (réception entre besoin et expé).
 *  Sert uniquement au marqueur + gap de la frise (R3) — le Registre porte le signal
 *  par le badge verdict seul, sans teinte de ligne. */
const isAtRisk = (r: ShortageDisplayRow) => r.verdictKey === 'a_risque'

// ───────────────────────────────────────────────────────────────────────────
// R1 · Registre
// ───────────────────────────────────────────────────────────────────────────

export const ShortageRegistre: Component<{
  rows: Accessor<ShortageDisplayRow[]>
  onSelectOf: (numOf: string) => void
  emptyState: import('solid-js').JSX.Element
}> = (props) => {
  // Tri par défaut : composant alphabétique. L'ordre par urgence (expé asc) vient déjà
  // du serveur ; l'utilisateur peut retrier en cliquant les en-têtes triables.
  const [sorting, setSorting] = createSignal<SortingState[]>([{ id: 'component', desc: false }])

  const columns = [
    {
      accessorKey: 'component',
      header: () => 'Composant',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <>
            <div class="font-mono text-[14px] font-bold tracking-tight text-foreground">{row.component}</div>
            <div class="mt-0.5 truncate max-w-[18rem] font-sans text-[11px] leading-snug text-muted-foreground">
              {row.componentDesc}
            </div>
          </>
        )
      },
      meta: { thClass: TH, tdClass: TD },
    },
    {
      accessorKey: 'qteManquante',
      header: () => 'Qté manq.',
      // Ne crie pas « alerte » par défaut : la gravité est portée par le VERDICT, pas par
      // l'ampleur (2 pcs sans couverture > 1000 pcs couvertes). Taille réduite, neutre ;
      // rouge uniquement sur les lignes en alerte.
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <span class={cx('font-fraunces text-[14px] font-bold tabular-nums leading-none', isLate(row) ? 'text-destructive' : 'text-foreground')}>
            {row.qteManquante}
            <span class="ml-0.5 font-mono text-[9px] font-medium text-muted-foreground/70">u</span>
          </span>
        )
      },
      meta: { thClass: `w-[80px] ${TH_R}`, tdClass: `w-[80px] whitespace-nowrap text-right ${TD}` },
    },
    {
      accessorKey: 'numOf',
      header: () => 'OF bloqué',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <>
            <button
              type="button"
              onClick={() => props.onSelectOf(row.numOf)}
              class="cursor-pointer font-mono text-[12px] font-semibold text-terra hover:underline"
            >
              {row.numOf}
            </button>
            <div class="mt-0.5 truncate max-w-[11rem] font-mono text-[10.5px] text-muted-foreground">
              <span class="font-semibold">{row.articleParent}</span>
              <Show when={row.articleParentDesc}>
                <span class="font-sans font-normal"> · {row.articleParentDesc}</span>
              </Show>
            </div>
          </>
        )
      },
      meta: { thClass: `w-[170px] ${TH}`, tdClass: `w-[170px] ${TD}` },
    },
    {
      accessorKey: 'numCommande',
      header: () => 'Commande',
      // N° + expé (relative) sur la 1re ligne ; client en sous-titre. Les +N commandes
      // restent en chip discret — l'essentiel est « pour qui, quand ».
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <Show when={row.hasCommande} fallback={<span class="font-sans text-[11px] italic text-muted-foreground/50">— orphelin</span>}>
            <div class="flex items-baseline gap-1.5">
              <span class="font-mono text-[12px] font-semibold text-secondary-foreground">{row.numCommande}</span>
              <Show when={row.dateExpedition}>
                <span class={cx('font-mono text-[11px] font-bold', isLate(row) ? 'text-destructive' : 'text-muted-foreground')} title={`Expé : ${row.dateExpeditionIso ?? ''}`}>
                  {row.dateExpedition}
                </span>
              </Show>
              <Show when={row.autresCommandes.length > 0}>
                <span class="rounded bg-terra-soft px-1 font-mono text-[9px] font-bold text-terra" title={`Aussi : ${row.autresCommandes.join(', ')}`}>
                  +{row.autresCommandes.length}
                </span>
              </Show>
            </div>
            <div class="mt-0.5 truncate max-w-[11rem] font-sans text-[11px] leading-snug text-muted-foreground">{row.client}</div>
          </Show>
        )
      },
      meta: { thClass: `w-[180px] ${TH}`, tdClass: `w-[180px] ${TD}` },
    },
    {
      id: 'reception',
      enableSorting: false,
      header: () => 'Réception attendue',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        const rec = row.reception
        return (
          <Show
            when={rec}
            fallback={
              <Show
                when={row.verdictKey === 'sous_ensemble'}
                fallback={
                  // Le verdict « Sans couverture » porte déjà l'alerte — la cellule reste
                  // neutre, pas la peine de répéter « aucune réception » en rouge.
                  <span class="text-muted-foreground/50">—</span>
                }
              >
                <Show
                  when={row.sousEnsembleOfs.length > 0}
                  fallback={
                    <span class="text-muted-foreground/50">—</span>
                  }
                >
                  <div class="flex flex-wrap items-center gap-1">
                    <For each={row.sousEnsembleOfs.slice(0, 3)}>
                      {(numOf) => (
                        <button
                          type="button"
                          onClick={() => props.onSelectOf(numOf)}
                          class="cursor-pointer rounded border border-planifie/30 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-planifie transition-colors hover:border-terra hover:text-terra"
                        >
                          {numOf}
                        </button>
                      )}
                    </For>
                    <Show when={row.sousEnsembleOfs.length > 3}>
                      <span class="font-mono text-[10px] text-muted-foreground">+{row.sousEnsembleOfs.length - 3}</span>
                    </Show>
                  </div>
                </Show>
              </Show>
            }
          >
            {(r) => (
              <>
                <div class="font-mono text-[11px] font-semibold text-muted-foreground">{r().id}</div>
                <div class="mt-0.5 truncate max-w-[14rem] font-sans text-[11px] leading-snug text-muted-foreground">
                  {r().supplier} · {r().qty}u · {r().dateArrivee}
                </div>
              </>
            )}
          </Show>
        )
      },
      meta: { thClass: TH, tdClass: TD },
    },
    {
      id: 'verdict',
      enableSorting: false,
      header: () => 'Verdict',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <span class={cx('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', row.verdictCls)}>
            {row.verdictLabel}
          </span>
        )
      },
      meta: { thClass: `w-[150px] ${TH.replace('border-r border-rule-soft', '')}`, tdClass: `w-[150px] px-4 py-[13px] align-middle` },
    },
  ]

  const indexColumn = {
    headerLabel: 'N°',
    thClass: `w-[38px] ${TH}`,
    tdClass: (row: ShortageDisplayRow) =>
      cx(
        'px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80 border-r border-rule-soft',
        isLate(row) && '[box-shadow:inset_3px_0_var(--color-destructive)]',
      ),
  }

  return (
    <DataTable
      columns={columns}
      rows={props.rows}
      sorting={sorting}
      onSortingChange={setSorting}
      indexColumn={indexColumn}
      tableClass="min-w-[880px] text-xs"
      scrollContainerClass="h-full border-0 rounded-none shadow-none"
      theadRowClass="sticky top-0 z-10 bg-secondary"
      getRowClass={(row) =>
        cx(
          'border-t border-rule-soft transition-colors',
          isLate(row)
            ? 'bg-destructive/10 hover:bg-destructive/[0.18]'
            : 'hover:bg-foreground/[0.04]',
        )
      }
      emptyState={props.emptyState}
    />
  )
}

// ───────────────────────────────────────────────────────────────────────────
// R2 · Par composant (agrégation « quel composant fait le plus de dégâts ? »)
// ───────────────────────────────────────────────────────────────────────────

interface ComponentGroup {
  component: string
  componentDesc: string
  totalManquant: number
  /** Lignes sources (une par OF bloqué), déjà triées par urgence. */
  lines: ShortageDisplayRow[]
  nbSansCouverture: number
  /** Pire verdict du groupe (sans_couverture > retard > couvert). */
  worstVerdict: ShortageDisplayRow['verdictKey']
  /** Ligne la plus urgente AVEC commande (première du tri parent) — null si toutes orphelines. */
  urgent: ShortageDisplayRow | null
}

const VERDICT_RANK: Record<ShortageDisplayRow['verdictKey'], number> = {
  sans_couverture: 4,
  sous_ensemble: 3,
  retard: 2,
  a_risque: 1,
  couvert: 0,
}

/** Badge couverture de la vue « Par composant » (pire verdict du groupe). Teintes du
 *  design system — miroir du VERDICT_PRESET serveur, sans les icônes (libellé seul). */
const VERDICT_BADGE: Record<ShortageDisplayRow['verdictKey'], { cls: string; label: string }> = {
  couvert: { cls: 'bg-ferme/15 text-ferme', label: 'Couvert' },
  a_risque: { cls: 'bg-suggere/15 text-suggere', label: 'À risque' },
  retard: { cls: 'bg-destructive/10 text-destructive', label: 'Retard' },
  sous_ensemble: { cls: 'bg-planifie/15 text-planifie', label: 'S/E à lancer' },
  sans_couverture: { cls: 'bg-destructive/10 text-destructive', label: 'Sans couv.' },
}

/** Agrège les lignes par composant. `rows` arrive trié par urgence (expé asc) du parent. */
const groupByComponent = (rows: ShortageDisplayRow[]): ComponentGroup[] => {
  const map = new Map<string, ComponentGroup>()
  for (const r of rows) {
    let g = map.get(r.component)
    if (!g) {
      g = {
        component: r.component,
        componentDesc: r.componentDesc,
        totalManquant: 0,
        lines: [],
        nbSansCouverture: 0,
        worstVerdict: 'couvert',
        urgent: null,
      }
      map.set(r.component, g)
    }
    g.lines.push(r)
    g.totalManquant += r.qteManquanteNum
    if (r.verdictKey === 'sans_couverture') g.nbSansCouverture++
    if (VERDICT_RANK[r.verdictKey] > VERDICT_RANK[g.worstVerdict]) g.worstVerdict = r.verdictKey
    if (!g.urgent && r.hasCommande) g.urgent = r
  }
  // « Dégâts » : nb d'OF bloqués desc, puis qté totale manquante desc.
  return [...map.values()].sort(
    (a, b) => b.lines.length - a.lines.length || b.totalManquant - a.totalManquant,
  )
}

export const ShortageComposants: Component<{
  rows: Accessor<ShortageDisplayRow[]>
  onSelectOf: (numOf: string) => void
  emptyState: import('solid-js').JSX.Element
}> = (props) => {
  const groups = () => groupByComponent(props.rows())
  const fmtTotal = (n: number) => {
    const r = Math.round(n * 100) / 100
    return Number.isInteger(r) ? String(r) : r.toLocaleString('fr-FR')
  }

  return (
    <div class="h-full overflow-auto bg-card">
      <Show when={groups().length > 0} fallback={props.emptyState}>
        <table class="min-w-[1080px] w-full text-xs">
          <thead>
            <tr class="sticky top-0 z-10 bg-secondary">
              <th class={`w-[38px] ${TH}`}>N°</th>
              <th class={TH}>Composant · Désignation</th>
              <th class={`w-[110px] ${TH_R}`}>Qté manq. totale</th>
              <th class={`w-[90px] ${TH_R}`}>OFs bloqués</th>
              <th class={TH}>OFs</th>
              <th class={`w-[210px] ${TH}`}>Commande la plus urgente</th>
              <th class={`w-[150px] ${TH.replace('border-r border-rule-soft', '')}`}>Couverture</th>
            </tr>
          </thead>
          <tbody>
            <For each={groups()}>
              {(g, i) => {
                const late = g.worstVerdict === 'retard' || g.worstVerdict === 'sans_couverture'
                return (
                  <tr
                    class={cx(
                      'border-t border-rule-soft transition-colors',
                      late
                        ? 'bg-destructive/10 hover:bg-destructive/[0.18]'
                        : 'hover:bg-foreground/[0.04]',
                    )}
                  >
                    <td
                      class={cx(
                        'px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80 border-r border-rule-soft',
                        late && '[box-shadow:inset_3px_0_var(--color-destructive)]',
                      )}
                    >
                      {i() + 1}
                    </td>
                    <td class={TD}>
                      <div class="font-mono text-[14px] font-bold tracking-tight text-foreground">{g.component}</div>
                      <div class="mt-0.5 truncate max-w-[18rem] font-sans text-[11px] leading-snug text-muted-foreground">
                        {g.componentDesc}
                      </div>
                    </td>
                    <td class={`whitespace-nowrap text-right ${TD}`}>
                      <span class={cx('font-fraunces text-[14px] font-bold tabular-nums leading-none', late ? 'text-destructive' : 'text-foreground')}>
                        {fmtTotal(g.totalManquant)}
                        <span class="ml-0.5 font-mono text-[9px] font-medium text-muted-foreground/70">u</span>
                      </span>
                    </td>
                    <td class={`whitespace-nowrap text-right ${TD}`}>
                      <span class="font-fraunces text-[14px] font-bold tabular-nums leading-none text-foreground">{g.lines.length}</span>
                    </td>
                    <td class={TD}>
                      <div class="flex flex-wrap gap-1">
                        <For each={g.lines}>
                          {(l) => (
                            <button
                              type="button"
                              onClick={() => props.onSelectOf(l.numOf)}
                              title={`${l.articleParent} · ${l.articleParentDesc} — manque ${l.qteManquante} u`}
                              class={cx(
                                'cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-bold transition-colors hover:border-terra hover:text-terra',
                                l.verdictKey === 'sans_couverture'
                                  ? 'border-destructive/30 text-destructive'
                                  : 'border-rule text-secondary-foreground',
                              )}
                            >
                              {l.numOf}
                            </button>
                          )}
                        </For>
                      </div>
                    </td>
                    <td class={TD}>
                      <Show
                        when={g.urgent}
                        fallback={<span class="font-sans text-[11px] italic text-muted-foreground/50">— orphelins</span>}
                      >
                        {(u) => (
                          <>
                            <div class="flex items-baseline gap-1.5">
                              <span class="font-mono text-[12px] font-semibold text-secondary-foreground">{u().numCommande}</span>
                              <span class={cx('font-mono text-[11px] font-bold', late ? 'text-destructive' : 'text-muted-foreground')}>
                                {u().dateExpedition}
                              </span>
                            </div>
                            <div class="mt-0.5 truncate max-w-[13rem] font-sans text-[11px] leading-snug text-muted-foreground">
                              {u().client}
                            </div>
                          </>
                        )}
                      </Show>
                    </td>
                    <td class="w-[150px] px-4 py-[13px] align-middle">
                      <Show
                        when={g.nbSansCouverture > 0}
                        fallback={
                          <span class={cx('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', VERDICT_BADGE[g.worstVerdict].cls)}>
                            {VERDICT_BADGE[g.worstVerdict].label}
                          </span>
                        }
                      >
                        <span class="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-destructive">
                          {g.nbSansCouverture}/{g.lines.length} sans couv.
                        </span>
                      </Show>
                    </td>
                  </tr>
                )
              }}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// R3 · Couverture (frise temporelle)
// ───────────────────────────────────────────────────────────────────────────

/** Position en % d'une date ISO dans la fenêtre [start, start+horizon j], clampée 0..100. */
const offsetPct = (iso: string | null, startIso: string, horizon: number): number | null => {
  if (!iso) return null
  const a = Date.parse(`${startIso}T00:00:00Z`)
  const b = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || horizon <= 0) return null
  const days = (b - a) / 86_400_000
  return Math.max(0, Math.min(100, (days / horizon) * 100))
}

export const ShortageTimeline: Component<{
  rows: ShortageDisplayRow[]
  windowStartIso: string
  horizon: number
  onSelectOf: (numOf: string) => void
  emptyState: import('solid-js').JSX.Element
}> = (props) => {
  // Repères de semaine (lundis) sur la fenêtre — uniquement pour la grille de fond.
  const weekTicks = () => {
    const ticks: { pct: number; label: string }[] = []
    const start = new Date(`${props.windowStartIso}T00:00:00Z`)
    for (let d = 0; d <= props.horizon; d++) {
      const day = new Date(start)
      day.setUTCDate(start.getUTCDate() + d)
      if (day.getUTCDay() === 1) {
        // Lundi → numéro de semaine ISO approximatif (affichage seulement).
        const jan1 = new Date(Date.UTC(day.getUTCFullYear(), 0, 1))
        const wk = Math.ceil(((day.getTime() - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7)
        ticks.push({ pct: (d / props.horizon) * 100, label: `S${wk}` })
      }
    }
    return ticks
  }

  // ISO local (pas toISOString : UTC recule d'un jour entre minuit et 1-2h en UTC+1/+2).
  const todayPct = () => {
    const d = new Date()
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return offsetPct(iso, props.windowStartIso, props.horizon)
  }

  return (
    <div class="h-full overflow-auto rounded-none border-0 bg-card">
      <Show when={props.rows.length > 0} fallback={props.emptyState}>
        <div class="min-w-[980px]">
          <For each={props.rows}>
            {(row) => {
              const expPct = () => offsetPct(row.dateExpeditionIso, props.windowStartIso, props.horizon)
              const recPct = () => offsetPct(row.receptionIso, props.windowStartIso, props.horizon)
              const gap = () => {
                const e = expPct()
                const r = recPct()
                if (e === null || r === null) return null
                // bad = retard client (rouge hachuré) ; warn = à risque (ambre uni) ; ok = couvert.
                const state = row.arriveeLate ? 'bad' : isAtRisk(row) ? 'warn' : 'ok'
                return { left: Math.min(e, r), width: Math.abs(r - e), state }
              }
              return (
                <div
                  class={cx(
                    'grid grid-cols-[330px_1fr] border-b border-rule-soft transition-colors',
                    isLate(row)
                      ? 'bg-destructive/10 hover:bg-destructive/[0.18]'
                      : 'hover:bg-foreground/[0.04]',
                  )}
                >
                  {/* Contexte */}
                  <div
                    class={cx(
                      'flex flex-col gap-0.5 border-r border-rule-soft px-4 py-[13px]',
                      isLate(row) && '[box-shadow:inset_3px_0_var(--color-destructive)]',
                    )}
                  >
                    <div class="flex items-baseline gap-2">
                      <span class="font-mono text-[14px] font-bold text-foreground">{row.component}</span>
                      <span class={cx('ml-auto font-mono text-[11px] font-semibold', isLate(row) ? 'text-destructive' : 'text-muted-foreground')}>
                        −{row.qteManquante} u
                      </span>
                    </div>
                    <div class="truncate font-sans text-[11px] text-muted-foreground">{row.componentDesc}</div>
                    <div class="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      <button type="button" onClick={() => props.onSelectOf(row.numOf)} class="cursor-pointer font-semibold text-terra hover:underline">
                        {row.numOf}
                      </button>
                      {' · '}
                      <span class="font-semibold">{row.articleParent}</span>
                      {' · '}
                      {row.hasCommande ? `${row.numCommande} · ${row.client}` : 'orphelin'}
                    </div>
                  </div>

                  {/* Frise */}
                  <div class="relative mx-3.5 my-2.5 h-[46px]">
                    {/* Grille semaines */}
                    <For each={weekTicks()}>
                      {(t) => (
                        <div class="absolute bottom-4 top-0 w-px bg-hair" style={{ left: `${t.pct}%` }}>
                          <span class="absolute -top-0.5 left-1 font-mono text-[8px] font-bold tracking-wide text-muted-foreground/70">{t.label}</span>
                        </div>
                      )}
                    </For>
                    {/* Axe */}
                    <div class="absolute left-0 right-0 top-6 h-0.5 bg-rule-soft" />
                    {/* Aujourd'hui */}
                    <Show when={todayPct() !== null}>
                      <div class="absolute bottom-3.5 top-0 w-0.5 bg-terra/50" style={{ left: `${todayPct()}%` }}>
                        <span class="absolute -top-0.5 left-1 font-mono text-[8px] font-bold text-terra">auj.</span>
                      </div>
                    </Show>
                    {/* Gap réception ↔ expé */}
                    <Show when={gap()}>
                      {(g) => (
                        <div
                          class={cx(
                            'absolute top-[21px] h-2 rounded-full border',
                            g().state === 'bad'
                              ? 'border-destructive/35 [background:repeating-linear-gradient(45deg,var(--color-destructive)/10,var(--color-destructive)/10_5px,transparent_5px,transparent_10px)]'
                              : g().state === 'warn'
                                ? 'border-suggere/40 bg-suggere/15'
                                : 'border-ferme/30 bg-ferme/15',
                          )}
                          style={{ left: `${g().left}%`, width: `${g().width}%` }}
                        />
                      )}
                    </Show>
                    {/* Marqueur expé */}
                    <Show when={expPct() !== null}>
                      <Marker pct={expPct()!} tone="exp" cap={`expé ${row.dateExpedition}`} />
                    </Show>
                    {/* Marqueur réception (ou absence) */}
                    <Show
                      when={row.receptionIso}
                      fallback={
                        row.verdictKey === 'sous_ensemble' ? (
                          <Marker
                            pct={88}
                            tone="se"
                            cap="sous-ensemble"
                            sub={row.sousEnsembleOfs.length > 0 ? `OF fils ${row.sousEnsembleOfs[0]}` : 'OF fils à lancer'}
                            dashed
                          />
                        ) : (
                          <Marker pct={88} tone="none" cap="aucune réception" sub="à commander" dashed />
                        )
                      }
                    >
                      <Marker
                        pct={recPct()!}
                        tone={row.arriveeLate ? 'bad' : isAtRisk(row) ? 'warn' : 'ok'}
                        cap={row.dateArrivee}
                        sub={row.verdictKey === 'retard' ? `retard +${row.joursRetardReception}j` : row.verdictKey === 'a_risque' ? `marge ${row.joursMarge}j` : undefined}
                      />
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>

          {/* Légende */}
          <div class="flex flex-wrap gap-4 border-t border-rule-soft bg-card px-4 py-2.5 font-mono text-[10px] font-semibold text-muted-foreground">
            <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-terra" /> Date d'expédition (cible)</span>
            <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-ferme" /> Réception à temps</span>
            <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-suggere" /> À risque (buffers entamés)</span>
            <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-destructive" /> Retard client</span>
            <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-full border-2 border-dashed border-destructive" /> Aucune réception</span>
            <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-full border-2 border-dashed border-planifie" /> Sous-ensemble (OF fils)</span>
          </div>
        </div>
      </Show>
    </div>
  )
}

/** Marqueur de frise (pastille + libellé + sous-libellé), positionné en %. */
const Marker: Component<{ pct: number; tone: 'exp' | 'ok' | 'bad' | 'warn' | 'none' | 'se'; cap: string; sub?: string; dashed?: boolean }> = (
  p,
) => {
  const pinCls =
    p.tone === 'exp'
      ? 'bg-terra'
      : p.tone === 'ok'
        ? 'bg-ferme'
        : p.tone === 'bad'
          ? 'bg-destructive'
          : p.tone === 'warn'
            ? 'bg-suggere'
            : p.tone === 'se'
              ? 'border-2 border-dashed border-planifie'
              : 'border-2 border-dashed border-destructive'
  const capCls =
    p.tone === 'exp'
      ? 'text-terra'
      : p.tone === 'ok'
        ? 'text-ferme'
        : p.tone === 'warn'
          ? 'text-suggere'
          : p.tone === 'se'
            ? 'text-planifie'
            : 'text-destructive'
  return (
    <div class="absolute top-3.5 flex -translate-x-1/2 flex-col items-center gap-0.5" style={{ left: `${p.pct}%` }}>
      <span class={cx('size-[13px] rounded-full border-2 border-card', pinCls)} />
      <span class={cx('mt-0.5 whitespace-nowrap font-mono text-[9px] font-bold', capCls)}>{p.cap}</span>
      <Show when={p.sub}>
        <span class="whitespace-nowrap font-mono text-[8px] font-medium text-muted-foreground">{p.sub}</span>
      </Show>
    </div>
  )
}
