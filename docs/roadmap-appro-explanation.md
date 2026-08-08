# Feuille de route — Module Approvisionnements v2 : « Pourquoi le CBN me dit ça ? »

> **Thèse.** Le module ne trie plus les suggestions du CBN — il **explique les
> messages de replanification**. La question centrale : « qu'est-ce qui a changé
> entre le run CBN d'il y a quelques jours et celui d'aujourd'hui pour justifier
> ce message ? » La réponse exige un historique de snapshots, donc le module
> n'est pas opérationnel le jour J. Cette feuille de route structure la livraison
> en lots incrémentaux qui apportent de la valeur à chaque étape.

---

## La contrainte fondamentale et comment la gérer

Le CBN de Sage X3 ne versionne rien. Chaque nuit, il **détruit et recrée** toute
la population (`VCRNUM` non stable, `CREDAT` du jour pour 99,9 % des lignes —
mesuré le 01/08/2026). Pour expliquer un message « avancer » d'aujourd'hui par
rapport à hier, il faut avoir **figé l'état d'hier**. X3 ne permet aucun
rattrapage rétroactif.

Conséquence : le module a une **période de maturation**. Le jour où on lance les
snapshots, on a zéro historique. Le lendemain, on a un diff (un point de
comparaison). Après une semaine, l'historique devient exploitable pour
l'attribution causale.

**Stratégie pour livrer de la valeur malgré ça :**

| Phase | Historique disponible | Ce qu'on peut faire |
|-------|----------------------|---------------------|
| Jour 1 | 0 photo | Infrastructure en place, données commencent à s'accumuler |
| Jour 2 | 1 diff (J vs J-1) | Diff brut : ce qui a bougé, sans explication causale |
| Semaine 1 | 5-7 diffs | Attribution causale basique (stock, demande, réception) |
| Mois 1 | ~22 diffs | Patterns émergents, scoring de confiance calibré |
| Trimestre 1 | ~65 diffs | Analyse saisonnière, préparation agentique |

Le module n'est **jamais inutile** : chaque lot a une utilité même avec un
historique minimal. Mais la profondeur de l'analyse croît avec l'historique.

---

## État des lieux : ce qui existe déjà et ce qui manque

### Déjà en production

| Composant | Fichier | État | Réutilisable ? |
|-----------|---------|------|----------------|
| Snapshot quotidien 7 populations | `demand_snapshot_service.ts` | ✅ Tourne à 04h00 | Oui — base de tout |
| Snapshot des suggestions CBN | source `appro_suggestion` | ✅ ~5 600 lignes/jour | Oui — diff inter-CBN |
| Snapshot des facteurs causaux | sources `stock`, `demande_ferme`, `demande_prevision`, `appro`, `of_*` | ✅ Capturés | Oui — matière première de l'explication |
| Diff inter-CBN des suggestions | `appro_snapshot_diff.ts` | ✅ Opérationnel | Oui — à étendre |
| API diff | `GET /api/v1/appro/diff` | ✅ Renvoie le diff | Oui — à enrichir |
| Extraction X3 (suggestions + messages) | `appro_repository.ts` | ✅ Les deux populations | Oui |
| Triage déterministe v1 | `appro_triage.ts` | ⚠️ Tri par urgence seule | À refondre (voir § traitements v1) |
| Ledger de décisions | `appro_decision_ledger` | ✅ Append-only | Oui — précieux pour le scoring |
| Payload loader + cache SWR | `appro_payload_loader.ts` | ✅ | Oui — conserver le pattern |
| Page frontend | `approvisionnements.tsx` (810 lignes) | ⚠️ UX de tri, pas d'explication | À refondre progressivement |

### Ce qui manque (les trous)

1. **Snapshot des messages de replanification** — la table `demand_snapshots`
   capture `appro_suggestion` mais PAS les messages (`WIPSTA=1`, `MRPMES≠1`).
   C'est la population à expliquer, et elle n'est pas figée. **Trou critique.**

2. **Diff des messages** — `appro_snapshot_diff.ts` ne compare que les
   suggestions. Il faut un diff des messages qui exploite la clé stable
   (`VCRNUM:VCRLIN`, contrairement aux suggestions).

