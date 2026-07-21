import { useMemo, useState } from 'react'
import { CalendarX, Lightbulb, Package, TriangleAlert, Truck, Warehouse } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { chargeBg, chargeLabel, chargeText, chargeTier } from '@r/lib/receptions/charge'
import type { ReceptionDisplayRow } from '@/lib/receptions/types'

/**
 * V3 · Board de planification de charge réception (issue #82, lot 1 — lecture seule).
 *
 * Grille temps × lignes calquée sur la grammaire du board /programme
 * (inertia-react/components/board/board-grid.tsx) : bande semaines + en-tête de
 * jour collants en haut, colonne de libellé collante à gauche, pied de charge
 * collant en bas. L'unité n'est pas l'heure mais la **palette attendue**.
 *
 * Différence structurante avec la vue Calendrier : l'axe des jours est **dense**
 * (tous les jours de la fenêtre, y compris vides). `chargeByDay` du serveur est
 * creux — or sur un board de lissage les **trous** sont une information au même
 * titre que les pics, donc l'axe est reconstruit ici depuis la plage.
 *
 * Lot 1 = aucun drag&drop, aucune modif backend : on constate les pics et les
 * trous, on ouvre le détail d'une réception. Le déplacement de carte (PATCH +
 * override local) est le lot 2.
 */

/** Largeur de la colonne de libellé (fournisseur / quai), collante à gauche. */
const LABEL_W = 200
/** Largeur mini d'une colonne-jour (sert au calcul de largeur totale). */
const COL_MIN_W = 124

export type ReceptionGroupBy = 'fournisseur' | 'quai'

interface DayCol {
  /** Jour ISO (YYYY-MM-DD). */
  iso: string
  /** Numéro du jour dans le mois (« 28 »). */
  num: string
  /** Jour de semaine abrégé FR (« lun. »). */
  weekday: string
  /** N° de semaine ISO. */
  week: number
  /** Samedi ou dimanche. */
  weekend: boolean
  /** Jour courant. */
  today: boolean
  /** Jour révolu (colonne « retard » — réceptions non soldées dans le passé). */
  past: boolean
}

interface BoardLine {
  /** Clé de regroupement (code fournisseur, ou 'QUAI'). */
  key: string
  /** Libellé principal (nom fournisseur, ou « Quai réception »). */
  label: string
  /** Sous-libellé (code fournisseur, ou nb de fournisseurs). */
  sub: string
  /** Total palettes de la ligne sur la fenêtre. */
  palettes: number
  /** Cartes par jour ISO. */
  byDay: Map<string, ReceptionDisplayRow[]>
}

// ───────────────────────────────────────────────────────────────────────────
// Axe temps
// ───────────────────────────────────────────────────────────────────────────

/** ISO YYYY-MM-DD → Date locale (évite le décalage d'un jour de `new Date(iso)`). */
function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** N° de semaine ISO 8601 (lundi = 1er jour, semaine du 4 janvier = S1). */
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

const WEEKDAY_FMT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })

/**
 * Axe dense de la fenêtre [from, to]. Élargi si des réceptions tombent hors
 * plage (le serveur borne la requête, mais une date confirmée peut déborder).
 * Borné à 120 colonnes pour éviter une grille ingérable sur une plage absurde.
 */
export function buildDayAxis(from: string, to: string, isos: string[]): DayCol[] {
  const bounds = [from, to, ...isos].filter(Boolean).sort()
  const start = parseIso(bounds[0] ?? '')
  const end = parseIso(bounds[bounds.length - 1] ?? '')
  if (!start || !end || end < start) return []

  const todayIso = toIso(new Date())
  const cols: DayCol[] = []
  const cur = new Date(start)
  while (cur <= end && cols.length < 120) {
    const iso = toIso(cur)
    const dow = cur.getDay()
    cols.push({
      iso,
      num: String(cur.getDate()),
      weekday: WEEKDAY_FMT.format(cur),
      week: isoWeek(cur),
      weekend: dow === 0 || dow === 6,
      today: iso === todayIso,
      past: iso < todayIso,
    })
    cur.setDate(cur.getDate() + 1)
  }
  return cols
}

// ───────────────────────────────────────────────────────────────────────────
// Board
// ───────────────────────────────────────────────────────────────────────────

