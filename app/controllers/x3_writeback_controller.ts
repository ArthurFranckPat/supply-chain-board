import { HttpContext } from '@adonisjs/core/http'
import { getX3EnvConfig } from '#config/x3'
import {
  callObjectOperation,
  callQueryList,
  type ObjectKeyValue,
  type ObjectOperation,
} from '#app/x3/object-client'
import { callRunSubprog } from '#app/x3/run-client'

/**
 * Contrôleur d'EXPÉRIMENTATION du write-back X3 (issue #29).
 *
 * Expose les opérations CRUD objet du stub `CAdxWebServiceXmlCC` (read / save /
 * modify / delete / describe) derrière des routes de test, avec les credentials
 * de la session courante — chokepoint `getX3EnvConfig()` → `ctx.x3Credentials`
 * posé par `x3_context_middleware` (issue #13).
 *
 * ⚠️ Ces routes écrivent potentiellement dans X3 via la couche objet (validations
 * + transactions X3 applicables — pas de SQL brut). Elles restent un terrain de
 * jeu : cibler l'environnement TEST (login avec env=test), et verrouiller/retirer
 * une fois le write-back fiabilisé en production.
 */
export default class X3WritebackController {
  /** Résout les creds session + exécute l'opération objet. Centralise la réponse. */
  private async run(
    ctx: HttpContext,
    operation: ObjectOperation,
    publicName: string,
    keys: ObjectKeyValue[],
    objectXml: string,
  ) {
    const config = getX3EnvConfig()
    if (!config.user || !config.password) {
      return ctx.response.badRequest({
        ok: false,
        error: 'Identifiants X3 absents : connectez-vous (env + creds) avant le test.',
        env: config.pool,
      })
    }

    const result = await callObjectOperation(operation, publicName, config, keys, objectXml)

    return {
      ok: result.ok,
      status: result.status,
      operation,
      publicName,
      env: config.pool,
      resultXml: result.resultXml,
      messages: result.messages,
      error: result.error || null,
      // Terrain de test : la réponse SOAP brute aide à diagnostiquer les échecs
      // opaques (objet non publié, format de message inattendu, droits…).
      raw: result.raw,
    }
  }

  /** describe — description de l'objet publié (champs/blocs). Utile en Phase 0. */
  async describe(ctx: HttpContext) {
    const object = (ctx.request.input('object') || '').toString().trim().toUpperCase()
    if (!object) {
      return ctx.response.badRequest({ ok: false, error: 'object requis' })
    }
    return this.run(ctx, 'getDescription', object, [], '')
  }

  /** read — lit un enregistrement objet (récupère un XML-modèle à réutiliser). */
  async read(ctx: HttpContext) {
    const object = (ctx.request.input('object') || '').toString().trim().toUpperCase()
    const keys = parseKeys(ctx.request.input('keys'))
    if (!object || keys.length === 0) {
      return ctx.response.badRequest({
        ok: false,
        error: 'object + keys requis (ex. object=BPC&keys=BPCNUM:C001)',
      })
    }
    return this.run(ctx, 'read', object, keys, '')
  }

  /** save — crée un enregistrement objet. */
  async save(ctx: HttpContext) {
    const { object, objectXml } = ctx.request.only(['object', 'objectXml'])
    if (!object || !objectXml) {
      return ctx.response.badRequest({ ok: false, error: 'object + objectXml requis' })
    }
    return this.run(ctx, 'save', String(object).toUpperCase(), [], String(objectXml))
  }

  /** modify — met à jour un enregistrement objet existant (clés + XML partiel). */
  async modify(ctx: HttpContext) {
    const { object, keys, objectXml } = ctx.request.only(['object', 'keys', 'objectXml'])
    if (!object || !objectXml) {
      return ctx.response.badRequest({ ok: false, error: 'object + objectXml requis (keys recommandées)' })
    }
    return this.run(ctx, 'modify', String(object).toUpperCase(), parseKeys(keys), String(objectXml))
  }

  /** list (queryList) — liste les enregistrements d'un objet avec filtre optionnel. */
  async list(ctx: HttpContext) {
    const object = (ctx.request.input('object') || '').toString().trim().toUpperCase()
    const queryXml = (ctx.request.input('queryXml') || '<PARAM/>').toString().trim()
    const listSize = Math.min(parseInt(ctx.request.input('listSize') || '50', 10) || 50, 500)
    if (!object) {
      return ctx.response.badRequest({ ok: false, error: 'object requis' })
    }
    const config = getX3EnvConfig()
    if (!config.user || !config.password) {
      return ctx.response.badRequest({ ok: false, error: 'Identifiants X3 absents.', env: config.pool })
    }
    const result = await callQueryList(object, config, queryXml, listSize)
    return {
      ok: result.ok,
      status: result.status,
      operation: 'queryList',
      publicName: object,
      env: config.pool,
      resultXml: result.resultXml,
      messages: result.messages,
      error: result.error || null,
      raw: result.raw,
    }
  }

  /** run — exécute un SOUS-PROGRAMME publié (GOSUB), inputXml = <PARAM><FLD…>.
   * Pour tester FIRMSUGG (#31) et tout subprogram. Sortie = paramètres OUT (<FLD>). */
  async runSubprog(ctx: HttpContext) {
    const object = (ctx.request.input('object') || '').toString().trim()
    const inputXml = (ctx.request.input('objectXml') || '').toString().trim()
    if (!object || !inputXml) {
      return ctx.response.badRequest({ ok: false, error: 'object (publicName) + objectXml (inputXml) requis' })
    }
    const config = getX3EnvConfig()
    if (!config.user || !config.password) {
      return ctx.response.badRequest({ ok: false, error: 'Identifiants X3 absents.', env: config.pool })
    }
    const result = await callRunSubprog(object, config, inputXml)
    return {
      ok: result.ok,
      status: result.status,
      operation: 'run',
      publicName: object,
      env: config.pool,
      // Sortie subprogram : on sérialise les <FLD> de sortie pour affichage.
      resultXml: Object.keys(result.fields).length
        ? Object.entries(result.fields)
            .map(([k, v]) => `${k} = ${v}`)
            .join('\n')
        : '',
      messages: result.messages,
      error: result.error || null,
      raw: result.raw,
    }
  }

  /** delete — supprime un enregistrement objet. */
  async delete(ctx: HttpContext) {
    const object = (ctx.request.input('object') || '').toString().trim().toUpperCase()
    const keys = parseKeys(ctx.request.input('keys'))
    if (!object || keys.length === 0) {
      return ctx.response.badRequest({
        ok: false,
        error: 'object + keys requis (ex. object=BPC&keys=BPCNUM:TESTZ99)',
      })
    }
    return this.run(ctx, 'delete', object, keys, '')
  }
}

/** Accepte `keys` sous deux formes : "BPCNUM:C001,..." ou [{key,value}, ...]. */
function parseKeys(input: unknown): ObjectKeyValue[] {
  if (Array.isArray(input)) {
    return input
      .filter((k): k is Record<string, unknown> => !!k && typeof k === 'object')
      .map((k) => ({ key: String(k.key ?? ''), value: String(k.value ?? '') }))
      .filter((k) => k.key)
  }
  if (typeof input !== 'string') return []
  return input
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(':')
      return idx === -1
        ? { key: pair, value: '' }
        : { key: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim() }
    })
    .filter((k) => k.key)
}
