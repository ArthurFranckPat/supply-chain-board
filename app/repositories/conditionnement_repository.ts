import { X3Database } from '#app/x3/client/x3_database'
import {
  NB_MOUVEMENTS_STOJOU,
  type PaletteObservation,
} from '#app/domain/conditionnement_estimator'

/**
 * Article avec ses coefs de conditionnement référencés et son contexte opérationnel.
 * La requête ramène TOUS les articles actifs (complets ou non) — le filtrage sur
 * l'état des coefs se fait côté application selon le filtre choisi.
 */
export interface ArticleConditionnement {
  article: string
  designation: string
  /** Catégorie article (ITMMASTER.TCLCOD_0). */
  categorie: string | null
  /** Nb d'US par UC (ITMMASTER.PCUSTUCOE_0). null/0 si manquant. */
  pcuStuCoe: number | null
  /** Nb d'UC par palette (ITMMASTER.PCUSTUCOE_1). null/0 si manquant. */
  ucParPal: number | null
  /** Code fournisseur par défaut (ITMBPS.DEFBPSFLG_0 = 2). */
  codeFrnsr: string | null
  /** Nom fournisseur (BPSUPPLIER.BPSNAM_0). */
  nomFrnsr: string | null
  /** Dernière date d'entrée (STOJOU TRSTYP 3/5 la plus récente). ISO YYYY-MM-DD. */
  derniereEntree: string | null
  /** Type de la dernière entrée. */
  typeEntree: string | null
  /** Dernière date de sortie (STOJOU TRSTYP 4/6 la plus récente). ISO YYYY-MM-DD. */
  derniereSortie: string | null
  /** Type de la dernière sortie. */
  typeSortie: string | null
}

/**
 * Estimateur de US/palette par observation des emplacements et mouvements réels.
 *
 * Deux sources indépendantes, agrégées par article dans une Map<ITMREF, observations[]> :
 *
 * 1. **STOCK** (état présent) : les lignes de stock détaillé sur emplacement de
 *    palettisation (`SM*`). Chaque ligne = 1 palette stockée ; son `QTYSTU_0`
 *    (valeur absolue) = US/palette observés.
 *
 * 2. **STOJOU** (historique 6 mois) : les mouvements de rangement (`TRSTYP=7`) vers
 *    un emplacement `SM*`. Chaque mouvement = 1 palette rangée ; `|QTYSTU_0|` =
 *    US/palette. On restreint aux `LOC LIKE 'SM%'` car un `7` peut aussi pointer
 *    vers une zone transitoire (S9P, REC) qui n'est pas une palette stockée.
 *
 * Le SOAP Syracuse n'accepte ni COUNT(*) ni GROUP BY agrégé → on remonte les lignes
 * brutes et on agrège côté application (cf. expedition_repository, même motif).
 */

type RawRow = Record<string, string | null>

/**
 * Préfixe des emplacements de stockage palettisé (palette type, fiable).
 * Les `SM*` sont les emplacements de stockage ; leur qté reflète une palette
 * pleine type (sauf cas d'entamage, géré par la dominance côté estimateur).
 */
const LOC_STOCKAGE_PREFIX = 'SM'

/**
 * Emplacements de consommation (S3P, S4P, CLP, S9P…) : palette entamée au fil
 * des prélèvements → qté variable, NON fiable comme signal de palette type.
 * On les ramène pour les distinguer des SM* (l'estimateur ignore leur valeur
 * dans le consensus de dominance mais peut les utiliser comme présence).
 *
 * Pattern : `S` + un chiffre + `P` (S3P, S4P, S9P…) ou `CLP`.
 */
const LOC_CONSO_PATTERN = 'S_P' // LIKE 'S_P' + CLP géré séparément

/**
 * Nombre de rangements récents remontés par article (cf. `NB_MOUVEMENTS_STOJOU`
 * côté domaine, qui applique la règle). Le bornage se fait sur le NOMBRE de
 * mouvements, pas sur leur ancienneté : un article reçu pour la dernière fois il
 * y a deux ans reste estimable, alors que l'ancienne fenêtre glissante de 6 mois
 * l'excluait — précisément la population dont le référentiel est mal tenu.
 */
