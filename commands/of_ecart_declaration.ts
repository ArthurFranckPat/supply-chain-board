import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { X3Database } from '#app/x3/client/x3_database'
import { getX3EnvConfig } from '#config/x3'
import { X3OperationRepository } from '#repositories/operation_repository'
import {
  computeAvancement,
  ecartDeclarationQty,
  estEcartDeclaration,
} from '#app/domain/of_avancement'

/**
 * `node ace of:ecart-declaration` — mesure les OF où la déclaration PF (CPLQTY)
 * dépasse le pointage de la dernière opération intermédiaire (issue #95).
 *
 * Pool par défaut : ORDERS live (WIPTYP=5, reste > 0, DONE > 0).
 * `--all-open` : MFGITM ouverts (MFGSTA < 3, CPLQTY > 0) — capture les cas déjà
 * soldés côté ORDERS mais encore ouverts administrativement (ex. F326-02036).
 *
 * Pas de JOIN X3 : OF puis MFGOPE chunké côté app (même pattern que le board).
 */
export default class OfEcartDeclaration extends BaseCommand {
  static commandName = 'of:ecart-declaration'
  static description =
    'Liste les OF dont la déclaration PF dépasse le pointage ops intermédiaires (issue #95)'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({
    description: 'Scanne MFGITM ouverts (MFGSTA<3) au lieu du pool ORDERS live',
  })
  declare allOpen: boolean

  async run() {
    const cfg = getX3EnvConfig()
    const source = this.allOpen ? 'MFGITM ouverts' : 'ORDERS live (reste>0, DONE>0)'
    this.logger.info(`Env X3 : ${cfg.pool} · source : ${source}`)

    const num = (v: unknown) => Number.parseFloat(String(v ?? '0')) || 0
    const db = new X3Database()
    try {
      const sql = this.allOpen
        ? `SELECT MFGNUM_0 AS NUM, ITMREF_0 AS ARTICLE, EXTQTY_0 AS LAUNCHED,
                  CPLQTY_0 AS DONE, RMNEXTQTY_0 AS REMAIN
           FROM MFGITM
           WHERE MFGSTA_0 < 3 AND CPLQTY_0 > 0`
        : `SELECT VCRNUM_0 AS NUM, ITMREF_0 AS ARTICLE, EXTQTY_0 AS LAUNCHED,
                  CPLQTY_0 AS DONE, RMNEXTQTY_0 AS REMAIN
           FROM ORDERS
           WHERE WIPTYP_0 = 5
             AND WIPSTA_0 IN (1, 2, 3)
             AND RMNEXTQTY_0 > 0
             AND CPLQTY_0 > 0`

      const rows = (await db.raw(sql)) as Record<string, string | null>[]
      const ofs = rows
        .map((r) => ({
          numOf: (r.NUM ?? '').trim(),
          article: (r.ARTICLE ?? '').trim(),
          launched: num(r.LAUNCHED),
          done: num(r.DONE),
          remain: num(r.REMAIN),
        }))
        .filter((o) => o.numOf && o.done > 0)

      this.logger.info(`${ofs.length} OF avec déclaration > 0`)

      const ops = await new X3OperationRepository().getOperations(ofs.map((o) => o.numOf))
      const avancementByOf = computeAvancement(ops)

      let indecidables = 0
      let sansAvancement = 0
      const ecarts: {
        numOf: string
        article: string
        done: number
        pointe: number
        ecart: number
      }[] = []

      for (const of of ofs) {
        const av = avancementByOf.get(of.numOf)
        if (!av) {
          sansAvancement++
          continue
        }
        if (av.nbOperations <= 0 || !av.estDebuté) {
          indecidables++
          continue
        }
        if (!estEcartDeclaration(av, of.done)) continue
        ecarts.push({
          numOf: of.numOf,
          article: of.article,
          done: of.done,
          pointe: av.qtyRealisee,
          ecart: ecartDeclarationQty(av, of.done),
        })
      }

      ecarts.sort((a, b) => b.ecart - a.ecart)

      this.logger.info(
        `Scannés ${ofs.length} · indécidables (mono-op / non débuté) ${indecidables} · sans MFGOPE ${sansAvancement} · écarts ${ecarts.length}`
      )

      if (ecarts.length === 0) {
        this.logger.success('Aucun écart déclaration > pointage')
        return
      }

      const totalEcart = ecarts.reduce((s, e) => s + e.ecart, 0)
      this.logger.warning(`Σ pièces sur-déclarées : ${totalEcart}`)
      this.logger.info('numOf | article | DONE | pointé | écart')
      for (const e of ecarts) {
        this.logger.info(`${e.numOf} | ${e.article} | ${e.done} | ${e.pointe} | +${e.ecart}`)
      }
    } finally {
      await db.destroy()
    }
  }
}
