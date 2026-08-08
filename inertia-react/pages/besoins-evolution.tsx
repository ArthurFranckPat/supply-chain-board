/**
 * Page « Évolution des besoins » — la FRISE des drivers sur une plage (#143).
 *
 * Comparer deux bornes directement ignore tout ce qui s'est passé entre elles :
 * un besoin avancé puis reculé s'y lit « inchangé ». Ici chaque mouvement est
 * daté du JOUR où la paire de photos consécutives l'a observé (colonne Jour),
 * et la page groupe les mouvements par article, en ordre chronologique. Le
 * serveur rend déjà `articles` triés par nombre de mouvements décroissant —
 * la question de l'écran est « quels articles bougent le plus », pas « quel
 * est le plus fort mouvement ».
 *
 * Grammaire de la table : vocabulaire de diff de code, emprunté à Primer
 * (GitHub). Signe en gouttière `+ − ± ~ =` doublé d'une teinte — la couleur ne
 * porte jamais un état toute seule, elle doit survivre au gris et à
 * l'impression. Les deux versants d'un mouvement sont teintés au niveau de la
 * valeur (rouge ce qui part, vert ce qui arrive), jamais au niveau de la ligne :
 * le blanc pur est le socle de ce système, 1 000 lignes teintées le
 * retourneraient. Jamais de boîte pleine non plus — elle s'étire avec son
 * libellé et détruit le rythme vertical. Deux lignes par rangée au maximum.
 *
 * Trois bandeaux parlent de la VALIDITÉ de la frise, jamais de ses données :
 * - les TROUS de la série (une photo attendue manquante entre deux photos
 *   consécutives) : le pas qui les enjambe existe, mais ses mouvements ne
 *   sont pas localisables au jour près — signalé, jamais enjambé en silence ;
 * - le périmètre restreint par pas (#145), agrégé sur toute la plage ;
 * - la volumétrie (`limit=1000`) quand le serveur n'a pas tout renvoyé.
 *
 * Tous les filtres vivent dans la `ToolbarRow`, à leur place canonique. Une
 * grille de 8 cartes posée au milieu de la page les a précédés : c'était un
 * filtre déguisé en tuiles de KPI, la plupart affichant « — ». Ne pas la
 * réintroduire — un filtre n'est pas une donnée.
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, CloudOff, Info, Search } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import { Card } from '@r/components/ui/card'
import { StockArticleSheet } from '@r/components/board/stock-article-sheet'
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
  approvisionnement: 'ACHAT' | 'FABRICATION' | null
  fournisseur: string | null
  vcrnum: string | null
  vcrlin: string | null
  vcrnumApres: string | null
  vcrlinApres: string | null
}
/**
 * Une source retirée de la comparaison (#145), et de QUELLE photo elle manque.
 * Les deux cas se lisent à l'opposé : absente de la photo « avant » = source
 * neuve, l'historique ne remonte pas plus loin ; absente de la photo « après » =
 * capture perdue cette nuit-là. Dans la frise, ce périmètre est PROPRE À
 * CHAQUE PAS — une source écartée sur un pas peut avoir bougé sur les autres.
 */
interface SourceEcartee {
  source: string
  manqueDans: 'avant' | 'apres'
  raison?: 'echec' | 'vide' | 'inconnu'
}
/** Un mouvement de la frise : une entrée de diff datée du pas qui l'a vu. */
interface MouvementFrise extends DriverDiffEntry {
  /** Date de la photo « après » du pas — le jour où le mouvement a été observé. */
  jour: string
}
interface ArticleFrise {
  article: string
  designation: string | null
  famille: string | null
  approvisionnement: 'ACHAT' | 'FABRICATION' | null
  total: number
  /** Chronologique (jour croissant). */
  mouvements: MouvementFrise[]
}
interface PasFrise {
  avant: string
  apres: string
  total: number
  parNature?: Record<string, number>
  parSource?: Record<string, number>
  sourcesEcartees: SourceEcartee[]
  sourcesComparees: string[]
  /** Renseigné quand le pas n'a RIEN à comparer (photo illisible). */
  message: string | null
}
/** Jours calendaires sans photo entre deux photos consécutives de la série. */
interface TrouFrise {
  entre: string
  et: string
  manquants: string[]
}
interface FriseResponse {
  avant: string | null
  apres: string | null
  total: number
  parSource?: Record<string, number>
  parNature?: Record<string, number>
  pas: PasFrise[]
  trous: TrouFrise[]
  articles: ArticleFrise[]
  message?: string | null
}

