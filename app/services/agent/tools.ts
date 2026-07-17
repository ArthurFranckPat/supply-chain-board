/**
 * Tools custom exposés au runtime Pi.
 *
 * Barrière sécu : ce module ne doit **jamais** enregistrer bash/read/write/edit.
 * Execute charge `primitives` en lazy pour ne pas tirer Lucid/board au boot CLI
 * (smoke, eval mocks importent agent_service sans X3).
 */

import { Type } from 'typebox'
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent'

/** Budget contexte : au-delà, le JSON est tronqué (le modèle doit affiner ses filtres). */
const MAX_TOOL_JSON_CHARS = 24_000

function toolResult(payload: unknown) {
  let text = JSON.stringify(payload)
  if (text.length > MAX_TOOL_JSON_CHARS) {
    text =
      text.slice(0, MAX_TOOL_JSON_CHARS) +
      ` …[payload tronqué à ${MAX_TOOL_JSON_CHARS} caractères sur ${text.length} — utiliser des filtres plus précis]`
  }
  return {
    content: [{ type: 'text' as const, text }],
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

export const listerOFTool = defineTool({
  name: 'listerOF',
  label: 'Lister OF',
  description:
    'Liste les OF du pool board (ORDERS WIPSTA 1=ferme, 2=planifié, 3=suggéré) avec filtres ' +
    'statuts / article / horizon. Point d’entrée découverte : à appeler AVANT de demander ' +
    "une liste d'OF à l'utilisateur. Citation : [listerOF: N OF / filtres].",
  parameters: Type.Object({
    statuts: Type.Optional(
      Type.Array(Type.Number(), {
        description: 'Statuts WIPSTA à garder, ex. [2,3] = affermissables. Défaut = tous.',
      })
    ),
    article: Type.Optional(Type.String({ description: 'Filtre code article exact' })),
    famille: Type.Optional(
      Type.String({
        description:
          'Filtre famille produit X3 (YFAMSTAT7_0) ou typologie (TSICOD_4). ' +
          'Ex. ESH (= gamme PP_830), BDH60 (bouches), BDH10 (modules hygro).',
      })
    ),
    horizonDays: Type.Optional(
      Type.Number({ description: 'Horizon jours : dateFin ≤ from+horizon (max 180)' })
    ),
    from: Type.Optional(
      Type.String({ description: "Début horizon ISO YYYY-MM-DD (défaut = aujourd'hui)" })
    ),
    limit: Type.Optional(Type.Number({ description: 'Max lignes (défaut 50, max 200)' })),
  }),
  execute: async (_id, params) => {
    const p = await primitives()
    return toolResult(
      await p.listerOF({
        statuts: params.statuts,
        article: params.article,
        famille: params.famille,
        horizonDays: params.horizonDays,
        from: params.from,
        limit: params.limit,
      })
    )
  },
})

export const rechercherArticleTool = defineTool({
  name: 'rechercherArticle',
  label: 'Rechercher article',
  description:
    'Retrouve des codes articles par code partiel ou libellé (catalogue board). ' +
    "À utiliser quand l'utilisateur donne un nom ou un code approximatif. " +
    'Citation : [rechercherArticle: query → code].',
  parameters: Type.Object({
    query: Type.String({ description: 'Code partiel ou fragment de libellé' }),
    limit: Type.Optional(Type.Number({ description: 'Max résultats (défaut 20, max 50)' })),
  }),
  execute: async (_id, params) => {
    const p = await primitives()
    return toolResult(await p.rechercherArticle({ query: params.query, limit: params.limit }))
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

export const listerRupturesTool = defineTool({
  name: 'listerRuptures',
  label: 'Ruptures + réceptions',
  description:
    'Ruptures composants sur un horizon (pipeline /ruptures) : composant manquant, OF bloqué, ' +
    'commande/client, ET la réception couvrante (n° commande achat, fournisseur, qté, date) ' +
    "ou son absence (verdict sans_couverture). LE tool pour « quelles réceptions fournisseurs " +
    'attendues/critiques ? » — ne JAMAIS déduire cela de getPromise. ' +
    'Citation : [listerRuptures: …].',
  parameters: Type.Object({
    horizonDays: Type.Optional(
      Type.Number({ description: 'Fenêtre jours (OF qui démarrent dedans, défaut 14, max 90)' })
    ),
    from: Type.Optional(Type.String({ description: 'Début ISO YYYY-MM-DD (défaut auj.)' })),
    composant: Type.Optional(Type.String({ description: 'Filtre article composant exact' })),
    verdicts: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Filtre verdicts : couvert|a_risque|retard|sans_couverture|sous_ensemble',
      })
    ),
    limit: Type.Optional(Type.Number({ description: 'Max lignes (défaut 60, max 150)' })),
  }),
  execute: async (_id, params) => {
    const e = await extras()
    return toolResult(
      await e.listerRuptures({
        horizonDays: params.horizonDays,
        from: params.from,
        composant: params.composant,
        verdicts: params.verdicts,
        limit: params.limit,
      })
    )
  },
})

export const getStockTool = defineTool({
  name: 'getStock',
  label: 'Stock articles',
  description:
    'Stock photo usine par article : strict (utilisable), QC (bloqué contrôle qualité), total. ' +
    "Ne dit pas ce qui est alloué à un OF donné (ça, c'est getVerdict). " +
    'Citation : [getStock: article → strict/qc].',
  parameters: Type.Object({
    articles: Type.Array(Type.String(), { description: 'Codes articles (max 50)' }),
  }),
  execute: async (_id, params) => {
    const e = await extras()
    return toolResult(await e.getStock({ articles: params.articles }))
  },
})

export const listerCommandesStatutTool = defineTool({
  name: 'listerCommandesStatut',
  label: 'Statuts commandes',
  description:
    'Statuts des commandes clientes sur une fenêtre (moteur order-impacts /programme) : ' +
    'on_time | stock | retard | bloquee | sans_couverture, avec jours de retard et OF liés. ' +
    'LE tool pour « quelles commandes passent / sont à risque ? ». Citation : [listerCommandesStatut: …].',
  parameters: Type.Object({
    horizonDays: Type.Optional(Type.Number({ description: 'Horizon jours (défaut 14, max 90)' })),
    from: Type.Optional(Type.String({ description: 'Début ISO YYYY-MM-DD (défaut auj.)' })),
    client: Type.Optional(Type.String({ description: 'Filtre client (sous-chaîne)' })),
    statuts: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Filtre statuts : on_time|stock|retard|bloquee|sans_couverture',
      })
    ),
    limit: Type.Optional(Type.Number({ description: 'Max lignes (défaut 60, max 150)' })),
  }),
  execute: async (_id, params) => {
    const e = await extras()
    return toolResult(
      await e.listerCommandesStatut({
        horizonDays: params.horizonDays,
        from: params.from,
        client: params.client,
        statuts: params.statuts,
        limit: params.limit,
      })
    )
  },
})

