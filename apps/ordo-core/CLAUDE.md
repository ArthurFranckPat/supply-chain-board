# Ordonnancement Production v2

Système de gestion de production et d'ordonnancement manufacturier avec analyse des commandes MTS/MTO/NOR.

## 📁 Structure des données

### Source de données

Les données sont chargées depuis les extractions ERP via la variable d'environnement `ORDO_EXTRACTIONS_DIR`.

Configurer dans `.env` :
```
ORDO_EXTRACTIONS_DIR = "/chemin/vers/extractions/ERP"
```

Fichiers attendus (noms ERP) :
- `Articles.csv`
- `Gammes.csv`
- `Nomenclatures.csv`
- `Besoins Clients.csv`
- `Ordres de fabrication.csv`
- `Stocks.csv`
- `Commandes Achats.csv`
- `Allocations.csv`

Les CSV ne sont **pas** versionnés dans le dépôt.

## 🗂️ Structure des tables

### Articles.csv - Catalogue produits
```
ARTICLE         → Code article (PK)
DESCRIPTION     → Description produit
CATEGORIE       → Catégorie (AP, APV, PF3, PFAS, etc.)
TYPE_APPRO      → Type d'approvisionnement (ACHAT ou FABRICATION)
DELAI_REAPPRO   → Délai de réapprovisionnement (jours)
```

### Besoins Clients.csv - Commandes et Prévisions ⭐

**Colonnes :**
```
NOM_CLIENT                  → Nom client
PAYS_CLIENT                 → Pays
TYPE_COMMANDE               → Type (MTS, MTO, NOR)
NUM_COMMANDE                → Numéro de commande
NATURE_BESOIN               → Nature (COMMANDE ou PREVISION) ⭐
ARTICLE                     → Code article (FK → articles)
OF_CONTREMARQUE             → OF lié (MTS uniquement)
DATE_COMMANDE               → Date de commande
DATE_EXPEDITION_DEMANDEE    → Date d'expédition demandée
QTE_COMMANDEE               → Quantité commandée
QTE_ALLOUEA                 → Quantité allouée
QTE_RESTANTE                → Quantité restante à servir
```

**Statistiques actuelles :**
- **735** commandes fermes (NATURE_BESOIN = "COMMANDE")
- **10 307** prévisions (NATURE_BESOIN = "PREVISION")
- **3 893** MTS (34%)
- **2 393** MTO (21%)
- **4 892** NOR (45%)

**Changement majeur :**
- Anciennement `commandes_clients.csv` (835 lignes)
- Fusionne maintenant **commandes fermes + prévisions** dans un seul fichier
- Les prévisions sont consommées par les commandes lors du calcul de charge

### Ordres de fabrication.csv - Ordres de fabrication
```
NUM_OF              → Numéro d'OF (PK)
ARTICLE             → Code article à fabriquer (FK → articles)
DESCRIPTION         → Description
STATUT_NUM_OF       → Status (1 = Ferme/Affermi, 3 = Suggéré)
STATUT_TEXTE_OF     → Status texte ("Ferme", "Suggéré")
DATE_DEBUT          → Date de début prévue (jalonnement CBN)
DATE_FIN            → Date de fin prévue
QTE_A_FABRIQUER     → Quantité à fabriquer
QTE_FABRIQUEE       → Quantité fabriquée
QTE_RESTANTE        → Quantité restante
```

**Statuts OF :**
- **1 = Ferme (Affermi/WOP)** : OF déjà lancé en production, prioritaire pour le matching
- **3 = Suggéré (WOS)** : OF suggéré par le moteur CBN/MRP, utilisé si pas d'OF affermi disponible

### Allocations.csv - Traçabilité des allocations ⭐

**Colonnes :**
```
ARTICLE         → Code article
QTE_ALLOUEE     → Quantité allouée
NUM_DOC         → Numéro de document (OF ou commande)
DATE_BESOIN     → Date de besoin
```

**Utilité :**
- Traçabilité complète des allocations de stock
- Lien entre OF, commandes et articles
- Historique des mouvements de stock

### Nomenclatures.csv - Nomenclatures articles ⭐
```
Article parent           → Article fabriqué (code)
Designation parent      → Description de l'article parent
Niveau                  → Niveau de profondeur (5, 10, 15, 20, 25...)
Article composant       → Code du composant nécessaire
Désignation composant   → Description du composant
Qté lien                → Quantité nécessaire pour 1 unité parent (peut être décimale)
Type article            → "Acheté" ou "Fabriqué"
```

