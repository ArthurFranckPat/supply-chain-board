import { Fragment, useEffect, useMemo, useState } from 'react'
import { CircleX, Inbox, LoaderCircle, TriangleAlert } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { LoadingState } from '@r/components/ui/loading-state'
import { Segment, SegmentButton, ToolbarRow, ToolbarSpacer } from '@r/components/vision/toolbar'
import { route } from '@r/lib/routes'
import { cn } from '@r/lib/utils'
import type { ApproCran, ApproDetail, ApproGran, ApproPayload, ApproRow } from '@r/lib/appro/types'

/**
 * Page « Approvisionnement » — plan besoins matières (lot 1).
 *
 * Coquille Inertia instantanée ; le calcul (explosion nomenclature complète +
 * netting priorité ferme) est fetché via useTimedFetch, même motif que
 * /receptions. Lecture approvisionneur : lignes = composants, colonnes =
 * périodes × (Ferme | Prévision).
 */

type Preset = '2sem' | 'mois' | 'moisprochain' | '3mois' | '6mois' | 'libre'

const PRESETS: { id: Preset; label: string }[] = [
  { id: '2sem', label: '2 semaines' },
  { id: 'mois', label: 'Mois en cours' },
  { id: 'moisprochain', label: 'Mois prochain' },
  { id: '3mois', label: '3 mois' },
  { id: '6mois', label: '6 mois' },
  { id: 'libre', label: 'Libre' },
]

const GRANS: { id: ApproGran; label: string }[] = [
  { id: 'jour', label: 'Jour' },
  { id: 'semaine', label: 'Semaine' },
  { id: 'mois', label: 'Mois' },
]

const CRANS: { id: ApproCran; label: string; hint: string }[] = [
  { id: 'brut', label: 'Brut', hint: 'Besoin explosé, avant toute déduction' },
  { id: 'net', label: 'Net', hint: 'Brut − stock (le stock couvre le ferme en priorité)' },
  {
    id: 'reste',
    label: 'Reste à couvrir',
    hint: 'Net − pièces déjà produites sur OF en cours (sous-ensembles)',
  },
]

const isoDay = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

const endOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() + 1, 0)
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000)

function presetRange(preset: Preset, today: Date): { from: string; to: string } {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  switch (preset) {
    case '2sem':
      return { from: isoDay(t), to: isoDay(addDays(t, 13)) }
    case 'mois':
      return { from: isoDay(t), to: isoDay(endOfMonth(t)) }
    case 'moisprochain': {
      const first = new Date(t.getFullYear(), t.getMonth() + 1, 1)
      return { from: isoDay(first), to: isoDay(endOfMonth(first)) }
    }
    case '3mois':
      return {
        from: isoDay(t),
        to: isoDay(addDays(new Date(t.getFullYear(), t.getMonth() + 3, 1), -1)),
      }
    case '6mois':
      return {
        from: isoDay(t),
        to: isoDay(addDays(new Date(t.getFullYear(), t.getMonth() + 6, 1), -1)),
      }
    case 'libre':
      return { from: isoDay(t), to: isoDay(addDays(t, 13)) }
  }
}

/**
 * Compte de périodes côté client — même règle que le serveur
 * (`materialBuckets`, plafond 14) : l'option hors-plafond est désactivée AVANT
 * le fetch, pas refusée après.
 */
