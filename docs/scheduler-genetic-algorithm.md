# Ordonnancement V2 — Algorithme Génétique

> Document de fondation. Aucune ligne de code n'est écrite à ce stade.
> Objectif : poser les bases conceptuelles, l'architecture, et le protocole
> d'évaluation d'un scheduler basé sur un algorithme génétique (AG).

---

## Table des matières

1. [Diagnostic de l'algorithme actuel](#1-diagnostic-de-lalgorithme-actuel)
2. [Pourquoi un algorithme génétique](#2-pourquoi-un-algorithme-génétique)
3. [Formalisation du problème](#3-formalisation-du-problème)
4. [Conception de l'AG — Fondations](#4-conception-de-lag--fondations)
5. [Évaluation et protocole de comparaison](#5-évaluation-et-protocole-de-comparaison)
6. [Plan d'implémentation par phases](#6-plan-dimplémentation-par-phases)
7. [Risques et mitigeations](#7-risques-et-mitigeations)

---

## 1. Diagnostic de l'algorithme actuel

### 1.1 Architecture

L'algo V1 est un pipeline séquentiel en 7 phases :

```
Données ERP
  → Matching Commande/OF (algorithms/matching.py)
  → Sélection candidats (engine._select_candidates_from_matching)
  → Calcul capacité + lissage (engine, lignes 125-176)
  → Ordonnancement jour×ligne (GenericLineScheduler.schedule_day)
  → KPIs (score pondéré)
  → Rapports CSV/JSON
```

Le cœur est `GenericLineScheduler.schedule_day()` (`scheduler/lines.py:69`), qui applique une **heuristique gloutonne (greedy)** :

1. Filtrer les OF non planifiés (JIT deferral : exclure les OF dus à >J+1)
2. Trier par `generic_sort_key()` — tuple à 12 niveaux
3. Prendre le meilleur candidat compatible (capacité + faisabilité composants)
4. Réserver les composants dans le stock virtuel (`StockState`)
5. Répéter jusqu'à remplir la capacité journalière

### 1.2 Fonction de tri (heuristiques.py)

Le tuple de tri encode les règles métier de l'ordonnanceur :

| Rang | Critère | Logique |
|------|---------|---------|
| 1 | `priority` | BDH en rupture (0) > Normal (1) > BDH OK (2) |
| 2 | `due_urgency` | En retard (0) > J+1 (1) > J+2 (2) > Loin (3) |
| 3 | `jit_bonus` | -2 si dû le jour même |
| 4 | `prematurity` | Pénalité croissante si dû dans >J+1 |
| 5 | `target_day_delta` | Proximité avec le jour cible (lissage spatial) |
| 6 | `due_date` | Date d'échéance exacte |
| 7 | `-charge_hours` | Gros OF d'abord à urgence égale |
| 8 | `serie_bonus` | -2 si même article, -0.5 si composants partagés |
| 9 | `mix_penalty` | Pénalité si sur-représentation d'une famille |
| 10 | `kanban_penalty` | Pénalité sur consommation kanban |
| 11 | `article` | Tie-break alphabétique |
| 12 | `num_of` | Tie-break final |

### 1.3 Fonction objectif (scoring)

```
score = taux_service × w1 + taux_ouverture × w2
      - deviation_penalty × w3 + jit_penalty × w4
```

Poids par défaut : `w1=0.7, w2=0.2, w3=0.1, w4=0.15` (non normalisés).

### 1.4 Forces

- **Rapidité** : O(n log n) par jour — résultat quasi instantané.
- **Lisibilité métier** : Chaque critère du tuple correspond à une décision d'ordonnanceur réelle.
- **Vérification composants** : `RecursiveChecker` + `StockState` virtuel gère la concurrence composants entre OF, avec récursion complète de la nomenclature.
- **JIT deferral** : Les OF lointains ne sont planifiés que si la ligne est sous-remplie — évite le sur-ordonnancement.
- **Ancrage réalité** : Les profils de production historiques (`_load_article_day_profile`) guident l'affectation jour/article.

### 1.5 Faiblesses structurelles

| Faiblesse | Détail | Impact |
|-----------|--------|--------|
| **Glouton séquentiel** | Chaque décision est irréversible. Un mauvais choix en début de journée pollue le reste. | Sous-optimalité garantie sur les instances non-triviales. |
| **Lignes indépendantes** | Chaque ligne est ordonnancée isolément. Les interactions entre lignes (composants partagés) ne sont gérées que via le stock virtuel séquentiel. | Un OF planifié sur la ligne A peut bloquer un OF plus urgent sur la ligne B. |
| **Ordre de traitement des jours** | Le jour 1 "consomme" les composants avant le jour 2, ce qui peut bloquer artificiellement des OF mieux placés plus tard. | Effet de cascade : un mauvais jour 1 dégrade tout l'horizon. |
| **Tri statique et figé** | Le tuple de 12 niveaux a des poids implicites (non tunables). L'interaction entre critères n'est pas modélisée. | Impossible d'ajuster finement les compromis sans réécrire le code. |
| **Pas d'exploration** | L'algo produit **une seule solution**. On ne sait pas s'il existe un planning nettement meilleur. | Aucune garantie de qualité. |
| **Setup time simpliste** | 0.25h fixe pour tout changement d'article. Pas de matrice de setup. | Sous-estime les temps réels, sur-estime la capacité utile. |
| **Capacité lissée a priori** | La capacité est calculée avant scheduling (médiane des OF + 10%). | Ne s'adapte pas dynamiquement à la composition réelle du planning. |
| **Pas de réordonnancement** | Si une réception arrive, l'algo ne reconsidère pas les OF précédemment bloqués. | Des OF restent marqués "bloqués" alors qu'ils sont devenus faisables. |
| **BDH buffer accepté même en shortage** | Le code accepte un candidat même si le buffer BDH est insuffisant (`lines.py:175`). | Le buffer théorique est faussé, le stock projeté est trop optimiste. |

---

## 2. Pourquoi un algorithme génétique

### 2.1 Nature du problème

L'ordonnancement tel qu'il se présente ici est une variante du **Job-Shop Scheduling Problem (JSSP)** avec des contraintes additionnelles :

- **Nomenclatures récursives** (BOM multi-niveaux) — un OF peut dépendre d'un autre OF
- **Stock partagé et limité** — concurrence entre OF pour les composants
- **Réceptions dynamiques** — le stock change au cours de l'horizon
- **Types de commande hétérogènes** (MTS, NOR, MTO) — priorités différentes
- **Lignes de production multiples** — routing par gamme
- **Calendrier non uniforme** — jours fériés, configurations 2×8 / 3×8

Le JSSP est NP-difficile. Les instances industrielles de taille réelle (15 000+ OF) ne sont pas résolues par la programmation linéaire en temps raisonnable. Les méta-heuristiques — et en particulier les AG — sont la norme dans la littérature et dans l'industrie pour ce type de problème.

### 2.2 Pourquoi l'AG spécifiquement

Plusieurs méta-heuristiques sont candidates :

| Méta-heuristique | Avantage | Inconvénient |
|-------------------|----------|--------------|
| **Recuit simulé** | Simple, un seul individu, converge vite | Exploration limitée (un seul voisinage), pas de population |
| **Recherche tabou** | Bonne intensification, mémoire des états visités | Paramétrage délicat, pas de parallélisme naturel |
| **AG (génétique)** | Population → diversité, parallélisable, crossover = recombinaison intelligente | Plus de paramètres, coûteux en évaluations |
| **Essaim de particules** | Bon pour espace continu | Moins naturel pour les problèmes permutationnels |
| **Colonie de fourmis** | Bon pour les problèmes de routing | Phase d'apprentissage longue, sensible aux paramètres |

**L'AG est retenu** pour trois raisons :

1. **Population** : On maintient N solutions en parallèle → on explore plusieurs régions de l'espace simultanément. C'est un atout face aux instances industrielles où l'espace est multimodal (plusieurs optima locaux de qualité similaire).

2. **Croisement (crossover)** : C'est l'opérateur le plus puissant d'un AG. Il permet de recombine deux bonnes solutions pour en obtenir une meilleure. Dans notre cas, un parent A peut bien gérer les OF urgents, et un parent B peut bien minimiser les changements de série. Le croisement peut hériter du meilleur des deux.

3. **Hybridation naturelle** : L'AG peut intégrer une recherche locale (memétique) pour affiner chaque individu — ce qui combine l'exploration large (population) et l'exploitation locale (recherche).

### 2.3 Ce que l'AG pourrait améliorer

| Dimension | Mécanisme AG | Gain attendu |
|-----------|-------------|--------------|
| Taux de service | Exploration de permutations que le glouton rate | +5-15% estimé |
| Changements de série | Sélection naturelle favorise les chromosomes avec moins de setups | -20-40% des changements |
| Utilisation capacité | Répartition globale OF/jours au lieu du remplissage séquentiel | Meilleur lissage |
| Concurrence composants | L'AG voit tout l'horizon d'un coup, pas de biais d'ordre | Moins de blocages artificiels |
| Robustesse | Population de solutions proches → résilience aux aléas | Alternative si le plan A est perturbé |

---

## 3. Formalisation du problème

### 3.1 Définitions

Soit :

- **C** = {c₁, c₂, ..., cₙ} : ensemble des OF candidats (n ~ 50-200 dans l'horizon de 5 jours)
- **L** = {l₁, l₂, ..., lₘ} : ensemble des lignes de production (m ~ 10-20)
- **J** = {j₁, j₂, ..., jₖ} : ensemble des jours ouvrés dans l'horizon (k ~ 5)
- **Cap(l, j)** : capacité en heures de la ligne l le jour j
- **Charge(c, l)** : temps de production de l'OF c sur la ligne l (en heures, depuis les gammes)
- **Line(c)** : ligne de production de l'OF c (déterminée par la gamme)
- **Due(c)** : date d'échéance de l'OF c
- **Components(c)** : composants requis par l'OF c (depuis nomenclature, récursif)
- **Stock(a, j)** : stock disponible de l'article a au jour j (stock initial + réceptions - allocations)

### 3.2 Variables de décision

Pour chaque OF candidat c :

- **day(c)** ∈ J : jour de planification
- **pos(c)** ∈ ℕ : position dans la séquence du jour (détermine l'heure de début/fin)

### 3.3 Contraintes

#### Contraintes dures (violations = solution invalide)

| ID | Contrainte | Formule |
|----|-----------|---------|
| H1 | **Capacité journalière** | Σ_{c : day(c)=j ∧ Line(c)=l} Charge(c, l) ≤ Cap(l, j) ∀ l, j |
| H2 | **Assignation ligne** | Line(c) fixée par la gamme — pas de choix |
| H3 | **Unicité** | Chaque OF est planifié exactement une fois (ou marqué non planifié) |
| H4 | **Composants disponibles** | Σ_{c : day(c)≤j} Components(c, a) ≤ Stock(a, j) ∀ a, j |

H4 est la contrainte la plus coûteuse à vérifier (récursion nomenclature).

#### Contraintes douces (violations = pénalité dans le score)

| ID | Contrainte | Pénalité |
|----|-----------|----------|
| S1 | **Respect des échéances** | Pénalité croissante si day(c) > Due(c) |
| S2 | **Changements de série** | Pénalité pour chaque transition article₁ → article₂ |
| S3 | **Ouverture minimum** | Pénalité si engaged_hours < seuil |
| S4 | **JIT idéal** | Bonus si day(c) = Due(c), pénalité si trop tôt |
| S5 | **Mix produit** | Pénalité si déséquilibre entre familles |

### 3.4 Objectifs

| Objectif | Direction | Formule |
|----------|-----------|---------|
| Taux de service | Maximiser | \|{c : day(c) ≤ Due(c)}\| / \|C\| |
| Taux d'ouverture | Maximiser | Σ engaged / Σ capacité_jours_ouverts |
| Changements de série | Minimiser | Σ 1_{article(i) ≠ article(i-1)} pour chaque ligne/jour |
| JIT | Maximiser | \|{c : day(c) = Due(c)}\| / \|C\| |

Ces objectifs sont **conflictuels** : maximiser le JIT peut réduire le taux d'ouverture (jours sous-remplis), et minimiser les changements de série peut dégrader le taux de service (regrouper au détriment des échéances).

---

## 4. Conception de l'AG — Fondations

### 4.1 Encodage du chromosome

L'encodage est le choix le plus critique. Plusieurs options :

#### Option A : Encodage permutationnel par jour

```
Chromosome = { jour_cible[OF₁], jour_cible[OF₂], ..., jour_cible[OFₙ] }

Exemple (3 OF, 3 jours) :
  OF_001 → jour 1
  OF_002 → jour 2
  OF_003 → jour 1

  Séquence interne jour 1 : [OF_001, OF_003]
  Séquence interne jour 2 : [OF_002]
  Séquence interne jour 3 : []
```

**Avantage** : Compact, naturel.
**Inconvénient** : La séquence interne à chaque jour est implicite (ordre d'insertion). Nécessite un encodage secondaire pour l'ordre dans la journée.

#### Option B : Encodage positionnel (recommandé)

Chaque gène encode le jour ET la position relative dans la journée :

```
Chromosome = [
  (jour, position),  # OF_001
  (jour, position),  # OF_002
  ...
]
```

Concrètement, on utilise un **rang relatif** :

```
Pour chaque OF c :
  gene[c] = jour_cible ∈ {1, ..., k}

L'ordre dans la journée est déduit par le rang de génération :
  - Premier gène assigné au jour j → position 1
  - Deuxième → position 2
  - etc.
```

C'est l'encodage le plus courant pour le JSSP dans la littérature (voir Bierwirth 1995).

#### Option C : Encodage opérationnel (pour JSSP canonique)

Encodage qui liste les opérations dans l'ordre d'exécution, chaque opération référençant son OF. Adapté quand un OF passe par plusieurs machines, mais **pas notre cas** (un OF = une ligne = un poste).

**Retenue : Option B** — encodage positionnel par jour. Simple, décodage direct, compatible avec les opérateurs classiques.

### 4.2 Structure d'un individu

```python
@dataclass
class Individual:
    genes: dict[str, int]          # {num_of → jour_index (0..k-1)}
    fitness: float | None = None   # valeur de fitness (évaluée)
    metrics: dict | None = None    # KPIs détaillés (taux_service, etc.)
    rank: int | None = None        # rang dans la population (Pareto si multi-objectif)
```

### 4.3 Décodage : du chromosome au planning

```
decode(individual) → planning complet

Pour chaque ligne l ∈ L :
    ofs_ligne = [c pour c dans C si Line(c) == l]
    Pour chaque jour j ∈ J (dans l'ordre) :
        ofs_jour = [c pour c dans ofs_ligne si genes[c] == j]
        Trier ofs_jour par :
            1. Due date croissante
            2. Même article groupé (minimiser setups)
        Assigner les heures séquentiellement :
            h_courant = 0
            Pour chaque c dans ofs_jour :
                setup = (article != précédent) ? 0.25 : 0
                c.start_hour = h_courant + setup
                c.end_hour = c.start_hour + Charge(c)
                h_courant = c.end_hour
                Si h_courant > Cap(l, j) :
                    Décaler c vers j+1 (overflow)
```

Le décodage inclut un **mécanisme de réparation** : si la capacité est dépassée, les OF en excédent sont décalés vers le jour suivant (ou marqués non planifiés s'il n'y a plus de jour disponible).

### 4.4 Fonction de fitness

#### Approche mono-objectif (pondérée)

```python
def fitness(individual, weights):
    planning = decode(individual)

    # KPIs primaires
    taux_service = compute_taux_service(planning)
    taux_ouverture = compute_taux_ouverture(planning)
    nb_setups = compute_nb_changements_serie(planning)
    nb_jit = compute_nb_jit(planning)
    nb_late = compute_nb_retards(planning)

    # Contraintes douces
    setup_penalty = nb_setups * SETUP_COST
    late_penalty = nb_late * LATE_WEIGHT

    # Contraintes dures (violation = forte pénalité)
    component_violations = check_all_components(planning)
    violation_penalty = component_violations * VIOLATION_WEIGHT

    score = (
        weights.alpha * taux_service
        + weights.beta * taux_ouverture
        + weights.gamma * (nb_jit / max(1, total_of))
        - weights.delta * setup_penalty
        - weights.epsilon * late_penalty
        - violation_penalty
    )
    return score
```

Les poids `alpha..epsilon` sont **les mêmes que w1..w4 actuels**, enrichis de nouveaux coefficients pour les setups et violations.

#### Approche multi-objectif (NSGA-II, phase long terme)

Au lieu d'agréger en un seul score, on optimise un **vecteur** d'objectifs :

```
objectifs = (
    -taux_service,     # maximiser → minimiser le négatif
    -taux_ouverture,   # maximiser
    nb_setups,         # minimiser directement
    nb_late,           # minimiser
)
```

Le tri de la population se fait par **dominance de Pareto** (NSGA-II). Résultat : un front de Pareto de solutions optimales, parmi lesquelles l'ordonnanceur choisit.

### 4.5 Vérification des composants (bottleneck)

Le coût dominant de l'évaluation est la vérification récursive des composants via `RecursiveChecker`. Deux stratégies :

#### Stratégie 1 : Évaluation complète

Appeler le `RecursiveChecker` existant pour chaque individu. Simple mais coûteux :

```
Coût par individu : O(|C| × profondeur_nomenclature)
Avec n=200 OF, profondeur=5 : ~1000 appels récursifs
Pour 200 individus × 100 générations : 20M appels
```

Acceptable si chaque appel est rapide (< 1ms). Sinon, voir stratégie 2.

#### Stratégie 2 : Évaluation approximative + validation finale

Utiliser un modèle **simplifié** pour l'évaluation AG, et le checker complet seulement pour la validation de la solution finale :

```
Modèle simplifié :
  - Pré-calculer une matrice composant×jour de disponibilité
  - Pour chaque individu, vérifier que composants requis ≤ disponibilité_cumulée
  - Pas de récursion : vérification directe niveau 1 uniquement

Validation finale (top 5 individus) :
  - Appeler le RecursiveChecker complet
  - Corriger les violations par réparation
```

**Recommandation** : Commencer par la stratégie 1. Si le temps de calcul dépasse 10s, migrer vers la stratégie 2.

### 4.6 Opérateurs génétiques

#### Sélection

**Sélection par tournoi** (recommandée) :

```
tournoi(k=3) :
    Choisir k individus aléatoirement
    Retourner le meilleur
```

- k=3 offre un bon compromis pression de sélection / diversité.
- Simple, sans biais de scaling.

#### Croisement (crossover)

**Croisement uniforme** (basique) :

```
Pour chaque OF c :
    Si random() < 0.5 :
        enfant.genes[c] = parent1.genes[c]
    Sinon :
        enfant.genes[c] = parent2.genes[c]
```

**Croisement par blocs jour** (recommandé) :

```
Choisir un point de coupure jour ∈ {1, ..., k-1}
enfant = {}
Pour chaque OF c :
    Si genes_parent1[c] ≤ coupure :
        enfant[c] = parent1.genes[c]
    Sinon :
        enfant[c] = parent2.genes[c]
```

Préserve la cohérence des blocs journaliers — un parent gère les premiers jours, l'autre les derniers.

**Croisement par article** (avancé) :

```
Pour chaque article a :
    Choisir aléatoirement parent1 ou parent2
    Tous les OF de l'article a héritent du parent choisi
```

Préserve le grouping par article — un parent peut avoir une bonne stratégie pour l'article X, l'autre pour Y.

#### Mutation

| Opérateur | Description | Probabilité |
|-----------|-------------|-------------|
| **Move** | Déplacer un OF aléatoire vers un autre jour | p=0.1 |
| **Swap** | Échanger les jours de deux OF aléatoires | p=0.05 |
| **Inversion** | Inverser la séquence des OF d'un jour | p=0.03 |
| **Article group** | Regrouper tous les OF d'un article le même jour | p=0.02 |
| **Réparation** | Décaler les OF violant la capacité vers j+1 | p=1.0 (systématique) |

#### Réparation post-opérateurs

Après chaque croisement/mutation, appliquer un **repair operator** :

```
repair(individual) :
    planning = decode(individual)

    # 1. Corriger les violations de capacité
    Pour chaque (ligne, jour) :
        Si engaged_hours > capacité :
            Déplacer les derniers OF vers j+1 (ou j+2, etc.)

    # 2. Vérifier les composants (optionnel, selon stratégie)
    Pour chaque jour j dans l'ordre :
        Pour chaque OF c planifié le jour j :
            Si composants indisponibles :
                Marquer c comme "bloqué" (pénalité dans fitness)
                OU décaler vers le premier jour où composants disponibles

    # 3. Nettoyer
    Supprimer les doublons, vérifier la cohérence
```

### 4.7 Paramètres de l'AG

| Paramètre | Valeur initiale | Rationale |
|-----------|-----------------|-----------|
| Taille population | 100 | Suffisant pour la diversité, pas trop pour le temps de calcul |
| Nombre de générations | 200 | Convergence typique en 100-150 générations sur JSSP |
| Probabilité croisement | 0.8 | Standard pour JSSP |
| Probabilité mutation | 0.15 | Assez pour maintenir la diversité |
| Taille tournoi | 3 | Pression de sélection modérée |
| Élitisme | 5% (5 individus) | Garantit que le meilleur ne régresse jamais |
| Seuil de convergence | 20 générations sans amélioration > 0.1% | Critère d'arrêt anticipé |

### 4.8 Initialisation de la population

**Hybride** (recommandé) :

```
1 individu = solution gloutonne V1 (seed de qualité garantie)
9 individus = variantes de V1 (mutations légères : ±1 jour sur 10% des OF)
90 individus = aléatoires (distribution uniforme sur les jours)
```

L'individu V1 garantit que l'AG ne fera **jamais pire** que l'algo actuel (élitisme). Les variantes explorent le voisinage immédiat. Les aléatoires assurent la diversité.

### 4.9 Boucle principale

```
population = initialiser_population(taille=100)

pour génération = 1..200 :
    # Évaluation
    pour chaque individu dans population :
        si individu.fitness est None :
            individu.fitness = fitness(individu)

    # Sélection + Reproduction
    nouvelle_population = []
    elite = top 5% de population (trié par fitness)
    nouvelle_population.extend(elite)

    tant que |nouvelle_population| < taille_population :
        parent1 = tournoi(population, k=3)
        parent2 = tournoi(population, k=3)
        enfant = croisement(parent1, parent2)
        enfant = mutation(enfant)
        enfant = repair(enfant)
        nouvelle_population.append(enfant)

    population = nouvelle_population

    # Critère d'arrêt anticipé
    si pas d'amélioration depuis 20 générations :
        break

meilleur = individu avec fitness maximale dans population
resultat = decode(meilleur)
```

### 4.10 Architecture modulaire

```
scheduler/
├── ga/
│   ├── __init__.py
│   ├── chromosome.py      # Individual, encoding/decoding
│   ├── fitness.py          # Fonction de fitness, KPIs
│   ├── operators.py        # Sélection, croisement, mutation
│   ├── repair.py           # Réparation post-opérateurs
│   ├── engine.py           # Boucle principale AG
│   ├── config.py           # Paramètres (taille pop, probas, etc.)
│   └── evaluation/
│       ├── component_checker.py  # Vérification composants (stratégie 1 ou 2)
│       └── precompute.py         # Pré-calcul des matrices de disponibilité
```

---

## 5. Évaluation et protocole de comparaison

### 5.1 Méthodologie générale

L'évaluation compare les deux algorithmes sur les **mêmes données d'entrée**, avec les **mêmes poids**, sur des **instances de taille variable**.

#### Instances de test

| Instance | Description | Taille attendue |
|----------|-------------|-----------------|
| **Réelle S** | Semaine courante (données ERP réelles) | ~50-80 OF candidats |
| **Réelle M** | 2 semaines (horizon étendu) | ~100-150 OF candidats |
| **Réelle L** | 3 semaines (charge maximale) | ~200-300 OF candidats |
| **Synthétique S** | 30 OF, 2 lignes, 3 jours | Contrôle des paramètres |
| **Synthétique M** | 100 OF, 5 lignes, 5 jours | Réalisme augmenté |
| **Synthétique L** | 300 OF, 10 lignes, 10 jours | Stress test |

Les instances synthétiques permettent de **contrôler la difficulté** : niveau de contention sur les composants, nombre de changements de série inévitables, etc.

### 5.2 Métriques de comparaison

#### Métriques primaires (objectifs)

| Métrique | Formule | Direction |
|----------|---------|-----------|
| **Taux de service** | \|{c : day(c) ≤ Due(c)}\| / \|C\| | Maximiser |
| **Taux d'ouverture** | heures_engagées / capacité_jours_ouverts | Maximiser |
| **Changements de série** | Σ transitions article sur toutes les lignes | Minimiser |
| **JIT** | \|{c : day(c) = Due(c)}\| / \|C\| | Maximiser |
| **Retards** | \|{c : day(c) > Due(c)}\| / \|C\| | Minimiser |

#### Métriques secondaires (qualité structurelle)

| Métrique | Description |
|----------|-------------|
| **OF non planifiés** | Nombre d'OF sans jour assigné |
| **OF bloqués composants** | Nombre d'OF avec composants manquants |
| **Stock tampon BDH** | Niveau projeté moyen sur l'horizon |
| **Écart-type charge/jour** | Mesure du lissage (plus bas = plus régulier) |
| **Temps de calcul** | Durée totale de l'ordonnancement |

#### Métrique composite (score global)

```
score = w_service × taux_service
      + w_ouverture × taux_ouverture
      + w_jit × jit_rate
      - w_setups × (nb_setups / max_setups)
      - w_late × (nb_late / total_of)
```

Les poids `w_*` sont les mêmes pour les deux algorithmes.

### 5.3 Protocole expérimental

#### Conditions expérimentales

```
Pour chaque instance :
    Répéter 30 fois (runs indépendants) :
        - V1 glouton : 1 run (déterministe, résultat unique)
        - AG : 1 run (stochastique, résultats variables)
    Collecter : score, KPIs, temps de calcul
```

30 répétitions sont nécessaires car l'AG est stochastique. Le glouton est déterministe (1 résultat).

#### Statistiques rapportées

Pour chaque métrique, sur les 30 runs AG vs 1 run glouton :

| Statistique | Formule |
|-------------|---------|
| **Moyenne AG** | μ = Σ scores / 30 |
| **Meilleur AG** | max(scores) |
| **Médiane AG** | 50e percentile |
| **Écart-type AG** | σ = √(Σ(score - μ)² / 29) |
| **Glouton** | score unique |
| **Δ moyen** | μ_AG - glouton |
| **Δ meilleur** | max_AG - glouton |
| **p-value** | Test de Wilcoxon (AG vs glouton, H₀: distributions égales) |

Le test de Wilcoxon (non-paramétrique) est préférable au t-test car on ne suppose pas la normalité des scores AG.

### 5.4 Critères de succès

L'AG est considéré **supérieur** si, sur les instances réelles :

| Critère | Seuil |
|---------|-------|
| Taux de service moyen | ≥ taux_service_glouton + 3 points de % |
| Changements de série moyens | ≤ 80% du glouton |
| Score composite moyen | ≥ score_glouton + 5% |
| Temps de calcul moyen | < 30 secondes |
| Stabilité (σ/μ) | < 2% (peu de variance entre runs) |

L'AG est considéré **acceptable** si :

| Critère | Seuil |
|---------|-------|
| Score composite moyen | ≥ score_glouton |
| Temps de calcul | < 60 secondes |
| Le meilleur run AG > glouton | Sur toutes les instances réelles |

Si l'AG ne passe pas le seuil acceptable, on revoit l'encodage ou les opérateurs.

### 5.5 Benchmarking progressif

```
Phase 1 — Preuve de concept (instances synthétiques S)
  → Vérifier que l'AG converge et bat le glouton sur des instances simples
  → Identifier les bugs d'encodage, les opérateurs mal adaptés

Phase 2 — Validation réelle S (semaine courante)
  → Sur données ERP réelles, horizon 5 jours
  → Comparer score, setups, taux de service

Phase 3 — Scalabilité (Réelle M, L)
  → Mesurer le temps de calcul en fonction de la taille
  → Identifier le seuil où l'AG devient trop lent

Phase 4 — Robustesse (stress tests)
  → Perturber les données (réduire le stock, ajouter des OF, changer les échéances)
  → Vérifier que l'AG se dégrade gracieusement
```

### 5.6 Visualisation des résultats

Pour chaque instance, produire :

1. **Tableau comparatif** : toutes les métriques, glouton vs AG (moyenne + meilleur)
2. **Box plot** : distribution des scores AG sur 30 runs, ligne horizontale = glouton
3. **Courbe de convergence** : fitness du meilleur individu par génération (moyenne sur 30 runs)
4. **Gantt comparatif** : planning glouton vs planning AG sur chaque ligne, pour inspection visuelle
5. **Heatmap charge/jour** : comparaison du lissage entre les deux approches

### 5.7 Tests de significativité

Pour chaque métrique et chaque instance :

```
1. Test de Wilcoxon signed-rank (H₀ : pas de différence entre AG et glouton)
   - Si p < 0.05 : la différence est significative
   - Direction : vérifier que AG > glouton (ou < pour les métriques à minimiser)

2. Taille de l'effet (Cohen's d)
   - d < 0.2 : négligeable
   - 0.2 ≤ d < 0.5 : petit
   - 0.5 ≤ d < 0.8 : moyen
   - d ≥ 0.8 : grand
```

L'AG n'est validé que si la différence est **à la fois** statistiquement significative (p < 0.05) et pratiquement significative (d ≥ 0.5) sur les métriques primaires.

---

## 6. Plan d'implémentation par phases

### Phase 1 — Infrastructure (1-2 jours)

- Créer le module `scheduler/ga/` avec les fichiers squelettes
- Implémenter l'encodage (chromosome.py) et le décodage
- Implémenter la fonction de fitness mono-objectif (réutiliser les KPIs existants)
- Implémenter le repair operator de base (débordement capacité)

**Livrable** : Un AG minimal qui produit un planning valide (même si sous-optimal).

### Phase 2 — Opérateurs et boucle (2-3 jours)

- Implémenter sélection par tournoi
- Implémenter croisement par blocs jour + croisement par article
- Implémenter mutations (move, swap, inversion)
- Implémenter la boucle principale (engine.py)
- Ajouter l'initialisation hybride (seed glouton + aléatoires)

**Livrable** : Un AG fonctionnel qui tourne sur les instances synthétiques.

### Phase 3 — Intégration vérification composants (2-3 jours)

- Intégrer le `RecursiveChecker` dans l'évaluation de fitness
- Implémenter la réparation basée sur les composants
- Optimiser : cache des vérifications, évaluation incrémentale si possible
- Mesurer le temps de calcul

**Livrable** : Un AG qui gère les contraintes de composants réelles.

### Phase 4 — Benchmarking (2-3 jours)

- Implémenter le protocole de comparaison (30 runs, statistiques)
- Produire les tableaux, box plots, courbes de convergence
- Identifier les paramètres optimaux (grid search sur population, générations, probas)

**Livrable** : Rapport de comparaison AG vs glouton sur instances réelles.

### Phase 5 — Intégration production (1-2 jours)

- Brancher l'AG dans l'API (`POST /runs/schedule` avec param `algorithm=ga`)
- Ajouter le choix d'algo dans le board-ui
- Documentation utilisateur

**Livrable** : AG disponible en production, sélectionnable par l'utilisateur.

---

## 7. Risques et mitigeations

### 7.1 Temps de calcul

| Risque | L'AG prend >60s sur les instances réelles |
|--------|-------------------------------------------|
| **Cause** | RecursiveChecker appelé 200×100 = 20 000 fois |
| **Mitigeation 1** | Stratégie 2 (évaluation approximative + validation finale) |
| **Mitigeation 2** | Cache des vérifications composants (si même OF même jour, résultat déjà connu) |
| **Mitigeation 3** | Paralléliser l'évaluation (multiprocessing, chaque worker évalue un individu) |
| **Mitigeation 4** | Réduire la taille de la population (50 au lieu de 100) ou le nombre de générations |

### 7.2 Stochasticité

| Risque | Deux runs donnent des résultats très différents |
|--------|------------------------------------------------|
| **Cause** | L'AG est stochastique par nature |
| **Mitigeation 1** | Fixer la graine aléatoire par défaut (reproductible) |
| **Mitigeation 2** | Exécuter 3 runs et retourner le meilleur (en <3× le temps) |
| **Mitigeation 3** | Afficher l'écart-type dans l'UI pour transparence |

### 7.3 Régression vs glouton

| Risque | L'AG produit un planning pire que le glouton |
|--------|---------------------------------------------|
| **Cause** | Encodage inadapté, opérateurs mal calibrés, convergence prématurée |
| **Mitigeation 1** | Toujours inclure la solution glouton dans la population initiale |
| **Mitigeation 2** | Élitisme strict (le meilleur individu ne peut pas régresser) |
| **Mitigeation 3** | Si après X générations l'AG ne bat pas le glouton, fallback silencieux |
| **Mitigeation 4** | Afficher les deux résultats dans l'UI pour comparaison |

### 7.4 Complexité de maintenance

| Risque | Le module AG est complexe à maintenir |
|--------|--------------------------------------|
| **Cause** | Beaucoup de paramètres, opérateurs multiples |
| **Mitigeation 1** | Architecture modulaire (chaque opérateur dans son fichier) |
| **Mitigeation 2** | Tests unitaires exhaustifs (chaque opérateur testé isolément) |
| **Mitigeation 3** | Configuration externalisée (JSON, pas de magic numbers dans le code) |
| **Mitigeation 4** | Conserver le glouton comme fallback permanent |

### 7.5 Acceptabilité utilisateur

| Risque | L'ordonnanceur ne fait pas confiance au résultat de l'AG |
|--------|----------------------------------------------------------|
| **Cause** | "Black box", résultats non déterministes |
| **Mitigeation 1** | Afficher le planning Gantt pour inspection visuelle |
| **Mitigeation 2** | Montrer la comparaison glouton vs AG côte à côte |
| **Mitigeation 3** | Permettre le mode "suggestion" (l'AG propose, l'ordonnanceur dispose) |
| **Mitigeation 4** | Conserver le mode glouton comme option par défaut |

---

## Annexes

### A. Références bibliographiques

- **Bierwirth, C.** (1995). "A generalized permutation approach to job shop scheduling with genetic algorithms." *OR Spectrum*, 17(2-3), 87-92. — Encodage permutationnel pour JSSP.
- **Deb, K. et al.** (2002). "A fast and elitist multiobjective genetic algorithm: NSGA-II." *IEEE TEVC*, 6(2), 182-197. — Multi-objectif par dominance de Pareto.
- **Nowicki, E., Smutnicki, C.** (2005). "An advanced tabu search algorithm for the job shop problem." *J. of Scheduling*, 8(2), 145-159. — Benchmark de référence pour le JSSP.
- **Zhang, C. et al.** (2007). "An effective genetic algorithm for the job shop scheduling problem." *Expert Systems with Applications*, 33(2), 330-338. — AG hybride avec recherche locale.
- **Moslehi, G., Mahnam, M.** (2011). "A Pareto approach to multi-objective flexible job-shop scheduling problem." *Applied Mathematical Modelling*, 35(4), 1843-1855. — JSSP flexible multi-objectif.

### B. Glossaire

| Terme | Définition |
|-------|-----------|
| **Chromosome** | Représentation encodée d'une solution (un planning complet) |
| **Gène** | Un élément du chromosome (assignation d'un OF à un jour) |
| **Population** | Ensemble de chromosomes évalués en parallèle |
| **Fitness** | Score d'un chromosome (mesure de qualité du planning) |
| **Sélection** | Choix des parents pour la reproduction |
| **Croisement (crossover)** | Recombinaison de deux parents pour produire un enfant |
| **Mutation** | Modification aléatoire d'un chromosome |
| **Réparation** | Correction post-opérateur pour restaurer la validité |
| **Élitisme** | Préservation des meilleurs individus d'une génération à la suivante |
| **Convergence** | Stabilisation de la fitness moyenne/meilleure au fil des générations |
| **Pareto (dominance)** | A domine B si A est meilleur sur au moins un objectif et pas pire sur aucun |
| **NSGA-II** | Non-dominated Sorting Genetic Algorithm II — tri par dominance de Pareto |
