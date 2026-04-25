# Mémoire Projet - Ordonnancement Production v2

Dernière mise à jour : 2026-03-21

---

## 🎯 Objectif du projet

Système de vérification de faisabilité des composants pour l'ordonnancement manufacturier avec :
- Vérification récursive des nomenclatures (jusqu'aux composants ACHAT)
- Gestion de la concurrence entre OF via allocation virtuelle
- 2 modes de vérification : immédiate (stock) et projetée (stock + réceptions)

---

## 📁 Structure du projet

```
src/
├── models/          # Article, OF, Nomenclature, Stock, Réception, BesoinClient, Allocation
├── loaders/         # DataLoader (charge les extractions ERP via ORDO_EXTRACTIONS_DIR)
├── checkers/        # Immediate, Projected, Recursive (supporte stock_state)
├── algorithms/      # AllocationManager, Matching (commande→OF)
├── scheduler/       # Planification
├── reports/         # Rapport S1
└── utils/           # Formatage (rich)
```

---

## 🔑 Concepts clés

### Types de commandes

- **MTS (FLAG_CONTREMARQUE = 5)** : Contre-marque obligatoire, lien OF→commande, allocation automatique
- **NOR/MTO (FLAG_CONTREMARQUE = 1)** : Pas de lien OF→commande, allocation manuelle, regroupement hebdo

### Types d'OF

- **WOP (Work Order Planned)** : OF planifié, lié à une commande MTS
- **WOS (Work Order Suggested)** : OF suggéré, généré par CBN/MRP

### Allocation virtuelle

Permet de gérer la concurrence entre OF :
- **Sans allocation** : Chaque OF vérifié indépendamment avec le même stock
- **Avec allocation** : Stock virtuel décrémenté au fur et à mesure des allocations

**Règles de priorité** :
1. Date de besoin (plus tôt = prioritaire)
2. Faisabilité (OF 100% faisable passe avant OF prioritaire mais non faisable)

---

## 📊 Fichiers de données

Les données sont chargées depuis le répertoire d'extractions ERP configuré via `ORDO_EXTRACTIONS_DIR`.

Fichiers attendus : Articles.csv, Gammes.csv, Nomenclatures.csv, Besoins Clients.csv,
Ordres de fabrication.csv, Stocks.csv, Commandes Achats.csv, Allocations.csv

---

## 🚀 Commandes utiles

Voir [commands.md](./commands.md) pour la liste complète.

---

## 📝 Décisions métier

Voir [decisions.md](./decisions.md) pour les décisions importantes.

---

## ✅ Fonctionnalités implémentées

- ✅ Vérification récursive complète
- ✅ 2 modes de vérification (immédiate/projetée)
- ✅ Allocation virtuelle pour gestion concurrence
- ✅ Matching commande→OF (MTS/NOR/MTO)
- ✅ Mode S+1 (horizon 7+ jours)
- ✅ Prévisions Export
- ✅ Dashboard Streamlit
- ✅ Tests unitaires

---

## ⏳ Évolutions futures

1. **Optimisation quantités** : Produire 145 au lieu de 147 si manque 2 unités
2. **Intégration LLM** : Recommandations contextuelles
3. **Alertes proactives** : Détection anticipée S+2, S+3

---

## 🔗 Liens utiles

- [Documentation complète](../CLAUDE.md)
- [TODO](../TODO.md)
- [Plan allocation virtuelle](../.claude/plans/virtual-stock-allocation.md)
