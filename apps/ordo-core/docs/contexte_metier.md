# Contexte Métier — Ordo v2

Référence consolidée de tout le contexte métier du système d'ordonnancement de production.
Sert de base pour le system prompt de l'agent LLM.

---

## 1. Vue d'ensemble

Ordo v2 est un système d'aide à la décision pour un **ordonnanceur de production manufacturière**. Il opère sur des données ERP (Sage X3) exportées en CSV et assiste l'ordonnanceur dans trois activités hebdomadaires :

1. **Réunion de charge** (chaque mardi) — décider l'organisation des ateliers (1×8, 2×8, 3×8) pour S+1 à S+3.
2. **Affermissement des OF** — valider quels ordres de fabrication lancer en production cette semaine.
3. **Matching commandes → OF** — s'assurer que chaque commande client NOR/MTO est couverte par un OF.

Le système ne modifie pas l'ERP directement : il **propose des décisions** que l'ordonnanceur valide et saisit manuellement.

---

## 2. Structure des données

### 2.1 Fichiers statiques (référentiels)

| Fichier | Rôle |
|---------|------|
| `Articles.csv` | Catalogue produits — type d'appro (ACHAT / FABRICATION), délai réappro |
| `Nomenclatures.csv` | Arbre de nomenclature article parent → composants (couverture 84% des articles FABRICATION) |
| `Gammes.csv` | Gammes de production — poste de charge + cadence (u/h) par article |

Chemin : configuré via `ORDO_EXTRACTIONS_DIR`

### 2.2 Fichiers dynamiques (données vivantes)

| Fichier | Rôle |
|---------|------|
| `Ordres de fabrication.csv` | Ordres de fabrication (en-têtes) |
| `Besoins Clients.csv` | Commandes et prévisions clients |
| `Stocks.csv` | Niveaux de stock par article |
| `Commandes Achats.csv` | Réceptions fournisseurs attendues |

Chemin : configuré via `ORDO_EXTRACTIONS_DIR`

### 2.3 Colonnes clés par table

#### articles.csv
```
ARTICLE          → Code article (PK)
TYPE_APPRO       → "ACHAT" | "FABRICATION"
DELAI_REAPPRO    → Délai fournisseur (jours)
```

#### of_entetes.csv
```
NUM_OF           → Numéro OF (PK)
ARTICLE          → Article à fabriquer
STATUT_NUM_OF    → 1 = Ferme/Affermi | 3 = Suggéré  [attention: espace en tête possible]
DATE_FIN         → Date de fin prévue (format JJ/MM/AAAA)
QTE_RESTANTE     → Quantité restante à produire
```

#### besoins_clients.csv
```
NUM_COMMANDE               → Numéro commande
NOM_CLIENT                 → Nom du client
ARTICLE                    → Article commandé
QTE_RESTANTE               → Quantité restant à servir
DATE_EXPEDITION_DEMANDEE   → Date d'expédition souhaitée
TYPE_COMMANDE              → "MTS" | "NOR" | "MTO"
```

#### nomenclatures.csv
```
Article parent     → Article fabriqué
Article composant  → Code composant
Qté lien           → Quantité de composant pour 1 unité parent (peut être décimale)
Type article       → "Acheté" | "Fabriqué"
Niveau             → Profondeur dans l'arbre (5, 10, 15, 20…)
```

#### stock.csv
```
ARTICLE          → Code article
STOCK_PHYSIQUE   → Quantité physique en stock
STOCK_ALLOUE     → Quantité réservée pour des OFs existants
STOCK_BLOQUE     → Quantité en contrôle qualité (temporairement indisponible)
```

Stock disponible net = `STOCK_PHYSIQUE − STOCK_ALLOUE − STOCK_BLOQUE`

#### gammes.csv
```
ARTICLE          → Article fabriqué
POSTE_CHARGE     → Code poste (ex: PP_095)
LIBELLE_POSTE    → Description lisible
CADENCE          → Unités produites par heure (u/h)
```

Charge en heures = `QTE_RESTANTE / CADENCE`

---

## 3. Types de commandes

### 3.1 MTS — Make To Stock (TYPE_COMMANDE = "MTS")
- Contre-marque obligatoire : lien direct `OF_CONTREMARQUE` → `NUM_OF`
- Un OF dédié (WOP) est créé pour chaque commande
- Allocation du stock **automatique** via le lien OF ↔ commande
- Client principal : ALDES (41% des commandes)
- Workflow : Commande → WOP créé → Affermi → Fabrication → Stock → Expédition automatique

