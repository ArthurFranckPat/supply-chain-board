/**
 * Assemblage du payload `/api/v1/planning/shortages/rows` — pipeline faisabilité +
 * réceptions, pivoté en lignes, formaté pour le Registre (badges verdict + dates FR).
 *
 * Extrait de `SchedulerController.shortageRows` (issue #49). shortageTracker (coquille
 * Inertia, aucun calcul X3) reste dans le controller — pas un offender.
 */

import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import boardDataset from '#services/board_dataset'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import {
  buildShortageRows,
  fabricationDaysFromHours,
  DEFAULT_HOURS_PER_DAY,
  type ShortageRow,
} from '#app/domain/shortages'
import {
  groupReceptionsByArticle,
  RECEPTION_LOOKBACK_DAYS,
  RECEPTION_OVERDUE_MIN_QTY,
} from '#repositories/reception_repository'

const isoDay = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

/** Formatte une qté : entier si rond, sinon 2 décimales. */
function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/**
 * Date ISO → relatif actionnable : « auj. », « demain », « +5j », « −3j ».
 * Le planificateur n'a pas à soustraire mentalement la date du jour. '' si absente.
 * Utilisé dans les colonnes Expé/Commande et les libellés de frise.
 */
function fmtRelatif(iso: string | null | undefined): string {
  if (!iso) return ''
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const a = Date.parse(`${todayIso}T00:00:00Z`)
  const b = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(b)) return ''
  const days = Math.round((b - a) / 86_400_000)
  if (days === 0) return 'auj.'
  if (days === 1) return 'demain'
  if (days === -1) return 'hier'
  return days > 0 ? `+${days}j` : `${days}j`
}

// Présentation (badges verdict + dates FR). Lecture seule, pas de Solid.
// Teintes alignées sur les tokens du design system (suggere = ambre, ferme = vert,
// planifie = bleu, destructive = rouge). Une seule source de vérité pour le cls,
// consommée telle quelle par le Registre (pas de recalcul côté composant).
const VERDICT_PRESET: Record<ShortageRow['verdict'], { label: string; cls: string }> = {
  couvert: {
    label: 'Couvert',
    // Effacé par intention : « couvert » = rien à faire, passe ton chemin. Pas de
    // badge vert voyant — juste un texte gris qui se fond, pour que l'œil aille aux
    // vraies alertes (retard / sans couverture).
    cls: 'text-muted-foreground/50',
  },
  a_risque: {
    label: 'À risque',
    cls: 'text-suggere bg-suggere/15',
  },
  retard: {
    label: 'Retard',
    cls: 'text-destructive bg-destructive/10',
  },
  sans_couverture: {
    label: 'Sans couverture',
    // Rouge PLEIN (pas /10) : impasse totale, aucune action en cours — l'alerte la
    // plus forte, au-dessus du retard (qui a au moins une réception en route).
    cls: 'text-destructive bg-destructive/20',
  },
  sous_ensemble: {
    label: 'S/E à lancer',
    cls: 'text-planifie bg-planifie/15',
  },
}

/**
 * GET /api/v1/planning/shortages/rows — endpoint JSON (calcul lourd).
 * Charge le pipeline de faisabilité + réceptions, pivote en lignes, renvoie les lignes
 * pré-formatées + stats + erreur X3 (consommé en fetch par la page Solid `scheduler/shortages`).
 *
 * Limite assumée : le verdict de faisabilité par OF vient de l'override MFGMAT (snapshot
 * PLAT, sans consommation virtuelle entre OFs — contrat badge==détail, issue #11). Deux OF
 * partageant le stock d'un même composant peuvent donc être jugés faisables chacun → rupture
 * de contention invisible ici. La vue proactive /suivi (preferEngineFeasibility, moteur
 * séquentiel) couvre ce cas. Ne pas « corriger » ici sans casser la parité badge board.
 */
