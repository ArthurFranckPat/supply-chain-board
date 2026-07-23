import { type HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'
import { getX3EnvConfig } from '#config/x3'
import { callRunSubprog } from '#app/x3/run-client'
import { X3SuggestionRepository } from '#app/repositories/suggestion_repository'
import printService, { docLabel } from '#services/print_service'

/**
 * Invalide les caches board après un write-back X3 (FIRMSUGG).
 *
 * K4 (audit sécu) : tous les namespaces sont GLOBAUX (cf. `board_dataset.ts:63`
 * `cache.namespace('board')` sans suffixe user) — le code précédent ciblait des
 * clés inexistantes (`board:user_${id}`) → aucun cache n'était invalidé → UI
 * stale → re-clic possible = double lancement d'OF. On purge tous les
 * namespaces impactés par un changement de statut OF (Ferme/Planifié/Suggéré) :
 *   - board / programme / suivi : vues listing OF
 *   - ruptures : couverture recalculée selon le pool OF fermes
 *   - charge : capacité consommée par les OFs fermes
 *   - engagement : allocation par poste impactée par les OFs lancés
 */
async function bustBoardCaches() {
  await Promise.all([
    cache.namespace('board').clear(),
    cache.namespace('programme').clear(),
    cache.namespace('suivi').clear(),
    cache.namespace('ruptures').clear(),
    cache.namespace('charge').clear(),
    cache.namespace('engagement').clear(),
  ])
}

/**
 * Affermissement d'un ordre X3 en OF ferme (issue #31).
 *
 * `POST /api/v1/planning/orders/:orderNum/firm` appelle le sous-programme publié
 * `ZSOAPFIRM`, qui pilote la fonction standard X3 **FUNMAUTR** (« Lancement
 * automatique ») scopée sur un ordre, headless.
 *
 * Fonctionne pour les DEUX statuts sources (le sous-programme X3 auto-détecte) :
 *   - suggestion (WIPSTA=3, n° SGAE…) → crée un nouvel OF ferme + consomme la
 *     suggestion (explosion nomenclature/gamme via transaction MFGMTSNUM=OF6).
 *   - OF planifié (WIPSTA=2, n° F…) → modifie l'OF existant vers Ferme.
 *
 * Pas de double appro (FUNMAUTR consomme/transforme nativement), pas de delete
 * séparé, batch-safe (pas de fenêtre IVISUGHOST contrairement à un `save` GESMFG).
 *
 * Le board ne porte que l'id de l'ordre ; on relit ORDERS (vue planning temps réel,
 * #32) pour le site (clé exigée par FUNMAUTR). Depuis #32, FUNMAUTR consommant la
 * suggestion dans ORDERS lui-même, aucune blacklist n'est plus nécessaire.
 */
export default class SuggestionFirmController {
  async firm(ctx: HttpContext) {
    const orderNum = (ctx.params.orderNum || ctx.params.sugNum || '').toString().trim()
    if (!orderNum) {
      return ctx.response.badRequest({ ok: false, error: 'orderNum requis' })
    }

    const config = getX3EnvConfig()
    if (!config.user || !config.password) {
      return ctx.response.unauthorized({
        ok: false,
        error: 'Identifiants X3 absents : connectez-vous avant l’affermissement.',
        env: config.pool,
      })
    }

    const repo = new X3SuggestionRepository()
    const keys = await repo.getFirmingKeys(orderNum)
    if (!keys) {
      return ctx.response.notFound({
        ok: false,
        error: `Ordre ${orderNum} introuvable ou non affermissable (déjà ferme ?).`,
      })
    }

    // Params groupés sous GRP1, ordre = publication FIRMSUGG
    // (WSUGNUM, WSTOFCY, WITMREF). Statut Ferme câblé dans le subprogram.
    const inputXml =
      `<PARAM>` +
      `<GRP ID="GRP1">` +
      `<FLD NAME="WSUGNUM">${escapeXml(keys.sugNum)}</FLD>` +
      `<FLD NAME="WSTOFCY">${escapeXml(keys.stofcy)}</FLD>` +
      `<FLD NAME="WITMREF">${escapeXml(keys.itmref)}</FLD>` +
      `</GRP>` +
      `</PARAM>`

    const result = await callRunSubprog('ZSOAPFIRM', config, inputXml)

    // Verdict : WMFGNUM rempli = succès ; WRETERMSG = message d'erreur sinon.
    const mfgNum = (result.fields.WMFGNUM ?? '').trim()
    const retErr = (result.fields.WRETERMSG ?? '').trim()
    const ok = result.ok && mfgNum !== ''

    if (!ok) {
      return ctx.response.unprocessableEntity({
        ok: false,
        sugNum: keys.sugNum,
        mfgNum: mfgNum || null,
        error:
          retErr ||
          result.error ||
          result.messages.map((m) => m.text).join(' · ') ||
          'Affermissement refusé par X3.',
        env: config.pool,
      })
    }

    // Write-back réussi : l'ordre a changé (statut/n°). On invalide les caches
    // globaux impactés pour que le prochain reload soit à jour (K4).
    // Inutile de blacklister la suggestion : depuis #32, la supply vient d'ORDERS
    // (temps réel) → FUNMAUTR y consomme la suggestion, elle disparaît d'elle-même.
    await bustBoardCaches()

    // --- Impression du dossier (issue #85, lot 3) ----------------------------
    // Affermir d'abord, imprimer ensuite : l'OF existe dans l'ERP quoi qu'il
    // arrive au papier. L'impression ne peut donc JAMAIS faire échouer cette
    // réponse — elle rend un verdict séparé, que l'écran affiche séparément.
    // Sans cette séparation, un « succès » global masquerait un atelier sans
    // papier, qui est l'état dangereux de l'issue.
    const batch = ctx.request.input('batch') === true || ctx.request.input('batch') === '1'
    let print: FirmPrintReport = {
      attempted: false,
      ok: false,
      deferred: batch,
      atelier: { code: '', label: '' },
      documents: [],
      error: '',
      skipped: '',
    }

    // Le déclenchement automatique est un réglage, pas une fatalité : imprimer
    // systématiquement sort du papier sur un affermissement d'essai. Décision
    // prise par le service, pour que le geste unitaire et le geste groupé ne
    // divergent jamais.
    const gate = await printService.shouldPrintOnFirm(batch)
    if (!gate.print) {
      print.skipped =
        gate.mode === 'off'
          ? 'Impression automatique désactivée dans les réglages.'
          : 'Impression automatique limitée à l’affermissement unitaire.'
      return {
        ok: true,
        sugNum: keys.sugNum,
        mfgNum,
        article: keys.itmref,
        site: keys.stofcy,
        env: config.pool,
        print,
      }
    }

    try {
      const folder = await printService.printFolder({
        ofNum: mfgNum,
        stofcy: keys.stofcy,
        itmref: keys.itmref,
        origin: 'firm',
        requestedBy: ctx.auth.user?.username ?? '',
        config,
        // Affermissement groupé : pas de suivi de tâche, sinon chaque OF paie
        // l'attente du verdict et le lot devient interminable. Les tirages sont
        // journalisés avec leur numéro de tâche, `print:reconcile` tranche.
        watchTimeoutMs: batch ? 0 : FIRM_WATCH_MS,
      })
      const docLabels = await printService.docLabels()
      print = {
        attempted: true,
        ok: folder.ok,
        deferred: batch,
        atelier: folder.atelier,
        documents: folder.documents.map((d) => ({
          docType: d.docType,
          label: docLabel(docLabels, d.docType),
          status: d.status,
          destCode: d.destCode,
          sandbox: d.sandbox,
          serverVerdict: d.serverVerdict,
          jobRank: d.jobRank,
          attempt: d.attempt,
          message: d.message,
          error: d.error || d.jobDetail,
        })),
        error: '',
        skipped: '',
      }
    } catch (e) {
      print.error = String(e)
    }

    return {
      ok: true,
      sugNum: keys.sugNum,
      mfgNum,
      article: keys.itmref,
      site: keys.stofcy,
      env: config.pool,
      /** Verdict d'impression — distinct du verdict d'affermissement. */
      print,
    }
  }
}

/** Fenêtre de suivi d'un tirage déclenché par un affermissement unitaire. */
const FIRM_WATCH_MS = 6000

interface FirmPrintReport {
  /** false = l'impression n'a même pas été tentée (erreur en amont). */
  attempted: boolean
  ok: boolean
  /** true = verdict différé (affermissement groupé) : les tirages sont partis, l'issue reste à lire. */
  deferred: boolean
  atelier: { code: string; label: string }
  documents: {
    docType: string
    label: string
    status: string
    destCode: string
    sandbox: boolean
    serverVerdict: string
    jobRank: number
    attempt: number
    message: string
    error: string
  }[]
  error: string
  /** Motif de non-impression quand le réglage l'a écartée (chaîne vide sinon). */
  skipped: string
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