const NB_MOUVEMENTS = NB_MOUVEMENTS_STOJOU

const toNum = (v: string | null): number => {
  const n = Number.parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? Math.abs(n) : 0
}

/** Parse un coef numérique (null si absent/invalid), contrairement à toNum (abs→0). */
function toNumOrNull(v: string | null): number | null {
  const n = Number.parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : null
}

// ── Requêtes SQL ────────────────────────────────────────────────────────────

/**
 * STOCK : lignes sur emplacement de stockage (`SM*`) ou de consommation (`S*P` /
 * `CLP`), qté > 1. On ramène le `LOC_0` pour que l'estimateur distingue les deux
 * types : la dominance (consensus de valeur) ne porte QUE sur les `SM*` ; les
 * `S*P`/`CLP` (consommation) sont exclus du consensus car leur qté est variable.
 *
 * On exclut les qtés ≤ 1 (articles de paramétrage STOCK_CF, STOCK_PRODUIT… qui
 * ne représentent pas une vraie palette).
 */
const buildStockSql = () => `
SELECT ITMREF_0 AS ITMREF, LOC_0 AS LOC, ABS(QTYSTU_0) AS QTE
FROM STOCK
WHERE (LOC_0 LIKE '${LOC_STOCKAGE_PREFIX}%' OR LOC_0 LIKE '${LOC_CONSO_PATTERN}' OR LOC_0 = 'CLP')
  AND ABS(QTYSTU_0) > 1
ORDER BY ITMREF_0
`

/**
 * STOJOU : les `NB_MOUVEMENTS` derniers rangements de palette par article, DEPUIS
 * la zone de réception (`TRSTYP=7` AND `LOC='REC'`, qté négative = sortie de REC).
 *
 * La sortie de REC certifie qu'on range une palette issue d'une réception
 * fournisseur libérée du contrôle qualité — donc COMPLÈTE (le reliquat naît à la
 * consommation, pas à la réception). `ABS(QTYSTU_0)` = US/palette directement.
 *
 * **Fenêtrage par rang, pas par date.** Le `ROW_NUMBER` borne à N lignes par
 * article quelle que soit leur ancienneté : un article reçu pour la dernière fois
 * en 2023 reste estimable. Volume transféré : ~3 lignes/article (~600 au total),
 * du même ordre que l'ancien GROUP BY + STATS_MODE — donc pas de régression SOAP.
 *
 * Tri sur `CREDATTIM_0` (horodatage complet) et non `CREDAT_0` : les palettes
 * d'une même réception sont rangées le MÊME JOUR, une date seule ne les
 * départagerait pas et « les 3 derniers » deviendrait arbitraire.
 *
 * Le domaine (`estimerDepuisStojou`) applique la règle : ≥ 2 rangements
 * concordants → cette valeur ; sinon le plus récent, marqué 'faible'. L'ordre du
 * ORDER BY fait donc foi côté app — ne pas le retirer.
 */
const buildStojouSql = () => `
SELECT ITMREF, QTE
FROM (
  SELECT
    ITMREF_0 AS ITMREF,
    ABS(QTYSTU_0) AS QTE,
    ROW_NUMBER() OVER (PARTITION BY ITMREF_0 ORDER BY CREDATTIM_0 DESC) AS RN
  FROM STOJOU
  WHERE TRSTYP_0 = 7
    AND LOC_0 = 'REC'
    AND QTYSTU_0 < 0
    AND ABS(QTYSTU_0) > 1
)
WHERE RN <= ${NB_MOUVEMENTS}
ORDER BY ITMREF, RN
`

/**
 * Tous les articles actifs (ITMSTA_0=1) hors catégories PF/SF/Z/X, avec leurs
 * coefs de conditionnement (PCUSTUCOE_0/1) + fournisseur par défaut. Le filtrage
 * sur l'état des coefs se fait côté application.
 *
 * IMPORTANT PERF : les dernières entrée/sortie STOJOU sont récupérées SÉPARÉMENT
 * par `buildMouvementsRecentsSql` (ciblé sur les articles manquants seulement).
 * Les inclure ici via ROW_NUMBER() OVER rescannait tout STOJOU pour chaque
 * article = cold start 86s. La requête principale reste instantanée sans elles.
 *
 * Tri fournisseur puis article (regroupement pour le rattrapage).
 */
