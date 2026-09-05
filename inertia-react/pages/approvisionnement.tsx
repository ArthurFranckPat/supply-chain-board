/**
 * Page « Approvisionnement » — plan besoins matières (lot 1).
 *
 * Coquille Inertia instantanée ; le calcul (projection MRP niveau par niveau —
 * besoin appelé, réceptions attendues, stock projeté, manque daté) est fetché
 * via useTimedFetch, même motif que /suivi.
 *
 * La grille montre par défaut LE MANQUE : une cellule vide veut dire « ça
 * passe ». Sur 2 600 composants × N périodes, seul ce qui coince est encré, et
 * c'est ce que le planificateur vient chercher. La vue « Besoin » reste
 * accessible pour lire le volume appelé.
 *
 * ─── Habillage : BoardUI (MCP `boardui`) ───────────────────────────────────
 * Les contrôles viennent maintenant du design system BoardUI installé sous
 * `components/base/*` : `SegmentedControl` (fenêtre / maille / vue),
 * `Dropdown` (menu Filtres), `Input` (recherche), `Button` (actions),
 * `DatePicker` (fenêtre libre), `Checkbox`, `Badge`, `Chip`, `Tooltip`,
 * `Notification` (bandeaux). Le style passe exclusivement par les tokens
 * sémantiques BoardUI (`text-text-*`, `bg-background-*`, `border-*`) et par
 * l'échelle typographique composite (`text-body-medium`, `text-caption-1-*`)
 * — jamais de classe de palette brute.
 *
 * La GRILLE elle-même est passée sur le `Table` BoardUI (primitives
 * react-aria) : voir `ApproTable` plus bas pour la géométrie des colonnes,
 * partagée par les trois tables, et la virtualisation qui la rend tenable à
 * 1118 composants. Une seule exception subsiste, faute d'équivalent BoardUI :
 * le drawer reste le `Sheet` du projet (BoardUI n'expose pas de tiroir), son
 * contenu étant lui aussi retokenisé.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { CalendarDate, parseDate } from '@internationalized/date'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  RiAlertLine,
  RiArrowDownLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiBarChartLine,
  RiBox3Line,
  RiCalendarCheckLine,
  RiCalendarLine,
  RiChatAiLine,
  RiCheckboxCircleLine,
  RiCloudOffLine,
  RiDashboardLine,
  RiEqualizer3Line,
  RiErrorWarningLine,
  RiFileDownloadLine,
  RiFileList3Line,
  RiFilter3Line,
  RiFilterOffLine,
  RiHashtag,
  RiInboxLine,
  RiListOrdered,
  RiRoadMapLine,
  RiRouteLine,
  RiSearchLine,
  RiShoppingCartLine,
  RiTruckLine,
  RiUserLine,
} from '@remixicon/react'

import AppLayout from '@r/layouts/app'
import { cx } from '@r/utils/cx'
import {
  DashboardSidebar,
  type DashboardNavGroup,
} from '@r/components/application/dashboard/dashboard-sidebar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@r/components/ui/sheet'
import { Table as RacTable } from 'react-aria-components'
import {
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@r/components/base/table/table'
import '@r/components/appro/appro-table.css'
import { SkeletonRow } from '@r/components/ui/skeleton'
import { Badge } from '@r/components/base/badges/badge'
import { Chip } from '@r/components/base/badges/chip'
import { StatusDot } from '@r/components/base/badges/status-dot'
import { Button } from '@r/components/base/buttons/button'
import { Checkbox } from '@r/components/base/checkbox/checkbox'
import { DateChipInput, formatChipDate } from '@r/components/base/date-picker/shared'
import {
  Dropdown,
  DropdownDivider,
  DropdownGroup,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from '@r/components/base/dropdown/dropdown'
import { Input } from '@r/components/base/input/input'
import { Notification } from '@r/components/base/notification/notification'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@r/components/base/segmented-control/segmented-control'
import { Tooltip, TooltipTrigger } from '@r/components/base/tooltip/tooltip'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { useDataStatusStore } from '@r/lib/data-status-store'
import { route } from '@r/lib/routes'
import { LigneFilterPill } from '@r/components/appro/ligne-filter-pill'
import {
  PANEL_ITEM,
  TRIGGER_ACTIVE,
  TRIGGER_SECONDARY,
  segmentItemDense,
} from '@r/components/appro/chrome'
import type {
  ApproBucket,
  ApproVue,
  ApproDetail,
  ApproDetailLine,
  ApproGran,
  ApproPayload,
  ApproRow,
} from '@r/lib/appro/types'

/**
 * Navigation de la sidebar — LES MÊMES liens que le masthead, en groupes.
 * Reprise 1:1 des menus du top nav (cf. `components/masthead.tsx`) : liens
 * nus (Tableau de bord, Suivi commandes) en tête sans en-tête, puis les
 * groupes Ordonnancement / Planification / Logistique / Outils. La sidebar
 * flottante vit en complément du masthead : masquée sous `lg`, elle évite de
 * dérober de la largeur sur tablette, tandis que le rail desktop offre un
 * accès latéral direct à tous les modules, sans menu déroulant.
 *
 * Icônes : Remix, même famille que les contrôles de la page (`Ri*Line`).
 * `selected="approvisionnement"` est passé au `DashboardSidebar` plus bas.
 */
const APPRO_NAV: DashboardNavGroup[] = [
  {
    items: [
      {
        key: 'dashboard',
        label: 'Tableau de bord',
        icon: RiDashboardLine,
        href: route('dashboard'),
      },
      { key: 'tracking', label: 'Suivi commandes', icon: RiTruckLine, href: route('suivi.board') },
    ],
  },
  {
    label: 'Planification',
    items: [
      { key: 'load', label: 'Charge', icon: RiBarChartLine, href: route('load.index') },
      {
        key: 'approvisionnement',
        label: 'Approvisionnement',
        icon: RiShoppingCartLine,
        href: route('approvisionnement.index'),
      },
    ],
  },
  {
    label: 'Ordonnancement',
    items: [
      {
        key: 'programme',
        label: 'Programme',
        icon: RiCalendarCheckLine,
        href: route('scheduler.programme'),
      },
      {
        key: 'sequenceur',
        label: 'Séquenceur',
        icon: RiListOrdered,
        href: route('sequenceur.index'),
      },
      {
        key: 'ruptures',
        label: 'Ruptures composants',
        icon: RiAlertLine,
        href: route('scheduler.shortage_tracker'),
      },
      {
        key: 'controle-prod',
        label: 'Contrôle prod',
        icon: RiCheckboxCircleLine,
        href: route('controle_prod.index'),
      },
    ],
  },
  {
    label: 'Logistique',
    items: [
      {
        key: 'receptions',
        label: 'Réceptions',
        icon: RiInboxLine,
        href: route('receptions.index'),
      },
      {
        key: 'conditionnements',
        label: 'Conditionnements',
        icon: RiBox3Line,
        href: route('conditionnements.index'),
      },
    ],
  },
  {
    label: 'Outils',
    items: [
      { key: 'promesse', label: 'Promesse', icon: RiRoadMapLine, href: route('promesse.show') },
      { key: 'copilote', label: 'Copilote', icon: RiChatAiLine, href: route('agent.show') },
      {
        key: 'config',
        label: 'Config',
        icon: RiEqualizer3Line,
        href: route('calendar_config.index'),
      },
    ],
  },
]

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

const VUES: { id: ApproVue; label: string; hint: string }[] = [
  {
    id: 'manque',
    label: 'Manque',
    hint: 'Ce qui manquera : besoin non couvert par le stock projeté ni par les réceptions attendues',
  },
  {
    id: 'besoin',
    label: 'Besoin',
    hint: 'Besoin appelé par les parents, déjà net de ce que leur propre stock couvre',
  },
]

const isoDay = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

/** Lundi de la semaine ISO (minuit local, via setDate : sûr en DST) — serveur. */
const mondayOf = (d: Date): Date => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

/** Numéro de semaine ISO — même algorithme que `app/utils/dates.ts`. */
const isoWeek = (d: Date): number => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
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

/** Quantités en fr-FR : séparateurs de milliers, 2 décimales max — les
 * quantités X3 peuvent être décimales (pot de graisse 23,01) mais un total
 * ne doit jamais étaler un arteact de flottant (…,200000003) : Intl arrondit. */
const frQuantite = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const fr = (n: number): string => frQuantite.format(n)

/** Valorisation stock en euros — même formatter que la fiche article dashboard. */
const fmtEuro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

/** Date de calcul du plan affiché — tampon du header de grille (`computedAt`). */
const fmtPlanDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** ISO `YYYY-MM-DD` ↔ `CalendarDate` du DatePicker BoardUI. */
const toCalendarDate = (iso: string): CalendarDate | null => {
  try {
    return parseDate(iso)
  } catch {
    return null
  }
}

type SupplyFilter = 'TOUS' | 'ACHAT' | 'FABRICATION'
/** Tri par défaut : rupture la plus proche d'abord (le serveur trie déjà
 * ainsi) — un plan se lit par l'urgence, pas par le volume. */
type SortKey = 'valeur' | 'net' | 'article'

const SUPPLY_LABEL: Record<SupplyFilter, string> = {
  TOUS: 'Tous',
  ACHAT: 'Achetés',
  FABRICATION: 'Fabriqués',
}

const SORT_LABEL: Record<SortKey, string> = {
  valeur: 'Valorisation',
  net: 'Total décroissant',
  article: 'Article A→Z',
}

/**
 * Valeur d'une cellule (ligne × période × nature).
 *
 * `fermeSeul` : quand le filtre de nature isole le carnet ferme, le manque
 * affiché est celui du SECOND passage du moteur (calculé sans les prévisions),
 * pas la part ferme du passage toutes natures. Les deux diffèrent dès qu'une
 * prévision précoce mange le stock d'un ferme tardif — et c'est bien la
 * première qui répond à « que dois-je si je ne crois que le carnet ».
 */
const vueOf = (
  row: ApproRow,
  vue: ApproVue,
  i: number,
  ferme: boolean,
  fermeSeul = false
): number => {
  if (vue === 'besoin') return ferme ? row.besoinFerme[i] : row.besoinPrevi[i]
  if (ferme) return fermeSeul ? row.manqueFermeSeul[i] : row.manqueFerme[i]
  return row.manquePrevi[i]
}

/** Nature du besoin — masque d'affichage de la grille (Ferme = engagé,
 * Prévision = hypothèse ; cf. en-têtes de sous-colonnes). */
type Nature = 'TOUS' | 'FERME' | 'PREVISION'

