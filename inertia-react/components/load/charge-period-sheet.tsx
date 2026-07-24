import { useEffect, useMemo, useState } from 'react'
import { CircleX, RefreshCw, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@r/components/ui/combobox'
import { route } from '@/lib/routes'
import type { LoadPeriod, LoadView } from '@/lib/load/types'
import { type Gran, segKeys, segLabel } from '@/lib/load/chart-math'

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

type SegField = keyof LoadPeriod

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
  parent: string | null
  pfArticle: string
  numCommande: string | null
  ligne: string | null
  client: string | null
  dateIso: string
  field: SegField
  brutQty: number
  netQty: number
  brutHours: number
  netHours: number
}

interface DetailPayload {
  view: LoadView
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
  view: LoadView
  /** Ancrage d'horizon de la page — le détail doit viser la même fenêtre. */
  start?: string
  /** Segments actifs (ids d'option), miroir du filtre de la toolbar. */
  activeSegs: ReadonlySet<string>
  /** Bascule brut/net de la vue commande. */
  net: boolean
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
  const { target, view, start, activeSegs, net } = props
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

  const cmdHours = (r: DetailCmdRow) => (net ? r.netHours : r.brutHours)

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
      for (const r of data.cmdRows) if (keep.has(r.field)) push(r.article, r.designation, cmdHours(r))
    }
    return [...agg.values()].sort((a, b) => b.hours - a.hours)
  }, [data, keep, net])

  const filteredOptions = useMemo(() => {
    const q = articleQuery.trim().toLowerCase()
    if (!q) return articleOptions
    return articleOptions.filter((o) =>
      `${o.code} ${o.designation ?? ''}`.toLowerCase().includes(q)
    )
  }, [articleOptions, articleQuery])

  const articleActive = articleFilter !== null
  const matchesArticle = (article: string) => !articleActive || article === articleFilter

  const ofGroups = useMemo(() => {
    if (data?.view !== 'of') return []
    return groupByDay(
      data.ofRows.filter((r) => keep.has(r.field) && matchesArticle(r.article)),
      (r) => r.dateIso,
      (r) => r.field,
      (r) => r.hours
    )
  }, [data, keep, articleFilter])

  const cmdGroups = useMemo(() => {
    if (data?.view !== 'commande') return []
    return groupByDay(
      data.cmdRows.filter((r) => keep.has(r.field) && matchesArticle(r.article)),
      (r) => r.dateIso,
      (r) => r.field,
      cmdHours
    )
  }, [data, keep, net, articleFilter])

  const groups = view === 'of' ? ofGroups : cmdGroups
  const totalHours = useMemo(() => groups.reduce((a, g) => a + g.hours, 0), [groups])
  const rowCount = useMemo(() => groups.reduce((a, g) => a + g.rows.length, 0), [groups])
  // Référence de la barre de contribution : le jour le plus chargé (pas le
  // premier, puisque les groupes sont désormais triés par date et non par poids).
  const maxGroupHours = useMemo(
    () => groups.reduce((m, g) => Math.max(m, g.hours), 0),
    [groups]
  )

  // Part de la période tirée par des prévisions plutôt que par des commandes
  // fermes : c'est la charge la moins sûre, elle mérite d'être chiffrée avant
  // qu'on décide quoi que ce soit sur ce poste.
  const forecastHours = useMemo(() => {
    if (data?.view !== 'commande') return 0
    return cmdGroups.reduce(
      (a, g) => a + g.rows.reduce((b, r) => b + (isForecastPulled(r.field) ? cmdHours(r) : 0), 0),
      0
    )
  }, [data, cmdGroups, net])

  // Grille UNIQUE (en-tête + lignes + total dans le même conteneur) : l'alignement
  // est structurel. Deux grilles distinctes se dimensionnaient indépendamment et
  // décalaient les en-têtes des cellules.
  // La DATE ne figure pas dans les colonnes : elle est portée une seule fois
  // par l'en-tête de jour. Les lignes n'affichent que ce qui les distingue au
  // sein de ce jour.
  const cols =
    view === 'of' ? '9rem 1.6fr 10rem 7rem 7rem' : '9rem 1.6fr 8rem 9rem 1fr 7rem 7rem'

  const heads =
    view === 'of'
      ? ['Article', 'Désignation', 'Ordre', 'Qté', 'Heures']
      : ['Article', 'Désignation', 'Via', 'Commande', 'Client', 'Qté', 'Heures']

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
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
            <RefreshCw size={26} strokeWidth={1.75} className="animate-spin" />
            <span className="text-sm">Chargement…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-destructive">
            <CircleX size={26} strokeWidth={1.75} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : !data ? null : (
          <>
            {/* Bandeau d'identité : poste, période, total. Une seule famille
                typographique par rôle (mono = identifiants/chiffres). */}
            <div className="flex flex-none flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-secondary px-5 py-2.5 pr-14">
              <span className="font-mono text-[13px] font-bold text-foreground">
                {data.poste.code}
              </span>
              <SheetTitle className="text-[13px] font-medium text-muted-foreground">
                {data.poste.label}
              </SheetTitle>
              <span className="font-mono text-[11px] font-semibold text-brand">
                {data.bucket.label}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {fmtDateFr(data.bucket.fromIso)} → {fmtDateFr(data.bucket.toIso)}
              </span>
              <span className="flex-1" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {groups.length} jour{groups.length > 1 ? 's' : ''} · {rowCount}{' '}
                {view === 'of' ? 'ordres' : 'besoins'}
              </span>
              <span className="font-mono text-[15px] font-bold tabular-nums text-foreground">
                {fmtH(totalHours)} h
              </span>
              {/* Un total filtré n'est plus la hauteur de la barre : le dire,
                  sinon le chiffre semble contredire le graphe. */}
              {articleActive && (
                <span className="font-mono text-[10px] font-semibold text-brand">filtré</span>
              )}
              {view === 'commande' && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {net ? 'net' : 'brut'}
                </span>
              )}
              {view === 'commande' && forecastHours > 0 && (
                <span
                  className="inline-flex items-baseline gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold"
                  style={{
                    color: 'var(--color-suggere)',
                    borderColor: 'color-mix(in srgb, var(--color-suggere) 45%, transparent)',
                    background: 'color-mix(in srgb, var(--color-suggere) 10%, transparent)',
                  }}
                  title="Charge tirée par des prévisions et non par des commandes fermes — la moins sûre de la période"
                >
                  dont {fmtH(forecastHours)} h de prévision
                  <span className="opacity-70">
                    ({Math.round((forecastHours / totalHours) * 100)}%)
                  </span>
                </span>
              )}
            </div>

            {data.x3Error && (
              <div className="flex flex-none items-start gap-2 border-b border-brand/30 bg-brand-soft px-5 py-2 text-[12px]">
                <TriangleAlert size={16} strokeWidth={1.75} className="mt-px text-brand" />
                <span className="flex-none font-bold">Chargement partiel :</span>
                <span className="break-all font-mono">{data.x3Error}</span>
              </div>
            )}

            {/* Filtre article — inutile quand la période ne contient qu'un
                article : un sélecteur à un seul choix n'est que du bruit. */}
            {articleOptions.length > 1 && (
              <div className="flex flex-none items-center gap-2 border-b border-rule px-5 py-1.5">
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  Article
                </span>
                <div ref={anchorRef} className="w-[320px]">
                  <Combobox
                    value={articleFilter}
                    onValueChange={(v) => setArticleFilter(v == null ? null : String(v))}
                    onInputValueChange={(v) => setArticleQuery(v)}
                  >
                    {/* Le cadre noir à angles vifs vient de `styles/app.css` :
                        `@layer base { * { @apply outline-ring/50 } }` repeint
                        l'outline de focus du navigateur en `--ring` (#222222)
                        sur TOUS les éléments. C'est une règle globale : aucune
                        classe utilitaire posée ici ne la neutralise de façon
                        fiable, d'où le style inline sur l'input — il gagne
                        contre tout. `style` traverse ComboboxInput jusqu'à
                        l'élément input ; `className`, lui, s'arrête sur
                        l'InputGroup qui l'enveloppe.
                        Reste un seul repère de focus : la bordure en brand. */}
                    <ComboboxInput
                      placeholder="Tous les articles — code ou désignation…"
                      style={{ outline: 'none', boxShadow: 'none' }}
                      className="w-full border-rule has-[[data-slot=input-group-control]:focus-visible]:border-brand has-[[data-slot=input-group-control]:focus-visible]:ring-0!"
                    />
                    {/* Au-dessus du panneau qui le contient (z-60), sous les
                        dialogs (z-65). Sans ça, la liste s'ouvre DERRIÈRE le
                        sheet : le défaut z-50 des popovers les place
                        délibérément sous les sheets. */}
                    <ComboboxContent anchor={anchorRef} layerClassName="z-[62]">
                      <ComboboxList>
                        <ComboboxItem value={null}>
                          <span className="text-[12px] font-semibold">Tous les articles</span>
                          <span className="text-muted-foreground text-[11px]">
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
                              <span className="font-mono text-[12px] font-semibold">{o.code}</span>
                              <span className="min-w-0 flex-1 truncate text-muted-foreground text-[11px]">
                                {o.designation || '—'}
                              </span>
                              {/* Le poids oriente le choix sans avoir à filtrer
                                  pour le découvrir. */}
                              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
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
                  <button
                    type="button"
                    onClick={() => {
                      setArticleFilter(null)
                      setArticleQuery('')
                    }}
                    className="font-mono text-[10px] font-semibold text-brand hover:underline"
                  >
                    Tout afficher
                  </button>
                )}
              </div>
            )}

            {rowCount === 0 ? (
              <div className="flex flex-1 items-center justify-center p-10 font-fraunces text-[13px] italic text-muted-foreground">
                {articleActive
                  ? `Aucune charge pour ${articleFilter} sur cette période.`
                  : 'Aucune charge sur cette période avec le filtre actif.'}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="grid items-center" style={{ gridTemplateColumns: cols }}>
                  {/* En-tête — cellules de la MÊME grille que les lignes. */}
                  {heads.map((h, i) => (
                    <div
                      key={`h-${i}`}
                      className={cn(
                        'sticky top-0 z-10 border-b border-border bg-secondary py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground',
                        i === 0 && 'pl-5',
                        i === heads.length - 1 && 'pr-5',
                        // Qté et Heures alignées à droite comme leurs valeurs.
                        (h === 'Qté' || h === 'Heures') && 'text-right'
                      )}
                    >
                      {h}
                    </div>
                  ))}

                  {groups.map((g) => (
                    <DayBlock
                      key={g.dateIso}
                      group={g}
                      view={view}
                      net={net}
                      maxHours={maxGroupHours}
                      totalHours={totalHours}
                    />
                  ))}

                  {/* Total en pied : le chiffre du bandeau se revérifie ici,
                      au bout de la colonne Heures. */}
                  <div
                    className="sticky bottom-0 col-span-full grid items-center border-t border-border bg-secondary py-1.5"
                    style={{ gridTemplateColumns: cols }}
                  >
                    <div className="pl-5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Total période
                    </div>
                    {/* Colonnes intermédiaires vides : le total se lit au bout
                        de la colonne Heures, pas ailleurs. */}
                    {Array.from({ length: heads.length - 3 }, (_, i) => (
                      <div key={`sp-${i}`} />
                    ))}
                    <div className="text-right font-mono text-[10px] text-muted-foreground">
                      {rowCount} lig.
                    </div>
                    <div className="pr-5 text-right font-mono text-[13px] font-bold tabular-nums text-foreground">
                      {fmtH(totalHours)}
                    </div>
                  </div>
                </div>
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
  view: LoadView
  net: boolean
  maxHours: number
  totalHours: number
}) {
  const { group: g, view, net, maxHours, totalHours } = props
  const share = totalHours > 0 ? (g.hours / totalHours) * 100 : 0
  const barPct = maxHours > 0 ? (g.hours / maxHours) * 100 : 0
  const dayForecastHours =
    view === 'commande'
      ? g.rows.reduce((a, r) => {
          if (!isForecastPulled(r.field)) return a
          const c = r as DetailCmdRow
          return a + (net ? c.netHours : c.brutHours)
        }, 0)
      : 0

  return (
    <>
      {/* En-tête de jour — pleine largeur, alignée sur la grille parente. */}
      <div className="col-span-full mt-1 flex items-baseline gap-2.5 border-y border-rule-soft bg-card/60 px-5 py-1.5">
        {g.fields.map((f) => (
          <i
            key={f}
            className="size-2 flex-none translate-y-px rounded-[2px]"
            style={{ background: SEG_COLOR[f] }}
            title={segLabel(view, f as SegField)}
          />
        ))}
        <span className="font-mono text-[10px] uppercase text-muted-foreground">
          {weekdayOf(g.dateIso)}
        </span>
        <span className="font-mono text-[12px] font-bold tabular-nums text-foreground">
          {fmtDateFr(g.dateIso)}
        </span>
        <span className="flex-1" />
        {/* Part du jour tirée par des prévisions — affichée seulement si le
            jour en contient, et seulement en vue commande où l'information
            existe réellement. */}
        {view === 'commande' && dayForecastHours > 0 && (
          <span
            className="flex-none font-mono text-[10px] font-semibold"
            style={{ color: 'var(--color-suggere)' }}
            title="Part de la charge du jour tirée par des prévisions"
          >
            dont {fmtH(dayForecastHours)} h prév.
          </span>
        )}
        <span className="flex-none font-mono text-[10px] text-muted-foreground">
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
          <span className="w-9 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
            {Math.round(share)}%
          </span>
          <span className="w-14 text-right font-mono text-[13px] font-bold tabular-nums text-foreground">
            {fmtH(g.hours)}
          </span>
        </span>
      </div>

      {g.rows.map((r, i) =>
        view === 'of' ? (
          <OfRow key={`${(r as DetailOfRow).numOf}-${i}`} row={r as DetailOfRow} />
        ) : (
          <CmdRow
            key={`${(r as DetailCmdRow).numCommande ?? ''}-${(r as DetailCmdRow).ligne ?? ''}-${(r as DetailCmdRow).article}-${i}`}
            row={r as DetailCmdRow}
            net={net}
          />
        )
      )}
    </>
  )
}