const buildArticlesSql = () => `
SELECT
    ITM.ITMREF_0 AS ITMREF,
    ITM.ITMDES1_0 AS ITMDES1,
    ITM.TCLCOD_0 AS CATEGORIE,
    ITM.PCUSTUCOE_0 AS PCU_STU_COE,
    ITM.PCUSTUCOE_1 AS UC_PAR_PAL,
    ITP.BPSNUM_0 AS BPSNUM,
    BPS.BPSNAM_0 AS BPSNAM
FROM ITMMASTER ITM
LEFT JOIN ITMBPS ITP ON ITP.ITMREF_0 = ITM.ITMREF_0 AND ITP.DEFBPSFLG_0 = 2
LEFT JOIN BPSUPPLIER BPS ON BPS.BPSNUM_0 = ITP.BPSNUM_0
WHERE ITM.ITMSTA_0 = 1
  AND ITM.TCLCOD_0 NOT LIKE 'PF%'
  AND ITM.TCLCOD_0 NOT LIKE 'SF%'
  AND ITM.TCLCOD_0 NOT LIKE 'Z%'
  AND ITM.TCLCOD_0 NOT LIKE 'X%'
ORDER BY ITP.BPSNUM_0 ASC, ITM.ITMREF_0 ASC
`

/**
 * Dernières entrée/sortie STOJOU pour une liste d'articles donnée, via
 * ROW_NUMBER() OVER. Ciblé sur les articles au coef manquant (passés en clause IN)
 * pour limiter le scan STOJOU — calculer ces dates pour TOUS les articles
 * (incluant les complets) est inutile au rattrapage et coûteux.
 *
 * Découpe en batches (BATCH_SIZE) car la clause IN + SOAP Syracuse limite la
 * taille de requête. Tri par article pour faciliter le rapprochement côté app.
 */
const BATCH_SIZE = 200
const buildMouvementsRecentsSql = (articles: string[]) => `
SELECT ITMREF_0 AS ITMREF,
    MAX(CASE WHEN TRSTYP_0 IN (3, 5) THEN IPTDAT_0 END) AS LST_ENTREE,
    MAX(CASE WHEN TRSTYP_0 IN (3, 5) THEN TRSTYP_0 END) AS TYP_ENTREE_NUM,
    MAX(CASE WHEN TRSTYP_0 IN (4, 6) THEN IPTDAT_0 END) AS LST_SORTIE,
    MAX(CASE WHEN TRSTYP_0 IN (4, 6) THEN TRSTYP_0 END) AS TYP_SORTIE_NUM
FROM STOJOU
WHERE TRSTYP_0 IN (3, 5, 4, 6)
  AND ITMREF_0 IN (${articles.map((a) => `'${a}'`).join(', ')})
GROUP BY ITMREF_0
`

/** Parse une date X3 (DD-MMM-YY) → ISO YYYY-MM-DD, ou null. */
function parseX3DateToIso(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null
  const m = /^(\d{2})-([A-Z]{3})-(\d{2,4})$/i.exec(raw.trim())
  if (!m) return null
  const mois: Record<string, string> = {
    JAN: '01',
    FEB: '02',
    MAR: '03',
    APR: '04',
    MAY: '05',
    JUN: '06',
    JUL: '07',
    AUG: '08',
    SEP: '09',
    OCT: '10',
    NOV: '11',
    DEC: '12',
  }
  const mm = mois[m[2]!.toUpperCase()]
  if (!mm) return null
  const an = m[3]!.length === 2 ? `20${m[3]}` : m[3]!
  return `${an}-${mm}-${m[1]}`
}

// ── Repository ──────────────────────────────────────────────────────────────

