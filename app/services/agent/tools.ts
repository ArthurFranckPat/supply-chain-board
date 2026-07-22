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

/**
 * Gabarit de description de tool.
 *
 * Une description de tool décrit un **contrat**, pas des données métier. Elle
 * dit ce que le tool prend, ce qu'il rend, ce qu'il ne rend pas, et où passe
 * la frontière avec les tools voisins. Elle ne contient jamais d'instance de
 * donnée (code article, famille, poste, client) : ces valeurs changent, se
 * découvrent à l'exécution via les tools eux-mêmes, et gravées ici elles
 * deviennent de fausses règles.
 *
 * Elle ne redit pas non plus les règles globales du prompt système (citation,
 * lecture-seule, format de date) : elles y sont énoncées une fois.
 */
function toolDoc(doc: {
  /** Ce que fait le tool, une phrase. */
  quoi: string
  /** Déclencheur, formulé comme l'utilisateur le dirait. */
  quand: string
  /** Frontière : cas où un autre tool est le bon, avec son nom. */
  pasSi?: string
  /** Champs clés du payload ET ce qu'il ne contient pas. */
  retour: string
  /** Interprétation d'un retour vide — jamais « il n'y a rien ». */
  siVide?: string
}): string {
  const lines = [doc.quoi, `QUAND : ${doc.quand}`]
  if (doc.pasSi) lines.push(`PAS CE TOOL SI : ${doc.pasSi}`)
  lines.push(`RETOUR : ${doc.retour}`)
  if (doc.siVide) lines.push(`SI VIDE : ${doc.siVide}`)
  return lines.join('\n')
}

