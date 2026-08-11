import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarClock, CircleX, Package, ShieldCheck, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
import { CourbeProjection, type PointProjection } from '@r/components/ui/chart'
import { LoadingState } from '@r/components/ui/loading-state'
import { X3Link } from '@r/components/x3-link'

/**
 * Sheet « Détail article » du KPI Stock par article (dashboard) : historique
 * hebdomadaire sur 52 semaines glissantes — courbe du stock fin de semaine +
 * barres miroir des entrées/sorties, bascule qté/€. La donnée vient de
 * GET /api/v1/dashboard/stock/article (rembobinage STOJOU depuis le stock
 * actuel, cf. StockValuationRepository.getArticleStockHistory), fetchée à
 * l'ouverture — même motif que poste-engagement-sheet.
 */

interface StockHistoryPoint {
  periode: string
  label: string
  qte: number
  valeur: number
  entreeQte: number
  sortieQte: number
  entreeVal: number
  sortieVal: number
}

/** Point hebdomadaire de la projection (seaux S+1 … S+52). */
interface StockFuturePoint {
  periode: string
  label: string
  besoinQte: number
  besoinVal: number
  ressourceQte: number
  ressourceVal: number
  stockQte: number // stock projeté fin de semaine (borné ≥ 0)
  stockVal: number
}

/** Paramètres de pilotage — tous optionnels côté X3 (fiche site ou fournisseur
 *  par défaut absents). `null` = donnée non renseignée, distinct d'un vrai 0. */
interface StockArticleLogistique {
  famille: string | null
  delaiReapproJours: number | null
  lotTechnique: number | null
  lotEconomique: number | null
  stockSecurite: number | null
  fournisseurCode: string | null
  fournisseurNom: string | null
}

/** Indicateurs dérivés de l'historique (calculés par stock_detail_loader).
 *  `null` = calcul sans objet (diviseur nul), pas « zéro ». */
interface StockArticleIndicateurs {
  sorties12m: number
  joursFenetre: number
  cmj: number | null
  couvertureJours: number | null // régime moyen passé — non affiché, cf. LogistiqueBar
  stockMoyen: number
  rotation: number | null
  couvertureProspectiveJours: number | null
  ruptureSemaine: string | null
  ruptureDateIso: string | null
  ratioProspectifDelai: number | null
}

interface StockArticleDetail {
  article: string
  designation: string
  categorie: string
  stock: number
  stockA: number
  stockQ: number
  pmp: number
  valeur: number
  logistique: StockArticleLogistique
  indicateurs: StockArticleIndicateurs
  grain: 'semaine'
  series: StockHistoryPoint[]
  future: StockFuturePoint[]
}

interface StockArticleDetailResponse {
  detail: StockArticleDetail | null
  x3Error: string | null
}

type Unit = 'qte' | 'valeur'

