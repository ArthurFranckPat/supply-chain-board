import { type ReactNode } from 'react'
import type { DayChargeDisplay, ReceptionDisplayRow } from '@/lib/receptions/types'
import { CalendarX, Lightbulb, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { chargeBg, chargeText, chargeTier } from '@r/lib/receptions/charge'

/**
 * Vues des réceptions fournisseurs (port React — markup shadcn / thème Airbnb).
 *
 * - `ReceptionTableau` : **bordereau** — une section par jour (rail de date +
 *   lignes de détail + total comptable du jour). Chaque ligne expose l'équation
 *   de conversion (qté US ÷ conditionnement → palettes) pour rendre le calcul
 *   vérifiable plutôt qu'une assertion. Rendu bespoke : le rail vertical
 *   spanning + les sous-totaux intercalaires sont incompatibles avec la
 *   virtualisation ligne-à-ligne du DataTable maison.
 * - `ReceptionCalendrier` : charge agrégée par jour — histogramme du nombre de
 *   palettes attendues, avec drill-down (clic sur un jour → filtre le tableau).
 *
 * Les lignes arrivent déjà filtrées (recherche + drill-down jour) et triées
 * (date asc) du parent `pages/receptions.tsx`. Contrat `(rows, emptyState)`.
 */

// ───────────────────────────────────────────────────────────────────────────
// V1 · Bordereau (tableau détaillé par jour)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Formatters FR pour le rail de date du bordereau.
 *
 * Entorse isolée et documentée à la convention « lignes déjà pré-formatées
 * côté serveur » (cf. types.ts) : on décompose `row.date` (ISO fiable) en
 * jour de semaine / numéro / mois via `Intl`, car le serveur ne fournit que
 * `dateFmt` (« 22/07/26 ») et `dateRelatif` (« auj. », « +5j »). Le relatif,
 * lui, est repris tel quel.
 */
const railWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' })
const railDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' })
const railMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long' })

/** Capitalise la première lettre (Intl fr renvoie « mercredi »). */
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

function formatRailDate(iso: string): { weekday: string; day: string; month: string } {
  // 'T00:00:00' force l'analyse en tz local — évite le décalage UTC sur un
  // date-only ISO qui tomberait sur la veille.
  const d = new Date(`${iso}T00:00:00`)
  return {
    weekday: cap(railWeekday.format(d)),
    day: railDay.format(d),
    month: railMonth.format(d),
  }
}

/** Somme des palettes d'un groupe (0 pour les lignes à coef manquant). */
function sumPalettes(rows: ReceptionDisplayRow[]): number {
  return rows.reduce((s, r) => s + (r.nbPalettes ?? 0), 0)
}

function distinctFournisseurs(rows: ReceptionDisplayRow[]): number {
  return new Set(rows.map((r) => r.fournisseur)).size
}

export function ReceptionTableau({
  rows,
  emptyState,
}: {
  rows: ReceptionDisplayRow[]
  emptyState: ReactNode
}) {
  if (rows.length === 0) return <>{emptyState}</>

  // Regroupement par date ISO (rows déjà triées date asc côté serveur).
  // On porte l'index global pour la numérotation continue du bordereau (01…N).
  const groups: { date: string | null; items: { row: ReceptionDisplayRow; n: number }[] }[] = []
  rows.forEach((row, i) => {
    const last = groups[groups.length - 1]
    if (last && last.date === row.date) {
      last.items.push({ row, n: i + 1 })
    } else {
      groups.push({ date: row.date, items: [{ row, n: i + 1 }] })
    }
  })

  return (
    <div className="h-full overflow-auto rounded-lg border bg-card shadow-xs">
      {groups.map((group, gi) => {
        const groupRows = group.items.map((it) => it.row)
        const totalPal = sumPalettes(groupRows)
        const totalTier = chargeTier(totalPal)
        const totalFmt = (Math.round(totalPal * 10) / 10).toLocaleString('fr-FR')
        const relatif = group.items[0]?.row.dateRelatif ?? ''
        const rail = group.date ? formatRailDate(group.date) : null
        const nbFrs = distinctFournisseurs(groupRows)

        return (
          <section
            key={group.date ?? `nodate-${gi}`}
            className={cn('flex', gi > 0 && 'border-t border-rule')}
          >
            {/* ── Rail de date ── */}
            <aside className="flex w-36 flex-none flex-col border-r border-rule-soft py-5 pl-8 pr-3">
              {rail ? (
                <>
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    {rail.weekday}
                  </div>
                  <div className="font-fraunces text-[34px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
                    {rail.day}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                    {rail.month}
                  </div>
                </>
              ) : (
                <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Sans date
                </div>
              )}
              {relatif && (
                <span
                  className={cn(
                    'mt-2 font-mono text-[10px] font-bold',
                    relatif === 'auj.' ? 'text-brand' : 'text-muted-foreground'
                  )}
                >
                  {relatif}
                </span>
              )}
              {/* Charge agrégée du jour */}
              <div className="mt-3.5 space-y-0.5 border-t border-rule-soft pt-2.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                <div>
                  {group.items.length} ligne{group.items.length > 1 ? 's' : ''}
                </div>
                <div>
                  {nbFrs} fournisseur{nbFrs > 1 ? 's' : ''}
                </div>
                <div
                  className={cn(
                    'pt-1 font-fraunces text-[15px] font-bold tabular-nums',
                    chargeText(totalTier)
                  )}
                >
                  {totalFmt}
                  <span className="ml-1 align-baseline font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    pal
                  </span>
                </div>
              </div>
            </aside>

            {/* ── Lignes du jour ── */}
            <div className="min-w-0 flex-1">
              {group.items.map(({ row, n }) => {
                const tier = chargeTier(row.nbPalettes)
                // On n'affiche les diviseurs que si le coef est réel et complet.
                const showDivisors =
                  !row.coefManquant && !row.coefEstime && row.pcuStuCoe != null && row.ucParPal != null

                return (
                  <div
                    key={`${row.noCommande}-${row.article}-${n}`}
                    className="flex items-baseline gap-5 border-b border-rule-soft py-3.5 pl-6 pr-8 transition-colors hover:bg-foreground/[0.03]"
                  >
                    <span className="w-5 flex-none text-[10px] font-semibold tabular-nums text-muted-foreground/60">
                      {String(n).padStart(2, '0')}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[13px] font-bold tracking-tight text-foreground">
                          {row.article}
                        </span>
                        <span className="font-mono text-[10.5px] font-medium text-muted-foreground/70">
                          {row.noCommande}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] leading-snug text-muted-foreground">
                        {row.designation}
                        {row.designation && ' — '}
                        <span className="font-semibold text-secondary-foreground">
                          {row.fournisseurNom}
                        </span>
                      </div>
                    </div>

                    {/* Équation de conversion — la signature du bordereau :
                        le chiffre de palettes devient vérifiable. */}
                    <div
                      className="flex-none text-right tabular-nums"
                      title={
                        row.coefManquant
                          ? `Coef manquant — US/UC : ${row.pcuStuCoe ?? '—'} · UC/pal : ${row.ucParPal ?? '—'}`
                          : row.coefEstime
                            ? `Palette estimée (${
                                row.coefSource === 'STOCK'
                                  ? 'stock actuel SM*'
                                  : 'historique des rangements STOJOU (6 mois)'
                              })`
                            : `${row.qteUsFmt} u ÷ ${row.pcuStuCoe}/UC · ${row.ucParPal}/pal = ${row.nbPalettesFmt} pal`
                      }
                    >
                      <div className="whitespace-nowrap text-[11px] text-muted-foreground">
                        <span className="font-bold text-foreground">{row.qteUsFmt}</span> u
                        {showDivisors && (
                          <>
                            <span className="mx-1 text-muted-foreground/40">÷</span>
                            <span>{row.pcuStuCoe}/UC</span>
                            <span className="mx-1 text-muted-foreground/40">·</span>
                            <span>{row.ucParPal}/pal</span>
                          </>
                        )}
                        <span className="ml-2 text-muted-foreground/50">→</span>
                      </div>
                      <span
                        className={cn(
                          'font-fraunces text-[19px] font-bold leading-none tabular-nums',
                          row.coefManquant
                            ? 'font-medium text-destructive/45'
                            : chargeText(tier)
                        )}
                      >
                        {row.nbPalettesFmt}
                        {!row.coefManquant && (
                          <span className="ml-0.5 align-baseline font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
                            pal
                          </span>
                        )}
                      </span>
                      {row.coefManquant && (
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-medium italic text-destructive">
                          <TriangleAlert size={10} strokeWidth={2} className="not-italic" />
                          coef non référencé
                        </div>
                      )}
                      {row.coefEstime && (
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-medium italic text-planifie">
                          <Lightbulb size={10} strokeWidth={2} className="not-italic" />
                          estimé {row.coefSource?.toLowerCase()}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/*
                Total du jour — filet comptable.
                Exception documentée à la grammaire Airbnb (hairlines 1px partout) :
                le bordereau adopte une ligne simple au-dessus + un filet double
                en dessous, convention comptable de soulignement du total.
              */}
              <div className="ml-6 mr-8 mt-0.5 flex items-baseline gap-3 border-t border-b-[3px] border-double border-foreground pt-2.5 pb-3 pr-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <span>Total du jour</span>
                <span
                  className={cn(
                    'ml-auto font-fraunces text-[14px] font-bold normal-case tracking-normal tabular-nums',
                    chargeText(totalTier)
                  )}
                >
                  {totalFmt}
                  <span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    PAL
                  </span>
                </span>
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// V2 · Calendrier / Charge par jour
// ───────────────────────────────────────────────────────────────────────────

export function ReceptionCalendrier({
  charge,
  selectedDay,
  onSelectDay,
}: {
  charge: DayChargeDisplay[]
  selectedDay: string | null
  onSelectDay: (day: string | null) => void
}) {
  const list = charge ?? []
  const maxPalettes = list.reduce((m, c) => Math.max(m, c.palettes), 0)

  if (list.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
        <CalendarX size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
        <span className="font-fraunces text-[14px] italic text-muted-foreground">
          Aucune réception planifiée sur la période.
        </span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Légende */}
      <div className="flex flex-none flex-wrap items-center gap-4 border-b border-rule-soft px-7 py-2 font-mono text-[10px] text-muted-foreground">
        <Legend sw={chargeBg('ok')} label="Léger (&lt; 5)" />
        <Legend sw={chargeBg('mid')} label="Moyen (5–11)" />
        <Legend sw={chargeBg('warn')} label="Fort (12–19)" />
        <Legend sw={chargeBg('bad')} label="Débord (≥ 20)" />
        <span className="ml-auto">
          Clic sur un jour pour filtrer le tableau
          {selectedDay && (
            <button
              type="button"
              onClick={() => onSelectDay(null)}
              className="ml-2 rounded border border-rule px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand hover:bg-brand/10"
            >
              Tout afficher
            </button>
          )}
        </span>
      </div>

      {/* Histogramme scrollable */}
      <div className="flex-1 overflow-auto px-7 py-4">
        <div
          className="flex min-h-full items-end gap-1.5"
          style={{ minWidth: `${Math.max(list.length * 56, 100)}px` }}
        >
          {list.map((c) => {
            const tier = chargeTier(c.palettes)
            const heightPct =
              maxPalettes > 0 ? Math.max((c.palettes / maxPalettes) * 100, 6) : 6
            const selected = selectedDay === c.day
            return (
              <button
                key={c.day}
                type="button"
                onClick={() => onSelectDay(selected ? null : c.day)}
                className={cn(
                  'group flex min-w-[48px] flex-1 flex-col items-center justify-end rounded-md border pb-1.5 transition-colors',
                  selected
                    ? 'border-brand bg-brand/5'
                    : 'border-rule-soft hover:border-rule hover:bg-secondary/30'
                )}
                style={{ height: '220px' }}
                title={`${c.dayFmt} · ${c.palettes} palette(s) · ${c.lignes} réception(s) · ${c.fournisseurs} fournisseur(s)`}
              >
                {/* Conteneur de charge de hauteur fixe pour éviter l'overflow */}
                <div className="flex h-[135px] w-full flex-col justify-end items-center px-1">
                  {/* Nb palettes au-dessus de la barre */}
                  <div
                    className={cn(
                      'mb-1 font-fraunces text-[16px] font-bold tabular-nums leading-none',
                      chargeText(tier)
                    )}
                  >
                    {c.palettes}
                  </div>
                  {/* Barre */}
                  <div
                    className={cn(
                      'w-full rounded-t-sm transition-all',
                      chargeBg(tier),
                      'group-hover:opacity-90'
                    )}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                {/* Jour (relatif + JJ/MM) */}
                <div className="mt-1.5 px-1 text-center">
                  <div
                    className={cn(
                      'font-mono text-[10px] font-bold',
                      selected ? 'text-brand' : 'text-foreground'
                    )}
                  >
                    {c.dayRelatif}
                  </div>
                  <div className="font-mono text-[9px] text-muted-foreground">{c.dayFmt}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Legend({ sw, label }: { sw: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-[9px] w-5 rounded-[2px]', sw)} />
      {label}
    </span>
  )
}
