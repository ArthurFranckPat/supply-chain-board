import db from '@adonisjs/lucid/services/db'
import type { OrdersSourceRow } from '#repositories/combined_orders_repository'

/**
 * Lecture read-only d'`orders_flux_replica` (#98, #105) — miroir de la SOURCE
 * `ORDERS`, jointures de contexte comprises.
 *
 * Ne décide RIEN sur la confiance : passer par
 * `replicaGate.canRead('orders_flux_replica')` en amont, comme les autres
 * répliques.
 *
 * Rend des `OrdersSourceRow`, le type normalisé de
 * `combined_orders_repository` — pas des `Flow`. La mise en forme reste chez
 * `splitOrdersFlows()`, partagée avec la voie X3 directe : une seule règle de
 * mapping, un seul endroit. Si la réplique fabriquait ses propres `Flow`, les
 * deux voies pourraient diverger sans que rien ne le signale — les deux
 * rendraient des objets bien formés.
 */

type ReplicaRow = {
  wiptyp: number
  wipsta: number
  vcrnum: string
  vcrlin: string
  vcrseq: string
  article: string
  designation: string | null
  date_echeance: string | null
  qte_restante: number
  qte_commandee: number
  qte_allouee: number
  partner_nom: string | null
  pays: string | null
  date_commande: string | null
  contremarque: string | null
  bpcord: string | null
  cusordref: string | null
  itmrefbpc: string | null
  sohtyp: string | null
}

/**
 * `T00:00:00Z` et NON heure locale. Les dates d'`ORDERS` alimentent des
 * comparaisons de jour et des seaux de période côté appelants, qui travaillent
 * en UTC (même convention que `parseX3Date`, zone UTC forcée, côté X3 direct).
 * Minuit LOCAL en UTC+1/+2 vaut la veille en UTC — parser en heure locale
 * ferait reculer chaque échéance d'un jour, donc parfois d'une période entière
 * à la frontière d'un mois ou d'une semaine ISO.
 */
function toDate(iso: string | null): Date | null {
  return iso ? new Date(`${iso}T00:00:00Z`) : null
}

function toOwn(r: ReplicaRow): OrdersSourceRow {
  return {
    wiptyp: r.wiptyp,
    wipsta: r.wipsta,
    vcrnum: r.vcrnum,
    // Chaînes vides à la relecture : la table est STRICT et NOT NULL sur ces
    // trois colonnes (elles composent la clé), mais le contrat du type
    // normalisé les rend nullables — X3 peut ne rien porter.
    vcrlin: r.vcrlin || null,
    vcrseq: r.vcrseq || null,
    article: r.article,
    designation: r.designation,
    date: toDate(r.date_echeance),
    qteRestante: r.qte_restante,
    qteCommandee: r.qte_commandee,
    qteAllouee: r.qte_allouee,
    partnerNom: r.partner_nom,
    pays: r.pays,
    dateCommande: toDate(r.date_commande),
    contremarque: r.contremarque,
    bpcord: r.bpcord,
    cusordref: r.cusordref,
    itmrefbpc: r.itmrefbpc,
    sohtyp: r.sohtyp,
  }
}

/** Fenêtre réellement ingérée, telle que `syncOrdersFlux` la journalise. */
export interface OrdersFluxCoverage {
  from: string
  to: string
}

/**
 * La réplique couvre-t-elle la plage demandée ?
 *
 * **Question distincte de la fraîcheur**, et le portail ne la traite pas : un run
 * parfait d'il y a trente secondes ne dit rien de ce qu'il a RAMENÉ. Même
 * séparation que pour `stock_flux_replica` (`replicaCoversFluxRange`), et elle
 * mord bien plus fort ici : la fenêtre de `/suivi` est choisie au CALENDRIER par
 * l'utilisateur, donc arbitraire, quand celle de la valorisation est un défaut
 * glissant rarement modifié.
 *
 * Sans ce contrôle, demander mars 2029 rendrait une population vide et
 * plausible : aucune erreur, aucun écran vide, juste un plan amputé.
 *
 * **Inclusion STRICTE des deux côtés**, alors que WIPTYP=2 (réceptions) n'a pas
 * de borne basse à l'ingestion et resterait complet sous `from`. Les trois
 * familles sortent d'une seule lecture et alimentent une seule vue : en servir
 * une complète et deux tronquées donnerait un `/suivi` où l'appro existe sans la
 * demande qu'il couvre. Tout ou rien, comme `replicaServesRetard()`.
 *
 * Pure et exportée : c'est une règle, elle se teste sans base.
 */
