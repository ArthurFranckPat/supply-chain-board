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
  /** Samedi ou dimanche — affiché uniquement s'il porte une réception (exception). */
  weekend: boolean
  /** Jour courant. */
  today: boolean
  /** Jour révolu (colonne « retard » — réceptions non soldées dans le passé). */
  past: boolean
}

/**
 * Unité du board : **un fournisseur, un jour**. C'est la maille du geste métier
 * (« je décale la livraison ACME de mardi à jeudi »), pas la ligne de commande —
 * un camion arrive entier. Les lignes PO sous-jacentes restent consultables dans
 * le panneau de détail.
 */
interface ReceptionGroup {
  /** Clé stable `fournisseur|jour`. */
  key: string
  fournisseur: string
  fournisseurNom: string
  /** Jour ISO. */
  iso: string
  /** Date JJ/MM/AA (reprise de la 1ʳᵉ ligne, déjà formatée serveur). */
  dateFmt: string
  /** Total palettes du camion. */
  palettes: number
  /** Lignes PO agrégées. */
  rows: ReceptionDisplayRow[]
  /** Nb de lignes au coef absent (charge sous-estimée). */
  sansCoef: number
  /** Nb de lignes au coef estimé (STOCK/STOJOU). */
  estimees: number
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
  /** Groupes fournisseur×jour, par jour ISO. */
  byDay: Map<string, ReceptionGroup[]>
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
 *
 * Les week-ends sont retirés — le quai ne réceptionne pas, deux colonnes vides
 * par semaine ne font que diluer la lecture des pics. Exception : un samedi ou
 * dimanche **porteur d'une réception** reste affiché (une date confirmée
 * fournisseur peut tomber là), sinon la carte disparaîtrait du board.
 */