**Caractéristiques :**
- **2 501 articles** avec nomenclature connue
- **25 028 lignes** de relations parent → composant
- **1 474 articles** ont des composants fabriqués (niveau 2+)
- Permet la **vérification récursive complète**
- **Couverture : 84%** des articles FABRICATION

**Exemple :**
```csv
"MH7652";"MH REG03 -- 2,3 BDH";    5;"MH7649";"MH ---- PRER03 2,3 BDH";1;"Fabriqué"
"MH7652";"MH REG03 -- 2,3 BDH";   10;"E4074";"ROULEAU ETIQ NON DECOUPE";0,000005;"Acheté"
"MH7652";"MH REG03 -- 2,3 BDH";   30;"D5624";"ETIQ PVC ROSE 70x55";3;"Acheté"
```

**Utilisation :**
- Permet de connaître la nomenclature **indépendamment des OF**
- Essentiel pour la vérification récursive des composants FABRIQUÉS
- Remplace l'ancien fichier `of_composants.csv` (supprimé)

### Gammes.csv - Gammes de production
```
ARTICLE         → Code article (FK → articles)
POSTE_CHARGE    → Poste de travail (PP_XXX)
LIBELLE_POSTE   → Description du poste
CADENCE         → Cadence (unités/heure)
```

### Stocks.csv - État des stocks
```
ARTICLE         → Code article (FK → articles)
STOCK_PHYSIQUE  → Stock physique disponible
STOCK_ALLOUE    → Stock alloué
STOCK_BLOQUE    → Stock bloqué
```

### Commandes Achats.csv - Réceptions fournisseurs
```
NUM_COMMANDE            → Numéro de commande fournisseur
ARTICLE                 → Code article (FK → articles)
CODE_FOURNISSEUR        → Code fournisseur
QUANTITE_RESTANTE       → Quantité à recevoir
DATE_RECEPTION_PREVUE   → Date de réception prévue
```

## 🔗 Relations entre tables

```
┌─────────────────┐
│  articles       │ ← Table centrale
│  ────────────   │
│  ARTICLE (PK)   │
└────────┬────────┘
         │
         ├──────────────────┬──────────────────┬──────────────────┬───────────────┐
         │                  │                  │                  │               │
         ▼                  ▼                  ▼                  ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ of_entetes      │ │ gammes          │ │ besoins_        │ │ stock           │ │ receptions_oa   │
│ (WOP/WOS)       │ │                 │ │ clients         │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └────────┬────────┘ └─────────────────┘ └─────────────────┘
                                               │
                                               │ OF_CONTREMARQUE
                                               │ (MTS uniquement)
                                               └─────→ of_entetes.NUM_OF

┌─────────────────┐
│ allocations     │ ← NOUVEAU : Traçabilité
│                 │
└─────────────────┘
```

## 🏷️ Types de commandes

### MTS (TYPE_COMMANDE = "MTS") - Make To Stock avec contre-marque

**Caractéristiques :**
- ✅ Contre-marque OBLIGATOIRE
- ✅ Lien direct commande → OF via `OF_CONTREMARQUE`
- ✅ Génère un WOP (Work Order Planned)
- ✅ Allocation AUTOMATIQUE du stock à la commande
- ✅ Peut être COMMANDE ou PREVISION

**Flux :**
```
Besoin MTS (COMMANDE ou PREVISION)
    ↓
Création WOP (lien obligatoire)
    ↓
Affermissement par l'ordonnanceur
    ↓
Fabrication
    ↓
Entrée en stock
    ↓
Allocation AUTOMATIQUE à la commande
    ↓
Expédition
```

### NOR/MTO (TYPE_COMMANDE = "NOR" ou "MTO") - Normal / Make To Order

**Caractéristiques :**
- ✅ Pas de contre-marque
- ✅ PAS de lien direct besoin → OF
- ✅ Traité par le moteur CBN/MRP
- ✅ Génère des WOS (Work Order Suggested)
- ✅ Regroupement hebdomadaire des besoins
- ✅ Allocation MANUELLE du stock aux commandes
- ✅ **NOR** = Tous clients sauf ALDES
- ✅ **MTO** = ALDES (Make To Order)