interface StockArticleSheetProps {
  /** Article ouvert (null = fermé). */
  article: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

/** Palette Airbnb stricte — cohérente avec le KPI stock (dashboard.tsx). Le
 *  ink vient du thème (foreground) pour rester lisible en sombre. */
const COL_STOCK = 'var(--color-foreground)'
const COL_ENTREE = '#00a699'
const COL_SORTIE = '#ff385c'

const fmtQty = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtQtyDec = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const fmtEuro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
/** PMP : prix unitaire en euros, 4 décimales (un composant à 0,01 € doit rester
 *  distinguable d'un composant à 0,0099 €). */
const fmtPmp = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

/** Compact pour les axes : 1,2 M€ / 450 k€ / 123 €. */
const fmtEuroCompact = (v: number): string => {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} M€`
  if (abs >= 1_000) return `${Math.round(v / 1_000)} k€`
  return `${Math.round(v)} €`
}

const fmtAxis = (v: number, unit: Unit): string =>
  unit === 'valeur' ? fmtEuroCompact(v) : fmtQty.format(v)

const fmtVal = (v: number, unit: Unit): string =>
  unit === 'valeur' ? fmtEuro.format(v) : fmtQtyDec.format(v)
/** Ratio (0.123) → « 12,3 % ». */
const fmtPct = (v: number): string =>
  `${(Math.round(v * 1000) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '')} %`

/** La clé `periode` (« 2025-W26 ») porte l'année ISO — on l'extrait pour dater
 *  chaque mention de semaine (axe, tooltip, plage affichée). */
const weekYear = (periode: string) => periode.slice(0, 4)
const weekNo = (periode: string) => periode.slice(-2)
const fmtWeek = (cle: string) => `S${weekNo(cle)} ${weekYear(cle)}`

/** Valeurs lues par le graphe selon l'unité active. */
const lineValOf = (p: StockHistoryPoint, unit: Unit) => (unit === 'qte' ? p.qte : p.valeur)
const inValOf = (p: StockHistoryPoint, unit: Unit) => (unit === 'qte' ? p.entreeQte : p.entreeVal)
const outValOf = (p: StockHistoryPoint, unit: Unit) => (unit === 'qte' ? p.sortieQte : p.sortieVal)

/** Point tracé — historique (stock réel + flux passés) ou futur (stock
 *  projeté + besoins/ressources). La courbe porte le niveau, le flux le
 *  mouvement ; les valeurs réelles vivent dans les datums, l'affichage
 *  normalise les flux par moitié (cf. CourbeProjection). */
interface PointFilStock extends PointProjection {
  entree: number
  sortie: number
}

/** Graphe stock + flux sur 105 semaines : 53 semaines d'historique (courbe
 *  pleine + entrées/sorties) puis 52 semaines de projection (courbe pointillée
 *  + ressources attendues/besoins), séparées par la ligne « auj. ». Tout passe
 *  par CourbeProjection (@tanstack/charts) — courbe, miroir des flux, rupture
 *  et charnière. Légende en HTML au-dessus du graphe.
 *
 *  Ce qui a été perdu en route : l'animation de montée/morphing et l'aire en
 *  dégradé sous la courbe historique. Les valeurs, elles, sont toutes là — au
 *  survol et dans les totaux du verdict. */
function HistoryChart({
  series,
  future,
  unit,
  rupturePeriode,
}: {
  series: StockHistoryPoint[]
  future: StockFuturePoint[]
  unit: Unit
  /** Semaine ISO de rupture calculée par le verdict — repérée sur la courbe
   *  pour relier les deux lectures. */
  rupturePeriode?: string | null
}) {
  const hasFuture = future.length > 0
  const histLen = series.length

  // ----- Points combinés (historique + projection) -----
  const points = useMemo<PointFilStock[]>(() => {
    const hist: PointFilStock[] = series.map((p) => ({
      cle: p.periode,
      label: fmtWeek(p.periode),
      valeur: lineValOf(p, unit),
      projete: false,
      entree: inValOf(p, unit),
      sortie: outValOf(p, unit),
    }))
    const fut: PointFilStock[] = future.map((p) => ({
      cle: p.periode,
      label: fmtWeek(p.periode),
      valeur: unit === 'qte' ? p.stockQte : p.stockVal,
      projete: true,
      entree: unit === 'qte' ? p.ressourceQte : p.ressourceVal,
      sortie: unit === 'qte' ? p.besoinQte : p.besoinVal,
    }))
    return [...hist, ...fut]
  }, [series, future, unit])

  const flux = useMemo(() => {
    const m = new Map<string, { entree: number; sortie: number }>()
    for (const p of points) m.set(p.cle, { entree: p.entree, sortie: p.sortie })
    return (cle: string) => m.get(cle) ?? null
  }, [points])

  const lastIdx = points.length - 1

  // Charnière passé/futur : la ligne « auj. » tombe sur le dernier point réel.
  const charniere = hasFuture && histLen > 0 ? series[histLen - 1].periode : null

  // La rupture est cherchée côté projection uniquement : les clés de semaine
  // ISO peuvent se répéter entre passé et prévision.
  const ruptureCle =
    rupturePeriode !== null &&
    rupturePeriode !== undefined &&
    future.some((p) => p.periode === rupturePeriode)
      ? rupturePeriode
      : null
  const ruptureIdx = ruptureCle ? points.findIndex((p) => p.cle === ruptureCle) : -1

  return (
    <div className="relative h-full w-full">
      {/* Légende au-dessus du graphe, attachée à ce qu'elle décrit — en HTML,
          sélectionnable et imprimable (règle design-system § 22). */}
      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9.5px] font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-[2px] w-3.5 rounded-full"
            style={{ background: COL_STOCK }}
          />
          {hasFuture ? 'Stock' : 'Stock fin de semaine'}
        </span>
        {hasFuture && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0 w-3.5 border-t-2 border-dashed"
                style={{ borderColor: COL_STOCK }}
              />
              Projeté
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ background: COL_ENTREE }} />
              Entrées &amp; ressources
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ background: COL_SORTIE }} />
              Sorties &amp; besoins
            </span>
          </>
        )}
        {/* Plage couverte (historique + projection), à droite */}
        {points.length > 0 && (
          <span className="ml-auto opacity-75">
            {fmtWeek(points[0].cle)} → {fmtWeek(points[lastIdx].cle)}
            {hasFuture && ' · flux : une échelle par moitié'}
          </span>
        )}
      </div>

      <CourbeProjection
        points={points}
        charniere={charniere}
        regleX={ruptureCle}
        flux={flux}
        afficherFluxMiroir
        couleurEntree={COL_ENTREE}
        couleurSortie={COL_SORTIE}
        hauteur={300}
        format={(v) => fmtAxis(v, unit)}
        largeurInitiale={800}
        ariaLabel={`Stock hebdomadaire : ${histLen} semaines passées puis ${future.length} projetées`}
        ariaDescription={`Stock et mouvements, en ${unit === 'qte' ? 'quantités' : 'valeur'}. Rupture${rupturePeriode ? ` en ${rupturePeriode}` : ''}.`}
      />

      {/* Repère de rupture — la ligne vient de la règle de la lib, l'étiquette
          reste du HTML posé sur le band de la semaine concernée. */}
      {ruptureIdx >= 0 && (
        <span
          className="pointer-events-none absolute top-0 -translate-x-1/2 font-mono text-[8.5px] font-bold tracking-[0.08em]"
          style={{ left: `${((ruptureIdx + 0.5) / points.length) * 100}%`, color: COL_SORTIE }}
        >
          RUPTURE
        </span>
      )}
    </div>
  )
}

/** Entrée du bandeau logistique : label mono uppercase puis valeur. Rendue
 *  seulement si la donnée existe — un paramètre non renseigné dans X3 ne doit
 *  pas occuper une case pour y afficher « — ». */
function LogItem({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline gap-1.5" title={title}>
      <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[11px] font-semibold tabular-nums text-secondary-foreground">
        {value}
      </span>
    </div>
  )
}

/** Jours entiers — « 140 j ». */
const fmtJours = (v: number): string => `${fmtQty.format(Math.round(v))} j`

/** ISO machine → jj/mm/aaaa, seul format de date affiché dans ce projet. */
const fmtDateFr = (iso: string): string => iso.split('-').reverse().join('/')

/**
 * Verdict d'approvisionnement — l'élément le plus visible de la sheet.
 *
 * C'est le seul chiffre qui appelle une décision : jusqu'à quand le stock
 * tient face au délai de réapprovisionnement. Il était noyé parmi une douzaine
 * d'items de poids visuel identique ; il a désormais sa propre bande, son icône
 * et sa couleur de statut.
 *
 * Les totaux de l'horizon (besoins / ressources) l'accompagnent : ils portent
 * sur la même fenêtre à venir et donnent l'ordre de grandeur que l'échelle du
 * graphe ne permet pas de lire.
 */
function VerdictBar({
  detail,
  unit,
  totaux,
}: {
  detail: StockArticleDetail
  unit: Unit
  totaux: { besoin: number; ressource: number } | null
}) {
  const ind = detail.indicateurs
  const delai = detail.logistique.delaiReapproJours
  const sousDelai = ind.ratioProspectifDelai !== null && ind.ratioProspectifDelai < 1

  // Sans projection, il n'y a pas de verdict à rendre. « Couvert au-delà de 52
  // semaines » signifierait « aucun besoin à venir », alors qu'ici la donnée
  // manque — deux choses très différentes pour qui décide.
  if (detail.future.length === 0) return null

  // Trois états : rupture avant le délai (on ne peut plus réapprovisionner à
  // temps), rupture datée mais joignable, ou aucune rupture sur l'horizon.
  let Icon = ShieldCheck
  let titre: string
  let detailTexte: string

  if (ind.couvertureProspectiveJours === null) {
    titre = 'Couvert au-delà de 52 semaines'
    detailTexte = 'Aucune rupture sur l’horizon, réceptions à venir exclues.'
  } else {
    const date = ind.ruptureDateIso ? fmtDateFr(ind.ruptureDateIso) : '—'
    titre = `Tient jusqu’au ${date}`
    // « hors réceptions » est explicite : la courbe projetée, elle, LES
    // intègre, donc elle remonte après le plancher à 0. Sans cette mention les
    // deux lectures paraissent se contredire.
    const couv = `${fmtJours(ind.couvertureProspectiveJours)} de couverture hors réceptions`
    if (delai !== null && delai > 0) {
      Icon = sousDelai ? TriangleAlert : ShieldCheck
      detailTexte = sousDelai
        ? `${couv}, pour ${fmtJours(delai)} de délai — commander maintenant n’arrive plus à temps.`
        : `${couv}, pour ${fmtJours(delai)} de délai — commander maintenant arrive encore à temps.`
    } else {
      Icon = CalendarClock
      detailTexte = `${couv}. Aucun délai de réapprovisionnement paramétré.`
    }
  }

  return (
    <div
      className={cn(
        'flex flex-none flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-5 py-2.5',
        sousDelai ? 'border-destructive/30 bg-destructive/10' : 'border-rule bg-secondary'
      )}
    >
      <Icon
        size={17}
        strokeWidth={1.9}
        className={cn('shrink-0', sousDelai ? 'text-destructive' : 'text-brand')}
      />
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span
          className={cn(
            'font-mono text-[13px] font-bold tabular-nums',
            sousDelai ? 'text-destructive' : 'text-foreground'
          )}
        >
          {titre}
        </span>
        <span className="text-[11.5px] text-secondary-foreground">{detailTexte}</span>
      </div>
      <span className="flex-1" />
      {totaux && (
        <div
          className="flex items-baseline gap-x-4"
          title="Totaux sur l'horizon de projection — les barres du graphe ont une échelle par moitié, ces deux nombres donnent les ordres de grandeur réels."
        >
          {/* Étiquetés, pas seulement colorés : la couleur seule oblige à
              faire l'aller-retour avec la légende du graphe. */}
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Besoins 52 s.
            </span>
            <span
              className="font-mono text-[11px] font-semibold tabular-nums"
              style={{ color: COL_SORTIE }}
            >
              {fmtVal(totaux.besoin, unit)}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Ressources
            </span>
            <span
              className="font-mono text-[11px] font-semibold tabular-nums"
              style={{ color: COL_ENTREE }}
            >
              {fmtVal(totaux.ressource, unit)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Groupe nommé du pied de sheet : un intitulé discret puis ses items. */
function ParamGroup({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
      {/* Volontairement PAS en `text-brand` : ce rouge sert déjà au verdict et
          aux sorties du graphe. Un intitulé de groupe n'est pas une alerte. */}
      <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
        {titre}
      </span>
      {children}
    </div>
  )
}

/**
 * Pied de sheet : ce qui explique la courbe, sous la courbe.
 *
 * Deux groupes nommés plutôt qu'une bande unique de douze items — les
 * paramètres se règlent (fiche article), les indicateurs se constatent
 * (historique). Un délai de 140 jours et un lot économique de 7 392 expliquent
 * des entrées massives et espacées ; les mettre à plat à côté d'une rotation
 * empêchait de faire la différence.
 *
 * La couverture au régime moyen passé n'y figure pas : elle contredit la
 * couverture prospective du verdict dès que la demande n'est pas plate. Elle
 * reste dans le payload pour `stock:audit`.
 */
function ParamsBar({ detail }: { detail: StockArticleDetail }) {
  const l = detail.logistique
  const ind = detail.indicateurs
  const fournisseur = l.fournisseurNom ?? l.fournisseurCode
  const anneeGlissante = `sur ${fmtQty.format(ind.joursFenetre)} jours glissants`

  const appro: ReactNode[] = []
  if (fournisseur)
    appro.push(
      <LogItem
        key="four"
        label="Fournisseur"
        value={fournisseur}
        title={l.fournisseurCode ? `Code fournisseur ${l.fournisseurCode}` : undefined}
      />
    )
  if (l.delaiReapproJours !== null)
    appro.push(
      <LogItem
        key="delai"
        label="Délai"
        value={fmtJours(l.delaiReapproJours)}
        title="Délai de réapprovisionnement paramétré sur la fiche site (ITMFACILIT.OFS)"
      />
    )
  if (l.lotEconomique !== null)
    appro.push(
      <LogItem
        key="lotEco"
        label="Lot éco."
        value={fmtQty.format(l.lotEconomique)}
        title="Quantité minimale de réapprovisionnement (ITMFACILIT.REOMINQTY)"
      />
    )
  if (l.lotTechnique !== null)
    appro.push(
      <LogItem
        key="lotTech"
        label="Lot techn."
        value={fmtQty.format(l.lotTechnique)}
        title="Lot technique de fabrication (ITMFACILIT.MFGLOTQTY)"
      />
    )
  if (l.stockSecurite !== null)
    appro.push(
      <LogItem
        key="secu"
        label="Stock sécu."
        value={fmtQty.format(l.stockSecurite)}
        title="Stock de sécurité paramétré (ITMFACILIT.SAFSTO)"
      />
    )
  if (l.famille)
    appro.push(
      <LogItem key="fam" label="Famille" value={l.famille} title="Famille d'usage (YFAMSTAT7)" />
    )

  const conso: ReactNode[] = []
  if (ind.sorties12m > 0)
    conso.push(
      <LogItem
        key="sorties"
        label="Sorties"
        value={fmtQty.format(ind.sorties12m)}
        title={`Total des sorties physiques nettes ${anneeGlissante} — consommation de fabrication, ventes, retours et rebuts confondus. C'est par là que le stock s'écoule.`}
      />
    )
  if (ind.cmj !== null)
    conso.push(
      <LogItem
        key="cmj"
        label="CMJ"
        value={fmtQtyDec.format(ind.cmj)}
        title={`Consommation moyenne par jour CALENDAIRE (sorties ÷ ${ind.joursFenetre} jours). Descriptif du régime passé — la couverture affichée en haut vient, elle, de la demande réelle à venir.`}
      />
    )
  if (ind.stockMoyen > 0)
    conso.push(
      <LogItem
        key="stkmoy"
        label="Stock moyen"
        value={fmtQty.format(ind.stockMoyen)}
        title={`Moyenne du stock de fin de semaine ${anneeGlissante}.`}
      />
    )
  if (ind.rotation !== null)
    conso.push(
      <LogItem
        key="rota"
        label="Rotation"
        value={`${fmtQtyDec.format(ind.rotation)} ×`}
        title={`Sorties ÷ stock moyen ${anneeGlissante} — nombre de fois où le stock s'est renouvelé.`}
      />
    )

  if (appro.length === 0 && conso.length === 0) return null

  return (
    <div className="flex flex-none flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-rule bg-card px-5 py-2.5">
      {appro.length > 0 && <ParamGroup titre="Approvisionnement">{appro}</ParamGroup>}
      {conso.length > 0 && <ParamGroup titre="Consommation 12 m">{conso}</ParamGroup>}
    </div>
  )
}

