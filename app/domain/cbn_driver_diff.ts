import {
  TOLERANCE_APPARIEMENT_JOURS,
  TOLERANCE_ECHEANCE_JOURS,
  TOLERANCE_QUANTITE_RATIO,
} from '#app/domain/appro_decision'
import type { DemandSnapshotRow } from '#app/domain/snapshot_rows'

/**
 * Diff des drivers du CBN par article (#138 lot 1).
 *
 * Les 8 sources de `demand_snapshots` sont figées chaque nuit. Ce module
 * compare deux photos d'un même article et isole ce qui a bougé au-delà du
 * bruit, pour que `cbn_explanation.ts` puisse le corréler à un message du
 * même article.
 *
 * Grain : `(article, source)`, avec appariement par échéance la plus proche
 * pour les sources multi-lignes (comme `appro_snapshot_diff.ts`). `stock` est
 * mono-ligne par article.
 *
 * Pur, sans I/O.
 */

export type DriverSource =
  | 'of_ferme'
  | 'of_planifie'
  | 'of_suggestion'
  | 'demande_ferme'
  | 'demande_prevision'
  | 'stock'
  | 'appro'
  | 'appro_suggestion'

export type DriverDiffNature = 'apparue' | 'disparue' | 'quantite' | 'date' | 'renumerotation'

export interface DriverDiffEntry {
  article: string
  source: DriverSource
  nature: DriverDiffNature
  quantiteAvant: number | null
  quantiteApres: number | null
  echeanceAvant: string | null
  echeanceApres: string | null
  detail: string
  designation: string | null
  famille: string | null
  /** Pièce côté photo « avant ». Pour `apparue`, la pièce neuve (pas d'avant). */
  vcrnum: string | null
  vcrlin: string | null
  /**
   * Pièce côté photo « après », renseignée seulement quand elle DIFFÈRE de
   * `vcrnum` — c'est-à-dire sur une renumérotation. Ailleurs `null` : la pièce
   * n'a pas changé et `vcrnum` la décrit à lui seul.
   */
  vcrnumApres: string | null
  vcrlinApres: string | null
}

/**
 * Amplitude relative d'une entrée pour le tri (§5.3 PRD : ratio, pas absolu).
 * - `quantite` : |après-avant| / |min(avant,après)|
 * - `apparue` / `disparue` : 1000 + log quantité (toujours en tête mais trié
 *   par volume et entrelacé apparue/disparue, sinon les 1000 premiers sont
 *   tous disparus car `Infinity` stable garde l'ordre d'insertion disparue-first)
 * - `date` : |jours de décalage| / TOLERANCE_ECHEANCE_JOURS, et `1` (soit la
 *   tolérance exactement) pour une échéance renseignée ou retirée — pas de
 *   delta calculable, mais l'événement n'est pas du bruit et ne doit pas
 *   tomber en queue de tri avec un score de 0.
 * - `renumerotation` : `0`, donc toujours en queue. Le CBN en produit ~17 500
 *   par nuit (of_planifie, of_suggestion, appro_suggestion sont détruits et
 *   recréés) : à amplitude non nulle elles enterreraient les vrais mouvements
 *   sous le bornage de l'appelant.
 */
export function driverDiffAmplitude(e: DriverDiffEntry): number {
  if (e.nature === 'renumerotation') return 0
  if (e.nature === 'apparue' || e.nature === 'disparue') {
    const q = e.nature === 'apparue' ? (e.quantiteApres ?? 0) : (e.quantiteAvant ?? 0)
    return 1000 + Math.log10(Math.abs(q) + 1)
  }
  if (e.nature === 'date') {
    const d = joursEntre(e.echeanceAvant, e.echeanceApres)
    if (d === null) return estTransitionEcheance(e.echeanceAvant, e.echeanceApres) ? 1 : 0
    return Math.abs(d) / TOLERANCE_ECHEANCE_JOURS
  }
  if (e.quantiteAvant === null || e.quantiteApres === null) return 0
  const base = baseRatio(e.quantiteAvant, e.quantiteApres)
  return Math.abs(e.quantiteApres - e.quantiteAvant) / base
}

