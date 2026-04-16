# Ordonnancement Production v2

Moteur d'ordonnancement et de faisabilite composants pour la production.

## Objectif

Evaluer rapidement si les besoins clients sont servables en combinant:
- stock disponible,
- OF existants,
- receptions achats,
- allocations virtuelles.

## Source de donnees

Le projet lit les extractions ERP centralisees dans:

`C:\Users\bledoua\OneDrive - Aldes Aeraulique\Donn\u00e9es\Extractions`

Vous pouvez surcharger ce chemin avec la variable d'environnement:

`ORDO_EXTRACTIONS_DIR`

Fichiers attendus:
- `Articles.csv`
- `Gammes.csv`
- `Nomenclatures.csv`
- `Besoins Clients.csv`
- `Ordres de fabrication.csv`
- `Stocks.csv`
- `Commandes Achats.csv`
- `Allocations.csv`

## Regles de matching commande -> OF

1. Lien direct prioritaire via `NUM_ORDRE_ORIGINE`:
- si `OF.NUM_ORDRE_ORIGINE == besoin.NUM_ORDRE`
- et `METHODE_OBTENTION_LIVRAISON == "Ordre de fabrication"`
- alors cet OF est prioritaire pour la commande.

2. Sinon, branche NOR/MTO:
- allocation du stock virtuel,
- calcul du besoin net,
- recherche OF compatible par article, quantite, date, statut.

3. Quantite de besoin utilisee pour le matching:
- `QTE_RESTANTE_FABRICATION` (pas `QTE_RESTANTE_LIVRAISON`).

## Installation

```bash
pip install -r requirements.txt
```

## Utilisation CLI

```bash
python -m src.main
python -m src.main --data-dir "C:/Users/.../Donn\u00e9es/Extractions"
python -m src.main --s1 --horizon 7
```

## API locale

```bash
uvicorn src.api.server:app --reload
```

Endpoints utiles:
- `GET /health`
- `GET /config`
- `POST /data/load` (source `extractions`)
- `POST /runs/s1`

## GUI locale

```bash
cd frontend
npm install
npm run dev
```

Le frontend pointe par defaut sur `http://127.0.0.1:8000`.

## Structure

- `src/models`: modeles metier
- `src/loaders`: chargement et normalisation des extractions
- `src/algorithms`: matching, allocation, calculs
- `src/checkers`: verification de faisabilite
- `src/scheduler`: planification
- `src/api`: API FastAPI
