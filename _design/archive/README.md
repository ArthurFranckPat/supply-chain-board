# Archive — mockups HTML historiques

Maquettes HTML **standalone** des phases de design passées (direction « Papier », bascule
Airbnb, explorations copilote/sequenceur/cockpit/suivi…). Archivées le 12/08/2026 : elles
sont historiques et **ne reflètent plus l'état du produit**.

Le design system vivant est dans le code :

- tokens et thèmes : `resources/css/app.css` (`.theme-papier`, grammaire Airbnb)
- composants : `inertia/components/`
- page de référence : `/design-system` (app)

## Contenu

- `mockups/` — ancien `design/mockups/` (galerie Papier, board-alternatives, v3-papier,
  ruptures, suivi-*, sequenceur, cockpit v1/v2/v3, copilote-*, réceptions, forecast…)
- `showcase/` — ancien `design/showcase/` (grammaire Airbnb, overlays, scénarios)
- `notion-redesign/` — ancien `_design/mockups/notion-redesign/`
- `controle-prod/` — ancien `designs/controle-prod/`

## Preview

```bash
python3 -m http.server 4311 --directory _design/archive
# http://localhost:4311/mockups/index.html
```

> Les explorations de design **en cours** (non commitées) restent dans
> `design/mockups/` (dashboard-layout, dashboard-kpi-overdrive, suivi-cursor-gold,
> suivi-lignes-*, suivi-table-ux, suivi-toolbar-variantes).
