import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleX, RefreshCw, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { LoadingState } from '@r/components/ui/loading-state'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@r/components/ui/combobox'
import { route } from '@r/lib/routes'
import type { LoadPeriod, LoadQtyMode, LoadUnit, LoadView } from '@r/lib/load/types'
import { type Gran, segKeys, segLabel } from '@r/lib/load/chart-math'

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
  /** OFs alloués à cette ligne par le moteur de matching commande→OF (suivi). */
  ofs: DetailRowOf[]
}

/**
 * Allocation OF d'une ligne — sortie de `CommandeOFMatcher` (of_conso.ts) :
 * contremarque X3 en priorité, puis couverture cumulative statut+date.
 */
interface DetailRowOf {
  numOf: string
  statutLabel: string | null
  /** Quantité DU BESOIN de la ligne allouée à cet OF. */
  quantite: number
  /** Date de fin de l'OF (ENDDAT). */
  dateIso: string | null
  /** Raison de match reprise telle quelle du moteur ('contremarque hard peg', …). */
  raison: string
  reservePour: string | null
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
  /** Version du snapshot charge (portée par le payload). Envoyée en `?v=` :
   *  le serveur calcule alors la table depuis les mêmes entrées X3 que la
   *  barre cliquée, au lieu d'une relecture potentiellement plus récente. */
  version?: string | null
  /** Segments actifs (ids d'option), miroir du filtre de la toolbar. */
  activeSegs: ReadonlySet<string>
  /** Cran de quantité de la vue commande (brut / net / reste à produire). */
  qtyMode: LoadQtyMode
  /**
   * Unité de la charge affichée (heures de poste ou pièces). Ne change AUCUN
   * fetch : la table porte les deux séries, on choisit celle qui se totalise.
   * En pièces, la colonne « Qté » disparaît — la charge en pièces EST la
   * quantité de la ligne, deux colonnes jumelles se liraient comme un bug.
   */
  unit: LoadUnit
  /** Date utilisée pour positionner un OF. */
  ofDate: 'start' | 'end'
  applyDemandHorizon: boolean
  /**
   * Parent des overlays du panneau (défaut : `<body>`). La page le renseigne en
   * plein écran : le navigateur ne rend alors que le sous-arbre de l'élément
   * plein écran, donc ce panneau — et la liste déroulante de poste qu'il
   * contient — doivent y être portés pour rester visibles.
   */
  overlayContainer?: HTMLElement | null
}

/** ISO YYYY-MM-DD → JJ/MM/AAAA (jamais d'ISO brut à l'écran). */
const fmtDateFr = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

const fmtH = (h: number) => (Math.round(h * 10) / 10).toFixed(1).replace('.', ',')
const fmtQ = (q: number) => Math.round(q).toLocaleString('fr-FR')

/**
 * Valeur affichée d'une ligne selon l'unité choisie : heures de poste (dixième)
 * ou pièces (entier, séparateurs de milliers). Les deux séries vivent côte à
 * côte dans le payload — on choisit celle qui se totalise, on ne convertit rien.
 */
const fmtVal = (v: number, unit: LoadUnit): string => (unit === 'u' ? fmtQ(v) : fmtH(v))
const unitSuffixOf = (unit: LoadUnit): string => (unit === 'u' ? ' u' : ' h')

/** Valeur d'une ligne de besoin, dans l'unité ET le cran (brut/net/reste) demandés. */
const cmdRowValue = (r: DetailCmdRow, unit: LoadUnit, qtyMode: LoadQtyMode): number =>
  unit === 'u'
    ? qtyMode === 'reste'
      ? r.resteQty
      : qtyMode === 'net'
        ? r.netQty
        : r.brutQty
    : qtyMode === 'reste'
      ? r.resteHours
      : qtyMode === 'net'
        ? r.netHours
        : r.brutHours