const joursEntre = (deIso: string | null, aIso: string | null): number | null => {
  if (deIso === null || aIso === null) return null
  const de = Date.parse(`${deIso}T00:00:00Z`)
  const a = Date.parse(`${aIso}T00:00:00Z`)
  if (!Number.isFinite(de) || !Number.isFinite(a)) return null
  return Math.round((a - de) / 86_400_000)
}

const qte = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
const fmtFr = (iso: string | null): string => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/**
 * Référence du ratio de variation : la plus petite MAGNITUDE, jamais la plus
 * petite valeur signée.
 *
 * Le stock figé ici est le stock STRICT (physique − alloué), qui passe sous
 * zéro dès que les allocations dépassent le physique. Avec `Math.min(qa, qp)`
 * brut, une chute +100 → −100 donnait `base = -100`, donc `ratio = -2`, et
 * `ratio > 0.2` était FAUX : l'effondrement de stock — le driver de poids 3,
 * celui qui explique un « avancer » — n'était jamais émis. Symétriquement,
 * −100 → +500 disparaissait aussi, alors qu'il explique un « retarder ».
 *
 * Sur deux quantités positives, `Math.abs` ne change rien : le comportement
 * historique est préservé.
 */
const baseRatio = (qa: number, qp: number): number => Math.abs(Math.min(qa, qp)) || 1

/** Une seule des deux échéances est nulle : elle est renseignée ou retirée. */
const estTransitionEcheance = (a: string | null, b: string | null): boolean =>
  (a === null) !== (b === null)

const distEcheance = (a: string | null, b: string | null): number => {
  if (a === null && b === null) return 0
  if (a === null || b === null) return Number.POSITIVE_INFINITY
  const d = joursEntre(a, b)
  return d === null ? Number.POSITIVE_INFINITY : Math.abs(d)
}

/**
 * Sources dont la clé d'index est `(article, source)` : le `VCRNUM` y est
 * détruit et recréé chaque nuit par le CBN, donc `apparie()` DEVINE quelle
 * ligne d'avant correspond à quelle ligne d'après. Ce sont les seules cibles
 * légitimes des garde-fous d'appariement (#144).
 *
 * Partout ailleurs la clé porte déjà `(vcrnum, vcrlin)` : la pièce EST la clé,
 * l'identité est certaine, il n'y a rien à départager — et donc rien à borner.
 *
 * Cette liste et le calcul de clé dans `index()` doivent rester d'accord : un
 * garde-fou armé sur une source à identité certaine transforme une replanif en
 * disparue + apparue (mesuré : 1250 OF fermes sur les photos 30/07 → 07/08).
 */
const SOURCES_IDENTITE_INFEREE = new Set<DriverSource>([
  'of_suggestion',
  'appro_suggestion',
  'of_planifie',
])

/**
 * @param plafondJours distance d'échéance au-delà de laquelle deux lignes ne
 *   sont plus le même besoin. `Number.POSITIVE_INFINITY` = identité certaine,
 *   aucun garde-fou (voir `SOURCES_IDENTITE_INFEREE`).
 */
