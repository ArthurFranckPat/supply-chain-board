import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import { CombinedOrdersRepository } from '#app/repositories/combined_orders_repository'
import { loadStockArticleDetail } from '#services/stock_detail_loader'
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
      const hist = (
        (await db.raw(
          `SELECT SUM(CASE WHEN QTYSTU_0 > 0 THEN QTYSTU_0 ELSE 0 END) AS TOTIN,
                SUM(CASE WHEN QTYSTU_0 < 0 THEN ABS(QTYSTU_0) ELSE 0 END) AS TOTOUT,
                SUM(QTYSTU_0) AS NETALL
         FROM STOJOU WHERE STOFCY_0 = '${SITE}' AND ITMREF_0 = '${article}'`
        )) as Record<string, string | null>[]
      )[0]
      const netAll = num(hist?.NETALL)
      const ecart = netAll - stkNow
      // Entrées/sorties BRUTES ici (lignes du journal, sans nettage par
      // document) : ce contrôle porte sur le net, seul invariant qui doit
      // réconcilier avec ITMMVT. Les totaux bruts sont très supérieurs aux flux
      // physiques — la table hebdo plus bas, elle, est nettée.
      this.logger.info(
        `Σ journal historique (brut) : entrées ${num(hist?.TOTIN)} · sorties ${num(hist?.TOTOUT)} · net ${netAll}`
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
      const byKind = new Map<string, { n: number; qty: number }>()
      for (const f of flows) {
        const t = byKind.get(f.kind) ?? { n: 0, qty: 0 }
        t.n += 1
        t.qty += f.qty
        byKind.set(f.kind, t)
      }
      const fmtKind = (k: string) => {
        const x = byKind.get(k)
        return x ? `${x.n} lignes, Σ ${Math.round(x.qty * 100) / 100}` : '0 lignes'
      }
      this.logger.info(`Projection — demande client (WIPTYP 1) : ${fmtKind('demande')}`)
      this.logger.info(`Projection — besoin matière (WIPTYP 6) : ${fmtKind('composant')}`)
      this.logger.info(`Projection — réceptions achat (WIPTYP 2) : ${fmtKind('reception')}`)
      this.logger.info(`Projection — production OF (WIPTYP 5) : ${fmtKind('of')}`)
      // Un CBN équilibre l'offre sur la demande : deux totaux du même ordre de
      // grandeur sont la signature d'une lecture correcte d'ORDERS. Un écart
      // de plusieurs ordres trahit une nature manquante (issue #88).
      const somme = (...kinds: string[]) => kinds.reduce((t, k) => t + (byKind.get(k)?.qty ?? 0), 0)
      this.logger.info(
        `Projection — Σ besoins ${Math.round(somme('demande', 'composant'))} · Σ ressources ${Math.round(somme('reception', 'of'))}`
      )

      // --- Paramètres et indicateurs tels que la sheet les affiche ---
      // Passe par le vrai loader : ce bloc vérifie le chemin de code servi à
      // l'UI, pas une reconstitution parallèle qui pourrait diverger.
      const { detail } = await loadStockArticleDetail({ article: this.article.trim() })
      if (detail) {
        const l = detail.logistique
        const i = detail.indicateurs
        const opt = (v: number | null, suffixe = '') =>
          v === null ? '—' : `${Math.round(v * 100) / 100}${suffixe}`
        this.logger.info('')
        this.logger.info(
          `Logistique : fournisseur ${l.fournisseurNom ?? '—'} (${l.fournisseurCode ?? '—'}) · délai ${opt(l.delaiReapproJours, ' j')} · lot éco ${opt(l.lotEconomique)} · lot techn. ${opt(l.lotTechnique)} · stock sécu ${opt(l.stockSecurite)}`
        )
        this.logger.info(
          `Historique : sorties 12 m ${Math.round(i.sorties12m)} sur ${i.joursFenetre} j · CMJ ${opt(i.cmj)} · couverture au régime moyen ${opt(i.couvertureJours, ' j')} · stock moyen ${Math.round(i.stockMoyen)} · rotation ${opt(i.rotation, ' ×')}`
        )
        // Les deux couvertures côte à côte : c'est le seul endroit où c'est
        // utile (l'écart entre elles mesure à quel point la demande n'est pas
        // plate). L'UI n'affiche que la prospective, pour éviter la confusion.
        if (i.couvertureProspectiveJours === null) {
          this.logger.info(
            'Prospectif : aucune rupture sur l’horizon de projection, réceptions exclues.'
          )
        } else {
          const dateFr = i.ruptureDateIso ? i.ruptureDateIso.split('-').reverse().join('/') : '—'
          this.logger.info(
            `Prospectif : rupture le ${dateFr} (${i.ruptureSemaine}), soit ${i.couvertureProspectiveJours} j — besoins réels déroulés, réceptions exclues.`
          )
          if (i.cmj !== null && i.couvertureJours !== null && i.couvertureJours > 0) {
            // L'écart entre les deux couvertures mesure la platitude de la
            // demande. Hors bande, la moyenne glissante ne décrit plus le
            // régime à venir et ne doit pas servir à décider.
            const ecartRegime = Math.round((i.couvertureProspectiveJours / i.couvertureJours) * 100)
            const horsBande = ecartRegime > 120 || ecartRegime < 80
            this.logger.info(
              `  Écart avec le régime moyen : ${ecartRegime} %${horsBande ? ' — la demande n’est PAS plate, la CMJ historique ne décrit pas le régime à venir.' : ' — demande à peu près plate, les deux lectures concordent.'}`
            )
          }
        }
        if (i.ratioProspectifDelai !== null) {
          const pct = Math.round(i.ratioProspectifDelai * 100)
          this.logger[i.ratioProspectifDelai < 1 ? 'warning' : 'info'](
            `Couverture prospective vs délai de réappro : ${pct} % — ${i.ratioProspectifDelai < 1 ? 'commander maintenant N’ARRIVE PLUS à temps.' : 'commander maintenant arrive encore à temps.'}`
          )
        }
      }

      // --- Lignes brutes du journal sur la fenêtre 52 semaines ---
      let rows: Record<string, string | null>[]
      try {
        rows = await db.raw(
          `SELECT IPTDAT_0, QTYSTU_0, LOT_0, VCRTYP_0, VCRNUM_0, MVTDES_0, ORIGINNUM_0, USR_0
           FROM STOJOU WHERE STOFCY_0 = '${SITE}' AND ITMREF_0 = '${article}'
             AND IPTDAT_0 >= TO_DATE('${fromStr}','YYYYMMDD') ORDER BY IPTDAT_0`
        )
      } catch {
        this.logger.warning(
          'Colonnes MVTDES_0/ORIGINNUM_0/USR_0 refusées — repli IPTDAT/QTYSTU/LOT/VCR'
        )
        rows = await db.raw(
          `SELECT IPTDAT_0, QTYSTU_0, LOT_0, VCRTYP_0, VCRNUM_0
           FROM STOJOU WHERE STOFCY_0 = '${SITE}' AND ITMREF_0 = '${article}'
             AND IPTDAT_0 >= TO_DATE('${fromStr}','YYYYMMDD') ORDER BY IPTDAT_0`
        )
      }
      this.logger.info(`${rows.length} lignes de journal depuis le ${fromStr}`)

      // --- Agrégation par semaine ISO ---
      // Entrées/sorties nettées PAR DOCUMENT avant d'être ventilées, même
      // règle que buildFluxSql : STOJOU est un journal d'écritures, une même
      // opération y laisse des lignes qui se compensent (reclassements TRSTYP
      // 7/8/9 en paires ±X, contrepassations intra-réception). Sommer les
      // lignes positives compterait des entrées qui n'ont jamais eu lieu.
      // `net` reste la somme brute — il est insensible au nettage, et c'est lui
      // qui porte la reconstruction du stock.
      type Week = { inn: number; out: number; net: number; lines: typeof rows }
      const weeks = new Map<string, Week>()
      const docNet = new Map<string, Map<string, number>>()
      for (const r of rows) {
        const d = parseX3Date(r.IPTDAT_0)
        if (!d) continue
        const key = periodKey(d)
        const w = weeks.get(key) ?? { inn: 0, out: 0, net: 0, lines: [] }
        const q = num(r.QTYSTU_0)
        w.net += q
        w.lines.push(r)
        weeks.set(key, w)

        const doc = `${r.VCRTYP_0 ?? ''}|${r.VCRNUM_0 ?? ''}`
        let perDoc = docNet.get(key)
        if (!perDoc) docNet.set(key, (perDoc = new Map()))
        perDoc.set(doc, (perDoc.get(doc) ?? 0) + q)
      }
      for (const [key, perDoc] of docNet) {
        const w = weeks.get(key)!
        for (const net of perDoc.values()) {
          if (net > 0) w.inn += net
          else w.out += -net
        }
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
      this.logger.info(
        `Mouvements postérieurs à la fenêtre : ${postRef} → ancre de départ ${anchor}`
      )

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
          this.logger.info(
            '  (aucun mouvement cette semaine — le négatif vient des semaines suivantes)'
          )
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