3. **Attribution causale** — aucun moteur qui relie un changement de message à
   un changement de facteur (stock, demande, réception) pour un article donné.

4. **Interface d'explication** — le frontend affiche des verdicts de tri, pas
   des explications. Il faut un panneau d'explication par message.

---

## Lot 0 — Infrastructure : figer les messages et les facteurs

### Périmètre

Étendre le snapshot existant pour capturer la population manquante (messages de
replanification) et fiabiliser le pipeline.

### Prérequis

- Le snapshot quotidien tourne déjà (`demand_snapshot_provider.ts`). Aucun
  changement d'infrastructure.
- L'extraction X3 des messages existe déjà dans `appro_repository.ts`
  (`messagesSql`). Elle n'est juste pas branchée sur le snapshot.

### Livrables

#### 0.1 — Source `appro_message` dans le snapshot quotidien

Ajouter la capture des messages de replanification dans
`DemandSnapshotService.buildRows()`, source `appro_message`. Contrairement aux
suggestions, les messages ont une **clé stable** (`VCRNUM_0` + `VCRLIN_0`) :
le snapshot la capture telle quelle.

```typescript
// Dans buildRows(), après le try/catch des suggestions :
try {
  const appro = await new ApproRepository().fetch(approSnapshotTo())
  for (const s of appro.suggestions) {
    out.push({ /* source: 'appro_suggestion' — déjà fait */ })
  }
  for (const m of appro.messages) {
    out.push({
      snapshot_date: dateStr,
      source: 'appro_message',
      itmref: m.article,
      vcrnum: m.numero,
      vcrlin: String(m.ligne),
      quantity: m.quantite,
      date_echeance: isoDayOrNull(m.date),
      fournisseur: m.fournisseur,
    })
  }
} catch (error) { /* ... */ }
```

**Attention** : le snapshot actuel ne capture pas `MRPMES_0` (le code du
message) ni `MRPDAT_0` (la date proposée). Il faut soit élargir le schéma
`demand_snapshots`, soit créer une table dédiée `appro_message_snapshots`.

**Recommandation** : table dédiée. Les messages ont une structure différente
des autres populations (code message, date proposée) et les surcharger dans
`demand_snapshots` via des colonnes nullable rendrait la table illisible.

```sql
CREATE TABLE appro_message_snapshots (
  id          INTEGER PRIMARY KEY,
  snapshot_date TEXT NOT NULL,   -- YYYY-MM-DD
  vcrnum      TEXT NOT NULL,     -- VCRNUM_0 stable
  vcrlin      INTEGER NOT NULL,  -- VCRLIN_0 stable
  itmref      TEXT NOT NULL,
  fournisseur TEXT,
  mrpmes      INTEGER NOT NULL,  -- 2=avancer, 3=retarder, 6=inutile
  mrpdat      TEXT,              -- date proposée (YYYY-MM-DD, nullable)
  enddat      TEXT,              -- échéance actuelle de la commande
  quantity    REAL NOT NULL,
  created_at  TIMESTAMP
);
CREATE INDEX idx_ams_date ON appro_message_snapshots (snapshot_date);
CREATE INDEX idx_ams_key ON appro_message_snapshots (vcrnum, vcrlin, snapshot_date);
```

La clé composite `(vcrnum, vcrlin, snapshot_date)` est unique par construction
(swap complet par date, même motif que `demand_snapshots`).

#### 0.2 — Gardes-fous et observabilité

Le snapshot actuel a un garde-fou « extraction vide = pas d'écrasement ». L'avoir
pour les messages est encore plus critique : une extraction vide des messages
signifierait « tout va bien » alors que c'est probablement une panne X3.

Ajouter au `SnapshotResult` un détail par source :

```typescript
interface SnapshotResult {
  date: string
  status: 'ok' | 'failed' | 'skipped-empty'
  rows: number
  durationMs: number
  sourceBreakdown?: Record<string, number>  // NOUVEAU
  error?: string
}
```

#### 0.3 — CLI de diagnostic

```bash
node ace snapshot:diagnose
```

Affiche : nombre de photos, dates couvertes, lignes par source pour la dernière
photo, détection de jours manqués (trous dans la séquence de dates). Outil de
validation pour l'équipe avant le passage au Lot 1.