const SOURCE_LABEL: Record<DriverSource, string> = {
  demande_ferme: 'Commandes',
  demande_prevision: 'Prévisions',
  stock: 'Stock',
  appro: 'Réceptions',
  of_ferme: 'OF fermes',
  of_planifie: 'OF planifiés',
  of_suggestion: 'OF suggérés',
  // « Suggestions CBN » était un faux générique : les OF suggérés viennent du
  // CBN eux aussi (`ORDERS.ORI_0 = 6`). Ce qui distingue cette source, c'est
  // `WIPTYP = 2` — Commande Fournisseur, menu local X3 306. Donc : achats.
  appro_suggestion: 'Achats suggérés',
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
 * afficher par défaut noierait la question posée par l'écran. Elles restent à
 * un clic — écartées, jamais masquées en dur.
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
 * est le socle de ce système, et 1 000 lignes teintées le retourneraient.
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
/** Jour court `JJ/MM` — la colonne Jour de la frise ; l'année dans le survol. */
const fmtJour = (iso: string): string => {
  const [, m, d] = iso.split('-')
  if (!m || !d) return iso
  return `${d}/${m}`
}
const fmtJJMM = (iso: string | null): string => (iso ? fmtJJMMAAAA(iso) : '—')

/**
 * Échéance PORTÉE par le mouvement — celle d'après quand elle existe, celle
 * d'avant sinon (une ligne disparue n'a plus d'après).
 *
 * Sans elle à l'écran, trois `APPARUE 8 064` se lisaient à l'identique alors
 * qu'elles tombaient au 16/09/2026, au 15/10/2026 et au 29/04/2027 : une
 * nouvelle à cinq semaines et une nouvelle à neuf mois n'appellent pas la même
 * réaction. La donnée était déjà dans le payload, elle ne vivait que dans
 * l'infobulle de survol.
 */
const echeancePortee = (e: DriverDiffEntry): string | null => e.echeanceApres ?? e.echeanceAvant

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
    // Pourcentage rapporté à AVANT, pas à la plus petite des deux magnitudes.
    // Le domaine se sert du min pour DÉTECTER (seuil symétrique sur un stock
    // strict négatif) ; réutilisé ici pour AFFICHER, il annonçait 48 384 → 8 064
    // à « −500 % » — une baisse ne peut pas dépasser −100 %, la vraie lecture
    // est −83 %. Base nulle : pas de pourcentage, le delta brut se suffit.
    const base = Math.abs(e.quantiteAvant)
    if (base === 0) return fmtQteSigned(delta)
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

/**
 * Une source écartée sur certains pas seulement, agrégée en vue du bandeau
 * (#145) : clé `source | manqueDans | raison`, pas concernés listés.
 */
type GroupeEcartement = {
  manqueDans: 'avant' | 'apres'
  raison: 'echec' | 'vide' | 'inconnu'
  sources: string[]
  pas: { entre: string; et: string }[]
}

function CellulePiece(props: { m: MouvementFrise }) {
  const r = props.m
  if (!r.vcrnum) return <span className="font-mono text-xs text-muted-foreground">—</span>
  const avant = r.vcrlin ? `${r.vcrnum} L${r.vcrlin}` : r.vcrnum
  // Renumérotation : la pièce a été remplacée. Les deux références sur la
  // même ligne — c'est l'information, pas une disparition suivie d'une
  // apparition.
  // Une pièce remplacée EST un diff : ancienne référence retirée, nouvelle
  // ajoutée. Même vocabulaire que la colonne Avant → Après, empilé parce que
  // les références sont longues.
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
}

function CelluleNature(props: { nature: DriverNature }) {
  const n = props.nature
  const tone = NATURE_TONE[n]
  // Point + petites capitales (DESIGN.md, Chips/Badges) : hauteur fixe,
  // insensible à la longueur du libellé. Le point plein marque un mouvement
  // réel, le point creux une renumérotation — la seule nature où rien n'a
  // bougé. Aucune teinte décorative : les couleurs de statut métier ne sont
  // pas détournées pour coder un axe qui n'est pas le leur.
  // Signe en gouttière plutôt que pastille de couleur : c'est la règle que
  // Primer et les guides de tables rappellent tous les deux — la couleur
  // seule ne porte jamais un état. `+ − ± ~ =` restent lisibles en niveaux de
  // gris, à l'impression et en vision déficiente.
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
}

function CelluleAvantApres(props: { m: MouvementFrise }) {
  const p = paireValeurs(props.m)
  if (p === null) {
    return (
      <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
        {avantApresLabel(props.m)}
      </span>
    )
  }
  return <PaireDiff avant={p.avant} apres={p.apres} />
}

function CelluleEcart(props: { m: MouvementFrise }) {
  const n = props.m.nature
  return (
    <span
      className={cn(
        'whitespace-nowrap font-mono text-xs font-semibold tabular-nums',
        NATURE_TONE[n].text
      )}
    >
      {ecartLabel(props.m)}
    </span>
  )
}

/**
 * Ligne d'en-tête d'un groupe d'article : code + désignation + famille, et le
 * nombre de mouvements — « X sur N » quand le serveur a tronqué l'article
 * (budget `limit`) ou que la recherche n'en montre qu'une partie.
 */
function EnteteArticle(props: { article: ArticleFrise }) {
  const a = props.article
  const affiches = a.mouvements.length
  const tronque = affiches < a.total
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">
        {a.article}
      </span>
      {/* Acheté ou fabriqué : ce que la colonne Source ne dit pas et qui décide
          de la conduite à tenir — passer commande, ou lancer un OF. Neutre de
          teinte, comme tout ce qui n'est pas la nature du mouvement : ce n'est
          pas un statut, c'est une propriété de l'article. */}
      {a.approvisionnement && (
        <span
          title={
            a.approvisionnement === 'ACHAT'
              ? 'Article acheté — une suggestion se solde par une commande fournisseur'
              : 'Article fabriqué — une suggestion se solde par un ordre de fabrication'
          }
          className="shrink-0 rounded border px-1 font-mono text-[10px] uppercase leading-4 text-muted-foreground"
        >
          {a.approvisionnement === 'ACHAT' ? 'achat' : 'fab'}
        </span>
      )}
      <span className="truncate text-xs leading-tight text-muted-foreground">
        {a.designation ?? <span className="italic">sans désignation</span>}
        {a.famille && <span className="tabular-nums"> · {a.famille}</span>}
      </span>
      <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
        {fmtQte.format(affiches)} mouvement{affiches > 1 ? 's' : ''}
        {tronque ? ` sur ${fmtQte.format(a.total)}` : ''}
      </span>
    </div>
  )
}