**Flux :**
```
Besoin NOR/MTO (COMMANDE ou PREVISION)
    ↓
Moteur CBN/MRP (calcul des besoins nets)
    ↓
Génération WOS suggérés (regroupement hebdo)
    ↓
Affermissement par l'ordonnanceur
    ↓
Fabrication pour le stock
    ↓
Entrée en stock
    ↓
Allocation MANUELLE aux commandes
    ↓
Expédition
```

## 📊 Différences clés MTS vs NOR/MTO

| Aspect | MTS | NOR/MTO |
|--------|-----|---------|
| **Contre-marque** | OBLIGATOIRE | Aucune |
| **Lien OF → besoin** | OUI (obligatoire) | NON |
| **Type OF** | WOP (Planifié) | WOS (Suggéré) |
| **Génération OF** | 1 besoin = 1 WOP | Regroupement hebdo = 1 WOS |
| **Allocation stock** | **AUTOMATIQUE** | **MANUELLE** |
| **Nature des besoins** | Peut être COMMANDE ou PRÉVISION | Peut être COMMANDE ou PRÉVISION |
| **Traitement** | Manuel (1 par 1) | Automatisé (CBN/MRP) |
| **Entrée stock** | Oui | Oui |

## 🔧 Terminologie

### WOP - Work Order Planned
- Ordre de fabrication planifié
- Lien obligatoire avec un besoin MTS
- Quantité = quantité du besoin
- Allocation automatique grâce au lien OF_CONTREMARQUE

### WOS - Work Order Suggested
- Ordre de fabrication suggéré
- PAS de lien avec les besoins
- Généré par le moteur CBN/MRP
- Regroupe les besoins par article et par semaine
- Allocation manuelle aux besoins

### NATURE_BESOIN - NOUVEAU
- **COMMANDE** : Commande ferme client (à servir)
- **PREVISION** : Prévision de consommation (consommée par les commandes)

**Exemple de consommation :**
- Prévision : 720 unités
- Commandes : 1200 unités
- **Prévision nette = max(0, 720 - 1200) = 0** → La prévision est complètement consommée

### Contre-marque
- Marquage qui lie un besoin client à un OF spécifique
- Présent uniquement pour MTS
- Stock lié automatiquement au besoin
- Champ `OF_CONTREMARQUE` dans besoins_clients

### CBN/MRP
- Calcul des Besoins Nets / Material Requirements Planning
- Moteur de calcul pour NOR/MTO
- Regroupe les besoins hebdomadaires
- Génère des WOS suggérés
- Consomme les prévisions avec les commandes fermes

## 🔄 Exemples concrets

### MTS - Lien obligatoire + Allocation automatique
```
Besoin: AR2600881 | ALDES | ESHKIT CPT HYGMW- BDH | 448 unités | MTS | OF="F426-07941"
    ↓
Génère: WOP F426-07941 pour 448 unités
    ↓
Fabriqué → Entrée en stock
    ↓
Allocation AUTOMATIQUE : Les 448 unités réservées pour AR2600881
```

### NOR/MTO - Regroupement CBN + Consommation des prévisions
```
Prévision 1: ACTHYS SAS | G2H1942AE | 30 unités | MTO | PREVISION | semaine 8
Prévision 2: ACTHYS SAS | G2H1942AE | 64 unités | MTO | PREVISION | semaine 10
Commande:  ACTHYS SAS | G2H1942AE | 100 unités | MTO | COMMANDE | semaine 10

Le moteur CBN:
- Consomme les prévisions de la semaine 10 (64)
- Reste 36 unités à couvrir par OF
- Génère WOS pour 36 unités
```

## 🎯 Points clés pour le développement

1. **Lien MTS** : `besoins_clients.OF_CONTREMARQUE` → `of_entetes.NUM_OF`
2. **Pas de lien NOR/MTO** : Les WOS ne sont pas liés aux besoins dans la base
3. **Allocation** : MTS = auto, NOR/MTO = manuel (champ QTE_ALLOUEA)
4. **Consommation des prévisions** : Les commandes consomment les prévisions avant calcul de charge
5. **Regroupement** : Le CBN regroupe par article et semaine pour NOR/MTO
6. **Traçabilité** : Le fichier `allocations.csv` permet de retracer tous les mouvements
7. **Types d'approvisionnement** :
   - ACHAT : Réceptions fournisseurs
   - FABRICATION : OF (WOP ou WOS)

## 📈 Statistiques actuelles