### Critères de validation

| Critère | Comment vérifier |
|---------|-----------------|
| La table `appro_message_snapshots` se remplit chaque nuit | `SELECT COUNT(*) FROM appro_message_snapshots WHERE snapshot_date = '<hier>'` |
| Les 3 codes message sont présents (2, 3, 6) | `SELECT mrpmes, COUNT(*) … GROUP BY mrpmes` |
| Le nombre de messages est stable d'un jour à l'autre (±10 %) | Comparaison sur 3 jours consécutifs |
| Un jour manqué ne corrompt pas les photos suivantes | Simuler un process arrêté, vérifier au redémarrage |
| Le diagnostic CLI rend un compte-rendu lisible | `node ace snapshot:diagnose` |

### Ce que l'approvisionneur voit

**Rien.** Ce lot est invisible côté UI. C'est un investissement en infrastructure
qui débloque les lots suivants. La valeur immédiate : l'équipe IT sait que les
données s'accumulent et peut le vérifier.

### Durée estimée

1 à 2 jours de développement. Aucune dépendance bloquante.

---

## Lot 1 — Analyse basique : le diff J vs J-1 avec attribution causale

### Périmètre

Pour chaque message de replanification apparu ou modifié entre deux runs CBN,
identifier **le facteur qui a changé** pour cet article et l'afficher comme
explication.

C'est le premier lot qui apporte de la valeur à l'approvisionneur.

### Prérequis

- Lot 0 livré : `appro_message_snapshots` accumule l'historique.
- **Il faut au moins 2 photos** pour faire un diff. Le lot devient opérationnel
  dès le 2ᵉ jour de snapshot.
- Les facteurs causaux sont déjà snapshottés dans `demand_snapshots`
  (`stock`, `demande_ferme`, `demande_prevision`, `appro`).

### Livrables

#### 1.1 — Diff des messages de replanification

Nouvelle fonction pure `diffMessageSnapshots(avant, apres)` dans un nouveau
`app/domain/appro_message_diff.ts`. Contrairement au diff des suggestions
(`appro_snapshot_diff.ts`) qui appareille par couple (fournisseur, article),
le diff des messages appareille par **clé stable** `(vcrnum, vcrlin)`.

```typescript
export interface MessageSnapshotRow {
  vcrnum: string
  vcrlin: number
  article: string
  fournisseur: string | null
  mrpmes: number        // 2, 3, 6
  mrpdat: string | null // date proposée
  enddat: string | null // échéance commande
  quantity: number
}

export type MessageDiffNature =
  | 'nouveau'           // message apparu (pas de message sur cette clé hier)
  | 'disparu'           // message disparu (la clé existe mais plus de message)
  | 'code_change'       // le code a changé (ex: retarder → avancer)
  | 'date_change'       // la date proposée a bougé de > seuil
  | 'stable'            // pas de changement significatif

export interface MessageDiffEntry {
  nature: MessageDiffNature
  vcrnum: string
  vcrlin: number
  article: string
  fournisseur: string | null
  avant: { mrpmes: number; mrpdat: string | null; enddat: string | null }
  apres: { mrpmes: number; mrpdat: string | null; enddat: string | null }
  detail: string  // explication en clair
}
```

Les cas intéressants sont `nouveau`, `code_change` et `date_change` : ce sont
eux que l'approvisionneur veut comprendre.

#### 1.2 — Moteur d'attribution causale (v1 : mono-cause)

Pour chaque message modifié, le moteur examine les snapshots des facteurs pour
l'article concerné entre les deux dates et identifie le changement dominant.

Les facteurs examinés (tous déjà dans `demand_snapshots`) :

| Facteur | Source snapshot | Question posée |
|---------|----------------|----------------|
| Stock | `stock` | Le stock strict a-t-il baissé ? |
| Demande ferme | `demande_ferme` | Une commande client a-t-elle été ajoutée/modifiée/supprimée ? |
| Prévision | `demande_prevision` | La prévision a-t-elle bougé ? |
| Réceptions attendues | `appro` | Une réception a-t-elle glissé ou été annulée ? |
| OF consommateurs | `of_ferme`, `of_planifie` | Un OF planifié a-t-il été confirmé (consommation accélérée) ? |