const NATURE_LABEL: Record<Nature, string> = {
  TOUS: 'Toutes',
  FERME: 'Ferme',
  PREVISION: 'Prévision',
}

/** La nature est-elle affichée sous le filtre de nature courant ? */
const natureOn = (n: Nature, ferme: boolean): boolean => n === 'TOUS' || (n === 'FERME') === ferme

/** Total de la vue pour les seules natures affichées — le Total de ligne, le
 * tri « total décroissant » et le pied suivent ce que la grille montre. */
const vueTotalOn = (row: ApproRow, vue: ApproVue, n: Nature): number => {
  const sum = (ferme: boolean): number => {
    let t = 0
    for (let i = 0; i < row.solde.length; i++) t += vueOf(row, vue, i, ferme, n === 'FERME')
    return t
  }
  return (natureOn(n, true) ? sum(true) : 0) + (natureOn(n, false) ? sum(false) : 0)
}

/** Manque pour les seules natures affichées — le rose de la grille et la chip
 * « N manques » portent la même lecture. */
const manqueTotalOn = (row: ApproRow, n: Nature): number => vueTotalOn(row, 'manque', n)

/** Total des arrivées attendues sur la fenêtre. */
const arriveesTotal = (row: ApproRow): number => row.arrivees.reduce((s, v) => s + v, 0)

/**
 * Première période en manque, sous le filtre de nature courant. Le filtre
 * « Ferme » lit la rupture du passage ferme-seul : elle peut être PLUS TARDIVE
 * que la rupture toutes natures, et c'est le point — une rupture causée par une
 * prévision n'engage pas le carnet.
 */
const ruptureIdx = (row: ApproRow, n: Nature): number =>
  n === 'FERME' ? row.ruptureFermeAt : row.ruptureAt

/**
 * État initial repris de la query string — c'est ce qui rend le lien « Plan
 * complet » de /charge utile : il arrive sur la MÊME fenêtre, la MÊME maille et
 * la MÊME ligne que le contrôle matières du poste qu'on regardait. Sans ça, le
 * lien rouvrirait un plan par défaut et il faudrait tout resaisir.
 *
 * Lecture unique au montage (pas de synchronisation permanente URL ↔ état) :
 * la page reste maîtresse de ses filtres une fois ouverte.
 */
function initialFromUrl(): {
  ligne: string | null
  range: { from: string; to: string } | null
  gran: ApproGran | null
} {
  if (typeof window === 'undefined') return { ligne: null, range: null, gran: null }
  const q = new URLSearchParams(window.location.search)
  const from = q.get('from')
  const to = q.get('to')
  const gran = q.get('gran')
  const iso = /^\d{4}-\d{2}-\d{2}$/
  return {
    ligne: q.get('ligne')?.trim() || null,
    range: from && to && iso.test(from) && iso.test(to) ? { from, to } : null,
    gran: gran === 'jour' || gran === 'semaine' || gran === 'mois' ? gran : null,
  }
}

