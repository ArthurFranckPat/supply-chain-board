import { DateTime } from 'luxon'
import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

export type OtdMode = 'demandee' | 'acceptee'

const DATE_FIELD: Record<OtdMode, string> = {
  demandee: 'X4HSHIDAT_0',
  acceptee: 'SHIDAT_0',
}

/**
 * Tolérance de ponctualité, définie UNE fois : une expédition due un vendredi
 * reste ponctuelle jusqu'au lundi (+3 j), un samedi jusqu'au lundi (+2 j),
 * sinon +1 j. Partagée par le KPI du dashboard et l'état hebdomadaire export —
 * deux expressions distinctes produiraient deux taux OTD contradictoires.
 */
const toleranceSql = (dateExpr: string) =>
  `(${dateExpr} + CASE WHEN TO_CHAR(${dateExpr}, 'D') = '5' THEN 3 WHEN TO_CHAR(${dateExpr}, 'D') = '6' THEN 2 ELSE 1 END)`

/** Une livraison existe vraiment (X3 remplit les dates vides à 1600-01-01). */
const LIVRAISON_REELLE = `MAX(DEL.MAX_SHIDAT) > TO_DATE('16000101','YYYYMMDD')`

/** Jointure livraisons : date d'expédition réelle la plus tardive par ligne. */
const JOIN_LIVRAISONS = `
LEFT JOIN (
  SELECT L.SOHNUM_0, L.SOPLIN_0, L.SOQSEQ_0, MAX(D.SHIDAT_0) AS MAX_SHIDAT
  FROM SDELIVERYD L
  JOIN SDELIVERY D ON D.SDHNUM_0 = L.SDHNUM_0
  GROUP BY L.SOHNUM_0, L.SOPLIN_0, L.SOQSEQ_0
) DEL ON DEL.SOHNUM_0 = Q.SOHNUM_0 AND DEL.SOPLIN_0 = Q.SOPLIN_0 AND DEL.SOQSEQ_0 = Q.SOQSEQ_0`

const buildSql = (fromStr: string, toStr: string, mode: OtdMode) => {
  const f = DATE_FIELD[mode]
  const ponctuel = `(MAX(DEL.MAX_SHIDAT) <= ${toleranceSql(`Q.${f}`)} AND ${LIVRAISON_REELLE})`
  return `
SELECT
  Q.SOHNUM_0,
  H.BPCNAM_0,
  Q.ITMREF_0,
  ROO.WST_0       AS POSTE_DE_CHARGE,
  Q.${f}          AS DATE_EXP,
  SUM(Q.QTY_0)    AS QTE_COMMANDEE,
  SUM(Q.DLVQTY_0) AS QTE_TOTAL_LIVREE,
  CASE WHEN SUM(Q.DLVQTY_0) >= SUM(Q.QTY_0) THEN 'OUI' ELSE 'NON' END AS EST_COMPLET,
  CASE WHEN ${ponctuel} THEN 'OUI' ELSE 'NON' END AS EST_PONCTUEL,
  CASE
    WHEN (SUM(Q.DLVQTY_0) >= SUM(Q.QTY_0) AND ${ponctuel}) THEN 'OUI'
    ELSE 'NON'
  END AS EST_OTIF
FROM SORDERQ Q
INNER JOIN SORDER H ON H.SOHNUM_0 = Q.SOHNUM_0
INNER JOIN ITMMASTER I ON I.ITMREF_0 = Q.ITMREF_0
${JOIN_LIVRAISONS}
LEFT JOIN ROUOPE ROO
  ON ROO.FCY_0 = H.STOFCY_0
  AND ROO.ITMREF_0 = I.ITMREF_0
  AND ROO.ROUALT_0 = 1
  AND ROO.OPENUM_0 = (
    SELECT MIN(ROO1.OPENUM_0) FROM ROUOPE ROO1
    WHERE ROO1.FCY_0 = H.STOFCY_0 AND ROO1.ITMREF_0 = I.ITMREF_0 AND ROO1.ROUALT_0 = 1
  )
WHERE I.ITMSTA_0 = 1
AND Q.${f} BETWEEN TO_DATE('${fromStr}','YYYYMMDD') AND TO_DATE('${toStr}','YYYYMMDD')
GROUP BY Q.SOHNUM_0, H.BPCNAM_0, Q.ITMREF_0, ROO.WST_0, Q.X4HDEMDLVD_0, Q.${f}
ORDER BY Q.${f} DESC
`
}