export function replicaCoversOrdersRange(
  coverage: OrdersFluxCoverage | null,
  fromIso: string,
  toIso: string
): boolean {
  if (!coverage) return false
  return coverage.from <= fromIso && coverage.to >= toIso
}

export class OrdersFluxReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  /**
   * Fenêtre du dernier run COMPLET réussi, relue depuis `ingestion_log.note`.
   *
   * Pourquoi la note et non `MIN/MAX(date_echeance)` de la table : ces bornes-là
   * décrivent les données TROUVÉES, pas la plage DEMANDÉE. Si aucune commande
   * n'a d'échéance au-delà de mars 2027 alors que l'ingestion couvrait jusqu'en
   * juillet, un `MAX` ferait repartir en voie directe une plage pourtant
   * couverte — dégradé sans raison. La note dit l'intention du run, qui est la
   * bonne réponse à « qu'est-ce qui a été balayé ».
   *
   * Tout ce qui n'est pas une note lisible vaut « non couvert » : une couverture
   * indémontrable ne doit jamais valoir couverture, même principe que l'âge
   * indémontrable dans `ReplicaGate`.
   */
  async getCoverage(): Promise<OrdersFluxCoverage | null> {
    const row = await this.conn
      .from('ingestion_log')
      .where('table_name', 'orders_flux_replica')
      .where('status', 'ok')
      .where('scope', 'full')
      .orderBy('id', 'desc')
      .first()

    if (!row?.note) return null
    try {
      const parsed = JSON.parse(row.note)
      return typeof parsed?.from === 'string' && typeof parsed?.to === 'string'
        ? { from: parsed.from, to: parsed.to }
        : null
    } catch {
      return null
    }
  }

  /**
   * Population de `fetchLive(from, to)`, rejouée depuis la réplique.
   *
   * Les bornes reproduisent `buildOrdersSql` **par WIPTYP**, et l'asymétrie est
   * volontaire, pas un oubli :
   *  - WIPTYP 1 et 5 : fenêtre `[from, to]` fermée ;
   *  - WIPTYP 2 : borne HAUTE seule. Une réception achat en retard (échéance
   *    passée, reliquat > 0) reste attendue — lui poser une borne basse la
   *    ferait disparaître de l'appro tout en la laissant peser sur le plan.
   *
   * Bornes INCLUSIVES des deux côtés, comme le `BETWEEN` implicite du SQL
   * (`>= from AND <= to`).
   *
   * Les WIPSTA sont filtrés à l'INGESTION et pas ici : ils ne dépendent pas des
   * paramètres d'appel, et les rejouer à la lecture ferait vivre la même règle
   * à deux endroits — la classe de bug de `getOrdersForWindow`.
   */
  async getLiveRows(fromIso: string, toIso: string): Promise<OrdersSourceRow[]> {
    const rows = await this.conn
      .from('orders_flux_replica')
      .select('*')
      .where((q) => {
        q.where((w) =>
          w
            .whereIn('wiptyp', [1, 5])
            .andWhere('date_echeance', '>=', fromIso)
            .andWhere('date_echeance', '<=', toIso)
        ).orWhere((w) => w.where('wiptyp', 2).andWhere('date_echeance', '<=', toIso))
      })
    return (rows as ReplicaRow[]).map(toOwn)
  }
}

const ordersFluxReplicaRepository = new OrdersFluxReplicaRepository()
export default ordersFluxReplicaRepository
