import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleX, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { X3Link } from '@r/components/x3-link'
import { Badge } from '@r/components/ui/badge'
import { Pill } from '@r/components/ui/pill'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { LoadingState } from '@r/components/ui/loading-state'
import {
  CellNumber,
  CellStack,
  TableCell,
  TableHead,
  TableHeadRow,
  TableRow,
} from '@r/components/ui/table-row'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@r/components/ui/combobox'
import { route } from '@r/lib/routes'
import type { ChargePeriod, ChargeQtyMode, ChargeView } from '@r/lib/charge/types'
import { type Gran, segKeys, segLabel } from '@r/lib/charge/chart-math'

/**
 * Détail d'une période de charge — ce qui compose UNE barre du graphe /charge.
 *
 * Alimenté par GET /api/v1/planning/charge/detail, qui repart des mêmes entrées
 * que l'agrégat et filtre sur (poste, bucket) au lieu de sommer.
 *
 * Le filtre statut/nature et la bascule brut/net sont appliqués ICI, avec le
 * jeu de segments que la page applique déjà au graphe : le total de la table
 * suit donc la hauteur de la barre par construction, sans re-fetch quand
 * l'utilisateur change de filtre.
 *
 * Mise en page (v2, après revue du rendu) : les lignes sont GROUPÉES PAR
 * ARTICLE. Une période contient typiquement le même article relancé sur
 * plusieurs dates — 12 lignes jumelles n'apportent rien, un groupe « article =
 * n ordres = m heures » avec ses dates en sous-lignes se lit d'un coup d'œil.
 */

type SegField = keyof ChargePeriod

interface DetailOfRow {
  numOf: string
  article: string
  designation: string | null
  statutLabel: string | null
  quantite: number
  dateIso: string
  field: 'f' | 'p' | 's'
  hours: number
}

interface DetailCmdRow {
  article: string
  designation: string | null
  depth: number
  /** Chaîne BOM du produit fini au parent immédiat — vide au depth 0. */
  path: string[]
  pfArticle: string
  numCommande: string | null
  ligne: string | null
  client: string | null
  dateIso: string
  field: SegField
  brutQty: number
  netQty: number
  resteQty: number
  encoursQty: number
  brutHours: number
  netHours: number
  resteHours: number
}

interface DetailPayload {
  view: ChargeView
  poste: { code: string; label: string }
  bucket: { key: string; gran: Gran; label: string; fromIso: string; toIso: string }
  ofRows: DetailOfRow[]
  cmdRows: DetailCmdRow[]
  x3Error: string | null
}

export interface ChargePeriodSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Poste + période demandés (null = rien à charger). */
  target: { poste: string; bucketKey: string; gran: Gran; periodLabel: string } | null
  view: ChargeView
  /** Ancrage d'horizon de la page — le détail doit viser la même fenêtre. */
  start?: string
  /** Segments actifs (ids d'option), miroir du filtre de la toolbar. */
  activeSegs: ReadonlySet<string>
  /** Cran de quantité de la vue commande (brut / net / reste à produire). */
  qtyMode: ChargeQtyMode
}

/** ISO YYYY-MM-DD → JJ/MM/AAAA (jamais d'ISO brut à l'écran). */
const fmtDateFr = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

const fmtH = (h: number) => (Math.round(h * 10) / 10).toFixed(1).replace('.', ',')
const fmtQ = (q: number) => Math.round(q).toLocaleString('fr-FR')

/**
 * Ligne tirée par une PRÉVISION client (et non par une commande ferme).
 *
 * Exact, pas déduit : la nature vient de `ORDERS.WIPSTA` (3 = prévision) sur la
 * ligne de demande, et l'explosion de nomenclature la propage telle quelle aux
 * composants induits — un sous-ensemble fabriqué pour une prévision reste tiré
 * par une prévision. `s` = produit fini prévisionnel, `si` = son induit.
 *
 * N'a de sens QUE en vue commande : en vue OF, `s` désigne le statut « suggéré »
 * de l'ordre, qui ne dit rien de la nature de la demande qui le tire.
 */