function apparie(
  avant: DemandSnapshotRow[],
  apres: DemandSnapshotRow[],
  plafondJours: number
): {
  paires: Array<[DemandSnapshotRow, DemandSnapshotRow]>
  surplusAvant: DemandSnapshotRow[]
  surplusApres: DemandSnapshotRow[]
} {
  // Les deux garde-fous ci-dessous (plafond de distance en passe 1, ratio de
  // quantité en passe 2) bornent une DEVINETTE. Un plafond infini signifie que
  // l'appelant garantit l'identité des lignes : on ne borne alors rien, sous
  // peine de casser des couples pourtant certains.
  const identiteInferee = Number.isFinite(plafondJours)
  const as = [...avant].sort((x, y) =>
    (x.date_echeance ?? '9').localeCompare(y.date_echeance ?? '9')
  )
  const ps = [...apres].sort((x, y) =>
    (x.date_echeance ?? '9').localeCompare(y.date_echeance ?? '9')
  )
  const usedP = new Set<number>()
  const paires: Array<[DemandSnapshotRow, DemandSnapshotRow]> = []
  const appariees = new Set<DemandSnapshotRow>()

  // Passe 1 — appariement par échéance. Les couples non comparables (une seule
  // des deux échéances nulle) sont écartés : `distEcheance` rend `Infinity` et
  // le départage à quantité minimale les sélectionnerait sinon, `Infinity ===
  // Infinity` étant vrai.
  // Au-delà de `plafondJours` les deux lignes ne sont pas le même besoin
  // (#144) : on ne marie pas une suggestion de septembre à une de février
  // (+168 j) simplement parce que c'est ce qui reste de libre. Le plafond
  // s'applique à la valeur ABSOLUE de l'écart (cf. `distEcheance`) : il est
  // donc symétrique, une avance de 60 j est écartée comme un retard de 60 j.
  for (const rowA of as) {
    let best = -1
    let bestDist = Number.POSITIVE_INFINITY
    let bestQtyDelta = Number.POSITIVE_INFINITY
    ps.forEach((rowP, idx) => {
      if (usedP.has(idx)) return
      const d = distEcheance(rowA.date_echeance, rowP.date_echeance)
      if (d === Number.POSITIVE_INFINITY) return
      if (d > plafondJours) return
      const qtyDelta = Math.abs(rowP.quantity - rowA.quantity)
      if (d < bestDist || (d === bestDist && qtyDelta < bestQtyDelta)) {
        bestDist = d
        bestQtyDelta = qtyDelta
        best = idx
      }
    })
    if (best === -1) continue
    usedP.add(best)
    appariees.add(rowA)
    paires.push([rowA, ps[best]])
  }

  // Passe 2 — rattrapage à la quantité la plus proche.
  //
  // Une ligne dont l'échéance passe de nulle à renseignée (ou l'inverse) est
  // incomparable en passe 1 : `distEcheance` rend `Infinity`. Sans rattrapage
  // elle ressort en `disparue` + `apparue`, soit deux lignes de bruit pour un
  // seul événement — une réception qui reçoit sa date.
  //
  // Ce que la passe 2 reçoit (depuis le plafond #144) : ces transitions, les
  // écarts de cardinalité (rien à apparier de l'autre côté), ET les orphelines
  // lointaines — deux échéances renseignées mais au-delà du plafond. Ces
  // dernières se marieraient à n'importe quelle ligne sans échéance, puisque
  // `Infinity` est exempté du plafond : c'est le défaut qui rentre par la porte
  // de service, avec un `quantite(100 → 5000)` inventé à la clé.
  //
  // D'où deux garde-fous, armés seulement quand l'identité est inférée :
  // - le plafond lui-même, sur les couples dont les DEUX échéances existent ;
  // - un ratio de quantité (le même ±20 % que le seuil de bruit) sur tous les
  //   couples : si la quantité a bougé au-delà du bruit EN PLUS de l'échéance,
  //   rien n'atteste que c'est la même ligne, et deux faits indépendants se
  //   disent mieux en disparue + apparue qu'en couple imaginé.
  for (const rowA of as) {
    if (appariees.has(rowA)) continue
    let best = -1
    let bestQtyDelta = Number.POSITIVE_INFINITY
    ps.forEach((rowP, idx) => {
      if (usedP.has(idx)) return
      const d = distEcheance(rowA.date_echeance, rowP.date_echeance)
      if (d !== Number.POSITIVE_INFINITY && d > plafondJours) return
      const qtyDelta = Math.abs(rowP.quantity - rowA.quantity)
      const qtyRatio = qtyDelta / baseRatio(rowA.quantity, rowP.quantity)
      if (identiteInferee && qtyRatio > TOLERANCE_QUANTITE_RATIO) return
      if (qtyDelta < bestQtyDelta) {
        bestQtyDelta = qtyDelta
        best = idx
      }
    })
    if (best === -1) continue
    usedP.add(best)
    appariees.add(rowA)
    paires.push([rowA, ps[best]])
  }

  return {
    paires,
    surplusAvant: as.filter((r) => !appariees.has(r)),
    surplusApres: ps.filter((_, i) => !usedP.has(i)),
  }
}

