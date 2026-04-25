# Production Planning

Moteur d'ordonnancement et de faisabilite composants pour la production.

## Objectif

Evaluer rapidement si les besoins clients sont servables en combinant:
- stock disponible,
- OF existants,
- receptions achats,
- allocations virtuelles.

## Source de donnees

Le projet lit les extractions ERP via la variable d'environnement `ORDO_EXTRACTIONS_DIR`.

Fichiers attendus:
- `Articles.csv`
- `Gammes.csv`
- `Nomenclatures.csv`
- `Besoins Clients.csv` (commandes + previsions unifiees)
- `Ordres de fabrication.csv`
- `Stocks.csv`
- `Commandes Achats.csv`
- `Allocations.csv`

## Regles de matching commande -> OF

1. Lien direct prioritaire via `NUM_ORDRE_ORIGINE`:
   - si `OF.NUM_ORDRE_ORIGINE == besoin.NUM_ORDRE`
   - et `METHODE_OBTENTION_LIVRAISON == "Ordre de fabrication"`
   - alors cet OF est prioritaire pour la commande.

2. Contre-marque MTS via `OF_CONTREMARQUE`.

3. Sinon, branche NOR/MTO:
   - allocation du stock virtuel,
   - calcul du besoin net,
   - recherche OF compatible par article, quantite, date, statut.

4. Quantite de besoin utilisee pour le matching:
   - `QTE_RESTANTE_FABRICATION` (pas `QTE_RESTANTE_LIVRAISON`).

## Installation

```bash
pip install -r requirements.txt
```

## API locale

```bash
uvicorn planning_engine.api.server:app --reload --port 8000
```

### Endpoints

**Core:**
- `GET /health` - Health check
- `GET /api/v1/config` - Configuration actuelle
- `POST /api/v1/data/load` - Charger les donnees ERP
- `POST /api/v1/runs/schedule` - Lancer l'ordonnancement
- `GET /api/v1/runs/{run_id}` - Résultats d'une exécution

**Rapports:**
- `GET /api/v1/reports/actions/latest` - Dernier rapport d'actions
- `GET /api/v1/reports/files` - Liste des rapports disponibles

**Calendrier:**
- `GET /api/v1/calendar/{year}/{month}` - Calendrier mensuel
- `PUT /api/v1/calendar/manual-off` - Modifier les jours off manuels
- `POST /api/v1/calendar/holidays/refresh` - Rafraichir les jours feries (API Nager.Date)

**Capacite:**
- `GET /api/v1/capacity` - Configuration capacite par poste
- `PUT /api/v1/capacity/poste` - Modifier la capacite d'un poste
- `PUT /api/v1/capacity/override` - Override quotidien ou hebdomadaire
- `DELETE /api/v1/capacity/override` - Supprimer un override

## GUI locale

```bash
cd frontend
npm install
npm run dev
```

Le frontend pointe par defaut sur `http://127.0.0.1:8000`.

## Structure

- `planning_engine/models`: modeles metier (`BesoinClient`, `OF`, `Article`, `Stock`, etc.)
- `planning_engine/loaders`: chargement et normalisation des extractions CSV
- `planning_engine/orders`: matching, allocation, consommation des previsions
- `planning_engine/feasibility`: verification de faisabilite et analyses metier
- `planning_engine/planning`: calendrier, capacite, jours feries, poids, calcul de charge
- `planning_engine/scheduling`: planification, moteur, reporting, material state
- `planning_engine/api`: API FastAPI
- `config/`: configuration persistente (`calendar.json`, `capacity.json`, `holidays_2026.json`)