const isForecastPulled = (field: string): boolean => field === 's' || field === 'si'

/** Couleur de segment, alignée sur le graphe. */
const SEG_COLOR: Record<string, string> = {
  f: 'var(--color-ferme)',
  p: 'var(--color-planifie)',
  s: 'var(--color-suggere)',
  fi: 'var(--color-ferme)',
  si: 'var(--color-suggere)',
}

/**
 * Groupe = un JOUR. L'axe de lecture d'un plan de charge est le temps : à
 * l'intérieur d'un mois ou d'une semaine, on veut voir la séquence des dates,
 * pas un palmarès d'articles. Les articles vivent dans les lignes du jour.
 */
interface Group<R> {
  dateIso: string
  hours: number
  rows: R[]
  /** Segments présents ce jour-là (pastilles d'en-tête). */
  fields: string[]
}

/**
 * Colonnes de la table.
 *
 * Code et désignation tiennent dans UNE cellule (`CellStack`) : c'est la
 * grammaire canonique d'une identité — un code en chasse fixe qui ne se tronque
 * jamais, un libellé qui se tronque toujours. En deux colonnes, le navigateur
 * coupait où il pouvait, c'est-à-dire dans le code. Idem pour Commande/Client
 * en vue commande : la vue passe ainsi de sept colonnes à cinq.
 *
 * La DATE ne figure pas dans les colonnes : elle est portée une seule fois par
 * l'en-tête de jour. `table-fixed` + largeurs en pourcentage : c'est ce qui rend
 * la troncature possible et l'alignement structurel, comme l'était la grille
 * unique qu'elles remplacent.
 */
interface SheetCol {
  label: string
  width: string
  right?: boolean
}

const OF_COLS: SheetCol[] = [
  { label: 'Article', width: '36%' },
  { label: 'Ordre', width: '24%' },
  { label: 'Qté', width: '20%', right: true },
  { label: 'Heures', width: '20%', right: true },
]

/** Cellule du pied de table — opaque, sinon la rangée collante est traversée. */
const FOOT_CELL =
  'border-t border-rule bg-secondary py-2! font-mono text-2xs tabular-nums text-muted-foreground'

const CMD_COLS: SheetCol[] = [
  { label: 'Article', width: '26%' },
  { label: 'Via', width: '22%' },
  { label: 'Commande', width: '24%' },
  { label: 'Qté', width: '14%', right: true },
  { label: 'Heures', width: '14%', right: true },
]

function groupByDay<R>(
  rows: R[],
  dateOf: (r: R) => string,
  fieldOf: (r: R) => string,
  hours: (r: R) => number
): Group<R>[] {
  const map = new Map<string, Group<R>>()
  for (const r of rows) {
    const k = dateOf(r)
    let g = map.get(k)
    if (!g) {
      g = { dateIso: k, hours: 0, rows: [], fields: [] }
      map.set(k, g)
    }
    g.hours += hours(r)
    g.rows.push(r)
    const f = fieldOf(r)
    if (!g.fields.includes(f)) g.fields.push(f)
  }
  const out = [...map.values()]
  // Dans un jour, le plus lourd d'abord : ce qui fait la charge du jour.
  for (const g of out) g.rows.sort((a, b) => hours(b) - hours(a))
  // Chronologie stricte, du plus tôt au plus tard.
  return out.sort((a, b) => a.dateIso.localeCompare(b.dateIso))
}

