/**
 * Jeu de cas d'or — gate étape 3 couche agentique.
 *
 * Chaque cas fige :
 *  - la question user
 *  - les réponses tools (mocks déterministes — le LLM n'a pas d'autre source)
 *  - la racine attendue (article et/ou OF et/ou nature)
 *
 * Rejoué à chaque changement prompt/modèle. Échec → ne pas scaler les 18 tools.
 */

export type GoldenToolName =
  | 'getVerdict'
  | 'descendreBOM'
  | 'getPromise'
  | 'listerRetardsPrevus'
  | 'listerOF'
  | 'rechercherArticle'
  | 'ping'

export interface GoldenCase {
  id: string
  /** Question user naturelle (FR). */
  question: string
  /**
   * Tours supplémentaires (multi-tour) : envoyés après `question` dans la MÊME
   * session. Le scoring porte sur la réponse du dernier tour + tous les tools.
   */
  turns?: string[]
  /**
   * Réponses mock indexées par tool. Les params sont ignorés sauf quand
   * `byArgs` disambigue plusieurs appels (ex. getPromise sur 2 articles).
   */
  mocks: Partial<
    Record<
      GoldenToolName,
      | unknown
      | { byArgs: Array<{ match: Record<string, unknown>; result: unknown }> }
    >
  >
  /** Racines attendues — scorées par inclusion (case-insensitive). */
  expected: {
    /** Articles racines (codes) qui doivent apparaître dans la réponse finale. */
    articles?: string[]
    /** N° OF qui doivent apparaître. */
    ofs?: string[]
    /** Mots-clés de nature (rupture matière, sous-ensemble, réception, etc.). */
    keywords?: string[]
    /** Si true, la réponse doit dire qu'il n'y a PAS de problème / OF faisable. */
    feasibleOk?: boolean
  }
  /**
   * Tools que le modèle DOIT appeler (noms). Gate anti-devinette.
   * Si omis : au moins un tool métier attendu.
   */
  mustCall?: GoldenToolName[]
}

/** Helpers de payload mock (forme proche des vrais primitifs). */
const verdict = (over: Record<string, unknown>) => ({
  _source: 'getVerdict',
  engine: 'rupture-engine.evaluateRuptures(photo)',
  ...over,
})

const bom = (over: Record<string, unknown>) => ({
  _source: 'descendreBOM',
  engine: 'RecursiveDiagnosticChecker.diagnoseOf',
  ...over,
})

const promise = (over: Record<string, unknown>) => ({
  _source: 'getPromise',
  engine: 'promise-engine.computePromiseDate',
  ...over,
})

/**
 * Corpus v1 — 12 cas couvrant les 4 primitifs + chaînes multi-tools.
 * À enrichir jusqu'à 15-30 avec des retards réels (export pool).
 */
