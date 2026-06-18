# Mockups — Design system « Papier »

Maquettes HTML **standalone** (double-clic, aucun serveur) du redesign Papier du
Supply Chain Board. Ouvrez `index.html` pour la galerie, ou `design-system.html`
pour la référence canonique.

## Entrées principales

- **`design-system.html`** — design system complet (tokens couleurs/typo/espacement, composants)
- `index.html` — galerie des 3 directions de layout (Mission / Papier / Bento)
- `cartes.html` — 3 propositions de carte commande (Ticket / Bloc / Data)
- `palettes.html`, `palettes-cards.html` — exploration de palettes (avant choix Papier)

## Sous-dossiers

- **`v3-papier/`** — itérations finales
  - `B1-quotidien.html` / `B2-cahier.html` / `B3-registre.html` — board (choisi : **B1**)
  - `detail.html` — panneau de détail commande (choisi : **D3** panneau bas)
  - `ruptures/` — page ruptures (choisi : **R1a « Édition »**, sans standfirst ni KPI)
- **`board-alternatives/`** — alternatives de représentation du board
  (Régie / Postes / Chaleur / Aires / Donut) — choisi : **histogramme hebdo empilé**

## Repères

- Palette Papier : papier crème `#f3ece0` + terre cuite `#a8431f` ; statuts
  Ferme `#5b7d4e` / Planifié `#2f4858` / Suggéré `#b8862c` / Danger `#9a3320`
- Polices : Fraunces (display) + Inter (corps) + JetBrains Mono (données)
- Charge en **heures absolues** (pas de capacité par ligne → pas de jauge %) ;
  moyenne en h/semaine

> Ces mockups sont la **source de décision**. Le design system réel vit dans le
> code : scope `.theme-papier` dans `resources/css/app.css` + composants
> `inertia/components/` (voir la page `/design-system`).