Logique d'attribution (séquentielle, première cause trouvée = cause affichée) :

```typescript
function attribueCause(
  article: string,
  avantDay: string,
  apresDay: string,
  sens: 'avancer' | 'retarder' | 'inutile'
): CauseAttribution | null
{
  // 1. Stock a baissé de plus de X % ? → "Le stock a diminué"
  // 2. Nouvelle demande ferme apparue ? → "Commande client ajoutée"
  // 3. Demande ferme existante a augmenté ? → "Quantité commandée augmentée"
  // 4. Réception attendue a glissé plus loin ? → "Réception repoussée"
  // 5. Réception attendue a disparu ? → "Réception annulée"
  // 6. Prévision a augmenté ? → "Prévision réévaluée à la hausse"
  // (sens inverse pour "retarder" / "inutile")
}
```

Le moteur lit les snapshots depuis SQLite (pas d'appel X3) : c'est rapide,
testable sur fixtures, et indépendant de la disponibilité d'X3.

**Format du résultat :**

```typescript
interface CauseAttribution {
  facteur: 'stock' | 'demande_ferme' | 'demande_prevision' | 'reception' | 'of'
  sens: 'hausse' | 'baisse' | 'apparition' | 'disparition' | 'glissement'
  amplitude: string    // "stock 1200 → 800 (-33 %)" en clair
  delta: number        // numérique, pour le scoring Lot 2
  source: string       // snapshot source examinée
  detail: string       // phrase complète pour l'UI
}
```

#### 1.3 — Endpoint d'explication

```
GET /api/v1/appro/explain?vcrnum=xxx&vcrlin=1
```

Retourne :

```json
{
  "message": {
    "vcrnum": "POF2500001234",
    "vcrlin": 1,
    "article": "AE1-VMC-DC-123",
    "designation": "Moteur VMC Double Flux",
    "fournisseur": "BPR001",
    "mrpmes": 2,
    "mrpdat": "2026-08-20",
    "enddat": "2026-09-03"
  },
  "diff": {
    "nature": "nouveau",
    "avant": null,
    "apres": { "mrpmes": 2, "mrpdat": "2026-08-20", "enddat": "2026-09-03" }
  },
  "cause": {
    "facteur": "stock",
    "sens": "baisse",
    "amplitude": "stock strict 1 200 → 800 (-33 %)",
    "delta": -400,
    "detail": "Le stock strict a chuté de 33 % (1 200 → 800) entre le 04/08 et le 06/08. Le CBN anticipe une rupture avant la date de réception actuelle."
  },
  "comparaison": {
    "avant": "2026-08-04",
    "apres": "2026-08-06"
  }
}
```

#### 1.4 — Interface : panneau d'explication

Sur la page `/approvisionnements`, quand l'approvisionneur clique sur un message
(avancer / retarder / inutile), un panneau latéral s'ouvre avec :

1. **Le message** : code, date proposée, échéance actuelle, décalage en jours.
2. **L'explication** : la cause attribuée, en une phrase claire.
3. **Le détail du facteur** : ce qui a changé exactement (chiffres avant →
   après).
4. **Les deux dates de comparaison** : pour transparence.

Le panneau est alimenté par `GET /api/v1/appro/explain`. Pas de recalcul CBN :
tout vient des snapshots SQLite, réponse < 50 ms.

### Critères de validation

| Critère | Mesure |
|---------|--------|
| Un message « avancer » a une explication causale dans > 80 % des cas | Échantillon de 50 messages sur une semaine |
| L'explication est correcte (validée par l'approvisionneur) | Revue manuelle, 5 messages/jour pendant 1 semaine |
| Le panneau s'ouvre en < 200 ms | Mesure côté navigateur |
| Les messages sans cause identifiée affichent « cause non déterminée » plutôt qu'une explication fabriquée | Revue du code : aucun fallback inventé |

### Jalon métier

**C'est ici que l'approvisionneur commence à utiliser le module.** Le panneau
d'explication répond directement à la question « pourquoi le CBN me dit
d'avancer ? ». La profondeur est limitée (une seule cause, pas de scoring), mais
la valeur est immédiate.