/** Valeur d'une ligne d'OF : la quantité restante, ou les heures qu'elle occupe. */
const ofRowValue = (r: DetailOfRow, unit: LoadUnit): number => (unit === 'u' ? r.quantite : r.hours)

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
 *
 * `value` est la quantité SOMMÉE du groupe dans l'unité affichée (heures ou
 * pièces) — c'est l'appelant qui la choisit, avec la même fonction de lecture
 * que celle des lignes : le total du jour suit donc la colonne qu'il coiffe.
 */
interface Group<R> {
  dateIso: string
  value: number
  rows: R[]
  /** Segments présents ce jour-là (pastilles d'en-tête). */
  fields: string[]
}

function groupByDay<R>(
  rows: R[],
  dateOf: (r: R) => string,
  fieldOf: (r: R) => string,
  value: (r: R) => number
): Group<R>[] {
  const map = new Map<string, Group<R>>()
  for (const r of rows) {
    const k = dateOf(r)
    let g = map.get(k)
    if (!g) {
      g = { dateIso: k, value: 0, rows: [], fields: [] }
      map.set(k, g)
    }
    g.value += value(r)
    g.rows.push(r)
    const f = fieldOf(r)
    if (!g.fields.includes(f)) g.fields.push(f)
  }
  const out = [...map.values()]
  // Dans un jour, le plus lourd d'abord : ce qui fait la charge du jour.
  for (const g of out) g.rows.sort((a, b) => value(b) - value(a))
  // Chronologie stricte, du plus tôt au plus tard.
  return out.sort((a, b) => a.dateIso.localeCompare(b.dateIso))
}