export function ChargePeriodSheet(props: ChargePeriodSheetProps) {
  const { target, view, start, activeSegs, qtyMode } = props
  const [data, setData] = useState<DetailPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const poste = target?.poste ?? null
  const bucketKey = target?.bucketKey ?? null
  const gran = target?.gran ?? null

  useEffect(() => {
    if (!props.open || !poste || !bucketKey || !gran) return
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ poste, bucket: bucketKey, gran, view })
    if (start) qs.set('start', start)
    // Relaie le `?refresh=1` de la page : sans lui le graphe se rafraîchissait
    // mais pas cette table, qui a son propre cache. Tant que l'URL porte le
    // paramètre, chaque ouverture repart de X3 — c'est coûteux, mais c'est
    // exactement ce que l'utilisateur a demandé en le mettant.
    if (new URLSearchParams(window.location.search).has('refresh')) qs.set('refresh', '1')
    fetch(`${route('charge.detail')}?${qs.toString()}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<DetailPayload>
      })
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Échec du chargement')
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [props.open, poste, bucketKey, gran, view, start])

  // Masque identique à celui du graphe — même source (`segKeys`).
  const keep = useMemo(() => segKeys(view, activeSegs), [view, activeSegs])

  // Filtre article local au panneau. `null` = tous : Base UI affiche alors le
  // placeholder. Surtout PAS de sentinelle textuelle — Base UI rend la valeur
  // brute dans le champ faute de libellé, et l'utilisateur lisait « __all__ ».
  const [articleFilter, setArticleFilter] = useState<string | null>(null)
  const [articleQuery, setArticleQuery] = useState('')
  const anchorRef = useComboboxAnchor()

  // Le filtre porte sur un bucket donné : il n'a pas de sens d'un bucket à
  // l'autre, on le remet à zéro dès que la cible ou la vue change.
  useEffect(() => {
    setArticleFilter(null)
    setArticleQuery('')
  }, [poste, bucketKey, gran, view])

  const cmdHours = useCallback(
    (r: DetailCmdRow) =>
      qtyMode === 'reste' ? r.resteHours : qtyMode === 'net' ? r.netHours : r.brutHours,
    [qtyMode]
  )

  /**
   * Options du filtre article — construites APRÈS le masque de segments et
   * AVANT le filtre article : la liste propose donc exactement les articles
   * visibles, et ne se vide pas d'elle-même une fois une sélection faite.
   */
  const articleOptions = useMemo(() => {
    if (!data) return [] as { code: string; designation: string | null; hours: number }[]
    const agg = new Map<string, { code: string; designation: string | null; hours: number }>()
    const push = (code: string, designation: string | null, hours: number) => {
      const cur = agg.get(code)
      if (cur) {
        cur.hours += hours
        if (!cur.designation) cur.designation = designation
      } else agg.set(code, { code, designation, hours })
    }
    if (data.view === 'of') {
      for (const r of data.ofRows) if (keep.has(r.field)) push(r.article, r.designation, r.hours)
    } else {
      for (const r of data.cmdRows)
        if (keep.has(r.field)) push(r.article, r.designation, cmdHours(r))
    }
    return [...agg.values()].sort((a, b) => b.hours - a.hours)
  }, [data, keep, cmdHours])

  const filteredOptions = useMemo(() => {
    const q = articleQuery.trim().toLowerCase()
    if (!q) return articleOptions
    return articleOptions.filter((o) =>
      `${o.code} ${o.designation ?? ''}`.toLowerCase().includes(q)
    )
  }, [articleOptions, articleQuery])

  const articleActive = articleFilter !== null
  const matchesArticle = useCallback(
    (article: string) => !articleActive || article === articleFilter,
    [articleActive, articleFilter]
  )

  const ofGroups = useMemo(() => {
    if (data?.view !== 'of') return []
    return groupByDay(
      data.ofRows.filter((r) => keep.has(r.field) && matchesArticle(r.article)),
      (r) => r.dateIso,
      (r) => r.field,
      (r) => r.hours
    )
  }, [data, keep, matchesArticle])

  const cmdGroups = useMemo(() => {
    if (data?.view !== 'commande') return []
    return groupByDay(
      data.cmdRows.filter((r) => keep.has(r.field) && matchesArticle(r.article)),
      (r) => r.dateIso,
      (r) => r.field,
      cmdHours
    )
  }, [data, keep, cmdHours, matchesArticle])

  const groups = view === 'of' ? ofGroups : cmdGroups
  const totalHours = useMemo(() => groups.reduce((a, g) => a + g.hours, 0), [groups])
  const rowCount = useMemo(() => groups.reduce((a, g) => a + g.rows.length, 0), [groups])
  // Référence de la barre de contribution : le jour le plus chargé (pas le
  // premier, puisque les groupes sont désormais triés par date et non par poids).
  const maxGroupHours = useMemo(() => groups.reduce((m, g) => Math.max(m, g.hours), 0), [groups])

  // Part de la période tirée par des prévisions plutôt que par des commandes
  // fermes : c'est la charge la moins sûre, elle mérite d'être chiffrée avant
  // qu'on décide quoi que ce soit sur ce poste.
  const forecastHours = useMemo(() => {
    if (data?.view !== 'commande') return 0
    return cmdGroups.reduce(
      (a, g) => a + g.rows.reduce((b, r) => b + (isForecastPulled(r.field) ? cmdHours(r) : 0), 0),
      0
    )
  }, [data, cmdGroups, cmdHours])

  const cols = view === 'of' ? OF_COLS : CMD_COLS

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        // Les dimensions DOIVENT être redéclarées en variantes `data-[side=bottom]:`
        // et pas en classes nues : le primitive porte `data-[side=bottom]:h-auto`
        // et `data-[side=bottom]:max-w-[640px]`, dont le sélecteur d'attribut bat
        // toute classe utilitaire quelle que soit sa position. Avec `h-auto`
        // gagnant, le panneau n'a aucune hauteur bornée : il grandit avec le
        // nombre de lignes jusqu'à recouvrir l'écran au lieu de faire défiler.
        // Même correctif que of-detail-sheet.tsx, qui avait déjà buté dessus.
        className="flex w-full flex-col gap-0 rounded-t-[16px] p-0 data-[side=bottom]:mx-0 data-[side=bottom]:h-[78vh] data-[side=bottom]:max-w-none"
      >
        {loading ? (
          <LoadingState
            variant="orb"
            title="Chargement de la période..."
            description="Récupération du détail de charge par opération"
          />
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-destructive">
            <CircleX size={26} strokeWidth={1.75} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : !data ? null : (
          <>
            {/* Bandeau d'identité : poste, période, total. Une seule famille
                typographique par rôle (mono = identifiants/chiffres), et
                l'échelle micro d'app.css plutôt que cinq corps écrits à la
                main. La marque ne peint plus le libellé de bucket : dans la
                hiérarchie chromatique elle ne signale QUE l'engagement d'un
                contrôle — ici, le drapeau « filtré ». */}
            <div className="flex flex-none flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-secondary px-4 py-2.5 pr-14">
              <span className="font-mono text-cell-lg font-bold text-foreground">
                {data.poste.code}
              </span>
              <SheetTitle className="text-xs font-medium text-muted-foreground">
                {data.poste.label}
              </SheetTitle>
              <span className="font-mono text-1.5xs font-semibold text-foreground">
                {data.bucket.label}
              </span>
              <span className="font-mono text-2xs text-muted-foreground">
                {fmtDateFr(data.bucket.fromIso)} → {fmtDateFr(data.bucket.toIso)}
              </span>
              <span className="flex-1" />
              <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                {groups.length} jour{groups.length > 1 ? 's' : ''} · {rowCount}{' '}
                {view === 'of' ? 'ordres' : 'besoins'}
              </span>
              <span className="font-mono text-cell-lg font-bold tabular-nums text-foreground">
                {fmtH(totalHours)} h
              </span>
              {/* Un total filtré n'est plus la hauteur de la barre : le dire,
                  sinon le chiffre semble contredire le graphe. */}
              {articleActive && (
                <span className="font-mono text-2xs font-semibold text-brand">filtré</span>
              )}
              {view === 'commande' && (
                <span className="font-mono text-2xs text-muted-foreground">
                  {qtyMode === 'reste' ? 'reste à produire' : qtyMode}
                </span>
              )}
              {view === 'commande' && forecastHours > 0 && (
                <Badge
                  variant="warning"
                  className="gap-1.5 font-mono text-2xs tabular-nums"
                  title="Charge tirée par des prévisions et non par des commandes fermes — la moins sûre de la période"
                >
                  dont {fmtH(forecastHours)} h de prévision
                  <span className="opacity-70">
                    ({Math.round((forecastHours / totalHours) * 100)} %)
                  </span>
                </Badge>
              )}
            </div>

            {data.x3Error && (
              <div className="flex flex-none items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-[12px]">
                <TriangleAlert size={16} strokeWidth={1.75} className="mt-px text-destructive" />
                <span className="flex-none font-bold">Chargement partiel :</span>
                <span className="break-all font-mono">{data.x3Error}</span>
              </div>
            )}

            {/* Filtre article — inutile quand la période ne contient qu'un
                article : un sélecteur à un seul choix n'est que du bruit. */}
            {articleOptions.length > 1 && (
              <div className="flex flex-none items-center gap-2 border-b border-rule px-4 py-1.5">
                <span className="font-mono text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                  Article
                </span>
                <div ref={anchorRef} className="w-[320px]">
                  <Combobox
                    value={articleFilter}
                    onValueChange={(v) => setArticleFilter(v == null ? null : String(v))}
                    onInputValueChange={(v) => setArticleQuery(v)}
                  >
                    {/* Focus standard du design system : c'est l'InputGroup qui
                        le porte. Le cadre noir venait d'un oubli dans
                        InputGroupInput, corrigé à la source. */}
                    <ComboboxInput
                      placeholder="Tous les articles — code ou désignation…"
                      className="w-full"
                    />
                    {/* Au-dessus du panneau qui le contient (z-60), sous les
                        dialogs (z-65). Sans ça, la liste s'ouvre DERRIÈRE le
                        sheet : le défaut z-50 des popovers les place
                        délibérément sous les sheets. */}
                    <ComboboxContent anchor={anchorRef} layerClassName="z-[62]">
                      <ComboboxList>
                        <ComboboxItem value={null}>
                          <span className="text-xs font-semibold">Tous les articles</span>
                          <span className="text-1.5xs text-muted-foreground">
                            {articleOptions.length}
                          </span>
                        </ComboboxItem>
                        {filteredOptions.length === 0 ? (
                          <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                            Aucun article ne correspond à « {articleQuery} ».
                          </p>
                        ) : (
                          filteredOptions.map((o) => (
                            <ComboboxItem key={o.code} value={o.code}>
                              <span className="font-mono text-xs font-semibold">{o.code}</span>
                              <span className="min-w-0 flex-1 truncate text-1.5xs text-muted-foreground">
                                {o.designation || '—'}
                              </span>
                              {/* Le poids oriente le choix sans avoir à filtrer
                                  pour le découvrir. */}
                              <span className="font-mono text-1.5xs tabular-nums text-muted-foreground">
                                {fmtH(o.hours)} h
                              </span>
                            </ComboboxItem>
                          ))
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </div>
                {articleActive && (
                  <Pill
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setArticleFilter(null)
                      setArticleQuery('')
                    }}
                  >
                    Tout afficher
                  </Pill>
                )}
              </div>
            )}

            {rowCount === 0 ? (
              <div className="flex flex-1 items-center justify-center p-10 text-center text-[13px] text-muted-foreground">
                {articleActive
                  ? `Aucune charge pour ${articleFilter} sur cette période.`
                  : 'Aucune charge sur cette période avec le filtre actif.'}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                {/* Vraie table, et non plus une grille CSS : la grammaire de
                    rangée (filet, survol, sélection, barre de gravité, paddings)
                    vit dans `ui/table-row` et dans la recette `.theme-cursor
                    table` d'app.css. Recopiée à la main, elle avait dérivé — un
                    en-tête à 9 px, des cellules à 5 px de padding, aucun des
                    deux sur un palier déclaré. */}
                <table className="w-full table-fixed">
                  <colgroup>
                    {cols.map((c) => (
                      <col key={c.label} style={{ width: c.width }} />
                    ))}
                  </colgroup>
                  <thead>
                    {/* `sticky top-0 z-10 bg-secondary` : c'est le crochet que la
                        recette cursor attend (`thead:has(tr.sticky)`) pour
                        décoller l'en-tête d'une ombre courte. Le fond est aussi
                        posé sur les `<th>` — la recette rend la RANGÉE
                        transparente en `!important`, et une rangée collante
                        transparente laisse défiler les lignes au travers. */}
                    <TableHeadRow className="sticky top-0 z-10 bg-secondary">
                      {cols.map((c) => (
                        <TableHead
                          key={c.label}
                          align={c.right ? 'right' : 'left'}
                          // `text-right` seul ne suffit pas : `.theme-cursor
                          // table th` pose `text-align: left` à une spécificité
                          // qu'une classe n'atteint pas.
                          className={cn('bg-secondary', c.right && 'text-right!')}
                        >
                          {c.label}
                        </TableHead>
                      ))}
                    </TableHeadRow>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <DayBlock
                        key={g.dateIso}
                        group={g}
                        view={view}
                        qtyMode={qtyMode}
                        maxHours={maxGroupHours}
                        totalHours={totalHours}
                        colCount={cols.length}
                      />
                    ))}
                  </tbody>
                  {/* Total en pied : le chiffre du bandeau se revérifie ici,
                      au bout de la colonne Heures. */}
                  <tfoot>
                    {/* Le fond et le filet sont posés sur les CELLULES, pas sur
                        la rangée : en `border-collapse: collapse`, une rangée
                        collante dont seul le `<tr>` est peint laisse voir les
                        lignes défiler au travers. */}
                    <tr className="sticky bottom-0">
                      <TableCell
                        colSpan={cols.length - 2}
                        className={cn(FOOT_CELL, 'font-medium uppercase tracking-wide')}
                      >
                        Total période
                      </TableCell>
                      <TableCell align="right" className={FOOT_CELL}>
                        {rowCount} lig.
                      </TableCell>
                      <TableCell align="right" className={cn(FOOT_CELL, 'text-foreground')}>
                        <CellNumber value={fmtH(totalHours)} />
                      </TableCell>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** Jour de la semaine abrégé, pour situer la date sans la décoder. */
