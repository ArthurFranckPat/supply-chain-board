# Enrichment TODO - Champs SUIVCDE non couverts par production-planning

## Contexte

Suivi-commandes utilise desormais le package partage `erp-data-access` pour
charger les donnees ERP. Cependant, 8 champs du fichier `*_SUIVCDE.csv` ne
sont pas disponibles dans les extractions ERP chargees par production-planning. Ces
champs sont actuellement positionnes a `None` dans le DataFrame produit par
`build_suivcde_dataframe()`.

## Champs manquants

### Critiques pour la logique metier

| Champ | Usage dans status_logic | Impact actuel |
|-------|------------------------|---------------|
| **Emplacement** | Detection zone d'expedition (`QUAI\|SM\|EXP\|S9C\|S3C`). Si en zone -> status "Allocation a faire" | `_en_zone_expe` toujours `False` |
| **Etat commande** | Filtre dur : uniquement `"Non soldee"` | Pas de filtrage, toutes les commandes affichees |
| **Etat ligne** | Filtre dur : uniquement `"Attente"` | Pas de filtrage, toutes les lignes affichees |
| **Date liv prevue** | Tri et affichage dans le tableau | Valeur `NaT`, tri degrade |

### Pour l'affichage et l'analyse

| Champ | Usage | Impact actuel |
|-------|-------|---------------|
| **Prix brut** | Calcul du CA restant (metric) | CA affiche a 0 EUR |
| **Date mise en stock** | Affichage detail | Colonne vide |
| **HUM** | Affichage detail | Colonne vide |
| **Qte Palette** | Affichage detail | Colonne vide |

## Options d'integration

### Option A : Enrichir les extractions ERP
- Ajouter les colonnes manquantes aux CSV existants :
  - `Besoins Clients.csv` : Etat commande, Etat ligne, Date liv prevue, Prix brut
  - `Stocks.csv` : Emplacement (par ligne de stock)
  - Nouveau fichier ou colonnes : HUM, Qte Palette, Date mise en stock
- Avantage : source unique de verite
- Contrainte : necessite un changement dans l'extraction Sage X3

### Option B : Fichier d'enrichissement leger
- Creer un nouveau CSV `*_SUIVCDE_ENRICHMENT.csv` avec :
  - Cles : No commande + Article
  - Colonnes : Emplacement, Etat commande, Etat ligne, Prix brut, Date liv prevue, HUM, Qte Palette, Date mise en stock
- Le transformer `suivcde_builder.py` mergerait ce fichier avec les donnees DataLoader
- Avantage : pas de changement ERP, format flexible

### Option C : API Sage X3 temps reel
- Utiliser l'API SOAP X3 (comme explore dans `test.py`) pour recuperer les champs manquants a la demande
- Avantage : donnees toujours a jour
- Contrainte : dependance reseau, latence, authentification

## Recommandation

L'Option B est la plus pragmatique a court terme. Elle permet de garder
l'extraction ERP existante et d'ajouter un enrichissement specifique au
suivi-commandes sans impacter production-planning.
