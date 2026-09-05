/**
 * Page « Approvisionnement » — plan besoins matières (lot 1).
 *
 * Coquille Inertia instantanée ; le calcul (explosion nomenclature complète +
 * netting priorité ferme) est fetché via useTimedFetch — même motif que
 * /suivi. Le calcul, les filtres et la doctrine d'affichage sont inchangés :
 * seule la COUCHE UI a changé.
 *
 * ─── Habillage : BoardUI (MCP `boardui`) ───────────────────────────────────
 * Les contrôles viennent maintenant du design system BoardUI installé sous
 * `components/base/*` : `SegmentedControl` (fenêtre / maille / cran),
 * `Dropdown` (menu Filtres), `Input` (recherche), `Button` (actions),
 * `DatePicker` (fenêtre libre), `Checkbox`, `Badge`, `Chip`, `Tooltip`,
 * `Notification` (bandeaux). Le style passe exclusivement par les tokens
 * sémantiques BoardUI (`text-text-*`, `bg-background-*`, `border-*`) et par
 * l'échelle typographique composite (`text-body-medium`, `text-caption-1-*`)
 * — jamais de classe de palette brute.
 *
 * Deux exceptions assumées, faute d'équivalent BoardUI :
 *  - la GRILLE reste le `DataTable` maison (virtualisation @tanstack, en-tête
 *    collant, colonnes de périodes dynamiques). Le `Table` de BoardUI est un
 *    collection component react-aria à lignes de 48/64 px, non virtualisé :
 *    l'adopter coûterait la tenue en charge de la page. Il est habillé en
 *    tokens BoardUI depuis ici, via ses props de classes ;
 *  - le drawer reste le `Sheet` du projet (BoardUI n'expose pas de tiroir),
 *    son contenu étant lui aussi retokenisé.
 */
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { CalendarDate, parseDate } from '@internationalized/date'
import {
  RiAlertLine,
  RiArrowDownLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiBarChartLine,
  RiBox3Line,
  RiCalendarLine,
  RiCloudOffLine,
  RiDashboardLine,
  RiErrorWarningLine,
  RiFileList3Line,
  RiFilter3Line,
  RiFilterOffLine,
  RiHashtag,
  RiInboxLine,
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
  type DashboardNavItem,
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
import { Pagination } from '@r/components/base/pagination/pagination'
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
import { TRIGGER_ACTIVE, TRIGGER_SECONDARY, segmentItemDense } from '@r/components/appro/chrome'
import type {
  ApproBucket,
  ApproCran,
  ApproDetail,
  ApproDetailLine,
  ApproGran,
  ApproPayload,
  ApproRow,
} from '@r/lib/appro/types'

/**
 * Navigation BoardUI pour la page Approvisionnement — mapping des routes
 * métier en entrées `DashboardNavItem`. La sidebar flottante vit en
 * complément du `Masthead` (top nav) : masquée sous `lg`, elle évite de
 * dérober de la largeur sur tablette, tandis que le rail desktop offre un
 * accès latéral direct aux modules principaux.
 *
 * Icônes : Remix, même famille que les contrôles de la page (`Ri*Line`).
 * `selected="approvisionnement"` est passé au `DashboardSidebar` plus bas.
 */
const APPRO_NAV: DashboardNavItem[] = [
  { key: 'dashboard', label: 'Tableau de bord', icon: RiDashboardLine, href: route('dashboard') },
  { key: 'load', label: 'Charge', icon: RiBarChartLine, href: route('load.index') },
  {
    key: 'approvisionnement',
    label: 'Approvisionnement',
    icon: RiShoppingCartLine,
    href: route('approvisionnement.index'),
  },
  {
    key: 'ruptures',
    label: 'Ruptures',
    icon: RiAlertLine,
    href: route('scheduler.shortage_tracker'),
  },
  { key: 'tracking', label: 'Suivi commandes', icon: RiTruckLine, href: route('suivi.board') },
  { key: 'receptions', label: 'Réceptions', icon: RiInboxLine, href: route('receptions.index') },
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
/** Tri par défaut : total du cran décroissant — les lignes avec besoin
 * remontent, le « qui ne manque pas » ne masque plus le signal actionnable. */
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
  // Ligne de production retenue (poste 1ʳᵉ op) — null = toutes. Filtre
  // SERVEUR : il entre dans l'URL, le plan est recalculé sur la population
  // de la ligne (quantités exactes), l'écran garde le plan précédent pendant
  // le re-fetch (même doctrine que le reste de la page).
  const [ligne, setLigne] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('net')
  const [selected, setSelected] = useState<string | null>(null)
  // Tri au clic sur un sous-en-tête de période (Ferme/Prév., décroissant) —
  // prioritaire sur le tri du menu tant qu'il désigne une période visible.
  // Choisir un tri du menu l'efface, sinon le menu semblerait sans effet.
  const [sortPeriod, setSortPeriod] = useState<{ i: number; ferme: boolean } | null>(null)
  // Périodes entièrement à zéro repliées (cran courant, lignes filtrées).
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
      if (manquesOnly && resteTotal(r) <= 0) return false
      if (q && !fold(`${r.article} ${r.description}`).includes(q)) return false
      return true
    })
  }, [view, query, supply, manquesOnly])

  // Périodes vides au cran courant, sur les lignes filtrées (l'ordre du tri
  // ne change pas l'appartenance, donc calculé avant tri, sans cycle).
  const emptyIdx = useMemo(() => {
    const s = new Set<number>()
    const n = data?.buckets.length ?? 0
    for (let i = 0; i < n; i++) {
      let empty = true
      for (const r of filtered) {
        if (cranOf(r, cran, i, true) !== 0 || cranOf(r, cran, i, false) !== 0) {
          empty = false
          break
        }
      }
      if (empty) s.add(i)
    }
    return s
  }, [data, filtered, cran])

  const visIdx = useMemo(
    () =>
      (data?.buckets ?? []).map((_, i) => i).filter((i) => showEmptyPeriods || !emptyIdx.has(i)),
    [data, showEmptyPeriods, emptyIdx]
  )

  // Tri période effectif : ignoré si sa colonne est repliée (il reprend en
  // réaffichant les périodes vides, sans perdre le choix).
  const effSort = sortPeriod && visIdx.includes(sortPeriod.i) ? sortPeriod : null

  const rows = useMemo(() => {
    const out = [...filtered]
    // Valorisation : décroissante, PMP inconnu en dernier (pas de valeur = pas
    // de priorité financière, jamais l'inverse).
    out.sort((a, b) => {
      if (effSort) {
        const d =
          cranOf(b, cran, effSort.i, effSort.ferme) - cranOf(a, cran, effSort.i, effSort.ferme)
        return d !== 0 ? d : a.article.localeCompare(b.article)
      }
      if (sort === 'article') return a.article.localeCompare(b.article)
      if (sort === 'valeur') {
        if (a.valeur == null && b.valeur == null) return 0
        if (a.valeur == null) return 1
        if (b.valeur == null) return -1
        return b.valeur - a.valeur
      }
      return cranTotal(b, cran) - cranTotal(a, cran)
    })
    return out
  }, [filtered, sort, cran, effSort])

  // Filtres secondaires uniquement (hors recherche + pill ligne, toujours
  // visibles) — même doctrine que suivi : un filtre est « actif » quand il
  // s'écarte du défaut.
  const filtersActive =
    supply !== 'ACHAT' ||
    manquesOnly ||
    sort !== 'net' ||
    ligne !== null ||
    !showEmptyPeriods ||
    sortPeriod !== null
  const isFiltered = !!query.trim() || filtersActive

  const resetFilters = () => {
    setQuery('')
    setSupply('ACHAT')
    setManquesOnly(false)
    setLigne(null)
    setSort('net')
    setSortPeriod(null)
    setShowEmptyPeriods(true)
  }

  const manquesCount = useMemo(() => view.filter((r) => resteTotal(r) > 0).length, [view])

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
                  <DropdownPopover aria-label="Période" className="w-[276px]">
                    <DropdownGroup label="Fenêtre">
                      {PRESETS.map((pr) => (
                        <DropdownItem
                          key={pr.id}
                          selected={preset === pr.id}
                          onSelect={() => setPreset(pr.id)}
                          className="px-2 py-1.5"
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
                              'justify-between px-2 py-1.5',
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
                  aria-label="Cran de quantité"
                  className="shrink-0"
                  selectedKeys={[cran]}
                  onSelectionChange={(keys) => {
                    const next = [...keys][0] as ApproCran | undefined
                    if (next) setCran(next)
                  }}
                >
                  {CRANS.map((c) => (
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
                  <DropdownPopover aria-label="Filtres" className="w-[248px]">
                    <DropdownGroup label="Type">
                      {(['TOUS', 'ACHAT', 'FABRICATION'] as SupplyFilter[]).map((s) => (
                        <DropdownItem
                          key={s}
                          selected={supply === s}
                          onSelect={() => setSupply(s)}
                          className="px-2 py-1.5"
                        >
                          {SUPPLY_LABEL[s]}
                        </DropdownItem>
                      ))}
                    </DropdownGroup>
                    <DropdownDivider />
                    <DropdownGroup label="Affichage">
                      <Checkbox
                        size="sm"
                        className="w-full justify-between px-2 py-1.5"
                        isSelected={manquesOnly}
                        onChange={setManquesOnly}
                      >
                        <span className="flex flex-1 items-center justify-between gap-2">
                          <span className="text-body-medium text-text-primary">Manques seuls</span>
                          {manquesCount > 0 && (
                            <Badge
                              color={manquesOnly ? 'primary' : 'neutral'}
                              className="tabular-nums"
                              title="Composants dont le reste à couvrir est non nul"
                            >
                              {manquesCount}
                            </Badge>
                          )}
                        </span>
                      </Checkbox>
                      <Checkbox
                        size="sm"
                        className="w-full justify-between px-2 py-1.5"
                        isSelected={showEmptyPeriods}
                        onChange={setShowEmptyPeriods}
                      >
                        <span className="flex flex-1 items-center justify-between gap-2">
                          <span className="text-body-medium text-text-primary">Périodes vides</span>
                          {emptyIdx.size > 0 && (
                            <Badge
                              color={showEmptyPeriods ? 'neutral' : 'primary'}
                              className="tabular-nums"
                              title="Périodes sans besoin au cran courant"
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
                          className="px-2 py-1.5"
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
                <div className="min-h-0 flex-1 overflow-hidden p-5">
                  <ApproTable
                    buckets={data.buckets}
                    visIdx={visIdx}
                    rows={rows}
                    cran={cran}
                    sortPeriod={effSort}
                    onSortPeriod={setSortPeriod}
                    selected={selected}
                    onSelect={setSelected}
                    manquesOnly={manquesOnly}
                    onToggleManques={() => setManquesOnly((v) => !v)}
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
 * Table besoins — `DataTable` maison (virtualisation, en-tête collant,
 * sélection), habillée ici en tokens BoardUI via ses props de classes : la
 * page choisit son système de tokens, le composant ne connaît que des
 * chaînes. Tri au menu (Filtres › Tri) + tri décroissant au clic sur un
 * sous-en-tête Ferme/Prév. (prioritaire, 2ᵉ clic = retour au menu) ;
 * en-têtes de périodes sur deux rangées (`meta.group` : rangée 1 = la période,
 * fusionnée sur Ferme + Prév. ; rangée 2 = les deux sous-colonnes), le filet
 * vertical marquant le début du groupe. Composant + Désignation figés à
 * gauche (`stickyLeft`, table en `w-max` pour des décalages exacts), survol en
 * croix, zébrage léger, périodes vides repliables (`visIdx`), pied de totaux
 * épinglé — tous opt-in côté `DataTable`, sans effet sur ses autres usages.
 */
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
 * Table besoins sur primitives BoardUI Table (react-aria).
 *
 * Le `Table` BoardUI est utilisé SANS son wrapper (racine RAC directe +
 * classe `bui-table`) : le wrapper impose son propre scroll et n'accepte que
 * Header/Body en enfants — incompatible avec le bandeau de périodes et le
 * pied de totaux, qui partagent le même conteneur de scroll. Styles
 * identiques, comportement identique.
 *
 * Trois tables synchronisées (mêmes largeurs fixes) : bandeau des périodes
 * (vrai `colSpan`, table HTML simple — react-aria ne groupe pas les colonnes),
 * corps BoardUI (navigation clavier, tri custom au clic, survol en croix),
 * pied de totaux épinglé. Lignes paginées (100/page, `Pagination` BoardUI) :
 * le `Table` statique ne virtualise pas ; tri et totaux restent GLOBAUX
 * (périmètre filtré, toutes pages).
 *
 * Styles directs (sticky, fonds d'état, filets, densité) :
 * `components/appro/appro-table.css` — `.bui-table` n'étant pas layerisé, les
 * utilitaires perdraient contre lui. Couleurs/typo du CONTENU en utilitaires
 * sur les spans internes (aucune règle `.bui-table` ne les vise).
 */
const PAGE_SIZE = 100

function ApproTable(props: {
  buckets: ApproBucket[]
  /** Indices des périodes affichées (les périodes vides peuvent être repliées). */
  visIdx: number[]
  rows: ApproRow[]
  cran: ApproCran
  sortPeriod: { i: number; ferme: boolean } | null
  onSortPeriod: (s: { i: number; ferme: boolean } | null) => void
  selected: string | null
  onSelect: (article: string | null) => void
  /** État + bascule du filtre « manques seuls » — portés par la chip du header. */
  manquesOnly: boolean
  onToggleManques: () => void
}) {
  const {
    buckets,
    visIdx,
    rows,
    cran,
    sortPeriod,
    onSortPeriod,
    selected,
    manquesOnly,
    onToggleManques,
  } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  // Périodes affichées avec leur indice d'origine (les accesseurs `cranOf`
  // travaillent sur les tableaux complets, pas sur la position visible).
  const vis = useMemo(() => visIdx.map((i) => ({ b: buckets[i], i })), [buckets, visIdx])

  // Maximum par ligne sur la fenêtre (fermes ET prévisions confondus) —
  // dénominateur de la carte de chaleur. Mémoïsé : le calculer dans la cellule
  // le referait une fois par cellule rendue.
  const rowMax = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      let max = 0
      for (const { i } of vis) {
        max = Math.max(max, cranOf(r, cran, i, true), cranOf(r, cran, i, false))
      }
      m.set(r.article, max)
    }
    return m
  }, [rows, vis, cran])

  // Sous-colonnes visibles : clé stable `${bucket}-ferme|prevision`, ordre
  // partagé par l'en-tête RAC, le corps, le pied et le survol (`cellIndex`).
  const subs = useMemo(
    () =>
      vis.flatMap(({ b, i }) => [
        { key: `${b.key}-ferme`, label: b.label, i, ferme: true },
        { key: `${b.key}-prevision`, label: b.label, i, ferme: false },
      ]),
    [vis]
  )
  const colKeys = useMemo(
    () => ['article', 'description', 'type', 'stock', 'valeur', 'total', ...subs.map((s) => s.key)],
    [subs]
  )

  // Pagination (cf. docblock) + recadrage quand les filtres resserrent.
  const [page, setPage] = useState(1)
  const maxPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const effPage = Math.min(page, maxPage)
  useEffect(() => {
    if (page > maxPage) setPage(maxPage)
  }, [page, maxPage])
  const start = (effPage - 1) * PAGE_SIZE
  const pageRows = useMemo(() => rows.slice(start, start + PAGE_SIZE), [rows, start])

  // Survol en croix par délégation (`cellIndex`, aucun besoin d'API hover
  // react-aria) : `hoverCol` porte une clé de `colKeys`, ou une clé de groupe
  // pour le bandeau (`data-key`).
  const [hoverCol, setHoverCol] = useState<string | null>(null)
  const onGridHover = (e: { target: EventTarget | null }) => {
    const t = e.target as HTMLElement | null
    const cell = t?.closest('td,th') ?? null
    if (!cell || !(cell instanceof HTMLTableCellElement)) {
      setHoverCol(null)
      return
    }
    if (cell.closest('[data-scope]')?.getAttribute('data-scope') === 'strip') {
      setHoverCol(cell.dataset.key ?? null)
      return
    }
    setHoverCol(colKeys[cell.cellIndex] ?? null)
  }
  const groupWash = (key: string): boolean =>
    hoverCol === `${key}-ferme` || hoverCol === `${key}-prevision`

  // Tri au clic sur un sous-en-tête : décroissant, 2ᵉ clic = retour au menu.
  const sortOn = (s: { i: number; ferme: boolean }): boolean =>
    sortPeriod !== null && sortPeriod.i === s.i && sortPeriod.ferme === s.ferme
  const toggleSort = (s: { i: number; ferme: boolean }): void => {
    onSortPeriod(sortOn(s) ? null : { i: s.i, ferme: s.ferme })
  }

  // Totaux GLOBAUX (périmètre filtré, toutes pages) pour le pied épinglé.
  const sums = useMemo(() => {
    const per = new Map<string, number>()
    for (const s of subs) {
      let t = 0
      for (const r of rows) t += cranOf(r, cran, s.i, s.ferme)
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
      valeur: valeurConnue ? valeur : null,
      total: rows.reduce((a, r) => a + cranTotal(r, cran), 0),
    }
  }, [rows, cran, subs])

  const manquesInView = useMemo(() => rows.filter((r) => resteTotal(r) > 0).length, [rows])

  const syncStrip = (e: { currentTarget: HTMLDivElement }): void => {
    if (stripRef.current) stripRef.current.scrollLeft = e.currentTarget.scrollLeft
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-3xl border border-separator-border bg-background-primary-default"
      onMouseOver={onGridHover}
      onMouseLeave={() => setHoverCol(null)}
    >
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
            {cran}
          </Badge>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="text-caption-2-medium text-text-tertiary">
            Carte de chaleur par ligne
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full bg-accent-500" aria-hidden />
            <span className="text-caption-2-medium text-text-secondary">Ferme</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full bg-purple-500" aria-hidden />
            <span className="text-caption-2-medium text-text-secondary">Prév.</span>
          </span>
        </div>
      </div>

      {/* Bandeau des périodes : vrai `colSpan`, synchronisé en x avec le corps
          (`syncStrip`). Table HTML simple — les colonnes react-aria ne se
          groupent pas. `aria-hidden`, le contexte période est porté par les
          `textValue` des sous-colonnes. */}
      <div
        ref={stripRef}
        data-scope="strip"
        aria-hidden="true"
        className="no-scrollbar flex-none overflow-hidden bg-background-secondary-default"
      >
        <table className="w-max table-fixed border-collapse">
          <colgroup>
            <col style={{ width: 825 }} />
            {vis.map(({ b }) => (
              <Fragment key={b.key}>
                <col style={{ width: 88 }} />
                <col style={{ width: 72 }} />
              </Fragment>
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="w-[825px] bg-background-secondary-default" />
              {vis.map(({ b }) => (
                <th
                  key={b.key}
                  colSpan={2}
                  data-key={b.key}
                  scope="colgroup"
                  className={cx(
                    'border-l border-separator-border-strong px-3 py-1.5 text-center',
                    groupWash(b.key) && 'bg-background-secondary-default/70'
                  )}
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

      <div
        ref={scrollRef}
        data-scope="grid"
        onScroll={syncStrip}
        className="min-h-0 flex-1 overflow-auto bg-background-primary-default"
      >
        <RacTable aria-label="Besoins matières" className="bui-table appro-grid">
          <TableHeader>
            <TableColumn
              id="article"
              isRowHeader
              textValue="Composant"
              className={cx('stick sl0', hoverCol === 'article' && 'wash')}
            >
              <span className="text-caption-1-medium text-text-tertiary">Composant</span>
            </TableColumn>
            <TableColumn
              id="description"
              textValue="Désignation"
              className={cx('stick sl110', hoverCol === 'description' && 'wash')}
            >
              <span className="text-caption-1-medium text-text-tertiary">Désignation</span>
            </TableColumn>
            <TableColumn
              id="type"
              textValue="Type"
              className={hoverCol === 'type' ? 'wash' : undefined}
            >
              <span className="text-caption-1-medium text-text-tertiary">Type</span>
            </TableColumn>
            <TableColumn
              id="stock"
              textValue="Stock"
              className={hoverCol === 'stock' ? 'wash' : undefined}
            >
              <span className="text-caption-1-medium text-text-tertiary">Stock</span>
            </TableColumn>
            <TableColumn
              id="valeur"
              textValue="Valo"
              className={hoverCol === 'valeur' ? 'wash' : undefined}
            >
              <span className="text-caption-1-medium text-text-tertiary">Valo</span>
            </TableColumn>
            <TableColumn
              id="total"
              textValue={`Total ${cran}`}
              className={hoverCol === 'total' ? 'wash' : undefined}
            >
              <span className="text-caption-1-semibold text-text-primary">Total {cran}</span>
            </TableColumn>
            {subs.map((s) => {
              const on = sortOn(s)
              return (
                <TableColumn
                  key={s.key}
                  id={s.key}
                  textValue={`${s.label} ${s.ferme ? 'Ferme' : 'Prévision'}`}
                  className={cx('c', hoverCol === s.key && 'wash')}
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
            {pageRows.map((r, idx) => {
              const gi = start + idx
              const manque = resteTotal(r) > 0
              return (
                <TableRow
                  key={`${r.article}@@${gi}`}
                  className={cx(gi % 2 === 1 && 'alt', r.article === selected && 'sel')}
                  onPress={() => props.onSelect(r.article)}
                >
                  <TableCell className={cx('stick sl0', hoverCol === 'article' && 'wash')}>
                    <span
                      className={cx(
                        'inline-flex max-w-full items-center gap-1 font-mono text-caption-1-semibold tracking-tight',
                        manque ? 'text-status-rose-text' : 'text-text-primary'
                      )}
                    >
                      <span
                        className="min-w-0 truncate"
                        title={
                          manque
                            ? 'Reste à couvrir non nul — voir l’origine du besoin'
                            : 'Voir l’origine du besoin (appelé par)'
                        }
                      >
                        {r.article}
                      </span>
                      {r.tronque && (
                        <TooltipTrigger delay={0}>
                          <span className="inline-flex shrink-0 cursor-help items-center text-status-yellow-text">
                            ⚠
                          </span>
                          <Tooltip>Descendance incomplète</Tooltip>
                        </TooltipTrigger>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className={cx('stick sl110', hoverCol === 'description' && 'wash')}>
                    <span
                      className="block truncate text-caption-1-regular text-text-secondary"
                      title={r.description}
                    >
                      {r.description}
                    </span>
                  </TableCell>
                  <TableCell className={hoverCol === 'type' ? 'wash' : undefined}>
                    <span className="inline-flex items-center gap-1.5 text-caption-1-regular text-text-secondary">
                      <StatusDot color={r.supplyType === 'ACHAT' ? 'indigo' : 'green'} />
                      {r.supplyType === 'ACHAT' ? 'Acheté' : 'Fabriqué'}
                    </span>
                  </TableCell>
                  <TableCell className={cx('text-right', hoverCol === 'stock' && 'wash')}>
                    <span className="font-mono text-caption-1-regular tabular-nums text-text-primary">
                      {fr(r.stock)}
                    </span>
                  </TableCell>
                  <TableCell className={cx('text-right', hoverCol === 'valeur' && 'wash')}>
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
                  <TableCell className={cx('text-right', hoverCol === 'total' && 'wash')}>
                    <span
                      className={cx(
                        'font-mono text-caption-1-semibold tabular-nums',
                        manque ? 'text-status-rose-text' : 'text-text-primary'
                      )}
                    >
                      {fr(cranTotal(r, cran))}
                    </span>
                  </TableCell>
                  {subs.map((s) => {
                    const v = cranOf(r, cran, s.i, s.ferme)
                    return (
                      <TableCell
                        key={s.key}
                        className={cx('cell-pad0 text-right', hoverCol === s.key && 'wash')}
                      >
                        <span
                          className="block px-3 py-1 font-mono text-caption-1-regular tabular-nums text-text-primary"
                          style={heatStyle(v, rowMax.get(r.article) ?? 0, s.ferme)}
                        >
                          {v === 0 ? null : (
                            <span className={s.ferme ? undefined : 'text-text-secondary'}>
                              {fr(v)}
                            </span>
                          )}
                        </span>
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </RacTable>
        {/* Pied de totaux GLOBAUX épinglé (même conteneur de scroll). Table
            simple, mêmes largeurs que le corps. */}
        <div className="sticky bottom-0 z-10 border-t border-separator-border-strong bg-background-secondary-default">
          <table className="w-max table-fixed border-collapse">
            <caption className="sr-only">Totaux du périmètre affiché</caption>
            <tbody>
              <tr>
                <td className="sticky left-0 z-[1] w-[110px] bg-background-secondary-default px-3 py-2">
                  <span className="block text-left text-caption-1-semibold text-text-secondary">
                    Total
                  </span>
                </td>
                <td className="sticky left-[110px] z-[1] w-[260px] bg-background-secondary-default px-3 py-2" />
                <td className="w-[110px] px-3 py-2" />
                <td className="w-[95px] px-3 py-2 text-right font-mono text-caption-1-semibold tabular-nums text-text-primary">
                  {fr(sums.stock)}
                </td>
                <td className="w-[100px] px-3 py-2 text-right font-mono text-caption-1-semibold tabular-nums text-text-secondary">
                  {sums.valeur == null ? '—' : fmtEuro.format(sums.valeur)}
                </td>
                <td className="w-[150px] px-3 py-2 text-right font-mono text-caption-1-semibold tabular-nums text-text-primary">
                  {fr(sums.total)}
                </td>
                {subs.map((s) => {
                  const t = sums.per.get(s.key) ?? 0
                  return (
                    <td
                      key={s.key}
                      className={cx(
                        'border-l border-separator-border-strong px-3 py-2 text-right font-mono text-caption-1-semibold tabular-nums',
                        s.ferme ? 'w-[88px] text-text-primary' : 'w-[72px] text-text-secondary',
                        hoverCol === s.key && 'bg-background-secondary-default/70'
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

      <div className="flex flex-none items-center justify-end px-4 py-2">
        <Pagination page={effPage} totalPages={maxPage} onChange={setPage} />
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
                <p className="flex items-center gap-1.5 text-caption-2-regular text-text-tertiary">
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
