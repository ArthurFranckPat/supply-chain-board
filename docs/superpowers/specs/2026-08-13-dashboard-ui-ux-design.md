# Dashboard UI/UX Hardening Design

## Contexte approuvé

L’audit navigateur de la page d’accueil authentifiée a révélé une grille de bureau
qui se dégrade sous 1024 px, des tableaux coupés, des contrôles trop petits sur
mobile, des états de chargement peu explicites, une structure sémantique fragile
et un mode de personnalisation qui recouvre les cartes. Le périmètre est limité
à la surface du tableau de bord et à ses composants de grille nécessaires.

## Objectif

Permettre à un ordonnanceur de lire les KPI et d’identifier l’action suivante
sur desktop, tablette et mobile, sans perte de données, sans ambiguïté d’état et
sans recouvrement des contrôles.

## Décisions de conception

### Adaptation responsive

- Conserver la grille 24 colonnes sur desktop large.
- Passer à une colonne unique sous 768 px : Charge, Profondeur, OTIF, Stock,
  Lignes en retard, puis Articles.
- Entre 768 et 1023 px, utiliser deux colonnes équilibrées et donner aux
  tableaux une largeur exploitable ou une présentation explicitement scrollable.
- Ajouter `min-width: 0` aux items et conteneurs flex/grid concernés.
- Sur mobile, transformer les contrôles de cartes en rangées qui peuvent se
  replier et réserver des cibles tactiles d’au moins 44 px.
- Préserver le drawer de navigation mobile existant.

### États de données

- Conserver les données précédentes pendant un re-fetch lorsqu’elles existent.
- Ajouter un état de chargement annoncé (`aria-busy` et texte visuellement
  discret) qui nomme l’opération réelle : « Chargement de l’OTIF… » ou
  « Chargement du stock… ».
- Distinguer explicitement chargement, erreur récupérable et absence de données.
- Ajouter une récupération locale « Réessayer » lorsque le fetch échoue, sans
  modifier la mécanique des endpoints.

### Sémantique et libellés

- Garder un seul landmark `main` et donner à la surface un `h1` unique.
- Exposer l’état du bouton Détails avec `aria-expanded` et un nom d’action
  cohérent.
- Remplacer l’OTIF trompeur `100 %` lorsque le contexte est vide par un état
  explicite : « Aucune ligne à traiter » et un indicateur `—` si aucun
  dénominateur n’est disponible.
- Conserver le vocabulaire métier existant et le format de date français.

### Mode personnalisation

- La barre d’outils d’une carte reste dans sa propre zone et ne masque jamais
  le titre ni le contenu.
- Les commandes de largeur et de déplacement restent accessibles au clavier,
  avec des noms d’action complets.
- Les changements de layout restent persistés par le store existant.

## Approches écartées

1. **Conserver la grille fixe et ajouter seulement un scroll horizontal** :
   rapide, mais laisse les KPI illisibles et oblige l’utilisateur à naviguer dans
   plusieurs axes.
2. **Créer une page mobile distincte** : améliore la capture mobile, mais
   duplique l’information architecture et les états métier.
3. **Réponse choisie — adaptation structurelle du composant partagé** : une
   même hiérarchie de KPI, avec reflow, présentation de table adaptée et états
   partagés selon la largeur disponible.

## Vérification

- Tests ciblés du composant de grille et des helpers de layout.
- Validation navigateur sur 390, 768, 1024 et 1440 px.
- Vérification clavier des états `Détails`, calendrier et personnalisation.
- Vérification des états chargement, erreur, vide et données réelles.
- Gate projet : `npm run typecheck`, `npm run lint`, puis détection Impeccable.
