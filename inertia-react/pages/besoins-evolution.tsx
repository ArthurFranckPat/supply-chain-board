/**
 * Page « Évolution des besoins » — composants existants uniquement (AppLayout
 * dense, ToolbarRow/Segment/PILL/RefreshPill, Card, DataTable, Select,
 * LoadingState), mêmes tokens que Réceptions et Conditionnements.
 *
 * Grammaire de la table : vocabulaire de diff de code, emprunté à Primer
 * (GitHub). Signe en gouttière `+ − ± ~ =` doublé d'une teinte — la couleur ne
 * porte jamais un état toute seule, elle doit survivre au gris et à
 * l'impression. Les deux versants d'un mouvement sont teintés au niveau de la
 * valeur (rouge ce qui part, vert ce qui arrive), jamais au niveau de la ligne :
 * le blanc pur est le socle de ce système, 17 500 lignes teintées le
 * retourneraient. Jamais de boîte pleine non plus — elle s'étire avec son
 * libellé et détruit le rythme vertical. Deux lignes par rangée au maximum.
 *
 * Tous les filtres vivent dans la `ToolbarRow`, à leur place canonique. Une
 * grille de 8 cartes posée au milieu de la page les a précédés : c'était un
 * filtre déguisé en tuiles de KPI, la plupart affichant « — ». Ne pas la
 * réintroduire — un filtre n'est pas une donnée.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, CloudOff, Info, Search } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import { Card } from '@r/components/ui/card'
import { StockArticleSheet } from '@r/components/board/stock-article-sheet'
import { DataTable, type ColumnDef } from '@r/components/ui/data-table'
import {
  PILL,
  RefreshPill,
  Segment,
  SegmentButton,
  ToolbarRow,
  ToolbarSpacer,
} from '@r/components/vision/toolbar'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@r/components/ui/select'
import { cn } from '@r/lib/utils'

type Photo = {
  date: string
  lignes: number
  sources: number
  sourceList?: string[]
  priseLe: number | null
}
type DriverSource =
  | 'of_ferme'
  | 'of_planifie'
  | 'of_suggestion'
  | 'demande_ferme'
  | 'demande_prevision'
  | 'stock'
  | 'appro'
  | 'appro_suggestion'
type DriverNature = 'apparue' | 'disparue' | 'quantite' | 'date' | 'renumerotation'
interface DriverDiffEntry {
  article: string
  source: DriverSource
  nature: DriverNature
  quantiteAvant: number | null
  quantiteApres: number | null
  echeanceAvant: string | null
  echeanceApres: string | null
  detail: string
  designation: string | null
  famille: string | null
  vcrnum: string | null
  vcrlin: string | null
  vcrnumApres: string | null
  vcrlinApres: string | null
}
interface DriversDiffResponse {
  avant: string | null
  apres: string | null
  total: number
  parSource?: Record<string, number>
  parNature?: Record<string, number>
  entrees: DriverDiffEntry[]
  ecartes?: string[]
  message?: string
}

const SOURCE_LABEL: Record<DriverSource, string> = {
  demande_ferme: 'Commandes',
  demande_prevision: 'Prévisions',
  stock: 'Stock',
  appro: 'Réceptions',
  of_ferme: 'OF fermes',
  of_planifie: 'OF planifiés',
  of_suggestion: 'OF suggérés',
  appro_suggestion: 'Suggestions CBN',
}
const SOURCES_REALITE: DriverSource[] = [
  'stock',
  'demande_ferme',
  'demande_prevision',
  'appro',
  'of_ferme',
]
const SOURCES_PROPOSITIONS: DriverSource[] = ['of_planifie', 'of_suggestion', 'appro_suggestion']
const NATURE_LABEL: Record<DriverNature, string> = {
  apparue: 'Apparue',
  disparue: 'Disparue',
  quantite: 'Qté',
  date: 'Date',
  renumerotation: 'Renumérotée',
}
const NATURES: DriverNature[] = ['apparue', 'disparue', 'quantite', 'date', 'renumerotation']

/** Sentinelle du Select : Base UI n'accepte pas `''` comme valeur d'item. */
const TOUTES_SOURCES = '__toutes__'