export function ChargePeriodSheet(props: ChargePeriodSheetProps) {
  const { target, view, start, activeSegs, qtyMode, unit, version, ofDate, applyDemandHorizon } =
    props
  const unitPieces = unit === 'u'
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
    if (version) qs.set('v', version)
    qs.set('ofDate', ofDate)
    qs.set('applyDemandHorizon', applyDemandHorizon ? '1' : '0')
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
  }, [props.open, poste, bucketKey, gran, view, start, version, ofDate, applyDemandHorizon])

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

  /** Valeur affichée d'une ligne de besoin, dans l'unité active. */
  const cmdValue = useCallback((r: DetailCmdRow) => cmdRowValue(r, unit, qtyMode), [unit, qtyMode])

  /**
   * Idem pour une ligne d'OF : pas de crans (la charge de l'OF suit sa quantité
   * restante), donc l'unité ne fait que choisir entre quantité et heures.
   */
  const ofValue = useCallback((r: DetailOfRow) => ofRowValue(r, unit), [unit])

  /** Nombre mis à l'échelle de l'unité : heures au dixième, pièces entières. */
  const fmt = useCallback((v: number) => fmtVal(v, unit), [unit])
  const unitSuffix = unitSuffixOf(unit)

  /**
   * Options du filtre article — construites APRÈS le masque de segments et
   * AVANT le filtre article : la liste propose donc exactement les articles
   * visibles, et ne se vide pas d'elle-même une fois une sélection faite.
   */
  const articleOptions = useMemo(() => {
    if (!data) return [] as { code: string; designation: string | null; value: number }[]
    const agg = new Map<string, { code: string; designation: string | null; value: number }>()
    const push = (code: string, designation: string | null, v: number) => {
      const cur = agg.get(code)
      if (cur) {
        cur.value += v
        if (!cur.designation) cur.designation = designation
      } else agg.set(code, { code, designation, value: v })
    }
    if (data.view === 'of') {
      for (const r of data.ofRows) if (keep.has(r.field)) push(r.article, r.designation, ofValue(r))
    } else {
      for (const r of data.cmdRows)
        if (keep.has(r.field)) push(r.article, r.designation, cmdValue(r))
    }
    return [...agg.values()].sort((a, b) => b.value - a.value)
  }, [data, keep, cmdValue, ofValue])

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
      ofValue
    )
  }, [data, keep, matchesArticle, ofValue])

  const cmdGroups = useMemo(() => {
    if (data?.view !== 'commande') return []
    return groupByDay(
      data.cmdRows.filter((r) => keep.has(r.field) && matchesArticle(r.article)),
      (r) => r.dateIso,
      (r) => r.field,
      cmdValue
    )
  }, [data, keep, cmdValue, matchesArticle])

  const groups = view === 'of' ? ofGroups : cmdGroups
  const totalValue = useMemo(() => groups.reduce((a, g) => a + g.value, 0), [groups])
  const rowCount = useMemo(() => groups.reduce((a, g) => a + g.rows.length, 0), [groups])
  // Référence de la barre de contribution : le jour le plus chargé (pas le
  // premier, puisque les groupes sont désormais triés par date et non par poids).
  const maxGroupValue = useMemo(() => groups.reduce((m, g) => Math.max(m, g.value), 0), [groups])

  // Part de la période tirée par des prévisions plutôt que par des commandes
  // fermes : c'est la charge la moins sûre, elle mérite d'être chiffrée avant
  // qu'on décide quoi que ce soit sur ce poste.
  const forecastValue = useMemo(() => {
    if (data?.view !== 'commande') return 0
    return cmdGroups.reduce(
      (a, g) => a + g.rows.reduce((b, r) => b + (isForecastPulled(r.field) ? cmdValue(r) : 0), 0),
      0
    )
  }, [data, cmdGroups, cmdValue])

  // Grille UNIQUE (en-tête + lignes + total dans le même conteneur) : l'alignement
  // est structurel. Deux grilles distinctes se dimensionnaient indépendamment et
  // décalaient les en-têtes des cellules.
  // La DATE ne figure pas dans les colonnes : elle est portée une seule fois
  // par l'en-tête de jour. Les lignes n'affichent que ce qui les distingue au
  // sein de ce jour.
  // « Via » porte une chaîne d'articles (PF › SE › …), pas un code isolé :
  // elle a besoin d'une part élastique, pas d'une largeur fixe. La colonne OF
  // porte les contremarques X3 de la commande — élastique elle aussi.
  //
  // En PIÈCES, la colonne « Qté » disparaît : la charge en pièces EST la
  // quantité de la ligne (même cran), deux colonnes jumelles se liraient comme
  // un doublon, voire un bug. Le dernier en-tête nomme donc l'unité affichée,
  // pour que le total du jour tombe sur la colonne qui le porte.
  const cols = unitPieces
    ? view === 'of'
      ? '9rem 1.6fr 10rem 7rem'
      : '9rem 1.3fr 1.4fr 9rem 1fr 1.2fr 7rem'
    : view === 'of'
      ? '9rem 1.6fr 10rem 7rem 7rem'
      : '9rem 1.3fr 1.4fr 9rem 1fr 1.2fr 9rem 7rem'

  const unitHead = unitPieces ? 'Pièces' : 'Heures'
  const heads = unitPieces
    ? view === 'of'
      ? ['Article', 'Désignation', 'Ordre', unitHead]
      : ['Article', 'Désignation', 'Via', 'Commande', 'Client', 'OF', unitHead]
    : view === 'of'
      ? ['Article', 'Désignation', 'Ordre', 'Qté', unitHead]
      : ['Article', 'Désignation', 'Via', 'Commande', 'Client', 'OF', 'Qté', unitHead]

  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      // En plein écran, le panneau est porté DANS l'entête du panneau de détail
      // (`overlayContainer`) : un dialogue modal marque `inert` tout ce qui
      // l'entoure — donc cette entête elle-même, Mois/Semaine et bouton de
      // sortie compris. On renonce au marquage pour que l'entête reste vivante
      // pendant la lecture du détail ; le fond, lui, ferme toujours au clic
      // extérieur (cf. `SheetOverlay`).
      modal={props.overlayContainer ? false : undefined}
    >
      <SheetContent
        side="bottom"
        portalContainer={props.overlayContainer}
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
                {fmt(totalValue)}
                {unitSuffix}
              </span>
              {/* Un total filtré n'est plus la hauteur de la barre : le dire,
                  sinon le chiffre semble contredire le graphe. */}
              {articleActive && (
                <span className="font-mono text-[10px] font-semibold text-brand">filtré</span>
              )}
              {view === 'commande' && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {qtyMode === 'reste' ? 'reste à produire' : qtyMode}
                </span>
              )}
              {view === 'commande' && forecastValue > 0 && (
                <span
                  className="inline-flex items-baseline gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold"
                  style={{
                    color: 'var(--color-suggere)',
                    borderColor: 'color-mix(in srgb, var(--color-suggere) 45%, transparent)',
                    background: 'color-mix(in srgb, var(--color-suggere) 10%, transparent)',
                  }}
                  title="Charge tirée par des prévisions et non par des commandes fermes — la moins sûre de la période"
                >
                  dont {fmt(forecastValue)}
                  {unitSuffix} de prévision
                  <span className="opacity-70">
                    ({Math.round((forecastValue / totalValue) * 100)}%)
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
                    <ComboboxContent
                      anchor={anchorRef}
                      layerClassName="z-[62]"
                      container={props.overlayContainer}
                    >
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
                                {fmt(o.value)}
                                {unitSuffix}
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
                      title={
                        h === 'OF'
                          ? 'OF alloués à cette ligne par le moteur de matching commande→OF (comme /suivi) — quantité allouée sous le numéro'
                          : undefined
                      }
                      className={cn(
                        'sticky top-0 z-10 border-b border-border bg-secondary py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground',
                        i === 0 && 'pl-5',
                        i === heads.length - 1 && 'pr-5',
                        // Colonnes de valeurs alignées à droite comme leurs chiffres.
                        (h === 'Qté' || h === 'Heures' || h === 'Pièces') && 'text-right'
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
                      qtyMode={qtyMode}
                      unit={unit}
                      maxValue={maxGroupValue}
                      totalValue={totalValue}
                    />
                  ))}

                  {/* Total en pied : le chiffre du bandeau se revérifie ici,
                      au bout de la colonne d'unité. */}
                  <div
                    className="sticky bottom-0 col-span-full grid items-center border-t border-border bg-secondary py-1.5"
                    style={{ gridTemplateColumns: cols }}
                  >
                    <div className="pl-5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Total période
                    </div>
                    {/* Colonnes intermédiaires vides : le total se lit au bout
                        de la colonne d'unité, pas ailleurs. */}
                    {Array.from({ length: heads.length - 3 }, (_, i) => (
                      <div key={`sp-${i}`} />
                    ))}
                    <div className="text-right font-mono text-[10px] text-muted-foreground">
                      {rowCount} lig.
                    </div>
                    <div className="pr-5 text-right font-mono text-[13px] font-bold tabular-nums text-foreground">
                      {fmt(totalValue)}
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
  qtyMode: LoadQtyMode
  unit: LoadUnit
  maxValue: number
  totalValue: number
}) {
  const { group: g, view, qtyMode, unit, maxValue, totalValue } = props
  const rowValue = (r: DetailOfRow | DetailCmdRow): number =>
    view === 'of'
      ? ofRowValue(r as DetailOfRow, unit)
      : cmdRowValue(r as DetailCmdRow, unit, qtyMode)
  const share = totalValue > 0 ? (g.value / totalValue) * 100 : 0
  const barPct = maxValue > 0 ? (g.value / maxValue) * 100 : 0
  const dayForecastValue =
    view === 'commande'
      ? g.rows.reduce((a, r) => (isForecastPulled(r.field) ? a + rowValue(r) : a), 0)
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
        {view === 'commande' && dayForecastValue > 0 && (
          <span
            className="flex-none font-mono text-[10px] font-semibold"
            style={{ color: 'var(--color-suggere)' }}
            title="Part de la charge du jour tirée par des prévisions"
          >
            dont {fmtVal(dayForecastValue, unit)}
            {unitSuffixOf(unit)} prév.
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
            {fmtVal(g.value, unit)}
          </span>
        </span>
      </div>

      {g.rows.map((r, i) =>
        view === 'of' ? (
          <OfRow key={`${(r as DetailOfRow).numOf}-${i}`} row={r as DetailOfRow} unit={unit} />
        ) : (
          <CmdRow
            key={`${(r as DetailCmdRow).numCommande ?? ''}-${(r as DetailCmdRow).ligne ?? ''}-${(r as DetailCmdRow).article}-${i}`}
            row={r as DetailCmdRow}
            qtyMode={qtyMode}
            unit={unit}
          />
        )
      )}
    </>
  )
}

const CELL = 'border-b border-rule-soft/60 py-[5px] text-[11px]'

function OfRow({ row: r, unit }: { row: DetailOfRow; unit: LoadUnit }) {
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
      {/* En pièces, la charge EST la quantité de l'OF : une seule colonne, portée
          par l'en-tête « Pièces » (cf. `heads`). */}
      {unit === 'u' ? (
        <div className={cn(CELL, 'pr-5 text-right font-mono tabular-nums text-foreground')}>
          {fmtQ(r.quantite)}
        </div>
      ) : (
        <>
          <div className={cn(CELL, 'text-right font-mono tabular-nums text-secondary-foreground')}>
            {fmtQ(r.quantite)}
          </div>
          <div className={cn(CELL, 'pr-5 text-right font-mono tabular-nums text-foreground')}>
            {fmtH(r.hours)}
          </div>
        </>
      )}
    </>
  )
}

