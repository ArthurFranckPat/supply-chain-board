# OrganizationAgent - Spécification de Conception

**Date:** 2026-03-23
**Auteur:** Claude (Superpowers Brainstorming)
**Statut:** Approuvé

## 1. Objectif

Créer un agent autonome capable de proposer l'organisation de l'atelier (1×8, 2×8, 3×8, ou ouvertures partielles) pour S+1, basée sur l'analyse de la charge sur 4 semaines (S+1 à S+4) et les tendances observées.

## 2. Architecture

### Structure de l'agent

```
src/agents/organization/
├── organization_agent.py    # Agent principal
├── trend_analyzer.py         # Analyse des tendances S+1→S+4
├── charge_calculator.py      # Calcul de charge multi-horizons
└── models.py                 # Modèles de données (si nécessaire)
```

### Composants

#### OrganizationAgent
**Responsabilité :** Orchestrer l'analyse et produire la recommandation d'organisation.

**Méthodes :**
- `analyze_workshop_organization(reference_date)` → Analyse complète
- `calculate_charge_horizons(reference_date)` → Charge S+1 à S+4 par poste
- `analyze_trends(charges)` → Détection de tendances (hausse/stable/baisse)
- `evaluate_organizations(poste, charge_s1, trend)` → Scénarios d'organisation
- `select_optimal_organization(evaluations)` → Sélection basée sur critères
- `format_organization_table(results)` → Tableau console

#### TrendAnalyzer
**Responsabilité :** Analyser les tendances de charge sur plusieurs horizons.

**Méthodes :**
- `compute_trend(charge_s1, charge_s2, charge_s3, charge_s4)` → Trend (hausse/stable/baisse)
- `compute_slope(charges)` → Pente de régression linéaire
- `classify_trend(slope)` → Classification du trend

#### ChargeCalculator
**Responsabilité :** Calculer la charge par poste sur plusieurs horizons.

**Méthodes :**
- `calculate_charge_for_horizon(reference_date, horizon_weeks, poste_filter)` → Charge par poste
- `calculate_poste_charge(commandes, poste, loader)` → Charge d'un poste

## 3. Logique métier

### Types d'organisation

| Type | Heures/semaine | Description |
|------|----------------|-------------|
| 1×8  | 35h | Équipe standard |
| 2×8  | 70h | Deux équipes |
| 3×8  | 105h | Trois équipes |
| Partiel | 7-34h | Ouvertures partielles (ex: 2×8 sur 3 jours) |

### Calcul de charge

Pour chaque poste de charge (PP_xxx) :
1. Identifier les commandes clients dans l'horizon (S+1 à S+4)
2. Pour chaque commande, récupérer les OF associés (Matcher)
3. Pour chaque OF, calculer les heures par poste via la gamme
4. Sommer les heures par poste et par horizon

**Formule :**
```
Heures(poste, horizon) = Σ (QTE_OF / Cadence) pour tous les OF du poste dans l'horizon
```

### Analyse de tendance

**Approche :**
1. Calculer la charge pour chaque horizon (S+1, S+2, S+3, S+4)
2. Calculer la pente de régression linéaire sur les 4 points
3. Classifier le trend :
   - **Hausse significative** : pente > +5h/semaine
   - **Baisse significative** : pente < -5h/semaine
   - **Stable** : -5h ≤ pente ≤ +5h

**Exemple :**
```
S+1 = 25h, S+2 = 35h, S+3 = 45h, S+4 = 60h
→ Pente = +11.7h/semaine → Hausse significative
→ Recommandation : Anticiper 35h pour S+1
```

### Évaluation des organisations

Pour chaque poste et chaque type d'organisation :
1. Calculer le taux de service : `Charge traitée / Charge totale`
2. Identifier les articles non couverts
3. Calculer le risque de rupture

**Critères de sélection :**
- Priorité au taux de service maximal
- En cas d'égalité : choisir l'organisation la plus légère
- Prendre en compte la tendance pour lisser la charge

### Règles de lissage

| Tendance S+2-S+4 | Organisation S+1 recommandée |
|------------------|------------------------------|
| Hausse significative | +1 niveau vs S+1 brut |
| Stable | Organisation adaptée à S+1 |
| Baisse significative | Organisation S+1 brut |

## 4. Données d'entrée

### Sources

1. **commandes_clients.csv** → Besoins S+1 à S+4
2. **of_entetes.csv** → OF existants (WOP/WOS)
3. **gammes.csv** → Cadences par poste
4. **nomenclatures.csv** → Non utilisé pour l'organisation

### Filtres

- Horizons : S+1 (jours 1-7), S+2 (8-14), S+3 (15-21), S+4 (22-28)
- Postes : Tous les postes avec charge > 0
- Commandes : Toutes les commandes (MTS + NOR/MTO)