/**
 * État hebdomadaire export : toutes les lignes DUES sur la fenêtre, livrées ou
 * non, avec les deux dates d'engagement et la date d'expédition réelle.
 *
 * Diffère volontairement de `buildSql` : celui-ci ne rend qu'un verdict OTIF
 * agrégé, alors que l'état du lundi doit nommer chaque retard, sa profondeur et
 * son reliquat. La règle de ponctualité, elle, est la même (`toleranceSql`).
 *
 * Périmètre export = `H.BPCCRY_0 <> 'FR'` (pays du client donneur d'ordre).
 * Ce n'est PAS le filtre `__export__` du dashboard, qui écarte les clients dont
 * le nom contient « aldes » — deux questions différentes, ne pas les confondre.
 */
const buildExportSql = (fromStr: string, toStr: string) => `
SELECT
  Q.SOHNUM_0,
  H.BPCORD_0,
  H.BPCNAM_0,
  H.BPCCRY_0,
  H.ORDDAT_0          AS DATE_COMMANDE,
  Q.ITMREF_0,
  I.ITMDES1_0         AS DESIGNATION,
  Q.SHIDAT_0          AS DATE_ACCEPTEE,
  Q.X4HSHIDAT_0       AS DATE_DEMANDEE,
  MAX(DEL.MAX_SHIDAT) AS DATE_REELLE,
  SUM(Q.QTY_0)        AS QTE_COMMANDEE,
  SUM(Q.DLVQTY_0)     AS QTE_LIVREE,
  ${toleranceSql('Q.SHIDAT_0')} AS DATE_LIMITE,
  CASE WHEN ${LIVRAISON_REELLE} THEN 'OUI' ELSE 'NON' END AS EST_EXPEDIE,
  CASE
    WHEN (MAX(DEL.MAX_SHIDAT) <= ${toleranceSql('Q.SHIDAT_0')} AND ${LIVRAISON_REELLE})
      THEN 'OUI' ELSE 'NON'
  END AS EST_PONCTUEL
FROM SORDERQ Q
INNER JOIN SORDER H ON H.SOHNUM_0 = Q.SOHNUM_0
INNER JOIN ITMMASTER I ON I.ITMREF_0 = Q.ITMREF_0
${JOIN_LIVRAISONS}
WHERE I.ITMSTA_0 = 1
AND H.BPCCRY_0 <> 'FR'
AND Q.SHIDAT_0 BETWEEN TO_DATE('${fromStr}','YYYYMMDD') AND TO_DATE('${toStr}','YYYYMMDD')
GROUP BY Q.SOHNUM_0, H.BPCORD_0, H.BPCNAM_0, H.BPCCRY_0, H.ORDDAT_0,
         Q.ITMREF_0, I.ITMDES1_0, Q.SHIDAT_0, Q.X4HSHIDAT_0
ORDER BY H.BPCCRY_0, H.BPCNAM_0, Q.SHIDAT_0
`

type RawRow = Record<string, string | null>

export interface OtdLigneDtl {
  numCommande: string
  client: string
  article: string
  posteDeCharge: string | null
  dateExpHisto: string
  qteCmde: number
  qteLivree: number
  estComplet: boolean
  estPonctuel: boolean
}

export interface OtdClientSummary {
  name: string
  count: number
}