### 3.2 NOR / MTO — Normal / Make To Order (TYPE_COMMANDE = "NOR" | "MTO")
- Pas de contre-marque, pas de lien direct commande → OF
- Les OFs sont générés par le moteur CBN/MRP en regroupant les besoins par article et par semaine (WOS = Work Order Suggested)
- Allocation du stock **manuelle** par l'ordonnanceur
- 14 clients différents (NOR = tous sauf ALDES, MTO = ALDES avec flag 1)
- Workflow : Commandes → CBN/MRP regroupe → WOS → Affermi par ordonnanceur → Fabrication → Stock → Allocation manuelle → Expédition

**Différence opérationnelle clé** : Pour les commandes NOR/MTO, l'ordonnanceur doit manuellement vérifier quelles commandes sont couvertes par quels OFs.

---

## 4. Statuts et cycle de vie des OF

| Code | Texte | Signification |
|------|-------|---------------|
| 1 | Ferme / Affermi / WOP | OF lancé en production — prioritaire pour le matching commandes |
| 3 | Suggéré / WOS | OF proposé par le CBN/MRP — peut être affermi ou annulé |

### Règle d'affermissement
**INTERDIT** d'affermir un OF si un composant de type ACHAT est en rupture.

**AUTORISÉ** si le composant manquant est de type FABRICATION (car on peut lancer un OF pour ce sous-ensemble).

**Récursif** : si le composant FABRICATION a lui-même des composants ACHAT en rupture → blocage remonte.

---

## 5. Algorithmes clés

### 5.1 Vérification de faisabilité d'un OF (récursive)

Objectif : déterminer si un OF peut être lancé en production.

```
Pour chaque OF à vérifier :
  1. Récupérer la nomenclature de l'article (nomenclatures.csv)
     Si nomenclature absente → ALERTE (16% des articles FABRICATION)

  2. Pour chaque composant :
     Si TYPE = "Acheté" :
       stock_net = stock_physique − stock_alloue − stock_bloque
       Si mode "projete" : ajouter réceptions fournisseurs dont date ≤ date_fin OF
       Si stock_net ≥ besoin → OK
       Sinon → BLOQUÉ (composant manquant listé)
     Si TYPE = "Fabriqué" :
       Récursion sur les composants de CE composant

  3. Résultat :
     FAISABLE  → tous composants couverts
     BLOQUÉ    → au moins 1 composant ACHAT manquant
     PARTIEL   → certains composants OK, d'autres bloqués
     ALERTE    → nomenclature absente ou récursion max atteinte (MAX_DEPTH = 10)
```

**Deux modes de vérification :**
- `immediat` : stock physique actuel uniquement
- `projete` : stock + réceptions fournisseurs prévues avant la date de besoin

### 5.2 Gestion de la concurrence entre OF sur les composants

Quand plusieurs OF nécessitent le même composant, un **stock virtuel** est géré avec allocation séquentielle. L'ordre de priorité :

1. **Date de fin croissante** — l'OF qui finit le plus tôt passe en premier
2. **Faisabilité** — un OF complètement faisable avec le stock restant passe avant un OF prioritaire mais non faisable

Objectif : maximiser le nombre d'OFs complètement faisables, pas respecter strictement l'ordre chronologique.

Exemple :
```
Stock composant X : 50 u
OF A (10/03) besoin 40 → Faisable → alloue 40 → reste 10
OF B (12/03) besoin 20 → Pas faisable (10 < 20) → différé
OF C (14/03) besoin 30 → Pas faisable → différé

Résultat : OF A validé, OF B et C différés
```

### 5.3 Matching commandes NOR/MTO → OF