Ce lot nécessite **au moins 2 jours d'historique de snapshots** pour fonctionner.
Si le Lot 0 est livré un lundi, le Lot 1 est opérationnel dès le mercredi.

### Durée estimée

3 à 5 jours de développement. Le diff des messages est mécanique
(1 jour), le moteur d'attribution est le cœur métier (2 jours), l'UI est un
panneau latéral (1 à 2 jours).

---

## Lot 2 — Analyse approfondie : multi-causes, scoring de confiance, patterns

### Périmètre

Passer de l'attribution mono-cause à une analyse multi-facteurs avec scoring de
confiance, et commencer à détecter des patterns récurrents dans l'historique.

### Prérequis

- Lot 1 livré et utilisé depuis **au moins 3 semaines** (≈ 15 diffs
  cumulés). C'est le minimum pour calibrer les seuils d'attribution.
- Retours d'expérience des approvisionneurs sur les explications du Lot 1 :
  faux positifs, causes manquantes, explications confuses.

### Livrables

#### 2.1 — Attribution multi-causes

Le moteur du Lot 1 s'arrête à la première cause trouvée. En réalité, un
message « avancer » peut résulter de plusieurs facteurs simultanés : stock en
baisse ET nouvelle commande client ET réception glissée.

Nouveau moteur : examiner **tous** les facteurs, les classer par amplitude
relative, et présenter les 1 à 3 causes principales.

```typescript
interface CauseScoree extends CauseAttribution {
  poids: number       // 0-100, proportion de l'explication
  confiance: number   // 0-1, qualité de l'attribution
}

interface ExplicationMultiCause {
  causes: CauseScoree[]      // triées par poids décroissant
  causesInexpliquees: number // résidu non attribué
  synthese: string           // phrase résumant les 1-3 causes principales
}
```

Logique de pondération : chaque facteur contribue proportionnellement à son
amplitude relative. Si le stock a baissé de 400 unités et qu'une commande de
200 unités est apparue, le stock pèse ~67 % et la commande ~33 %.

Le scoring de confiance dépend de :
- **Couverture** : quelle part de la variation du besoin est expliquée par les
  facteurs identifiés (le reste = inexpliqué = confiance basse).
- **Corroboration** : est-ce que d'autres facteurs vont dans le même sens ?
  (un seul facteur qui bouge = explication moins robuste que plusieurs
  convergeants).
- **Historique** : est-ce que ce type de message pour cet article a déjà eu la
  même cause dans le passé ? (apprentissage sur les patterns).

#### 2.2 — Détection de patterns

Avec 3+ semaines d'historique, des patterns émergent :

- **Articles volatils** : certains articles reçoivent des messages de
  replanification presque tous les jours. Leur explication importe moins —
  c'est du bruit structurel. Le module peut les signaler et baisser leur
  priorité.
- **Causes récurrentes** : si un article reçoit systématiquement « avancer »
  à cause du stock, le module peut l'afficher en tête : « Cet article est
  fréquemment en rupture de stock — envisager un stock de sécurité. »
- **Fournisseurs problématiques** : si un fournisseur a 80 % de ses messages
  liés à des réceptions glissantes, c'est un signal fournisseur, pas un signal
  CBN.

```typescript
interface PatternArticle {
  article: string
  designation: string
  frequenceMessages: number      // messages/semaine en moyenne
  causeDominante: string | null  // 'stock' si > 60 % des cas
  volatilite: 'haute' | 'moyenne' | 'basse'
  recommandation: string | null  // suggestion actionnable
}
```

#### 2.3 — Calibrage par retour acheteur

Le ledger de décisions (`appro_decision_ledger`) existe déjà et capture les
décisions (vu / ignorer / à passer). En Lot 2, on l'exploite comme **signal de
calibrage** :

- Si l'acheteur clique « ignorer » sur un message que le module explique par
  « stock en baisse », et que ça arrive systématiquement pour le même
  fournisseur, c'est un signal que le seuil de stock est trop conservateur — ou
  que l'explication est mauvaise.
- Le `estOverride()` dans `appro_decision.ts` détecte déjà ces contradictions.
  En Lot 2, on agrège les overrides par cause et par article pour identifier
  les explications systématiquement rejetées.

Tableau de bord d'auto-évaluation :

