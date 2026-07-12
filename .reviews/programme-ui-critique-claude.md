# Diagnostic UI — page `/programme` (Vue unifiée OF ↔ commandes)

_Revue de code UI (sans rendu navigateur), basée sur `inertia/pages/scheduler/programme.tsx`,
`components/vision/*` (toolbar, marqueur commande, overlay liens) et
`components/board/*` (board-grid, board-card)._

## Verdict global

La page est **conceptuellement forte** — trois modes fusionnés sans round-trip serveur,
couche d'impact live pendant le drag, mode scénario avec mutations rejouées — mais elle
paie cette richesse par une **surcharge cognitive** : trop de familles de signaux visuels
concurrents sur une même carte, une toolbar qui empile 8+ groupes de contrôles sans
hiérarchie, et une typographie systématiquement sous les 10 px qui fragilise la lisibilité
et l'accessibilité. Le risque principal n'est pas esthétique : c'est qu'un planificateur
**rate un signal critique (retard, rupture)** noyé dans le bruit, ou **croie à tort qu'un
scénario a été appliqué** (bug réel, voir §5).

---

## 1. Sémantique des couleurs : trois systèmes qui se marchent dessus (majeur)

Le même vocabulaire chromatique encode trois choses différentes selon l'endroit :

- **Terra** = couleur de marque / sélection / hover, MAIS AUSSI verdict « ok » (liens,
  marqueurs), MAIS AUSSI statut « en cours » (liseré carte). Un liseré terra ne dit pas
  la même chose sur un marqueur commande (à l'heure) que sur une carte OF (en cours).
- **Rouge** = verdict « retard » ET statut « bloqué » (rupture compo). Deux problèmes de
  nature différente (temporel vs matière) portés par la même couleur, parfois sur la
  même carte.
- **Ambre** = « limite » (liens) ET « sans couverture » (commandes virtuelles).

Conséquence directe sur `CommandeMarker` : **verdict `null` (donnée absente) et verdict
`ok` rendent exactement le même liseré terra** (`borderClass` retombe sur `border-l-terra`
dans les deux cas). « Je ne sais pas » et « tout va bien » sont indistinguables — c'est le
pire défaut possible pour un outil de pilotage.

**Reco** : réserver terra à la marque/interaction ; verdict ok = vert (déjà `ferme`/MTS),
état inconnu = neutre/gris explicite ; documenter la palette verdict vs statut dans un
seul module partagé (elle est aujourd'hui dupliquée dans 3 fichiers : `VERDICT_TONE` de
board-grid, `BORDER_BY_VERDICT` de commande-marker, `STROKE` de links-overlay).

## 2. La carte OF : jusqu'à 6 zones de badges simultanées (majeur)

Une carte peut cumuler : liseré haut (statut), badge faisabilité coin haut-droit, badge
retard « +N j » coin haut-gauche, tampon BDH incliné, case de sélection haut-gauche,
point pulsant « cours », barre de progression, ligne d'alerte rupture, pastille typologie,
heures. Le code lui-même admet la collision (« Disjoint du badge faisabilité… et de la
sélection (haut-gauche, uniquement en selectMode) ») : **badge retard et checkbox de
sélection occupent le même coin** et ne coexistent que par chance de mode.

**Reco** : définir une grille de priorité d'affichage (1 signal critique max en coin +
le reste replié dans le drawer détail), et auditer chaque combinaison statut × verdict ×
faisabilité × sélection.

## 3. Toolbar : accumulation sans hiérarchie (majeur)

`flex-wrap` + `justify-between` sur une rangée qui contient, selon le mode : sélecteur de
mode, Statut, Atelier, Besoin, compteur retards (apparaît seulement si > 0 → **layout
shift**), Scénario, calendrier, segment Stock, Actualiser, Faisabilité, Sélection.

- Au wrap (laptop 13–14″), les groupes se répartissent de façon imprévisible ; la
  distinction « filtres à gauche / actions à droite » disparaît.
