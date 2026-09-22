import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleX, RefreshCw, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { LoadingState } from '@r/components/ui/loading-state'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@r/components/ui/tooltip'
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
import { ChargeLissagePanel, PropositionCell } from '@r/components/load/charge-lissage-panel'
import {
  cleLigne,
  repartirParSemaine,
  situationSemaine,
  type AvanceLimiteeMatiere,
  type DeplacementLisible,
  type DeplacementsSemaine,
  type PlanLissagePoste,
  type ProfilJourLissage,
} from '@r/lib/load/lissage'

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

interface DetailOfCommande {
  numCommande: string
  ligne: string | null
  client: string | null
  clientCode: string | null
  quantite: number
  dateLivraisonIso: string | null
  raison: string
  type: 'order' | 'forecast'
  dateCommandeIso?: string | null
  dateDemandeeIso?: string | null
  dateAccepteeIso?: string | null
}

interface DetailOfRow {
  numOf: string
  article: string
  designation: string | null
  statutLabel: string | null
  quantite: number
  dateIso: string
  field: 'f' | 'p' | 's'
  hours: number
  commandes?: DetailOfCommande[]
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
  /** Code tiers X3 brut — c'est lui qui porte la règle de mobilité. */
  clientCode: string | null
  /** Date négociable ou contractuelle, tranché serveur (`load_smoothing`). */
  mobilite: 'deplacable' | 'ferme'
  motifMobilite: string
  dateIso: string
  /** Date portée par X3 avant toute substitution locale ; null sur une prévision. */
  dateX3Iso: string | null
  /** Date locale substituée à celle de X3, sinon null — marqueur « re-datée ». */
  dateOverrideIso: string | null
  dateCommandeIso?: string | null
  dateDemandeeIso?: string | null
  dateAccepteeIso?: string | null
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
  /** Capacité nette (h) du poste par jour du bucket, calendrier appliqué. */
  capaciteParJour: { dateIso: string; capaciteH: number }[]
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
  /**
   * Appelé après chaque écriture de date locale (application ou retour à la
   * date X3).
   *
   * La page DOIT recharger ses props : les clés de cache de /charge portent une
   * empreinte des overrides, donc un nouveau jeu de dates produit une nouvelle
   * `version` de snapshot — et c'est ce changement de version qui fait relire la
   * table de ce panneau sur les bonnes dates. Sans ce rappel, le graphe et la
   * table resteraient sur le snapshot d'avant le déplacement, sans la moindre
   * erreur visible : exactement le genre de panne silencieuse que ce projet a
   * déjà payée quatre fois.
   */
  onOverridesChanged?: () => void
}