export interface OtdKpi {
  label: string
  mode: OtdMode
  nbTotal: number
  nbOtif: number
  tauxOtif: number
  lignesNon: OtdLigneDtl[]
  clients: OtdClientSummary[]
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function toInt(v: string | null): number {
  return Number.parseInt(v ?? '0', 10) || 0
}

/** Normalise comme le front (fold) : sans accents ni casse, pour un filtre client cohérent. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function fmtDate(raw: string | null): string {
  const d = parseX3Date(raw)
  if (!d) return '—'
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function lastWorkdayBefore(date: Date): Date {
  let d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1))
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1))
  }
  return d
}

/** Périodes OTD à calculer pour le jour de référence (UTC). */
export function resolveOtdPeriods(ref: Date): Array<{ from: Date; to: Date; label: string }> {
  const y = ref.getUTCFullYear()
  const m = ref.getUTCMonth()
  const dom = ref.getUTCDate()
  const dow = ref.getUTCDay()

  const isFirstWorkdayOfMonth = (() => {
    if (dow === 0 || dow === 6) return false
    for (let d = 1; d < dom; d++) {
      const wd = new Date(Date.UTC(y, m, d)).getUTCDay()
      if (wd !== 0 && wd !== 6) return false
    }
    return true
  })()

  if (isFirstWorkdayOfMonth) {
    const lastWorkday = lastWorkdayBefore(ref)
    const firstOfLastMonth = new Date(Date.UTC(y, m - 1, 1))
    const lastOfLastMonth = new Date(Date.UTC(y, m, 0))
    return [
      { from: lastWorkday, to: lastWorkday, label: 'J-1' },
      { from: firstOfLastMonth, to: lastOfLastMonth, label: 'M-1' },
    ]
  }

  if (dow === 1) {
    const friday = new Date(Date.UTC(y, m, dom - 3))
    const lastWeekMon = new Date(Date.UTC(y, m, dom - 7))
    const lastWeekSun = new Date(Date.UTC(y, m, dom - 1))
    return [
      { from: friday, to: friday, label: 'J-1' },
      { from: lastWeekMon, to: lastWeekSun, label: 'S-1' },
    ]
  }

  const yesterday = new Date(Date.UTC(y, m, dom - 1))
  return [{ from: yesterday, to: yesterday, label: 'J-1' }]
}

/**
 * X3 remplit les dates non saisies avec des sentinelles (1600-01-01,
 * 1899-12-31, 31/12/1999 selon les champs). Une sentinelle comparée à une vraie
 * date rendrait « antérieure » n'importe quelle ligne : la date demandée n'est
 * exploitable que dans une plage plausible.
 */
function dateExploitable(d: Date | null): Date | null {
  if (!d) return null
  const annee = d.getUTCFullYear()
  return annee >= 2000 && annee <= 2100 ? d : null
}

/** Une ligne DUE sur la semaine, telle qu'elle part dans l'état du lundi. */
export interface EtatExportLigne {
  numCommande: string
  codeClient: string
  client: string
  pays: string
  article: string
  designation: string
  dateCommande: Date | null
  dateAcceptee: Date | null
  dateDemandee: Date | null
  /** Fin de tolérance : au-delà, la ligne est en retard. */
  dateLimite: Date | null
  dateReelle: Date | null
  qteCommandee: number
  qteLivree: number
  estComplet: boolean
  /** Verdict, trois états et trois seulement (cf. skill etat-commandes-export). */
  statut: 'ponctuel' | 'retard_livre' | 'retard_ouvert'
  /**
   * Jours de retard comptés depuis la FIN de tolérance, pas depuis la date
   * acceptée : une expédition due vendredi et partie lundi est ponctuelle et
   * affiche 0, pas 3. Pour une ligne jamais partie, le compteur court jusqu'à
   * aujourd'hui.
   */
  joursRetard: number
  /** Date demandée antérieure à l'acceptée : délai négocié, retard commercial. */
  delaiNegocie: boolean
}

export interface EtatExportSemaine {
  isoAnnee: number
  isoSemaine: number
  du: Date
  au: Date
  lignes: EtatExportLigne[]
  nbDues: number
  nbPonctuelles: number
  tauxPonctualite: number
}

/** Semaine ISO (lundi → dimanche) précédant la date de référence. */
export function resolveSemainePrecedente(ref: Date): {
  from: Date
  to: Date
  isoAnnee: number
  isoSemaine: number
} {
  // Ancrage explicite sur l'heure de l'usine, pas sur le fuseau du process :
  // `TZ=UTC` est imposé dans le .env, donc « local » vaut UTC, et un lundi à
  // 00h30 en France est encore dimanche en UTC — l'état du lundi porterait
  // alors sur la semaine d'avant.
  const aParis = DateTime.fromJSDate(ref, { zone: 'Europe/Paris' })
  const jour = new Date(Date.UTC(aParis.year, aParis.month - 1, aParis.day))
  // getUTCDay : 0 = dimanche. Recul jusqu'au lundi de la semaine en cours, puis -7.
  const decalageLundi = (jour.getUTCDay() + 6) % 7
  const to = new Date(jour.getTime() - (decalageLundi + 1) * 86_400_000)
  const from = new Date(to.getTime() - 6 * 86_400_000)

  // Numéro ISO : le jeudi de la semaine porte l'année.
  const jeudi = new Date(from.getTime() + 3 * 86_400_000)
  const premierJanvier = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 1))
  const isoSemaine = Math.ceil(((jeudi.getTime() - premierJanvier.getTime()) / 86_400_000 + 1) / 7)

  return { from, to, isoAnnee: jeudi.getUTCFullYear(), isoSemaine }
}

