# Analyse d'adéquation des lots économiques

## Objectif

Identifier les composants achetés dont le lot économique de réapprovisionnement est disproportionné par rapport aux besoins réels, qu'il soit surdimensionné (surstock) ou sous-dimensionné (risque rupture).

## Périmètre

Sont analysés les articles présents dans `Nomenclatures.csv` en tant que `ARTICLE_COMPOSANT` avec `TYPE_COMPOSANT = "Acheté"` et disposant d'une nomenclature parente liée à des besoins clients actifs.

## Calcul de la demande hebdomadaire

```
demande_hebdo = Σ (besoin_client.qte_restante × nomenclature.qte_lien) / nb_semaines_horizon
```

Pour chaque besoin client actif (`qte_restante > 0`), on remonte via la nomenclature de l'article parent pour obtenir le besoin induit en composants. La somme est ramenée à une moyenne hebdomadaire sur l'horizon couvert par les besoins clients (du premier au dernier besoin).

## Couverture apportée par un lot

```
couverture_lot_semaines = LOT_ECONOMIQUE / demande_hebdo
```

Nombre de semaines de demande couvertes par un seul lot économique.

## Couverture requise par le délai fournisseur

```
couverture_reappro_semaines = DELAI_REAPPRO / 7
```

Le délai de réapprovisionnement converti en semaines. C'est le minimum que le lot doit couvrir pour éviter une rupture entre deux commandes.

## Ratio de couverture

```
ratio = couverture_lot_semaines / couverture_reappro_semaines
```

Un ratio de 1 signifie que le lot couvre exactement le délai fournisseur. Un ratio de 10 signifie que chaque commande apporte 10x le stock nécessaire pour couvrir le délai.

## Classification

| Statut | Condition | Signification |
|--------|-----------|---------------|
| SURDIMENSIONNÉ | ratio > 2.0 | Le lot couvre plus de 2x le délai → surstock |
| SOUSDIMENSIONNÉ | ratio < 0.8 | Le lot ne couvre pas le délai → risque rupture |
| OK | 0.8 ≤ ratio ≤ 2.0 | Lot proportionné |
| DEMANDE NULLE | demande_hebdo < 0.5 | Consommation négligeable ou nulle |

Les articles avec `DELAI_REAPPRO = 0` (non renseigné dans l'ERP) sont classés OK par défaut car le ratio ne peut pas être calculé sans délai de référence.

## Métriques complémentaires

- **stock_jours** : stock disponible / demande journalière (-1 = ∞ si stock disponible sans demande)
- **valeur_stock** : stock_physique × PMP (prix moyen pondéré)
- **nb_parents** : nombre d'articles parents utilisant ce composant

## Exemples

### Surdimensionné

**G681 — CHEVILLE UX 6 R FISCHER** :
- Lot éco = 75 000, demande = 1.3/sem, délai = 21j
- Couverture lot = 75 000 / 1.3 = 57 652 sem (≈ 1 089 ans)
- Couverture délai = 21 / 7 = 3 sem
- Ratio = 18 884x → SURDIMENSIONNÉ

### Sous-dimensionné

**11010981 — S/E EA30 V02 BLC9016** :
- Lot éco = 1 620, demande = 548/sem, délai = 28j
- Couverture lot = 1 620 / 548 = 3.0 sem
- Couverture délai = 28 / 7 = 4 sem
- Ratio = 0.74x → SOUSDIMENSIONNÉ

## Données sources

| Fichier | Champ utilisé |
|---------|--------------|
| Articles.csv | LOT_ECONOMIQUE, DELAI_REAPPRO, PMP |
| Nomenclatures.csv | ARTICLE_COMPOSANT, QTE_LIEN, TYPE_COMPOSANT |
| Besoins Clients.csv | ARTICLE, QTE_RESTANTE, DATE_FIN |
| Stocks.csv | STOCK_PHYSIQUE, STOCK_ALLOUE |

## Endpoint API

`POST /api/v1/analyse-lot-eco` — aucun paramètre requis. Retourne la liste complète des composants analysés avec leurs métriques.