## 5. Sortie

### Format console

```
┌──────────────┬───────────┬───────────┬───────────┬───────────┬────────────┬─────────────┬──────────────┐
│ Poste        │ Charge S+1│ Charge S+2│ Charge S+3│ Charge S+4│ Trend       │ Organis. S+1│ Charge trait.│
├──────────────┼───────────┼───────────┼───────────┼───────────┼────────────┼─────────────┼──────────────┤
│ PP_830       │ 25.3h     │ 35.7h     │ 45.2h     │ 60.1h     │ ⬆️ Hausse   │ 2×8 (70h)   │ 25.3h (100%) │
│ PP_840       │ 68.5h     │ 62.3h     │ 58.1h     │ 55.0h     │ ⬇️ Baisse   │ 2×8 (70h)   │ 68.5h (100%) │
│ PP_850       │ 35.0h     │ 36.2h     │ 34.8h     │ 35.5h     │ ➡️ Stable   │ 1×8 (35h)   │ 35.0h (100%) │
└──────────────┴───────────┴───────────┴───────────┴───────────┴────────────┴─────────────┴──────────────┘

Risques identifiés :
• PP_830 : Sous-capacité en S+4 (60.1h > 70h)
• Aucun risque de sous-capacité immédiat
```

### Fichier JSON (optionnel)

```json
{
  "reference_date": "2026-03-23",
  "postes": {
    "PP_830": {
      "charges": {"S+1": 25.3, "S+2": 35.7, "S+3": 45.2, "S+4": 60.1},
      "trend": "hausse",
      "slope": 11.6,
      "organization_s1": {"type": "2x8", "hours": 70},
      "charge_treated": 25.3,
      "coverage_pct": 100
    }
  }
}
```

## 6. Intégration

### Point d'entrée

**Nouvelle commande CLI :**
```bash
python -m src.main --organization
```

### Intégration avec SchedulingAgent

- `OrganizationAgent` et `SchedulingAgent` sont **indépendants**
- Aucune dépendance directe entre les deux
- Partage du même `DataLoader`
- Partage des modèles dans `src/agents/scheduling/models.py` (si applicable)

### Flux d'exécution

```
CLI (--organization)
    ↓
OrganizationAgent.analyze_workshop_organization()
    ↓
1. ChargeCalculator.calculate_charge_for_horizon() × 4
    ↓
2. TrendAnalyzer.compute_trend() pour chaque poste
    ↓
3. evaluate_organizations() pour chaque poste
    ↓
4. select_optimal_organization() pour chaque poste
    ↓
5. format_organization_table()
    ↓
Affichage console + JSON (optionnel)
```

## 7. Tests

### Scénarios de test

1. **Test tendance haussière**
   - S+1=25h, S+2=35h, S+3=45h, S+4=60h
   - Attendu : Recommande 2×8 pour S+1

2. **Test tendance stable**
   - S+1=35h, S+2=36h, S+3=34h, S+4=35h
   - Attendu : Recommande 1×8 pour S+1

3. **Test tendance baissière**
   - S+1=70h, S+2=60h, S+3=50h, S+4=45h
   - Attendu : Recommande 2×8 pour S+1 (pas 3×8)

4. **Test poste sans charge**
   - Aucun OF pour le poste
   - Attendu : Organisation "Non applicable"

5. **Test ouverture partielle**
   - S+1=20h, trend stable
   - Attendu : Recommande ouverture partielle (ex: 3 jours)

### Couverture

- Tests unitaires pour chaque méthode
- Tests d'intégration pour le flux complet
- Tests edge cases (poste sans gamme, OF sans cadence, etc.)

## 8. Contraintes

### Contraintes métier

- L'organisation est proposée **par poste**, pas globalement
- Seul S+1 est concerné par la recommandation
- S+2 à S+4 servent uniquement à analyser la tendance
- Les organisations partielles sont limitées à 2-4 jours

### Contraintes techniques

- Réutiliser le `DataLoader` existant
- Réutiliser le `CommandeOFMatcher` existant
- Réutiliser les modèles de gamme existants
- Ne pas modifier `SchedulingAgent`

## 9. Limitations connues

- **Pas de simulation dynamique** : L'analyse est statique sur l'état actuel
- **Pas de contraintes RH** : Le modèle ne connaît pas les effectifs disponibles
- **Agrégation par poste** : Pas de distinction entre les articles sur un même poste
- **Absence de nomenclature** : 16% des articles sans nomenclature non couverts

## 10. Évolutions futures

- Intégration des contraintes RH (effectifs max par poste)
- Simulation d'affirmation d'OF S+2/S+3 pour équilibrer S+1
- Analyse multi-critères (coût, délai, qualité)
- Export vers Excel pour la réunion de charge