function CmdRow({
  row: r,
  qtyMode,
  unit,
}: {
  row: DetailCmdRow
  qtyMode: LoadQtyMode
  unit: LoadUnit
}) {
  const forecast = isForecastPulled(r.field)
  // Ligne affichée à zéro parce qu'entièrement couverte : en cran net, le stock
  // suffit ; en cran reste, l'en-cours peut compléter le stock. Sans mention,
  // un « 0 / 0,0 » se lit comme une donnée cassée. En cran brut rien n'est
  // masqué, la mention n'a pas de sens.
  const stockCovered = qtyMode !== 'brut' && r.brutQty > 0 && r.netQty <= 0
  const encoursCovered = qtyMode === 'reste' && r.brutQty > 0 && r.netQty > 0 && r.resteQty <= 0
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
        {(stockCovered || encoursCovered) && (
          <span
            className="mr-1.5 rounded-sm px-1 py-px font-mono text-[9px] font-bold uppercase tracking-wider"
            style={{
              color: stockCovered ? 'var(--color-ferme)' : 'var(--color-planifie)',
              background: stockCovered
                ? 'color-mix(in srgb, var(--color-ferme) 14%, transparent)'
                : 'color-mix(in srgb, var(--color-planifie) 14%, transparent)',
            }}
            title={
              stockCovered
                ? 'Besoin entièrement couvert par le stock disponible — plus rien à produire sur cette ligne'
                : 'Besoin couvert par l’en-cours déjà produit sur un OF démarré — plus rien à lancer'
            }
          >
            {stockCovered ? 'stock' : 'en-cours'}
          </span>
        )}
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
                : 'Composant induit par un produit fini lui-même tiré par une prévision'
            }
          >
            prév.
          </span>
        )}
        {r.designation || '—'}
      </div>
      {/* Chaîne BOM lue en REMONTÉE : du parent immédiat vers le produit fini.
          `path` est stocké dans l'ordre d'ascendance (PF en tête) ; on l'inverse
          ici parce que la lecture part de l'article de la ligne et doit ABOUTIR
          au produit fini — celui-là même que porte la colonne Commande, juste à
          côté. Dans l'autre sens, les deux colonnes ne se raccordaient pas.
          Tronqué dans la cellule, chaîne entière au survol. */}
      <div
        className={cn(CELL, 'truncate font-mono text-[10px] text-muted-foreground')}
        title={
          r.path.length
            ? // Chaîne entière, article de la ligne inclus en tête.
              [r.article, ...[...r.path].reverse()].join(' → ')
            : undefined
        }
      >
        {r.path.length === 0 ? '' : [...r.path].reverse().join(' → ')}
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
      <OfAllouesCell ofs={r.ofs ?? []} />
      {/* En cran « reste », la part absorbée par l'en-cours est annoncée À CÔTÉ du
          chiffre. Sans elle la ligne affiche une quantité plus petite que la
          commande sans dire pourquoi — un chiffre inexpliqué se lit comme un bug. */}
      {/* En pièces, cette colonne EST la charge : elle se place en dernier, sous
          l'en-tête « Pièces » (cf. `heads`), et la colonne « Qté » disparaît. */}
      <div
        className={cn(
          CELL,
          unit === 'u'
            ? 'pr-5 text-right font-mono tabular-nums text-foreground'
            : 'text-right font-mono tabular-nums text-secondary-foreground'
        )}
      >
        {qtyMode === 'reste' && r.encoursQty > 0 && (
          <span
            className="mr-1.5 text-[9px] font-semibold text-muted-foreground"
            title={`${fmtQ(r.encoursQty)} déjà produites sur un OF en cours, pas encore déclarées en stock (net ${fmtQ(r.netQty)} − en-cours ${fmtQ(r.encoursQty)})`}
          >
            −{fmtQ(r.encoursQty)}
          </span>
        )}
        {fmtQ(cmdRowValue(r, 'u', qtyMode))}
      </div>
      {unit === 'h' && (
        <div className={cn(CELL, 'pr-5 text-right font-mono tabular-nums text-foreground')}>
          {fmtH(cmdRowValue(r, 'h', qtyMode))}
        </div>
      )}
    </>
  )
}

