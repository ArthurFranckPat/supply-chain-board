---
target: inertia-react/pages/scheduler/load.tsx
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-15T20-18-11Z
slug: inertia-react-pages-scheduler-load-tsx
---
## Score de santé design

| # | Heuristique | Note | Problème clé |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | Carte sélectionnée, titre du panneau, badge saturation : bons. Mais le carrousel n'affiche aucune position (« 3/12 »), et les modes restaurés de session sont invisibles. |
| 2 | Correspondance monde réel | 3 | Vocabulaire métier excellent (OF/Commande, Brut/Net/Reste). Détruit localement par des symboles muets : ⛶, ‹ ›, `P`. |
| 3 | Contrôle et liberté | 3 | Échap sort du plein écran, resets existent. Mais le carrousel se désactive aux extrémités, et `F` en plein écran ouvre un état non demandé. |
| 4 | Cohérence et normes | 2 | Deux grammaires de segment sur le même écran (toolbar `rounded-lg` mono vs Mois/Semaine `rounded-full` sans). Boutons-icônes ronds ad hoc vs `.btn-icon` carré du design system. |
| 5 | Prévention des erreurs | 2 | Garde-fous réels (session validée, dernier segment verrouillé). Mais le handler global ←/→ agit quel que soit le contrôle qui a le focus. |
| 6 | Reconnaissance > rappel | 2 | ⛶, ‹, › sans libellé ; F/P/Échap n'existent que dans des `title` ; aucune position dans la série. |
| 7 | Efficacité et flexibilité | 3 | ←/→, persistance, inertie : bon pour un power user. Gâché par `P` non standard et l'animation qui rejoue à chaque pas. |
| 8 | Esthétique et minimalisme | 2 | Entête du panneau : 5 contrôles + 2 badges dans une rangée. En plein écran, deux entêtes empilées + une toolbar encartée. |
| 9 | Récupération d'erreur | 3 | Bandeaux x3Error/depthCut, états de chargement, conclusion « aucun manque ». Mais un `requestFullscreen` refusé est avalé en silence. |
| 10 | Aide et documentation | 1 | Aucune aide en ligne : pas de raccourcis listés, pas de `?`, pas de libellé visible sur les icônes. |
| **Total** | | **24/40** | **Acceptable — à retravailler (bas de bande)** |

## Verdict de spécificité

Le socle est authentiquement écrit pour ce produit : Ferme/Planifié/Suggéré, OF vs Commande, Heures vs Pièces (avec la note que la capacité est un temps), les trois crans Brut/Net/Reste justifiés métier, le badge de saturation en heures, et le contrôle matières qui dénonce lui-même son changement de population. Aucun dashboard générique n'a cette honnêteté de vocabulaire.

Tout ce qui a été ajouté récemment est interchangeable : chevrons ronds de 26 px, icône ⛶ de 30 px, `fixed inset-0`, fondu de 260 ms, inertie de molette. Le plein écran dont `F` ré-affiche la toolbar ne raconte rien de la charge : il raconte que l'implémentation n'avait pas accès à ses contrôles. La spécificité de la page vit dans ses données et ses libellés, pas dans ses nouveaux contrôles.

**Scan déterministe** : `detect.mjs` sur les 5 composants + la lib de calcul et le hook d'animation → **0 finding** (exit 0). Voir Run Notes : pas de navigateur dans cette session, donc pas de preuve visuelle.

## Impression générale

Le fond est bon et le socle est honnête ; la couche d'interaction ajoutée par-dessus ne l'est pas. Le geste « je veux voir plus grand » reçoit une toolbar et un panneau de filtres ouverts. Le geste « je veux voir le poste suivant » fait clignoter le graphe. Rien n'enseigne les touches. La plus grande opportunité n'est pas d'embellir ces contrôles, c'est de décider **où** se prennent les décisions de lecture (unité, maille, vue, cran) et de n'avoir qu'un seul endroit.

