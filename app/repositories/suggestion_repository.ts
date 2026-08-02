import { X3Database } from '#app/x3/client/x3_database'
import replicaDb from '@adonisjs/lucid/services/db'
import replicaGate from '#services/replica_gate'

/**
 * Résolution des clés d'affermissement d'un ordre (issue #31).
 *
 * Depuis #32, les suggestions (WIPSTA=3) comme les OF fermes/planifiés (1/2) sont
 * lus dans la vue planning temps réel **ORDERS** (cf. `X3OfRepository`). Ce repo ne
 * garde qu'un point-lookup : retrouver le site d'un ordre depuis son numéro avant
 * l'appel au sous-programme d'affermissement (`FIRMSUGG` test · `ZSOAPFIRM` prod,
 * FUNMAUTR). Le sous-programme auto-détecte
 * le statut source ; le board n'a besoin que du site.
 *
 * L'ancienne source CBNDET (snapshot, drift post-affermissement) et la blacklist
 * `firmed_suggestions` sont supprimées — ORDERS est mis à jour immédiatement par
 * FUNMAUTR, une suggestion affermie en disparaît.
 *
 * ## Deux voies, un seul contrat (#105)
 *
 * `orders_flux_replica` mire la SOURCE `ORDERS` : la tranche WIPTYP=5 porte les
 * OF et suggestions. Le portail (`replicaGate.canRead`) tranche — réplique si
 * elle est fraîche et propre, X3 sinon. La réplique peut porter l'ordre SANS
 * site (lignes ingérées avant l'ajout de `stofcy`) : dans ce cas on ne devine
 * pas, on retombe sur X3 — affermir sur un site vide serait pire que l'appel
 * direct qu'on cherche à économiser.
 */
type RawRow = Record<string, string | null>

export interface SuggestionKeys {
  /** N° de l'ordre (VCRNUM : SGAE… suggestion ou F… OF ferme/planifié). */
  sugNum: string
  stofcy: string
  itmref: string
  qte: number
}

const X3_SQL = (num: string) => `
SELECT STOFCY_0 AS STOFCY, ITMREF_0 AS ARTICLE, RMNEXTQTY_0 AS QTE
FROM ORDERS
WHERE VCRNUM_0 = '${num}'
  AND WIPTYP_0 = 5
  AND WIPSTA_0 IN (2, 3)
`

export class X3SuggestionRepository {
  /**
   * Résout le site d'un ordre depuis son numéro — lu dans ORDERS (vue planning,
   * #32). Fonctionne pour une suggestion (WIPSTA=3) ou un OF ferme/planifié (1/2) :
   * le sous-programme X3 auto-détecte le statut source. Renvoie `null` si l'ordre
   * n'est pas affermissable (absent d'ORDERS, ou déjà ferme).
   */
  async getFirmingKeys(orderNum: string): Promise<SuggestionKeys | null> {
    const num = orderNum.trim()
    // VCRNUM X3 = alphanumérique (« SGAE… » / « F126-… ») : whitelist avant
    // toute interpolation SQL (pas de quote → pas d'injection).
    if (!num || !/^[A-Za-z0-9_-]+$/.test(num)) return null

    if (await replicaGate.canRead('orders_flux_replica')) {
      const keys = await this.fromReplica(num)
      // Présent en réplique MAIS sans site (ligne ingérée avant `stofcy`) :
      // indéterminé, on ne fabrique pas la clé — repli sur X3.
      if (keys) return keys
    }

    return this.fromX3(num)
  }

  /**
   * Point-lookup dans la tranche WIPTYP=5 d'`orders_flux_replica`.
   *
   * Publique — pas pour l'application, qui doit passer par `getFirmingKeys()` et
   * son portail, mais pour `replica:sync --compare` : c'est la seule façon de
   * confronter les deux voies, `getFirmingKeys()` ne rendant JAMAIS les deux.
   */
  async fromReplica(num: string): Promise<SuggestionKeys | null> {
    const found = await replicaDb
      .connection('replica')
      .from('orders_flux_replica')
      .select('vcrnum', 'stofcy', 'article', 'qte_restante')
      .where('wiptyp', 5)
      .andWhere('vcrnum', num)
      .whereIn('wipsta', [2, 3])
      .first()

    const stofcy = (found?.stofcy as string | null)?.trim() ?? ''
    const itmref = (found?.article as string | null)?.trim() ?? ''
    if (!found || !stofcy || !itmref) return null
    const qte = Number.parseFloat(String(found.qte_restante ?? '0')) || 0
    return { sugNum: num, stofcy, itmref, qte }
  }

  /** Point-lookup direct X3 — identique à l'avant. `num` est whitelisté
   *  (`/^[A-Za-z0-9_-]+$/` en amont) : pas de quote, pas d'injection.
   *  Publique pour la même raison que `fromReplica()` : `--compare`. */
  async fromX3(num: string): Promise<SuggestionKeys | null> {
    const x3db = new X3Database()
    try {
      const rows: RawRow[] = await x3db.raw(X3_SQL(num))
      const row = rows[0]
      if (!row) return null
      const stofcy = row.STOFCY?.trim() ?? ''
      const itmref = row.ARTICLE?.trim() ?? ''
      if (!stofcy || !itmref) return null
      const qte = Number.parseFloat(row.QTE ?? '0') || 0
      return { sugNum: num, stofcy, itmref, qte }
    } finally {
      await x3db.destroy()
    }
  }
}
