---
name: matching-commandes
description: |
  Effectue le matching entre les commandes clients NOR/MTO (FLAG_CONTREMARQUE=1) et les Ordres de Fabrication disponibles. Alloue d'abord le stock existant, puis cherche les OF en donnant la priorité aux affermis (statut 1) sur les suggérés (statut 3). Gère le partage d'OF entre plusieurs commandes, calcule le taux de service et liste les commandes non couvertes. Déclencher ce skill dès que l'utilisateur mentionne : matching commandes, couvrir commandes, taux de service, commandes NOR, commandes MTO, affecter OF, allouer stock commandes, commandes non servies, commandes en attente, couverture commandes clients, ou demande combien de commandes peuvent être honorées.
---

# Matching Commandes → OF

Matching des commandes NOR/MTO (FLAG=1) avec les Ordres de Fabrication disponibles.

---

## 1. Données requises

| Fichier | Colonnes utilisées |
|---------|-------------------|
| `commandes_clients.csv` | NUM_COMMANDE, LIGNE_COMMANDE, NOM_CLIENT, ARTICLE, QTE_RESTANTE, DATE_EXPEDITION_DEMANDEE, FLAG_CONTREMARQUE |
| `of_entetes.csv` | NUM_OF, ARTICLE, STATUT_NUM_OF, DATE_FIN, QTE_RESTANTE |
| `stock.csv` | ARTICLE, STOCK_PHYSIQUE, STOCK_ALLOUE, STOCK_BLOQUE |
| `articles.csv` | ARTICLE, TYPE_APPRO |

**Paramètres :**
- `--data-dir` : chemin vers les CSV
- `--horizon` : semaine(s) à inclure (ex: `1` pour S+1 seulement, `3` pour S+1 à S+3)
- `--flag` : `1` (NOR/MTO, défaut) ou `5` (MTS) ou `all`

---

## 2. Algorithme de matching

### Étape 1 — Filtrer les commandes NOR/MTO

```
Commandes éligibles :
  - FLAG_CONTREMARQUE = 1
  - QTE_RESTANTE > 0
  - DATE_EXPEDITION_DEMANDEE dans l'horizon demandé (si filtré)

Trier par DATE_EXPEDITION_DEMANDEE croissante (urgence d'abord).
```

### Étape 2 — Initialiser le stock virtuel

```
stock_virtuel[article] = STOCK_PHYSIQUE - STOCK_ALLOUE - STOCK_BLOQUE
# Ne jamais descendre en dessous de 0
```

### Étape 3 — Pour chaque commande, allouer le stock puis matcher un OF

```python
for commande in commandes_triées:
    article = commande.ARTICLE
    besoin = commande.QTE_RESTANTE
    type_appro = articles[article].TYPE_APPRO

    # a) Allouer le stock disponible d'abord
    stock_alloué = min(besoin, stock_virtuel[article])
    stock_virtuel[article] -= stock_alloué
    besoin_net = besoin - stock_alloué

    if besoin_net == 0:
        result = COUVERT_PAR_STOCK
        continue

    if type_appro == "ACHAT":
        result = BESOIN_APPROVISIONNEMENT  # Pas d'OF possible
        continue

    # b) Chercher un OF (FABRICATION uniquement)
    of_candidats = of_disponibles[article]  # OF avec QTE_RESTANTE_OF > 0

    # Trier : affermi (statut 1) > suggéré (statut 3), puis par écart de date, puis par qté décroissante
    of_candidats.sort(key=lambda of: (
        0 if of.STATUT == 1 else 1,           # Affermi prioritaire
        abs((of.DATE_FIN - commande.DATE_EXP).days),  # Proximité date
        -of.QTE_RESTANTE_OF                   # Plus grande quantité d'abord
    ))

    for of in of_candidats:
        if of.QTE_RESTANTE_OF >= besoin_net:
            # OF couvre entièrement le besoin
            of.QTE_RESTANTE_OF -= besoin_net  # Consommer l'OF (partage possible)
            result = COUVERT_PAR_OF(of.NUM_OF)
            break
        else:
            # OF couvre partiellement → utiliser tout l'OF, chercher un autre
            besoin_net -= of.QTE_RESTANTE_OF
            of.QTE_RESTANTE_OF = 0
            result = PARTIEL_OF(of.NUM_OF, reste=besoin_net)
            # Continuer à chercher pour couvrir le reste

    if besoin_net > 0:
        result = NON_COUVERT(manque=besoin_net)
```

### Étape 4 — Calculer le taux de service

```
taux_service = nb_commandes_couvertes / nb_commandes_total × 100

Répartition :
  - Couvertes par stock seul
  - Couvertes par OF affermi
  - Couvertes par OF suggéré
  - Partiellement couvertes
  - Non couvertes (article ACHAT sans stock)
  - Non couvertes (article FABRICATION sans OF)
```

---

## 3. Script d'analyse

```bash
python3 .claude/skills/matching-commandes/scripts/matching.py \
  --data-dir data \
  --horizon 3 \
  --flag 1
```

---

## 4. Structure du rapport à produire

### Bloc 1 — Taux de service global

```
Commandes NOR/MTO analysées : N (horizon S+1 à S+3)

Taux de service : XX% (X/N commandes couvertes)

Répartition :
  ✅ Stock seul       : XX%  (N commandes)
  ✅ OF affermi       : XX%  (N commandes)
  ✅ OF suggéré       : XX%  (N commandes)
  🟡 Partiel          : XX%  (N commandes)
  🔴 Non couvert      : XX%  (N commandes)
```

### Bloc 2 — Détail par commande

| Commande | Client | Article | Qté | Date exp. | Stock alloué | OF utilisé | Type OF | Statut |
|----------|--------|---------|-----|-----------|-------------|------------|---------|--------|
| AR2600881 | AERECO | EAR035 | 360 | 25/03 | 150 | F426-07941 | Affermi | ✅ |
| AR2600882 | KROBATH | MR160 | 48 | 28/03 | 0 | F426-08002 | Suggéré | ✅ |
| AR2600883 | PARTN  | BDH75 | 200 | 01/04 | 0 | — | — | 🔴 |

### Bloc 3 — Commandes non couvertes (à traiter en priorité)

Pour chaque commande non couverte :
- Article + description
- Quantité manquante
- Raison (pas d'OF disponible / article ACHAT sans stock / OF insuffisant)
- Action suggérée (créer WOS / lancer appro fournisseur / reporter)

### Bloc 4 — OF partagés (utilisés par plusieurs commandes)

Lister les OF utilisés par 2+ commandes avec leur taux de consommation.

---

## 5. Cas limites

| Situation | Comportement |
|-----------|-------------|
| Commande MTS (FLAG=5) passée en paramètre | Traiter mais noter que MTS a un lien direct via OF_CONTREMARQUE |
| OF suggéré déjà consommé à 100% | Ne pas l'utiliser, passer au suivant |
| Plusieurs OF affermis pour le même article | Prendre le plus proche en date |
| Stock négatif (STOCK_ALLOUE > STOCK_PHYSIQUE) | Traiter comme 0 disponible, avertir |
| Article ACHAT avec stock suffisant | Couvrir par stock, pas d'OF requis |