export default function Approvisionnement() {
  const today = useMemo(() => new Date(), [])
  const boot = useMemo(initialFromUrl, [])
  // Fenêtre par défaut « 2 semaines » : la question du planificateur porte sur
  // l'immédiat (aujourd'hui → 13 jours), pas sur le mois suivant. Une fenêtre
  // portée par l'URL passe en préréglage « Libre » — elle ne correspond à aucun
  // préréglage nommé, et prétendre le contraire mentirait sur ce qui est calculé.
  const [preset, setPreset] = useState<Preset>(boot.range ? 'libre' : '2sem')
  const [custom, setCustom] = useState(() => boot.range ?? presetRange('libre', new Date()))
  const [gran, setGran] = useState<ApproGran>(boot.gran ?? 'semaine')
  const [vue, setVue] = useState<ApproVue>('manque')
  const [query, setQuery] = useState('')
  const [supply, setSupply] = useState<SupplyFilter>('ACHAT')
  const [manquesOnly, setManquesOnly] = useState(false)
  // Nature du besoin affichée — masque client : la grille retire les
  // sous-colonnes de l'autre nature, totaux et signaux suivent.
  const [nature, setNature] = useState<Nature>('TOUS')
  // Ligne de production retenue (poste 1ʳᵉ op) — null = toutes. Filtre
  // SERVEUR : il entre dans l'URL, le plan est recalculé sur la population
  // de la ligne (quantités exactes), l'écran garde le plan précédent pendant
  // le re-fetch (même doctrine que le reste de la page).
  const [ligne, setLigne] = useState<string | null>(boot.ligne)
  const [sort, setSort] = useState<SortKey>('net')
  const [selected, setSelected] = useState<string | null>(null)
  // Tri au clic sur un sous-en-tête de période (Ferme/Prév., décroissant) —
  // prioritaire sur le tri du menu tant qu'il désigne une période visible.
  // Choisir un tri du menu l'efface, sinon le menu semblerait sans effet.
  const [sortPeriod, setSortPeriod] = useState<{ i: number; ferme: boolean } | null>(null)
  // Périodes entièrement à zéro repliées (vue courante, lignes filtrées).
  const [showEmptyPeriods, setShowEmptyPeriods] = useState(true)

  const range = preset === 'libre' ? custom : presetRange(preset, today)
  const granAllowed = (g: ApproGran): boolean => (countPeriods(range.from, range.to, g) ?? 99) <= 14
  // Maille effective DÉRIVÉE (pas d'état, pas de double fetch) : repli sur la
  // plus fine encore permise quand le choix dépasse le plafond — signalé par
  // le liseré, jamais corrigé en silence.
  const effGran: ApproGran = granAllowed(gran)
    ? gran
    : ((['jour', 'semaine', 'mois'] as ApproGran[]).find((g) => granAllowed(g)) ?? gran)
  const folded = effGran !== gran
  const overCap = !granAllowed(effGran)

  // Libellés du déclencheur « Période ». La fenêtre libre s'énonce par ses
  // bornes (« 04/09/2026 → 17/09/2026 ») et non par le mot « Libre », qui ne
  // dirait rien de ce qui est calculé.
  const from = toCalendarDate(range.from)
  const to = toCalendarDate(range.to)
  const windowLabel =
    preset === 'libre' && from && to
      ? `${formatChipDate(from)} → ${formatChipDate(to)}`
      : (PRESETS.find((p) => p.id === preset)?.label ?? '')
  const granLabel = GRANS.find((g) => g.id === gran)?.label ?? ''
  const effGranLabel = GRANS.find((g) => g.id === effGran)?.label ?? ''

  // Même geste, même chemin que le ⟳ du masthead (cf. tracking.tsx) : le bump
  // incrémente le nonce, qui relance le fetch AVEC ?refresh (force le re-fetch
  // X3 côté serveur au lieu du cache SWR).
  //
  // Le nonce est GLOBAL et monotone : le comparer à zéro rendait le forçage
  // COLLANT — après un seul ⟳, chaque changement de fenêtre, de maille ou de
  // ligne repartait en `?refresh` pour le reste de la session, donc en purge des
  // caches board et en requête ZSOAPSQL complète à chaque geste de toolbar. On
  // le compare donc au nonce observé quand la question courante a été POSÉE :
  // seul l'écart créé par un clic ⟳ vaut forçage. `asked` est réajusté pendant
  // le rendu (motif React d'état dérivé) et non dans un effet, sans quoi le
  // changement de filtre déclencherait d'abord un fetch forcé, puis un second.
  const bust = useDataStatusStore((s) => s.nonce)
  const question = `${range.from}|${range.to}|${effGran}|${ligne ?? ''}`
  const [asked, setAsked] = useState({ question, nonce: bust })
  if (asked.question !== question) setAsked({ question, nonce: bust })
  const forced = asked.question === question && bust > asked.nonce
  const url = overCap
    ? null
    : `${route('material.plan')}?from=${range.from}&to=${range.to}&gran=${effGran}${ligne ? `&ligne=${encodeURIComponent(ligne)}` : ''}${forced ? `&refresh=${bust}` : ''}`
  const { data, loading, error, elapsed } = useTimedFetch<ApproPayload>(url)
  const view = useMemo(() => data?.rows ?? [], [data])

  const filtered = useMemo(() => {
    const q = fold(query.trim())
    return view.filter((r) => {
      if (supply !== 'TOUS' && r.supplyType !== supply) return false
      if (manquesOnly && manqueTotalOn(r, nature) <= 0) return false
      if (q && !fold(`${r.article} ${r.description}`).includes(q)) return false
      return true
    })
  }, [view, query, supply, manquesOnly, nature])

  // Périodes vides pour la vue courante, sur les lignes filtrées (l'ordre du tri
  // ne change pas l'appartenance, donc calculé avant tri, sans cycle).
  const emptyIdx = useMemo(() => {
    const s = new Set<number>()
    const n = data?.buckets.length ?? 0
    for (let i = 0; i < n; i++) {
      let empty = true
      for (const r of filtered) {
        if (
          (natureOn(nature, true) && vueOf(r, vue, i, true, nature === 'FERME') !== 0) ||
          (natureOn(nature, false) && vueOf(r, vue, i, false) !== 0)
        ) {
          empty = false
          break
        }
      }
      if (empty) s.add(i)
    }
    return s
  }, [data, filtered, vue, nature])

  const visIdx = useMemo(
    () =>
      (data?.buckets ?? []).map((_, i) => i).filter((i) => showEmptyPeriods || !emptyIdx.has(i)),
    [data, showEmptyPeriods, emptyIdx]
  )

  // Tri période effectif : ignoré si sa colonne est repliée (il reprend en
  // réaffichant les périodes vides, sans perdre le choix) ou si sa nature est
  // masquée par le filtre de nature (même doctrine : le choix reprend au
  // réaffichage, il n'est jamais corrigé en silence).
  const effSort =
    sortPeriod && visIdx.includes(sortPeriod.i) && natureOn(nature, sortPeriod.ferme)
      ? sortPeriod
      : null

  const rows = useMemo(() => {
    const out = [...filtered]
    // Valorisation : décroissante, PMP inconnu en dernier (pas de valeur = pas
    // de priorité financière, jamais l'inverse).
    out.sort((a, b) => {
      if (effSort) {
        const d =
          vueOf(b, vue, effSort.i, effSort.ferme, nature === 'FERME') -
          vueOf(a, vue, effSort.i, effSort.ferme, nature === 'FERME')
        return d !== 0 ? d : a.article.localeCompare(b.article)
      }
      if (sort === 'article') return a.article.localeCompare(b.article)
      if (sort === 'valeur') {
        if (a.valeur == null && b.valeur == null) return 0
        if (a.valeur == null) return 1
        if (b.valeur == null) return -1
        return b.valeur - a.valeur
      }
      return vueTotalOn(b, vue, nature) - vueTotalOn(a, vue, nature)
    })
    return out
  }, [filtered, sort, vue, effSort, nature])

  // Filtres secondaires uniquement (hors recherche + pill ligne, toujours
  // visibles) — même doctrine que suivi : un filtre est « actif » quand il
  // s'écarte du défaut.
  const filtersActive =
    supply !== 'ACHAT' ||
    manquesOnly ||
    nature !== 'TOUS' ||
    sort !== 'net' ||
    ligne !== null ||
    !showEmptyPeriods ||
    sortPeriod !== null
  const isFiltered = !!query.trim() || filtersActive

  const resetFilters = () => {
    setQuery('')
    setSupply('ACHAT')
    setManquesOnly(false)
    setNature('TOUS')
    setLigne(null)
    setSort('net')
    setSortPeriod(null)
    setShowEmptyPeriods(true)
  }

  const manquesCount = useMemo(
    () => view.filter((r) => manqueTotalOn(r, nature) > 0).length,
    [view, nature]
  )

  return (
    <AppLayout
      title="Approvisionnement"
      active="approvisionnement"
      subtitle="Approvisionnement · Besoins matières"
      theme="airbnb"
      dense
      scrollable={false}
      hideMasthead
    >
      {/* Layout BoardUI sans topbar : le Masthead est masqué (`hideMasthead`),
          le `DataStatus` (`màj 21:12 · il y a 15 min · chargé en 50 ms`) vit
          désormais dans le footer du `DashboardSidebar` (remplace le
          `Board team`). Le rail est masqué sous `lg` mais la page reste
          navigable via URL directe sur mobile — le dense board privilégie
          la largeur de grille. */}
      <div className="flex h-full min-h-0 gap-3 bg-background-full p-3">
        <div className="hidden shrink-0 lg:flex">
          <DashboardSidebar selected="approvisionnement" items={APPRO_NAV} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default shadow-card">
          <div className="flex h-full min-h-0 flex-col bg-background-secondary-default">
            {/* ═══ Toolbar ═══
            Deux groupes, et c'est structurel : les contrôles BoardUI sont
            plus larges que les pills 12 px d'avant, donc la rangée déborde
            aux fenêtres étroites. Le groupe GAUCHE défile horizontalement ;
            le groupe DROITE (recherche, compteurs, ⟳) est épinglé — sinon il
            sort de l'écran et devient inatteignable sans scroller la barre,
            ce qu'aucun raccourci ne rattrape. */}
            <div
              data-print-toolbar
              className="flex min-h-[48px] flex-none select-none items-center gap-2 border-b border-separator-border bg-background-primary-default px-5 py-2"
            >
              <div className="no-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto">
                {/* ─── Menu « Période » : fenêtre + dates libres + maille ───
                Trois contrôles (9 segments, ~600 px) repliés en un seul
                déclencheur qui énonce l'état courant. La maille affichée est
                la maille EFFECTIVE : quand le plafond de 14 périodes replie
                le choix de l'utilisateur, c'est celle-ci qui décrit ce que
                l'écran montre — passée en ambre, avec la raison au survol. */}
                <Dropdown>
                  <DropdownTrigger
                    aria-label={`Période : ${windowLabel}, maille ${effGranLabel}`}
                    className={cx(TRIGGER_SECONDARY, 'shrink-0')}
                  >
                    <RiCalendarLine
                      className="size-4 shrink-0 text-foreground-icon-secondary"
                      aria-hidden
                    />
                    <span>{windowLabel}</span>
                    <span className="text-text-tertiary">·</span>
                    <span
                      className={cx(folded && 'text-status-yellow-text')}
                      title={
                        folded
                          ? `Maille repliée sur ${effGranLabel} (plafond 14 périodes) — votre choix (${granLabel}) est conservé pour les fenêtres plus courtes.`
                          : undefined
                      }
                    >
                      {effGranLabel}
                    </span>
                    <RiArrowDownSLine
                      className="size-4 shrink-0 text-foreground-icon-secondary"
                      aria-hidden
                    />
                  </DropdownTrigger>
                  <DropdownPopover aria-label="Période">
                    <DropdownGroup label="Fenêtre">
                      {PRESETS.map((pr) => (
                        <DropdownItem
                          key={pr.id}
                          selected={preset === pr.id}
                          onSelect={() => setPreset(pr.id)}
                          className={PANEL_ITEM}
                        >
                          {pr.label}
                        </DropdownItem>
                      ))}
                    </DropdownGroup>
                    {preset === 'libre' && from && to && (
                      // Saisie TEXTE (`DateChipInput`, le champ que BoardUI met
                      // lui-même dans son calendrier) et pas le `DatePicker` :
                      // celui-ci ouvre son propre popover, portalé hors du menu —
                      // le premier clic dedans est vu comme un clic « dehors » et
                      // referme le menu. Un calendrier imbriqué demanderait de
                      // trouer la fermeture du Dropdown ; le format jj/mm/aaaa est
                      // de toute façon la convention de dates du board.
                      <div className="flex items-center gap-1.5 px-2 pt-1.5">
                        <DateChipInput
                          date={from}
                          label="Début de fenêtre"
                          onCommit={(d) => setCustom((c) => ({ ...c, from: d.toString() }))}
                        />
                        <span className="text-caption-1-medium text-text-tertiary">→</span>
                        <DateChipInput
                          date={to}
                          label="Fin de fenêtre"
                          onCommit={(d) => setCustom((c) => ({ ...c, to: d.toString() }))}
                        />
                      </div>
                    )}
                    <DropdownDivider />
                    <DropdownGroup label="Maille">
                      {GRANS.map((g) => {
                        const ok = granAllowed(g.id)
                        return (
                          <DropdownItem
                            key={g.id}
                            selected={gran === g.id}
                            onSelect={() => ok && setGran(g.id)}
                            className={cx(
                              PANEL_ITEM,
                              'justify-between',
                              !ok && 'cursor-not-allowed text-text-disabled'
                            )}
                          >
                            {g.label}
                            {!ok && (
                              <span className="text-caption-2-medium text-text-tertiary">
                                hors plafond
                              </span>
                            )}
                          </DropdownItem>
                        )
                      })}
                    </DropdownGroup>
                  </DropdownPopover>
                </Dropdown>

                <SegmentedControl
                  aria-label="Vue de quantité"
                  className="shrink-0"
                  selectedKeys={[vue]}
                  onSelectionChange={(keys) => {
                    const next = [...keys][0] as ApproVue | undefined
                    if (next) setVue(next)
                  }}
                >
                  {VUES.map((c) => (
                    <TooltipTrigger key={c.id}>
                      <SegmentedControlItem id={c.id} className={segmentItemDense}>
                        {c.label}
                      </SegmentedControlItem>
                      <Tooltip>{c.hint}</Tooltip>
                    </TooltipTrigger>
                  ))}
                </SegmentedControl>

                {/* ─── Menu Filtres (filtres secondaires) ─── */}
                <Dropdown>
                  <DropdownTrigger
                    aria-label="Filtres"
                    className={cx(TRIGGER_SECONDARY, 'shrink-0', filtersActive && TRIGGER_ACTIVE)}
                  >
                    <RiFilter3Line
                      className="size-4 shrink-0 text-foreground-icon-secondary"
                      aria-hidden
                    />
                    <span>Filtres</span>
                    {filtersActive && (
                      <span className="ml-0.5 size-1.5 rounded-full bg-accent-500" aria-hidden />
                    )}
                  </DropdownTrigger>
                  <DropdownPopover aria-label="Filtres">
                    <DropdownGroup label="Type">
                      {(['TOUS', 'ACHAT', 'FABRICATION'] as SupplyFilter[]).map((s) => (
                        <DropdownItem
                          key={s}
                          selected={supply === s}
                          onSelect={() => setSupply(s)}
                          className={PANEL_ITEM}
                        >
                          {SUPPLY_LABEL[s]}
                        </DropdownItem>
                      ))}
                    </DropdownGroup>
                    <DropdownDivider />
                    {/* Nature du besoin : retire les sous-colonnes de l'autre
                        nature (masque client — contrairement à Ligne, pas de
                        refetch, les totaux restent ceux de la population). */}
                    <DropdownGroup label="Nature">
                      {(['TOUS', 'FERME', 'PREVISION'] as Nature[]).map((n) => (
                        <DropdownItem
                          key={n}
                          selected={nature === n}
                          onSelect={() => setNature(n)}
                          className={PANEL_ITEM}
                        >
                          {NATURE_LABEL[n]}
                        </DropdownItem>
                      ))}
                    </DropdownGroup>
                    <DropdownDivider />
                    <DropdownGroup label="Affichage">
                      <Checkbox
                        size="sm"
                        className={cx('w-full justify-between', PANEL_ITEM)}
                        isSelected={manquesOnly}
                        onChange={setManquesOnly}
                      >
                        <span className="flex flex-1 items-center justify-between gap-2">
                          <span className="text-body-medium text-text-primary">Manques seuls</span>
                          {manquesCount > 0 && (
                            <Badge
                              color={manquesOnly ? 'primary' : 'neutral'}
                              className="tabular-nums"
                              title="Composants dont le manque projeté est non nul"
                            >
                              {manquesCount}
                            </Badge>
                          )}
                        </span>
                      </Checkbox>
                      <Checkbox
                        size="sm"
                        className={cx('w-full justify-between', PANEL_ITEM)}
                        isSelected={showEmptyPeriods}
                        onChange={setShowEmptyPeriods}
                      >
                        <span className="flex flex-1 items-center justify-between gap-2">
                          <span className="text-body-medium text-text-primary">Périodes vides</span>
                          {emptyIdx.size > 0 && (
                            <Badge
                              color={showEmptyPeriods ? 'neutral' : 'primary'}
                              className="tabular-nums"
                              title="Périodes sans valeur pour la vue courante"
                            >
                              {emptyIdx.size}
                            </Badge>
                          )}
                        </span>
                      </Checkbox>
                    </DropdownGroup>
                    <DropdownDivider />
                    <DropdownGroup label="Tri">
                      {(['valeur', 'net', 'article'] as SortKey[]).map((k) => (
                        <DropdownItem
                          key={k}
                          selected={sort === k && sortPeriod === null}
                          onSelect={() => {
                            setSort(k)
                            setSortPeriod(null)
                          }}
                          className={PANEL_ITEM}
                        >
                          {SORT_LABEL[k]}
                        </DropdownItem>
                      ))}
                    </DropdownGroup>
                  </DropdownPopover>
                </Dropdown>

                {/* Filtre ligne de production — dropdown dédié, masqué si la fenêtre
                ne porte aucune ligne routée. Serveur : voir commentaire du state. */}
                {(data?.lignes.length ?? 0) > 0 && (
                  <LigneFilterPill lignes={data?.lignes ?? []} value={ligne} onChange={setLigne} />
                )}
              </div>

              {/* Groupe épinglé — jamais poussé hors écran par le groupe gauche.
              Ni chrono de chargement ni ⟳ ici : le masthead porte déjà les
              deux (« chargé en 59 ms » + un bouton câblé sur le MÊME
              `bump()` du data-status-store). Les répéter dans la barre
              n'ajoutait rien qu'un doublon dans un espace disputé. */}
              <div className="flex shrink-0 items-center gap-2">
                {/* Squelette de la couche d'action (UI seule, passe 1) : le
                    bouton annonce la sortie Excel attendue par les
                    planificateurs ; le branchement (génération XLSX serveur,
                    fenêtre/vue/filtres courants) arrive en passe 2.
                    aria-disabled et pas disabled : l'élément reste focusable,
                    le tooltip reste lisible au clavier et au survol. */}
                <TooltipTrigger>
                  <Button
                    variant="secondary"
                    size="small"
                    leadingIcon={RiFileDownloadLine}
                    aria-disabled
                    className="shrink-0"
                  >
                    Exporter
                  </Button>
                  <Tooltip>Export XLSX du plan courant — branchement backend à venir</Tooltip>
                </TooltipTrigger>
                <Input
                  size="small"
                  aria-label="Rechercher un composant"
                  placeholder="Article, désignation…"
                  leadingIcon={RiSearchLine}
                  className="w-[200px]"
                  fieldClassName="[&_svg]:size-4 [&_input]:text-caption-1-medium !bg-background-primary-default !ring-1 !ring-border-button-default"
                  value={query}
                  onChange={setQuery}
                />

                {isFiltered && (
                  <span className="font-mono text-caption-1-semibold tabular-nums text-accent-600">
                    {rows.length}
                    <span className="text-text-tertiary"> / {view.length}</span>
                  </span>
                )}
                {loading && (
                  <span className="font-mono text-caption-1-medium tabular-nums text-text-secondary">
                    {elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${elapsed}ms`}
                  </span>
                )}
              </div>
            </div>

            {/* ═══ Bandeaux ═══
            `Notification` BoardUI en bandeau inline : non refermable (l'état
            qu'il décrit n'est pas dismissible, il disparaît quand la cause
            disparaît) et sans coins ni ombre flottante, pour lire comme une
            barre pleine largeur sous la toolbar. */}
            {(data?.x3Error || overCap || (folded && !overCap)) && (
              <div className="flex flex-none flex-col gap-2 border-b border-separator-border bg-background-secondary-default px-5 py-2.5">
                {data?.x3Error && (
                  <Notification
                    status="error"
                    dismissible={false}
                    className="rounded-xl p-3 pr-3 shadow-none"
                    title="Erreur de chargement"
                    description={<span className="font-mono">{data.x3Error}</span>}
                  />
                )}
                {/* Sélection hors plafond : bandeau, PAS remplacement — le dernier
                plan calculé reste affiché, le calcul est suspendu (url null). */}
                {overCap && (
                  <Notification
                    status="neutral"
                    icon={RiAlertLine}
                    dismissible={false}
                    className="rounded-xl p-3 pr-3 shadow-none"
                    title="Sélection hors plafond"
                    description="14 périodes max — dernier plan affiché, élargissez la maille ou réduisez la fenêtre pour recalculer."
                  />
                )}
                {folded && !overCap && (
                  <p className="px-1 text-caption-1-regular text-text-secondary">
                    Maille repliée sur {GRANS.find((g) => g.id === effGran)?.label} (plafond 14
                    périodes) — votre choix ({GRANS.find((g) => g.id === gran)?.label}) est conservé
                    pour les fenêtres plus courtes.
                  </p>
                )}
              </div>
            )}

            {/* ═══ Table ═══
            Le plan précédent reste affiché pendant le re-fetch (donnée gardée
            par useTimedFetch) : changer de filtre ne vide jamais l'écran. */}
            {loading && !data ? (
              <div className="flex-1 overflow-hidden p-5">
                <SkeletonRow count={6} />
              </div>
            ) : error && !data ? (
              <EmptyState
                icon={RiCloudOffLine}
                title="Erreur de connexion Sage X3"
                body="Impossible de récupérer le plan besoins depuis le serveur ERP Sage X3."
              />
            ) : !data ? (
              <EmptyState
                icon={RiErrorWarningLine}
                title="Fenêtre trop large pour cette maille"
                body="Plafond 14 périodes : élargissez la maille ou réduisez la fenêtre."
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={RiSearchLine}
                title="Aucun résultat trouvé"
                body="Aucun composant ne correspond aux filtres ou à la recherche actuels."
                action={
                  <Button
                    variant="secondary"
                    size="small"
                    leadingIcon={RiFilterOffLine}
                    onClick={resetFilters}
                  >
                    Réinitialiser les filtres
                  </Button>
                }
              />
            ) : (
              data && (
                // Plan périmé (hors plafond) : la grille reste lisible et
                // copiable (doctrine « dernier plan affiché ») mais visuellement
                // retirée, pour ne pas confondre plan affiché et sélection.
                <div className={cx('min-h-0 flex-1 overflow-hidden p-5', overCap && 'opacity-70')}>
                  <ApproTable
                    buckets={data.buckets}
                    visIdx={visIdx}
                    rows={rows}
                    vue={vue}
                    sortPeriod={effSort}
                    onSortPeriod={setSortPeriod}
                    selected={selected}
                    onSelect={setSelected}
                    manquesOnly={manquesOnly}
                    onToggleManques={() => setManquesOnly((v) => !v)}
                    nature={nature}
                    computedAt={data.computedAt ?? null}
                    stale={overCap}
                  />
                </div>
              )
            )}
            {/* Drawer « appelé par » — même motif que le diagnostic de ligne suivi. */}
            <ApproDetailSheet
              article={selected}
              version={data?.version ?? null}
              from={range.from}
              to={range.to}
              onClose={() => setSelected(null)}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

/** État vide / erreur — cercle d'icône + titre + corps, en tokens BoardUI. */
function EmptyState(props: {
  icon: ComponentType<{ className?: string }>
  title: string
  body: string
  action?: ReactNode
}) {
  const Icon = props.icon
  return (
    <div className="flex flex-1 items-center justify-center p-12 text-center">
      <div className="flex flex-col items-center">
        <span className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-background-tertiary-default text-foreground-icon-tertiary">
          <Icon className="size-7" />
        </span>
        <h3 className="mb-1 text-headline-semibold text-text-primary">{props.title}</h3>
        <p className="mb-5 max-w-sm text-body-regular text-text-secondary">{props.body}</p>
        {props.action}
      </div>
    </div>
  )
}

/**
 * Teinte d'intensité d'une cellule de période, NORMALISÉE PAR LIGNE.
 *
 * Une grille de besoins matières est une carte de chaleur par nature : ce
 * qu'on cherche à voir d'un coup d'œil, c'est QUAND un composant est appelé,
 * pas seulement combien. La normalisation est donc par ligne (le maximum de
 * CE composant sur la fenêtre) et jamais globale : sans ça, les articles à
 * gros volumes écrasent tous les autres et la grille redevient uniforme.
 *
 * Plafonné à 18 % : au-delà, le fond mange les chiffres — la couleur doit
 * rester une lecture périphérique, la valeur exacte reste le texte.
 * Ferme et Prévision prennent deux familles distinctes (accent / violet) :
 * c'est la distinction structurante de la grille, engagement vs hypothèse.
 */
const heatStyle = (value: number, rowMax: number, ferme: boolean) => {
  if (value <= 0 || rowMax <= 0) return undefined
  const pct = Math.round((value / rowMax) * 18)
  if (pct <= 0) return undefined
  const hue = ferme ? 'var(--color-accent-500)' : 'var(--color-purple-500)'
  return { backgroundColor: `color-mix(in oklab, ${hue} ${pct}%, transparent)` }
}

/**
 * Survol en croix — feuille de style INJECTÉE, pas un état React.
 *
 * La colonne survolée change à chaque cellule que le pointeur traverse, donc
 * en continu pendant un défilement horizontal. La porter en `useState`
 * re-rendait les ~50 lignes montées × ~34 cellules à chaque événement, et une
 * cellule react-aria n'est pas un `<td>` : elle monte `usePress`, `useHover`,
 * `useFocusRing`, `useTableCell`. Une règle CSS réécrite dans un `<style>`
 * local fait le même travail en une passe de recalcul de style — et elle
 * s'applique d'office aux lignes que la virtualisation montera ensuite, ce
 * qu'un `className` calculé au rendu ne sait pas faire.
 *
 * Les clés : une colonne de période vaut `${période}-ferme|prevision`, le
 * bandeau porte la période nue en `data-group`. D'où les trois sélecteurs —
 * la colonne elle-même, ses sous-colonnes (survol depuis le bandeau), son
 * en-tête de groupe (survol depuis le corps).
 *
 * `!important` assumé : c'est une surcouche momentanée qui doit battre le
 * zébrage, le survol de ligne et la sélection sans qu'on ait à réviser sa
 * spécificité à chaque évolution de `appro-table.css`.
 */
const washCss = (key: string): string => {
  // Ces clés viennent du payload (`bucket.key`) et finissent dans un sélecteur
  // CSS : on ne concatène que ce dont la forme est certaine.
  if (!/^[\w-]+$/.test(key)) return ''
  const group = key.replace(/-(ferme|prevision)$/, '')
  const attrs = [`[data-col="${key}"]`, `[data-col^="${key}-"]`]
  if (group !== key) attrs.push(`[data-group="${group}"]`)
  const sel = (prefix: string): string => attrs.map((a) => prefix + a).join(',')
  const translucide =
    'color-mix(in srgb, var(--color-background-secondary-default) 70%, transparent)'
  // Les cellules figées ont du contenu qui défile dessous : leur lavis doit
  // être recomposé en couleur solide, comme tous leurs autres états.
  const opaque =
    'color-mix(in srgb, var(--color-background-secondary-default) 70%,' +
    ' var(--color-background-primary-default))'
  return (
    `${sel('table.appro-grid th')},${sel('table.appro-grid td')},` +
    `${sel('table.appro-strip th')},${sel('table.appro-foot td')}` +
    `{background-color:${translucide}!important}` +
    `${sel('table.appro-grid td.stick')}` +
    `{background-color:${opaque}!important}`
  )
}

/**
 * ═══ Géométrie de la grille — SOURCE UNIQUE ═══
 *
 * Trois tables se superposent en colonnes : le bandeau des périodes, le corps
 * BoardUI, le pied de totaux. React-aria ne groupe pas les colonnes et n'a ni
 * pied ni bandeau : il FAUT trois tables, donc il faut une seule définition de
 * largeurs — sans quoi elles dérivent les unes des autres (c'était le défaut
 * de la première passe : `<col width=825>` au bandeau, `w-[110px]…` au pied,
 * et RIEN au corps, laissé en auto sous un `table-layout: fixed`).
 *
 * Règle : toute largeur de colonne de la grille vient d'ici, et de nulle part
 * ailleurs. Les décalages des colonnes figées (`STICK_LEFT`) en sont des
 * sommes préfixes, jamais des constantes recopiées.
 */
const COL_W = {
  article: 132,
  description: 240,
  type: 108,
  stock: 92,
  arrivees: 100,
  rupture: 104,
  valeur: 100,
  total: 124,
  ferme: 88,
  prevision: 72,
} as const

/** Colonnes de tête, dans l'ordre du DOM. */
const LEAD_KEYS = [
  'article',
  'description',
  'type',
  'stock',
  'arrivees',
  'rupture',
  'valeur',
  'total',
] as const
type LeadKey = (typeof LEAD_KEYS)[number]

/** Largeur du bloc de tête — pas une constante : la somme des colonnes. */
const LEAD_W = LEAD_KEYS.reduce((a, k) => a + COL_W[k], 0)

/** Décalages des deux colonnes figées = sommes préfixes de `LEAD_KEYS`. */
const STICK_LEFT: Record<'article' | 'description', number> = {
  article: 0,
  description: COL_W.article,
}

/**
 * Hauteur de ligne, en pixels — plancher CSS (`--appro-row-h`) ET estimation
 * initiale du virtualiseur, pour que la barre de défilement ait la bonne
 * longueur dès le premier rendu. Les lignes montées sont ensuite mesurées.
 *
 * `appro-table.css` interdit par ailleurs le retour à la ligne dans le corps
 * (`nowrap` + `overflow: hidden`) : une désignation longue allonge la ligne,
 * pas la hauteur — sans quoi la grille perdrait son pas régulier et les
 * périodes ne se liraient plus en colonnes.
 */
const ROW_H = 28

/**
 * Table besoins sur primitives BoardUI Table (react-aria).
 *
 * Le `Table` BoardUI est utilisé SANS son wrapper (racine RAC directe +
 * classe `bui-table`) : le wrapper impose son propre scroll et n'accepte que
 * Header/Body en enfants — incompatible avec le bandeau de périodes et le
 * pied de totaux, qui doivent partager la même géométrie horizontale.
 *
 * Trois tables synchronisées en x sur `COL_W` (cf. ci-dessus) :
 *  1. le bandeau des périodes (vrai `colSpan`, table HTML simple — react-aria
 *     ne groupe pas les colonnes), défilé par `syncX` ;
 *  2. le corps BoardUI (navigation clavier, tri au clic, survol en croix),
 *     seul conteneur réellement scrollable ;
 *  3. le pied de totaux, hors du conteneur de scroll (il y était `sticky
 *     bottom-0` : la barre de défilement horizontale le mangeait), défilé par
 *     `syncX` lui aussi.
 *
 * Bandeau et pied n'ayant pas d'ascenseur vertical, ils sont plus étroits que
 * le corps de la largeur de sa barre de défilement : `gutter` la mesure et la
 * leur rend en `padding-right`, sinon l'alignement casse en fin de course.
 *
 * VIRTUALISATION — 1118 composants × ~34 colonnes = ~38 000 cellules : la
 * pagination de la première passe était un contournement, pas une réponse
 * (elle coupait aussi le tri visuel et obligeait à connaître le numéro de
 * page d'un article). Le corps ne monte plus que la fenêtre visible
 * (@tanstack/react-virtual), encadrée de deux lignes-cales `.pad` — le motif
 * du `DataTable` maison, transposé aux primitives RAC (`Cell` accepte
 * `colSpan` depuis RAC 1.6, la validation « cell count must match column
 * count » en tient compte).
 *
 * Styles directs (sticky, fonds d'état, filets, densité) :
 * `components/appro/appro-table.css` — `.bui-table` n'étant pas layerisé, les
 * utilitaires perdraient contre lui. Couleurs/typo du CONTENU en utilitaires
 * sur les spans internes (aucune règle `.bui-table` ne les vise).
 */
function ApproTable(props: {
  buckets: ApproBucket[]
  /** Indices des périodes affichées (les périodes vides peuvent être repliées). */
  visIdx: number[]
  rows: ApproRow[]
  vue: ApproVue
  sortPeriod: { i: number; ferme: boolean } | null
  onSortPeriod: (s: { i: number; ferme: boolean } | null) => void
  selected: string | null
  onSelect: (article: string | null) => void
  /** État + bascule du filtre « manques seuls » — portés par la chip du header. */
  manquesOnly: boolean
  onToggleManques: () => void
  /** Nature(s) du besoin affichée(s) — sous-colonnes, totaux et signaux suivent. */
  nature: Nature
  /** Horodatage du plan affiché (payload `computedAt`) ; null = inconnu. */
  computedAt: number | null
  /** Plan affiché ≠ sélection courante (recalcul suspendu, hors plafond). */
  stale: boolean
}) {
  const {
    buckets,
    visIdx,
    rows,
    vue,
    sortPeriod,
    onSortPeriod,
    selected,
    manquesOnly,
    onToggleManques,
    nature,
    computedAt,
    stale,
  } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const footRef = useRef<HTMLDivElement>(null)
  // Les lignes sont mises en cache (cf. `rowCache`) : leurs gestionnaires
  // survivent au rendu qui les a créées. Passer par une ref garantit qu'ils
  // appellent toujours le `onSelect` courant, jamais celui d'alors.
  const onSelectRef = useRef(props.onSelect)
  onSelectRef.current = props.onSelect

  // Périodes affichées avec leur indice d'origine (les accesseurs `vueOf`
  // travaillent sur les tableaux complets, pas sur la position visible).
  const vis = useMemo(() => visIdx.map((i) => ({ b: buckets[i], i })), [buckets, visIdx])

  // Maximum par ligne sur la fenêtre, natures affichées seulement —
  // dénominateur de la carte de chaleur. Mémoïsé : le calculer dans la cellule
  // le referait une fois par cellule rendue.
  const rowMax = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      let max = 0
      for (const { i } of vis) {
        if (natureOn(nature, true)) {
          max = Math.max(max, vueOf(r, vue, i, true, nature === 'FERME'))
        }
        if (natureOn(nature, false)) max = Math.max(max, vueOf(r, vue, i, false))
      }
      m.set(r.article, max)
    }
    return m
  }, [rows, vis, vue, nature])

  // Sous-colonnes visibles : clé stable `${bucket}-ferme|prevision`, ordre
  // partagé par l'en-tête RAC, le corps, le pied et le survol (`cellIndex`).
  // Le filtre de nature retire la sous-colonne masquée : le bandeau, le
  // colgroup, le corps et le pied dérivent tous de cette liste.
  const subs = useMemo(
    () =>
      vis.flatMap(({ b, i }) => [
        ...(natureOn(nature, true)
          ? [{ key: `${b.key}-ferme`, label: b.label, i, ferme: true }]
          : []),
        ...(natureOn(nature, false)
          ? [{ key: `${b.key}-prevision`, label: b.label, i, ferme: false }]
          : []),
      ]),
    [vis, nature]
  )
  /** Nombre de colonnes — `colSpan` des lignes-cales de la fenêtre virtuelle. */
  const colCount = LEAD_KEYS.length + subs.length
  /** Largeur totale — imposée aux trois tables, aucune ne la déduit. */
  const tableW = LEAD_W + subs.reduce((a, s) => a + (s.ferme ? COL_W.ferme : COL_W.prevision), 0)

  // ── Virtualisation ────────────────────────────────────────────────────────
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // `ROW_H` n'est qu'une estimation de départ : chaque ligne montée est
    // mesurée (`measureElement`), donc un écart de densité — thème, zoom
    // navigateur, police système — ne décale pas la fenêtre.
    estimateSize: () => ROW_H,
    // 8 et pas 14 : une ligne coûte ~34 cellules react-aria à monter, le
    // sur-rendu se paie donc cher. 8 suffit à masquer le montage à la molette.
    overscan: 8,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const padTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const padBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0

  // Un changement de périmètre (filtre, tri, vue) rend la position de défilement
  // dénuée de sens : la ligne 400 d'avant n'est pas la ligne 400 d'après.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [rows])

  // Largeur de l'ascenseur vertical du corps, rendue en padding au bandeau et
  // au pied — ils n'en ont pas et finiraient décalés d'autant en fin de course.
  // Dépend de `rows.length` : l'ascenseur apparaît/disparaît avec le contenu,
  // ce qu'un ResizeObserver sur l'élément ne voit pas toujours.
  const [gutter, setGutter] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setGutter(el.offsetWidth - el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows.length, subs.length])

  // Survol en croix par délégation : chaque cellule des trois tables porte sa
  // clé de colonne en `data-col`, la règle est réécrite dans le `<style>`
  // local (cf. `washCss`). Aucun rendu React n'est déclenché.
  const styleRef = useRef<HTMLStyleElement>(null)
  const hoverRef = useRef<string | null>(null)
  const setHoverCol = (key: string | null): void => {
    if (hoverRef.current === key) return
    hoverRef.current = key
    if (styleRef.current) styleRef.current.textContent = key ? washCss(key) : ''
  }
  const onGridHover = (e: { target: EventTarget | null }) => {
    const cell = (e.target as HTMLElement | null)?.closest('td,th') ?? null
    setHoverCol(cell instanceof HTMLTableCellElement ? (cell.dataset.col ?? null) : null)
  }

  // Tri au clic sur un sous-en-tête : décroissant, 2ᵉ clic = retour au menu.
  const sortOn = (s: { i: number; ferme: boolean }): boolean =>
    sortPeriod !== null && sortPeriod.i === s.i && sortPeriod.ferme === s.ferme
  const toggleSort = (s: { i: number; ferme: boolean }): void => {
    onSortPeriod(sortOn(s) ? null : { i: s.i, ferme: s.ferme })
  }

  // Totaux GLOBAUX du périmètre filtré — indépendants de la fenêtre virtuelle.
  const sums = useMemo(() => {
    const per = new Map<string, number>()
    for (const s of subs) {
      let t = 0
      for (const r of rows) t += vueOf(r, vue, s.i, s.ferme, nature === 'FERME')
      per.set(s.key, t)
    }
    const stock = rows.reduce((a, r) => a + r.stock, 0)
    let valeur = 0
    let valeurConnue = false
    for (const r of rows)
      if (r.valeur != null) {
        valeur += r.valeur
        valeurConnue = true
      }
    return {
      per,
      stock,
      arrivees: rows.reduce((a, r) => a + arriveesTotal(r), 0),
      valeur: valeurConnue ? valeur : null,
      total: rows.reduce((a, r) => a + vueTotalOn(r, vue, nature), 0),
    }
  }, [rows, vue, subs, nature])

  const manquesInView = useMemo(
    () => rows.filter((r) => manqueTotalOn(r, nature) > 0).length,
    [rows, nature]
  )

  /**
   * Cache d'ÉLÉMENTS de ligne, indexé sur la position dans `rows`.
   *
   * Le virtualiseur re-rend toute la fenêtre à chaque frame de défilement.
   * Sans cache, les ~40 lignes montées sont reconstruites à l'identique et
   * react-aria remonte `usePress` / `useHover` / `useFocusRing` sur chacune
   * de leurs ~34 cellules — soit ~1 400 cellules par frame pour 3 lignes qui
   * entrent réellement. Un élément React IDENTIQUE fait sauter tout le
   * sous-arbre à la réconciliation : seules les lignes qui entrent coûtent.
   *
   * Invalidé dès que le contenu d'une ligne peut changer (données, colonnes,
   * vue, chaleur, sélection) — c'est la clé du `useMemo`. Plafonné, sinon un
   * parcours complet des 1118 composants retient autant d'arbres d'éléments.
   */
  // Dépendances volontairement « inutiles » au sens d'eslint : le `useMemo` ne
  // les LIT pas, il s'en sert de clé d'invalidation — c'est tout l'objet du
  // cache. Les retirer le rendrait éternel, et une ligne modifiée resterait
  // affichée telle quelle.
  const rowCache = useMemo(
    () => new Map<number, ReactNode>(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, subs, vue, rowMax, selected, nature]
  )

  /** Les trois tables partagent ces colonnes — d'où un seul `<colgroup>`. */
  const colGroup = (
    <colgroup>
      {LEAD_KEYS.map((k) => (
        <col key={k} style={{ width: COL_W[k] }} />
      ))}
      {subs.map((s) => (
        <col key={s.key} style={{ width: s.ferme ? COL_W.ferme : COL_W.prevision }} />
      ))}
    </colgroup>
  )

  // Le bandeau et le pied suivent le corps ; l'inverse n'existe pas (ils sont
  // en `overflow-hidden`), donc pas de boucle de rétroaction à casser.
  const syncX = (e: { currentTarget: HTMLDivElement }): void => {
    const x = e.currentTarget.scrollLeft
    // Le défilement vertical passe ici aussi : ne rien réécrire quand x n'a pas
    // bougé, sinon chaque vue de molette repositionne deux conteneurs pour rien.
    if (stripRef.current && stripRef.current.scrollLeft !== x) stripRef.current.scrollLeft = x
    if (footRef.current && footRef.current.scrollLeft !== x) footRef.current.scrollLeft = x
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-3xl border border-separator-border bg-background-primary-default"
      style={
        {
          '--appro-row-h': `${ROW_H}px`,
          '--appro-stick-desc': `${STICK_LEFT.description}px`,
        } as CSSProperties
      }
      onMouseOver={onGridHover}
      onMouseLeave={() => setHoverCol(null)}
    >
      {/* Support du survol en croix : `setHoverCol` réécrit son contenu, rien
          d'autre ne le touche (cf. `washCss`). */}
      <style ref={styleRef} />

      {/* Header BoardUI — rounded top sur 1118, tableau en dessous carré */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-3xl border-b border-separator-border bg-background-secondary-default px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="whitespace-nowrap text-caption-1-semibold text-text-secondary">
            {rows.length} composants
          </span>
          {manquesInView > 0 && (
            // La chip est LE signal actionnable de la page : cliquable, elle
            // bascule « manques seuls » au lieu de rester un compteur mort.
            <button
              type="button"
              onClick={onToggleManques}
              aria-pressed={manquesOnly}
              title={
                manquesOnly
                  ? 'Retirer le filtre « manques seuls »'
                  : 'N’afficher que les composants en manque'
              }
              className={cx(
                'shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                manquesOnly && 'ring-2 ring-status-rose-text/50'
              )}
            >
              <Chip variant="caption" color="rose">
                {manquesInView} manques
              </Chip>
            </button>
          )}
          <Badge color="neutral" className="hidden shrink-0 sm:inline-flex">
            {vue}
          </Badge>
          {computedAt != null && (
            <span
              className={cx(
                'whitespace-nowrap text-caption-2-medium',
                stale ? 'text-status-yellow-text' : 'text-text-tertiary'
              )}
              title={
                stale
                  ? 'Plan calculé avant la sélection courante (recalcul suspendu, plafond 14 périodes) — ne pas copier ces quantités pour la nouvelle sélection.'
                  : 'Date de calcul du plan affiché'
              }
            >
              Plan du {fmtPlanDate.format(new Date(computedAt))}
            </span>
          )}
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="text-caption-2-medium text-text-tertiary">
            Carte de chaleur par ligne
          </span>
          {natureOn(nature, true) && (
            <span className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full bg-accent-500" aria-hidden />
              <span className="text-caption-2-medium text-text-secondary">Ferme</span>
            </span>
          )}
          {natureOn(nature, false) && (
            <span className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full bg-purple-500" aria-hidden />
              <span className="text-caption-2-medium text-text-secondary">Prév.</span>
            </span>
          )}
        </div>
      </div>

      {/* Bandeau des périodes : vrai `colSpan`, synchronisé en x avec le corps.
          Table HTML simple — les colonnes react-aria ne se groupent pas.
          `aria-hidden`, le contexte période est porté par les `textValue` des
          sous-colonnes du corps. */}
      <div
        ref={stripRef}
        data-scope="strip"
        aria-hidden="true"
        className="no-scrollbar flex-none overflow-hidden bg-background-secondary-default"
      >
        <div style={{ paddingRight: gutter, width: tableW + gutter }}>
          <table className="appro-strip" style={{ width: tableW }}>
            {colGroup}
            <thead>
              <tr>
                {/* Le bloc de tête est fusionné, mais coupé exactement là où
                    le corps fige : 2 colonnes collantes (le libellé de période
                    glisserait sous elles au défilement), puis 4 qui défilent
                    comme leurs colonnes du corps. */}
                <th colSpan={2} className="stick sl-article" />
                <th colSpan={LEAD_KEYS.length - 2} />
                {vis.map(({ b }) => (
                  <th
                    key={b.key}
                    colSpan={natureOn(nature, true) && natureOn(nature, false) ? 2 : 1}
                    data-col={b.key}
                    data-group={b.key}
                    scope="colgroup"
                    className="grp"
                  >
                    <span className="whitespace-nowrap text-caption-1-semibold text-text-primary">
                      {b.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
      </div>

      <div
        ref={scrollRef}
        data-scope="grid"
        onScroll={syncX}
        className="min-h-0 flex-1 overflow-auto bg-background-primary-default"
      >
        <RacTable
          aria-label="Besoins matières"
          className="bui-table appro-grid"
          style={{ width: tableW }}
        >
          <TableHeader>
            <TableColumn
              id="article"
              isRowHeader
              textValue="Composant"
              style={{ width: COL_W.article }}
              data-col="article"
              className="stick sl-article"
            >
              <span className="text-caption-1-medium text-text-tertiary">Composant</span>
            </TableColumn>
            <TableColumn
              id="description"
              textValue="Désignation"
              style={{ width: COL_W.description }}
              data-col="description"
              className="stick sl-description"
            >
              <span className="text-caption-1-medium text-text-tertiary">Désignation</span>
            </TableColumn>
            <TableColumn id="type" textValue="Type" style={{ width: COL_W.type }} data-col="type">
              <span className="text-caption-1-medium text-text-tertiary">Type</span>
            </TableColumn>
            <TableColumn
              id="stock"
              textValue="Stock"
              style={{ width: COL_W.stock }}
              data-col="stock"
              className="r"
            >
              <span className="text-caption-1-medium text-text-tertiary">Stock</span>
            </TableColumn>
            <TableColumn
              id="arrivees"
              textValue="Arrivées attendues sur la fenêtre"
              style={{ width: COL_W.arrivees }}
              data-col="arrivees"
              className="r"
            >
              <span
                className="text-caption-1-medium text-text-tertiary"
                title="Réceptions d'achat ouvertes tombant dans la fenêtre (les retards sont repliés sur la première période)"
              >
                Arrivées
              </span>
            </TableColumn>
            <TableColumn
              id="rupture"
              textValue="Première période en manque"
              style={{ width: COL_W.rupture }}
              data-col="rupture"
            >
              <span
                className="text-caption-1-medium text-text-tertiary"
                title="Première période où le stock projeté ne couvre plus le besoin"
              >
                Rupture
              </span>
            </TableColumn>
            <TableColumn
              id="valeur"
              textValue="Valo"
              style={{ width: COL_W.valeur }}
              data-col="valeur"
              className="r"
            >
              <span className="text-caption-1-medium text-text-tertiary">Valo</span>
            </TableColumn>
            <TableColumn
              id="total"
              textValue={`Total ${vue}`}
              style={{ width: COL_W.total }}
              data-col="total"
              className="r"
            >
              <span className="text-caption-1-semibold text-text-primary">Total {vue}</span>
            </TableColumn>
            {subs.map((s) => {
              const on = sortOn(s)
              return (
                <TableColumn
                  key={s.key}
                  id={s.key}
                  textValue={`${s.label} ${s.ferme ? 'Ferme' : 'Prévision'}`}
                  style={{ width: s.ferme ? COL_W.ferme : COL_W.prevision }}
                  data-col={s.key}
                  className={cx('c', s.ferme && 'grp')}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    title={on ? 'Trié — cliquer pour annuler' : 'Trier par cette période'}
                    className={cx(
                      'inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-caption-2-medium',
                      s.ferme ? 'text-status-blue-text' : 'text-status-purple-text'
                    )}
                    onClick={() => toggleSort(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleSort(s)
                      }
                    }}
                  >
                    {s.ferme ? 'Ferme' : 'Prév.'}
                    {on && <RiArrowDownLine className="size-3" aria-hidden />}
                  </span>
                </TableColumn>
              )
            })}
          </TableHeader>
          <TableBody>
            {/* Cales haute et basse : la fenêtre virtuelle rendue garde sa
                position réelle dans le flux, sans transformer le `<tbody>`
                (une transformation casserait le `position: sticky` des
                colonnes figées). */}
            {padTop > 0 && (
              <TableRow id="__pad_top" className="pad">
                <TableCell colSpan={colCount} style={{ height: padTop }} />
              </TableRow>
            )}
            {virtualRows.map((vr) => {
              const cached = rowCache.get(vr.index)
              if (cached) return cached
              const r = rows[vr.index]
              const manque = manqueTotalOn(r, nature) > 0
              if (rowCache.size > 600) rowCache.clear()
              const el = (
                <TableRow
                  key={`${r.article}@@${vr.index}`}
                  id={`${r.article}@@${vr.index}`}
                  ref={rowVirtualizer.measureElement}
                  data-index={vr.index}
                  className={cx(vr.index % 2 === 1 && 'alt', r.article === selected && 'sel')}
                  onAction={() => onSelectRef.current(r.article)}
                >
                  <TableCell data-col="article" className="stick sl-article">
                    <span
                      className={cx(
                        'inline-flex max-w-full items-center gap-1 font-mono text-caption-1-semibold tracking-tight',
                        manque ? 'text-status-rose-text' : 'text-text-primary'
                      )}
                    >
                      {/* Bouton, pas span : le drill-down « appelé par » doit
                          rester atteignable au clavier dans la ligne pressable. */}
                      <button
                        type="button"
                        onClick={() => onSelectRef.current(r.article)}
                        className="min-w-0 max-w-full truncate rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus-ring"
                        title={
                          manque
                            ? 'Manque projeté non nul — voir l’origine du besoin'
                            : 'Voir l’origine du besoin (appelé par)'
                        }
                        aria-haspopup="dialog"
                      >
                        {r.article}
                      </button>
                      {r.tronque && (
                        <TooltipTrigger delay={0}>
                          <button
                            type="button"
                            aria-label="Descendance incomplète — nomenclature tronquée au plafond de profondeur"
                            className="inline-flex shrink-0 cursor-help items-center rounded-sm text-status-yellow-text outline-none focus-visible:ring-1 focus-visible:ring-border-focus-ring"
                          >
                            ⚠
                          </button>
                          <Tooltip>Descendance incomplète</Tooltip>
                        </TooltipTrigger>
                      )}
                    </span>
                  </TableCell>
                  <TableCell data-col="description" className="stick sl-description">
                    <span
                      className="block truncate text-caption-1-regular text-text-secondary"
                      title={r.description}
                    >
                      {r.description}
                    </span>
                  </TableCell>
                  <TableCell data-col="type">
                    <span className="inline-flex items-center gap-1.5 text-caption-1-regular text-text-secondary">
                      <StatusDot color={r.supplyType === 'ACHAT' ? 'indigo' : 'green'} />
                      {r.supplyType === 'ACHAT' ? 'Acheté' : 'Fabriqué'}
                    </span>
                  </TableCell>
                  <TableCell data-col="stock" className="r">
                    <span className="font-mono text-caption-1-regular tabular-nums text-text-primary">
                      {fr(r.stock)}
                    </span>
                  </TableCell>
                  <TableCell data-col="arrivees" className="r">
                    {arriveesTotal(r) === 0 ? (
                      <span className="font-mono text-caption-1-regular text-text-tertiary">—</span>
                    ) : (
                      <span
                        className={cx(
                          'font-mono text-caption-1-regular tabular-nums',
                          r.arriveesRetard > 0 ? 'text-status-yellow-text' : 'text-text-secondary'
                        )}
                        title={
                          r.arriveesRetard > 0
                            ? `${fr(r.arriveesRetard)} déjà en retard, repliés sur la première période`
                            : 'Réceptions d’achat attendues sur la fenêtre'
                        }
                      >
                        {fr(arriveesTotal(r))}
                        {r.arriveesRetard > 0 && ' ⚠'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell data-col="rupture">
                    {ruptureIdx(r, nature) < 0 ? (
                      <span className="text-caption-1-regular text-text-tertiary">—</span>
                    ) : (
                      <span
                        className="whitespace-nowrap text-caption-1-semibold text-status-rose-text"
                        title="Première période où le stock projeté ne couvre plus le besoin"
                      >
                        {buckets[ruptureIdx(r, nature)]?.label ?? '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell data-col="valeur" className="r">
                    {r.valeur == null ? (
                      <span
                        className="font-mono text-caption-1-regular text-text-tertiary"
                        title="PMP inconnu — Stock × PMP actuel (ITMMVT)"
                      >
                        —
                      </span>
                    ) : (
                      <span
                        className="font-mono text-caption-1-regular tabular-nums text-text-secondary"
                        title={`Stock × PMP actuel = ${fmtEuro.format(r.valeur)}`}
                      >
                        {fmtEuro.format(r.valeur)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell data-col="total" className="r">
                    <span
                      className={cx(
                        'font-mono text-caption-1-semibold tabular-nums',
                        manque ? 'text-status-rose-text' : 'text-text-primary'
                      )}
                    >
                      {fr(vueTotalOn(r, vue, nature))}
                    </span>
                  </TableCell>
                  {subs.map((s) => {
                    const v = vueOf(r, vue, s.i, s.ferme, nature === 'FERME')
                    return (
                      <TableCell
                        key={s.key}
                        data-col={s.key}
                        className={cx('heat', s.ferme && 'grp')}
                      >
                        <span style={heatStyle(v, rowMax.get(r.article) ?? 0, s.ferme)}>
                          {v === 0 ? null : (
                            <span
                              className={cx(
                                'font-mono text-caption-1-regular tabular-nums',
                                s.ferme ? 'text-text-primary' : 'text-text-secondary'
                              )}
                            >
                              {fr(v)}
                            </span>
                          )}
                        </span>
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
              rowCache.set(vr.index, el)
              return el
            })}
            {padBottom > 0 && (
              <TableRow id="__pad_bottom" className="pad">
                <TableCell colSpan={colCount} style={{ height: padBottom }} />
              </TableRow>
            )}
          </TableBody>
        </RacTable>
      </div>

      {/* Pied de totaux — HORS du conteneur de scroll (il y était `sticky
          bottom-0`, la barre de défilement horizontale le recouvrait), défilé
          en x avec le corps. Totaux GLOBAUX du périmètre filtré. */}
      <div
        ref={footRef}
        data-scope="foot"
        className="no-scrollbar flex-none overflow-hidden border-t border-separator-border-strong bg-background-secondary-default"
      >
        <div style={{ paddingRight: gutter, width: tableW + gutter }}>
          <table className="appro-foot" style={{ width: tableW }}>
            <caption className="sr-only">Totaux du périmètre affiché</caption>
            {colGroup}
            <tbody>
              <tr>
                <td colSpan={2} data-col="article" className="stick sl-article">
                  <span className="text-caption-1-semibold text-text-secondary">
                    Total ({rows.length})
                  </span>
                </td>
                <td data-col="type" />
                <td
                  data-col="stock"
                  className="r font-mono text-caption-1-semibold tabular-nums text-text-primary"
                >
                  {fr(sums.stock)}
                </td>
                <td
                  data-col="arrivees"
                  className="r font-mono text-caption-1-semibold tabular-nums text-text-secondary"
                >
                  {sums.arrivees === 0 ? null : fr(sums.arrivees)}
                </td>
                <td data-col="rupture" />
                <td
                  data-col="valeur"
                  className="r font-mono text-caption-1-semibold tabular-nums text-text-secondary"
                >
                  {sums.valeur == null ? '—' : fmtEuro.format(sums.valeur)}
                </td>
                <td
                  data-col="total"
                  className="r font-mono text-caption-1-semibold tabular-nums text-text-primary"
                >
                  {fr(sums.total)}
                </td>
                {subs.map((s) => {
                  const t = sums.per.get(s.key) ?? 0
                  return (
                    <td
                      key={s.key}
                      data-col={s.key}
                      className={cx(
                        'r font-mono text-caption-1-semibold tabular-nums',
                        s.ferme ? 'grp text-text-primary' : 'text-text-secondary'
                      )}
                    >
                      {t === 0 ? null : fr(t)}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Panneau « appelé par » ────────────────────────────────────────────────────
//
// Remplace l'ancien tableau 6 colonnes (Jour / Commande / Client / PF /
// Nature / Qté) par une pile de cartes par origine, groupée par semaine.
// Lisibilité : chaque carte isole une origine (commande, client, PF,
// bom-path) ; la quantité est l'ancre visuelle à droite. Le groupement
// semaine reste (même label S{num} · DD/MM que la grille) mais comme
// en-tête sectionné, pas comme bande grise dans un tableau.
// BoardUI : Badge (compteurs), Chip (Ferme/Prévision), Divider, tokens
// sémantiques only — pas de dark:-override, le dark suit automatiquement.

const WEEKDAY_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'] as const

function dayMeta(isoDate: string) {
  const day = Number(isoDate.slice(8, 10))
  const mm = Number(isoDate.slice(5, 7)) - 1
  const d = new Date(Number(isoDate.slice(0, 4)), mm, day)
  const w = WEEKDAY_SHORT[d.getDay()]
  const dd = String(day).padStart(2, '0')
  const mo = String(mm + 1).padStart(2, '0')
  return { wday: w, day: dd, month: mo }
}

function OriginCard(props: { ligne: ApproDetailLine }) {
  const { ligne: l } = props
  const m = dayMeta(l.date)
  const isFerme = l.nature === 'ferme'

  return (
    <div className="group relative flex min-w-0 gap-3 overflow-hidden rounded-2lg border border-border-button-default bg-background-primary-default px-3.5 py-3 transition-colors hover:border-border-button-hover">
      <div
        className={cx(
          'absolute inset-y-3 left-0 w-0.5 rounded-full',
          isFerme ? 'bg-accent-400' : 'bg-purple-400'
        )}
        aria-hidden
      />

      <div className="flex w-[46px] shrink-0 flex-col items-center justify-start pt-0.5">
        <span className="text-caption-1-medium uppercase tracking-wide text-text-tertiary">
          {m.wday}
        </span>
        <span className="font-mono text-title-2-semibold leading-none tabular-nums text-text-primary">
          {m.day}
        </span>
        <span className="font-mono text-caption-2-medium tabular-nums text-text-tertiary">
          {m.month}
        </span>
      </div>

      <div className="min-w-0 flex-1 space-y-2 overflow-hidden pl-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-md bg-background-secondary-default px-1.5 py-0.5 font-mono text-caption-1-semibold text-text-primary">
            <RiHashtag className="size-3 shrink-0 text-foreground-icon-tertiary" aria-hidden />
            <span className="min-w-0 truncate" title={l.numCommande ?? undefined}>
              {l.numCommande ?? '— sans commande'}
            </span>
            {l.ligne ? (
              <span className="shrink-0 font-mono text-caption-2-medium text-text-tertiary">
                L{l.ligne}
              </span>
            ) : null}
          </span>
          <Chip variant="caption" color={isFerme ? 'blue' : 'soft'} className="shrink-0">
            {isFerme ? 'Ferme' : 'Prévision'}
          </Chip>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1.5">
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-caption-1-regular text-text-secondary">
            <RiBox3Line className="size-3.5 shrink-0 text-foreground-icon-tertiary" aria-hidden />
            <span
              className="min-w-0 truncate font-mono text-caption-1-medium text-text-primary"
              title={l.pfArticle}
            >
              {l.pfArticle}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-caption-1-regular text-text-secondary">
            <RiUserLine className="size-3.5 shrink-0 text-foreground-icon-tertiary" aria-hidden />
            <span className="min-w-0 truncate" title={l.client ?? undefined}>
              {l.client || '—'}
            </span>
          </span>
        </div>

        {l.path.length > 0 && (
          <div className="flex items-start gap-1.5 overflow-hidden rounded-md bg-background-secondary-default px-2 py-1.5">
            <RiRouteLine
              className="mt-[2px] size-3 shrink-0 text-foreground-icon-tertiary"
              aria-hidden
            />
            <div
              className="flex min-w-0 flex-wrap items-center gap-y-0.5 font-mono text-caption-2-regular leading-relaxed"
              title={l.path.join(' › ')}
            >
              {l.path.map((seg, idx) => (
                <span
                  key={`${seg}-${idx}`}
                  className="inline-flex max-w-full items-center gap-1 whitespace-nowrap"
                >
                  {idx > 0 && (
                    <RiArrowRightSLine
                      className="size-3 shrink-0 text-foreground-icon-quaternary"
                      aria-hidden
                    />
                  )}
                  <span
                    className={
                      idx === l.path.length - 1
                        ? 'truncate font-medium text-text-secondary'
                        : 'truncate text-text-tertiary'
                    }
                  >
                    {seg}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end justify-start gap-1 pl-1">
        <span
          className="rounded-md bg-background-secondary-default px-2 py-1 font-mono text-body-semibold tabular-nums text-text-primary"
          title="Quantité appelée"
        >
          {fr(l.quantite)}
        </span>
        <span className="text-caption-2-regular text-text-tertiary">qté</span>
      </div>
    </div>
  )
}

function WeekSection(props: { label: string; total: number; count: number; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-3 bg-background-primary-default/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background-primary-default/80">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-background-secondary-default text-foreground-icon-secondary">
            <RiCalendarLine className="size-3.5" aria-hidden />
          </span>
          <span className="text-caption-1-semibold text-text-primary">{props.label}</span>
          <Badge color="neutral">{props.count}</Badge>
        </span>
        <span
          className="inline-flex items-baseline gap-1 rounded-full bg-accent-50 px-2.5 py-1 font-mono text-caption-1-semibold tabular-nums text-accent-700"
          title="Total appelé sur la semaine"
        >
          <RiHashtag className="size-3" aria-hidden />
          {fr(props.total)}
        </span>
      </div>
      <div className="space-y-2.5">{props.children}</div>
    </section>
  )
}

/**
 * Drawer « appelé par ». Les origines sont regroupées par semaine ISO (lundi),
 * triées par date : mêmes libellés que les en-têtes de périodes de la grille
 * (S36 · 01/09), total appelé par semaine en tête de groupe. Le tiroir reste
 * le `Sheet` du projet (BoardUI n'a pas de tiroir) ; son contenu est en tokens
 * BoardUI comme le reste de la page.
 */
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

  const weeks = useMemo(() => {
    const out: { key: string; label: string; total: number; lignes: ApproDetailLine[] }[] = []
    const byKey = new Map<string, (typeof out)[number]>()
    for (const l of data?.lignes ?? []) {
      const monday = mondayOf(new Date(`${l.date}T00:00:00`))
      const key = isoDay(monday)
      let w = byKey.get(key)
      if (!w) {
        const dd = String(monday.getDate()).padStart(2, '0')
        const mm = String(monday.getMonth() + 1).padStart(2, '0')
        w = { key, label: `S${isoWeek(monday)} · ${dd}/${mm}`, total: 0, lignes: [] }
        byKey.set(key, w)
        out.push(w)
      }
      w.total += l.quantite
      w.lignes.push(l)
    }
    return out
  }, [data])

  const summary = useMemo(() => {
    if (!data) return null
    const n = data.lignes.length
    const total = data.lignes.reduce((s, l) => s + l.quantite, 0)
    const fermes = data.lignes.filter((l) => l.nature === 'ferme').length
    return { n, total, fermes, previs: n - fermes, weeks: weeks.length }
  }, [data, weeks])

  return (
    <Sheet open={props.article !== null} onOpenChange={(open) => !open && props.onClose()}>
      {props.article &&
        (loading || !data ? (
          <SheetContent className="no-scrollbar overflow-y-auto border-l border-separator-border bg-background-primary-default sm:max-w-xl">
            <SheetHeader className="border-b border-separator-border bg-background-primary-default">
              <SheetTitle className="font-mono text-headline-semibold text-text-primary">
                {props.article}
              </SheetTitle>
              <SheetDescription className="text-caption-1-regular text-text-secondary">
                {error ? error.message : 'Origines du besoin…'}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-3 p-4">
              <div className="h-20 animate-pulse rounded-2lg bg-background-secondary-default" />
              <div className="h-28 animate-pulse rounded-2lg bg-background-secondary-default" />
              <div className="h-28 animate-pulse rounded-2lg bg-background-secondary-default" />
            </div>
          </SheetContent>
        ) : (
          <SheetContent className="no-scrollbar overflow-y-auto border-l border-separator-border bg-background-primary-default p-0 sm:max-w-xl">
            <SheetHeader className="sticky top-0 z-20 border-b border-separator-border bg-background-primary-default px-4 py-4">
              <div className="flex items-start justify-between gap-3 pr-8">
                <div className="min-w-0">
                  <SheetTitle className="truncate font-mono text-title-3-semibold tracking-tight text-text-primary">
                    {data.article}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-caption-1-regular leading-relaxed text-text-secondary">
                    Appelé par — {summary?.n} origine(s) sur {summary?.weeks} semaine(s), rejouée(s)
                    depuis le snapshot de la grille.
                  </SheetDescription>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background-secondary-default px-2.5 py-1 font-mono text-caption-1-semibold tabular-nums text-text-primary">
                  <RiBox3Line className="size-3.5 text-foreground-icon-tertiary" aria-hidden />
                  {summary ? fr(summary.total) : '—'}
                </span>
              </div>

              {summary && summary.n > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <span className="rounded-xl border border-border-button-default bg-background-secondary-default px-3 py-2">
                    <span className="block text-caption-2-medium uppercase tracking-wide text-text-tertiary">
                      Semaines
                    </span>
                    <span className="font-mono text-body-semibold tabular-nums text-text-primary">
                      {summary.weeks}
                    </span>
                  </span>
                  <span className="rounded-xl bg-status-blue-background px-3 py-2">
                    <span className="block text-caption-2-medium uppercase tracking-wide text-status-blue-text/80">
                      Fermes
                    </span>
                    <span className="font-mono text-body-semibold tabular-nums text-status-blue-text">
                      {summary.fermes}
                    </span>
                  </span>
                  <span className="rounded-xl bg-background-tertiary-default px-3 py-2">
                    <span className="block text-caption-2-medium uppercase tracking-wide text-text-tertiary">
                      Prévisions
                    </span>
                    <span className="font-mono text-body-semibold tabular-nums text-text-secondary">
                      {summary.previs}
                    </span>
                  </span>
                </div>
              )}
            </SheetHeader>

            <div className="space-y-6 px-4 py-5">
              {data.lignes.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-button-default bg-background-secondary-default px-6 py-10 text-center">
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-background-primary-default text-foreground-icon-tertiary">
                    <RiFileList3Line className="size-5" aria-hidden />
                  </span>
                  <p className="text-body-medium text-text-primary">
                    Aucune origine sur cette fenêtre.
                  </p>
                  <p className="max-w-xs text-caption-1-regular text-text-secondary">
                    Aucune commande ou prévision n&apos;appelle ce composant entre le début et la
                    fin de la fenêtre sélectionnée.
                  </p>
                </div>
              ) : (
                weeks.map((w) => (
                  <WeekSection key={w.key} label={w.label} total={w.total} count={w.lignes.length}>
                    {w.lignes.map((l, i) => (
                      <OriginCard
                        key={`${l.date}-${l.numCommande ?? 'nc'}-${l.pfArticle}-${i}`}
                        ligne={l}
                      />
                    ))}
                  </WeekSection>
                ))
              )}
            </div>

            {data.lignes.length > 0 && (
              <div className="border-t border-separator-border bg-background-secondary-default px-4 py-3">
                {/* Actions de sortie (UI seule, passe 1) : fermer la boucle
                    « manque → décision ». Branchement X3 / route paramétrée
                    vers Ruptures en passe 2 ; aria-disabled garde le focus
                    et le tooltip. */}
                <div className="flex gap-2">
                  <TooltipTrigger>
                    <Button
                      variant="primary"
                      size="small"
                      leadingIcon={RiShoppingCartLine}
                      aria-disabled
                      className="flex-1"
                    >
                      Créer une demande X3
                    </Button>
                    <Tooltip>Pré-remplie article + manque projeté — branchement X3 à venir</Tooltip>
                  </TooltipTrigger>
                  <TooltipTrigger>
                    <Button
                      variant="secondary"
                      size="small"
                      leadingIcon={RiAlertLine}
                      aria-disabled
                      className="flex-1"
                    >
                      Voir dans Ruptures
                    </Button>
                    <Tooltip>Ce composant dans le suivi des ruptures — branchement à venir</Tooltip>
                  </TooltipTrigger>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-caption-2-regular text-text-tertiary">
                  <RiRouteLine className="size-3 shrink-0" aria-hidden />
                  Le chemin « via » retrace la nomenclature jusqu&apos;au produit fini appelant.
                </p>
              </div>
            )}
          </SheetContent>
        ))}
    </Sheet>
  )
}