| Métrique | Formule | Action si dégradée |
|----------|---------|-------------------|
| Taux d'override par cause | `ignorer / total` groupé par facteur | Si > 40 % : la cause est probablement fausse, recalibrer |
| Taux d'inexpliqué | `causesInexpliquees > 0` sur tous les messages | Si > 30 % : facteur manquant, examiner |
| Concordance cause→action | `a_passer` quand cause = stock baisse | Si < 50 % : l'acheteur ne fait pas confiance à la cause |

#### 2.4 — Interface enrichie

Le panneau du Lot 1 évolue :

1. **Multi-causes** : au lieu d'une seule phrase, une liste ordonnée des causes
   avec leur poids visuel (barre horizontale proportionnelle).
2. **Score de confiance** : un indicateur visuel (vert/jaune/rouge) sur la
   qualité de l'explication.
3. **Contexte historique** : « Cet article a reçu 7 messages similaires ce
   mois-ci, toujours liés au stock. »
4. **Vue patterns** : un onglet « Tendances » qui montre les articles/fournisseurs
   les plus volatils et les causes dominantes agrégées.

### Critères de validation

| Critère | Mesure |
|---------|--------|
| L'explication multi-causes couvre > 90 % de la variation dans > 70 % des cas | Échantillon de 100 messages |
| Le taux d'inexpliqué est < 25 % | Mesure automatisée sur 2 semaines |
| Le taux d'override baisse vs Lot 1 | Comparaison avant/après sur 2 semaines |
| Les patterns identifiés sont reconnus par les acheteurs comme réels | Revue en atelier |

### Jalon métier

Le module devient un **outil d'aide à la décision quotidien et fiable**.
L'approvisionneur ne consulte plus seulement le « quoi » (le message) mais
aussi le « pourquoi » (les causes, leur poids, la confiance). Les patterns
donnent une vue stratégique (quels fournisseurs poser problème, quels articles
sont structurellement volatils).

### Durée estimée

1,5 à 2 semaines. Le moteur multi-causes est l'évolution du Lot 1 (3 jours),
la détection de patterns est nouvelle mais lecture-only sur l'historique
(2 jours), le calibrage par ledger est analytique (2 jours), l'UI enrichie
demande un effort frontend significatif (3 jours).

---

## Vision long terme — Vers l'agentique

### Périmètre

Un agent IA qui analyse les besoins et propose (voire exécute) les actions
d'approvisionnement. Ce n'est pas le MVP — c'est la destination.

### Prérequis

- Lot 2 stabilisé depuis **au moins 1 trimestre** (≈ 65 diffs cumulés).
- Taux d'override < 20 % (l'acheteur fait confiance aux explications).
- Accord métier explicite pour déléguer tout ou partie des décisions.

### Étapes progressives vers l'autonomie

#### Étape A — Agent consultatif (humain-in-the-loop)

L'agent analyse chaque message, propose une action (avancer / retarder /
annuler / ignorer), avec son raisonnement basé sur les causes du Lot 2.
L'approvisionneur valide ou refuse. Chaque validation enrichit l'historique de
décisions.

```
Agent : « Message "avancer" sur PO de BPR001 pour Moteur VMC.
         Cause : stock -33 %, commande client +500 unités (confiance 0,87).
         Recommandation : avancer la réception au 20/08.
         Rationale : sans avancement, rupture de stock estimée au 18/08. »

Acheteur : [Valider] [Refuser] [Voir le détail]
```

Techniquement : un LLM (Claude/GPT) alimenté par le contexte structuré du Lot 2
(causes, patterns, historique). Le prompt est deterministe et sourcé — pas
d'hallucination possible car toutes les affirmations viennent des snapshots.

#### Étape B — Agent semi-autonome

Pour les décisions à **faible enjeu** (messages sur articles non critiques,
décalages < seuil), l'agent agit et notifie. Pour les décisions à enjeu
(articles critiques, gros montants), il propose et attend validation.

Classification automatique de l'enjeu :
- **Criticité article** (A/B/C) — dérivée de la valeur et de la fréquence.
- **Amplitude du décalage** — un décalage de 2 jours est moins risqué que 30.
- **Historique de override** — si l'acheteur a toujours validé ce type
  d'action pour cet article, confiance élevée.

