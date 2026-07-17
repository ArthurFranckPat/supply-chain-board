/**
 * Tools custom exposés au runtime Pi.
 *
 * Barrière sécu : ce module ne doit **jamais** enregistrer bash/read/write/edit.
 * Execute charge `primitives` en lazy pour ne pas tirer Lucid/board au boot CLI
 * (smoke, eval mocks importent agent_service sans X3).
 */

import { Type } from 'typebox'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'

function toolResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    details: payload as Record<string, unknown>,
  }
}

async function primitives() {
  return import('#services/agent/primitives')
}

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
  execute: async (_id, params) => {
    const p = await primitives()
    return toolResult(await p.getVerdict(params.numOf))
  },
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
  execute: async (_id, params) => {
    const p = await primitives()
    return toolResult(await p.descendreBOM(params.numOf))
  },
})

export const getPromiseTool = defineTool({
  name: 'getPromise',
  label: 'Date promesse CTP',
  description:
    'Date au plus tôt (Capable-to-Promise) pour un couple article/quantité. ' +
    'Retourne mode optimiste + engageante, chemin critique et facteur limitant. ' +
    'Citation : [getPromise: article qté → date engageante].',
  parameters: Type.Object({
    article: Type.String({ description: 'Code article X3' }),
    quantity: Type.Number({ description: 'Quantité demandée (> 0)' }),
    from: Type.Optional(
      Type.String({
        description: "Date de départ ISO YYYY-MM-DD (défaut = aujourd'hui)",
      })
    ),
  }),
  execute: async (_id, params) => {
    const p = await primitives()
    return toolResult(
      await p.getPromise({
        article: params.article,
        quantity: params.quantity,
        from: params.from,
      })
    )
  },
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
      Type.String({
        description: "Début horizon ISO YYYY-MM-DD (défaut = aujourd'hui)",
      })
    ),
  }),
  execute: async (_id, params) => {
    const p = await primitives()
    return toolResult(
      await p.listerRetardsPrevus({
        horizonDays: params.horizonDays,
        article: params.article,
        client: params.client,
        from: params.from,
      })
    )
  },
})

async function extras() {
  return import('#services/agent/primitives_extra')
}

export const rafraichirTool = defineTool({
  name: 'rafraichir',
  label: 'Rafraîchir caches',
  description:
    'Invalide les caches board → prochain accès = live X3. Coûteux. Citation [rafraichir: …].',
  parameters: Type.Object({
    article: Type.Optional(
      Type.String({ description: 'Article (informatif ; v1 = reload global)' })
    ),
  }),
  execute: async (_id, params) => {
    const e = await extras()
    return toolResult(await e.rafraichir(params.article))
  },
})

export const simulerDecalageTool = defineTool({
  name: 'simulerDecalage',
  label: 'Simuler scénario',
  description:
    'Simule des mutations de plan en RAM (evaluatePlanDiff) : shift_of, shift_demand, inject_demand, suspend_supply. ' +
    'Retourne stats avant/après + top dégradations. Ne persiste pas. Citation [simulerDecalage: …].',
  parameters: Type.Object({
    mutations: Type.Array(Type.Any(), {
      description:
        'PlanMutation[] : {type:"shift_of",numOf,dateFin?}|{type:"shift_demand",numCommande,date}|{type:"inject_demand",id,article,quantity,date}|{type:"suspend_supply",article}',
    }),
    from: Type.Optional(Type.String()),
    to: Type.Optional(Type.String()),
    horizonDays: Type.Optional(Type.Number()),
  }),
  execute: async (_id, params) => {
    const e = await extras()
    return toolResult(
      await e.simulerDecalage({
        mutations: params.mutations as never,
        from: params.from,
        to: params.to,
        horizonDays: params.horizonDays,
      })
    )
  },
})

export const enregistrerScenarioTool = defineTool({
  name: 'enregistrerScenario',
  label: 'Enregistrer scénario',
  description:
    'Persiste un scénario (explicit) dans scenario_store. Citation [enregistrerScenario: id=…].',
  parameters: Type.Object({
    nom: Type.String(),
    description: Type.Optional(Type.String()),
    mutations: Type.Array(Type.Any()),
  }),
  execute: async (_id, params) => {
    const e = await extras()
    return toolResult(
      await e.enregistrerScenario({
        nom: params.nom,
        description: params.description,
        mutations: params.mutations as never,
      })
    )
  },
})

export const getEngagementPosteTool = defineTool({
  name: 'getEngagementPoste',
  label: 'Engagement poste',
  description:
    'Liste les OF fermes engagés sur un poste de charge + commandes liées. Citation [getEngagementPoste: …].',
  parameters: Type.Object({
    poste: Type.String({ description: 'Code poste / workstation' }),
  }),
  execute: async (_id, params) => {
    const e = await extras()
    return toolResult(await e.getEngagementPoste(params.poste))
  },
})

export function buildAgentTools(): ToolDefinition[] {
  return [
    getVerdictTool,
    descendreBOMTool,
    getPromiseTool,
    listerRetardsPrevusTool,
    simulerDecalageTool,
    enregistrerScenarioTool,
    getEngagementPosteTool,
    rafraichirTool,
    pingTool,
  ]
}

export function agentToolNames(tools: ToolDefinition[] = buildAgentTools()): string[] {
  return tools.map((t) => t.name)
}