| Type | Nombre | % du total |
|------|--------|------------|
| **MTS** | 3 893 | 34% |
| **NOR** | 4 892 | 45% |
| **MTO** | 2 393 | 21% |

| Nature | Nombre | % du total |
|--------|--------|------------|
| **COMMANDE** (fermes) | 735 | 7% |
| **PREVISION** | 10 307 | 93% |

## 🔍 Requêtes utiles

### Articles MTS
```sql
SELECT DISTINCT bc.ARTICLE, a.DESCRIPTION, COUNT(*) as nb_besoins
FROM besoins_clients bc
JOIN articles a ON bc.ARTICLE = a.ARTICLE
WHERE bc.TYPE_COMMANDE = 'MTS'
GROUP BY bc.ARTICLE, a.DESCRIPTION
ORDER BY nb_besoins DESC
```

### Besoins NOR/MTO par client
```sql
SELECT NOM_CLIENT, TYPE_COMMANDE, COUNT(*) as nb_besoins
FROM besoins_clients
WHERE TYPE_COMMANDE IN ('NOR', 'MTO')
GROUP BY NOM_CLIENT, TYPE_COMMANDE
ORDER BY nb_besoins DESC
```

### WOS regroupement hebdo
```sql
SELECT ARTICLE, WEEK(DATE_EXPEDITION_DEMANDEE, 1) as semaine,
       SUM(QTE_RESTANTE) as total_besoin
FROM besoins_clients
WHERE TYPE_COMMANDE IN ('NOR', 'MTO') AND QTE_RESTANTE > 0
GROUP BY ARTICLE, semaine
ORDER BY ARTICLE, semaine
```

### Consommation des prévisions
```sql
SELECT ARTICLE,
       SUM(CASE WHEN NATURE_BESOIN = 'PREVISION' THEN QTE_RESTANTE ELSE 0 END) as prevision,
       SUM(CASE WHEN NATURE_BESOIN = 'COMMANDE' THEN QTE_RESTANTE ELSE 0 END) as commande,
       SUM(QTE_RESTANTE) as total
FROM besoins_clients
WHERE QTE_RESTANTE > 0
GROUP BY ARTICLE
HAVING prevision > 0 AND commande > 0
ORDER BY ARTICLE
```

---

## 🔄 Processus d'ordonnancement

### Cycle hebdomadaire

#### 1. Réunion de charge (Tous les mardis)
- **Participants** : Supply + Production
- **Objectif** : Décider l'organisation des ateliers (2×8, 3×8, etc.)
- **Horizon** : S+1 à S+3 (semaine(s) suivante(s))
- **Base** : Charge de production calculée sur les cadences (`gammes.csv`)
  - **IMPORTANT** : Les prévisions sont consommées par les commandes fermes avant le calcul
- **Question clé** : "Quelle organisation pour répondre aux besoins de S+1/S+2/S+3 ?"

#### 2. Affermissement et lancement (Courant de semaine)
- L'ordonnanceur afermit les OF (WOP et WOS)
- Édition des dossiers de fabrication
- Lancement en production

### Règle d'affermissement
```
INTERDIT d'affermir un OF si un composant est en rupture
  ↓
SAUF si ce composant est un sous-ensemble ou semi-fini fabriqué (en interne)
```

**Exemple de la règle :**
- Composant ACHAT en rupture → ❌ INTERDIT d'affermir
- Composant FABRICATION en rupture → ✅ AUTORISÉ (car on peut lancer un OF pour le composant)

**Mais attention** : Si le composant FABRICATION a lui-même des composants en rupture, il faut vérifier récursivement !

### Contexte approvisionnement
- **Commandes clients** : Passées à 15-21 jours
- **Appros composants** : Délais moyens de 28 jours ou plus
- **Conséquence** : Les appros sont rarement déclenchées par les commandes clients
- **Solution** : Appros déclenchées sur la base de **prévisions** remontées hebdomadairement

---

## 🎯 Problème : Vérification faisabilité composants

### Le problème
Lors de la réunion de charge, on décide d'une organisation (ex: 2×8) pour S+1 à S+3.
**Question** : Comment vérifier qu'on aura les composants nécessaires pour réaliser la production ?

### Enjeux
- Si on valide un 2×8 mais que les composants manquent → Production bloquée
- Si on valide un OF mais que ses composants manquent -> OF bloqué
- L'ordonnanceur doit savoir quels OF sont réellement faisables