export function ReceptionBoard({
  rows,
  from,
  to,
  groupBy,
}: {
  rows: ReceptionDisplayRow[]
  /** Début de fenêtre ISO (payload `range.from`). */
  from: string
  /** Fin de fenêtre ISO (payload `range.to`). */
  to: string
  groupBy: ReceptionGroupBy
}) {
  const [detail, setDetail] = useState<ReceptionDisplayRow | null>(null)

  /** Lignes datées (positionnables) vs sans date retenue (ni EXTRCPDAT ni ZDATCOF). */
  const dated = useMemo(() => rows.filter((r) => r.date), [rows])
  const undated = rows.length - dated.length

  const days = useMemo(
    () => buildDayAxis(from, to, dated.map((r) => r.date as string)),
    [from, to, dated]
  )

  /** Charge palette par jour ISO (recalculée sur les lignes affichées, pas le payload). */
  const chargeByIso = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of dated) m.set(r.date!, (m.get(r.date!) ?? 0) + r.nbPalettes)
    return m
  }, [dated])

  const maxCharge = useMemo(() => Math.max(0, ...chargeByIso.values()), [chargeByIso])

  /** Lignes du board : une par fournisseur (tri charge desc), ou une seule « Quai ». */
  const lines = useMemo<BoardLine[]>(() => {
    if (groupBy === 'quai') {
      const byDay = new Map<string, ReceptionDisplayRow[]>()
      let palettes = 0
      const fournisseurs = new Set<string>()
      for (const r of dated) {
        const slot = byDay.get(r.date!) ?? []
        slot.push(r)
        byDay.set(r.date!, slot)
        palettes += r.nbPalettes
        fournisseurs.add(r.fournisseur)
      }
      if (dated.length === 0) return []
      return [
        {
          key: 'QUAI',
          label: 'Quai réception',
          sub: `${fournisseurs.size} fournisseur${fournisseurs.size > 1 ? 's' : ''}`,
          palettes,
          byDay,
        },
      ]
    }

    const acc = new Map<string, BoardLine>()
    for (const r of dated) {
      const line =
        acc.get(r.fournisseur) ??
        ({
          key: r.fournisseur,
          label: r.fournisseurNom || r.fournisseur,
          sub: r.fournisseur,
          palettes: 0,
          byDay: new Map(),
        } satisfies BoardLine)
      line.palettes += r.nbPalettes
      const slot = line.byDay.get(r.date!) ?? []
      slot.push(r)
      line.byDay.set(r.date!, slot)
      acc.set(r.fournisseur, line)
    }
    return [...acc.values()].sort(
      (a, b) => b.palettes - a.palettes || a.label.localeCompare(b.label)
    )
  }, [dated, groupBy])

  /** Empans de semaine (bande supérieure) + total palettes hebdo. */
  const weekSpans = useMemo(() => {
    const spans: { week: number; span: number; palettes: number }[] = []
    for (const d of days) {
      const last = spans[spans.length - 1]
      const pal = chargeByIso.get(d.iso) ?? 0
      if (last && last.week === d.week) {
        last.span += 1
        last.palettes += pal
      } else {
        spans.push({ week: d.week, span: 1, palettes: pal })
      }
    }
    return spans
  }, [days, chargeByIso])

  const gridTpl = `${LABEL_W}px repeat(${days.length}, minmax(${COL_MIN_W}px, 1fr))`
  const minWidth = `calc(${LABEL_W}px + ${days.length * COL_MIN_W}px)`

  if (days.length === 0 || lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
        <CalendarX size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
        <span className="font-fraunces text-[14px] italic text-muted-foreground">
          {undated > 0
            ? `Aucune réception datée sur la période (${undated} sans date retenue).`
            : 'Aucune réception planifiée sur la période.'}
        </span>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto bg-background">
        <div className="relative" style={{ minWidth }}>
          {/* ═══ En-tête collant (semaines + jours) ═══ */}
          <div className="sticky top-0 z-30 bg-background shadow-float">
            {/* Bande semaines */}
            <div className="grid" style={{ gridTemplateColumns: gridTpl }}>
              <div className="sticky left-0 z-40 border-b border-rule bg-secondary" />
              {weekSpans.map((ws) => (
                <div
                  key={`${ws.week}-${ws.span}`}
                  className="flex items-baseline gap-2.5 border-b border-r border-rule bg-secondary px-3.5 py-1.5"
                  style={{ gridColumn: `span ${ws.span}` }}
                >
                  <span className="font-fraunces text-sm font-black italic tracking-tight text-brand">
                    Semaine {ws.week}
                  </span>
                  <span className="ml-auto font-fraunces text-xs font-bold tabular-nums text-foreground">
                    {ws.palettes} pal.
                  </span>
                </div>
              ))}
            </div>

            {/* En-tête jours */}
            <div className="grid" style={{ gridTemplateColumns: gridTpl }}>
              <div className="sticky left-0 z-40 flex items-center gap-1.5 border-b border-r border-rule bg-card px-3.5 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {groupBy === 'quai' ? (
                  <Warehouse size={13} strokeWidth={1.75} />
                ) : (
                  <Truck size={13} strokeWidth={1.75} />
                )}
                {groupBy === 'quai' ? 'Quai' : 'Fournisseur'}
              </div>
              {days.map((d) => (
                <div
                  key={d.iso}
                  className={cn(
                    'border-b border-r border-rule-soft bg-card px-2.5 py-1.5 text-center',
                    d.weekend && 'bg-secondary/50',
                    d.today && 'bg-brand-soft'
                  )}
                >
                  <div
                    className={cn(
                      'font-mono text-[9px] font-bold uppercase tracking-[0.1em]',
                      d.today ? 'text-brand' : 'text-muted-foreground'
                    )}
                  >
                    {d.weekday}
                  </div>
                  <div
                    className={cn(
                      'font-fraunces text-lg font-bold leading-none tracking-tight',
                      d.today ? 'italic text-brand' : d.past ? 'text-muted-foreground' : 'text-foreground'
                    )}
                  >
                    {d.num}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ═══ Rangées ═══ */}
          {lines.map((line) => (
            <div
              key={line.key}
              className="grid border-b border-rule-soft"
              style={{ gridTemplateColumns: gridTpl }}
            >
              {/* Libellé collant */}
              <div className="sticky left-0 z-20 flex flex-col gap-1 overflow-hidden border-r border-rule bg-card px-3.5 py-3">
                <span className="truncate font-sans text-[12.5px] font-semibold leading-tight text-secondary-foreground">
                  {line.label}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{line.sub}</span>
                <span
                  className={cn(
                    'mt-0.5 font-fraunces text-[13px] font-bold tabular-nums leading-none',
                    chargeText(chargeTier(line.palettes))
                  )}
                >
                  {line.palettes} pal.
                </span>
              </div>

              {/* Cellules */}
              {days.map((d) => {
                const cards = line.byDay.get(d.iso) ?? []
                return (
                  <div
                    key={`${line.key}:${d.iso}`}
                    className={cn(
                      'flex min-h-[74px] flex-col gap-1.5 border-r border-rule-soft p-1.5',
                      d.weekend && 'bg-secondary/40',
                      d.past && !d.today && 'bg-destructive/[0.035]',
                      d.today && 'bg-brand-soft/40'
                    )}
                  >
                    {cards.map((r) => (
                      <ReceptionCard
                        key={`${r.noCommande}:${r.article}:${r.date}`}
                        row={r}
                        onOpen={() => setDetail(r)}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          ))}

          {/* ═══ Pied de charge collant (l'info n°1 : pics & trous) ═══ */}
          <div
            className="sticky bottom-0 z-30 grid bg-background shadow-[0_-1px_0_var(--color-rule,rgba(0,0,0,.1))]"
            style={{ gridTemplateColumns: gridTpl }}
          >
            <div className="sticky left-0 z-40 flex flex-col justify-center border-r border-t border-rule bg-card px-3.5 py-2">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Total quai
              </span>
              <span className="font-mono text-[9px] text-muted-foreground/70">palettes / jour</span>
            </div>
            {days.map((d) => {
              const pal = chargeByIso.get(d.iso) ?? 0
              const tier = chargeTier(pal)
              const pct = maxCharge > 0 ? Math.max((pal / maxCharge) * 100, pal > 0 ? 8 : 0) : 0
              return (
                <div
                  key={`charge:${d.iso}`}
                  className={cn(
                    'flex flex-col items-center justify-end gap-1 border-r border-t border-rule bg-card px-2 pb-1.5 pt-2',
                    d.today && 'bg-brand-soft/50'
                  )}
                  title={`${d.weekday} ${d.num} · ${pal} palette${pal > 1 ? 's' : ''}${pal > 0 ? ` · ${chargeLabel(tier)}` : ''}`}
                >
                  <span
                    className={cn(
                      'font-fraunces text-[15px] font-bold tabular-nums leading-none',
                      pal > 0 ? chargeText(tier) : 'text-muted-foreground/40'
                    )}
                  >
                    {pal > 0 ? pal : '—'}
                  </span>
                  <div className="flex h-[18px] w-full items-end">
                    {pal > 0 && (
                      <div
                        className={cn('w-full rounded-t-sm', chargeBg(tier))}
                        style={{ height: `${pct}%` }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bandeau « sans date » — ces lignes n'apparaissent nulle part sur la grille. */}
      {undated > 0 && (
        <div className="flex flex-none items-center gap-2 border-t border-rule-soft bg-secondary/40 px-7 py-1.5 font-mono text-[10px] text-muted-foreground">
          <TriangleAlert size={13} strokeWidth={1.75} className="text-suggere" />
          {undated} réception{undated > 1 ? 's' : ''} sans date retenue — absente
          {undated > 1 ? 's' : ''} du board (visible{undated > 1 ? 's' : ''} dans la vue Tableau).
        </div>
      )}

      <ReceptionDetailSheet row={detail} onClose={() => setDetail(null)} />
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Carte
// ───────────────────────────────────────────────────────────────────────────

function ReceptionCard({ row, onOpen }: { row: ReceptionDisplayRow; onOpen: () => void }) {
  const tier = chargeTier(row.nbPalettes)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex w-full flex-col gap-1 rounded-md border border-t-[3px] bg-card px-2 py-1.5 text-left transition-all',
        'hover:-translate-y-px hover:shadow-float',
        row.coefManquant
          ? 'border-rule-soft border-t-destructive/60 bg-destructive/[0.05]'
          : row.coefEstime
            ? 'border-rule-soft border-t-planifie bg-planifie/[0.05]'
            : 'border-rule-soft border-t-ferme'
      )}
      title={`${row.noCommande} · ${row.article} · ${row.nbPalettesFmt} palette(s)`}
    >
      <span className="font-mono text-[10.5px] font-bold leading-none text-foreground">
        {row.noCommande}
      </span>
      <span className="truncate font-mono text-[10px] leading-none text-muted-foreground">
        {row.article}
      </span>
      <span className="flex items-center gap-1">
        {row.coefManquant ? (
          <TriangleAlert size={11} strokeWidth={1.75} className="text-destructive" />
        ) : row.coefEstime ? (
          <Lightbulb size={11} strokeWidth={1.75} className="text-planifie" />
        ) : (
          <Package size={11} strokeWidth={1.75} className="text-muted-foreground" />
        )}
        <span
          className={cn(
            'font-fraunces text-[12px] font-bold tabular-nums leading-none',
            row.coefManquant
              ? 'text-destructive/60'
              : row.coefEstime
                ? 'text-planifie'
                : chargeText(tier)
          )}
        >
          {row.nbPalettesFmt}
        </span>
      </span>
    </button>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Détail (drill-down)
// ───────────────────────────────────────────────────────────────────────────

function ReceptionDetailSheet({
  row,
  onClose,
}: {
  row: ReceptionDisplayRow | null
  onClose: () => void
}) {
  return (
    <Sheet open={row !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="gap-0 p-0">
        {row && (
          <div className="flex h-full flex-col overflow-auto">
            <div className="border-b border-rule px-6 py-5">
              <SheetTitle className="font-fraunces text-[19px] font-bold tracking-tight text-foreground">
                {row.noCommande}
              </SheetTitle>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                {row.dateFmt} · {row.dateRelatif}
              </div>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5">
              <Field label="Fournisseur">
                <div className="font-sans text-[13px] font-semibold text-secondary-foreground">
                  {row.fournisseurNom}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">{row.fournisseur}</div>
              </Field>

              <Field label="Article">
                <div className="font-mono text-[13px] font-bold text-foreground">{row.article}</div>
                {row.designation && (
                  <div className="mt-0.5 font-sans text-[12px] leading-snug text-muted-foreground">
                    {row.designation}
                  </div>
                )}
              </Field>

              <Field label="Quantité restante">
                <span className="font-fraunces text-[16px] font-bold tabular-nums text-foreground">
                  {row.qteUsFmt}
                  <span className="ml-1 font-mono text-[10px] font-medium text-muted-foreground">
                    US
                  </span>
                </span>
              </Field>

              <Field label="Conditionnement">
                <div className="font-mono text-[12px] text-muted-foreground">
                  {row.conditionnement}
                </div>
                {row.coefManquant && (
                  <div className="mt-1.5 flex items-center gap-1.5 rounded bg-destructive/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-destructive">
                    <TriangleAlert size={12} strokeWidth={1.75} />
                    Coef manquant — charge sous-estimée
                  </div>
                )}
                {row.coefEstime && (
                  <div className="mt-1.5 flex items-center gap-1.5 rounded bg-planifie/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-planifie">
                    <Lightbulb size={12} strokeWidth={1.75} />
                    Estimé ({row.coefSource})
                  </div>
                )}
              </Field>

              <Field label="Palettes attendues">
                <span
                  className={cn(
                    'font-fraunces text-[26px] font-bold tabular-nums leading-none',
                    row.coefManquant
                      ? 'text-destructive/60'
                      : row.coefEstime
                        ? 'text-planifie'
                        : chargeText(chargeTier(row.nbPalettes))
                  )}
                >
                  {row.nbPalettesFmt}
                </span>
              </Field>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}