const CELL = 'border-b border-rule-soft/60 py-[5px] text-[11px]'

function OfRow({ row: r }: { row: DetailOfRow }) {
  return (
    <>
      <div className={cn(CELL, 'truncate pl-5 font-mono text-[11px] font-bold text-foreground')}>
        {r.article}
      </div>
      <div className={cn(CELL, 'truncate text-muted-foreground')}>{r.designation || '—'}</div>
      {/* Identifiant technique : lisible mais discret. Sur un OF suggéré il n'a
          aucune valeur de lecture — il ne doit pas capter le regard avant
          l'article et les heures. */}
      <div className={cn(CELL, 'font-mono text-[10px] text-muted-foreground')}>{r.numOf}</div>
      <div className={cn(CELL, 'text-right font-mono tabular-nums text-secondary-foreground')}>
        {fmtQ(r.quantite)}
      </div>
      <div className={cn(CELL, 'pr-5 text-right font-mono tabular-nums text-foreground')}>
        {fmtH(r.hours)}
      </div>
    </>
  )
}

function CmdRow({ row: r, net }: { row: DetailCmdRow; net: boolean }) {
  const forecast = isForecastPulled(r.field)
  return (
    <>
      {/* Liseré sur toute la ligne : une charge tirée par une prévision se
          repère au balayage, sans lire la colonne Client. */}
      <div
        className={cn(CELL, 'truncate pl-5 font-mono text-[11px] font-bold text-foreground')}
        style={
          forecast
            ? { borderLeft: '2px solid var(--color-suggere)', paddingLeft: 'calc(1.25rem - 2px)' }
            : undefined
        }
      >
        {r.article}
        {/* Marqueur de niveau BOM : un induit ne se lit pas comme un PF. */}
        {r.depth > 0 && (
          <span
            className="ml-1 font-mono text-[9px] font-normal text-muted-foreground"
            title={`Composant induit, niveau ${r.depth}`}
          >
            N-{r.depth}
          </span>
        )}
      </div>
      <div className={cn(CELL, 'truncate text-muted-foreground')}>
        {forecast && (
          <span
            className="mr-1.5 rounded-sm px-1 py-px font-mono text-[9px] font-bold uppercase tracking-wider"
            style={{
              color: 'var(--color-suggere)',
              background: 'color-mix(in srgb, var(--color-suggere) 14%, transparent)',
            }}
            title={
              r.depth === 0
                ? 'Produit fini tiré par une prévision client, pas par une commande ferme'
                : "Composant induit par un produit fini lui-même tiré par une prévision"
            }
          >
            prév.
          </span>
        )}
        {r.designation || '—'}
      </div>
      {/* Chemin BOM : par quel parent ce besoin arrive (vide sur un PF). */}
      <div className={cn(CELL, 'truncate font-mono text-[10px] text-muted-foreground')}>
        {r.depth === 0 ? '' : `via ${r.parent ?? '?'}`}
      </div>
      <div className={cn(CELL, 'font-mono text-[10px] text-secondary-foreground')}>
        {r.numCommande ?? '—'}
        {r.ligne && <span className="text-muted-foreground">/{r.ligne}</span>}
      </div>
      {/* Le badge « prév. » porte déjà la nature : ici on ne dit plus que
          l'absence de client, qui sur une prévision est structurelle. */}
      <div className={cn(CELL, 'truncate text-muted-foreground')}>
        {r.client ?? (forecast ? <span className="italic">sans client</span> : '—')}
      </div>
      <div className={cn(CELL, 'text-right font-mono tabular-nums text-secondary-foreground')}>
        {fmtQ(net ? r.netQty : r.brutQty)}
      </div>
      <div className={cn(CELL, 'pr-5 text-right font-mono tabular-nums text-foreground')}>
        {fmtH(net ? r.netHours : r.brutHours)}
      </div>
    </>
  )
}