export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: 'G01-rupture-feuille-directe',
    question:
      "Pourquoi l'OF MFG-1001 est en retard / bloqué ? Trouve la racine matière exacte.",
    mocks: {
      getVerdict: verdict({
        of: {
          numOf: 'MFG-1001',
          article: 'PF-ALPHA',
          quantity: 100,
          statutNum: 2,
          dateFin: '2026-07-20',
        },
        requirementSource: 'MFGMAT',
        feasible: false,
        missingDirect: [{ article: 'ACH-VIS-M6', qty: 240 }],
        missingCount: 1,
        missingDetail: [
          {
            article: 'ACH-VIS-M6',
            shortage: 240,
            depth: 0,
            fabricated: false,
          },
        ],
      }),
    },
    mustCall: ['getVerdict'],
    expected: {
      articles: ['ACH-VIS-M6'],
      ofs: ['MFG-1001'],
      keywords: ['rupture', 'manque'],
    },
  },
  {
    id: 'G02-sous-ensemble-a-lancer',
    question:
      "L'OF MFG-2002 du PF-BETA est non faisable. Est-ce une rupture d'achat ou un sous-ensemble à lancer ?",
    mocks: {
      getVerdict: verdict({
        of: {
          numOf: 'MFG-2002',
          article: 'PF-BETA',
          quantity: 50,
          statutNum: 2,
          dateFin: '2026-07-18',
        },
        requirementSource: 'MFGMAT',
        feasible: false,
        missingDirect: [{ article: 'SE-MODULE-H', qty: 50 }],
        missingCount: 1,
        missingDetail: [
          {
            article: 'SE-MODULE-H',
            shortage: 50,
            depth: 0,
            fabricated: true,
          },
        ],
      }),
      descendreBOM: bom({
        numOf: 'MFG-2002',
        article: 'PF-BETA',
        feasible: false,
        rootCause: 'sous_ensemble_a_lancer',
        tree: {
          numOf: 'MFG-2002',
          article: 'PF-BETA',
          feasible: false,
          status: 'sous_ensemble_a_lancer',
          shorts: [
            {
              article: 'SE-MODULE-H',
              fabricated: true,
              quantityMissing: 50,
              status: 'sous_ensemble_a_lancer',
              covering: [],
            },
          ],
        },
      }),
    },
    mustCall: ['getVerdict', 'descendreBOM'],
    expected: {
      articles: ['SE-MODULE-H'],
      keywords: ['sous-ensemble', 'lancer'],
    },
  },
  {
    id: 'G03-racine-feuille-profonde',
    question:
      "Diagnostic complet de l'OF MFG-3003 : quelle est la VRAIE racine bloquante (feuille) ?",
    mocks: {
      getVerdict: verdict({
        of: {
          numOf: 'MFG-3003',
          article: 'PF-GAMMA',
          quantity: 20,
          statutNum: 2,
          dateFin: '2026-07-22',
        },
        requirementSource: 'MFGMAT',
        feasible: false,
        missingDirect: [{ article: 'SE-NIVEAU-1', qty: 20 }],
        missingCount: 1,
        missingDetail: [
          { article: 'SE-NIVEAU-1', shortage: 20, depth: 0, fabricated: true },
        ],
      }),
      descendreBOM: bom({
        numOf: 'MFG-3003',
        article: 'PF-GAMMA',
        feasible: false,
        rootCause: 'rupture_matiere',
        tree: {
          numOf: 'MFG-3003',
          article: 'PF-GAMMA',
          status: 'rupture_matiere',
          shorts: [
            {
              article: 'SE-NIVEAU-1',
              fabricated: true,
              quantityMissing: 20,
              status: 'rupture_matiere',
              covering: [
                {
                  numOf: 'MFG-SE-91',
                  statut: 3,
                  quantity: 10,
                  node: {
                    numOf: 'MFG-SE-91',
                    article: 'SE-NIVEAU-1',
                    status: 'rupture_matiere',
                    shorts: [
                      {
                        article: 'ACH-CAPTEUR-X',
                        fabricated: false,
                        quantityMissing: 40,
                        status: 'rupture_matiere',
                        covering: [],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      }),
    },
    mustCall: ['descendreBOM'],
    expected: {
      articles: ['ACH-CAPTEUR-X'],
      keywords: ['rupture', 'capteur'],
    },
  },
  {
    id: 'G04-of-faisable',
    question: "L'OF MFG-4004 pose-t-il un problème de matière ?",
    mocks: {
      getVerdict: verdict({
        of: {
          numOf: 'MFG-4004',
          article: 'PF-DELTA',
          quantity: 30,
          statutNum: 1,
          dateFin: '2026-07-19',
        },
        requirementSource: 'MFGMAT',
        feasible: true,
        missingDirect: [],
        missingCount: 0,
        missingDetail: [],
      }),
    },
    mustCall: ['getVerdict'],
    expected: {
      ofs: ['MFG-4004'],
      feasibleOk: true,
      keywords: ['faisable', 'aucun'],
    },
  },
  {
    id: 'G05-promesse-engageante-reception',
    question:
      'Pour 200 unités de PP_830_ESH, quelle date engageante au plus tôt et quel facteur limite ?',
    mocks: {
      getPromise: promise({
        article: 'PP_830_ESH',
        quantity: 200,
        from: '2026-07-17',
        optimiste: {
          promiseDate: '2026-07-25',
          mode: 'optimiste',
          infeasible: false,
          truncated: false,
          limitingFactor: {
            article: 'ACH-BOUCHE-60',
            reason: { kind: 'reception', poId: 'PO-7788', date: '2026-07-24' },
            date: '2026-07-24',
            leadTime: 0,
          },
          criticalPath: [
            {
              article: 'PP_830_ESH',
              availableDate: '2026-07-25',
              reason: { kind: 'fabrication', leadTime: 1 },
              onCriticalPath: true,
            },
            {
              article: 'ACH-BOUCHE-60',
              availableDate: '2026-07-24',
              reason: { kind: 'reception', poId: 'PO-7788' },
              onCriticalPath: true,
            },
          ],
        },
        engageante: {
          promiseDate: '2026-07-28',
          mode: 'engageante',
          infeasible: false,
          truncated: false,
          limitingFactor: {
            article: 'ACH-BOUCHE-60',
            reason: { kind: 'reception', poId: 'PO-7788', date: '2026-07-27' },
            date: '2026-07-27',
            leadTime: 3,
          },
          criticalPath: [
            {
              article: 'PP_830_ESH',
              availableDate: '2026-07-28',
              reason: { kind: 'fabrication', leadTime: 1 },
              onCriticalPath: true,
            },
            {
              article: 'ACH-BOUCHE-60',
              availableDate: '2026-07-27',
              reason: { kind: 'reception', poId: 'PO-7788' },
              onCriticalPath: true,
            },
          ],
        },
      }),
    },
    mustCall: ['getPromise'],
    expected: {
      articles: ['ACH-BOUCHE-60', 'PP_830_ESH'],
      keywords: ['2026-07-28', 'réception', 'PO-7788'],
    },
  },
  {
    id: 'G06-promesse-appro-sans-po',
    question:
      "Date au plus tôt engageante pour 500 PCS de FILTRE-Z si on n'a ni stock ni PO ?",
    mocks: {
      getPromise: promise({
        article: 'FILTRE-Z',
        quantity: 500,
        from: '2026-07-17',
        optimiste: {
          promiseDate: '2026-08-01',
          mode: 'optimiste',
          infeasible: false,
          limitingFactor: {
            article: 'FILTRE-Z',
            reason: { kind: 'appro', leadTime: 15 },
            date: '2026-08-01',
            leadTime: 15,
          },
          criticalPath: [],
        },
        engageante: {
          promiseDate: '2026-08-10',
          mode: 'engageante',
          infeasible: false,
          limitingFactor: {
            article: 'FILTRE-Z',
            reason: { kind: 'appro', leadTime: 15, observed: 9 },
            date: '2026-08-10',
            leadTime: 24,
          },
          criticalPath: [],
        },
      }),
    },
    mustCall: ['getPromise'],
    expected: {
      articles: ['FILTRE-Z'],
      keywords: ['appro', '2026-08-10'],
    },
  },
  {
    id: 'G07-liste-retards-horizon',
    question:
      'Quels retards clients sont prévus sur les 14 prochains jours ? Priorise le pire.',
    mocks: {
      listerRetardsPrevus: {
        _source: 'listerRetardsPrevus',
        engine: 'loadPromise(engageante) vs date besoin',
        horizon: { from: '2026-07-17', to: '2026-07-31', days: 14 },
        demandsScanned: 120,
        demandsEvaluated: 40,
        truncated: true,
        retardsCount: 3,
        retards: [
          {
            orderId: 'CMD-9001',
            ligne: '1000',
            article: 'PF-OMEGA',
            customer: 'CLIENT-A',
            quantity: 80,
            dateBesoin: '2026-07-20',
            promiseEngageante: '2026-08-05',
            retardJours: 16,
            limitingArticle: 'ACH-JOINT-R',
            limitingReason: 'appro',
            infeasible: false,
          },
          {
            orderId: 'CMD-9002',
            ligne: '2000',
            article: 'PF-SIGMA',
            customer: 'CLIENT-B',
            quantity: 12,
            dateBesoin: '2026-07-22',
            promiseEngageante: '2026-07-28',
            retardJours: 6,
            limitingArticle: 'SE-CARTER',
            limitingReason: 'fabrication',
            infeasible: false,
          },
          {
            orderId: 'CMD-9003',
            ligne: '1000',
            article: 'PF-TAU',
            customer: 'CLIENT-C',
            quantity: 5,
            dateBesoin: '2026-07-18',
            promiseEngageante: '2026-07-19',
            retardJours: 1,
            limitingArticle: 'ACH-VIS-M4',
            limitingReason: 'reception',
            infeasible: false,
          },
        ],
      },
    },
    mustCall: ['listerRetardsPrevus'],
    expected: {
      // Priorité = pire retard
      articles: ['PF-OMEGA', 'ACH-JOINT-R'],
      keywords: ['CMD-9001', '16'],
    },
  },
  {
    id: 'G08-chaine-of-vers-promesse-feuille',
    question:
      "OF MFG-5005 bloqué : trouve la racine puis donne la date engageante pour couvrir le manque de la feuille (qté manquante).",
    mocks: {
      getVerdict: verdict({
        of: {
          numOf: 'MFG-5005',
          article: 'PF-EPSILON',
          quantity: 40,
          statutNum: 2,
          dateFin: '2026-07-21',
        },
        requirementSource: 'MFGMAT',
        feasible: false,
        missingDirect: [{ article: 'ACH-STATOR', qty: 40 }],
        missingCount: 1,
        missingDetail: [
          { article: 'ACH-STATOR', shortage: 40, depth: 0, fabricated: false },
        ],
      }),
      getPromise: {
        byArgs: [
          {
            match: { article: 'ACH-STATOR' },
            result: promise({
              article: 'ACH-STATOR',
              quantity: 40,
              optimiste: {
                promiseDate: '2026-08-02',
                mode: 'optimiste',
                infeasible: false,
                limitingFactor: {
                  article: 'ACH-STATOR',
                  reason: { kind: 'appro', leadTime: 16 },
                  date: '2026-08-02',
                  leadTime: 16,
                },
                criticalPath: [],
              },
              engageante: {
                promiseDate: '2026-08-06',
                mode: 'engageante',
                infeasible: false,
                limitingFactor: {
                  article: 'ACH-STATOR',
                  reason: { kind: 'appro', leadTime: 16, observed: 4 },
                  date: '2026-08-06',
                  leadTime: 20,
                },
                criticalPath: [],
              },
            }),
          },
        ],
      },
    },
    mustCall: ['getVerdict', 'getPromise'],
    expected: {
      articles: ['ACH-STATOR'],
      keywords: ['2026-08-06', 'MFG-5005'],
    },
  },
  {
    id: 'G09-ne-pas-inventer-chiffre',
    question:
      "Combien d'unités manquent sur l'OF MFG-6006 et de quel article ?",
    mocks: {
      getVerdict: verdict({
        of: {
          numOf: 'MFG-6006',
          article: 'PF-ZETA',
          quantity: 15,
          statutNum: 2,
          dateFin: '2026-07-25',
        },
        requirementSource: 'NOMENCLATURE',
        feasible: false,
        missingDirect: [{ article: 'ACH-THERMISTOR', qty: 15 }],
        missingCount: 1,
        missingDetail: [
          {
            article: 'ACH-THERMISTOR',
            shortage: 15,
            depth: 0,
            fabricated: false,
          },
        ],
      }),
    },
    mustCall: ['getVerdict'],
    expected: {
      articles: ['ACH-THERMISTOR'],
      // qté exacte du tool
      keywords: ['15'],
    },
  },
  {
    id: 'G10-qc-a-controler',
    question:
      "Retour diagnostic OF MFG-7007 : que signifie le statut et quelle action ?",
    mocks: {
      descendreBOM: bom({
        numOf: 'MFG-7007',
        article: 'PF-ETA',
        feasible: false,
        rootCause: 'qc_a_controler',
        tree: {
          numOf: 'MFG-7007',
          article: 'PF-ETA',
          status: 'qc_a_controler',
          shorts: [
            {
              article: 'ACH-PCB-12',
              fabricated: false,
              quantityMissing: 0,
              available: 0,
              stockQc: 120,
              status: 'qc_a_controler',
              covering: [],
            },
          ],
        },
      }),
    },
    mustCall: ['descendreBOM'],
    expected: {
      articles: ['ACH-PCB-12'],
      keywords: ['qualité', 'contrôle', 'CQ'],
    },
  },
  {
    id: 'G11-multi-manquants-prioriser',
    question:
      "OF MFG-8008 a plusieurs manques. Lequel traite-t-on d'abord (plus gros manque) ?",
    mocks: {
      getVerdict: verdict({
        of: {
          numOf: 'MFG-8008',
          article: 'PF-THETA',
          quantity: 200,
          statutNum: 2,
          dateFin: '2026-07-19',
        },
        requirementSource: 'MFGMAT',
        feasible: false,
        missingDirect: [
          { article: 'ACH-ECROU-M5', qty: 12 },
          { article: 'ACH-CARTER-ALU', qty: 200 },
          { article: 'ACH-JOINT-NBR', qty: 40 },
        ],
        missingCount: 3,
        missingDetail: [
          { article: 'ACH-CARTER-ALU', shortage: 200, depth: 0, fabricated: false },
          { article: 'ACH-JOINT-NBR', shortage: 40, depth: 0, fabricated: false },
          { article: 'ACH-ECROU-M5', shortage: 12, depth: 0, fabricated: false },
        ],
      }),
    },
    mustCall: ['getVerdict'],
    expected: {
      articles: ['ACH-CARTER-ALU'],
      keywords: ['200'],
    },
  },
  {
    id: 'G12-retard-prevision-filtre-article',
    question: 'Y a-t-il des retards prévus sur l\'article PF-OMEGA uniquement ?',
    mocks: {
      listerRetardsPrevus: {
        _source: 'listerRetardsPrevus',
        horizon: { from: '2026-07-17', to: '2026-07-31', days: 14 },
        retardsCount: 1,
        retards: [
          {
            orderId: 'CMD-9001',
            article: 'PF-OMEGA',
            customer: 'CLIENT-A',
            quantity: 80,
            dateBesoin: '2026-07-20',
            promiseEngageante: '2026-08-05',
            retardJours: 16,
            limitingArticle: 'ACH-JOINT-R',
            limitingReason: 'appro',
            infeasible: false,
          },
        ],
      },
    },
    mustCall: ['listerRetardsPrevus'],
    expected: {
      articles: ['PF-OMEGA', 'ACH-JOINT-R'],
      keywords: ['CMD-9001'],
    },
  },
  {
    id: 'G13-decouverte-liste-of-horizon',
    question:
      'Quels OF planifiés ou suggérés sur les 3 prochaines semaines ? Lesquels sont faisables ?',
    mocks: {
      listerOF: {
        _source: 'listerOF',
        engine: 'boardDataset.getPool (ORDERS WIPSTA 1/2/3)',
        filtres: { statuts: [2, 3], article: null, from: '2026-07-17', to: '2026-08-07' },
        totalMatching: 2,
        truncated: false,
        ofs: [
          {
            numOf: 'MFG-9001',
            article: 'PF-GAMMA',
            designation: 'Caisson gamma',
            quantity: 120,
            statut: 2,
            statutLabel: 'Planifié',
            dateFin: '2026-07-24',
            enRetard: false,
          },
          {
            numOf: 'MFG-9002',
            article: 'PF-DELTA',
            designation: 'Caisson delta',
            quantity: 60,
            statut: 3,
            statutLabel: 'Suggéré',
            dateFin: '2026-07-30',
            enRetard: false,
          },
        ],
      },
      getVerdict: {
        byArgs: [
          {
            match: { numOf: 'MFG-9001' },
            result: verdict({
              of: { numOf: 'MFG-9001', article: 'PF-GAMMA', quantity: 120, statutNum: 2 },
              requirementSource: 'NOMENCLATURE',
              feasible: true,
              missingDirect: [],
              missingCount: 0,
              missingDetail: [],
            }),
          },
          {
            match: { numOf: 'MFG-9002' },
            result: verdict({
              of: { numOf: 'MFG-9002', article: 'PF-DELTA', quantity: 60, statutNum: 3 },
              requirementSource: 'NOMENCLATURE',
              feasible: false,
              missingDirect: [{ article: 'ACH-JOINT-77', qty: 120 }],
              missingCount: 1,
              missingDetail: [
                { article: 'ACH-JOINT-77', shortage: 120, depth: 0, fabricated: false },
              ],
            }),
          },
        ],
      },
    },
    // Gate anti-« demande la liste » : le modèle doit découvrir seul via listerOF.
    mustCall: ['listerOF', 'getVerdict'],
    expected: {
      ofs: ['MFG-9001', 'MFG-9002'],
      articles: ['ACH-JOINT-77'],
      keywords: ['faisable'],
    },
  },
  {
    id: 'G14-multi-tour-contexte',
    question: "Pourquoi l'OF MFG-7007 est bloqué ?",
    turns: [
      'Et quelle date engageante pour couvrir ce composant manquant (quantité manquante) ?',
    ],
    mocks: {
      getVerdict: verdict({
        of: { numOf: 'MFG-7007', article: 'PF-EPSILON', quantity: 40, statutNum: 2 },
        requirementSource: 'MFGMAT',
        feasible: false,
        missingDirect: [{ article: 'ACH-CAPTEUR-12', qty: 60 }],
        missingCount: 1,
        missingDetail: [
          { article: 'ACH-CAPTEUR-12', shortage: 60, depth: 0, fabricated: false },
        ],
      }),
      getPromise: {
        byArgs: [
          {
            match: { article: 'ACH-CAPTEUR-12' },
            result: promise({
              article: 'ACH-CAPTEUR-12',
              quantity: 60,
              from: '2026-07-17',
              optimiste: {
                promiseDate: '2026-07-28',
                mode: 'optimiste',
                infeasible: false,
                limitingFactor: { article: 'ACH-CAPTEUR-12', reason: { kind: 'appro' } },
              },
              engageante: {
                promiseDate: '2026-08-04',
                mode: 'engageante',
                infeasible: false,
                limitingFactor: { article: 'ACH-CAPTEUR-12', reason: { kind: 'appro' } },
              },
            }),
          },
        ],
      },
    },
    // Tour 2 sans re-donner l'article : la session doit se souvenir du tour 1.
    mustCall: ['getVerdict', 'getPromise'],
    expected: {
      articles: ['ACH-CAPTEUR-12'],
      keywords: ['04/08/2026', '2026-08-04', 'engageante'],
    },
  },
  {
    id: 'G15-famille-pp830-pas-un-poste',
    // « PP 830 » = famille produit ESH, PAS un poste de charge (référentiel prompt).
    question: 'OF affermissables sur PP 830 sur les 5 prochains jours ?',
    mocks: {
      listerOF: {
        byArgs: [
          {
            match: { famille: 'ESH' },
            result: {
              _source: 'listerOF',
              engine: 'boardDataset.getPool (ORDERS WIPSTA 1/2/3)',
              filtres: { statuts: [2, 3], famille: 'ESH', from: '2026-07-17', to: '2026-07-22' },
              totalMatching: 1,
              truncated: false,
              ofs: [
                {
                  numOf: 'MFG-8801',
                  article: 'PP_830_ESH_D',
                  designation: 'Double flux PP830',
                  quantity: 25,
                  statut: 2,
                  statutLabel: 'Planifié',
                  dateFin: '2026-07-21',
                  enRetard: false,
                },
              ],
            },
          },
        ],
      },
      getVerdict: verdict({
        of: { numOf: 'MFG-8801', article: 'PP_830_ESH_D', quantity: 25, statutNum: 2 },
        requirementSource: 'NOMENCLATURE',
        feasible: true,
        missingDirect: [],
        missingCount: 0,
        missingDetail: [],
      }),
    },
    mustCall: ['listerOF', 'getVerdict'],
    expected: {
      ofs: ['MFG-8801'],
      articles: ['PP_830_ESH_D'],
      keywords: ['faisable'],
    },
  },
]