/**
 * État de repos du filtre de nature : tout SAUF la renumérotation.
 *
 * Le CBN détruit et recrée ~17 500 documents par nuit (of_planifie,
 * of_suggestion, appro_suggestion) pour une poignée de mouvements réels. Les
 * afficher par défaut noierait la question posée par l'écran. Elles restent à un
 * clic — écartées, jamais masquées en dur.
 */
const NATURES_PAR_DEFAUT = (): Set<DriverNature> =>
  new Set(NATURES.filter((n) => n !== 'renumerotation'))

/**
 * Teinte par nature, portée par le seul point de la colonne Nature et par le
 * chiffre de l'Écart — deux surfaces de quelques pixels, jamais un fond.
 *
 * Les couleurs viennent de la palette du projet. DESIGN.md interdit de
 * détourner les teintes de statut en accents DÉCORATIFS ; ici elles encodent un
 * axe sémantique, et cette page n'affiche aucun statut d'OF (la colonne Source
 * est du texte), donc aucune collision de vocabulaire à l'écran.
 */
const NATURE_TONE: Record<DriverNature, { text: string; signe: string }> = {
  // Entrée dans le plan.
  apparue: { text: 'text-ferme', signe: '+' },
  // Sortie du plan.
  disparue: { text: 'text-destructive', signe: '−' },
  // Le volume bouge.
  quantite: { text: 'text-warning', signe: '±' },
  // Le calendrier bouge.
  date: { text: 'text-planifie', signe: '~' },
  // Rien n'a bougé : ni teinte ni signe orienté.
  renumerotation: { text: 'text-muted-foreground', signe: '=' },
}

/**
 * Paire avant/après à la manière d'un diff de code.
 *
 * Primer (GitHub) empile trois niveaux de teinte — gouttière, ligne, mot — et
 * double toujours la couleur d'un signe en gouttière, parce que la couleur
 * seule ne porte pas un état. On en garde deux niveaux sur trois : la teinte de
 * mot sur les deux valeurs, et le signe. Pas de fond de ligne : le blanc pur
 * est le socle de ce système, et 17 500 lignes teintées le retourneraient.
 */
function PaireDiff(props: { avant: string | null; apres: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-xs tabular-nums">
      {props.avant !== null && (
        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
          {props.avant}
        </span>
      )}
      {props.avant !== null && props.apres !== null && (
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
      )}
      {props.apres !== null && (
        <span className="rounded bg-ferme/10 px-1.5 py-0.5 text-ferme">{props.apres}</span>
      )}
    </span>
  )
}

const fmtJJMMAAAA = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}
const fmtJJMM = (iso: string | null): string => (iso ? fmtJJMMAAAA(iso) : '—')