### Paramètres de vérification
- **Horizon** : S+1 à S+3 (pas seulement S+1)
- **Récursion** : Vérification complète jusqu'aux composants ACHAT
- **2 niveaux de vérification** :
  - **Immédiate** : Stock disponible uniquement
  - **Projetée** : Stock + réceptions fournisseurs (si date réception ≤ date besoin)

### Règle de nomenclature
- **1 article fabriqué = 1 nomenclature** (standard)
- **Nomenclatures disponibles dans `Nomenclatures.csv`**
- **Couverture : 84%** des articles FABRICATION (2 501 / 2 964)
- Pour les 16% restants → Alerte "Nomenclature non disponible"

### Algorithme de vérification récursive
```
Pour chaque OF à vérifier:
  Pour chaque composant de la nomenclature:
    Si TYPE = ACHAT:
      Vérifier stock disponible (ou projeté avec réceptions)
    Si TYPE = FABRICATION:
      Vérifier récursivement les composants de cet article
```

---

## ⚖️ Gestion de la concurrence composants

### Le problème
Plusieurs OF peuvent nécessiter le même composant en même temps.

**Exemple :**
```
Stock disponible de E7368 : 1000 unités

OF A (F426-08419) → Besoin : 384 unités → Date : 13/03/2026
OF B (F426-08164) → Besoin : 800 unités → Date : 17/03/2026
OF C (F426-08734) → Besoin : 500 unités → Date : 30/03/2026

Total besoin : 1684 unités
Stock disponible : 1000 unités
→ Comment allouer le stock ?
```

### Approche 1 : Pas d'allocation virtuelle
```python
def verifier_sans_concurrence(liste_of):
    """
    Chaque OF est vérifié indépendamment
    Le stock disponible est le même pour tous
    Pas d'interaction entre OF
    """
    for of in liste_of:
        result = verifier_faisabilite_of(of)
        # Le stock est "virtuel" - pas d'allocation réelle
        # OF A et OF B voient tous les deux le même stock disponible
```

**Avantage** : Simple
**Risque** : Si on valide 2 OF alors que le stock ne suffit que pour 1

### Approche 2 : Gestion de la concurrence (2 règles)

**Règle 1 : Date de besoin**
- OF avec date besoin plus tôt = prioritaire

**Règle 2 : Faisabilité**
- Si un OF est 100% faisable avec le stock dispo → il passe **avant** un OF prioritaire mais non faisable

**Exemple :**
```
Stock disponible : 20 unités

OF A : Date 13/03, Besoin 30 → Pas faisable (manque 10)
OF B : Date 15/03, Besoin 20 → ✅ Faisable !

Sans règle 2:
  OF A (13/03) passe → alloue 20 → manque 10 → ❌ Bloqué
  OF B (15/03) après → plus de stock → ❌ Bloqué

Avec règle 2:
  OF B (15/03) passe → alloue 20 → ✅ Complet
  OF A (13/03) attend → (sera rejoué quand du stock arrive)
```

**Principe** : Maximiser le nombre d'OF complètement faisables plutôt que respecter strictement l'ordre chronologique.

---

## 📋 Résumé des contraintes

| Aspect | Contrainte |
|--------|------------|
| **Horizon approvisionnement** | Appros sur prévisions (pas commandes clients) |
| **Horizon vérification** | S+1 à S+3 |
| **Récursion** | Vérification complète jusqu'aux composants ACHAT |
| **Niveaux vérification** | Immédiate (stock) + Projetée (stock + réceptions) |
| **Concurrence** | Gestion par date de besoin + faisabilité |
| **Règle affermissement** | Interdit si composant ACHAT en rupture |

---

## ✅ Disponibilité des données pour la vérification

### Ce qui est disponible

| Donnée | Fichier | Couverture | Utilité |
|--------|---------|------------|---------|
| **Nomenclatures** | `Nomenclatures.csv` | 84% (2 501/2 964) | ⭐ Vérification récursive |
| **OF à vérifier** | `Ordres de fabrication.csv` | 15 044 OF | Identification des besoins |
| **Type approvisionnement** | `Articles.csv` | 100% | Distinction ACHAT/FABRIQUÉ |
| **Stock disponible** | `Stocks.csv` | 99% | Vérification immédiate |
| **Réceptions fournisseurs** | `Commandes Achats.csv` | 520 articles | Vérification projetée |
| **Gammes de production** | `Gammes.csv` | - | Non utilisé pour faisabilité composants |
| **Traçabilité** | `Allocations.csv` | - | Suivi des allocations |

