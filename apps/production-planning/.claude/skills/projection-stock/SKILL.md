---
name: projection-stock
description: |
  Projette l'évolution du stock article par article sur un horizon de S+1 à S+4, en intégrant les entrées prévues (réceptions fournisseurs, productions OF) et les sorties prévues (besoins commandes clients, consommation composants OF via nomenclatures). Identifie les articles en tension et calcule les dates de rupture potentielles. Déclencher ce skill dès que l'utilisateur mentionne : projection stock, stock prévisionnel, articles en tension, rupture de stock, date de rupture, besoin futur, couverture de stock, horizon de stock, évolution du stock, ou demande si on va manquer de pièces sur les prochaines semaines.
---

# Projection Stock

Projection de l'évolution du stock sur S+1 à S+4 en intégrant toutes les entrées et sorties prévues.

---

## 1. Données requises

| Fichier | Colonnes utilisées |
|---------|-------------------|
| `Stocks.csv` | ARTICLE, STOCK_PHYSIQUE, STOCK_ALLOUE, STOCK_BLOQUE |
| `Commandes Achats.csv` | ARTICLE, QUANTITE_RESTANTE, DATE_RECEPTION_PREVUE |
| `Ordres de fabrication.csv` | NUM_ORDRE, ARTICLE, DATE_FIN, QTE_RESTANTE_LIVRAISON, STATUT_ORDRE |
| `Besoins Clients.csv` | ARTICLE, QTE_RESTANTE_FABRICATION, DATE_FIN, SOURCE_ORIGINE_BESOIN, TYPE_COMMANDE |
| `Nomenclatures.csv` | ARTICLE_PARENT, ARTICLE_COMPOSANT, QTE_LIEN, TYPE_ARTICLE |
| `Articles.csv` | ARTICLE, TYPE_APPRO |

**Paramètres :**
- `--data-dir` : chemin vers les CSV
- `--horizon` : nombre de semaines (défaut: 4)
- `--article` : filtrer sur un article spécifique (optionnel)
- `--seuil-alerte` : seuil en semaines de couverture en dessous duquel alerter (défaut: 1 semaine)

---

## 2. Algorithme de projection

### Stock de départ

```
stock_initial(article) = STOCK_PHYSIQUE - STOCK_ALLOUE - STOCK_BLOQUE
```

### Entrées prévues (+ au stock)

**Type 1 — Réceptions fournisseurs (OA)**
```
Pour chaque réception :
  semaine = numéro ISO de DATE_RECEPTION_PREVUE
  entrées[article][semaine] += QUANTITE_RESTANTE
```

**Type 2 — Productions OF (articles finis)**
```
Pour chaque OF (statut 1 affermi + statut 3 suggéré) :
  semaine = numéro ISO de DATE_FIN
  entrées[of.ARTICLE][semaine] += of.QTE_RESTANTE
```

### Sorties prévues (- du stock)

**Type 1 — Commandes clients directes**
```
Pour chaque commande avec QTE_RESTANTE > 0 :
  semaine = numéro ISO de DATE_EXPEDITION_DEMANDEE
  sorties[commande.ARTICLE][semaine] += commande.QTE_RESTANTE
```

**Type 2 — Consommation composants pour les OF**
```
Pour chaque OF planifié :
  article_of = of.ARTICLE
  qte_of = of.QTE_RESTANTE
  semaine_besoin = semaine de DATE_FIN - 1 (composants nécessaires avant la fin)

  Pour chaque composant dans nomenclature(article_of) :
    si composant.TYPE == "Acheté" :
      besoin_composant = composant.QTE_LIEN × qte_of
      sorties[composant.ARTICLE][semaine_besoin] += besoin_composant
    # Les composants fabriqués ont leurs propres entrées via leurs OF
```

### Calcul semaine par semaine

```python
stock_courant = stock_initial.copy()

for semaine in [S+1, S+2, S+3, S+4]:
    for article in articles:
        stock_courant[article] += entrées[article][semaine]
        stock_courant[article] -= sorties[article][semaine]

        projection[article][semaine] = stock_courant[article]

        if stock_courant[article] < 0:
            ruptures[article] = semaine  # Première semaine de rupture
```

---

## 3. Calcul de la couverture de stock

```
CMJ estimée = total_sorties_horizon / nb_jours_horizon

Couverture (semaines) = stock_projeté / (CMJ × 5 jours/semaine)
```

Un article est **en tension** si couverture < seuil_alerte (défaut: 1 semaine).

---

## 4. Script d'analyse

```bash
python3 .claude/skills/projection-stock/scripts/projection_stock.py \
  --data-dir data \
  --horizon 4 \
  --seuil-alerte 1
```

---

## 5. Structure du rapport à produire

### Bloc 1 — Résumé des alertes

```
Horizon analysé : S+1 à S+4 (24/03 → 17/04/2026)
Articles analysés : N
  🔴 Ruptures détectées : X articles (stock projeté < 0)
  🟡 Articles en tension : Y articles (couverture < 1 semaine)
  ✅ Articles OK : Z articles
```

### Bloc 2 — Articles en rupture ou en tension

| Article | Désignation | Stock initial | S+1 | S+2 | S+3 | S+4 | Date rupture | Action |
|---------|-------------|--------------|-----|-----|-----|-----|-------------|--------|
| E7368 | MOTEUR BDH 75W | 150 | +250 réc. = 400 | -384 = 16 | -500 = **-484** | — | S+3 | 🚨 Appro urgente |
| D4521 | CARTER ALU    | 200 | -768 = **-568** | — | — | — | S+1 | 🚨 Rupture immédiate |

Afficher les flux semaine par semaine : stock début + entrées - sorties = stock fin.

### Bloc 3 — Tableau complet (tous articles avec mouvement)

Tableau filtrable par article, par statut (rupture/tension/OK), trié par date de rupture croissante.

### Bloc 4 — Détail des flux pour un article (si demandé)

Pour un article spécifique :
```
Article E7368 — MOTEUR BDH 75W
Stock initial : 150 unités

S+1 (30/03–03/04) :
  + Réception OA #12345 : +250 (prévu 01/04)
  - OF F426-08419 (384 unités, composant) : -384
  = Stock fin S+1 : 16 unités ⚠️ TENSION

S+2 (06/04–10/04) :
  + Réception OA #12346 : +300 (prévu 08/04)
  - OF F426-08521 (200 unités) : -200
  = Stock fin S+2 : 116 unités ✅
```

---

## 6. Cas limites

| Situation | Comportement |
|-----------|-------------|
| Article sans mouvement prévu | Inclure si stock initial, indiquer "Pas de mouvement S+1–S+4" |
| Nomenclature manquante | Omettre la consommation composants pour cet OF, avertir |
| DATE_FIN ou DATE_EXP manquante | Exclure du calcul, lister dans avertissements |
| Réception avec date passée | Ignorer (déjà reçu ou annulé) |
| Focus sur un article | Accepter `--article CODE` pour analyse détaillée |