Algorithme de matching pour les commandes NOR/MTO (traitées par ordre de date d'expédition croissante) :

```
Pour chaque commande (triée par DATE_EXPEDITION_DEMANDEE croissante) :

  1. Allouer le stock disponible
     stock_alloue = min(qte_restante_commande, stock_virt[article])
     besoin_net = qte_restante − stock_alloue

  2. Si besoin_net = 0 → COUVERT_STOCK

  3. Vérifier le type article (articles.csv TYPE_APPRO)
     Si ACHAT → BESOIN_APPRO (pas d'OF, besoin de commande fournisseur)

  4. Si FABRICATION → chercher OFs disponibles
     Priorité OF : Affermi (statut 1) > Suggéré (statut 3)
     Tri secondaire : écart date_fin OF / date_exp commande croissant
     Tri tertiaire : quantité restante décroissante

  5. Allouer séquentiellement les OFs jusqu'à couvrir le besoin_net
     Un OF peut être partagé entre plusieurs commandes (OFConso)

  6. Statuts résultants :
     COUVERT_OF_AFFERMI  → couvert par OF(s) affermi(s) uniquement
     COUVERT_OF_SUGGERE  → couvert par OF(s) suggéré(s) uniquement
     COUVERT_OF_MIXTE    → mix affermi + suggéré
     PARTIEL             → partiellement couvert
     NON_COUVERT         → aucun OF disponible pour cet article FABRICATION
```

**Performance observée** : 98.2% de taux de service sur 656 commandes NOR/MTO.

### 5.4 Analyse de charge par poste

Calcul de la charge hebdomadaire par poste de travail :

```
Pour chaque OF avec DATE_FIN dans la fenêtre S+1 à S+N :
  Pour chaque opération de la gamme (gammes.csv) :
    heures[poste][semaine] += QTE_RESTANTE / CADENCE

Capacités théoriques (base 5 jours, 8h/jour) :
  1×8 → 40 h/semaine
  2×8 → 80 h/semaine
  3×8 → 120 h/semaine

Statut poste :
  taux_2x8 ≤ 80%   → OK
  taux_2x8 ≤ 100%  → TENSION
  taux_2x8 > 100%  → GOULOT

Recommandation organisation S+1 :
  taux_max ≤ 80%   → 1×8 suffisant
  taux_max ≤ 100%  → 2×8 recommandé
  taux_max ≤ 130%  → 2×8 obligatoire + priorisation
  taux_max > 130%  → 3×8 nécessaire
```

### 5.5 Projection de stock sur horizon S+1 → S+4

```
Pour chaque article avec mouvement :
  stock_courant = stock_physique − stock_alloue − stock_bloque

  Pour chaque semaine S+i :
    entrees = réceptions fournisseurs + productions OF finissant cette semaine
    sorties = besoins commandes clients + consommation composants (achetés) des OF
    stock_fin = stock_courant + entrees − sorties
    Si stock_fin < 0 et pas encore de rupture → rupture_semaine = S+i
    stock_courant = stock_fin

  Statuts :
    RUPTURE → stock_fin < 0 à une semaine donnée
    TENSION → couverture_semaines < 1.0 (paramétrable)
    OK      → mouvements existants, pas de tension
    STABLE  → aucun mouvement
```

---

## 6. Couche décision agent (LLMDecisionAgent)

### 6.1 Deux modes de décision

**Mode SmartRule (algo pur)** — scoring pondéré multi-critères :

| Critère | Poids | Ce qu'il mesure |
|---------|-------|-----------------|
| `completion` | 0.5 | Taux de couverture des composants (stock net / besoin) |
| `client` | 0.3 | Priorité du client (ALDES = prioritaire, AERECO / PARTN-AIR = stratégiques) |
| `urgency` | 0.2 | Urgence temporelle (jours jusqu'à date fin OF) |

Score pondéré → action :
- ≥ 0.7 → ACCEPT_AS_IS
- ≤ 0.3 → REJECT
- entre → ACCEPT_PARTIAL (quantité = `qte_restante × 0.95`, arrondi)

Une suggestion explicite d'un critère prime sur les seuils.

**Mode LLM** — analyse contextuelle riche transmise au LLM avec :
- Tableau composants (stock physique, alloué total, alloué à CET OF, bloqué, disponible, net, ratio couverture, réceptions)
- Composants critiques classifiés
- Situation globale (faisable / faisable_avec_conditions / faisable_apres_reception / non_faisable)
- OFs concurrents
- Urgence commande client

### 6.2 Actions possibles (décision par OF)

| Action | Signification |
|--------|---------------|
| `ACCEPT_AS_IS` | OF faisable tel quel, lancer la production |
| `ACCEPT_PARTIAL` | OF partiellement faisable, accepter quantité réduite |
| `DEFER` | OF reportable, faisable dans quelques jours |
| `DEFER_PARTIAL` | Reporter + accepter une partie immédiatement |
| `REJECT` | OF non faisable sans perspective de déblocage |

### 6.3 Calcul du stock net pour un OF

```
stock_net_pour_of = stock_disponible + stock_alloue_cet_of
```

Avec :
- `stock_disponible = stock_physique − stock_alloue_total − stock_bloque`
- `stock_alloue_cet_of` = ce qui est déjà réservé dans `allocations.csv` pour CET OF précis

Le stock_bloque (contrôle qualité) est TEMPORAIREMENT indisponible mais potentiellement libérable. C'est une situation différente d'une rupture vraie.

### 6.4 Classification des composants critiques

| Seuil ratio couverture | Type problème | Gravité | Action suggérée |
|------------------------|---------------|---------|-----------------|
| < 50% | rupture | critique | approvisionner |
| 50% – 80% | insuffisant | moyen | surveiller |
| situation = "bloqué" | bloqué | critique | débloquer (accélérer CQ) |

### 6.5 Niveaux d'urgence commande

| Jours avant expédition | Urgence |
|------------------------|---------|
| ≤ 2 | TRES ELEVEE |
| ≤ 5 | ELEVEE |
| ≤ 10 | NORMALE |
| > 10 | FAIBLE |

### 6.6 Pré-filtres (bypass LLM pour cas triviaux)

Avant d'appeler le LLM, un pré-filtre court-circuite pour les cas évidents :
- OF 100% faisable → ACCEPT_AS_IS immédiat
- OF avec rupture vraie + client non prioritaire → REJECT immédiat
- OF affermi (statut 1) avec tolérance 2% → ACCEPT_AS_IS si gap ≤ 2%

### 6.7 Configuration LLM

| Paramètre | Valeur par défaut |
|-----------|------------------|
| Provider | mock (dev) / mistral (prod) |
| Modèle Mistral | mistral-large-latest |
| Modèle Anthropic | claude-3-5-sonnet-20241022 |
| Température | 0.3 |
| Max tokens | 2000 |
| Max retries | 3 |
| Retry delay | 1s (max 10s) |
| Min confidence | 0.5 |

---

## 7. Agent planificateur de charge (SchedulingAgent)

Objectif : optimiser la charge de travail sur S+1 en avançant des OFs S+2/S+3 pour combler les creux.

```
1. Extraire les composants en rupture depuis les résultats S+1
2. Calculer la charge S+1 par poste (heures / poste)
3. Identifier les postes en gap (charge < cible × 90%)
4. Chercher des OFs S+2/S+3 faisables pour ces postes
5. Scorer les candidats :
   - Urgence commande associée : 50% du score composite
   - Overlap composants avec OFs déjà planifiés : 30%
   - Faisabilité : 20%
6. Sélectionner les candidats jusqu'à atteindre la cible (±10%)
7. LLM optionnel pour justification narrative du plan
```

**Paramètres SchedulingConfig :**
```
hours_per_day      = 7.0 h/jour
days_per_week      = 5 jours
target_weekly_h    = 35.0 h/semaine par poste
tolerance_pct      = 10%
min_weekly_h       = 31.5 h (90% de la cible)
max_weekly_h       = 38.5 h (110% de la cible)
```

---

## 8. Constantes et seuils numériques

| Catégorie | Paramètre | Valeur |
|-----------|-----------|--------|
| Récursion | MAX_DEPTH nomenclature | 10 niveaux |
| Faisabilité | Seuil ratio critique | 50% |
| Faisabilité | Seuil ratio moyen | 80% |
| Faisabilité | Couverture projetée | seuil_alerte = 1.0 semaine |
| Décision | Seuil accept | 0.7 |
| Décision | Seuil reject | 0.3 |
| Décision | Taux completion min | 80% |
| Décision | Taux completion cible | 95% |
| Décision | Gap absolu max | 10 unités |
| Urgence | Très urgent | ≤ 3 jours |
| Urgence | Urgent | ≤ 7 jours |
| Urgence | Confortable | ≤ 21 jours |
| Urgence | Tolérance très urgent | 5% gap max |
| Urgence | Tolérance urgent | 2% gap max |
| Client | Gap max client prioritaire | 5% |
| Charge | Capacité 1×8 | 40 h/semaine |
| Charge | Capacité 2×8 | 80 h/semaine |
| Charge | Capacité 3×8 | 120 h/semaine |
| Charge | Seuil TENSION (taux_2x8) | > 80% |
| Charge | Seuil GOULOT (taux_2x8) | > 100% |
| Scheduling | Jours/semaine | 5 |
| Scheduling | Heures/jour | 7 h |
| Scheduling | Cible hebdo | 35 h/poste |
| Scheduling | Tolérance | ±10% |
| Réceptions | Horizon contexte LLM | date_fin OF + 14 jours |
| LLM | Confiance min | 0.5 |
| LLM | Raison max | 500 caractères |

---

## 9. Clients et priorités

| Client | Statut | Type commande |
|--------|--------|---------------|
| ALDES (80001) | Prioritaire | MTS (FLAG 5) + MTO (FLAG 1) |
| AERECO | Stratégique | NOR (FLAG 1) |
| PARTN-AIR | Stratégique | NOR (FLAG 1) |
| Autres (11 clients) | Standard | NOR/MTO (FLAG 1) |

---

## 10. Glossaire

| Terme | Définition |
|-------|-----------|
| **OF** | Ordre de Fabrication |
| **WOP** | Work Order Planned — OF Ferme/Affermi |
| **WOS** | Work Order Suggested — OF Suggéré par CBN/MRP |
| **CBN/MRP** | Calcul des Besoins Nets / Material Requirements Planning |
| **Contre-marque** | Lien obligatoire commande MTS ↔ OF (champ OF_CONTREMARQUE) |
| **Affermir** | Valider un WOS et le lancer officiellement en production |
| **Stock bloqué** | Stock en contrôle qualité — temporairement indisponible |
| **Stock net** | Stock disponible + stock déjà alloué à CET OF précis |
| **Goulot** | Poste de charge saturé (taux > 100% en 2×8) |
| **S+1** | Semaine suivant la semaine de référence |
| **Horizon** | Nombre de semaines futures analysées (généralement 3 à 4) |
| **Taux de service** | % de commandes complètement couvertes / total commandes |
| **Rupture** | Stock insuffisant sans perspective de déblocage |
| **Tension** | Stock insuffisant mais couvrable (réceptions prévues ou faible délai) |
| **ACHAT** | Article approvisionné chez un fournisseur externe |
| **FABRICATION** | Article produit en interne (nomenclature connue) |
| **OFConso** | Objet de suivi de consommation d'un OF partagé entre commandes |

---

## 11. Flux de données dans le pipeline S+1

```
Données CSV
    ↓
DataLoader (chargement + validation)
    ↓
[1] Matching NOR/MTO → OF (CommandeOFMatcher)
         besoins_clients + of_entetes + stock + articles
         → Taux de service, commandes non couvertes
    ↓
[2] Vérification faisabilité (ProjectedChecker)
         of_entetes + nomenclatures + stock + receptions_oa
         → FAISABLE / BLOQUÉ / PARTIEL / ALERTE par OF
    ↓
[3] Décision par OF (AgentEngine)
         Mode SmartRule : scoring pondéré multi-critères
         Mode LLM : contexte complet → Mistral/Claude/OpenAI
         → ACCEPT_AS_IS / ACCEPT_PARTIAL / DEFER / REJECT
    ↓
[4] Planification de charge (SchedulingAgent)
         OF S+1 faisables + gammes
         → Charge par poste, gap detection, avancement OFs S+2/S+3
    ↓
[5] Organisation atelier (OrganizationAgent)
         Charge calculée + tendances historiques
         → Recommandation 1×8 / 2×8 / 3×8
    ↓
Rapport hebdomadaire (rapport_s1.py)
```

---

## 12. Limitations connues et cas limites

| Limitation | Impact | Gestion actuelle |
|------------|--------|-----------------|
| 16% des articles FABRICATION sans nomenclature | Vérification récursive impossible | Statut ALERTE + vérification manuelle |
| Stock bloqué traité différemment selon le module | Incohérence possible | `stock_bloque` exclu dans les scripts skills, inclus dans `Stock.disponible()` |
| Nomenclature non récursive dans le matching | Composants sous-jacents non vérifiés | Vérification séparée via `verif_faisabilite` |
| Pas de lien direct NOR/MTO commande → OF | Allocation manuelle requise | Matching algo séparé |
| Délais appro > 28j vs commandes à 15-21j | Appros sur prévisions, pas sur commandes | Hors scope Ordo v2 |