### Points forts

✅ **Nomenclatures.csv résout le problème critique**
- Permet la vérification récursive complète
- Indépendante des OF existants
- Couvre 84% des articles FABRICATION

✅ **Données stock complètes**
- 99% des articles ont un enregistrement stock
- Stock physique, alloué, bloqué disponibles

✅ **Réponses fournisseurs**
- Dates de réception prévues disponibles
- Permettent la vérification "projetée"

✅ **Traçabilité complète**
- Fichier `allocations.csv` pour retracer tous les mouvements

### Limitations

⚠️ **16% d'articles FABRICATION sans nomenclature**
- ~463 articles non couverts
- Solution : Alerte "Nomenclature non disponible"
- Vérification manuelle requise pour ces cas

### Conclusion

**Les données sont SUFFISANTES pour implémenter la vérification de faisabilité :**
- ✅ Algorithme récursif fonctionnel
- ✅ Gestion de la concurrence possible
- ✅ 2 niveaux de vérification (immédiate/projetée)
- ✅ Traçabilité complète des allocations
- ⚠️ 16% de cas limites gérés par alertes

---

## 🎯 Algorithme de Matching Besoin→OF

### Logique de matching pour NOR/MTO

**Pour les besoins NOR/MTO (TYPE_COMMANDE = "NOR" ou "MTO") :**

1. **Vérifier le stock disponible**
   - Allouer le stock disponible pour l'article
   - Si stock complet (besoin_net = 0) → Pas d'OF nécessaire
   - Sinon → Besoin net à couvrir par OF

2. **Vérifier le type d'article**
   - **Article ACHAT** → Pas d'OF, besoin d'approvisionnement fournisseur
   - **Article FABRICATION** → Chercher un OF (affermi prioritaire, puis suggéré)

3. **Recherche d'OF avec priorité**
   - **Priorité 1** : OF affermis (statut 1) - déjà lancés en production
   - **Priorité 2** : OF suggérés (statut 3) - créés par CBN/MRP
   - **Critères de tri** : Type d'OF → Date de besoin → Quantité disponible

4. **Partage d'OF**
   - Plusieurs besoins peuvent partager un OF si capacité suffisante
   - Suivi de consommation via `OFConso`

### Priorité de sélection des OF

```
Ordre de priorité :
1. Type d'OF : Affermi (statut 1) > Suggéré (statut 3)
2. Proximité de date : Écart croissant avec date d'expédition
3. Quantité disponible : Décroissante (pour minimiser le nombre d'OF)
```

**Clé de tri** : `(priorite, ecart_days, -qte_restante)`

---

## 📊 Implémentations réalisées

### Matching besoin→OF avec partage d'OF

**Fichier** : `src/algorithms/matching.py`

**Fonctionnalités :**
1. Allocation de stock avant recherche d'OF (utilise QTE_RESTANTE)
2. Distinction ACHAT vs FABRICATION
3. Priorité OF affermi > OF suggéré
4. Partage d'OF entre plusieurs besoins (via OFConso)
5. Gestion de la consommation des OF

**Classes clés :**
- `OFConso` : Suivi de la consommation d'un OF
- `StockAllocation` : Résultat de l'allocation de stock
- `MatchingResult` : Résultat du matching besoin→OF

### Vérification de faisabilité des OF

**Fichiers** : `src/checkers/`

**Fonctionnalités :**
1. Vérification immédiate (stock actuel)
2. Vérification projetée (stock + réceptions fournisseurs)
3. Vérification récursive des nomenclatures jusqu'aux composants ACHAT
4. Gestion de la concurrence composants entre OF

### Heatmap de charge avec consommation des prévisions

**Fonctionnalité** : `calculate_weekly_charge_heatmap()`

**Principe** :
- Les commandes fermes consomment les prévisions correspondantes
- Formule : `Prévision nette = max(0, Prévisions - Commandes)`
- Réduit significativement la surévaluation de la charge

---

## 🔧 Commandes utiles

### Heatmap complète
```bash
python -m src.main --charge-heatmap --num-weeks 4
```

### Lancer le mode S+1
```bash
python -m src.main --s1 --horizon 7
```

### Lancer avec un OF spécifique
```bash
python -m src.main --of F426-08419
```

### Lancer en mode détaillé
```bash
python -m src.main --detailed
```