/**
 * OFs alloués à la ligne — sortie du moteur de matching commande→OF de la page
 * suivi (`CommandeOFMatcher`) : la contremarque X3 passe en priorité (vert, le
 * même vert que le segment ferme), le reste est une allocation heuristique
 * statut+date. Chaque OF porte la quantité DU BESOIN qu'il couvre ; le détail
 * (statut, date de fin, raison de match) vit au survol. Un tiret = le moteur
 * n'a rien alloué : ni contremarque, ni OF candidat (le badge STOCK porte déjà
 * l'autre cas de figure, le couvert par stock).
 */
function OfAllouesCell({ ofs }: { ofs: DetailRowOf[] }) {
  if (ofs.length === 0) {
    return <div className={cn(CELL, 'truncate text-muted-foreground')}>—</div>
  }
  const title = ofs
    .map((o) =>
      [
        o.numOf,
        o.statutLabel ?? '',
        `alloué ${fmtQ(o.quantite)} u`,
        o.dateIso ? `fin ${fmtDateFr(o.dateIso)}` : '',
        o.raison,
      ]
        .filter(Boolean)
        .join(' · ')
    )
    .join('\n')
  return (
    <div className={cn(CELL, 'truncate font-mono text-[10px]')} title={title}>
      {ofs.map((o) => {
        const pegue = o.raison.toLowerCase().includes('contremarque')
        return (
          <span key={o.numOf} className="mr-1.5">
            <span
              className={pegue ? 'font-bold' : 'font-semibold'}
              style={pegue ? { color: 'var(--color-ferme)' } : undefined}
            >
              {o.numOf}
            </span>
            <span className="text-muted-foreground"> {fmtQ(o.quantite)}</span>
          </span>
        )
      })}
    </div>
  )
}