export class ConditionnementRepository {
  /**
   * Observations de palette par article, depuis STOCK (source 'STOCK').
   * Retourne une Map article → PaletteObservation[] (toutes source 'STOCK').
   */
  async getStockSrmParArticle(): Promise<Map<string, PaletteObservation[]>> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildStockSql())
    } finally {
      await db.destroy()
    }
    return aggregate(rows, 'STOCK')
  }

  /**
   * Les `NB_MOUVEMENTS_STOJOU` derniers rangements de palette par article, source
   * 'STOJOU'. **Ordre du plus récent au plus ancien** (ORDER BY RN) — le domaine
   * s'appuie dessus pour son repli « valeur du mouvement le plus récent ».
   */
  async getStojouRangements(): Promise<Map<string, PaletteObservation[]>> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildStojouSql())
    } finally {
      await db.destroy()
    }
    return aggregate(rows, 'STOJOU')
  }

  /**
   * Les deux sources en parallèle, au même grain : des observations brutes que le
   * domaine transforme en estimation (consensus SM* pour STOCK, concordance des N
   * derniers rangements pour STOJOU). Aucune règle métier en SQL.
   */
  async getObservations(): Promise<{
    stock: Map<string, PaletteObservation[]>
    stojou: Map<string, PaletteObservation[]>
  }> {
    // Promise.allSettled : STOCK (lignes brutes, ZSOAPSQL O(n²) sur ~45k lignes)
    // peut timeout tant que le fix 4GL (commit 0f7e68a) n'est pas déployé côté
    // ERP. Un Promise.all jetterait aussi STOJOU (borné à 3 lignes/article par le
    // ROW_NUMBER, donc léger) → la factory échouait, le cache restait froid,
    // chaque requête retryait. Ici on dégrade vers STOJOU seul : le cache se
    // remplit, la page marche, et le SWR retryera STOCK au prochain TTL (2h) —
    // donc dès que le fix ERP sera posé, on récupère les deux sources sans rien
    // déployer côté app.
    const [stockR, stojouR] = await Promise.allSettled([
      this.getStockSrmParArticle(),
      this.getStojouRangements(),
    ])
    // ponytail: console.warn — pas de DI logger dans les repos ; le preheat
    // provider log déjà l'erreur via la factory bentocache, ce warn précise
    // juste la dégradation (STOCK absent → fallback STOJOU partout).
    if (stockR.status === 'rejected') {
      console.warn(
        '[conditionnement] STOCK indispo — dégradation vers STOJOU seul :',
        stockR.reason instanceof Error ? stockR.reason.message : stockR.reason
      )
    }
    return {
      stock: stockR.status === 'fulfilled' ? stockR.value : new Map(),
      stojou: stojouR.status === 'fulfilled' ? stojouR.value : new Map(),
    }
  }

  /**
   * Tous les articles actifs hors PF/SF/Z/X, avec coefs de conditionnement
   * (PCUSTUCOE_0/1) + fournisseur par défaut. SANS les dernières entrée/sortie
   * (récupérées séparément par `getMouvementsRecents` pour ne scanner STOJOU que
   * sur les articles manquants). Tri fournisseur puis article.
   */
  async getArticles(): Promise<ArticleConditionnement[]> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildArticlesSql())
    } finally {
      await db.destroy()
    }
    return rows.map((row) => ({
      article: row.ITMREF?.trim() ?? '',
      designation: row.ITMDES1?.trim() ?? '',
      categorie: row.CATEGORIE?.trim() || null,
      pcuStuCoe: toNumOrNull(row.PCU_STU_COE),
      ucParPal: toNumOrNull(row.UC_PAR_PAL),
      codeFrnsr: row.BPSNUM?.trim() || null,
      nomFrnsr: row.BPSNAM?.trim() || null,
      derniereEntree: null,
      typeEntree: null,
      derniereSortie: null,
      typeSortie: null,
    }))
  }

  /**
   * Dernières entrée/sortie STOJOU pour une liste d'articles, via GROUP BY +
   * MAX(CASE) (plus léger que ROW_NUMBER). Découpe en batches côté app car SOAP
   * Syracuse limite la taille de requête. Retourne une Map article → mouvements.
   *
   * À n'appeler que sur les articles au coef manquant (les complets n'ont pas
   * besoin du contexte mouvement pour le rattrapage) — sinon on rescanne STOJOU
   * pour rien (= le cold start 86s qu'on corrige).
   */
  async getMouvementsRecents(articles: string[]): Promise<
    Map<
      string,
      {
        derniereEntree: string | null
        typeEntree: string | null
        derniereSortie: string | null
        typeSortie: string | null
      }
    >
  > {
    const out = new Map<
      string,
      {
        derniereEntree: string | null
        typeEntree: string | null
        derniereSortie: string | null
        typeSortie: string | null
      }
    >()
    if (articles.length === 0) return out
    // Découpe en batches de BATCH_SIZE pour respecter la limite SOAP Syracuse,
    // puis les exécute avec une CONCURRENCE LIMITÉE à MAX_CONCURRENCY — le pool
    // de connexions X3 a max 4 slots, lancer 7 batches en Promise.all pur sature
    // le pool → timeout "operation timed out". On plafonne à 3 (sous le max 4,
    // en gardant 1 slot de marge pour les autres requêtes concurrentes).
    const MAX_CONCURRENCY = 3
    const db = new X3Database()
    try {
      const batches: string[][] = []
      for (let i = 0; i < articles.length; i += BATCH_SIZE) {
        batches.push(articles.slice(i, i + BATCH_SIZE))
      }
      // Exécution avec concurrence limitée : lance MAX_CONCURRENCY batches à la
      // fois, attend qu'un se libère avant d'en lancer un autre.
      const resultats: RawRow[][] = []
      for (let i = 0; i < batches.length; i += MAX_CONCURRENCY) {
        const chunk = batches.slice(i, i + MAX_CONCURRENCY)
        const rows = await Promise.all(chunk.map((b) => db.raw(buildMouvementsRecentsSql(b))))
        resultats.push(...rows)
      }
      for (const rows of resultats) {
        for (const row of rows) {
          const article = row.ITMREF?.trim()
          if (!article) continue
          out.set(article, {
            derniereEntree: parseX3DateToIso(row.LST_ENTREE),
            typeEntree: libelleTypeMvt(row.TYP_ENTREE_NUM),
            derniereSortie: parseX3DateToIso(row.LST_SORTIE),
            typeSortie: libelleTypeMvt(row.TYP_SORTIE_NUM),
          })
        }
      }
    } finally {
      await db.destroy()
    }
    return out
  }
}

