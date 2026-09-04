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
import { Fragment, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { CalendarDate, parseDate } from '@internationalized/date'
import {
  RiAlertLine,
  RiArrowDownSLine,
  RiBarChartLine,
  RiCalendarLine,
  RiCloudOffLine,
  RiDashboardLine,
  RiErrorWarningLine,
  RiFilter3Line,
  RiFilterOffLine,
  RiInboxLine,
  RiSearchLine,
  RiShoppingCartLine,
  RiTruckLine,
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
import DataTable, { type ColumnDef } from '@r/components/ui/data-table'
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
  TRIGGER_ACTIVE,
  TRIGGER_SECONDARY,
  segmentItemDense,
  segmentItemTinted,
} from '@r/components/appro/chrome'
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

/** Séparateur décimal français : la virgule, pas le point (convention suivi). */
const fr = (n: number): string => n.toString().replace('.', ',')

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
/** Tri par défaut : valorisation du stock (enjeu financier d'abord). */
type SortKey = 'valeur' | 'net' | 'article'

const SUPPLY_LABEL: Record<SupplyFilter, string> = {
  TOUS: 'Tous',
  ACHAT: 'Achetés',
  FABRICATION: 'Fabriqués',
}

const SORT_LABEL: Record<SortKey, string> = {
  valeur: 'Valorisation',
  net: 'Net décroissant',
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
  const [sort, setSort] = useState<SortKey>('valeur')
  const [selected, setSelected] = useState<string | null>(null)

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

  const rows = useMemo(() => {
    const q = fold(query.trim())
    const out = view.filter((r) => {
      if (supply !== 'TOUS' && r.supplyType !== supply) return false
      if (manquesOnly && resteTotal(r) <= 0) return false
      if (q && !fold(`${r.article} ${r.description}`).includes(q)) return false
      return true
    })
    // Valorisation : décroissante, PMP inconnu en dernier (pas de valeur = pas
    // de priorité financière, jamais l'inverse).
    out.sort((a, b) => {
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
  }, [view, query, supply, manquesOnly, sort, cran])

  // Filtres secondaires uniquement (hors recherche + pill ligne, toujours
  // visibles) — même doctrine que suivi : un filtre est « actif » quand il
  // s'écarte du défaut.
  const filtersActive = supply !== 'ACHAT' || manquesOnly || sort !== 'valeur' || ligne !== null
  const isFiltered = !!query.trim() || filtersActive

  const resetFilters = () => {
    setQuery('')
    setSupply('ACHAT')
    setManquesOnly(false)
    setLigne(null)
    setSort('valeur')
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
                      <SegmentedControlItem
                        id={c.id}
                        // « Reste à couvrir » prend le rose des manques de la
                        // grille : c'est la lecture « risque », la barre et le
                        // tableau doivent le dire de la même couleur.
                        className={
                          c.id === 'reste'
                            ? segmentItemTinted('text-status-rose-text')
                            : segmentItemDense
                        }
                      >
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
                    </DropdownGroup>
                    <DropdownDivider />
                    <DropdownGroup label="Tri">
                      {(['valeur', 'net', 'article'] as SortKey[]).map((k) => (
                        <DropdownItem
                          key={k}
                          selected={sort === k}
                          onSelect={() => setSort(k)}
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
                  fieldClassName="[&_svg]:size-4 [&_input]:text-caption-1-medium"
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
                    rows={rows}
                    cran={cran}
                    gran={gran}
                    selected={selected}
                    onSelect={setSelected}
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
 * chaînes. Tri désactivé colonne par colonne (le tri reste piloté par le menu
 * Filtres › Tri) ; en-têtes de périodes empilés (période + Ferme/Prév.) sur
 * une seule rangée — `DataTable` ne gère pas le colSpan, le libellé n'est
 * donc rendu qu'une fois, côté Ferme, et le filet vertical fait le groupe.
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

function ApproTable(props: {
  buckets: ApproBucket[]
  rows: ApproRow[]
  cran: ApproCran
  gran: ApproGran
  selected: string | null
  onSelect: (article: string) => void
}) {
  const { buckets, rows, cran, gran } = props

  // Maximum par ligne sur la fenêtre (fermes ET prévisions confondus) —
  // dénominateur de la carte de chaleur. Mémoïsé : le calculer dans la cellule
  // le referait une fois par cellule rendue.
  const rowMax = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      let max = 0
      for (let i = 0; i < buckets.length; i++) {
        max = Math.max(max, cranOf(r, cran, i, true), cranOf(r, cran, i, false))
      }
      m.set(r.article, max)
    }
    return m
  }, [rows, buckets, cran])

  const columns = useMemo<ColumnDef<ApproRow>[]>(
    () => [
      {
        id: 'article',
        header: 'Composant',
        accessorFn: (r) => r.article,
        enableSorting: false,
        meta: {
          thClass: 'w-[110px] text-caption-1-medium text-text-tertiary',
          tdClass: 'py-1.5 font-mono text-body-2-semibold tracking-tight text-text-primary',
        },
        // Rose = ce composant a un reste à couvrir sur la fenêtre. C'est LE
        // signal actionnable de la page ; il vaut d'être lisible sans passer
        // par le filtre « Manques seuls ». Ambre = descendance incomplète,
        // qui est un doute sur la donnée, pas un manque — deux couleurs, deux
        // natures de problème, jamais mélangées.
        cell: ({ row }) => {
          const manque = resteTotal(row.original) > 0
          return (
            <span
              className={cx('inline-flex items-center gap-1', manque && 'text-status-rose-text')}
            >
              <span
                title={
                  manque
                    ? 'Reste à couvrir non nul — voir l’origine du besoin'
                    : 'Voir l’origine du besoin (appelé par)'
                }
              >
                {row.original.article}
              </span>
              {row.original.tronque && (
                <TooltipTrigger delay={0}>
                  <span className="inline-flex cursor-help items-center text-status-yellow-text">
                    ⚠
                  </span>
                  <Tooltip>Descendance incomplète</Tooltip>
                </TooltipTrigger>
              )}
            </span>
          )
        },
      },
      {
        id: 'description',
        header: 'Désignation',
        accessorFn: (r) => r.description,
        enableSorting: false,
        // Largeur fixe : en layout fixe, sans width la colonne absorbe tout
        // l'espace restant. Tronquée avec ellipsis (+ title = texte complet).
        meta: {
          thClass: 'w-[260px] overflow-hidden text-caption-1-medium text-text-tertiary',
          tdClass: 'w-[260px] overflow-hidden py-1.5',
        },
        cell: ({ row }) => (
          <span
            className="block truncate text-body-2-regular text-text-secondary"
            title={row.original.description}
          >
            {row.original.description}
          </span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        accessorFn: (r) => r.supplyType,
        enableSorting: false,
        meta: {
          thClass: 'w-[110px] overflow-hidden text-caption-1-medium text-text-tertiary',
          tdClass:
            'overflow-hidden whitespace-nowrap py-1.5 text-body-2-regular text-text-secondary',
        },
        // `StatusDot` et pas `Chip` : « Acheté » est une catégorie que porte
        // chaque ligne, pas un statut. En chip, la colonne devenait un mur de
        // pastilles bleues qui ne distingue rien, et son padding vertical
        // gonflait la rangée de ~14 px sur une page `dense`. La pastille donne
        // la couleur pour un coût de hauteur nul. Le chip reste au drawer, sur
        // Ferme/Prévision, où la distinction est réelle et binaire.
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <StatusDot color={row.original.supplyType === 'ACHAT' ? 'indigo' : 'green'} />
            {row.original.supplyType === 'ACHAT' ? 'Acheté' : 'Fabriqué'}
          </span>
        ),
      },
      {
        id: 'stock',
        header: 'Stock',
        accessorFn: (r) => r.stock,
        enableSorting: false,
        meta: {
          thClass: 'w-[95px] text-right text-caption-1-medium text-text-tertiary',
          tdClass: 'py-1.5 text-right font-mono text-body-2-regular tabular-nums text-text-primary',
        },
        cell: ({ row }) => fr(row.original.stock),
      },
      {
        id: 'valeur',
        header: 'Valo',
        accessorFn: (r) => r.valeur,
        enableSorting: false,
        meta: {
          thClass: 'w-[100px] text-right text-caption-1-medium text-text-tertiary',
          tdClass:
            'py-1.5 text-right font-mono text-body-2-regular tabular-nums text-text-secondary',
        },
        cell: ({ row }) =>
          row.original.valeur == null ? (
            <span className="text-text-tertiary" title="PMP inconnu — Stock × PMP actuel (ITMMVT)">
              —
            </span>
          ) : (
            <span title={`Stock × PMP actuel = ${fmtEuro.format(row.original.valeur)}`}>
              {fmtEuro.format(row.original.valeur)}
            </span>
          ),
      },
      {
        id: 'total',
        header: `Total ${cran}`,
        accessorFn: (r) => cranTotal(r, cran),
        enableSorting: false,
        meta: {
          thClass:
            'w-[150px] whitespace-nowrap text-right text-caption-1-semibold text-text-primary',
          tdClass:
            'py-1.5 text-right font-mono text-body-2-semibold tabular-nums text-text-primary',
        },
        cell: ({ row }) => (
          <span className={cx(resteTotal(row.original) > 0 && 'text-status-rose-text')}>
            {fr(cranTotal(row.original, cran))}
          </span>
        ),
      },
      // En-tête groupé sans colSpan (DataTable : une rangée) : le libellé de
      // période n'est rendu qu'une fois, côté Ferme — le filet vertical marque
      // le début du groupe, comme un colSpan visuel.
      ...buckets.flatMap((b, i) => [
        {
          id: `${b.key}-ferme`,
          header: (
            <span className="flex flex-col items-end whitespace-nowrap leading-tight">
              <span className="text-caption-1-semibold text-text-primary">{b.label}</span>
              <span className="text-caption-2-medium text-status-blue-text">Ferme</span>
            </span>
          ),
          accessorFn: (r: ApproRow) => cranOf(r, cran, i, true),
          enableSorting: false,
          meta: {
            thClass: 'w-[88px] border-l border-separator-border text-right',
            // p-0 : la teinte est portée par un span interne qui remplit la
            // cellule (le rendu de cellule ne peut pas styler son <td>). Le
            // padding descend donc sur le span, sinon la teinte laisserait un
            // liseré blanc sur les quatre bords.
            tdClass:
              'border-l border-separator-border p-0 text-right font-mono text-body-2-regular tabular-nums text-text-primary',
          },
          cell: ({ row }: { row: { original: ApproRow } }) => {
            const v = cranOf(row.original, cran, i, true)
            return (
              <span
                className="block px-3 py-1.5"
                style={heatStyle(v, rowMax.get(row.original.article) ?? 0, true)}
              >
                {v === 0 ? <span className="text-text-tertiary">—</span> : fr(v)}
              </span>
            )
          },
        },
        {
          id: `${b.key}-prevision`,
          header: (
            <span className="whitespace-nowrap text-caption-2-medium text-status-purple-text">
              Prév.
            </span>
          ),
          accessorFn: (r: ApproRow) => cranOf(r, cran, i, false),
          enableSorting: false,
          meta: {
            thClass: 'w-[72px] text-right',
            tdClass:
              'p-0 text-right font-mono text-body-2-regular tabular-nums text-text-secondary',
          },
          cell: ({ row }: { row: { original: ApproRow } }) => {
            const v = cranOf(row.original, cran, i, false)
            return (
              <span
                className="block px-3 py-1.5"
                style={heatStyle(v, rowMax.get(row.original.article) ?? 0, false)}
              >
                {v === 0 ? <span className="text-text-tertiary">—</span> : fr(v)}
              </span>
            )
          },
        },
      ]),
    ],
    [buckets, cran, rowMax]
  )

  const manquesInView = useMemo(() => rows.filter((r) => resteTotal(r) > 0).length, [rows])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-separator-border bg-background-primary-default">
      {/* Header BoardUI — rounded top sur 1118, tableau en dessous carré */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-3xl border-b border-separator-border bg-background-secondary-default px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="whitespace-nowrap text-caption-1-semibold text-text-secondary">
            {rows.length} composants
          </span>
          {manquesInView > 0 && (
            <Chip variant="caption" color="rose" className="shrink-0">
              {manquesInView} manques
            </Chip>
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

      <DataTable
        columns={columns}
        rows={rows}
        sorting={[]}
        onSortingChange={() => {}}
        tableClass={gran === 'jour' ? 'min-w-[1400px] table-fixed' : 'min-w-[1600px] table-fixed'}
        scrollContainerClass="h-full overflow-auto !rounded-none !border-0 !shadow-none bg-background-primary-default"
        theadRowClass="sticky top-0 z-10 border-0 bg-background-secondary-default"
        // Densité colonne par colonne (`py-1.5` dans tdClass) pour que la teinte
        // `heatStyle` remplisse la cellule (`p-0` côté période).
        getRowClass={() =>
          'border-b border-separator-border last:border-0 hover:bg-background-secondary-hover transition-colors'
        }
        rowSelectedClass="bg-background-secondary-hover ring-2 ring-inset ring-border-focus-ring"
        getRowKey={(r) => r.article}
        onRowClick={(r) => props.onSelect(r.article)}
        selectedRowKey={props.selected}
      />
    </div>
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

  // Regroupement par semaine — les lignes arrivent déjà triées par date (puis
  // quantité au sein d'un jour) côté serveur ; le groupement préserve cet ordre.
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

  return (
    <Sheet open={props.article !== null} onOpenChange={(open) => !open && props.onClose()}>
      {props.article &&
        (loading || !data ? (
          <SheetContent className="no-scrollbar overflow-y-auto sm:max-w-xl">
            <SheetHeader>
              <SheetTitle className="font-mono">{props.article}</SheetTitle>
              <SheetDescription>{error ? error.message : 'Origines du besoin…'}</SheetDescription>
            </SheetHeader>
          </SheetContent>
        ) : (
          <SheetContent className="no-scrollbar overflow-y-auto sm:max-w-xl">
            <SheetHeader>
              <SheetTitle className="font-mono">{data.article}</SheetTitle>
              <SheetDescription>
                Appelé par — {data.lignes.length} origine(s) sur {weeks.length} semaine(s),
                rejouée(s) depuis le snapshot de la grille.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">
              {data.lignes.length === 0 ? (
                <p className="py-6 text-center text-body-regular text-text-secondary">
                  Aucune origine sur cette fenêtre.
                </p>
              ) : (
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="text-caption-1-medium text-text-tertiary">
                      <th className="px-2 py-1.5 font-[inherit]">Jour</th>
                      <th className="px-2 py-1.5 font-[inherit]">Commande</th>
                      <th className="px-2 py-1.5 font-[inherit]">Client</th>
                      <th className="px-2 py-1.5 font-[inherit]">Produit fini</th>
                      <th className="px-2 py-1.5 font-[inherit]">Nature</th>
                      <th className="px-2 py-1.5 text-right font-[inherit]">Qté appelée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w) => (
                      <Fragment key={w.key}>
                        <tr className="bg-background-secondary-default">
                          <td colSpan={6} className="px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-caption-1-semibold text-text-primary">
                                {w.label}
                              </span>
                              <span
                                className="font-mono text-caption-1-semibold tabular-nums text-text-primary"
                                title="Total appelé sur la semaine"
                              >
                                {fr(w.total)}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {w.lignes.map((l, i) => (
                          <Fragment key={i}>
                            <tr className="border-t border-separator-border">
                              <td className="px-2 py-1.5 font-mono text-body-2-regular text-text-secondary">
                                {l.date.slice(8, 10)}/{l.date.slice(5, 7)}
                              </td>
                              <td className="px-2 py-1.5 font-mono text-body-2-semibold tracking-tight text-text-primary">
                                {l.numCommande ?? '—'}
                                {l.ligne ? (
                                  <span className="ml-1.5 text-caption-2-medium text-text-tertiary">
                                    L{l.ligne}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-2 py-1.5 text-body-2-regular text-text-secondary">
                                {l.client || '—'}
                              </td>
                              <td className="px-2 py-1.5 font-mono text-body-2-regular text-text-primary">
                                {l.pfArticle}
                              </td>
                              <td className="px-2 py-1.5">
                                <Chip
                                  variant="caption"
                                  color={l.nature === 'ferme' ? 'blue' : 'soft'}
                                >
                                  {l.nature === 'ferme' ? 'Ferme' : 'Prévision'}
                                </Chip>
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono text-body-2-semibold tabular-nums text-text-primary">
                                {fr(l.quantite)}
                              </td>
                            </tr>
                            {l.path.length > 0 && (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="px-2 pb-1.5 font-mono text-caption-2-regular text-text-tertiary"
                                  title={l.path.join(' › ')}
                                >
                                  via {l.path.join(' › ')}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </SheetContent>
        ))}
    </Sheet>
  )
}