export const getDetailCommandeTool = defineTool({
  name: 'getDetailCommande',
  label: 'Détail ligne commande',
  description:
    "Détail d'une ligne de commande cliente : article, qté, date livraison, poste/charge, " +
    'BOM directe avec dispo par composant. Citation : [getDetailCommande: …].',
  parameters: Type.Object({
    numCommande: Type.String({ description: 'N° commande (SORDER)' }),
    ligne: Type.String({ description: 'N° de ligne (VCRLIN)' }),
  }),
  execute: async (_id, params) => {
    const e = await extras()
    return toolResult(
      await e.getDetailCommande({ numCommande: params.numCommande, ligne: params.ligne })
    )
  },
})

export const getChargeTool = defineTool({
  name: 'getCharge',
  label: 'Charge vs capacité',
  description:
    'Charge vs capacité par poste (payload /charge, horizon 6 mois, calendrier usine). ' +
    'Sans filtre : agrégats par poste triés par saturation. Avec `poste` : détail hebdo ' +
    '(charge, capacité, semaines saturées). Citation : [getCharge: …].',
  parameters: Type.Object({
    poste: Type.Optional(
      Type.String({ description: 'Filtre poste (sous-chaîne code ou libellé)' })
    ),
    start: Type.Optional(Type.String({ description: 'Début ISO (défaut mois courant)' })),
    vue: Type.Optional(
      Type.String({ description: "'of' = OF réels du plan (défaut) | 'commandes' = besoin explosé" })
    ),
  }),
  execute: async (_id, params) => {
    const e = await extras()
    return toolResult(
      await e.getCharge({
        poste: params.poste,
        start: params.start,
        vue: params.vue === 'commandes' ? 'commandes' : 'of',
      })
    )
  },
})

export const listerScenariosTool = defineTool({
  name: 'listerScenarios',
  label: 'Scénarios persistés',
  description: 'Liste les scénarios enregistrés (scenario_store). Citation : [listerScenarios: …].',
  parameters: Type.Object({}),
  execute: async () => {
    const e = await extras()
    return toolResult(await e.listerScenarios())
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
    listerOFTool,
    rechercherArticleTool,
    getVerdictTool,
    descendreBOMTool,
    getPromiseTool,
    listerRetardsPrevusTool,
    listerRupturesTool,
    listerCommandesStatutTool,
    getDetailCommandeTool,
    getStockTool,
    getChargeTool,
    simulerDecalageTool,
    enregistrerScenarioTool,
    listerScenariosTool,
    getEngagementPosteTool,
    rafraichirTool,
    pingTool,
  ]
}

export function agentToolNames(tools: ToolDefinition[] = buildAgentTools()): string[] {
  return tools.map((t) => t.name)
}