const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const weekdayOf = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return ''
  return WEEKDAYS[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()] ?? ''
}

/**
 * Un JOUR : en-tête de date (+ poids dans la période) puis ses ordres/besoins.
 * La date n'est pas répétée sur chaque ligne — c'est l'en-tête qui la porte,
 * et la succession des en-têtes donne la chronologie de la période.
 */
function DayBlock(props: {
  group: Group<DetailOfRow | DetailCmdRow>
  view: ChargeView
  qtyMode: ChargeQtyMode
  maxHours: number
  totalHours: number
  colCount: number
}) {
  const { group: g, view, qtyMode, maxHours, totalHours, colCount } = props
  const share = totalHours > 0 ? (g.hours / totalHours) * 100 : 0
  const barPct = maxHours > 0 ? (g.hours / maxHours) * 100 : 0
  const dayForecastHours =
    view === 'commande'
      ? g.rows.reduce((a, r) => {
          if (!isForecastPulled(r.field)) return a
          const c = r as DetailCmdRow
          return (
            a + (qtyMode === 'reste' ? c.resteHours : qtyMode === 'net' ? c.netHours : c.brutHours)
          )
        }, 0)
      : 0

  return (
    <>
      {/* En-tête de jour — une rangée à cellule unique, en pleine largeur de la
          table. C'est ce qui garde l'alignement structurel maintenant que la
          grille CSS a disparu. */}
      <TableRow>
        <TableCell colSpan={colCount} className="bg-secondary/70 py-2!">
          <div className="flex items-baseline gap-2.5">
            {g.fields.map((f) => (
              <i
                key={f}
                className="size-2 flex-none translate-y-px rounded-[2px]"
                style={{ background: SEG_COLOR[f] }}
                title={segLabel(view, f as SegField)}
              />
            ))}
            <span className="font-mono text-2xs uppercase text-muted-foreground">
              {weekdayOf(g.dateIso)}
            </span>
            <span className="font-mono text-1.5xs font-bold tabular-nums text-foreground">
              {fmtDateFr(g.dateIso)}
            </span>
            <span className="flex-1" />
            {/* Part du jour tirée par des prévisions — affichée seulement si le
                jour en contient, et seulement en vue commande où l'information
                existe réellement. */}
            {view === 'commande' && dayForecastHours > 0 && (
              <span
                className="flex-none font-mono text-2xs font-semibold text-suggere"
                title="Part de la charge du jour tirée par des prévisions"
              >
                dont {fmtH(dayForecastHours)} h prév.
              </span>
            )}
            <span className="flex-none font-mono text-2xs text-muted-foreground">
              {g.rows.length} {view === 'of' ? 'ordre' : 'besoin'}
              {g.rows.length > 1 ? 's' : ''}
            </span>
            {/* Poids du jour dans la barre cliquée — la question qu'on se pose. */}
            <span className="flex flex-none items-center gap-2">
              <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-rule-soft">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-brand"
                  style={{ width: `${Math.max(2, barPct)}%` }}
                />
              </span>
              <span className="w-9 text-right font-mono text-2xs tabular-nums text-muted-foreground">
                {Math.round(share)} %
              </span>
              <CellNumber className="inline-block w-14 text-right" value={fmtH(g.hours)} />
            </span>
          </div>
        </TableCell>
      </TableRow>

      {g.rows.map((r, i) =>
        view === 'of' ? (
          <OfRow key={`${(r as DetailOfRow).numOf}-${i}`} row={r as DetailOfRow} />
        ) : (
          <CmdRow
            key={`${(r as DetailCmdRow).numCommande ?? ''}-${(r as DetailCmdRow).ligne ?? ''}-${(r as DetailCmdRow).article}-${i}`}
            row={r as DetailCmdRow}
            qtyMode={qtyMode}
          />
        )
      )}
    </>
  )
}