/** ISO YYYY-MM-DD → JJ/MM/AAAA (jamais d'ISO brut à l'écran). */
const fmtDateFr = (iso: string | null | undefined): string => {
  if (!iso) return '—'
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

/**
 * Tout ce que la table doit savoir du lissage, pour une semaine donnée.
 *
 * Toujours fourni, même sans plan calculé : le retour à la date X3 d'une ligne
 * déjà repositionnée ne dépend d'aucun plan — une date locale posée hier doit
 * pouvoir être défaite aujourd'hui, sans relancer un calcul.
 */
interface LissageContexte {
  /** Lundi de la semaine ouverte — sert à situer une destination hors semaine. */
  lundiIso: string
  /** Déplacement proposé par ligne de commande (`numCommande#ligne`). */
  propositions: Map<string, DeplacementLisible>
  /** Lignes dont l'avance a été rognée par la matière, par ligne de commande. */
  limites: Map<string, AvanceLimiteeMatiere>
  /** Lignes venues d'une AUTRE semaine, rangées à leur jour d'arrivée. */
  entrantesParJour: Map<string, DeplacementLisible[]>
  /** Profil du poste avant/après plan, par jour. */
  profilParJour: Map<string, ProfilJourLissage>
  /** Lignes appliquées depuis ce panneau. */
  appliquees: ReadonlySet<string>
  /** Ligne en cours d'écriture, `'lot'` pendant un « tout appliquer ». */
  busy: string | null
  /** Une colonne « Proposé » est-elle rendue ? (vrai dès qu'un plan est chargé) */
  colonne: boolean
  onAppliquer: (d: DeplacementLisible) => void
  onRetablir: (numCommande: string, ligne: string) => void
}

export function ChargePeriodSheet(props: ChargePeriodSheetProps) {
  const {
    target,
    view,
    start,
    activeSegs,
    qtyMode,
    unit,
    version,
    ofDate,
    applyDemandHorizon,
    onOverridesChanged,
  } = props
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

  // ── Lissage de la semaine ouverte ────────────────────────────────────────
  // Réservé à la maille SEMAINE en vue COMMANDE : l'unité déplaçable est la
  // ligne de commande, elle n'existe pas en vue OF ; et l'horizon de décision
  // du moteur est de trois semaines, un mois n'y entre pas.
  // La barre « Retard » (clé `début~fin`) n'est pas une semaine : rien à y
  // lisser, ses dates sont déjà dépassées.
  const semaineOuverte =
    gran === 'week' && view === 'commande' && bucketKey && !bucketKey.includes('~')
      ? bucketKey
      : null
  const [plan, setPlan] = useState<PlanLissagePoste | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [appliquees, setAppliquees] = useState<ReadonlySet<string>>(() => new Set<string>())
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Un plan appartient à UNE semaine d'UN poste : le traîner d'une barre à
  // l'autre proposerait des dates calculées sur une autre charge.
  useEffect(() => {
    setPlan(null)
    setPlanError(null)
    setAppliquees(new Set<string>())
    setBusy(null)
    setActionError(null)
  }, [poste, bucketKey, gran, view])

  const chargerPlan = useCallback(
    (force = false) => {
      if (!poste || !semaineOuverte) return
      setPlanLoading(true)
      setPlanError(null)
      const qs = new URLSearchParams({ poste, start: semaineOuverte })
      if (force) qs.set('refresh', '1')
      fetch(`${route('charge.lissage')}?${qs.toString()}`)
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null
            throw new Error(body?.error ?? `HTTP ${res.status}`)
          }
          return res.json() as Promise<PlanLissagePoste>
        })
        .then((p) => {
          setPlan(p)
          setAppliquees(new Set<string>())
          setActionError(null)
        })
        .catch((err: unknown) =>
          setPlanError(err instanceof Error ? err.message : 'Échec du calcul du plan')
        )
        .finally(() => setPlanLoading(false))
    },
    [poste, semaineOuverte]
  )

  /**
   * Pose la date proposée comme date locale de la ligne de commande.
   *
   * La date écrite est le JOUR DE CHARGE proposé par le moteur, qui ne retient
   * que des jours ouverts du poste. La chaîne /charge rattache ensuite la ligne
   * à ce même jour (`chargeDay` ne recule que sur un jour fermé) : ce qu'on
   * promet à l'écran est donc exactement ce que le graphe affichera.
   *
   * Rien n'est écrit dans X3 : l'override est local, c'est le principe — le
   * CBN rejalonnera de lui-même quand la date sera négociée pour de bon.
   */
  const appliquerUn = useCallback(async (d: DeplacementLisible): Promise<boolean> => {
    if (!d.numCommande || !d.ligne) return false
    const res = await fetch(
      route('order_planning.update', { order: d.numCommande, line: d.ligne }),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateLivraison: d.dateProposeeIso }),
      }
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? `HTTP ${res.status}`)
    }
    return true
  }, [])

  const appliquer = useCallback(
    async (d: DeplacementLisible) => {
      const cle = cleLigne(d.numCommande, d.ligne)
      setBusy(cle)
      setActionError(null)
      try {
        await appliquerUn(d)
        setAppliquees((prev) => new Set(prev).add(cle))
        onOverridesChanged?.()
      } catch (err: unknown) {
        setActionError(
          `${d.numCommande}/${d.ligne} — ${err instanceof Error ? err.message : 'échec'}`
        )
      } finally {
        setBusy(null)
      }
    },
    [appliquerUn, onOverridesChanged]
  )

  /**
   * Rend à la ligne sa date X3 en supprimant la date locale.
   *
   * C'est un retour à l'ORIGINE, pas une annulation du dernier geste : si la
   * ligne portait déjà une date négociée avant ce plan, elle la perd aussi. Dit
   * tel quel dans l'infobulle du bouton — une « annulation » qui ferait plus
   * que ce qu'elle annonce serait pire qu'un bouton absent.
   */
  const retablir = useCallback(
    async (numCommande: string, ligne: string) => {
      const cle = cleLigne(numCommande, ligne)
      setBusy(cle)
      setActionError(null)
      try {
        const res = await fetch(
          route('order_planning.reset_override', { order: numCommande, line: ligne }),
          { method: 'DELETE' }
        )
        // 404 = aucune date locale sur cette ligne : elle est DÉJÀ sur sa date
        // X3, c'est le résultat demandé et non une erreur.
        if (!res.ok && res.status !== 404) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        setAppliquees((prev) => {
          const next = new Set(prev)
          next.delete(cle)
          return next
        })
        onOverridesChanged?.()
      } catch (err: unknown) {
        setActionError(`${numCommande}/${ligne} — ${err instanceof Error ? err.message : 'échec'}`)
      } finally {
        setBusy(null)
      }
    },
    [onOverridesChanged]
  )

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

  /** Capacité du poste par jour — affichée en repère à côté de la charge du jour. */
  const capByDay = useMemo(
    () => new Map((data?.capaciteParJour ?? []).map((c) => [c.dateIso, c.capaciteH])),
    [data]
  )

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

  /**
   * Le moteur travaille sur TROIS semaines, ce panneau en montre UNE : on trie
   * donc les déplacements selon ce qu'ils font de la semaine ouverte. Une ligne
   * qui s'évaporerait de l'écran serait le pire résultat possible de cet outil.
   */
  const repartition: DeplacementsSemaine | null = useMemo(() => {
    if (!plan || !data) return null
    return repartirParSemaine(plan.deplacements, data.bucket.fromIso, data.bucket.toIso)
  }, [plan, data])

  /**
   * Propositions par ligne de commande. Inclut aussi les entrantes : une fois
   * appliquée, une entrante passe dans `cmdRows` et est rendue par `CmdRow` ;
   * elle a besoin de sa proposition pour afficher le statut appliqué et le
   * bouton rétablir dans sa colonne « Proposé ».
   */
  const propositions = useMemo(() => {
    const m = new Map<string, DeplacementLisible>()
    if (!repartition) return m
    for (const d of [...repartition.internes, ...repartition.sortantes, ...repartition.entrantes]) {
      m.set(cleLigne(d.numCommande, d.ligne), d)
    }
    return m
  }, [repartition])

  const limitesMatiere = useMemo(() => {
    const m = new Map<string, AvanceLimiteeMatiere>()
    for (const l of plan?.borneMatiere.lignes ?? []) m.set(cleLigne(l.numCommande, l.ligne), l)
    return m
  }, [plan])

  /** Lignes venues d'une autre semaine, rangées à leur JOUR D'ARRIVÉE. */
  const entrantesParJour = useMemo(() => {
    const m = new Map<string, DeplacementLisible[]>()
    for (const d of repartition?.entrantes ?? []) {
      if (!matchesArticle(d.article)) continue
      const arr = m.get(d.dateProposeeIso)
      if (arr) arr.push(d)
      else m.set(d.dateProposeeIso, [d])
    }
    return m
  }, [repartition, matchesArticle])

  const profilParJour = useMemo(
    () => new Map((plan?.plan.profil ?? []).map((p) => [p.dateIso, p])),
    [plan]
  )

  /**
   * Jours rendus : ceux de la table, PLUS ceux où une ligne d'une autre semaine
   * vient atterrir (tant qu'elle n'a pas encore été appliquée). Sans cette union,
   * une ligne entrante tombant un jour vide de la semaine n'aurait aucun bloc
   * où s'afficher — elle apparaîtrait de nulle part au rafraîchissement suivant.
   */
  const joursAffiches = useMemo(() => {
    if (entrantesParJour.size === 0) return groups
    const parJour = new Map(groups.map((g) => [g.dateIso, g]))
    for (const [iso, depls] of entrantesParJour) {
      const nonAppliquees = depls.filter((d) => !appliquees.has(cleLigne(d.numCommande, d.ligne)))
      if (nonAppliquees.length > 0 && !parJour.has(iso)) {
        parJour.set(iso, { dateIso: iso, value: 0, rows: [], fields: [] })
      }
    }
    return [...parJour.values()].sort((a, b) => a.dateIso.localeCompare(b.dateIso))
  }, [groups, entrantesParJour, appliquees])

  /**
   * « Tout appliquer » ne porte QUE sur les déplacements visibles ici :
   * internes, sortants et entrants. Ceux qui se jouent entre deux autres
   * semaines de l'horizon ne changent rien au profil affiché et resteraient
   * invisibles — les appliquer en douce reviendrait à re-dater des commandes
   * que l'utilisateur n'a jamais vues.
   */
  const toutAppliquer = useCallback(async () => {
    if (!repartition) return
    setBusy('lot')
    setActionError(null)
    const echecs: string[] = []
    const faits: string[] = []
    for (const d of [...repartition.internes, ...repartition.sortantes, ...repartition.entrantes]) {
      const cle = cleLigne(d.numCommande, d.ligne)
      if (appliquees.has(cle)) continue
      try {
        await appliquerUn(d)
        faits.push(cle)
      } catch (err: unknown) {
        echecs.push(`${d.numCommande}/${d.ligne} (${err instanceof Error ? err.message : 'échec'})`)
      }
    }
    if (faits.length) {
      setAppliquees((prev) => {
        const next = new Set(prev)
        for (const c of faits) next.add(c)
        return next
      })
    }
    setActionError(echecs.length ? `Non appliqué : ${echecs.join(' · ')}` : null)
    setBusy(null)
    // Un seul rechargement pour tout le lot : la chaîne /charge recalcule
    // entièrement dès que l'empreinte des overrides change, la déclencher par
    // ligne coûterait N recalculs pour un seul résultat.
    if (faits.length) onOverridesChanged?.()
  }, [repartition, appliquees, appliquerUn, onOverridesChanged])

  const lissage: LissageContexte = useMemo(
    () => ({
      lundiIso: semaineOuverte ?? data?.bucket.fromIso ?? '',
      propositions,
      limites: limitesMatiere,
      entrantesParJour,
      profilParJour,
      appliquees,
      busy,
      colonne: view === 'commande' && plan !== null,
      onAppliquer: appliquer,
      onRetablir: retablir,
    }),
    [
      semaineOuverte,
      data,
      propositions,
      limitesMatiere,
      entrantesParJour,
      profilParJour,
      appliquees,
      busy,
      view,
      plan,
      appliquer,
      retablir,
    ]
  )

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
  // Une dernière colonne « Proposé » n'apparaît QUE lorsqu'un plan est chargé :
  // une colonne vide en permanence coûterait de la largeur à toutes les lectures
  // qui ne viennent pas lisser.
  const cols = [
    unitPieces
      ? view === 'of'
        ? '9rem 1.4fr 8.5rem 8.5rem 1.1fr 7rem'
        : '9rem 1.3fr 1.4fr 9rem 1fr 1.2fr 7rem'
      : view === 'of'
        ? '9rem 1.4fr 8.5rem 8.5rem 1.1fr 7rem 7rem'
        : '9rem 1.3fr 1.4fr 9rem 1fr 1.2fr 9rem 7rem',
    lissage.colonne ? '14rem' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const unitHead = unitPieces ? 'Pièces' : 'Heures'
  const heads = [
    ...(unitPieces
      ? view === 'of'
        ? ['Article', 'Désignation', 'Ordre', 'Commande', 'Client', unitHead]
        : ['Article', 'Désignation', 'Via', 'Commande', 'Client', 'OF', unitHead]
      : view === 'of'
        ? ['Article', 'Désignation', 'Ordre', 'Commande', 'Client', 'Qté', unitHead]
        : ['Article', 'Désignation', 'Via', 'Commande', 'Client', 'OF', 'Qté', unitHead]),
    ...(lissage.colonne ? ['Proposé'] : []),
  ]

  // Index de la colonne d'unité : c'est au bout d'ELLE que le total de période
  // se lit, pas au bout de la grille — sinon il atterrit sous « Proposé ».
  const unitIdx = heads.length - 1 - (lissage.colonne ? 1 : 0)

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
        <TooltipProvider delay={150} closeDelay={50}>
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

            {/* Lissage — la proposition se lit ensuite DANS la table, sur la
                ligne concernée. Réservé à la semaine en vue commande : l'unité
                déplaçable est la ligne de commande. */}
            {semaineOuverte && (
              <ChargeLissagePanel
                semaineLabel={data.bucket.label}
                plan={plan}
                loading={planLoading}
                error={planError}
                repartition={repartition}
                appliquees={appliquees}
                busy={busy}
                actionError={actionError}
                onCharger={() => chargerPlan(false)}
                onRecalculer={() => chargerPlan(true)}
                onMasquer={() => setPlan(null)}
                onToutAppliquer={() => void toutAppliquer()}
              />
            )}

            {rowCount === 0 && entrantesParJour.size === 0 ? (
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
                          : h === 'Commande' && view === 'of'
                            ? 'Commandes clientes allouées à cet OF par le moteur de matching'
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

                  {joursAffiches.map((g) => (
                    <DayBlock
                      key={g.dateIso}
                      group={g}
                      view={view}
                      qtyMode={qtyMode}
                      unit={unit}
                      maxValue={maxGroupValue}
                      totalValue={totalValue}
                      capaciteH={capByDay.get(g.dateIso) ?? null}
                      lissage={lissage}
                    />
                  ))}

                  {/* Total en pied : le chiffre du bandeau se revérifie ici,
                      au bout de la colonne d'unité. */}
                  <div
                    className="sticky bottom-0 col-span-full grid items-center border-t border-border bg-secondary py-1.5"
                    style={{ gridTemplateColumns: cols }}
                  >
                    {heads.map((_, i) =>
                      i === 0 ? (
                        <div
                          key={`ft-${i}`}
                          className="pl-5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                        >
                          Total période
                        </div>
                      ) : i === unitIdx - 1 ? (
                        <div
                          key={`ft-${i}`}
                          className="text-right font-mono text-[10px] text-muted-foreground"
                        >
                          {rowCount} lig.
                        </div>
                      ) : i === unitIdx ? (
                        <div
                          key={`ft-${i}`}
                          className={cn(
                            'text-right font-mono text-[13px] font-bold tabular-nums text-foreground',
                            !lissage.colonne && 'pr-5'
                          )}
                        >
                          {fmt(totalValue)}
                        </div>
                      ) : (
                        <div key={`ft-${i}`} />
                      )
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        </TooltipProvider>
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
  /** Capacité nette (h) du jour ; `null` ou 0 = poste fermé / inconnue. */
  capaciteH: number | null
  lissage: LissageContexte
}) {
  const { group: g, view, qtyMode, unit, maxValue, totalValue, capaciteH, lissage } = props
  const rowValue = (r: DetailOfRow | DetailCmdRow): number =>
    view === 'of'
      ? ofRowValue(r as DetailOfRow, unit)
      : cmdRowValue(r as DetailCmdRow, unit, qtyMode)

  // Poids du jour dans la période, barre relative au jour le plus chargé. Pas de
  // saturation (charge ÷ capacité) : retirée de /charge à la demande métier.
  const pct = totalValue > 0 ? (g.value / totalValue) * 100 : 0
  const barPct = maxValue > 0 ? (g.value / maxValue) * 100 : 0
  const avecCapacite = unit === 'h' && capaciteH !== null && capaciteH > 0
  const dayForecastValue =
    view === 'commande'
      ? g.rows.reduce((a, r) => (isForecastPulled(r.field) ? a + rowValue(r) : a), 0)
      : 0

  // Profil du jour APRÈS le plan proposé. Il ne se compare pas au pourcentage
  // ci-dessus : celui-là suit le filtre et le cran choisis à l'écran, celui-ci
  // est la lecture du moteur — reste à produire, toutes natures, heures de
  // poste. L'infobulle le dit, parce que deux pourcentages côte à côte sans
  // référence explicite sont illisibles.
  const profil = lissage.profilParJour.get(g.dateIso) ?? null
  const entrantes = lissage.entrantesParJour.get(g.dateIso) ?? []

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
        {/* Capacité du jour, en repère. */}
        {avecCapacite && (
          <span className="flex-none font-mono text-[10px] text-muted-foreground">
            cap. {fmtH(capaciteH!)} h
          </span>
        )}
        {/* Poids du jour dans la période. */}
        <span className="flex flex-none items-center gap-2">
          <span
            className="relative h-1.5 w-24 overflow-hidden rounded-full bg-rule-soft"
            title="Part de la période"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${Math.max(2, Math.min(100, barPct))}%`,
                background: 'var(--color-brand)',
              }}
            />
          </span>
          <span className="w-9 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
            {Math.round(pct)}%
          </span>
          <span className="w-14 text-right font-mono text-[13px] font-bold tabular-nums text-foreground">
            {fmtVal(g.value, unit)}
          </span>
        </span>
        {/* Ce que le plan ferait de CE jour, en heures de poste (lecture du
            moteur : reste à produire, toutes natures). */}
        {profil && (
          <span
            className="flex-none rounded-sm bg-secondary px-1.5 py-px font-mono text-[10px] font-bold tabular-nums text-secondary-foreground"
            title="Plan de lissage. Base du moteur : reste à produire, toutes natures, heures de poste — indépendante du filtre et du cran choisis ci-dessus."
          >
            plan {fmtH(profil.heuresAvant)} h{' → '}
            {fmtH(profil.heuresApres)} h
          </span>
        )}
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
            lissage={lissage}
          />
        )
      )}

      {/* Lignes venues d'une AUTRE semaine de l'horizon. Elles n'existent pas
          dans la table de cette semaine — sans elles, le plan promettrait une
          charge que rien ne justifierait à l'écran après application.
          Une fois appliquées, elles sont intégrées à data.cmdRows et rendues
          comme CmdRow dans g.rows ci-dessus — les filtrer ici évite le doublon. */}
      {entrantes
        .filter((d) => {
          const cle = cleLigne(d.numCommande, d.ligne)
          return (
            !lissage.appliquees.has(cle) &&
            !g.rows.some((r) => 'numCommande' in r && cleLigne(r.numCommande, r.ligne) === cle)
          )
        })
        .map((d) => (
          <EntranteRow
            key={`entrante-${d.numCommande}-${d.ligne}`}
            deplacement={d}
            unit={unit}
            lissage={lissage}
          />
        ))}
    </>
  )
}

const CELL = 'border-b border-rule-soft/60 py-[5px] text-[11px]'

interface CommandeTooltipData {
  numCommande: string
  ligne?: string | null
  client?: string | null
  quantite?: number
  raison?: string
  type?: 'order' | 'forecast'
  dateLivraisonIso?: string | null
  dateCommandeIso?: string | null
  dateDemandeeIso?: string | null
  dateAccepteeIso?: string | null
}

function CommandeTooltipContent({ data }: { data: CommandeTooltipData }) {
  const isForecast = data.type === 'forecast'
  return (
    <div className="flex flex-col gap-2 p-0.5 text-[11px]">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-1.5">
        <div className="flex items-center gap-1.5 font-mono font-bold text-foreground">
          {isForecast && (
            <span
              className="rounded-sm px-1 py-px text-[9px] uppercase tracking-wider"
              style={{
                color: 'var(--color-suggere)',
                background: 'color-mix(in srgb, var(--color-suggere) 14%, transparent)',
              }}
            >
              prév.
            </span>
          )}
          <span>
            {data.numCommande}
            {data.ligne && <span className="text-muted-foreground">/{data.ligne}</span>}
          </span>
        </div>
        {data.quantite !== undefined && (
          <span className="font-mono text-[10px] font-semibold text-muted-foreground">
            {fmtQ(data.quantite)} u
          </span>
        )}
      </div>

      {data.client && (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">Client</span>
          <span className="max-w-[170px] truncate text-right font-medium text-foreground">
            {data.client}
          </span>
        </div>
      )}

      {isForecast ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">Date besoin</span>
          <span className="font-mono font-semibold text-foreground">
            {fmtDateFr(data.dateLivraisonIso)}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-1 rounded-md bg-secondary/50 p-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">Date commande</span>
            <span className="font-mono font-semibold text-foreground">
              {fmtDateFr(data.dateCommandeIso)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">Expéd. demandée</span>
            <span className="font-mono font-semibold text-foreground">
              {fmtDateFr(data.dateDemandeeIso)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">Expéd. acceptée</span>
            <span className="font-mono font-semibold text-foreground">
              {fmtDateFr(data.dateAccepteeIso)}
            </span>
          </div>
        </div>
      )}

      {data.raison && (
        <div className="border-t border-border/70 pt-1 text-[10px] italic text-muted-foreground">
          {data.raison}
        </div>
      )}
    </div>
  )
}

function CommandeTooltip({
  data,
  children,
}: {
  data: CommandeTooltipData
  children: React.ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top" align="start" className="min-w-[230px]">
        <CommandeTooltipContent data={data} />
      </TooltipContent>
    </Tooltip>
  )
}

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
      <OfCommandesCell commandes={r.commandes ?? []} />
      <OfClientsCell commandes={r.commandes ?? []} />
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
  lissage,
}: {
  row: DetailCmdRow
  qtyMode: LoadQtyMode
  unit: LoadUnit
  lissage: LissageContexte
}) {
  const forecast = isForecastPulled(r.field)
  const cle = cleLigne(r.numCommande, r.ligne)
  const proposition = lissage.propositions.get(cle) ?? null
  const limite = lissage.limites.get(cle) ?? null
  const anyBusy = lissage.busy !== null
  const thisBusy = lissage.busy === cle || lissage.busy === 'lot'
  // Une ligne peut apparaître plusieurs fois (le produit fini et ses composants
  // induits passent par le même poste) : toutes portent la proposition, qui les
  // concerne toutes, mais elles désignent une seule et même date à re-dater.
  const redatee = !!r.dateOverrideIso && r.dateOverrideIso !== r.dateX3Iso
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
      <div className={cn(CELL, 'truncate font-mono text-[10px] text-secondary-foreground')}>
        {r.numCommande ? (
          <CommandeTooltip
            data={{
              numCommande: r.numCommande,
              ligne: r.ligne,
              client: r.client,
              type: forecast ? 'forecast' : 'order',
              dateLivraisonIso: r.dateIso,
              dateCommandeIso: r.dateCommandeIso,
              dateDemandeeIso: r.dateDemandeeIso,
              dateAccepteeIso: r.dateAccepteeIso,
            }}
          >
            <span className="cursor-help">
              {r.numCommande}
              {r.ligne && <span className="text-muted-foreground">/{r.ligne}</span>}
            </span>
          </CommandeTooltip>
        ) : (
          '—'
        )}
        {/* Date locale substituée à celle de X3. Le retour en arrière vit ICI,
            et non dans la colonne « Proposé » : une ligne re-datée hier doit
            pouvoir reprendre sa date X3 sans qu'on relance un calcul de plan. */}
        {redatee && r.numCommande && r.ligne && (
          <button
            type="button"
            disabled={anyBusy}
            onClick={() => lissage.onRetablir(r.numCommande!, r.ligne!)}
            className="ml-1 rounded-sm px-1 py-px font-mono text-[9px] font-bold uppercase tracking-wider disabled:opacity-45"
            style={{
              color: 'var(--color-planifie)',
              background: 'color-mix(in srgb, var(--color-planifie) 14%, transparent)',
            }}
            title={`Date locale ${fmtDateFr(r.dateOverrideIso!)} au lieu de la date X3 d’origine ${r.dateX3Iso ? fmtDateFr(r.dateX3Iso) : '—'}. Cliquer pour rétablir la date X3 d’origine.`}
          >
            {thisBusy ? '…' : 're-datée'}
          </button>
        )}
      </div>
      {/* Le badge « prév. » porte déjà la nature : ici on ne dit plus que
          l'absence de client, qui sur une prévision est structurelle.
          S'y ajoute la MOBILITÉ de la date : c'est le client qui la décide
          (ALDES = France, camions quotidiens ; tout le reste = export à départ
          hebdomadaire contractuel), donc elle se lit dans sa colonne. */}
      <div className={cn(CELL, 'flex items-center gap-1.5 truncate text-muted-foreground')}>
        {!forecast && <MobiliteBadge mobilite={r.mobilite} motif={r.motifMobilite} />}
        <span className="truncate">
          {r.client ?? (forecast ? <span className="italic">sans client</span> : '—')}
        </span>
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
            ? 'text-right font-mono tabular-nums text-foreground'
            : 'text-right font-mono tabular-nums text-secondary-foreground',
          // Gouttière de droite : seulement si cette colonne ferme la grille —
          // la colonne « Proposé » la ferme dès qu'un plan est chargé.
          unit === 'u' && !lissage.colonne && 'pr-5'
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
        <div
          className={cn(
            CELL,
            'text-right font-mono tabular-nums text-foreground',
            !lissage.colonne && 'pr-5'
          )}
        >
          {fmtH(cmdRowValue(r, 'h', qtyMode))}
        </div>
      )}
      {lissage.colonne && (
        <div className={cn(CELL, 'truncate pr-5')}>
          {proposition && r.numCommande && r.ligne ? (
            <PropositionCell
              deplacement={proposition}
              situation={situationSemaine(proposition.dateProposeeIso, lissage.lundiIso)}
              dateX3={r.dateX3Iso ? fmtDateFr(r.dateX3Iso) : null}
              applique={lissage.appliquees.has(cle)}
              disabled={anyBusy}
              busy={thisBusy}
              onAppliquer={() => lissage.onAppliquer(proposition)}
              onRetablir={() => lissage.onRetablir(r.numCommande!, r.ligne!)}
            />
          ) : limite && limite.resteeSurPlace ? (
            // L'absence de proposition a une CAUSE, et c'est une information
            // métier : le pic ne se résorbera pas par la seule négociation
            // commerciale, le levier est chez l'approvisionneur.
            <span
              className="font-mono text-[10px] font-semibold"
              style={{ color: 'var(--color-planifie)' }}
              title={`Avançable au ${limite.auPlusTotSansMatiere} sans contrainte matière, au ${limite.auPlusTot} avec. Composants : ${limite.composants
                .map((c) =>
                  c.inconnu
                    ? `${c.article} (absent de la projection)`
                    : `${c.article} dispo le ${c.disponibleLe}`
                )
                .join(' · ')}`}
            >
              matière — {limite.joursOuvresPerdus} j perdu
              {limite.joursOuvresPerdus > 1 ? 's' : ''}
            </span>
          ) : r.mobilite === 'ferme' ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {forecast ? 'prévision' : 'date ferme'}
            </span>
          ) : (
            <span
              className="font-mono text-[10px] text-muted-foreground"
              title="Le moteur n’a trouvé aucune date qui améliore le profil du poste sans en dégrader un autre jour"
            >
              —
            </span>
          )}
        </div>
      )}
    </>
  )
}

/**
 * Ligne qui ARRIVE d'une autre semaine de l'horizon.
 *
 * Symétrique de la destination datée et située d'une sortante : le panneau
 * montre une semaine, le moteur en travaille trois, et une charge qui
 * apparaîtrait dans le graphe sans jamais avoir été annoncée ici serait aussi
 * inexplicable qu'une ligne évaporée.
 */
function EntranteRow({
  deplacement: d,
  unit,
  lissage,
}: {
  deplacement: DeplacementLisible
  unit: LoadUnit
  lissage: LissageContexte
}) {
  const cle = cleLigne(d.numCommande, d.ligne)
  const anyBusy = lissage.busy !== null
  const thisBusy = lissage.busy === cle || lissage.busy === 'lot'
  const origine = situationSemaine(d.dateActuelleIso, lissage.lundiIso)
  const bord = { borderLeft: '2px solid var(--color-planifie)', paddingLeft: 'calc(1.25rem - 2px)' }
  return (
    <>
      <div
        className={cn(CELL, 'truncate pl-5 font-mono text-[11px] font-bold text-foreground')}
        style={bord}
      >
        {d.article}
      </div>
      <div className={cn(CELL, 'truncate text-muted-foreground')}>
        <span
          className="mr-1.5 rounded-sm px-1 py-px font-mono text-[9px] font-bold uppercase tracking-wider"
          style={{
            color: 'var(--color-planifie)',
            background: 'color-mix(in srgb, var(--color-planifie) 14%, transparent)',
          }}
          title="Cette ligne n’est pas dans la semaine affichée : le plan l’y ferait entrer"
        >
          entre
        </span>
        {d.designation || '—'}
      </div>
      <div className={cn(CELL, 'truncate font-mono text-[10px] text-muted-foreground')}>
        depuis {d.dateActuelle}
        {origine ? ` · ${origine}` : ''}
      </div>
      <div className={cn(CELL, 'truncate font-mono text-[10px] text-secondary-foreground')}>
        {d.numCommande}
        <span className="text-muted-foreground">/{d.ligne}</span>
      </div>
      <div className={cn(CELL, 'truncate text-muted-foreground')}>{d.client ?? '—'}</div>
      <div className={cn(CELL, 'text-muted-foreground')}>—</div>
      {/* La quantité d'une entrante n'est pas lue par ce panneau (elle vient
          d'une autre semaine) : un tiret, jamais un zéro qui se lirait comme
          une ligne vide. */}
      <div className={cn(CELL, 'text-right font-mono tabular-nums text-muted-foreground')}>—</div>
      {unit === 'h' && (
        <div className={cn(CELL, 'text-right font-mono tabular-nums text-foreground')}>
          {fmtH(d.heures)}
        </div>
      )}
      <div className={cn(CELL, 'truncate pr-5')}>
        <PropositionCell
          deplacement={d}
          situation={null}
          dateX3={d.dateActuelle}
          applique={lissage.appliquees.has(cle)}
          disabled={anyBusy}
          busy={thisBusy}
          onAppliquer={() => lissage.onAppliquer(d)}
          onRetablir={() => lissage.onRetablir(d.numCommande, d.ligne)}
        />
      </div>
    </>
  )
}

/**
 * Mobilité de la date d'une ligne : « déplaçable » ou « date ferme ».
 *
 * La règle est tranchée SERVEUR (`app/domain/load_smoothing.ts`) et voyage dans
 * le payload — la dupliquer ici ferait vivre deux versions du périmètre ALDES,
 * et c'est exactement le genre de règle qu'on ne veut pas voir diverger entre
 * l'écran qui la montre et le moteur qui l'applique.
 */
function MobiliteBadge({ mobilite, motif }: { mobilite: 'deplacable' | 'ferme'; motif: string }) {
  const deplacable = mobilite === 'deplacable'
  return (
    <span
      className="flex-none rounded-sm px-1 py-px font-mono text-[9px] font-bold uppercase tracking-wider"
      style={{
        color: deplacable ? 'var(--color-ferme)' : 'var(--color-destructive)',
        background: deplacable
          ? 'color-mix(in srgb, var(--color-ferme) 14%, transparent)'
          : 'color-mix(in srgb, var(--color-destructive) 12%, transparent)',
      }}
      title={
        deplacable
          ? `${motif} — date repositionnable (10 j ouvrés avant, 5 après)`
          : `${motif} — date non repositionnable vers l’aval`
      }
    >
      {deplacable ? 'déplaçable' : 'date ferme'}
    </span>
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

/**
 * Commandes clientes allouées à un OF — sortie du moteur de matching
 * (CommandeOFMatcher + repli contremarque X3).
 */
function OfCommandesCell({ commandes }: { commandes: DetailOfCommande[] }) {
  if (!commandes || commandes.length === 0) {
    return <div className={cn(CELL, 'truncate text-muted-foreground')}>—</div>
  }
  return (
    <div className={cn(CELL, 'truncate font-mono text-[10px]')}>
      {commandes.map((c, i) => {
        const pegue = c.raison.toLowerCase().includes('contremarque')
        const isForecast = c.type === 'forecast'
        return (
          <CommandeTooltip key={`${c.numCommande}-${c.ligne ?? ''}-${i}`} data={c}>
            <span className="mr-1.5 inline-flex cursor-help items-baseline gap-1">
              {isForecast && (
                <span
                  className="rounded-sm px-1 py-px font-mono text-[9px] font-bold uppercase tracking-wider"
                  style={{
                    color: 'var(--color-suggere)',
                    background: 'color-mix(in srgb, var(--color-suggere) 14%, transparent)',
                  }}
                >
                  prév.
                </span>
              )}
              <span
                className={cn(
                  pegue ? 'font-bold' : 'font-semibold text-secondary-foreground'
                )}
                style={pegue ? { color: 'var(--color-ferme)' } : undefined}
              >
                {c.numCommande}
                {c.ligne && <span className="text-muted-foreground">/{c.ligne}</span>}
              </span>
              {commandes.length > 1 && (
                <span className="text-muted-foreground"> {fmtQ(c.quantite)}</span>
              )}
            </span>
          </CommandeTooltip>
        )
      })}
    </div>
  )
}

function OfClientsCell({ commandes }: { commandes: DetailOfCommande[] }) {
  if (!commandes || commandes.length === 0) {
    return <div className={cn(CELL, 'truncate text-muted-foreground')}>—</div>
  }
  const clients = [...new Set(commandes.map((c) => c.client || (c.type === 'forecast' ? 'sans client' : '—')))]
  const title = clients.join(', ')
  return (
    <div className={cn(CELL, 'truncate text-muted-foreground')} title={title}>
      {clients.map((client, i) => (
        <span key={i} className={cn(client === 'sans client' && 'italic')}>
          {i > 0 ? ', ' : ''}
          {client}
        </span>
      ))}
    </div>
  )
}
