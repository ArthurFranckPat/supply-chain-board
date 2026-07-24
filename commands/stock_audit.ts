import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import { CombinedOrdersRepository } from '#app/repositories/combined_orders_repository'
import { getX3EnvConfig } from '#config/x3'

/**
 * `node ace stock:audit ARTICLE` — reconstitution hebdomadaire du stock d'un
 * article sur 52 semaines, semaine par semaine, avec les lignes STOJOU brutes
 * des semaines dont le stock reconstruit sort sous zéro.
 *
 * Le stock physique ne peut pas être négatif : une reconstruction négative
 * trahit un écart de réconciliation STOJOU↔ITMMVT. Le contrôle de cohérence
 * global (Σ journal historique vs stock actuel) mesure le sens et l'ampleur
 * de l'écart : net historique > stock actuel = journal sur-compté (faux
 * négatifs) ; net historique < stock actuel = stock initial non journalé
 * (reprise de données, cas standard).
 */
export default class StockAudit extends BaseCommand {
  static commandName = 'stock:audit'
  static description =
    'Reconstitution hebdo du stock + réconciliation STOJOU↔ITMMVT (diagnostic des négatifs)'

  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Référence article (ex. 11022900)' })
  declare article: string

  async run() {
    const SITE = 'AE1'
    const article = this.article.trim().replace(/'/g, "''")
    const cfg = getX3EnvConfig()
    this.logger.info(`Env X3 : ${cfg.pool} · article : ${this.article.trim()} · site : ${SITE}`)

    const refDate = new Date()
    const to = new Date(
      Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate())
    )
    const from = new Date(to.getTime() - 52 * 7 * 86_400_000)
    const fromStr = from.toISOString().slice(0, 10).replace(/-/g, '')
    const num = (v: unknown) => Number.parseFloat(String(v ?? '0')) || 0

    const db = new X3Database()
    try {
      // --- Base : stock actuel + PMP ---
      const base = (await db.raw(
        `SELECT M.ITMDES1_0 AS DESIGNATION, V.PHYSTO_0 AS PHYSTO, V.CTLSTO_0 AS CTLSTO, V.AVC_0 AS PMP
         FROM ITMMASTER M
         INNER JOIN ITMMVT V ON V.ITMREF_0 = M.ITMREF_0 AND V.STOFCY_0 = '${SITE}'
         WHERE M.ITMREF_0 = '${article}'`
      )) as Record<string, string | null>[]
      if (base.length === 0) {
        this.logger.error(`Article absent de ITMMVT sur ${SITE}`)
        this.exitCode = 1
        return
      }
      const b = base[0]
      const stkNow = num(b.PHYSTO) + num(b.CTLSTO)
      this.logger.info(`Désignation : ${(b.DESIGNATION ?? '').trim()}`)
      this.logger.info(
        `Stock actuel : PHYSTO ${num(b.PHYSTO)} + CTLSTO ${num(b.CTLSTO)} = ${stkNow} · PMP ${num(b.PMP)}`
      )

      // --- Cohérence globale : Σ journal (toute l'histoire) vs stock actuel ---
      const hist = ((await db.raw(
        `SELECT SUM(CASE WHEN QTYSTU_0 > 0 THEN QTYSTU_0 ELSE 0 END) AS TOTIN,
                SUM(CASE WHEN QTYSTU_0 < 0 THEN ABS(QTYSTU_0) ELSE 0 END) AS TOTOUT,
                SUM(QTYSTU_0) AS NETALL
         FROM STOJOU WHERE STOFCY_0 = '${SITE}' AND ITMREF_0 = '${article}'`
      )) as Record<string, string | null>[])[0]
      const netAll = num(hist?.NETALL)
      const ecart = netAll - stkNow
      this.logger.info(
        `Σ journal historique : entrées ${num(hist?.TOTIN)} · sorties ${num(hist?.TOTOUT)} · net ${netAll}`
      )
      this.logger.info(
        ecart > 0
          ? `Écart +${Math.round(ecart * 100) / 100} : le journal SUR-COMPTE le net de ${Math.round(ecart * 100) / 100} vs le stock réel → faux négatifs possibles en reconstruction.`
          : `Écart ${Math.round(ecart * 100) / 100} : stock initial non journalé (reprise de données) — cas standard.`
      )

      // --- Entrées de la projection 12 mois (diagnostic besoins/ressources) ---
      const isoL = (d: Date) => d.toISOString().slice(0, 10)
      const horizon = new Date(to.getTime() + 52 * 7 * 86_400_000)
      const flows = await new CombinedOrdersRepository().fetchArticleFutureFlows(
        this.article.trim(),
        isoL(refDate),
        isoL(horizon)
      )
      const byTyp = new Map<number, { n: number; qty: number }>()
      for (const f of flows) {
        const t = byTyp.get(f.wiptyp) ?? { n: 0, qty: 0 }
        t.n += 1
        t.qty += f.qty
        byTyp.set(f.wiptyp, t)
      }
      const fmtTyp = (t: number) => {
        const x = byTyp.get(t)
        return x ? `${x.n} lignes, Σ ${Math.round(x.qty * 100) / 100}` : '0 lignes'
      }
      this.logger.info(`Projection — demande client (WIPTYP 1) : ${fmtTyp(1)}`)
      this.logger.info(`Projection — réceptions attendues (WIPTYP 2) : ${fmtTyp(2)}`)
      this.logger.info(`Projection — OF ouverts (WIPTYP 5) : ${fmtTyp(5)}`)

      // Besoin composant : lignes MFGMAT restant à sortir sur OF ouverts
      // (fermes/planifiés) démarrant avant l'horizon — la demande réelle des
      // articles achetés/semi-finis, absente de WIPTYP 1.
      const matRows = (await db.raw(
        `SELECT (M.RETQTY_0 - M.USEQTY_0) AS QTY, O.STRDAT_0 AS STRDAT
         FROM MFGMAT M
         INNER JOIN ORDERS O ON O.VCRNUM_0 = M.MFGNUM_0 AND O.WIPTYP_0 = 5
         WHERE M.ITMREF_0 = '${article}'
           AND (M.RETQTY_0 - M.USEQTY_0) > 0
           AND O.WIPSTA_0 IN (1, 2)
           AND O.STRDAT_0 <= TO_DATE('${isoL(horizon).replace(/-/g, '')}','YYYYMMDD')`
      )) as Record<string, string | null>[]
      const matQty = matRows.reduce((s, r) => s + num(r.QTY), 0)
      this.logger.info(
        `Projection — besoin composant OF (MFGMAT) : ${matRows.length} lignes, Σ ${Math.round(matQty * 100) / 100}`
      )

      // --- Lignes brutes du journal sur la fenêtre 52 semaines ---
      let rows: Record<string, string | null>[]
      try {
        rows = await db.raw(
          `SELECT IPTDAT_0, QTYSTU_0, LOT_0, MVTDES_0, ORIGINNUM_0, USR_0
           FROM STOJOU WHERE STOFCY_0 = '${SITE}' AND ITMREF_0 = '${article}'
             AND IPTDAT_0 >= TO_DATE('${fromStr}','YYYYMMDD') ORDER BY IPTDAT_0`
        )
      } catch {
        this.logger.warning('Colonnes MVTDES_0/ORIGINNUM_0/USR_0 refusées — repli IPTDAT/QTYSTU/LOT')
        rows = await db.raw(
          `SELECT IPTDAT_0, QTYSTU_0, LOT_0
           FROM STOJOU WHERE STOFCY_0 = '${SITE}' AND ITMREF_0 = '${article}'
             AND IPTDAT_0 >= TO_DATE('${fromStr}','YYYYMMDD') ORDER BY IPTDAT_0`
        )
      }
      this.logger.info(`${rows.length} lignes de journal depuis le ${fromStr}`)

      // --- Agrégation par semaine ISO ---
      type Week = { inn: number; out: number; net: number; lines: typeof rows }
      const weeks = new Map<string, Week>()
      for (const r of rows) {
        const d = parseX3Date(r.IPTDAT_0)
        if (!d) continue
        const key = periodKey(d)
        const w = weeks.get(key) ?? { inn: 0, out: 0, net: 0, lines: [] }
        const q = num(r.QTYSTU_0)
        if (q > 0) w.inn += q
        else w.out += -q
        w.net += q
        w.lines.push(r)
        weeks.set(key, w)
      }

      // --- Périodes de référence (lundis, 53 semaines) ---
      const toMonday = (d: Date) => {
        const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
        m.setUTCDate(m.getUTCDate() + 1 - (m.getUTCDay() || 7))
        return m
      }
      const periods: Array<{ key: string; date: Date }> = []
      let cur = toMonday(from)
      const end = toMonday(to)
      while (cur.getTime() <= end.getTime()) {
        periods.push({ key: periodKey(cur), date: new Date(cur) })
        cur = new Date(cur.getTime() + 7 * 86_400_000)
      }

      // --- Rembobinage (même méthode que StockValuationRepository) ---
      const toKey = periods[periods.length - 1]?.key ?? ''
      let postRef = 0
      for (const [key, w] of weeks) if (key > toKey) postRef += w.net
      const anchor = stkNow - postRef
      this.logger.info(`Mouvements postérieurs à la fenêtre : ${postRef} → ancre de départ ${anchor}`)

      const closes = new Map<string, number>()
      const negWeeks: string[] = []
      let running = 0
      for (let i = periods.length - 1; i >= 0; i--) {
        const close = anchor - running
        closes.set(periods[i].key, close)
        if (close < -0.005) negWeeks.push(periods[i].key)
        const w = weeks.get(periods[i].key)
        if (w) running += w.net
      }

      // --- Table hebdomadaire ---
      this.logger.info('')
      this.logger.info('semaine       entree     sortie        net    stock_fin')
      for (const p of periods) {
        const w = weeks.get(p.key)
        const close = Math.round((closes.get(p.key) ?? 0) * 100) / 100
        const flag = close < 0 ? '   ⚠ NÉGATIF' : ''
        this.logger.info(
          `${p.key}   ${String(w?.inn ?? 0).padStart(8)}   ${String(w?.out ?? 0).padStart(8)}   ${String(w?.net ?? 0).padStart(8)}   ${String(close).padStart(10)}${flag}`
        )
      }

      // --- Lignes brutes des semaines négatives ---
      if (negWeeks.length === 0) {
        this.logger.success('Reconstitution toujours ≥ 0 sur la fenêtre.')
        return
      }
      this.logger.warning(`Semaines sous zéro : ${negWeeks.sort().join(', ')}`)
      for (const key of negWeeks.sort()) {
        const w = weeks.get(key)
        this.logger.info('')
        this.logger.info(
          `── ${key} · stock_fin reconstruit ${Math.round((closes.get(key) ?? 0) * 100) / 100} ──`
        )
        if (!w) {
          this.logger.info('  (aucun mouvement cette semaine — le négatif vient des semaines suivantes)')
          continue
        }
        for (const l of w.lines) {
          const d = parseX3Date(l.IPTDAT_0)
          const date = d ? d.toISOString().slice(0, 10) : String(l.IPTDAT_0)
          const lot = (l.LOT_0 ?? '').trim() || '—'
          const des = (l.MVTDES_0 ?? '').trim()
          const origin = (l.ORIGINNUM_0 ?? '').trim()
          const usr = (l.USR_0 ?? '').trim()
          this.logger.info(
            `  ${date}  ${String(num(l.QTYSTU_0)).padStart(9)}  lot ${lot}  ${des}  ${origin}  ${usr}`
          )
        }
      }
    } finally {
      await db.destroy()
    }
  }
}

/** Clé de semaine ISO (lundi) — identique à stock_valuation_repository. */
function periodKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((tmp.getTime() - yearStart.getTime()) / 86_400_000 / 7) + 1
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}