export async function loadShortageRows(ctx: HttpContext) {
  const startParam = ctx.request.input('start') as string | undefined
  const daysParam = Number.parseInt(ctx.request.input('days', '14'), 10)
  const horizon = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14
  const force = !!ctx.request.input('refresh')

  const windowFrom = startParam ? new Date(startParam) : new Date()
  windowFrom.setHours(0, 0, 0, 0)
  const windowTo = new Date(windowFrom)
  windowTo.setDate(windowTo.getDate() + horizon)
  windowTo.setHours(23, 59, 59, 999)

  // Cache du payload (calcul lourd : faisabilité + réceptions + pivot) + SWR (soft
  // timeout 1 s) comme /programme et /suivi (issue #33). Clé GLOBALE, pas par
  // utilisateur (issue #39, C2) : payload dérivé des données usine, identique pour
  // tous → plus de cold start (~18 s) répété par user. ?refresh=1 invalide la clé.
  const ruptCache = () => cache.namespace('ruptures')
  const cacheKey = `payload:${isoDay(windowFrom)}:${horizon}`
  if (force) await ruptCache().delete({ key: cacheKey })

  // Le catch est AUTOUR du getOrSet, pas dans la factory : une erreur X3 transiente ne
  // doit jamais être mise en cache (sinon payload vide servi à tous pendant le TTL).
  // Factory qui throw → bentocache sert le stale s'il existe, sinon l'erreur remonte ici.
  let rows: ShortageRow[] = []
  let stats = { nbRuptures: 0, nbCouvertes: 0, nbSansCouverture: 0 }
  let x3Error: string | null = null
  try {
    const cached = await ruptCache().getOrSet({
      key: cacheKey,
      ttl: 2 * 60 * 1000,
      // SWR : timeout par défaut (0) = vrai stale-while-revalidate (cf. board_dataset / suivi).
      // NE PAS mettre > 0 → refresh hors background, rejet orphelin → unhandled rejection → crash.
      factory: async () => {
        // useWindowOfs : OFs scopés par STRDAT (date de DÉBUT). Métier : « on ne peut
        // pas COMMENCER un OF si un composant est en rupture » → l'OF actionnable est
        // celui qui va démarrer dans la fenêtre, pas celui qui finit (déjà lancé =
        // trop tard). En bonus : fenêtre STRDAT courte (~25× moins de lignes que le
        // lookback ENDDAT) + getDemandAndReception sans WIPTYP=5 (cf. /programme).
        //
        const { result, articles, ofPegs, receptionFlows } = await loadOrderImpacts({
          from: windowFrom,
          to: windowTo,
          force,
          pipeline: 'ruptures',
        })
        // OfCommandePeg (Date) → ShortageOfPeg (ISO) pour le pivot pur.
        const pegsIso = new Map(
          [...ofPegs].map(([ofNum, p]) => [
            ofNum,
            {
              numCommande: p.numCommande,
              client: p.client,
              dateExpedition: p.dateExpedition?.toISOString().slice(0, 10) ?? null,
            },
          ])
        )
        // Réceptions COUVRANTES = PORDERQ complet (getReceptions, cache SWR global déjà
        // partagé avec le détail OF / diagnostic), NON borné à windowTo : un PO arrivant
        // après la fenêtre doit donner « retard », pas un faux « sans couverture » qui
        // fait commander en double. Le MOTEUR de faisabilité garde ses receptionFlows
        // bornés (loadOrderImpacts) — le matcher les compte comme stock sans regarder la
        // date, élargir sa fenêtre fausserait les statuts commande.
        // Repli si le SOAP échoue : fermes ORDERS de la fenêtre (couverture partielle).
        const coverageReceptions = await boardDataset
          .getReceptions()
          .catch(() =>
            receptionFlows.filter(
              (f) => f.origin.type === 'reception' && (f.origin as { firm?: boolean }).firm
            )
          )
        // Lookback des retards de livraison : on garde les PO en retard (attendues dans le
        // passé) jusqu'à RECEPTION_LOOKBACK_DAYS pour capter les livraisons en retard.
        const receptionFrom = new Date()
        receptionFrom.setDate(receptionFrom.getDate() - RECEPTION_LOOKBACK_DAYS)
        receptionFrom.setHours(0, 0, 0, 0)
        const receptionsByArticle = groupReceptionsByArticle(coverageReceptions, receptionFrom)

        // Jours de fabrication par OF depuis la charge gamme : Σ (qté restante / cadence)
        // sur toutes les opérations de l'article, convertie en jours (7,5 h/j, plancher
        // 1 j — décision métier : « charge < 1 journée → 1 journée »). Gamme absente ou
        // référentiel indisponible → plancher 1 j (map vide/entrée manquante).
        const hoursPerDay = Number(process.env.RUPTURES_HOURS_PER_DAY) || DEFAULT_HOURS_PER_DAY
        const fabricationDaysByOf = new Map<string, number>()
        try {
          const { gamme } = await boardDataset.getReferential()
          const opsByArticle = new Map<string, { rate: number }[]>()
          for (const g of gamme) {
            if (!g.article || g.rate <= 0) continue
            const arr = opsByArticle.get(g.article) ?? []
            arr.push(g)
            opsByArticle.set(g.article, arr)
          }
          for (const of of result.ofs) {
            const ops = opsByArticle.get(of.article)
            if (!ops || !of.qteRestante) continue
            let hours = 0
            for (const op of ops) hours += of.qteRestante / op.rate
            fabricationDaysByOf.set(of.numOf, fabricationDaysFromHours(hours, hoursPerDay))
          }
        } catch {
          // Référentiel injoignable → tous les OF au plancher 1 j de fabrication.
        }

        return buildShortageRows(result, receptionsByArticle, articles, pegsIso, {
          overdueMinQty: RECEPTION_OVERDUE_MIN_QTY,
          // Date de besoin = expédition − logistique (2 j) − fabrication (charge gamme).
          // Jalonnement OF (STRDAT/ENDDAT) jamais consulté : jugé non fiable (métier).
          logisticsBufferDays: Number(process.env.RUPTURES_LOGISTICS_BUFFER_DAYS) || undefined,
          fabricationDaysByOf,
        })
      },
    })
    rows = cached.rows
    stats = cached.stats
  } catch (e) {
    x3Error = (e as Error).message
  }

  const displayRows = rows.map((r) => {
    const preset = VERDICT_PRESET[r.verdict]
    return {
      component: r.component,
      componentDesc: r.componentDesc,
      qteManquante: fmtQty(r.qteManquante),
      // Brut numérique pour les agrégations client (vue « Par composant »).
      qteManquanteNum: r.qteManquante,
      numOf: r.numOf,
      ofHref: `/api/v1/planning/ofs/${r.numOf}/detail`,
      articleParent: r.articleParent,
      articleParentDesc: r.articleParentDesc,
      numCommande: r.numCommande ?? '—',
      client: r.client ?? '',
      hasCommande: r.numCommande !== null,
      // Autres commandes allouées au même OF (au-delà de la plus urgente affichée).
      autresCommandes: r.autresCommandes,
      // Expé en relatif actionnable (« +5j », « auj. ») — l'ISO absolu reste dans
      // dateExpeditionIso pour le tooltip et la frise.
      dateExpedition: fmtRelatif(r.dateExpedition),
      reception: r.reception
        ? {
            id: r.reception.id,
            supplier: r.reception.supplier,
            qty: fmtQty(r.reception.qty),
            dateArrivee: fmtRelatif(r.reception.dateArrivee),
          }
        : null,
      // Arrivée en relatif — sert uniquement à la frise (le badge verdict porte la lateness).
      dateArrivee: r.reception ? fmtRelatif(r.reception.dateArrivee) : '',
      arriveeLate: r.verdict === 'retard',
      overdue: r.overdue,
      // OFs fils produisant le composant (verdict sous_ensemble) — pour la colonne Réception.
      sousEnsembleOfs: r.sousEnsembleOfs,
      verdictKey: r.verdict,
      verdictLabel: (() => {
        // Sous-ensemble : distinguer « OF fils déjà présent » de « à lancer ».
        if (r.verdict === 'sous_ensemble')
          return r.sousEnsembleOfs.length > 0 ? 'S/E — OF fils existant' : 'S/E à lancer'
        if (r.verdict === 'sans_couverture') return preset.label
        // a_risque : pas un retard client. Deux lectures :
        //  - non-overdue : « Marge +Nj » = expé − arrivée (marge logistique restante).
        //  - overdue     : « Fourn. +Nj » = aujourd'hui − attendue (retard fournisseur,
        //    client encore tenable). Le planificateur sait que le fournisseur a manqué.
        if (r.verdict === 'a_risque')
          return r.overdue ? `Fourn. +${r.joursRetardReception}j` : `Marge +${r.joursMarge}j`
        // retard : vrai retard client projeté. overdue = retard déjà cumulé (le plus
        // urgent) ; non-overdue = arrivée après expé, retard projeté.
        if (r.verdict === 'retard') {
          if (r.overdue) return `Retard +${r.joursRetardReception}j`
          return `Retard ${r.joursMarge}j` // joursMarge ≤ 0 (« Retard −Nj »)
        }
        return preset.label
      })(),
      verdictCls: preset.cls,
      // ── Données pour la vue « Couverture » (frise temporelle R3) ──
      // ISO (YYYY-MM-DD) pour positionner les marqueurs ; jours de retard d'arrivée
      // pour le sous-libellé « +N j » du marqueur réception.
      dateExpeditionIso: r.dateExpedition,
      receptionIso: r.reception?.dateArrivee ?? null,
      joursRetardReception: r.joursRetardReception,
      joursMarge: r.joursMarge,
      // Champ texte concaténé pour le filtre client (composant / commande / fournisseur).
      filter:
        `${r.component} ${r.componentDesc} ${r.numCommande ?? ''} ${r.client ?? ''} ${r.reception?.supplier ?? ''} ${r.numOf} ${r.articleParent}`.toLowerCase(),
    }
  })

  return { rows: displayRows, stats, x3Error }
}