/** Heure locale `HH:MM` d'une capture. */
const fmtHeure = (ms: number | null): string | null => {
  if (ms === null) return null
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Durée réellement écoulée entre deux captures, en `Xh YY`.
 *
 * La photo porte la date du jour mais est prise à l'heure où le serveur est
 * debout : entre deux photos consécutives l'intervalle observé va de 8 h à 40 h.
 * « 06/08 → 07/08 » se lit comme une journée alors que ce peut être une nuit de
 * 10 h — d'où un écran presque vide qu'on croit cassé.
 */
const fmtIntervalle = (deMs: number | null, aMs: number | null): string | null => {
  if (deMs === null || aMs === null) return null
  const min = Math.round((aMs - deMs) / 60_000)
  if (!Number.isFinite(min) || min <= 0) return null
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}
const fmtQte = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtQteSigned = (n: number): string =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtQte.format(Math.abs(n))}`
const joursEntre = (a: string | null, b: string | null): number | null => {
  if (!a || !b) return null
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null
  return Math.round((db - da) / 86_400_000)
}
const ecartLabel = (e: DriverDiffEntry): string => {
  // Renumérotation : rien n'a bougé numériquement, la pièce a changé de numéro.
  // L'écart appartient aux lignes `quantite`/`date` émises à côté s'il y en a.
  if (e.nature === 'renumerotation') return '—'
  if (e.nature === 'apparue') return `+${fmtQte.format(e.quantiteApres ?? 0)}`
  if (e.nature === 'disparue') return `−${fmtQte.format(e.quantiteAvant ?? 0)}`
  if (e.nature === 'date') {
    const d = joursEntre(e.echeanceAvant, e.echeanceApres)
    return d === null ? '—' : `${d > 0 ? '+' : ''}${d} j`
  }
  if (e.quantiteAvant !== null && e.quantiteApres !== null) {
    const delta = e.quantiteApres - e.quantiteAvant
    const base = Math.abs(Math.min(e.quantiteAvant, e.quantiteApres)) || 1
    const pct = Math.round((Math.abs(delta) / base) * 100)
    return `${fmtQteSigned(delta)} · ${delta > 0 ? '+' : '−'}${pct}%`
  }
  return '—'
}
/**
 * Les deux versants d'un mouvement, prêts à teinter.
 * `null` d'un côté = ce versant n'existe pas (apparition, disparition).
 * Rend `null` tout court quand il n'y a rien à opposer — une renumérotation ne
 * fait pas varier la quantité, « 15 000 → 15 000 » se lirait comme un changement.
 */
const paireValeurs = (
  e: DriverDiffEntry
): { avant: string | null; apres: string | null } | null => {
  switch (e.nature) {
    case 'date':
      return { avant: fmtJJMM(e.echeanceAvant), apres: fmtJJMM(e.echeanceApres) }
    case 'apparue':
      return { avant: null, apres: fmtQte.format(e.quantiteApres ?? 0) }
    case 'disparue':
      return { avant: fmtQte.format(e.quantiteAvant ?? 0), apres: null }
    case 'quantite':
      return {
        avant: e.quantiteAvant === null ? '—' : fmtQte.format(e.quantiteAvant),
        apres: e.quantiteApres === null ? '—' : fmtQte.format(e.quantiteApres),
      }
    case 'renumerotation':
      return null
  }
}

const avantApresLabel = (e: DriverDiffEntry): string => {
  const p = paireValeurs(e)
  if (p === null) return e.quantiteApres === null ? '—' : fmtQte.format(e.quantiteApres)
  return `${p.avant ?? '—'} → ${p.apres ?? '—'}`
}

/**
 * Phrase de survol, reconstruite côté écran. Le `detail` du domaine porte les
 * noms techniques des sources (`of_suggestion`, `appro_suggestion`…) : ils sont
 * justes en base et illisibles à l'écran, où la colonne Source dit déjà
 * « OF suggérés ». Le français d'atelier s'arrête ici, pas dans le domaine.
 */
const resumeLabel = (e: DriverDiffEntry): string => {
  const src = SOURCE_LABEL[e.source]
  const ech = e.echeanceApres ?? e.echeanceAvant
  const quand = ech ? `, échéance ${fmtJJMMAAAA(ech)}` : ''
  // Sur une source régénérée, un mouvement s'accompagne presque toujours d'un
  // numéro neuf : le dire, sinon la ligne se lit comme si LA pièce d'avant
  // avait bougé, alors qu'elle a été supprimée et remplacée.
  const remplacee = e.vcrnumApres
    ? ` La pièce ${e.vcrnum ?? '—'} a été remplacée par ${e.vcrnumApres}.`
    : ''
  switch (e.nature) {
    case 'apparue':
      return `${src} — ligne apparue : ${fmtQte.format(e.quantiteApres ?? 0)} unités${quand}.`
    case 'disparue':
      return `${src} — ligne disparue : ${fmtQte.format(e.quantiteAvant ?? 0)} unités${quand}.`
    case 'quantite':
      return `${src} — quantité ${fmtQte.format(e.quantiteAvant ?? 0)} → ${fmtQte.format(e.quantiteApres ?? 0)}.${remplacee}`
    case 'date':
      return `${src} — échéance ${fmtJJMM(e.echeanceAvant)} → ${fmtJJMM(e.echeanceApres)}.${remplacee}`
    case 'renumerotation':
      return `${src} — pièce remplacée : ${e.vcrnum ?? '—'} → ${e.vcrnumApres ?? '—'}, quantité et échéance inchangées.`
  }
}
const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export default function BesoinsEvolution() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photosLoading, setPhotosLoading] = useState(true)
  const [photosError, setPhotosError] = useState<string | null>(null)
  const [avant, setAvant] = useState<string | null>(null)
  const [apres, setApres] = useState<string | null>(null)
  const [diff, setDiff] = useState<DriversDiffResponse | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<DriverSource | null>(null)
  // Multi-sélection, et non un choix exclusif : la question posée à l'écran est
  // « qu'est-ce qui a bougé cette nuit », pas « montre-moi une seule nature ».
  // Tout est coché SAUF la renumérotation — le CBN en produit ~17 500 par nuit
  // pour une poignée de vrais mouvements, elle noierait la première lecture.
  // Elle reste à un clic, jamais masquée en dur.
  const [natureFilters, setNatureFilters] = useState<Set<DriverNature>>(NATURES_PAR_DEFAUT)
  const [search, setSearch] = useState('')
  const [sheetArticle, setSheetArticle] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const reloadPhotos = async () => {
    setPhotosLoading(true)
    setPhotosError(null)
    try {
      const res = await fetch('/api/v1/appro/snapshots')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { photos: Photo[] }
      const list = json.photos ?? []
      setPhotos(list)
      if (list.length >= 2) {
        const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date))
        setApres(sorted[0].date)
        setAvant(sorted[1].date)
      } else if (list.length === 1) {
        setApres(list[0].date)
        setAvant(null)
      }
    } catch (e) {
      setPhotosError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhotosLoading(false)
    }
  }
  useEffect(() => {
    reloadPhotos()
  }, [])

  // Clé stable du jeu de natures : un `Set` change d'identité à chaque rendu et
  // relancerait la requête en boucle s'il servait de dépendance d'effet.
  const natureKey = [...natureFilters].sort().join(',')
  const estNatureParDefaut = natureKey === [...NATURES_PAR_DEFAUT()].sort().join(',')

  const reloadDiff = async () => {
    if (!avant || !apres) return
    setDiffLoading(true)
    setDiffError(null)
    try {
      // Le filtre de nature part au serveur : sans lui, `total` compterait les
      // ~17 500 renumérotations que l'écran n'affiche pas, et le bandeau
      // « X affichés sur N » mentirait sur ce qui est réellement filtré.
      const nature = natureKey ? `&nature=${encodeURIComponent(natureKey)}` : ''
      const url = `/api/v1/appro/drivers-diff?avant=${encodeURIComponent(avant)}&apres=${encodeURIComponent(apres)}&limit=1000${nature}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as DriversDiffResponse
      setDiff(json)
    } catch (e) {
      setDiffError(e instanceof Error ? e.message : String(e))
    } finally {
      setDiffLoading(false)
    }
  }
  useEffect(() => {
    if (avant && apres) reloadDiff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avant, apres, natureKey])

  const filtered = useMemo(() => {
    if (!diff) return []
    let out = diff.entrees
    if (sourceFilter) out = out.filter((e) => e.source === sourceFilter)
    out = out.filter((e) => natureFilters.has(e.nature))
    if (search.trim()) {
      const q = fold(search.trim())
      // Les deux références sont cherchables : sur une renumérotation, on part
      // aussi souvent du numéro disparu que du nouveau.
      out = out.filter(
        (e) =>
          fold(e.article).includes(q) ||
          (e.designation !== null && fold(e.designation).includes(q)) ||
          (e.vcrnum !== null && fold(e.vcrnum).includes(q)) ||
          (e.vcrnumApres !== null && fold(e.vcrnumApres).includes(q))
      )
    }
    return out
  }, [diff, sourceFilter, natureFilters, search])

  const total = diff?.total ?? 0
  const entrees = diff?.entrees ?? []
  const parSource = diff?.parSource ?? {}
  const hasMessage = Boolean(diff?.message)
  const photoOptions = useMemo(
    () => [...photos].sort((a, b) => b.date.localeCompare(a.date)),
    [photos]
  )
  // Libellé de la fenêtre comparée, à l'heure près. Les dates seules laissent
  // croire à une journée pleine ; l'intervalle mesuré dit ce qui a réellement
  // été observé, et rend deux couples comparables entre eux.
  const photoDe = photos.find((p) => p.date === avant) ?? null
  const photoA = photos.find((p) => p.date === apres) ?? null
  const heureDe = fmtHeure(photoDe?.priseLe ?? null)
  const heureA = fmtHeure(photoA?.priseLe ?? null)
  const intervalle = fmtIntervalle(photoDe?.priseLe ?? null, photoA?.priseLe ?? null)
  const rangeLabel =
    avant && apres
      ? `${fmtJJMMAAAA(avant)}${heureDe ? ` ${heureDe}` : ''} → ${fmtJJMMAAAA(apres)}${heureA ? ` ${heureA}` : ''}`
      : photosLoading
        ? '…'
        : '—'

  const columns = useMemo<ColumnDef<DriverDiffEntry>[]>(
    () => [
      {
        id: 'article',
        header: 'Article',
        accessorFn: (r) => r.article,
        // Deux lignes, jamais trois : la famille rejoint la désignation en
        // suffixe. Elle valait une ligne entière pour trois caractères, et
        // c'est ce troisième niveau qui faisait respirer les rangées de façon
        // inégale selon que l'article portait ou non une famille.
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex max-w-[260px] flex-col" title={resumeLabel(r)}>
              <span className="truncate font-mono text-xs font-semibold tabular-nums text-foreground">
                {r.article}
              </span>
              <span className="truncate text-xs leading-tight text-muted-foreground">
                {r.designation ?? <span className="italic">sans désignation</span>}
                {r.famille && <span className="tabular-nums"> · {r.famille}</span>}
              </span>
            </div>
          )
        },
        meta: { tdClass: 'px-3 py-2', thClass: 'px-3 py-2' },
      },
      {
        id: 'piece',
        header: 'Pièce',
        accessorFn: (r) => r.vcrnum ?? '',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          if (!r.vcrnum) return <span className="font-mono text-xs text-muted-foreground">—</span>
          const avant = r.vcrlin ? `${r.vcrnum} L${r.vcrlin}` : r.vcrnum
          // Renumérotation : la pièce a été remplacée. Les deux références sur la
          // même ligne — c'est l'information, pas une disparition suivie d'une
          // apparition.
          // Une pièce remplacée EST un diff : ancienne référence retirée,
          // nouvelle ajoutée. Même vocabulaire que la colonne Avant → Après,
          // empilé parce que les références sont longues.
          if (r.vcrnumApres) {
            const apres = r.vcrlinApres ? `${r.vcrnumApres} L${r.vcrlinApres}` : r.vcrnumApres
            return (
              <span
                className="flex flex-col items-start gap-0.5 whitespace-nowrap font-mono text-xs leading-tight tabular-nums"
                title={`${avant} → ${apres}`}
              >
                <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive line-through">
                  {avant}
                </span>
                <span className="rounded bg-ferme/10 px-1.5 py-0.5 text-ferme">{apres}</span>
              </span>
            )
          }
          return (
            <span
              className="whitespace-nowrap font-mono text-xs tabular-nums text-foreground"
              title={avant}
            >
              {avant}
            </span>
          )
        },
        meta: { tdClass: 'px-3 py-2', thClass: 'px-3 py-2' },
      },
      {
        id: 'source',
        header: 'Source',
        accessorFn: (r) => r.source,
        enableSorting: false,
        // Texte nu, pas de pastille : une boîte s'étire avec son libellé et
        // casse le rythme vertical dès qu'un libellé passe sur deux lignes.
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-foreground">
            {SOURCE_LABEL[row.original.source]}
          </span>
        ),
        meta: { tdClass: 'px-3 py-2', thClass: 'px-3 py-2' },
      },
      {
        id: 'nature',
        header: 'Nature',
        accessorFn: (r) => r.nature,
        enableSorting: false,
        // Point + petites capitales (DESIGN.md, Chips/Badges) : hauteur fixe,
        // insensible à la longueur du libellé. Le point plein marque un
        // mouvement réel, le point creux une renumérotation — la seule nature
        // où rien n'a bougé. Aucune teinte décorative : les couleurs de statut
        // métier ne sont pas détournées pour coder un axe qui n'est pas le leur.
        // Signe en gouttière plutôt que pastille de couleur : c'est la règle que
        // Primer et les guides de tables rappellent tous les deux — la couleur
        // seule ne porte jamais un état. `+ − ± ~ =` restent lisibles en
        // niveaux de gris, à l'impression et en vision déficiente.
        cell: ({ row }) => {
          const n = row.original.nature
          const tone = NATURE_TONE[n]
          return (
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span
                aria-hidden
                className={cn(
                  'w-3 shrink-0 text-center font-mono text-xs font-bold leading-none',
                  tone.text
                )}
              >
                {tone.signe}
              </span>
              <span
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-[0.08em]',
                  n === 'renumerotation' ? 'text-muted-foreground' : 'text-foreground'
                )}
              >
                {NATURE_LABEL[n]}
              </span>
            </span>
          )
        },
        meta: { tdClass: 'px-3 py-2', thClass: 'px-3 py-2' },
      },
      {
        id: 'avantApres',
        header: 'Avant → Après',
        enableSorting: false,
        accessorFn: (r) => `${r.quantiteAvant ?? ''}->${r.quantiteApres ?? ''}`,
        cell: ({ row }) => {
          const p = paireValeurs(row.original)
          if (p === null) {
            return (
              <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                {avantApresLabel(row.original)}
              </span>
            )
          }
          return <PaireDiff avant={p.avant} apres={p.apres} />
        },
        meta: { tdClass: 'px-3 py-2', thClass: 'px-3 py-2' },
      },
      {
        id: 'ecart',
        header: 'Écart',
        accessorFn: (r) => ecartLabel(r),
        cell: ({ row }) => (
          <span
            className={cn(
              'whitespace-nowrap font-mono text-xs font-semibold tabular-nums',
              NATURE_TONE[row.original.nature].text
            )}
          >
            {ecartLabel(row.original)}
          </span>
        ),
        meta: { tdClass: 'px-3 py-2 text-right', thClass: 'px-3 py-2 text-right' },
      },
    ],
    []
  )

  return (
    <AppLayout
      active="besoins-evolution"
      subtitle="Évolution des besoins"
      title="Évolution des besoins — Supply Chain Board"
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <>
          <div className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
            {rangeLabel}
          </div>
          <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {diff
              ? `${fmtQte.format(total)} mouvement${total > 1 ? 's' : ''}${intervalle ? ` · ${intervalle} écoulées` : ''}`
              : photosLoading
                ? '…'
                : '—'}
          </div>
        </>
      }
    >
      <div className="flex h-full flex-col overflow-hidden">
        <ToolbarRow>
          <span className="hidden sm:inline font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Photos
          </span>
          <Select value={avant ?? ''} onValueChange={(v) => setAvant(v || null)}>
            <SelectTrigger className="h-8 min-w-[148px] rounded-full border-border bg-card font-mono text-xs tabular-nums">
              <SelectValue placeholder="Référence" />
            </SelectTrigger>
            <SelectContent>
              {photoOptions.map((p) => (
                <SelectItem key={p.date} value={p.date}>
                  {fmtJJMMAAAA(p.date)}
                  {fmtHeure(p.priseLe) ? ` ${fmtHeure(p.priseLe)}` : ''} · {fmtQte.format(p.lignes)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="font-mono text-xs text-muted-foreground">→</span>
          <Select value={apres ?? ''} onValueChange={(v) => setApres(v || null)}>
            <SelectTrigger className="h-8 min-w-[148px] rounded-full border-border bg-card font-mono text-xs tabular-nums">
              <SelectValue placeholder="Comparée" />
            </SelectTrigger>
            <SelectContent>
              {photoOptions.map((p) => (
                <SelectItem key={p.date} value={p.date}>
                  {fmtJJMMAAAA(p.date)}
                  {fmtHeure(p.priseLe) ? ` ${fmtHeure(p.priseLe)}` : ''} · {fmtQte.format(p.lignes)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Le filtre de source vit ici, à sa place canonique dans l'ordre de
              `toolbar.tsx` (segments de filtre après la fenêtre de dates). Il
              remplace une grille de 8 cartes posée au milieu de la page, qui
              n'était qu'un filtre déguisé en tuiles de KPI — la plupart à
              « — ». Un Select porte les mêmes compteurs sans occuper de bande. */}
          <Select
            value={sourceFilter ?? TOUTES_SOURCES}
            onValueChange={(v) =>
              setSourceFilter(v === TOUTES_SOURCES ? null : (v as DriverSource))
            }
          >
            <SelectTrigger className="h-8 min-w-[172px] rounded-full border-border bg-card text-xs">
              <SelectValue placeholder="Toutes les sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TOUTES_SOURCES}>Toutes les sources</SelectItem>
              <SelectGroup>
                <SelectLabel>Ce qui a changé dans la réalité</SelectLabel>
                {SOURCES_REALITE.map((src) => (
                  <SelectItem key={src} value={src}>
                    {SOURCE_LABEL[src]}
                    <span className="ml-2 tabular-nums text-muted-foreground">
                      {parSource[src] ? fmtQte.format(parSource[src]) : '—'}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Ce que le CBN propose</SelectLabel>
                {SOURCES_PROPOSITIONS.map((src) => (
                  <SelectItem key={src} value={src}>
                    {SOURCE_LABEL[src]}
                    <span className="ml-2 tabular-nums text-muted-foreground">
                      {parSource[src] ? fmtQte.format(parSource[src]) : '—'}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Segment ariaLabel="Natures affichées">
            {NATURES.map((n) => (
              <SegmentButton
                key={n}
                active={natureFilters.has(n)}
                title={
                  natureFilters.has(n)
                    ? `Masquer les lignes « ${NATURE_LABEL[n]} »`
                    : `Afficher les lignes « ${NATURE_LABEL[n]} »`
                }
                onClick={() =>
                  setNatureFilters((prev) => {
                    const next = new Set(prev)
                    if (next.has(n)) next.delete(n)
                    else next.add(n)
                    return next
                  })
                }
              >
                {NATURE_LABEL[n]}
              </SegmentButton>
            ))}
          </Segment>
          <ToolbarSpacer />
          <div className={PILL}>
            <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[200px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
              placeholder="Article, désignation ou n° de pièce"
              type="text"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="hidden xl:inline font-mono text-xs tabular-nums text-muted-foreground">
            {filtered.length} / {entrees.length}
            {total > entrees.length ? ` · ${fmtQte.format(total)}` : ''}
          </span>
          <RefreshPill
            loading={photosLoading || diffLoading}
            onClick={() => (avant && apres ? reloadDiff() : reloadPhotos())}
          />
        </ToolbarRow>

        <div className="hidden flex-none items-baseline justify-between border-b border-border px-7 pb-3 pt-1 print:flex">
          <span className="text-[20px] font-semibold tracking-tight text-foreground">
            Évolution des besoins{' '}
            <span className="ml-3 font-mono text-sm font-normal text-muted-foreground">
              {rangeLabel}
            </span>
          </span>
          <span className="font-mono text-[12px] text-muted-foreground">
            {fmtQte.format(total)} mouvements
          </span>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden bg-surface-soft">
          <div className="flex-1 overflow-auto">
            <div className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6 lg:px-7">
              <div className="mb-4">
                <h1 className="text-[20px] font-extrabold leading-none tracking-[-0.02em] text-foreground">
                  Évolution des besoins
                </h1>
                <p className="mt-1.5 max-w-[68ch] text-sm leading-[1.5] text-muted-foreground">
                  Ce que le CBN a vu bouger entre deux nuits — le besoin brut, pas le message. Le
                  bandeau dit où regarder, la table est triée par amplitude relative (ratio, pas
                  absolu).
                </p>
              </div>

              {photosError && (
                <div className="mb-4 flex items-center gap-2 rounded-[8px] border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle size={14} /> {photosError}
                </div>
              )}

              {photosLoading ? null : photos.length < 2 ? (
                <Card className="p-8 text-center">
                  <div className="mx-auto flex max-w-[520px] flex-col items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-full border border-border bg-card">
                      <CalendarRange size={18} className="text-muted-foreground" />
                    </div>
                    <h2 className="text-base font-semibold text-foreground">
                      L&apos;historique commence
                    </h2>
                    <p className="text-sm leading-[1.5] text-muted-foreground">
                      Une seconde photo est nécessaire — elle arrivera cette nuit.
                      {photos.length === 1 && (
                        <>
                          <br />
                          Photo existante :{' '}
                          <span className="font-mono tabular-nums text-foreground">
                            {fmtJJMMAAAA(photos[0].date)}
                          </span>{' '}
                          · {fmtQte.format(photos[0].lignes)} lignes
                        </>
                      )}
                      {photos.length === 0 && ' Aucune photo disponible.'}
                    </p>
                  </div>
                </Card>
              ) : hasMessage ? (
                <Card className="p-6">
                  <div className="flex gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-warning/30 bg-warning/10">
                      <CloudOff size={16} className="text-warning" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Photo indisponible</h3>
                      <p className="mt-1 text-sm leading-[1.5] text-muted-foreground">
                        {diff?.message}
                      </p>
                      {avant && apres && (
                        <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                          Couple demandé : {fmtJJMMAAAA(avant)} → {fmtJJMMAAAA(apres)}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ) : diffError ? (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
                  <AlertTriangle size={16} strokeWidth={1.75} className="text-destructive" />
                  <span className="font-bold">Erreur chargement :</span>
                  <span className="font-mono">{diffError}</span>
                </div>
              ) : diffLoading ? (
                <LoadingState
                  title="Comparaison des deux photos…"
                  description="~73 000 lignes lues"
                  variant="orb"
                  orbState="searching"
                  className="py-10"
                />
              ) : (
                <div className="space-y-3">
                  {diff?.ecartes !== undefined && diff.ecartes.length > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs leading-[1.5] text-foreground">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                      <span>
                        Comparaison sur périmètre restreint — absente(s) d&apos;une des deux
                        photos :{' '}
                        <span className="font-mono font-semibold tabular-nums">
                          {diff.ecartes.map((s) => SOURCE_LABEL[s as DriverSource] ?? s).join(', ')}
                        </span>
                        . Ces sources sont écartées du diff (elles n&apos;apparaissent pas comme
                        &laquo; apparues &raquo;).
                      </span>
                    </div>
                  )}
                  {total > entrees.length && (
                    <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground">
                      <Info size={14} className="shrink-0 text-warning" /> {entrees.length} affichés
                      sur {fmtQte.format(total)} — affinez par source ou nature.
                    </div>
                  )}

                  <div className="flex items-center gap-2 border-b border-border/50 px-1 py-1.5">
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {filtered.length} ligne{filtered.length > 1 ? 's' : ''} · tri ratio
                    </span>
                    {(sourceFilter || !estNatureParDefaut || search) && (
                      <button
                        type="button"
                        // « Réinitialiser » et non « Effacer » : l'état de repos
                        // n'est pas « tout affiché » mais « tout sauf les
                        // renumérotations ». Vider les filtres ferait revenir les
                        // 17 500 lignes que le défaut écarte volontairement.
                        onClick={() => {
                          setSourceFilter(null)
                          setNatureFilters(NATURES_PAR_DEFAUT())
                          setSearch('')
                        }}
                        className="ml-auto font-mono text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Réinitialiser les filtres
                      </button>
                    )}
                  </div>

                  {total === 0 ? (
                    <Card className="p-8 text-center">
                      <p className="text-sm font-semibold text-foreground">
                        Aucun mouvement au-delà des seuils
                      </p>
                      <p className="mt-1 text-sm leading-[1.5] text-muted-foreground">
                        Entre le{' '}
                        <span className="font-mono tabular-nums text-foreground">
                          {fmtJJMMAAAA(avant!)}
                        </span>{' '}
                        et le{' '}
                        <span className="font-mono tabular-nums text-foreground">
                          {fmtJJMMAAAA(apres!)}
                        </span>
                        , aucune des 8 sources n&apos;a bougé.
                      </p>
                      <div className="mt-3 inline-block rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                        Seuils : quantité ±20 % · échéance ±7 j
                      </div>
                    </Card>
                  ) : (
                    <div>
                      <DataTable
                        columns={columns}
                        rows={filtered}
                        sorting={[]}
                        onSortingChange={() => {}}
                        getRowKey={(r) => `${r.article}-${r.source}-${r.nature}`}
                        onRowClick={(r) => {
                          setSheetArticle(r.article)
                          setSheetOpen(true)
                        }}
                        emptyState={
                          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                            <span className="text-sm text-muted-foreground">
                              Aucun résultat avec ces filtres.
                            </span>
                          </div>
                        }
                      />
                      <p className="mt-3 text-center font-mono text-[10px] text-muted-foreground">
                        Tri par amplitude relative (ratio), pas absolu · Un article 10 → 0 passe
                        avant un stock qui bouge de 2 %.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <StockArticleSheet article={sheetArticle} open={sheetOpen} onOpenChange={setSheetOpen} />
    </AppLayout>
  )
}