#### Étape C — Agent autonome supervisé

L'agent prend toutes les décisions d'approvisionnement. L'acheteur supervise
via un tableau de bord d'exception : il n'intervient que sur les anomalies
détectées par le système de monitoring.

C'est la vision long terme décrite par l'utilisateur. Le chemin pour y arriver
passe par une **accumulation de confiance** mesurée par le taux de validation
humaine à chaque étape.

### Ce qui ne change pas

Même en mode agentique, les snapshots restent la source de vérité. L'agent
consulte le même historique que l'approvisionneur humain. La différence est
dans l'interface (dialogue vs tableau) et dans la délégation d'exécution, pas
dans l'analyse sous-jacente.

---

## Traitements des composants v1 existants

### Triage déterministe (`appro_triage.ts`) — REFORMULER

**Verdict : à reformuler, pas à supprimer.**

Le triage actuel (`passer / surveiller / regrouper / replanifier /
investiguer`) priorise par urgence temporelle. La logique est saine mais elle
ne répond pas à la question du nouveau module (« pourquoi ? »).

**Nouveau rôle** : le triage devient un **priorisateur de messages à
expliquer**. Au lieu de trier toutes les lignes par échéance, il trie les
**messages modifiés** par :

1. **Amplitude du changement** — un message qui passe de « retarder » à
   « avancer » est plus prioritaire qu'un décalage de 2 jours.
2. **Criticité de l'article** — un message sur un article de classe A avant
   un consommable.