function OfRow({ row: r }: { row: DetailOfRow }) {
  return (
    <TableRow>
      <TableCell>
        <CellStack code={r.article} label={r.designation} labelTitle={r.designation ?? undefined} />
      </TableCell>
      {/* Identifiant technique : lisible mais discret. Sur un OF suggéré il n'a
          aucune valeur de lecture — il ne doit pas capter le regard avant
          l'article et les heures. */}
      <TableCell>
        <span className="truncate font-mono text-2xs text-muted-foreground">{r.numOf}</span>
      </TableCell>
      <TableCell align="right">
        <CellNumber emphasis="plain" value={fmtQ(r.quantite)} />
      </TableCell>
      <TableCell align="right">
        <CellNumber value={fmtH(r.hours)} />
      </TableCell>
    </TableRow>
  )
}

function CmdRow({ row: r, qtyMode }: { row: DetailCmdRow; qtyMode: ChargeQtyMode }) {
  const forecast = isForecastPulled(r.field)
  return (
    /* Une charge tirée par une prévision se repère au balayage, sans lire la
       colonne client : c'est la barre de gravité canonique de la rangée
       (`tone`), et non plus un `border-left` posé à la main sur la première
       cellule — que `border-collapse` arbitrait une fois sur deux. */
    <TableRow tone={forecast ? 'warning' : null}>
      <TableCell>
        <CellStack
          code={r.article}
          label={r.designation}
          labelTitle={r.designation ?? undefined}
          action={
            <>
              {/* Marqueur de niveau BOM : un induit ne se lit pas comme un PF. */}
              {r.depth > 0 && (
                <span
                  className="font-mono text-3xs font-normal text-muted-foreground"
                  title={`Composant induit, niveau ${r.depth}`}
                >
                  N-{r.depth}
                </span>
              )}
              {forecast && (
                <Badge
                  variant="warning"
                  className="h-4 px-1.5 font-mono text-3xs font-bold uppercase tracking-wider"
                  title={
                    r.depth === 0
                      ? 'Produit fini tiré par une prévision client, pas par une commande ferme'
                      : 'Composant induit par un produit fini lui-même tiré par une prévision'
                  }
                >
                  prév.
                </Badge>
              )}
            </>
          }
        />
      </TableCell>
      {/* Chaîne BOM lue en REMONTÉE : du parent immédiat vers le produit fini.
          `path` est stocké dans l'ordre d'ascendance (PF en tête) ; on l'inverse
          ici parce que la lecture part de l'article de la ligne et doit ABOUTIR
          au produit fini — celui-là même que porte la colonne Commande, juste à
          côté. Dans l'autre sens, les deux colonnes ne se raccordaient pas.
          Tronqué dans la cellule, chaîne entière au survol. */}
      <TableCell>
        <span
          className="block truncate font-mono text-2xs text-muted-foreground"
          title={
            r.path.length
              ? // Chaîne entière, article de la ligne inclus en tête.
                [r.article, ...[...r.path].reverse()].join(' → ')
              : undefined
          }
        >
          {r.path.length === 0 ? '—' : [...r.path].reverse().join(' → ')}
        </span>
      </TableCell>
      {/* Commande et client tiennent dans la même identité : le numéro ne se
          tronque jamais, le nom du client toujours. Le badge « prév. » porte
          déjà la nature — ici on ne dit plus que l'absence de client, qui sur
          une prévision est structurelle. */}
      <TableCell>
        <CellStack
          code={
            /* Prévision (field s/si) : pas de commande X3, pas de lien (#118). */
            !forecast && r.numCommande ? (
              <X3Link
                fonction="GESSOH"
                cle={r.numCommande}
                title={`Ouvrir la commande ${r.numCommande} dans Sage X3`}
                className="font-mono text-xs font-bold text-foreground"
              >
                {r.numCommande}
                {r.ligne ? <span className="text-muted-foreground">/{r.ligne}</span> : null}
              </X3Link>
            ) : (
              <>
                {r.numCommande ?? '—'}
                {r.ligne ? <span className="text-muted-foreground">/{r.ligne}</span> : null}
              </>
            )
          }
          label={r.client ?? (forecast ? 'sans client' : '—')}
          labelTitle={r.client ?? undefined}
        />
      </TableCell>
      {/* En cran « reste », la part absorbée par l'en-cours est annoncée À CÔTÉ du
          chiffre. Sans elle la ligne affiche une quantité plus petite que la
          commande sans dire pourquoi — un chiffre inexpliqué se lit comme un bug. */}
      <TableCell align="right">
        {qtyMode === 'reste' && r.encoursQty > 0 && (
          <span
            className="mr-1.5 font-mono text-3xs font-semibold text-muted-foreground"
            title={`${fmtQ(r.encoursQty)} déjà produites sur un OF en cours, pas encore déclarées en stock (net ${fmtQ(r.netQty)} − en-cours ${fmtQ(r.encoursQty)})`}
          >
            −{fmtQ(r.encoursQty)}
          </span>
        )}
        <CellNumber
          emphasis="plain"
          value={fmtQ(qtyMode === 'reste' ? r.resteQty : qtyMode === 'net' ? r.netQty : r.brutQty)}
        />
      </TableCell>
      <TableCell align="right">
        <CellNumber
          value={fmtH(
            qtyMode === 'reste' ? r.resteHours : qtyMode === 'net' ? r.netHours : r.brutHours
          )}
        />
      </TableCell>
    </TableRow>
  )
}