function countPeriods(fromIso: string, toIso: string, gran: ApproGran): number | null {
  const from = new Date(`${fromIso}T00:00:00`)
  const to = new Date(`${toIso}T00:00:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null
  if (gran === 'jour') return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
  if (gran === 'semaine') {
    const dow = (from.getDay() + 6) % 7
    const monday = new Date(from.getTime() - dow * 86_400_000)
    return Math.floor((to.getTime() - monday.getTime()) / (7 * 86_400_000)) + 1
  }
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1
}

const fmtQty = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
type SupplyFilter = 'TOUS' | 'ACHAT' | 'FABRICATION'
type SortKey = 'net' | 'article'

const cranOf = (row: ApproRow, cran: ApproCran, i: number, ferme: boolean): number => {
  if (cran === 'brut') return ferme ? row.brutFerme[i] : row.brutPrevi[i]
  if (cran === 'net') return ferme ? row.netFerme[i] : row.netPrevi[i]
  return ferme ? row.resteFerme[i] : row.restePrevi[i]
}

const cranTotal = (row: ApproRow, cran: ApproCran): number => {
  const pick =
    cran === 'brut'
      ? row.brutFerme.concat(row.brutPrevi)
      : cran === 'net'
        ? row.netFerme.concat(row.netPrevi)
        : row.resteFerme.concat(row.restePrevi)
  return pick.reduce((s, v) => s + v, 0)
}

const resteTotal = (row: ApproRow): number =>
  row.resteFerme.reduce((s, v) => s + v, 0) + row.restePrevi.reduce((s, v) => s + v, 0)

export default function Approvisionnement() {
  const today = useMemo(() => new Date(), [])
  const [preset, setPreset] = useState<Preset>('moisprochain')
  const [custom, setCustom] = useState(() => presetRange('libre', new Date()))
  const [gran, setGran] = useState<ApproGran>('semaine')
  const [cran, setCran] = useState<ApproCran>('net')
  const [query, setQuery] = useState('')
  const [supply, setSupply] = useState<SupplyFilter>('ACHAT')
  const [manquesOnly, setManquesOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('net')
  const [selected, setSelected] = useState<string | null>(null)

  const range = preset === 'libre' ? custom : presetRange(preset, today)
  const periods = countPeriods(range.from, range.to, gran)
  const overCap = periods === null || periods > 14

  // Repli maille auto : la maille se replie sur la plus fine encore permise
  // quand la fenêtre change (choix utilisateur sinon conservé).
  useEffect(() => {
    if (preset === 'libre') return
    const r = presetRange(preset, today)
    if ((countPeriods(r.from, r.to, gran) ?? 99) > 14) {
      const ok = (['jour', 'semaine', 'mois'] as ApproGran[]).find(
        (g) => (countPeriods(r.from, r.to, g) ?? 99) <= 14
      )
      if (ok) setGran(ok)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, today])

  const url = overCap
    ? null
    : `${route('material.plan')}?from=${range.from}&to=${range.to}&gran=${gran}`
  const { data, loading, error } = useTimedFetch<ApproPayload>(url)

  const rows = useMemo(() => {
    if (!data) return []
    const q = fold(query.trim())
    const out = data.rows.filter((r) => {
      if (supply !== 'TOUS' && r.supplyType !== supply) return false
      if (manquesOnly && resteTotal(r) <= 0) return false
      if (q && !fold(`${r.article} ${r.description}`).includes(q)) return false
      return true
    })
    out.sort((a, b) =>
      sort === 'article'
        ? a.article.localeCompare(b.article)
        : cranTotal(b, cran) - cranTotal(a, cran)
    )
    return out
  }, [data, query, supply, manquesOnly, sort, cran])

  const granAllowed = (g: ApproGran): boolean => (countPeriods(range.from, range.to, g) ?? 99) <= 14

  return (
    <AppLayout active="approvisionnement" subtitle="Approvisionnement">
      <div className="flex flex-col gap-3 px-7 py-4">
        {/* En-tête — mentions explicites non négociables (D1, §6.2). */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-[18px] font-bold">Plan d&apos;approvisionnement</h1>
          <span className="text-[12px] text-muted-foreground">
            Besoins datés à la date de demande client — sans décalage de délai.
          </span>
        </div>
        <p className="max-w-4xl text-[12px] leading-snug text-muted-foreground">
          Voici mon besoin (brut − stock, puis reste après en-cours), pas encore « ce qu&apos;il
          faut commander » : ni commandes d&apos;achat en cours, ni OF lancés déduits. Le stock
          couvre le <strong>ferme en priorité</strong> — lecture différente de /charge, qui nette en
          FIFO global.
        </p>
        {/* Toolbar : fenêtre, maille contrainte, cran, recherche, filtres. */}
        <ToolbarRow>
          <Segment>
            {PRESETS.map((p) => (
              <SegmentButton key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>
                {p.label}
              </SegmentButton>
            ))}
          </Segment>
          {preset === 'libre' && (
            <span className="flex items-center gap-1 text-[12px]">
              <input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="rounded-md border border-rule bg-card px-2 py-1"
              />
              <span className="text-muted-foreground">→</span>
              <input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="rounded-md border border-rule bg-card px-2 py-1"
              />
            </span>
          )}
          <Segment>
            {GRANS.map((g) => {
              const ok = granAllowed(g.id)
              return (
                <span
                  key={g.id}
                  title={
                    ok
                      ? undefined
                      : 'Hors plafond 14 périodes à cette fenêtre — élargissez la maille'
                  }
                >
                  <SegmentButton active={gran === g.id} onClick={() => ok && setGran(g.id)}>
                    {g.label}
                  </SegmentButton>
                </span>
              )
            })}
          </Segment>
          <ToolbarSpacer />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Article, désignation…"
            aria-label="Rechercher un composant"
            className="w-56 rounded-md border border-rule bg-card px-2 py-1 text-[12px]"
          />
        </ToolbarRow>

        <ToolbarRow>
          <Segment>
            {CRANS.map((c) => (
              <span key={c.id} title={c.hint}>
                <SegmentButton active={cran === c.id} onClick={() => setCran(c.id)}>
                  {c.label}
                </SegmentButton>
              </span>
            ))}
          </Segment>
          <Segment>
            {(['TOUS', 'ACHAT', 'FABRICATION'] as SupplyFilter[]).map((s) => (
              <SegmentButton key={s} active={supply === s} onClick={() => setSupply(s)}>
                {s === 'TOUS' ? 'Tous' : s === 'ACHAT' ? 'Achetés' : 'Fabriqués'}
              </SegmentButton>
            ))}
          </Segment>
          <Segment>
            <SegmentButton active={manquesOnly} onClick={() => setManquesOnly((v) => !v)}>
              Manques seuls
            </SegmentButton>
          </Segment>
          <Segment>
            <SegmentButton active={sort === 'net'} onClick={() => setSort('net')}>
              Tri net ↓
            </SegmentButton>
            <SegmentButton active={sort === 'article'} onClick={() => setSort('article')}>
              Tri A→Z
            </SegmentButton>
          </Segment>
        </ToolbarRow>

        {/* Bannières : erreur X3, troncature, plafond. */}
        {data?.x3Error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            <TriangleAlert size={15} /> Données partiellement indisponibles : {data.x3Error}
          </div>
        )}
        {data && data.truncated > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
            <TriangleAlert size={15} /> {data.truncated} branche(s) coupée(s) par le plafond de
            profondeur — les lignes marquées ⚠ ont une descendance incomplète.
          </div>
        )}
        {overCap && (
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] text-muted-foreground">
            <CircleX size={15} /> Fenêtre trop large pour cette maille (plafond 14 périodes) —
            choisissez une maille plus large.
          </div>
        )}

        {/* Table : lignes = composants, colonnes = périodes × (Ferme | Prév.). */}
        {loading && !data ? (
          <LoadingState title="Calcul du plan…" description="Explosion nomenclature + netting" />
        ) : error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-6 text-[13px] text-destructive">
            <CircleX size={18} /> {error.message}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border px-3 py-6 text-[13px] text-muted-foreground">
            <Inbox size={18} /> Aucun besoin sur cette fenêtre (ou filtré).
          </div>
        ) : (
          data && (
            <div className="overflow-auto rounded-lg border">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="bg-muted/60">
                    <th
                      rowSpan={2}
                      className="sticky left-0 bg-muted px-2 py-1.5 text-left font-semibold"
                    >
                      Composant
                    </th>
                    <th rowSpan={2} className="px-2 py-1.5 text-left font-semibold">
                      Désignation
                    </th>
                    <th rowSpan={2} className="px-2 py-1.5 text-left font-semibold">
                      Type
                    </th>
                    <th
                      rowSpan={2}
                      className="px-2 py-1.5 text-right font-semibold"
                      title="Stock strict + CQ à maintenant"
                    >
                      Stock
                    </th>
                    <th rowSpan={2} className="px-2 py-1.5 text-right font-semibold">
                      Total {cran}
                    </th>
                    {data.buckets.map((b) => (
                      <th
                        key={b.key}
                        colSpan={2}
                        className="border-l px-2 py-1.5 text-center font-semibold"
                      >
                        {b.label}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-muted/60">
                    {data.buckets.map((b) => (
                      <Fragment key={b.key}>
                        <th className="border-l px-2 py-1 font-medium">Ferme</th>
                        <th className="px-2 py-1 font-medium text-muted-foreground">Prév.</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.article}
                      onClick={() => setSelected(r.article)}
                      className="cursor-pointer border-t hover:bg-muted/40"
                      title="Voir l'origine du besoin (appelé par)"
                    >
                      <td className="sticky left-0 bg-card px-2 py-1 font-mono font-semibold">
                        {r.article}
                        {r.tronque && (
                          <span title="Descendance incomplète (plafond de profondeur)"> ⚠</span>
                        )}
                      </td>
                      <td
                        className="max-w-56 truncate px-2 py-1 text-muted-foreground"
                        title={r.description}
                      >
                        {r.description}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {r.supplyType === 'ACHAT' ? 'Acheté' : 'Fabriqué'}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{fmtQty(r.stock)}</td>
                      <td className="px-2 py-1 text-right font-mono font-bold">
                        {fmtQty(cranTotal(r, cran))}
                      </td>
                      {data.buckets.map((b, i) => {
                        const f = cranOf(r, cran, i, true)
                        const p = cranOf(r, cran, i, false)
                        return (
                          <Fragment key={b.key}>
                            <td
                              className={cn(
                                'border-l px-2 py-1 text-right font-mono',
                                f === 0 && 'text-muted-foreground/50'
                              )}
                            >
                              {f === 0 ? '—' : fmtQty(f)}
                            </td>
                            <td
                              className={cn(
                                'px-2 py-1 text-right font-mono text-muted-foreground',
                                p === 0 && 'text-muted-foreground/50'
                              )}
                            >
                              {p === 0 ? '—' : fmtQty(p)}
                            </td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        {/* Drill-down « appelé par » — rejoué depuis le snapshot pinné. */}
        <ApproDetailSheet
          article={selected}
          version={data?.version ?? null}
          from={range.from}
          to={range.to}
          onClose={() => setSelected(null)}
        />
      </div>
    </AppLayout>
  )
}

function ApproDetailSheet(props: {
  article: string | null
  version: string | null
  from: string
  to: string
  onClose: () => void
}) {
  const url =
    props.article && props.version
      ? `${route('material.detail')}?v=${encodeURIComponent(props.version)}&article=${encodeURIComponent(props.article)}&from=${props.from}&to=${props.to}`
      : null
  const { data, loading, error } = useTimedFetch<ApproDetail>(url)

  return (
    <Sheet open={props.article !== null} onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent
        side="bottom"
        className="flex w-full flex-col gap-0 rounded-t-[16px] p-0 data-[side=bottom]:mx-0 data-[side=bottom]:h-[78vh] data-[side=bottom]:max-w-none"
      >
        {loading ? (
          <LoadingState
            title="Origine du besoin…"
            description="Rejoué depuis le snapshot de la grille"
          />
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-destructive">
            <CircleX size={26} strokeWidth={1.75} />
            <span className="text-sm font-medium">{error.message}</span>
          </div>
        ) : !data ? null : (
          <>
            <div className="flex flex-none flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-secondary px-5 py-2.5 pr-14">
              <span className="font-mono text-[13px] font-bold text-foreground">
                {data.article}
              </span>
              <SheetTitle className="text-[13px] font-medium text-muted-foreground">
                Appelé par — {data.lignes.length} origine(s)
              </SheetTitle>
            </div>
            <div className="flex-1 overflow-auto px-5 py-3">
              {data.lignes.length === 0 ? (
                <div className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground">
                  <Inbox size={18} /> Aucune origine sur cette fenêtre.
                </div>
              ) : (
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Commande</th>
                      <th className="px-2 py-1 font-medium">Client</th>
                      <th className="px-2 py-1 font-medium">Produit fini</th>
                      <th className="px-2 py-1 font-medium">Nature</th>
                      <th className="px-2 py-1 text-right font-medium">Qté appelée</th>
                      <th className="px-2 py-1 font-medium">Chaîne BOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lignes.map((l, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 font-mono">
                          {l.numCommande ?? '—'}
                          {l.ligne ? ` · L${l.ligne}` : ''}
                        </td>
                        <td className="px-2 py-1">{l.client || '—'}</td>
                        <td className="px-2 py-1 font-mono">{l.pfArticle}</td>
                        <td className="px-2 py-1">
                          {l.nature === 'ferme' ? (
                            'Ferme'
                          ) : (
                            <span className="text-muted-foreground">Prévision</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right font-mono font-semibold">
                          {fmtQty(l.quantite)}
                        </td>
                        <td
                          className="max-w-80 truncate px-2 py-1 font-mono text-[11px] text-muted-foreground"
                          title={l.path.join(' › ')}
                        >
                          {l.path.length > 0 ? l.path.join(' › ') : 'direct'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