- Les libellés sont cryptiques et incohérents : « OF / Combiné / Cmdes » (deux
  abréviations + un adjectif), « Cmde / Prév », « Instantanée / Projetée » (sans le mot
  « allocation », le sens n'est porté que par un `title` au survol).
- Les chips de filtre n'exposent **aucun état accessible** (`aria-pressed` absent) : un
  lecteur d'écran ne sait pas si « Ferme » est actif.
- Le sélecteur de mode n'est pas un `radiogroup` ; les toggles n'ont pas de sémantique.

**Reco** : deux rangées stables (mode + fenêtre en haut ; filtres contextuels en bas),
libellés complets, `aria-pressed`/`role="radiogroup"`, réserver l'emplacement du compteur
retards (rendu à 0 grisé plutôt qu'absent).

## 4. Typographie : tout est sous 11 px (majeur, accessibilité)

Inventaire des tailles rencontrées : 8, 8.5, 9, 9.5, 10, 11 px — souvent en mono bold
uppercase `tracking-wider`, souvent en `muted-foreground` (contraste probablement sous
les 4.5:1 de WCAG AA à ces tailles). Le n° de commande d'un marqueur est à **9.5 px**,
le badge « +N j » à **8.5 px**. Pour un outil d'atelier consulté debout ou vidéo-projeté
en réunion de production, c'est le premier reproche que feront les utilisateurs.

**Reco** : plancher à 11 px pour toute info porteuse de décision (n°, dates, deltas),
garder les micro-tailles pour les étiquettes décoratives uniquement.

## 5. « Appliquer le scénario » peut mentir (bug, critique)

Dans `applyScenario` (programme.tsx:545-579), les `fetch` PATCH ne vérifient **pas
`r.ok`** — `fetch` ne rejette que sur erreur réseau. Un 422/500 passe silencieusement,
puis `markApplied()` + toast « Scénario appliqué. » s'exécutent quand même. À comparer à
`onCommandeDrop` qui, lui, vérifie `r.ok` et rollback. De plus l'application est
séquentielle sans reprise : un échec au milieu laisse un état partiellement appliqué,
sans indication de quelles mutations sont passées.

**Reco** : vérifier `r.ok` par mutation, agréger les échecs, toast différencié
(« 3/5 appliquées — 2 échecs »), ne pas `markApplied` si échec.

## 6. Interactions découvrables uniquement au survol (important)

- Liens `ok`/`limite` : opacité 0 hors survol. Assumé pour `ok`, mais **`limite` n'est
  visible que si l'utilisateur active le highlight retards** — un « limite » à J n'a
  aucune présence à l'ouverture alors que c'est précisément le cas à surveiller.
  (Au passage : le bouton dit « liens en retard » mais le highlight révèle aussi les
  `limite` — incohérence libellé/comportement.)
- Marqueur commande : draggable seulement si `cmd.ligne` existe, la seule différence
  visible est le curseur. Aucun affordance « ceci se déplace ».
- Croix de suppression d'un chip virtuel : `hidden group-hover:flex` — invisible et
  inaccessible au clavier/tactile.
- Tout le drag & drop est HTML5 natif : **inutilisable au tactile** (tablette d'atelier).
- Tooltip de drag fixé en bas-centre de l'écran : l'œil est sur la carte fantôme, le
  verdict prévisionnel — l'info la plus précieuse du drag — est à l'opposé.

**Reco** : verdict prévisionnel près du curseur (ou dans la cellule survolée), croix
toujours visible sur les chips, état « limite » visible d'emblée en version atténuée.

## 7. Clavier : cartes focusables mais inertes (important)

`CardView` pose `role="button"` + `tabindex={0}` mais **aucun `onKeyDown`** : Enter/Espace
n'ouvrent pas le détail. C'est pire qu'un simple `div` — l'utilisateur clavier tab-stop
sur un élément qui promet d'être un bouton et ne réagit pas. Les marqueurs commande,
eux, ne sont même pas focusables. Le calendrier ne se ferme pas à Échap (backdrop-click
uniquement). L'overlay SVG est correctement `aria-hidden`, mais aucune alternative
textuelle n'expose les liens OF↔commande (le compteur toolbar est la seule trace
non-visuelle des retards — c'est déjà ça).

## 8. Overrides optimistes non réconciliés à l'actualisation (moyen)

`doRefresh` recharge `board`/`orderBoard`/`links` mais **ne vide ni `cmdMoved` ni
`ofDateFinOverride`** : ces maps gardent la priorité sur le payload frais (`cmdCol` lit
`cmdMoved` d'abord). Si un collègue a déplacé la même commande entre-temps, l'écran
affiche la position locale périmée après un refresh censé « recharger le live ».

**Reco** : purger les overrides dans `onSuccess` du refresh (le serveur fait foi).

## 9. Détails qui comptent (mineurs)

- **Marqueur sur colonne « aujourd'hui »** : marqueur `bg-terra-soft` posé sur cellule
  `bg-terra-soft` → il se fond dans la colonne du jour, là où on regarde le plus.
- **État vide du mode planification** testé sur `props.lineCount` (compte de postes du
  board OF) — un horizon avec commandes mais sans postes OF afficherait à tort
  « Aucune ligne de commande ».
- **Badge « +N j » de l'overlay** : `rect` de largeur fixe 32 px — « +12 j » frôle le
  débordement, un delta à 3 chiffres déborde.
- **Colonne poste (208 px)** : l'en-tête empile identité + histogramme + barre PP830 +
  légende + stock bouches → c'est lui qui impose la hauteur de rangée, même pour un
  poste quasi vide ; beaucoup d'air perdu en vertical.
- **En-tête jours** : `day.short.replace(/\s*\d+\s*$/,'')` + `dayNum()` recalculé depuis
  l'ISO — le formatage du jour se fait en deux endroits avec deux logiques.
- **Double payload systématique** : les deux boards + commandes + liens sont toujours
  envoyés, même pour l'utilisateur qui ne quitte jamais le mode OF — coût de premier
  rendu à surveiller sur de grandes fenêtres.

---

## Croisement avec l'analyse initiale (`programme-ui-critique.md`, master)

**Convergences** (trouvées indépendamment par les deux revues) : toolbar surchargée + CLS
au wrap, absence d'échelle typographique, `aria-pressed` absent des toggles, labels de
mode cryptiques, calendrier sans Échap/focus, compteur retards disparaissant à 0, états
vides pauvres.

**Ce que l'analyse initiale apporte en plus** : monolithe 985 lignes à découper ;
**3 thèmes CSS coexistants** — sous `.theme-navy`, `--color-terra` vaut `#081061` (navy),
tout le vocabulaire `terra` de cette page est donc doublement trompeur (le §1 ci-dessus
parle de « terra » alors que la page rend du navy — la collision sémantique reste valable,
le nom du token aggrave le cas) ; tokens legacy dupliqués ; `--font-mono` redéfini en
Inter ; mix `<Button>` shadcn / `<button>` raw ; touch targets < 44 px ; pas de skeleton
au montage (TTL cache 5 min → 5-10 s au premier chargement) ; `BatchFirmBar` visible sous
l'empty state ; « Jeter » sans confirmation ; toasts `CustomEvent` fragiles ; perf de
`measure()` (2×N `querySelector`) ; pas de debounce recherche ; raccourcis clavier absents.

**Ce que cette revue apporte en plus** : `applyScenario` sans check `r.ok` (§5),
verdict `null` = verdict `ok` (§1), overrides non purgés au refresh (§8), cartes
`role="button"` sans `onKeyDown` (§7), palette verdict dupliquée ×3 + collisions
sémantiques (§1), 6 zones de badges par carte (§2), liens « limite » invisibles et
affordances hover-only (§6), marqueur fondu dans la colonne « aujourd'hui », empty-state
planification sur le mauvais compteur, badge SVG 32 px fixe (§9).

**Nuance** : l'analyse initiale mesure ~4.8:1 de contraste sur les micro-labels — AA
passe de justesse ; le problème dominant est la taille, plus que le contraste.

Le plan fusionné (7 lots + hors périmètre) vit dans l'issue
[#62](https://github.com/ArthurFranckPat/supply-chain-board/issues/62).

## Priorités proposées

| #   | Sujet                                                  | Sévérité  | Effort |
| --- | ------------------------------------------------------ | --------- | ------ |
| 1   | `applyScenario` sans check `r.ok` (faux « appliqué »)  | Critique  | XS     |
| 2   | Verdict `null` = verdict `ok` sur les marqueurs        | Majeur    | XS     |
| 3   | Purge des overrides au refresh                         | Majeur    | XS     |
| 4   | Clavier : `onKeyDown` sur cartes, Échap calendrier     | Majeur    | S      |
| 5   | Palette verdict/statut unifiée (1 module, terra ≠ ok)  | Majeur    | M      |
| 6   | Toolbar : 2 rangées, `aria-pressed`, libellés complets | Majeur    | M      |
| 7   | Plancher typo 11 px sur les infos décisionnelles       | Majeur    | M      |
| 8   | Priorité des badges carte (1 signal critique max)      | Important | M      |
| 9   | Affordances hover-only (croix, limite, drag)           | Important | M      |