/**
 * Diff pur des drivers entre deux photos complètes.
 * `avant` = plus ancienne, `apres` = plus récente.
 * Rend une liste plate (un `filter` par article côté appelant suffit), triée par
 * `driverDiffAmplitude` décroissante — l'ordre fait partie du contrat, tout
 * bornage côté appelant garde donc bien les mouvements les plus forts.
 */
export function diffCbnDrivers(
  avant: DemandSnapshotRow[],
  apres: DemandSnapshotRow[]
): DriverDiffEntry[] {
  const out: DriverDiffEntry[] = []

  const index = (rows: DemandSnapshotRow[]): Map<string, DemandSnapshotRow[]> => {
    const m = new Map<string, DemandSnapshotRow[]>()
    for (const r of rows) {
      // `VCRNUM` n'est pas une clé stable pour 3 populations :
      // - `of_suggestion` / `appro_suggestion` : recréé chaque nuit (cf. appro_snapshot_diff.ts) ;
      // - `of_planifie` : même constat en base (0 VCRNUM commun entre 06 et 07/08, 205 lignes
      //   recréées) — sans regrouper par (article,source), chaque OF planifié apparaît
      //   comme 1 disparue + 1 apparue, soit 410 lignes de bruit pour 205 OF.
      // Les 3 sont donc groupés par (article, source) et comparés via `apparie()` (quantité/date),
      // sans les confondre : `of_planifie` garde sa source et son tri propre, il n'est pas
      // traité comme une suggestion métier — c'est une contrainte technique de clé, pas un
      // raccourci fonctionnel. Les autres sources restent par (article, source, vcrnum, vcrlin)
      // car la pièce y est stable et vérifiable (ex: `of_ferme` : 1535 VCRNUM stables).
      const k = SOURCES_IDENTITE_INFEREE.has(r.source as DriverSource)
        ? `${r.itmref}\u0001${r.source}`
        : `${r.itmref}\u0001${r.source}\u0001${r.vcrnum ?? ''}\u0001${r.vcrlin ?? ''}`
      const list = m.get(k)
      if (list === undefined) m.set(k, [r])
      else list.push(r)
    }
    return m
  }

  const parCleAvant = index(avant)
  const parCleApres = index(apres)
  const cles = new Set([...parCleAvant.keys(), ...parCleApres.keys()])

  for (const key of cles) {
    const [article, sourceRaw] = key.split('\u0001')
    const source = sourceRaw as DriverSource
    const a = parCleAvant.get(key) ?? []
    const p = parCleApres.get(key) ?? []

    if (a.length === 0) {
      for (const rowP of p) {
        out.push({
          article,
          source,
          nature: 'apparue',
          quantiteAvant: null,
          quantiteApres: rowP.quantity,
          echeanceAvant: null,
          echeanceApres: rowP.date_echeance,
          detail: `${source} apparue : ${qte(rowP.quantity)} unités${rowP.date_echeance ? `, échéance ${fmtFr(rowP.date_echeance)}` : ''} — ${article}.`,
          designation: null,
          famille: null,
          vcrnum: rowP.vcrnum,
          vcrlin: rowP.vcrlin,
          vcrnumApres: null,
          vcrlinApres: null,
        })
      }
      continue
    }

    if (p.length === 0) {
      for (const rowA of a) {
        out.push({
          article,
          source,
          nature: 'disparue',
          quantiteAvant: rowA.quantity,
          quantiteApres: null,
          echeanceAvant: rowA.date_echeance,
          echeanceApres: null,
          detail: `${source} disparue : ${qte(rowA.quantity)} unités${rowA.date_echeance ? `, échéance ${fmtFr(rowA.date_echeance)}` : ''} — ${article}.`,
          designation: null,
          famille: null,
          vcrnum: rowA.vcrnum,
          vcrlin: rowA.vcrlin,
          vcrnumApres: null,
          vcrlinApres: null,
        })
      }
      continue
    }

    // Cas stock : une seule ligne par article ; comparaison directe sans
    // appariement par échéance (qui n'existe pas).
    if (source === 'stock') {
      const qa = a[0]?.quantity ?? 0
      const qp = p[0]?.quantity ?? 0
      const ratio = Math.abs(qp - qa) / baseRatio(qa, qp)
      if (ratio > TOLERANCE_QUANTITE_RATIO) {
        const sens = qp > qa ? '+' : '−'
        out.push({
          article,
          source,
          nature: 'quantite',
          quantiteAvant: qa,
          quantiteApres: qp,
          echeanceAvant: null,
          echeanceApres: null,
          detail: `Stock ${qte(qa)} → ${qte(qp)} (${sens}${Math.round(ratio * 100)} %) — ${article}.`,
          designation: null,
          famille: null,
          vcrnum: null,
          vcrlin: null,
          vcrnumApres: null,
          vcrlinApres: null,
        })
      }
      continue
    }

    // Le plafond ne s'arme que là où l'appariement DEVINE l'identité des
    // lignes. Ailleurs la clé porte déjà la pièce : les deux lignes du couple
    // sont le même document, quel que soit l'écart d'échéance — une réception
    // retardée de 106 j reste un retard (#43), pas une disparition.
    const plafondJours = SOURCES_IDENTITE_INFEREE.has(source)
      ? TOLERANCE_APPARIEMENT_JOURS
      : Number.POSITIVE_INFINITY
    const { paires, surplusAvant, surplusApres } = apparie(a, p, plafondJours)

    for (const [rowA, rowP] of paires) {
      const ratio =
        Math.abs(rowP.quantity - rowA.quantity) / baseRatio(rowA.quantity, rowP.quantity)
      const ecartJours = joursEntre(rowA.date_echeance, rowP.date_echeance)
      const qtyChanged = ratio > TOLERANCE_QUANTITE_RATIO
      // Une échéance qui apparaît ou disparaît est un changement de date à part
      // entière : `joursEntre` rend `null` faute de delta calculable, mais le
      // couple vient d'être apparié en passe 2 et l'événement doit ressortir.
      const transitionEcheance = estTransitionEcheance(rowA.date_echeance, rowP.date_echeance)
      const dateChanged =
        transitionEcheance ||
        (ecartJours !== null && Math.abs(ecartJours) > TOLERANCE_ECHEANCE_JOURS)

      // La pièce a changé de numéro. Cas nominal pour les 3 populations que le
      // CBN détruit et recrée chaque nuit (of_planifie, of_suggestion,
      // appro_suggestion) : le couple est apparié parce qu'il porte le même
      // article, mais ce n'est pas le même document.
      const piece = (r: DemandSnapshotRow) => `${r.vcrnum ?? ''}${r.vcrlin ?? ''}`
      const renumerotee = piece(rowA) !== piece(rowP)
      const ref = (n: string | null, l: string | null) => (n === null ? '—' : l ? `${n} L${l}` : n)

      // `renumerotation` ne sort QUE si le numéro est le seul changement. Dès
      // qu'une quantité ou une échéance bouge, ces lignes-là portent déjà la
      // transition via `vcrnumApres` : une seconde ligne dirait deux fois le
      // même fait, et comme les renumérotations sont décochées par défaut elle
      // serait invisible — laissant croire que la pièce d'avant avait
      // simplement changé de date.
      if (renumerotee && !qtyChanged && !dateChanged) {
        out.push({
          article,
          source,
          nature: 'renumerotation',
          quantiteAvant: rowA.quantity,
          quantiteApres: rowP.quantity,
          echeanceAvant: rowA.date_echeance,
          echeanceApres: rowP.date_echeance,
          detail: `${source} renumérotée : ${ref(rowA.vcrnum, rowA.vcrlin)} → ${ref(rowP.vcrnum, rowP.vcrlin)} — ${article}.`,
          designation: null,
          famille: null,
          vcrnum: rowA.vcrnum,
          vcrlin: rowA.vcrlin,
          vcrnumApres: rowP.vcrnum,
          vcrlinApres: rowP.vcrlin,
        })
      }

      if (qtyChanged) {
        const sens = rowP.quantity > rowA.quantity ? '+' : '−'
        out.push({
          article,
          source,
          nature: 'quantite',
          quantiteAvant: rowA.quantity,
          quantiteApres: rowP.quantity,
          echeanceAvant: rowA.date_echeance,
          echeanceApres: rowP.date_echeance,
          detail: `${source} quantité ${qte(rowA.quantity)} → ${qte(rowP.quantity)} (${sens}${Math.round(ratio * 100)} %)${renumerotee ? ` — ${ref(rowA.vcrnum, rowA.vcrlin)} → ${ref(rowP.vcrnum, rowP.vcrlin)}` : ''} — ${article}.`,
          designation: null,
          famille: null,
          vcrnum: rowA.vcrnum,
          vcrlin: rowA.vcrlin,
          vcrnumApres: renumerotee ? rowP.vcrnum : null,
          vcrlinApres: renumerotee ? rowP.vcrlin : null,
        })
      }

      if (dateChanged) {
        out.push({
          article,
          source,
          nature: 'date',
          quantiteAvant: rowA.quantity,
          quantiteApres: rowP.quantity,
          echeanceAvant: rowA.date_echeance,
          echeanceApres: rowP.date_echeance,
          detail: `${source} échéance ${fmtFr(rowA.date_echeance)} → ${fmtFr(rowP.date_echeance)}${ecartJours === null ? '' : ` (${ecartJours > 0 ? '+' : ''}${ecartJours} j)`}${renumerotee ? ` — ${ref(rowA.vcrnum, rowA.vcrlin)} → ${ref(rowP.vcrnum, rowP.vcrlin)}` : ''} — ${article}.`,
          designation: null,
          famille: null,
          vcrnum: rowA.vcrnum,
          vcrlin: rowA.vcrlin,
          vcrnumApres: renumerotee ? rowP.vcrnum : null,
          vcrlinApres: renumerotee ? rowP.vcrlin : null,
        })
      }
    }

    for (const rowA of surplusAvant) {
      out.push({
        article,
        source,
        nature: 'disparue',
        quantiteAvant: rowA.quantity,
        quantiteApres: null,
        echeanceAvant: rowA.date_echeance,
        echeanceApres: null,
        detail: `${source} ligne disparue : ${qte(rowA.quantity)} unités, échéance ${fmtFr(rowA.date_echeance)} — ${article}.`,
        designation: null,
        famille: null,
        vcrnum: rowA.vcrnum,
        vcrlin: rowA.vcrlin,
        vcrnumApres: null,
        vcrlinApres: null,
      })
    }

    for (const rowP of surplusApres) {
      out.push({
        article,
        source,
        nature: 'apparue',
        quantiteAvant: null,
        quantiteApres: rowP.quantity,
        echeanceAvant: null,
        echeanceApres: rowP.date_echeance,
        detail: `${source} ligne apparue : ${qte(rowP.quantity)} unités, échéance ${fmtFr(rowP.date_echeance)} — ${article}.`,
        designation: null,
        famille: null,
        vcrnum: rowP.vcrnum,
        vcrlin: rowP.vcrlin,
        vcrnumApres: null,
        vcrlinApres: null,
      })
    }
  }

  // Renumérotation des sources à VCRNUM stable. Elles sont clefées PAR pièce :
  // un changement de numéro y tombe donc dans deux clés distinctes et ressort en
  // disparue + apparue. On recolle la paire (même quantité, même échéance) et on
  // l'émet en UNE ligne `renumerotation`, au lieu de la supprimer : « ce document
  // a été remplacé par celui-là » est un fait de la nuit, au même titre qu'un
  // changement de quantité.
  //
  // `of_planifie` et les suggestions ne passent pas ici : regroupées par
  // (article, source), leurs renumérotations sont déjà appariées et émises dans
  // la boucle des paires ci-dessus.
  const stables = new Set<DriverSource>([
    'of_ferme',
    'demande_ferme',
    'demande_prevision',
    'appro',
    'stock',
  ])
  const toKeep: DriverDiffEntry[] = []
  const byStableKey = new Map<string, DriverDiffEntry[]>()
  for (const e of out) {
    if (!stables.has(e.source) || (e.nature !== 'apparue' && e.nature !== 'disparue')) {
      toKeep.push(e)
      continue
    }
    const k = `${e.article}\u0001${e.source}`
    const arr = byStableKey.get(k)
    if (arr) arr.push(e)
    else byStableKey.set(k, [e])
  }
  for (const [, group] of byStableKey) {
    const apparues = group.filter((e) => e.nature === 'apparue')
    const disparues = group.filter((e) => e.nature === 'disparue')
    const usedA = new Set<number>()
    const usedD = new Set<number>()
    for (const [i, d] of disparues.entries()) {
      let matched = -1
      for (const [j, a] of apparues.entries()) {
        if (usedA.has(j)) continue
        if (a.quantiteApres === d.quantiteAvant && a.echeanceApres === d.echeanceAvant) {
          matched = j
          break
        }
      }
      if (matched !== -1) {
        usedD.add(i)
        usedA.add(matched)
        const a = apparues[matched]
        const ref = (n: string | null, l: string | null) =>
          n === null ? '—' : l ? `${n} L${l}` : n
        toKeep.push({
          article: d.article,
          source: d.source,
          nature: 'renumerotation',
          quantiteAvant: d.quantiteAvant,
          quantiteApres: a.quantiteApres,
          echeanceAvant: d.echeanceAvant,
          echeanceApres: a.echeanceApres,
          detail: `${d.source} renumérotée : ${ref(d.vcrnum, d.vcrlin)} → ${ref(a.vcrnum, a.vcrlin)} — ${d.article}.`,
          designation: null,
          famille: null,
          vcrnum: d.vcrnum,
          vcrlin: d.vcrlin,
          vcrnumApres: a.vcrnum,
          vcrlinApres: a.vcrlin,
        })
      }
    }
    for (let i = 0; i < disparues.length; i++) if (!usedD.has(i)) toKeep.push(disparues[i])
    for (let j = 0; j < apparues.length; j++) if (!usedA.has(j)) toKeep.push(apparues[j])
  }

  // Tri par amplitude décroissante, TOUJOURS : le regroupement ci-dessus renvoie
  // les apparues/disparues en fin de liste, donc l'ordre de sortie dépendrait
  // sinon de la présence ou non d'une renumérotation dans les données. C'est ici
  // que vit le contrat d'ordre — les appelants ne re-trient pas.
  toKeep.sort((a, b) => driverDiffAmplitude(b) - driverDiffAmplitude(a))
  return toKeep
}