export const pingTool = defineTool({
  name: 'ping',
  label: 'Ping',
  description: toolDoc({
    quoi: 'Smoke-test du runtime agent. Renvoie { pong: true }.',
    quand: "jamais dans une réponse métier — réservé aux tests d'intégration.",
    pasSi: "l'utilisateur pose une question supply, quelle qu'elle soit.",
    retour: '{ pong: true }. Aucune donnée métier.',
  }),
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
  description: toolDoc({
    quoi: 'Liste les ordres de fabrication du pool board, filtrables par statut, article, famille produit et horizon.',
    quand:
      "l'utilisateur parle d'OF, d'ordres de fabrication, de ce qui est planifié, lancé ou à " +
      "affermir. Appelle-le pour obtenir une liste d'OF plutôt que de la demander à l'utilisateur.",
    pasSi:
      "l'identifiant désigne un poste de charge, une ligne ou un atelier → getCharge. " +
      'Famille produit et poste de charge sont deux référentiels distincts, sans règle de ' +
      "nommage permettant de deviner lequel s'applique à un identifiant donné.",
    retour:
      'numOf, article, designation, quantity, statut, dateFin, enRetard. ' +
      'PAS de composants, PAS de ruptures, PAS de charge, PAS de lien commande.',
    siVide:
      'avec un filtre `famille`, un résultat vide veut dire « code famille inconnu » avant de ' +
      'vouloir dire « aucun OF ». La réponse porte alors `familleInconnue` et `famillesConnues` ' +
      '(valeurs légales) : lis-les et corrige le filtre plutôt que de tenter un autre code.',
  }),
  parameters: Type.Object({
    statuts: Type.Optional(
      Type.Array(Type.Number(), {
        description:
          'Statuts WIPSTA : 1 = ferme (lancé), 2 = planifié, 3 = suggéré (CBN). ' +
          'Un OF est affermissable en 2 ou 3. Défaut = tous.',
      })
    ),
    article: Type.Optional(Type.String({ description: 'Filtre code article exact' })),
    famille: Type.Optional(
      Type.String({
        description:
          'Famille produit X3 (YFAMSTAT7_0) ou typologie (TSICOD_4) — le filtre teste les deux. ' +
          'Référentiel fermé : les valeurs légales se découvrent via rechercherArticle (champs ' +
          '`famille` / `typologie`), ou via `famillesConnues` renvoyé ici quand le code est inconnu.',
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
  description: toolDoc({
    quoi: 'Recherche dans le catalogue articles par code partiel ou fragment de libellé.',
    quand:
      "l'utilisateur donne un nom produit, un libellé ou un code approximatif au lieu d'un code " +
      "article exact. Sert aussi à découvrir les familles et typologies existantes, que chaque " +
      'ligne expose.',
    pasSi:
      'tu cherches un OF (→ listerOF), un poste de charge (→ getCharge) ou une commande ' +
      '(→ listerCommandesStatut). Ce tool ne connaît que le catalogue articles.',
    retour:
      'code, description, supplyType, famille, typologie, reorderDelay. ' +
      'PAS de stock, PAS de nomenclature, PAS de disponibilité.',
    siVide: "le fragment ne matche ni code ni libellé ; raccourcis-le avant de conclure à l'inexistence.",
  }),
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
  description: toolDoc({
    quoi:
      "Verdict de rupture d'un OF à l'instant t : faisable ou non, et composants manquants directs. " +
      'Les besoins viennent du réalisé (MFGMAT) si l’OF est éclaté, de la nomenclature théorique sinon.',
    quand:
      "l'utilisateur demande si un OF passe, pourquoi il bloque, ou ce qu'il manque. " +
      "Tool d'entrée de tout diagnostic d'OF, peu coûteux.",
    pasSi:
      'tu cherches la cause racine derrière un composant manquant, quand celui-ci est lui-même ' +
      'un sous-ensemble bloqué → descendreBOM. getVerdict ne descend pas la nomenclature.',
    retour:
      'faisable, source des besoins, composants manquants directs et quantités. Fait autorité ' +
      'sur la disponibilité : un composant manquant ici est indisponible pour cet OF, y compris ' +
      'si un calcul isolé (getPromise) trouve du stock. PAS de date, PAS de réception attendue.',
    siVide: "un OF introuvable dans le pool est un n° erroné ou hors périmètre board, pas un OF sain.",
  }),
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
  description: toolDoc({
    quoi:
      "Descente récursive de la nomenclature d'un OF jusqu'à la racine bloquante : feuille " +
      'approvisionnée manquante, ou sous-ensemble dont l’OF reste à lancer.',
    quand:
      "getVerdict a rendu une rupture et l'utilisateur veut la cause racine ou la chaîne causale.",
    pasSi:
      "tu veux seulement savoir si l'OF passe → getVerdict, bien plus léger. Réserve ce tool " +
      'aux OF déjà identifiés comme non faisables.',
    retour:
      'chaîne causale de l’OF jusqu’à la feuille bloquante. PAS de date de réapprovisionnement ' +
      '(→ getPromise), PAS de commande achat couvrante (→ listerRuptures).',
  }),
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
  description: toolDoc({
    quoi:
      'Date au plus tôt (Capable-to-Promise) pour un couple article/quantité : date optimiste et ' +
      'date engageante, chemin critique, facteur limitant.',
    quand:
      "l'utilisateur veut une date sur un article et une quantité : la feuille bloquante remontée " +
      'par descendreBOM, ou un besoin nouveau à chiffrer.',
    pasSi:
      'tu cherches la réception fournisseur qui couvre une rupture → listerRuptures ; ce tool ' +
      'ignore les commandes achat et les fournisseurs. Il ne peut pas non plus établir qu’une ' +
      'quantité est disponible POUR un OF : le calcul est isolé sur article/quantité et ignore ' +
      'la concurrence des autres OF sur le même stock — c’est getVerdict qui tranche.',
    retour:
      'date optimiste, date engageante, chemin critique, facteur limitant. Un `reason` de type ' +
      'stock signifie seulement que le moteur a trouvé du stock et s’est arrêté là : il ne ' +
      'renseigne pas sur les réceptions en cours et ne contredit pas une rupture constatée.',
  }),
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
  description: toolDoc({
    quoi:
      'Demandes dont la promesse engageante dépasse la date besoin, sur un horizon. ' +
      'Triées par retard décroissant, 40 lignes évaluées au maximum.',
    quand:
      "l'utilisateur veut savoir ce qui va déraper sur une période : quelles demandes, quels " +
      'clients sont menacés.',
    pasSi:
      "l'utilisateur veut le statut du portefeuille de commandes → listerCommandesStatut. " +
      'Ce tool ne renvoie que ce qui est en retard, pas les demandes qui passent.',
    retour:
      'demande, article, client, date besoin, date promesse, jours de retard. PAS la cause : ' +
      'enchaîne getVerdict ou descendreBOM sur l’OF concerné pour l’obtenir.',
    siVide: "vaut pour l'horizon interrogé seulement, pas pour l'ensemble du plan.",
  }),
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
  description: toolDoc({
    quoi: 'Invalide les caches board : le prochain accès relit X3 en direct.',
    quand:
      "l'utilisateur demande explicitement des données à jour, ou signale un écart entre deux " +
      'vues qui devraient concorder. Opération coûteuse, jamais préventive.',
    pasSi:
      'un tool a simplement renvoyé un résultat vide ou inattendu — rafraîchir ne corrige pas ' +
      'un filtre erroné.',
    retour: 'confirmation d’invalidation. Aucune donnée métier : refais l’appel métier ensuite.',
  }),
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
  description: toolDoc({
    quoi:
      'Applique des mutations de plan en mémoire et rend le différentiel avant/après. ' +
      'Rien n’est écrit : la simulation est éphémère.',
    quand:
      "l'utilisateur formule une hypothèse — décaler un OF, déplacer ou injecter une demande, " +
      'suspendre un approvisionnement — et veut en mesurer l’effet.',
    pasSi:
      "l'utilisateur décrit une situation existante et non une hypothèse : constater l'état du " +
      'plan relève des tools de lecture.',
    retour:
      'statistiques avant/après et principales dégradations. Résultat non persisté : ' +
      'enregistrerScenario est nécessaire pour le conserver.',
  }),
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
  description: toolDoc({
    quoi: 'Persiste un jeu de mutations sous forme de scénario nommé.',
    quand:
      "l'utilisateur demande explicitement de sauvegarder ou conserver un scénario. " +
      'Seul tool de ce jeu qui écrit — ne l’appelle jamais de ta propre initiative.',
    pasSi: "l'utilisateur veut seulement voir l'effet d'une hypothèse → simulerDecalage.",
    retour: 'identifiant du scénario créé.',
  }),
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
  description: toolDoc({
    quoi:
      'Ruptures composants sur un horizon : composant manquant, OF bloqué, commande et client ' +
      'impactés, et la réception achat qui couvre la rupture — ou son absence.',
    quand:
      "l'utilisateur parle de ruptures, de composants manquants, ou de réceptions fournisseurs " +
      'attendues ou critiques. Source unique des réceptions couvrantes.',
    pasSi:
      "tu veux le diagnostic d'un OF précis → getVerdict puis descendreBOM. Ce tool balaie une " +
      "fenêtre, il ne détaille pas la nomenclature d'un OF.",
    retour:
      'composant, OF bloqué, commande/client, et la réception couvrante (n° commande achat, ' +
      'fournisseur, quantité, date) quand elle existe. Les composants sans réception portent le ' +
      'verdict `sans_couverture` : ce sont les seuls à escalader aux achats.',
    siVide:
      "aucune rupture sur la fenêtre interrogée. N'en déduis pas qu'un composant donné est couvert " +
      "si la fenêtre ne l'englobait pas.",
  }),
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
  description: toolDoc({
    quoi:
      'Stock usine à l’instant t pour une liste d’articles : strict (utilisable), QC (bloqué en ' +
      'contrôle qualité), total.',
    quand: "l'utilisateur demande combien il y a en stock d'un ou plusieurs articles.",
    pasSi:
      'la question porte sur ce qui reste disponible POUR un OF : le stock brut ignore les ' +
      'allocations concurrentes → getVerdict.',
    retour: 'par article : strict, QC, total. PAS d’allocation par OF, PAS de réception attendue.',
  }),
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
  description: toolDoc({
    quoi:
      'Statut de chaque ligne de demande sur une fenêtre : à l’heure, couverte sur stock, en ' +
      'retard, bloquée ou sans couverture, avec les jours de retard et les OF rattachés.',
    quand: "l'utilisateur demande quelles commandes passent, lesquelles sont à risque ou bloquées.",
    pasSi:
      'tu veux uniquement ce qui dérape → listerRetardsPrevus. Pour le détail d’une ligne précise ' +
      '→ getDetailCommande.',
    retour:
      'statut, jours de retard, nature (commande client ferme ou prévision budgétaire — une ' +
      'prévision n’engage aucun client, filtre `nature` pour les séparer), et les OF rattachés. ' +
      'Ces OF sont ALLOUÉS par le moteur de planification : selon `matchingMethod` ce peut être ' +
      'un peg X3 réel ou une heuristique article+date, et le tool ne distingue pas les deux. ' +
      'Dis « OF alloué », jamais « OF lié » ; getDetailCommande confirme le peg réel.',
  }),
  parameters: Type.Object({
    horizonDays: Type.Optional(Type.Number({ description: 'Horizon jours (défaut 14, max 90)' })),
    from: Type.Optional(Type.String({ description: 'Début ISO YYYY-MM-DD (défaut auj.)' })),
    client: Type.Optional(Type.String({ description: 'Filtre client (sous-chaîne)' })),
    statuts: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Filtre statuts : on_time|stock|retard|bloquee|sans_couverture',
      })
    ),
    nature: Type.Optional(
      Type.Array(Type.String(), {
        description:
          "Filtre nature : 'commande' (ferme client SORDER) | 'prevision' (budget CBN). " +
          "L'utilisateur disant « commandes » → ['commande'].",
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
        nature: params.nature,
        limit: params.limit,
      })
    )
  },
})

export const getDetailCommandeTool = defineTool({
  name: 'getDetailCommande',
  label: 'Détail ligne commande',
  description: toolDoc({
    quoi:
      "Détail d'une ligne de commande : article, quantité, date de livraison, contremarque X3, " +
      'poste de charge, nomenclature directe avec disponibilité par composant.',
    quand:
      "l'utilisateur cible une ligne de commande précise, ou tu dois confirmer qu'un OF est " +
      'réellement peggé à une commande dans X3.',
    pasSi: 'la question porte sur un ensemble de commandes → listerCommandesStatut.',
    retour:
      'La `contremarque` est le seul champ qui atteste un peg X3 officiel : renseignée, elle ' +
      'donne le n° d’OF peggé ; nulle, il n’y a pas de lien X3 et tout OF vu ailleurs relève ' +
      'd’une allocation moteur.',
  }),
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
  description: toolDoc({
    quoi:
      'Charge face à la capacité par poste de charge, sur 6 mois et selon le calendrier usine. ' +
      'Sans filtre, rend tous les postes triés par saturation ; avec un filtre, le détail hebdomadaire.',
    quand:
      "l'utilisateur nomme un poste, une ligne ou un atelier, ou demande si une capacité tient. " +
      'Appelé sans filtre, il fait office d’annuaire des postes : c’est là qu’on retrouve le code ' +
      'exact quand un identifiant ne matche pas ailleurs.',
    pasSi:
      'la question porte sur une famille produit ou un article → listerOF. Pour savoir QUELS OF ' +
      'occupent un poste plutôt que combien d’heures → getEngagementPoste.',
    retour:
      'par poste : code, libellé, atelier, heures de charge, capacité, nombre de semaines saturées. ' +
      'Le détail hebdomadaire n’apparaît qu’avec un filtre poste. PAS la liste des OF.',
    siVide:
      'le filtre poste teste une sous-chaîne du code et du libellé — un fragment plus court ' +
      'suffit souvent. Sans résultat, relance sans filtre pour lire les postes existants.',
  }),
  parameters: Type.Object({
    poste: Type.Optional(
      Type.String({
        description:
          'Sous-chaîne testée sur le code ET le libellé du poste, insensible à la casse. ' +
          'Omis : tous les postes (annuaire).',
      })
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
  description: toolDoc({
    quoi: 'Liste les scénarios déjà enregistrés.',
    quand: "l'utilisateur veut retrouver, comparer ou reprendre un scénario sauvegardé.",
    pasSi: 'il s’agit d’évaluer une nouvelle hypothèse → simulerDecalage.',
    retour: 'id, nom, statut, auteur, nombre de mutations, date. PAS le détail des mutations.',
  }),
  parameters: Type.Object({}),
  execute: async () => {
    const e = await extras()
    return toolResult(await e.listerScenarios())
  },
})

export const getEngagementPosteTool = defineTool({
  name: 'getEngagementPoste',
  label: 'Engagement poste',
  description: toolDoc({
    quoi: 'OF fermes engagés sur un poste de charge, avec les commandes qui leur sont rattachées.',
    quand: "l'utilisateur veut savoir quels OF occupent un poste, et pour quels clients.",
    pasSi:
      'la question porte sur la saturation ou les heures → getCharge. Ce tool ne couvre que les ' +
      'OF fermes lancés : il est aveugle aux OF planifiés et suggérés, donc inutile pour ' +
      "raisonner sur ce qui reste à affermir (→ listerOF filtré sur ces statuts).",
    retour:
      'par OF : article, heures, date de livraison, avancement, et commandes rattachées. ' +
      'Le rattachement vient de l’allocation moteur ou d’un repli sur contremarque : dans les ' +
      'deux cas c’est une allocation de planification, pas un peg X3 confirmé.',
  }),
  parameters: Type.Object({
    poste: Type.String({
      description: 'Code exact du poste de charge. Le découvrir via getCharge sans filtre.',
    }),
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