export function buildDayAxis(from: string, to: string, isos: string[]): DayCol[] {
  const bounds = [from, to, ...isos].filter(Boolean).sort()
  const start = parseIso(bounds[0] ?? '')
  const end = parseIso(bounds[bounds.length - 1] ?? '')
  if (!start || !end || end < start) return []

  const charged = new Set(isos)
  const todayIso = toIso(new Date())
  const cols: DayCol[] = []
  const cur = new Date(start)
  while (cur <= end && cols.length < 120) {
    const iso = toIso(cur)
    const dow = cur.getDay()
    const weekend = dow === 0 || dow === 6
    if (!weekend || charged.has(iso)) {
      cols.push({
        iso,
        num: String(cur.getDate()),
        weekday: WEEKDAY_FMT.format(cur),
        week: isoWeek(cur),
        weekend,
        today: iso === todayIso,
        past: iso < todayIso,
      })
    }
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
  const [detail, setDetail] = useState<ReceptionGroup | null>(null)

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

  /**
   * Maille du board : un groupe par couple (fournisseur, jour). Les lignes PO du
   * même camion sont agrégées en une carte — leur détail reste dans le panneau.
   */
  const groups = useMemo<ReceptionGroup[]>(() => {
    const acc = new Map<string, ReceptionGroup>()
    for (const r of dated) {
      const key = `${r.fournisseur}|${r.date}`
      let g = acc.get(key)
      if (!g) {
        g = {
          key,
          fournisseur: r.fournisseur,
          fournisseurNom: r.fournisseurNom || r.fournisseur,
          iso: r.date!,
          dateFmt: r.dateFmt,
          palettes: 0,
          rows: [],
          sansCoef: 0,
          estimees: 0,
        }
        acc.set(key, g)
      }
      g.palettes += r.nbPalettes
      g.rows.push(r)
      if (r.coefManquant) g.sansCoef += 1
      else if (r.coefEstime) g.estimees += 1
    }
    return [...acc.values()]
  }, [dated])

  /** Lignes du board : une par fournisseur (tri charge desc), ou une seule « Quai ». */
  const lines = useMemo<BoardLine[]>(() => {
    if (groups.length === 0) return []

    const push = (line: BoardLine, g: ReceptionGroup) => {
      line.palettes += g.palettes
      const slot = line.byDay.get(g.iso) ?? []
      slot.push(g)
      line.byDay.set(g.iso, slot)
    }

    if (groupBy === 'quai') {
      const line: BoardLine = {
        key: 'QUAI',
        label: 'Quai réception',
        sub: '',
        palettes: 0,
        byDay: new Map(),
      }
      const fournisseurs = new Set<string>()
      for (const g of groups) {
        push(line, g)
        fournisseurs.add(g.fournisseur)
      }
      // Cartes empilées d'un même jour : la plus chargée en tête.
      for (const slot of line.byDay.values()) slot.sort((a, b) => b.palettes - a.palettes)
      line.sub = `${fournisseurs.size} fournisseur${fournisseurs.size > 1 ? 's' : ''}`
      return [line]
    }

    const acc = new Map<string, BoardLine>()
    for (const g of groups) {
      let line = acc.get(g.fournisseur)
      if (!line) {
        line = {
          key: g.fournisseur,
          label: g.fournisseurNom,
          sub: g.fournisseur,
          palettes: 0,
          byDay: new Map(),
        }
        acc.set(g.fournisseur, line)
      }
      push(line, g)
    }
    return [...acc.values()].sort(
      (a, b) => b.palettes - a.palettes || a.label.localeCompare(b.label)
    )
  }, [groups, groupBy])

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
                    {cards.map((g) => (
                      <ReceptionCard
                        key={g.key}
                        group={g}
                        showFournisseur={groupBy === 'quai'}
                        onOpen={() => setDetail(g)}
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

      <ReceptionDetailSheet group={detail} onClose={() => setDetail(null)} />
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Carte
// ───────────────────────────────────────────────────────────────────────────

/**
 * Carte = un camion (fournisseur × jour). Le nombre de palettes est l'ancre
 * visuelle ; le nom du fournisseur n'est repris que dans le mode « Quai », où
 * l'en-tête de ligne ne le porte plus.
 */
function ReceptionCard({
  group,
  showFournisseur,
  onOpen,
}: {
  group: ReceptionGroup
  showFournisseur: boolean
  onOpen: () => void
}) {
  const tier = chargeTier(group.palettes)
  const nbLignes = group.rows.length
  const degrade = group.sansCoef > 0
  const estime = !degrade && group.estimees > 0
  /** Une seule ligne PO → on affiche l'article, plus parlant que « 1 ligne ». */
  const single = nbLignes === 1 ? group.rows[0] : null
  const nbCommandes = new Set(group.rows.map((r) => r.noCommande)).size

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full flex-col gap-1 rounded-md border border-t-[3px] border-rule-soft bg-card px-2 py-1.5 text-left transition-all',
        'hover:-translate-y-px hover:shadow-float',
        degrade
          ? 'border-t-destructive/60 bg-destructive/[0.05]'
          : estime
            ? 'border-t-planifie bg-planifie/[0.05]'
            : 'border-t-ferme'
      )}
      title={[
        showFournisseur ? group.fournisseurNom : null,
        `${group.palettes} palette${group.palettes > 1 ? 's' : ''}`,
        `${nbLignes} ligne${nbLignes > 1 ? 's' : ''} de commande`,
        group.sansCoef > 0 ? `${group.sansCoef} sans coef (charge sous-estimée)` : null,
        group.estimees > 0 ? `${group.estimees} coef estimé` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {showFournisseur && (
        <span className="truncate font-sans text-[11px] font-semibold leading-tight text-secondary-foreground">
          {group.fournisseurNom}
        </span>
      )}

      {/* Palettes — l'unité du board. */}
      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            'font-fraunces text-[19px] font-bold tabular-nums leading-none',
            degrade ? 'text-destructive/70' : estime ? 'text-planifie' : chargeText(tier)
          )}
        >
          {group.palettes}
        </span>
        <span className="font-mono text-[9px] font-medium text-muted-foreground">pal.</span>
        {degrade ? (
          <TriangleAlert size={11} strokeWidth={1.75} className="ml-auto text-destructive" />
        ) : estime ? (
          <Lightbulb size={11} strokeWidth={1.75} className="ml-auto text-planifie" />
        ) : (
          <Package size={11} strokeWidth={1.75} className="ml-auto text-muted-foreground/60" />
        )}
      </span>

      {/* Contenu du camion : article si ligne unique, sinon le compte — en
          mentionnant les commandes dès qu'il y en a plusieurs (une réception
          multi-commandes se traite différemment au quai). */}
      <span className="truncate font-mono text-[9.5px] leading-none text-muted-foreground">
        {single
          ? `${single.noCommande} · ${single.article}`
          : nbCommandes > 1
            ? `${nbCommandes} cmd · ${nbLignes} lignes`
            : `${nbLignes} lignes`}
      </span>
    </button>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Détail (drill-down)
// ───────────────────────────────────────────────────────────────────────────

/** Une commande d'achat du camion, avec ses lignes et son sous-total palettes. */
interface CommandeGroup {
  noCommande: string
  palettes: number
  rows: ReceptionDisplayRow[]
}

/** Regroupe les lignes du camion par n° de commande (ordre d'apparition). */
function groupByCommande(rows: ReceptionDisplayRow[]): CommandeGroup[] {
  const acc = new Map<string, CommandeGroup>()
  for (const r of rows) {
    let cmd = acc.get(r.noCommande)
    if (!cmd) {
      cmd = { noCommande: r.noCommande, palettes: 0, rows: [] }
      acc.set(r.noCommande, cmd)
    }
    cmd.palettes += r.nbPalettes
    cmd.rows.push(r)
  }
  return [...acc.values()]
}

function ReceptionDetailSheet({
  group,
  onClose,
}: {
  group: ReceptionGroup | null
  onClose: () => void
}) {
  // Hook inconditionnel (le panneau reste monté fermé, group peut être null).
  const commandes = useMemo(() => groupByCommande(group?.rows ?? []), [group])

  return (
    <Sheet open={group !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="gap-0 p-0">
        {group && (
          <div className="flex h-full flex-col overflow-auto">
            {/* En-tête : le camion. */}
            <div className="border-b border-rule px-6 py-5">
              <SheetTitle className="font-fraunces text-[19px] font-bold leading-tight tracking-tight text-foreground">
                {group.fournisseurNom}
              </SheetTitle>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                {group.fournisseur} · {group.dateFmt}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span
                  className={cn(
                    'font-fraunces text-[30px] font-bold tabular-nums leading-none',
                    chargeText(chargeTier(group.palettes))
                  )}
                >
                  {group.palettes}
                </span>
                <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  palette{group.palettes > 1 ? 's' : ''} ·{' '}
                  {chargeLabel(chargeTier(group.palettes))}
                </span>
              </div>
              {(group.sansCoef > 0 || group.estimees > 0) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {group.sansCoef > 0 && (
                    <span className="flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 font-mono text-[9.5px] font-bold uppercase tracking-wider text-destructive">
                      <TriangleAlert size={11} strokeWidth={1.75} />
                      {group.sansCoef} sans coef — charge sous-estimée
                    </span>
                  )}
                  {group.estimees > 0 && (
                    <span className="flex items-center gap-1 rounded bg-planifie/10 px-2 py-1 font-mono text-[9.5px] font-bold uppercase tracking-wider text-planifie">
                      <Lightbulb size={11} strokeWidth={1.75} />
                      {group.estimees} coef estimé{group.estimees > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Détail : les commandes du camion, chacune avec ses lignes.
                Le n° de commande est l'unité de dialogue avec le fournisseur
                (« ta commande CG0042 arrive-t-elle bien jeudi ? ») — il porte
                donc la section plutôt que de se répéter sur chaque ligne. */}
            <div className="px-6 pb-2 pt-4">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {commandes.length} commande{commandes.length > 1 ? 's' : ''} ·{' '}
                {group.rows.length} ligne{group.rows.length > 1 ? 's' : ''}
              </div>
            </div>

            {commandes.map((cmd) => (
              <section key={cmd.noCommande} className="border-t border-rule">
                {/* En-tête de commande : n° + sous-total palettes. */}
                <header className="flex items-baseline justify-between gap-3 bg-secondary/40 px-6 py-2">
                  <span className="font-mono text-[12px] font-bold tracking-tight text-foreground">
                    {cmd.noCommande}
                  </span>
                  <span className="flex items-baseline gap-2 font-mono text-[10px] text-muted-foreground">
                    <span>
                      {cmd.rows.length} ligne{cmd.rows.length > 1 ? 's' : ''}
                    </span>
                    <span
                      className={cn(
                        'font-fraunces text-[14px] font-bold tabular-nums',
                        chargeText(chargeTier(cmd.palettes))
                      )}
                    >
                      {cmd.palettes}
                      <span className="ml-1 font-mono text-[9px] font-medium text-muted-foreground">
                        pal.
                      </span>
                    </span>
                  </span>
                </header>

                {cmd.rows.map((r) => (
                  <div
                    key={`${r.noCommande}:${r.article}`}
                    className={cn(
                      'border-t border-rule-soft px-6 py-3',
                      r.coefManquant
                        ? 'bg-destructive/[0.05]'
                        : r.coefEstime
                          ? 'bg-planifie/[0.05]'
                          : ''
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-[12px] font-bold text-foreground">
                        {r.article}
                      </span>
                      <span
                        className={cn(
                          'font-fraunces text-[15px] font-bold tabular-nums leading-none',
                          r.coefManquant
                            ? 'text-destructive/60'
                            : r.coefEstime
                              ? 'text-planifie'
                              : chargeText(chargeTier(r.nbPalettes))
                        )}
                      >
                        {r.nbPalettesFmt}
                        <span className="ml-1 font-mono text-[9px] font-medium text-muted-foreground">
                          pal.
                        </span>
                      </span>
                    </div>
                    {r.designation && (
                      <div className="mt-0.5 font-sans text-[11.5px] leading-snug text-muted-foreground">
                        {r.designation}
                      </div>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
                      <span>
                        {r.qteUsFmt} <span className="text-muted-foreground/70">US</span>
                      </span>
                      <span className={cn(r.coefManquant && 'text-destructive')}>
                        {r.conditionnement}
                      </span>
                      {r.coefEstime && (
                        <span className="flex items-center gap-1 text-planifie">
                          <Lightbulb size={10} strokeWidth={1.75} />
                          Estimé ({r.coefSource})
                        </span>
                      )}
                      {r.coefManquant && (
                        <span className="flex items-center gap-1 text-destructive">
                          <TriangleAlert size={10} strokeWidth={1.75} />
                          Coef manquant
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
