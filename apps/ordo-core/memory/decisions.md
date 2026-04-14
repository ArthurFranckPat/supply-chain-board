# Décisions métier - Ordonnancement Production v2

---

## 📋 Décisions clés

### 1. Allocation virtuelle : Pourquoi et comment ?

**Contexte** : Sans allocation virtuelle, chaque OF est vérifié indépendamment avec le même stock. Cela mène à une sur-estimation de la capacité.

**Exemple du problème** :
```
Stock BDH2216AL : 668 unités

OF F426-09822 → Besoin 288 → ✅ Faisable
OF F426-10101 → Besoin 256 → ✅ Faisable
OF F426-09503 → Besoin 540 → ✅ Faisable

Réalité : 668 < (288 + 256 + 540) = 1084 → Les 3 OF ne peuvent PAS être servis !
```

**Décision** : Implémenter l'allocation virtuelle pour gérer la concurrence entre OF.

**Règles de priorité** :
1. **Date de besoin** : OF avec date plus tôt = prioritaire
2. **Faisabilité** : OF 100% faisable passe avant OF prioritaire mais non faisable

**Exemple de la règle 2** :
```
Stock : 20 unités

Sans règle :
  OF A (13/03) → Besoin 30 → Passe → alloue 20 → manque 10 → ❌ Bloqué
  OF B (15/03) → Besoin 20 → Après → plus de stock → ❌ Bloqué

Avec règle :
  OF B (15/03) → ✅ Faisable → Alloue 20 → ✅ Complet
  OF A (13/03) → Attend (sera rejoué quand du stock arrive)
```

---

### 2. OF FERME vs OF SUGGÉRÉ : Allocation différente

**Contexte** : Les OF FERMES (statut 1) ont souvent déjà des allocations existantes dans `allocations.csv`. Les OF SUGGÉRÉS (statut 3) n'en ont pas.

**Décision** : L'allocation virtuelle ne s'applique PAS aux OF FERMES avec allocations existantes.

**Justification** :
- Les OF FERMES sont déjà engagés
- Leurs allocations sont déjà enregistrées
- Appliquer l'allocation virtuelle reviendrait à "désallouer" un OF engagé

**Implémentation** :
```python
# Dans AllocationManager._allocate_of()
if of.statut == 1 and of_has_existing_allocations:
    # Ne pas appliquer l'allocation virtuelle
    # Utiliser le stock réel
else:
    # Appliquer l'allocation virtuelle
```

---

### 3. Ancienneté commande : Critère de priorité

**Contexte** : Quand plusieurs OF sont en concurrence pour le même stock, la date de besoin ne suffit pas toujours.

**Décision** : Ajouter l'ancienneté de la commande comme critère de priorité secondaire.

**Règle** :
1. **Date de besoin** (critère principal)
2. **Ancienneté commande** (critère secondaire)
3. **Faisabilité** (règle d'exception)

**Exemple** :
```
Stock : 50 unités

OF A : Date 10/03, Commande du 01/01, Besoin 40 → ✅ Faisable
OF B : Date 10/03, Commande du 01/02, Besoin 40 → ✅ Faisable

Ordre :
1. OF A (ancienneté + date)
2. OF B (date, moins ancien)
```

---

### 4. Mode S+1 : Horizon de 7 jours par défaut

**Contexte** : Les ordonnanceurs ont besoin de connaître la faisabilité des OF pour les prochains jours.

**Décision** : Implémenter un mode S+1 avec un horizon de 7 jours par défaut.

**Justification** :
- Correspond au cycle hebdomadaire de planification
- Permet d'anticiper les ruptures
- Horizon assez court pour être fiable

**Options** :
- `--s1` : Active le mode S+1
- `--horizon N` : Modifie l'horizon (défaut: 7 jours)
- `--with-previsions` : Inclut les prévisions Export

---

### 5. Vérification récursive : Arrêt aux composants ACHAT

**Contexte** : La vérification de faisabilité doit être complète mais ne peut pas être infinie.

**Décision** : La vérification récursive s'arrête aux composants ACHAT.

**Justification** :
- Les composants ACHAT sont les "feuilles" de la nomenclature
- Ils sont approvisionnés, pas fabriqués
- Vérifier au-delà n'a pas de sens

**Règle d'affermissement** :
- **Composant ACHAT en rupture** → ❌ INTERDIT d'affermir
- **Composant FABRICATION en rupture** → ✅ AUTORISÉ (on peut lancer un OF)

---

### 6. Nomenclature non disponible : Alerte, pas erreur

**Contexte** : 16% des articles FABRICATION n'ont pas de nomenclature dans `nomenclatures.csv`.

**Décision** : Générer une alerte "Nomenclature non disponible" plutôt qu'une erreur.

**Justification** :
- L'ordonnanceur doit être informé
- Mais la vérification peut continuer pour les autres OF
- Permet une vérification partielle

**Implémentation** :
```python
result.add_alert(f"Nomenclature non disponible pour l'article {article}")
```

---

### 7. Prévisions Export : Intégration optionnelle

**Contexte** : Les prévisions Export sont des commandes futures qui n'existent pas encore dans le système.

**Décision** : Intégrer les prévisions Export comme des commandes fictives dans le mode S+1.

**Justification** :
- Permet d'anticiper les besoins futurs
- Améliore la planification
- Optionnel car toutes les entreprises n'ont pas de prévisions

**Implémentation** :
- Fichier : `previsions_export.csv`
- Option : `--with-previsions`
- Traitement : Identique aux commandes clients normales

---

## 📝 Notes de développement

### Patterns de code

1. **Checker pattern** : Tous les checkers héritent de `BaseChecker`
2. **Loader pattern** : `DataLoader` charge tous les CSV au démarrage
3. **State pattern** : `StockState` gère l'état du stock virtuel
4. **Strategy pattern** : Différentes stratégies d'allocation (immédiate, projetée)

### Choix techniques

- **pandas** : Manipulation des données CSV
- **rich** : Affichage console coloré
- **streamlit** : Dashboard web
- **pytest** : Tests unitaires

---

## 🔗 Références

- [Plan allocation virtuelle](../.claude/plans/virtual-stock-allocation.md)
- [Documentation complète](../CLAUDE.md)
- [TODO](../TODO.md)