/** Bloc métrique d'en-tête : label mono uppercase + valeur tabular. */
function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex flex-col items-end" title={title}>
      <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[13px] font-bold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

export function StockArticleSheet(props: StockArticleSheetProps) {
  const [data, setData] = useState<StockArticleDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unit, setUnit] = useState<Unit>('qte')

  // Fetch à l'ouverture + quand l'article change.
  useEffect(() => {
    if (!props.open || !props.article) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    fetch(`/api/v1/dashboard/stock/article?article=${encodeURIComponent(props.article)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<StockArticleDetailResponse>
      })
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Échec du chargement')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [props.open, props.article])

  const detail = data?.detail ?? null

  // Variation sur la plage, dans l'unité active. Base = première semaine non
  // nulle (pas le premier point brut : les semaines à 0 en bord de fenêtre —
  // article démarré en cours d'année, ou artefact de réconciliation borné par
  // le plancher — feraient disparaître la tendance à tort).
  const delta = useMemo(() => {
    if (!detail || detail.series.length < 2) return null
    const get = (p: StockHistoryPoint) => (unit === 'qte' ? p.qte : p.valeur)
    const base = detail.series.map(get).find((v) => v > 0)
    if (base === undefined) return null
    const last = get(detail.series[detail.series.length - 1])
    return (last - base) / base
  }, [detail, unit])

  // Totaux de la projection sur l'horizon. Le graphe trace deux moitiés à des
  // échelles différentes : ces deux chiffres donnent les ordres de grandeur
  // réels du carnet à venir, indépendamment de la lecture visuelle.
  const totauxFuturs = useMemo(() => {
    const fut = detail?.future ?? []
    if (fut.length === 0) return null
    let besoin = 0
    let ressource = 0
    for (const p of fut) {
      besoin += unit === 'qte' ? p.besoinQte : p.besoinVal
      ressource += unit === 'qte' ? p.ressourceQte : p.ressourceVal
    }
    if (besoin === 0 && ressource === 0) return null
    return { besoin, ressource }
  }, [detail, unit])

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        // Dimensions redéclarées en variantes `data-[side=bottom]:` : le
        // primitive porte `data-[side=bottom]:h-auto` et
        // `data-[side=bottom]:max-w-[640px]`, dont le sélecteur d'attribut bat
        // toute classe utilitaire nue (même correctif que charge-period-sheet).
        className="flex w-full flex-col gap-0 rounded-t-[16px] p-0 data-[side=bottom]:mx-0 data-[side=bottom]:h-[85vh] data-[side=bottom]:max-w-none"
      >
        {loading ? (
          <LoadingState
            variant="orb"
            title="Chargement du stock..."
            description="Calcul des mouvements et projections de stock"
          />
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-destructive">
            <CircleX size={26} strokeWidth={1.75} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : !data ? null : (
          <>
            {/* Barre d'identité article + métriques + bascule d'unité. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-secondary px-5 py-3 pr-14">
              <Package size={18} strokeWidth={1.75} className="self-center text-brand" />
              <div className="flex min-w-0 items-baseline gap-2">
                {(() => {
                  const article = detail?.article ?? props.article
                  return article ? (
                    <X3Link
                      fonction="GESITM"
                      cle={article}
                      title={`Ouvrir l'article ${article} dans Sage X3`}
                      className="font-mono text-[13px] font-bold text-brand"
                    >
                      {article}
                    </X3Link>
                  ) : (
                    <span className="font-mono text-[13px] font-bold text-brand" />
                  )
                })()}
                <SheetTitle className="truncate font-fraunces text-[14px] font-medium italic text-muted-foreground">
                  {detail?.designation || '—'}
                </SheetTitle>
              </div>
              {detail && (
                <span className="rounded border border-rule bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-secondary-foreground">
                  {detail.categorie}
                </span>
              )}
              <span className="flex-1" />
              {detail && (
                <div className="flex items-center gap-3">
                  {/* Stock, et sa part en contrôle réception quand il y en a :
                      un stock à moitié bloqué en Q ne se pilote pas comme un
                      stock entièrement disponible. */}
                  <Metric
                    label="Stock"
                    value={
                      detail.stockQ > 0
                        ? `${fmtQtyDec.format(detail.stock)} · Q ${fmtQty.format(detail.stockQ)}`
                        : fmtQtyDec.format(detail.stock)
                    }
                    title={
                      detail.stockQ > 0
                        ? `${fmtQty.format(detail.stockA)} en statut A (disponible), ${fmtQty.format(detail.stockQ)} en statut Q (contrôle réception). Le Q est compté disponible par la faisabilité — contacter le contrôle réception s'il bloque.`
                        : undefined
                    }
                  />
                  <span className="h-6 w-px bg-border" />
                  <Metric
                    label="PMP"
                    value={fmtPmp.format(detail.pmp)}
                    title="Prix moyen pondéré (€ / unité)"
                  />
                  <span className="h-6 w-px bg-border" />
                  <Metric label="Valeur" value={fmtEuro.format(detail.valeur)} />
                  <span className="h-6 w-px bg-border" />
                  <Metric
                    label="Δ 12 mois"
                    value={
                      delta === null ? '—' : `${delta >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(delta))}`
                    }
                    title="Variation du stock entre la première semaine non nulle et la dernière semaine affichée"
                  />
                  {/* Les totaux 52 semaines ont rejoint le verdict : ils
                      portent sur la fenêtre à venir, pas sur l'état actuel. */}
                </div>
              )}
              {/* Bascule qté/€ */}
              <div className="inline-flex rounded-full border border-rule bg-card p-[3px]">
                {(
                  [
                    ['qte', 'Qté'],
                    ['valeur', '€'],
                  ] as [Unit, string][]
                ).map(([u, label]) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={cn(
                      'rounded-full px-3.5 py-1.5 font-sans text-[11px] font-semibold transition-colors',
                      unit === u ? 'bg-secondary text-brand' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Verdict d'appro juste sous l'identité : c'est la première
                question du planificateur, elle passe avant la courbe. */}
            {detail && <VerdictBar detail={detail} unit={unit} totaux={totauxFuturs} />}

            {data.x3Error && (
              <div className="flex flex-none items-start gap-2 border-b border-brand/30 bg-brand-soft px-5 py-2 text-[12px] text-foreground">
                <TriangleAlert size={16} strokeWidth={1.75} className="mt-px text-brand" />
                <span className="font-mono break-all">{data.x3Error}</span>
              </div>
            )}

            {!detail || detail.series.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
                <Package size={26} strokeWidth={1.75} />
                <span className="font-fraunces text-[13px] italic">
                  Aucun mouvement de stock sur 52 semaines.
                </span>
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 px-5 pb-3 pt-2">
                  <HistoryChart
                    series={detail.series}
                    future={detail.future ?? []}
                    unit={unit}
                    rupturePeriode={detail.indicateurs.ruptureSemaine}
                  />
                </div>
                {/* Ce qui explique la courbe, sous la courbe : on ne le lit
                    qu'après avoir vu la forme, et jamais avant le verdict. */}
                <ParamsBar detail={detail} />
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default StockArticleSheet