## Ce qui marche

- **Le badge de saturation** : couleur calculée, icône qui change (warning/speed), taux ET couple charge/capacité en heures. Répond à « qu'est-ce qui est bloqué, de combien » sans cliquer.
- **`MaterialCheck`** : la triple honnêteté (population OF ≠ demande, fenêtre tronquée dite à l'écran, conclusion positive explicite) est rare et évite un faux sentiment de sécurité.
- **La contenance des overlays en plein écran** (`overlayContainer`, `portalContainer`, `layerClassName z-[62]`) : la table de période et son combobox restent utilisables dans le top layer.

## Problèmes prioritaires

**[P0] Le modèle « plein écran + F = toolbar ré-encartée » est un accident d'implémentation.**
- Quoi : `controlsBar` (toute la rangée de page) est rendu DANS le panneau, sous l'entête du panneau, avec le `ToolbarRow` qui porte `px-7 py-2 border-b` dans un panneau en `p-6`. Deux entêtes empilées, un décalage de gouttière visible, et les filtres qui s'ouvrent d'office.
- Pourquoi : la surface de lecture plein écran est le seul endroit où l'utilisateur veut MOINS de chrome ; on y injecte le plus.
- Fix : supprimer la barre ré-encartée. En plein écran, n'exposer dans l'entête du panneau que ce qui appartient au graphe (unité, maille) via le `Segment` partagé, et laisser les filtres derrière leur pill — sans ouverture automatique. `F` = filtres, dans tous les modes.

**[P0] Le modèle clavier n'est ni cohérent ni enseigné.**
- Quoi : handler global ←/→/F/P qui agit quel que soit le contrôle qui a le focus ; `F` change de sens selon le mode ; `P` n'est pas la convention plein écran ; aucun des trois n'est visible à l'écran.
- Pourquoi : c'est la seule page du dépôt à poser des hotkeys globaux. Un utilisateur au clavier déclenche une action qu'il n'a pas demandée.
- Fix : portée explicite (n'agir que si le focus est dans le slider ou le corps, jamais sur un radiogroup/segment), une seule signification par touche, et un pill « Raccourcis (?) » qui les liste.

**[P1] Entête du panneau surchargée, navigation redondante et sans repère.**
- Quoi : 5 contrôles + 2 badges dans une rangée ; les chevrons doublonnent la carte du slider et la recherche ; aucun index « n/N ».
- Pourquoi : trois affordances pour la même action, et aucune idée de la position dans la liste ; les chevrons désactivés en butée donnent une impasse.
- Fix : un seul contrôle de navigation portant la position (« ‹ 3 / 12 › ») dans la grammaire `PILL`/`Segment`, ou retirer les chevrons au profit du strip + index.

**[P1] Le strip de 190 px n'est pas un instrument de choix.**
- Quoi : ~7 cartes visibles, pas de tri, pas de saut.
- Pourquoi : la question du planificateur n'est pas « défile-moi les postes » mais « lequel est en surcharge ». Le strip est excellent pour comparer des silhouettes, mauvais pour choisir ; ici il doit faire les deux.
- Fix : garder les mini-cartes comme comparateur ; ajouter un index compact (poste, Σ charge, saturation max) ou un combobox de poste, et un saut « poste le plus saturé ».

**[P2] L'animation d'entrée ralentit la lecture.**
- Quoi : `useReplayEnter` (260 ms, +6 px) rejoué sur le graphe à chaque pas de carrousel, parce que la signature inclut les données du poste.
- Pourquoi : un fondu uniforme n'aide pas à voir ce qui a changé, et un utilisateur qui maintient → voit un graphe perpétuellement à mi-fondu.
- Fix : ne pas animer sur changement de poste ; si l'animation reste, animer ce qui change (croissance des barres) et descendre à ≤150 ms.

**[P3] Grammaire de contrôles non alignée.**
- Quoi : Mois/Semaine en `rounded-full`/`font-sans text-[11px]` vs `Segment` en `rounded-lg`/`font-mono text-2xs` ; boutons-icônes ronds 26 et 30 px vs `.btn-icon` carré 30/36 ; trois valeurs d'opacité de désactivation.
- Pourquoi : trois écarts pour la même famille d'objet sur le même écran — c'est ce qui fait lire la couche ajoutée comme boulonnée.
- Fix : Mois/Semaine → `Segment`/`SegmentButton` partagés ; une seule taille d'icône ; le token `disabled` du système.

Corrigé dans cette passe (hors critique, bug prouvé) : l'axe des ordonnées servait des flottants bruts (`String(37.995…)`) rognés par le viewBox — il affichait « 999997 ». `fmtLoadValue` arrondit désormais dans les deux unités, et la gouttière gauche passe à 58 px.

## Signaux d'alarme par persona

**Alex (power user impatient)**
- Maintient → : chaque pas rejoue le fondu de 260 ms → graphe en clignotement permanent, illisible pour comparer.
- En plein écran, `F` ne fait plus « filtres » mais « barre + filtres ouverts ».
- `P` contredit la convention plein écran ; aucun index pour savoir s'il reste 2 ou 12 postes.

**Sam (clavier, lecteur d'écran, zoom 200 %)**
- ←/→ globaux : agir depuis un segment (OF/Commande, Heures/Pièces, Mois/Semaine) change de poste au lieu de la radio — les `role="radio"` n'ont de toute façon aucune navigation au clavier (dette du composant `Segment`, antérieure).
- Aucune annonce du changement de poste (pas d'`aria-live`/`role="status"`).
- Icônes sans libellé visible : nommées seulement par `title`.
- `requestFullscreen` refusé : silence total (promesse avalée).
- Libellés à 9-10 px (mini-cartes, badges) sous le seuil de lisibilité à 200 %.

**Jordan (premier venu)**
- Avant le graphe : ‹ › + pastille + code + nom + badge atelier + badge saturation + Mois|Semaine + ⛶. Impossible de deviner que ‹ › changent de poste, ni ce que fait ⛶.
- Il clique ⛶ pour agrandir : il reçoit une toolbar et des filtres ouverts au-dessus du graphe qu'il voulait voir.
- Rien à l'écran n'enseigne F, P, ←, →.

## Observations mineures

- `ToolbarRow` ré-encarté : `px-7` dans un panneau `p-6` → décalage de gouttière et double bordure sous l'entête.
- Ordre de lecture contrôle-avant-identité : les chevrons précèdent le nom du poste.
- Le titre du panneau est un `<div>` sans niveau de heading : outline SR faible.
- Trois opacités de désactivation (0,35 / 0,40 / 0,45).
- « pic {mois} » — l'information de tri la plus utile — est à 9 px.
- En entrant en plein écran, la toolbar est démontée puis remontée : le focus clavier est perdu.
- `showCapacity`/`showAvg` persistés en session sans indicateur hors du menu de filtres.
- L'ordre du carrousel est l'ordre source : « poste suivant » n'est pas une notion métier.

## Questions à considérer

1. Si le panneau obtenait la hauteur pleine page en flux normal, la fonctionnalité plein écran (et `F`, et la barre ré-encartée, et les overlays dans le top layer) aurait-elle encore une raison d'être ?
2. Le choix du poste est-il un problème de navigation (parcourir N) ou de triage (trouver le pire) ? Si c'est le triage, pourquoi les seuls instruments sont-ils un strip et deux flèches d'un pas ?
3. Qui possède « ce que le graphe raconte » — unité, maille, vue, cran : la toolbar ou l'entête du panneau ? Aujourd'hui la décision est coupée en deux, et dupliquée en plein écran.
4. Si une touche menait au poste le plus saturé du mois, quelqu'un utiliserait-il encore les chevrons ?