/** Mappe un code TRSTYP (3/5 entrée, 4/6 sortie) vers un libellé lisible. */
function libelleTypeMvt(raw: string | null): string | null {
  switch (raw?.trim()) {
    case '3':
      return 'Reception fournisseur'
    case '5':
      return 'Entree OF'
    case '4':
      return 'Livraison client'
    case '6':
      return 'Sortie OF'
    default:
      return null
  }
}

/** Détecte si un emplacement LOC est de stockage (SM*) ou de consommation (S*P/CLP). */
function typeLoc(loc: string | null | undefined): 'stockage' | 'conso' | null {
  if (!loc) return null
  const l = loc.trim().toUpperCase()
  if (l.startsWith(LOC_STOCKAGE_PREFIX)) return 'stockage'
  // S*P (S3P, S4P, S9P…) : 1 lettre S, 1 chiffre, P final. + CLP.
  if (/^S\dP$/.test(l) || l === 'CLP') return 'conso'
  return null
}

/** Agrège les lignes brutes en Map<article, PaletteObservation[]> pour une source. */
function aggregate(rows: RawRow[], source: 'STOCK' | 'STOJOU'): Map<string, PaletteObservation[]> {
  const byArticle = new Map<string, PaletteObservation[]>()
  for (const row of rows) {
    const article = row.ITMREF?.trim()
    if (!article) continue
    const us = toNum(row.QTE)
    if (!(us > 1)) continue
    const arr = byArticle.get(article) ?? []
    // Pour STOCK, on taggue le type d'emplacement (stockage vs conso) pour que
    // l'estimateur ne fasse porter le consensus que sur les SM*.
    if (source === 'STOCK') {
      const type = typeLoc(row.LOC)
      if (type) arr.push({ us, source, typeEmplacement: type })
    } else {
      arr.push({ us, source })
    }
    byArticle.set(article, arr)
  }
  return byArticle
}