export class OtdRepository {
  async getOtd(
    from: Date,
    to: Date,
    label: string,
    mode: OtdMode,
    client?: string
  ): Promise<OtdKpi> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildSql(toYYYYMMDD(from), toYYYYMMDD(to), mode))
    } finally {
      await db.destroy()
    }

    // Dénombrement de tous les clients sur la période AVANT filtrage
    const clientCounts = new Map<string, number>()
    for (const row of rows) {
      const name = row.BPCNAM_0?.trim() || 'Inconnu'
      clientCounts.set(name, (clientCounts.get(name) ?? 0) + 1)
    }
    const clients: OtdClientSummary[] = Array.from(clientCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

    // Filtre client optionnel : on restreint les lignes AVANT le calcul du KPI
    // (taux, nbOtif, nbTotal) pour que le chiffre OTD reflète le client filtré.
    // "__export__" sélectionne tous les clients autres qu'ALDES.
    let scoped = rows
    if (client) {
      const trimmed = client.trim()
      if (trimmed === '__export__' || trimmed.toLowerCase() === 'export') {
        scoped = rows.filter((r) => !fold(String(r.BPCNAM_0 ?? '')).includes('aldes'))
      } else {
        const needle = fold(trimmed)
        scoped = rows.filter((r) => fold(String(r.BPCNAM_0 ?? '')).includes(needle))
      }
    }

    let nbOtif = 0
    const lignesNon: OtdLigneDtl[] = []

    for (const row of scoped) {
      if (row.EST_OTIF === 'OUI') {
        nbOtif++
      } else {
        lignesNon.push({
          numCommande: row.SOHNUM_0?.trim() ?? '',
          client: row.BPCNAM_0?.trim() ?? '',
          article: row.ITMREF_0?.trim() ?? '',
          posteDeCharge: row.POSTE_DE_CHARGE?.trim() || null,
          dateExpHisto: fmtDate(row.DATE_EXP),
          qteCmde: toInt(row.QTE_COMMANDEE),
          qteLivree: toInt(row.QTE_TOTAL_LIVREE),
          estComplet: row.EST_COMPLET === 'OUI',
          estPonctuel: row.EST_PONCTUEL === 'OUI',
        })
      }
    }

    const nbTotal = scoped.length
    const tauxOtif = nbTotal > 0 ? Math.round((nbOtif / nbTotal) * 1000) / 10 : 0

    return { label, mode, nbTotal, nbOtif, tauxOtif, lignesNon, clients }
  }

  /**
   * État des lignes export DUES sur la fenêtre — livrées ou non.
   *
   * Ne filtre ni les lignes soldées ni les annulées (`SORDERQ.SOQSTA_0`) : le
   * KPI du dashboard ne le fait pas non plus, et écarter une ligne soldée
   * effacerait des retards réels. Angle mort assumé, à trancher sur données.
   */
  async getEtatExport(from: Date, to: Date): Promise<EtatExportSemaine> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildExportSql(toYYYYMMDD(from), toYYYYMMDD(to)))
    } finally {
      await db.destroy()
    }

    const aujourdhui = new Date()
    const lignes: EtatExportLigne[] = rows.map((row) => {
      const dateAcceptee = parseX3Date(row.DATE_ACCEPTEE)
      const dateDemandee = parseX3Date(row.DATE_DEMANDEE)
      const dateLimite = parseX3Date(row.DATE_LIMITE)
      const dateReelle = row.EST_EXPEDIE === 'OUI' ? parseX3Date(row.DATE_REELLE) : null
      const qteCommandee = toInt(row.QTE_COMMANDEE)
      const qteLivree = toInt(row.QTE_LIVREE)
      const estPonctuel = row.EST_PONCTUEL === 'OUI'

      const finTolerance = dateLimite ?? dateAcceptee
      const reference = dateReelle ?? aujourdhui
      const joursRetard =
        estPonctuel || !finTolerance
          ? 0
          : Math.max(0, Math.ceil((reference.getTime() - finTolerance.getTime()) / 86_400_000))

      return {
        numCommande: row.SOHNUM_0?.trim() ?? '',
        codeClient: row.BPCORD_0?.trim() ?? '',
        client: row.BPCNAM_0?.trim() ?? '',
        pays: row.BPCCRY_0?.trim() ?? '',
        article: row.ITMREF_0?.trim() ?? '',
        designation: row.DESIGNATION?.trim() ?? '',
        dateCommande: parseX3Date(row.DATE_COMMANDE),
        dateAcceptee,
        dateDemandee,
        dateLimite,
        dateReelle,
        qteCommandee,
        qteLivree,
        estComplet: qteLivree >= qteCommandee,
        statut: estPonctuel ? 'ponctuel' : dateReelle ? 'retard_livre' : 'retard_ouvert',
        joursRetard,
        delaiNegocie: (() => {
          const demandee = dateExploitable(dateDemandee)
          const acceptee = dateExploitable(dateAcceptee)
          return Boolean(demandee && acceptee && demandee.getTime() < acceptee.getTime())
        })(),
      }
    })

    const nbDues = lignes.length
    const nbPonctuelles = lignes.filter((l) => l.statut === 'ponctuel').length
    const { isoAnnee, isoSemaine } = resolveSemainePrecedente(new Date(to.getTime() + 86_400_000))

    return {
      isoAnnee,
      isoSemaine,
      du: from,
      au: to,
      lignes,
      nbDues,
      nbPonctuelles,
      tauxPonctualite: nbDues > 0 ? Math.round((nbPonctuelles / nbDues) * 1000) / 10 : 0,
    }
  }
}