export default function BesoinsEvolution() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photosLoading, setPhotosLoading] = useState(true)
  const [photosError, setPhotosError] = useState<string | null>(null)
  const [avant, setAvant] = useState<string | null>(null)
  const [apres, setApres] = useState<string | null>(null)
  const [frise, setFrise] = useState<FriseResponse | null>(null)
  const [friseLoading, setFriseLoading] = useState(false)
  const [friseError, setFriseError] = useState<string | null>(null)
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

  const reloadFrise = async () => {
    if (!avant || !apres) return
    setFriseLoading(true)
    setFriseError(null)
    try {
      // Le filtre de nature part au serveur : sans lui, `total` compterait les
      // ~17 500 renumérotations que l'écran n'affiche pas, et le bandeau
      // « X affichés sur N » mentirait sur ce qui est réellement filtré.
      const nature = natureKey ? `&nature=${encodeURIComponent(natureKey)}` : ''
      const url = `/api/v1/appro/drivers-frise?avant=${encodeURIComponent(avant)}&apres=${encodeURIComponent(apres)}&limit=1000${nature}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as FriseResponse
      setFrise(json)
    } catch (e) {
      setFriseError(e instanceof Error ? e.message : String(e))
    } finally {
      setFriseLoading(false)
    }
  }
  useEffect(() => {
    if (avant && apres) reloadFrise()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avant, apres, natureKey])

  // Filtres côté client : la source (le serveur ne connaît que le filtre de
  // nature) et la recherche. La recherche parcourt les MOUVEMENTS, pas les
  // articles : un article ne reste affiché que s'il a au moins un mouvement
  // correspondant. Les deux références sont cherchables — sur une
  // renumérotation, on part aussi souvent du numéro disparu que du nouveau.
  const filteredArticles = useMemo(() => {
    if (!frise) return []
    const q = fold(search.trim())
    const out: ArticleFrise[] = []
    for (const a of frise.articles) {
      let ms = a.mouvements
      if (sourceFilter) ms = ms.filter((m) => m.source === sourceFilter)
      if (q) {
        ms = ms.filter(
          (m) =>
            fold(m.article).includes(q) ||
            (m.designation !== null && fold(m.designation).includes(q)) ||
            (m.vcrnum !== null && fold(m.vcrnum).includes(q)) ||
            (m.vcrnumApres !== null && fold(m.vcrnumApres).includes(q))
        )
      }
      if (ms.length > 0) out.push({ ...a, mouvements: ms })
    }
    return out
  }, [frise, sourceFilter, search])

  const articles = frise?.articles ?? []
  // Mouvements réellement rendus par le serveur (avant bornage `limit`, le
  // budget peut tronquer les derniers articles à zéro mouvement) — la référence
  // du bandeau de volumétrie.
  const servis = articles.reduce((n, a) => n + a.mouvements.length, 0)
  const mouvementsAffiches = filteredArticles.reduce((n, a) => n + a.mouvements.length, 0)

  const total = frise?.total ?? 0
  const parSource = frise?.parSource ?? {}
  const hasMessage = Boolean(frise?.message)
  const trous = frise?.trous ?? []
  // Pas sans aucune source comparée (photo illisible) : défensif côté domaine,
  // mais un pas annoncé indisponible ne doit pas passer en silence.
  const pasIllisibles = useMemo(() => (frise?.pas ?? []).filter((p) => p.message !== null), [frise])

  /**
   * Périmètre réellement comparé (#145), agrégé sur toute la plage : une source
   * écartée sur certains pas seulement reste affichée (elle a bougé ailleurs) —
   * le bandeau nomme les sources sorties et les pas concernés.
   */
  const groupesEcartements = useMemo<GroupeEcartement[]>(() => {
    const parCle = new Map<string, GroupeEcartement>()
    for (const p of frise?.pas ?? []) {
      for (const e of p.sourcesEcartees) {
        const raison = e.raison ?? 'inconnu'
        const cle = `${e.source}|${e.manqueDans}|${raison}`
        let g = parCle.get(cle)
        if (!g) {
          g = { manqueDans: e.manqueDans, raison, sources: [], pas: [] }
          parCle.set(cle, g)
        }
        if (!g.sources.includes(e.source)) g.sources.push(e.source)
        const pasCle = `${p.avant}→${p.apres}`
        if (!g.pas.some((x) => `${x.entre}→${x.et}` === pasCle)) {
          g.pas.push({ entre: p.avant, et: p.apres })
        }
      }
    }
    // Ordre stable : avant d'abord (source neuve), puis raison, puis source.
    return [...parCle.values()].sort((a, b) => {
      if (a.manqueDans !== b.manqueDans) return a.manqueDans === 'avant' ? -1 : 1
      if (a.raison !== b.raison) return a.raison < b.raison ? -1 : 1
      return a.sources.join(',') < b.sources.join(',') ? -1 : 1
    })
  }, [frise])

  // Le compte des sources réellement comparées, pour l'état vide : l'union
  // sur tous les pas — une source comparée ne serait-ce qu'un jour compte.
  const nbComparees = useMemo(() => {
    if (!frise) return null
    const union = new Set<string>()
    for (const p of frise.pas) {
      for (const s of p.sourcesComparees) union.add(s)
    }
    return union.size
  }, [frise])

  /**
   * Entrée du filtre de source. Jamais désactivée : dans la frise, une source
   * écartée sur un pas peut avoir bougé sur les autres — la griser
   * masquerait des mouvements réels. Le bandeau de périmètre dit où elle
   * manque, le compteur global vient du serveur.
   */
  const itemSource = (src: DriverSource) => (
    <SelectItem key={src} value={src}>
      {SOURCE_LABEL[src]}
      <span className="ml-2 tabular-nums text-muted-foreground">
        {parSource[src] ? fmtQte.format(parSource[src]) : '—'}
      </span>
    </SelectItem>
  )
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

  const ouvrirArticle = (article: string) => {
    setSheetArticle(article)
    setSheetOpen(true)
  }

  const celluleJour = (m: MouvementFrise) => (
    <span
      className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground"
      title={fmtJJMMAAAA(m.jour)}
    >
      {fmtJour(m.jour)}
    </span>
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
            {frise
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
                {SOURCES_REALITE.map(itemSource)}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Ce que le CBN propose</SelectLabel>
                {SOURCES_PROPOSITIONS.map(itemSource)}
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
            {mouvementsAffiches} / {servis}
            {total > servis ? ` · ${fmtQte.format(total)}` : ''}
          </span>
          <RefreshPill
            loading={photosLoading || friseLoading}
            onClick={() => (avant && apres ? reloadFrise() : reloadPhotos())}
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
                  Ce que le CBN a vu bouger, nuit après nuit, sur la plage — chaque mouvement est
                  daté du jour où la paire de photos l&apos;a observé, jamais le solde entre deux
                  bornes. Un trou de la série est signalé : un mouvement observé sur un pas qui
                  l&apos;enjambe n&apos;est pas localisable au jour près.
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
                      {/* Couvre les trois cas : pas assez de photos, photos
                          illisibles, plage trop large pour la frise. */}
                      <h3 className="text-sm font-semibold text-foreground">Frise indisponible</h3>
                      <p className="mt-1 text-sm leading-[1.5] text-muted-foreground">
                        {frise?.message}
                      </p>
                      {avant && apres && (
                        <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                          Plage demandée : {fmtJJMMAAAA(avant)} → {fmtJJMMAAAA(apres)}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ) : friseError ? (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
                  <AlertTriangle size={16} strokeWidth={1.75} className="text-destructive" />
                  <span className="font-bold">Erreur chargement :</span>
                  <span className="font-mono">{friseError}</span>
                </div>
              ) : friseLoading ? (
                <LoadingState
                  title="Lecture de la frise…"
                  description="diffs journaliers chaînés — un pas par nuit"
                  variant="orb"
                  orbState="searching"
                  className="py-10"
                />
              ) : (
                <div className="space-y-3">
                  {/* Trous de la série + pas illisibles. Avertissement sur la
                      VALIDITÉ de la frise : il apparaît/disparaît au changement
                      de plage sans rechargement — annoncé aux lecteurs d'écran.
                      Jamais silencieux : un trou est un pas dont les mouvements
                      ne sont pas localisables au jour près. */}
                  {(trous.length > 0 || pasIllisibles.length > 0) && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs leading-[1.5] text-foreground"
                    >
                      <AlertTriangle
                        aria-hidden
                        size={14}
                        className="mt-0.5 shrink-0 text-warning"
                      />
                      <span className="space-y-1">
                        {trous.map((t) => {
                          const jours = t.manquants.map(fmtJour)
                          const visibles = jours.slice(0, 6)
                          const enPlus = jours.length - visibles.length
                          return (
                            <span key={t.entre} className="block">
                              {jours.length === 1 ? 'Photo' : 'Photos'} du{' '}
                              <span className="font-mono tabular-nums" title={jours.join(', ')}>
                                {visibles.join(', ')}
                                {enPlus > 0 ? ` … +${enPlus}` : ''}
                              </span>{' '}
                              manquante{jours.length > 1 ? 's' : ''} entre le{' '}
                              <span className="font-mono tabular-nums">{fmtJour(t.entre)}</span> et
                              le <span className="font-mono tabular-nums">{fmtJour(t.et)}</span> :
                              les mouvements de ce pas ne sont pas localisés au jour près.
                            </span>
                          )
                        })}
                        {pasIllisibles.map((p) => (
                          <span key={`${p.avant}-${p.apres}`} className="block">
                            Pas du{' '}
                            <span className="font-mono tabular-nums">{fmtJour(p.avant)}</span> au{' '}
                            <span className="font-mono tabular-nums">{fmtJour(p.apres)}</span> :{' '}
                            {p.message}.
                          </span>
                        ))}
                      </span>
                    </div>
                  )}

                  {/* Périmètre restreint (#145), agrégé sur toute la plage :
                      une source écartée sur un pas reste présente sur les
                      autres — le bandeau nomme les pas où elle manque. */}
                  {groupesEcartements.length > 0 && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs leading-[1.5] text-foreground"
                    >
                      <AlertTriangle
                        aria-hidden
                        size={14}
                        className="mt-0.5 shrink-0 text-warning"
                      />
                      <span>
                        Comparaison sur périmètre restreint sur une partie de la plage.{' '}
                        {groupesEcartements.map((g) => {
                          const ranges = g.pas.map((p) => `${fmtJour(p.entre)} → ${fmtJour(p.et)}`)
                          const visibles = ranges.slice(0, 6)
                          const enPlus = ranges.length - visibles.length
                          const phrase =
                            g.raison === 'echec'
                              ? 'capture perdue (extraction en échec)'
                              : g.raison === 'inconnu'
                                ? 'sans journal, écartée par prudence'
                                : 'réellement vide'
                          return (
                            <span
                              key={`${g.manqueDans}|${g.raison}|${g.sources.join(',')}`}
                              className="block"
                            >
                              {g.sources.length > 1 ? 'Sources' : 'Source'}{' '}
                              <span className="font-semibold">{g.sources.join(', ')}</span> —{' '}
                              {phrase} de la photo « {g.manqueDans === 'avant' ? 'avant' : 'après'}{' '}
                              », sur {g.pas.length} pas :{' '}
                              <span className="font-mono tabular-nums" title={ranges.join(', ')}>
                                {visibles.join(', ')}
                                {enPlus > 0 ? ` … +${enPlus}` : ''}
                              </span>
                              .
                            </span>
                          )
                        })}
                        <span className="block">
                          Une source en échec n&apos;a pas été capturée ; une source sans journal
                          est écartée par prudence ; une source réellement vide, elle, reste
                          comparée et sa disparition est affichée.
                        </span>
                      </span>
                    </div>
                  )}

                  {total > servis && (
                    <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground">
                      <Info size={14} className="shrink-0 text-warning" /> {servis} affichés sur{' '}
                      {fmtQte.format(total)} — affinez par source ou nature.
                    </div>
                  )}

                  <div className="flex items-center gap-2 border-b border-border/50 px-1 py-1.5">
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {mouvementsAffiches} mouvement{mouvementsAffiches > 1 ? 's' : ''} · articles
                      par nombre de mouvements décroissant
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
                        ,{' '}
                        {nbComparees === null
                          ? 'aucune source n’a bougé'
                          : nbComparees === 1
                            ? 'la seule source comparée n’a pas bougé'
                            : `aucune des ${nbComparees} sources comparées n’a bougé`}
                        .
                      </p>
                      <div className="mt-3 inline-block rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                        Seuils : quantité ±20 % · échéance ±7 j
                      </div>
                    </Card>
                  ) : filteredArticles.length === 0 ? (
                    <Card className="p-8 text-center">
                      <span className="text-sm text-muted-foreground">
                        Aucun résultat avec ces filtres.
                      </span>
                    </Card>
                  ) : (
                    <div>
                      <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
                        <table className="w-full border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">
                                Jour
                              </th>
                              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">
                                Pièce
                              </th>
                              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">
                                Source
                              </th>
                              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">
                                Nature
                              </th>
                              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">
                                Échéance
                              </th>
                              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">
                                Avant → Après
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                                Écart
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredArticles.map((a) => (
                              <Fragment key={a.article}>
                                {/* L'en-tête du groupe rappelle l'article sur
                                    toute la largeur : on peut défiler 1 000
                                    lignes sans perdre le contexte. */}
                                <tr
                                  onClick={() => ouvrirArticle(a.article)}
                                  title="Voir la fiche article"
                                  className="cursor-pointer border-b bg-muted/40 transition-colors hover:bg-muted/60"
                                >
                                  <td colSpan={7} className="px-3 py-1.5">
                                    <EnteteArticle article={a} />
                                  </td>
                                </tr>
                                {a.mouvements.map((m, mi) => (
                                  <tr
                                    key={`${a.article}#${mi}`}
                                    title={resumeLabel(m)}
                                    onClick={() => ouvrirArticle(a.article)}
                                    className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/50"
                                  >
                                    <td className="px-3 py-2">{celluleJour(m)}</td>
                                    <td className="px-3 py-2">
                                      <CellulePiece m={m} />
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex flex-col leading-tight">
                                        <span className="whitespace-nowrap text-xs text-foreground">
                                          {SOURCE_LABEL[m.source]}
                                        </span>
                                        {/* Code tiers figé dans la photo. Brut :
                                            la raison sociale vit dans BPARTNER,
                                            côté X3, et cette page ne l'appelle
                                            pas — elle ne lit que des photos. */}
                                        {m.fournisseur && (
                                          <span
                                            title={`Fournisseur ${m.fournisseur} (code tiers X3)`}
                                            className="whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground"
                                          >
                                            frs {m.fournisseur}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <CelluleNature nature={m.nature} />
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                                        {fmtJJMM(echeancePortee(m))}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <CelluleAvantApres m={m} />
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <CelluleEcart m={m} />
                                    </td>
                                  </tr>
                                ))}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-3 text-center font-mono text-[10px] text-muted-foreground">
                        Articles triés par nombre de mouvements décroissant — les plus agités
                        d&apos;abord · Mouvements du plus ancien au plus récent (jour croissant).
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
