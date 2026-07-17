/**
 * Tools custom exposés au runtime Pi.
 *
 * Barrière sécu : ce module ne doit **jamais** enregistrer bash/read/write/edit.
 * Étape 2 : 4 primitifs supply (getVerdict, descendreBOM, getPromise, listerRetardsPrevus)
 * + ping (smoke).
 */

import { Type } from 'typebox'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'
import {
  descendreBOM,
  getPromise,
  getVerdict,
  listerRetardsPrevus,
} from '#services/agent/primitives'

function toolResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    details: payload as Record<string, unknown>,
  }
}

/**
 * Tool minimal pour valider le runtime (gardé en smoke + debug).
 */
export const pingTool = defineTool({
  name: 'ping',
  label: 'Ping',
  description:
    'Smoke-test du runtime agent. Renvoie { pong: true }. À utiliser uniquement pour valider la connectivité.',
  parameters: Type.Object({
    msg: Type.Optional(Type.String({ description: 'Message écho optionnel' })),
  }),
  execute: async (_toolCallId, params) => {
    const payload = {
      pong: true as const,
      msg: params.msg ?? null,
      source: 'ping' as const,
    }
    return toolResult(payload)
  },
})

export const getVerdictTool = defineTool({
  name: 'getVerdict',
  label: 'Verdict OF',
  description:
    "Verdict photo de rupture d'un OF (moteur unique rupture-engine). " +
    'Indique si OF faisable maintenant, source des besoins (MFGMAT/NOMENCLATURE), ' +
    'et les composants manquants directs. Citation : [getVerdict: OF xxx faisable/rupture].',
  parameters: Type.Object({
    numOf: Type.String({ description: "N° d'OF (ex. MFG-…)" }),
  }),
  execute: async (_id, params) => toolResult(await getVerdict(params.numOf)),
})

export const descendreBOMTool = defineTool({
  name: 'descendreBOM',
  label: 'Descendre BOM',
  description:
    "Descente récursive de la BOM d'un OF (RecursiveDiagnosticChecker). " +
    'Identifie la VRAIE racine bloquante (feuille manquante ou OF SE à lancer). ' +
    'Plus lourd que getVerdict — utiliser quand on veut la chaîne causale. ' +
    'Citation : [descendreBOM: …].',
  parameters: Type.Object({
    numOf: Type.String({ description: "N° d'OF à diagnostiquer" }),
  }),
  execute: async (_id, params) => toolResult(await descendreBOM(params.numOf)),
})

export const getPromiseTool = defineTool({
  name: 'getPromise',
  label: 'Date promesse CTP',
  description:
    "Date au plus tôt (Capable-to-Promise) pour un couple article/quantité. " +
    'Retourne mode optimiste + engageante, chemin critique et facteur limitant. ' +
    'Citation : [getPromise: article qté → date engageante].',
  parameters: Type.Object({
    article: Type.String({ description: 'Code article X3' }),
    quantity: Type.Number({ description: 'Quantité demandée (> 0)' }),
    from: Type.Optional(
      Type.String({ description: 'Date de départ ISO YYYY-MM-DD (défaut = aujourd\'hui)' })
    ),
  }),
  execute: async (_id, params) =>
    toolResult(
      await getPromise({
        article: params.article,
        quantity: params.quantity,
        from: params.from,
      })
    ),
})

export const listerRetardsPrevusTool = defineTool({
  name: 'listerRetardsPrevus',
  label: 'Retards prévus',
  description:
    'Liste les demandes clients dont la date promesse engageante (CTP) dépasse la date besoin, ' +
    "dans l'horizon donné. Tri par retard décroissant. Cap 40 lignes évaluées. " +
    'Citation : [listerRetardsPrevus: N retards / horizon Xj].',
  parameters: Type.Object({
    horizonDays: Type.Optional(
      Type.Number({ description: 'Horizon calendaire en jours (1–90, défaut 14)' })
    ),
    article: Type.Optional(Type.String({ description: 'Filtre code article exact' })),
    client: Type.Optional(Type.String({ description: 'Filtre client (sous-chaîne)' })),
    from: Type.Optional(
      Type.String({ description: 'Début horizon ISO YYYY-MM-DD (défaut = aujourd\'hui)' })
    ),
  }),
  execute: async (_id, params) =>
    toolResult(
      await listerRetardsPrevus({
        horizonDays: params.horizonDays,
        article: params.article,
        client: params.client,
        from: params.from,
      })
    ),
})

/** Ensemble de tools actifs pour l'étape courante du build. */
export function buildAgentTools(): ToolDefinition[] {
  return [
    getVerdictTool,
    descendreBOMTool,
    getPromiseTool,
    listerRetardsPrevusTool,
    pingTool,
  ]
}

/** Noms allowlistés — à passer à `createAgentSession({ tools })`. */
export function agentToolNames(tools: ToolDefinition[] = buildAgentTools()): string[] {
  return tools.map((t) => t.name)
}