3. **Confiance de l'explication** — un message bien expliqué (confiance
   élevée) avant un message inexpliqué (l'acheteur doit investiguer).

Le code de scoring (`scoreUrgence`) reste utile comme **axe secondaire** dans
le dossier fournisseur (trier par échéance au sein du dossier), mais il cesse
d'être l'axe principal.

**Concrètement** : `appro_triage.ts` est renommé/refondu en
`appro_priorisation.ts`. Le moteur `triagePayload()` devient
`prioriseMessages()`. Les tests existants sur les scores d'urgence sont gardés
(sous-ensemble du nouveau moteur). Les verdicts `passer / surveiller /
regrouper` sont retirés (ils triaient des suggestions, pas des messages).

### Ledger de décisions (`appro_decision_ledger`) — GARDER ET ÉTENDRE

**Verdict : précieux, à conserver intégralement.**

Le ledger capture la décision humaine (vu / ignorer / à passer). C'est :

1. **L'input du calibrage Lot 2** — les overrides mesurent la qualité des
   explications.
2. **Le sol d'apprentissage de l'agentique** — chaque décision validée est un
   exemple pour l'agent futur.
3. **La traçabilité** — qui a décidé quoi, quand, sur quelle base.

**Extension en Lot 2** : ajouter une colonne `cause_predit` (le facteur que le
moteur a identifié) et `confiance_predit` (le score). Quand l'acheteur décide,
on enregistre aussi ce que le moteur avait dit — pour mesurer la corrélation
a posteriori.

```sql
ALTER TABLE appro_decision_ledger ADD COLUMN cause_predit TEXT;
ALTER TABLE appro_decision_ledger ADD COLUMN confiance_predit REAL;
```

### Dossiers fournisseur (`appro.ts` — `buildApproPayload`) — GARDER

**Verdict : la structure est juste, l'usage change.**

Le regroupement par fournisseur reste l'unité de décision. Ce qui change :

- Les **suggestions** descendent en arrière-plan (elles sont le bruit de fond
  du CBN, pas l'objet du module).
- Les **messages** deviennent le contenu principal du dossier.
- Chaque message porte son **explication** (Lot 1/2) plutôt qu'un verdict de
  tri.

Le code de `appro.ts` reste : `buildApproPayload`, `filtreFenetreDerivee`,
`construitDossier` — tout est réutilisable. Le champ `ApproItem.triage` est
remplacé par `ApproItem.explication` (le résultat du moteur d'attribution).

### Frontend (`approvisionnements.tsx`) — REFOUNDER PROGRESSIVEMENT

**Verdict : refonte par étapes, pas de big-bang.**

La page actuelle (810 lignes) rend une pile de feuilles de préparation
fournisseur avec verdicts. La refonte se fait en parallèle des lots backend :

- **Fin Lot 1** : ajouter le panneau d'explication (panneau latéral, pas de
  refonte de la page).
- **Fin Lot 2** : transformer la liste des verdicts en liste d'explications,
  ajouter l'onglet « Tendances ».
- **Vision long terme** : transformer en interface de dialogue avec l'agent.

Aucune réécriture big-bang : chaque lot ajoute une couche sans casser la
précédente.

### Payload loader (`appro_payload_loader.ts`) — GARDER LE PATTERN

Le pattern cache SWR + rattachement hors cache des décisions est sain. Il est
étendu pour rattacher aussi les explications (qui viennent des snapshots
SQLite, pas de X3 — donc rapides et toujours disponibles).

---

## Synthèse : chronogramme de livraison

```
Semaine 1   : Lot 0 — Infrastructure (snapshots messages)
               ↓ Accumulation silencieuse de l'historique
Semaine 2-3 : Lot 1 — Diff + attribution mono-cause + panneau d'explication
               ↓ JALON : l'approvisionneur commence à utiliser le module
Semaine 4-8 : Stabilisation du Lot 1, collecte des retours
               ↓ ~15 diffs cumulés
Mois 2-3    : Lot 2 — Multi-causes + scoring + patterns + auto-évaluation
               ↓ JALON : outil d'aide à la décision fiable et quotidien
Mois 4-6    : Stabilisation, calibrage, accumulation d'historique (~65 diffs)
               ↓
Trimestre 2 : Vision long terme — Agent consultatif (humain-in-the-loop)
               ↓
Trimestre 3+ : Agent semi-autonome → autonome supervisé
```

### Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Snapshot manqué (panne X3, process arrêté) | Moyenne | Perte d'un jour d'historique, irrécupérable | Garde automatique au boot + alerting si pas de photo à 06h00 |
| Attribution causale fausse (corrélation ≠ causalité) | Élevée | Perte de confiance de l'acheteur | Toujours afficher la confiance ; le Lot 2 calibre via les overrides |
| L'acheteur n'utilise pas le module | Moyenne | Investissement perdu | Impliquer dès le Lot 1 ; le panneau d'explication répond à un besoin exprimé |
| Dérive du schéma X3 (mise à jour Sage) | Faible | Extraction cassée | Les SQL sont isolés dans `appro_repository.ts`, faciles à adapter |
| Volume de snapshots (SQLite) | Faible | ~30k lignes/jour × 365 jours ≈ 11M lignes/an | Purge après 18 mois (horizon max du CBN) ; index couvrants |

---

## Annexe : correspondance entre composants existants et lots

| Composant | Lot 0 | Lot 1 | Lot 2 | Long terme |
|-----------|-------|-------|-------|------------|
| `demand_snapshot_service.ts` | + source `appro_message` | inchangé | inchangé | inchangé |
| `appro_snapshot_diff.ts` | inchangé | inchangé (diff suggestions) | inchangé | inchangé |
| `appro_message_diff.ts` | — | **créé** | étendu (multi-causes) | alimente l'agent |
| `appro_repository.ts` | inchangé | inchangé | inchangé | inchangé |
| `appro.ts` (payload) | inchangé | `triage` → `explication` | enrichi (patterns) | enrichi (recommandations agent) |
| `appro_triage.ts` | inchangé | renommé `appro_priorisation.ts` | étendu (scoring confiance) | remplacé par agent |
| `appro_decision.ts` (ledger) | inchangé | inchangé | + colonnes cause/confiance | source d'apprentissage |
| `appro_payload_loader.ts` | inchangé | + rattachement explications | + rattachement patterns | + recommandations agent |
| `appro_controller.ts` | inchangé | + `GET /explain` | + `GET /patterns` | + `POST /agent/propose` |
| `approvisionnements.tsx` | inchangé | + panneau latéral | + onglet Tendances | + dialogue agent |
| `demand_snapshot_provider.ts` | inchangé | inchangé | + alerting | inchangé |
| `snapshot:run` (CLI) | inchangé | inchangé | inchangé | inchangé |
| `snapshot:diagnose` (CLI) | **créé** | inchangé | inchangé | inchangé |
