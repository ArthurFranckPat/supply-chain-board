# Tableaux de données denses — bonnes pratiques UI/UX

> **Contexte** : outil interne d'ordonnancement (AdonisJS 7 + React 19), table virtualisée
> (`@tanstack/react-virtual`, uniquement les lignes visibles dans le DOM), ~675 lignes,
> 10-11 colonnes, données temps réel, mode opérateur (scanabilité, clavier, réactivité).
> **Périmètre** : tri, gestion des colonnes, colonnes figées, clavier, densité, états.
> **Méthode** : sources primaires (docs officielles, W3C, NNG) vérifiées ; chaque
> recommandation cite sa source (nom + URL). Convention : **fait sourcé** = énoncé
> trouvé tel quel dans la source ; **[opinion]** = recommandation d'application
> argumentée mais non prescrite par la source. Les URL citées ont été consultées le
> 2026-07 (les pages M3 data tables étant une SPA non extractible, la spéc Material
> citée est la version maintenue m2/m1, même lignée éditoriale).

---

## 1. Tri

### 1.1 Indicateur de tri (chevron / flèche)

**Fait sourcé — Material Design** (spec « Data tables », m1/m2, https://m1.material.io/components/data-tables.html) :
- « If column sorting is enabled, sort the **most important data by default** and display a **sorted state in the column header**. If the user clicks on a column that is already sorted, reverse the sort order and **rotate the sort icon**. »
- « If sorting is enabled, display a **light sort icon upon hover**, which indicates that the column is sortable. » → le chevron n'apparaît au survol que sur les colonnes *triables non triées* ; la colonne *triée* garde un indicateur **persistant**.

**Fait sourcé — convention directionnelle** : Material montre une flèche **haut = ascendant** ; Flutter fait l'inverse (bas = ascendant) — la confusion est documentée (https://stackoverflow.com/questions/51293492/confusion-over-datatables-sort-direction-arrows). La direction n'est pas normalisée : **l'exigence est la cohérence** (même convention partout dans l'app) et la présence d'un indicateur d'état clair. Article de référence sur l'ambiguïté triangle vs flèche : « Sorting Arrow Confusion in Data Tables » (https://hackernoon.com/sorting-arrow-confusion-in-data-tables-5a3117698fdf).

**Fait sourcé — Carbon/IBM (v10)** : icône de tri dans le header, `.bx--table-sort__icon` ; la colonne triée porte l'icône persistante ; les colonnes triables affichent l'icône au survol (https://v10.carbondesignsystem.com/components/data-table/style/).

**Fait sourcé — Ant Design** : `sortOrder` (« ascend » / « descend ») sur la colonne triée ; indicateur de tri dans le header ; caret ▲/▼ au survol pour les colonnes sortables (https://ant.design/components/table).

**Recommandation d'application** :
- Colonne triée : chevron ▲/▼ **persistant** (état actif, couleur primaire, gras sur le libellé).
- Colonne triable non triée : chevron ▲/▼ **au survol** (état neutre/fantôme), pas permanent — évite le bruit visuel sur 10-11 colonnes.
- Clic sur colonne déjà triée : cycle asc → desc → off (pattern Material, repris par notre `toggleSorting` actuel). [opinion] Garder le cycle 3 états (pas 2) : il permet de revenir au tri métier par défaut — cohérent avec notre `sequenceur.tsx` qui retombe sur le tri métier quand `sorting` est vide.

### 1.2 aria-sort (état restitué aux technologies d'assistance)

**Fait sourcé — WAI-ARIA 1.2** (https://www.w3.org/TR/wai-aria-1.2/#aria-sort) : `aria-sort` s'applique sur le `columnheader` (ou `rowheader`) de la colonne triée. Valeurs : `ascending`, `descending`, `other` (tri par un algorithme autre qu'ascendant/descendant — **exactement notre cas du tri par gravité**), `none` (défaut).

**Fait sourcé — APG Grid and Table Properties** (https://www.w3.org/WAI/ARIA/apg/practices/grid-and-table-properties/) :
- « The `aria-sort` attribute should only be added to a **single** table or grid header at a time. » → un seul header avec `ascending`/`descending` à la fois.
- « It is important to note that **ARIA does not provide a way to indicate levels of sort** for data sets that have multiple sort keys. Thus, there is **limited value** to applying `aria-sort` with a value other than `none` to more than one column. » → en tri multi-colonnes, seule la colonne primaire porte `ascending`/`descending` ; les secondaires restent à `none` (l'ordre de tri secondaire doit être visible visuellement, ex. numéro de rang — [opinion]).

**Fait sourcé — APG Sortable Table Example** (https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/) :
- `aria-sort` **sur le `<th>`**, pas sur le bouton enfant.
- Le libellé des colonnes triables est enveloppé dans un **`<button>`** (activation clavier Entrée/Espace gratuite).
- L'icône de tri est dans un `<span aria-hidden="true">` pour ne pas polluer le nom accessible du bouton.

**Fait sourcé — Adrian Roselli** (https://adrianroselli.com/2021/04/sortable-table-columns.html) : la flèche visuelle ne suffit pas aux lecteurs d'écran ; `aria-sort` porte l'état. Les SVG de tri doivent être `aria-hidden`. (Il note aussi qu'`aria-sort` sur la seule colonne triée ne signale pas aux lecteurs d'écran que *les autres* colonnes sont triables — c'est le `<button>` qui le fait.)

**Fait sourcé — Accessible Data Interfaces** (https://www.accessible-data-interfaces.com/accessible-data-tables-grid-systems/sortable-filterable-data-grids/aria-sort-attributes-for-accessible-column-filtering/) : préférer `aria-sort="none"` **explicite** sur les colonnes triables non triées plutôt que l'attribut absent (signale la triabilité aux AT) ; l'`aria-sort` ne doit pas être utilisé pour signaler un filtre ; synchroniser la mise à jour d'`aria-sort` avec l'ordre réel du DOM (un update synchrone avant le réordonnancement des lignes fait annoncer un état faux).

**Fait sourcé — USWDS** : « Add an `aria-live` region to the page when enabling row sorting » — l'annonce du changement de tri aux lecteurs d'écran passe par une `aria-live` (polite) dédiée (https://designsystem.digital.gov/components/table/).

**Recommandation d'application** :
- `aria-sort` sur le `<th>` de la colonne triée : `ascending`/`descending` ; `other` pour le tri par gravité ; `none` (ou absent) sur les autres colonnes triables.
- Notre `DataTable` actuel met `role="button"` + `tabIndex` sur le `<th>` — fonctionnel, mais le pattern APG de référence est **un `<button>` dans le `<th>`** (sémantique plus propre, gestion du focus native). [opinion] Migrer vers le button-dans-th lors de la prochaine passe accessibilité.
- Icônes de tri avec `aria-hidden="true"` (le libellé de colonne + aria-sort suffisent).

### 1.3 Tri multi-colonnes

**Fait sourcé — APG** (voir 1.2) : l'ARIA ne peut exprimer qu'une colonne triée ; le multi-tri est donc une fonctionnalité visuelle + état interne.

**Fait sourcé — AG Grid** : tri multi-colonnes activable, ajout d'une colonne par modificateur (**Shift+clic** sur le header) ; l'ordre des clés de tri est visible via les rangs (https://www.ag-grid.com/javascript-data-grid/multi-sort/).

**Fait sourcé — TanStack Table** : l'état `sorting` est un **tableau** de `{ id, desc }` (tri multi-colonnes natif) ; `enableMultiSort` contrôle le modificateur (https://tanstack.com/table/latest/docs/framework/react/sorting).

**Fait sourcé — MDN** : `Array.prototype.sort` est **stable** depuis ES2019 — « Since version 10 (or ECMAScript 2019), the specification dictates that `Array.prototype.sort` is stable » (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort).

**Recommandation d'application** :
- Notre `SortingState[]` supporte déjà structurellement le multi-tri, mais `toggleSorting` **remplace** le tableau : ajouter le modificateur (Shift+clic / Shift+Entrée) pour *ajouter* une clé, et afficher le rang de tri (1, 2…) sur les colonnes secondaires. [opinion] Utile pour une table de 675 lignes (tri « poste » puis « jours de retard ») — coût faible puisque l'infrastructure est déjà là.
- **Tri stable** : sur égalité de clé, l'ordre initial est conservé — critique en temps réel (pas de « saut » de lignes à chaque refresh quand le tri ne change pas). Le tri par défaut (jours de retard) doit servir de clé *de départ* sur laquelle les tris utilisateur restent stables. [opinion]

### 1.4 Tri par défaut et tri personnalisé

**Fait sourcé — Material** : « sort the **most important data by default** » (spec Data tables, https://m1.material.io/components/data-tables.html).

**Fait sourcé — NNG** : « The default order of the columns should reflect the importance of the data to the user » (https://www.nngroup.com/articles/data-tables/) — le même principe s'applique à l'ordre de tri par défaut.

**Recommandation d'application** :
- **Tri par défaut = tri métier** : chez nous, `sequenceur.tsx` applique déjà « faisabilité → poste → urgence → livraison » quand `sorting` est vide ; l'écran suivi trie par jours de retard. Garder ce comportement (le tri utilisateur *remplace* le défaut, ne s'y empile pas), et l'afficher comme tri actif dans le header (chevron + `aria-sort`) — sinon l'utilisateur ne sait pas que la table est triée. [opinion, fondé sur Material « display a sorted state »]
- **Fait sourcé — USWDS** : « Set a default sort column and direction. To sort a table's rows by a specific sortable column on load, add the attribute `aria-sort` equal to a sort direction … to that column header » (https://designsystem.digital.gov/components/table/) → le tri par défaut se pose **via `aria-sort` dès le chargement**, pas seulement visuellement.
- **Fait sourcé — Handsontable** : `columnSorting.initialConfig` permet de trier une colonne dès l'initialisation ; `sortEmptyCells: false` (défaut) **place les cellules vides en fin de liste** (https://handsontable.com/docs/javascript-data-grid/api/options/) — validation lib pour notre règle « null/undefined en fin ».
- **Tri personnalisé (gravité, jours de retard)** : fonctions de comparaison dédiées (comme `feasRank()` dans `sequenceur.tsx`) ; `aria-sort="other"` quand l'algorithme n'est ni asc ni desc pur. **Piège** : comparer des nombres en tant que chaînes (« 9 » > « 10 ») — toujours normaliser avant comparaison (nombre, date ISO, tri des `null`/`undefined` en fin de liste). [opinion]
- **Fait sourcé — USWDS** : pour les cellules formatées (pourcentages, dates, jours…), fournir une valeur brute triable (`data-sort-value`) — exactement notre cas « jours de retard » affiché en « j+3 » (https://designsystem.digital.gov/components/table/).

---

## 2. Colonnes

### 2.1 Afficher / masquer

**Fait sourcé — NNG** : « Hiding and reordering columns must be **easy to accomplish** (low interaction cost and **accessible for those that don't use drag and drop** interactions). These features should be **discoverable** and **clear visual state indicators** should signal to users that some columns are hidden » (https://www.nngroup.com/articles/data-tables/).

**Fait sourcé — TanStack Table** : visibilité par colonne (`getIsVisible`/`getCanHide`) ; une colonne peut être déclarée non masquable avec `enableHiding: false` (https://tanstack.com/table/latest/docs/framework/react/column-visibility).

**Fait sourcé — AG Grid** : visibilité pilotée par `columnApi.setColumnsVisible` ; une colonne peut être verrouillée (`lockVisible`) pour ne jamais être masquée (https://www.ag-grid.com/javascript-data-grid/show-hide-columns/).

**Recommandation d'application** :
- Colonnes **non masquables** : la colonne N° (index) et la colonne d'identité (Commande) — même si elles sont figées, les rendre non masquables évite un état « identité perdue ». [opinion, patterns AG Grid `lockVisible` / TanStack `enableHiding`]
- Indicateur d'état : le menu doit montrer clairement les colonnes masquées (checkbox décochée) — exigence NNG.
- **En temps réel** : masquer une colonne ne doit pas casser les mises à jour (les données arrivent toujours, seul le rendu change) ; avec la virtualisation, la largeur recalculée des lignes visibles doit être prise en compte. [opinion]

### 2.2 Menu de colonnes

**Fait sourcé — AG Grid** : le column menu / column panel est le pattern établi : un panneau listant les colonnes avec case à cocher, et possibilité de réordonner depuis la liste (https://www.ag-grid.com/javascript-data-grid/column-menu/).

**Fait sourcé — NNG** : « Reordering columns here can be done in two ways: (1) dragging and dropping the column headers themselves (… efficient accelerator once learned) or (2) dragging and dropping from the **list of columns in this visible menu** » (https://www.nngroup.com/articles/data-tables/). → le **menu listé est plus accessible** que le drag sur les headers (découvrabilité + clavier), tout en restant rapide.

**Recommandation d'application** :
- Menu « Colonnes » dans la **toolbar** (icône + libellé, pas seulement une icône — [opinion] pour la découvrabilité), dropdown listant les colonnes avec checkboxes, triées dans l'ordre d'affichage actuel.
- Accessibilité du menu : rôle `menu`/checkbox, navigation clavier complète (le menu doit être navigable ↑↓, fermable Échap). [opinion, standards APG menubutton/menu]
- 10-11 colonnes = pas besoin de groupes ; une simple liste suffit. [opinion]

### 2.3 Réordonner (drag & drop)

**Fait sourcé — NNG** : le drag sur les headers est « efficient accelerator once learned » mais à faible découvrabilité ; l'alternative depuis le menu colonnes est plus accessible (https://www.nngroup.com/articles/data-tables/).

**Fait sourcé — AG Grid** : drag & drop de colonnes par le header, avec indicateur de drop (https://www.ag-grid.com/javascript-data-grid/column-drag/).

**Fait sourcé — Handsontable** : `manualColumnMove` = réordonnancement par drag, désactivable (https://handsontable.com/docs/javascript-data-grid/column-moving/).

**Recommandation d'application** : [opinion] **Non prioritaire** pour notre cas : 10-11 colonnes fixes d'un outil métier, mode opérateur — le drag est un accélérateur que peu d'utilisateurs découvrent et il complexifie la virtualisation (largeurs + sticky). Si fait plus tard : le faire depuis le **menu colonnes** (pattern NNG, accessible au clavier), pas sur les headers.

### 2.4 Persistance des préférences

**Fait sourcé — NNG** : les préférences de colonnes (visibilité/ordre) sont des choix utilisateur que l'outil doit mémoriser pour ne pas les faire refaire (« low interaction cost » inclut la mémorisation — https://www.nngroup.com/articles/data-tables/ ; cf. aussi le pattern « user controls » de densité recommandé par les analyses de tables entreprise, https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables).

**Recommandation d'application** [opinion] (pas de source primaire prescrivant le mécanisme exact) :
- **localStorage par défaut** : visibilité, ordre, tri actif, densité — clef versionnée (ex. `scb.suivi.columns.v1`) pour migrer le schéma plus tard.
- **Limite du localStorage** : par poste, pas par utilisateur. Pour un outil interne multi-postes (poste ATC, poste opérateur…), si les préférences doivent suivre l'utilisateur : persistance serveur (API) plus tard. Décision produit : poste ≠ utilisateur ? [opinion] — le choix le moins coûteux aujourd'hui est localStorage + migration serveur possible grâce au versioning.
- Sauvegarde **debounce ~300-500 ms** après le dernier changement (pas à chaque toggle), et pas de sauvegarde pendant un refresh temps réel. [opinion]

### 2.5 Colonnes toujours visibles (identité)

**Fait sourcé — NNG** : « The (default) **first column should be a human-readable record identifier** instead of a “mystery meat” automatically generated ID » (https://www.nngroup.com/articles/data-tables/). → notre colonne **Commande · Client** est l'identité ; le N° de ligne est un repère de position, pas une identité.

**Recommandation d'application** : colonnes d'identité = **figées** (cf. §3) plutôt que « forcées visibles » : l'utilisateur garde le contexte en scroll horizontal. Combiner `enableHiding: false` sur N° et Commande *et* les figer. [opinion]

---

## 3. Colonnes figées (sticky / frozen)

### 3.1 Patterns de référence

**Fait sourcé — NNG** : « Freeze header rows and **header columns** (if the table is larger than the screen) » (https://www.nngroup.com/articles/data-tables/).

**Fait sourcé — AG Grid** : colonnes `pinned` à gauche/droite, avec gestion du z-index et de la largeur ; comportement documenté pour les colonnes figées en scroll horizontal (https://www.ag-grid.com/javascript-data-grid/column-pinning/).

**Fait sourcé — Handsontable** : `fixedColumnsStart` = nombre de colonnes figées au bord gauche (défaut `0` ; ex. `fixedColumnsStart: 1` gèle la première colonne) (https://handsontable.com/docs/javascript-data-grid/column-freezing/).

**Fait sourcé — TanStack Table** : `columnPinning` (left/right) ; l'implémentation recommandée est `position: sticky` sur les `<th>`/`<td>` concernés (https://tanstack.com/table/latest/docs/framework/react/column-pinning).

### 3.2 Le piège `border-collapse: collapse` — CRITIQUE pour nous

**Fait sourcé — CSSWG** : « Collapsed table borders **don't follow sticky rows/cells** when they stick » ; « in the collapsed-borders model, the borders “**belong to” the table**, not the cells or rows » (https://github.com/w3c/csswg-drafts/issues/3136).

**Fait sourcé — Chrome for Developers (TablesNG)** : avertissement explicite — « If you're using `position: sticky` on a table, **make sure it doesn't have borders**. Border painting is currently an open cross-browser compatibility issue, as borders belong to the table, not the header row itself » (https://developer.chrome.com/blog/tablesng).

**Fait sourcé — Mozilla** : avec `border-collapse: collapse`, les bordures des cellules sticky « restent attachées à la table » et les fonds des cellules positionnées les recouvrent (bug 1450584 : « Border of sticky or relative positioned table elements remains attached to main table when border-collapse:collapse is set » — https://bugzilla.mozilla.org/show_bug.cgi?id=1450584 ; bug 1866715 : bordures ignorées sur th sticky — https://bugzilla.mozilla.org/show_bug.cgi?id=1866715).

**Fait sourcé — Stack Overflow (solution pratique)** : passer à `border-collapse: separate` + `border-spacing: 0`, et appliquer les bordures **sur un seul côté** de chaque cellule (ex. `border-bottom` + `border-right` sur td, `border-left` sur la première colonne) pour retrouver l'aspect « collapse » (https://stackoverflow.com/questions/50361698/border-style-do-not-work-with-sticky-position-element).

**Application à notre code** : notre `DataTable` utilise `border-collapse` (classe `border-collapse` tailwind) — **à remplacer par `border-collapse: separate` + `border-spacing-0`** dès qu'on ajoute une colonne sticky, sinon les bordures de la colonne figée « fuiraient » derrière le scroll. [fait sourcé + constat code]

### 3.3 Ombre / diviseur sur le bord de la colonne figée

**Fait sourcé — NNG** : « The **subtle use of a drop shadow** suggests that the frozen first column and header row are floating “above” the rest of the table's data, **assisting with spatial orientation** » (https://www.nngroup.com/articles/data-tables/).

**Recommandation d'application** :
- Ombre verticale (gradient ~8-16px) sur le **bord droit de la zone figée**, affichée **seulement quand `scrollLeft > 0`** (le contenu défile réellement dessous). [opinion]
- Les cellules sticky doivent avoir un **fond opaque** (bg-card) et un **z-index supérieur** aux cellules normales (et inférieur au header sticky). [opinion, mécanique CSS]

### 3.4 Combien de colonnes figer

**Fait sourcé — AG Grid** : la doc recommande de figer **peu** de colonnes (chaque colonne figée réduit la surface scrollable — https://www.ag-grid.com/javascript-data-grid/column-pinning/ ; la limitation à 1-2 est le pattern des libs, cf. Handsontable `fixedColumnsStart` par défaut à 1).

**Recommandation d'application** : [opinion] **2 colonnes max** : N° + Commande (identité). Au-delà, la zone scrollable devient trop étroite pour 9-10 colonnes restantes. Ne jamais figer de colonne à droite (les actions en fin de ligne restent accessibles au scroll).

### 3.5 Interaction avec la virtualisation

**Fait sourcé — Chrome** : `position: sticky` fonctionne sur `<th>` et `<td>` (lignes et colonnes) depuis TablesNG (https://developer.chrome.com/blog/tablesng) — c'est le mécanisme compatible avec une table virtualisée **pourvu que** :
- le scroll soit sur le **conteneur unique** (`overflow-x` sur le div `scrollRef`, pas sur la table) — déjà le cas chez nous ;
- les cellules sticky aient un z-index géré (header > colonnes figées > cellules normales) ; [opinion mécanique]
- la largeur des colonnes figées reste **stable** entre les renders (sinon les offsets sticky des lignes recyclées se décalent). [opinion — coût réel de la virtualisation]

---

## 4. Clavier

### 4.1 Pattern APG « grid » (roving tabindex)

**Fait sourcé — APG Grid Pattern** (https://www.w3.org/WAI/ARIA/apg/patterns/grid/) :
- **Roving tabindex** : un seul élément focusable dans la grille (`tabindex="0"`), les autres en `tabindex="-1"` ; les flèches déplacent le focus, Tab en sort.
- **Touches (data grid)** : `→`/`←` (cellule), `↓`/`↑` (ligne), `PageDown`/`PageUp` (défilement d'un nombre de lignes déterminé par l'auteur, « typically scrolling so the bottom row in the currently visible set of rows becomes one of the first visible rows »), `Home`/`End` (début/fin de ligne), `Ctrl+Home`/`Ctrl+End` (début/fin de grille), caractère imprimable (recherche rapide dans la grille).
- Distinction **data grid vs layout grid** : dans une data grid, les touches **ne wrappent pas** (pas de retour ligne→ligne par `→` en fin de ligne).
- **APG — Managing Focus (roving tabindex)** (https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) : « One benefit of using roving `tabindex` rather than `aria-activedescendant` to manage focus is that the **user agent will scroll the newly focused element into view** » — essentiel avec la virtualisation.

**Fait sourcé — APG Data Grid Examples** (https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/data-grids/) : pour une grille dont **toutes les lignes ne sont pas dans l'arbre d'accessibilité** (virtualisation), poser `aria-rowindex` (1-based) sur les `<tr>` et `aria-colindex` sur les `<th>`/`<td>` — les lecteurs d'écran restituent la position réelle dans l'ensemble des 675 lignes. L'exemple 3 démontre aussi le masquage de colonnes avec `aria-colindex` (les numéros de colonnes masquées sont sautés).

**Fait sourcé — MDN (rôle grid)** (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/grid_role) : activation des éléments interactifs avec **Entrée / Espace** ; sélection : `Shift+Espace` = sélectionne la ligne (ou coche la checkbox de ligne), `Ctrl+Espace` = sélectionne la colonne, `Ctrl+A` = tout, `Shift+flèches` = étend la sélection.

### 4.2 Focus vs sélection

**Fait sourcé — APG** : le focus se déplace par les touches de navigation ; la **sélection est une action distincte** — l'APG grid ne prescrit pas « la sélection suit le focus » ; MDN : « To activate the interactive component, they will use the return and space keys » (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/grid_role).

**Recommandation d'application** [opinion, dérivée du pattern] : **le focus suit le clavier, la sélection suit l'action** — `↑`/`↓` déplacent un **focus de ligne** (surbrillance de focus légère), la sélection effective (ouverture du détail, action) ne se déclenche qu'à **Entrée** (ou clic). C'est le comportement le moins surprenant pour une table opérateur : naviguer ne modifie pas l'état, agir oui.

### 4.3 Navigation par lignes vs par cellules

**Fait sourcé — APG** : le pattern grid est défini en navigation **par cellules** ; rien n'interdit le focus ligne (un seul `gridcell` focusable par ligne = le focus « ligne »).

**Recommandation d'application** [opinion] : pour 675 lignes × 11 colonnes, **navigation par lignes** (focus sur la ligne entière, `tabIndex=0` sur le `<tr>` ou sur une cellule « hôte ») : moins de frappes, lecture de ligne complète, compatible avec le mode opérateur (scan vertical). Le scroll horizontal pour atteindre les colonnes lointaines reste souris/trackpad.

### 4.4 Clavier + virtualisation (temps réel)

**Fait sourcé — APG** : le roving tabindex fait scroller l'élément focalisé dans la vue par l'agent utilisateur (https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) — avec `@tanstack/react-virtual`, cela doit être complété par `scrollToIndex(index)` **avant/au moment du focus**, car les lignes hors viewport n'existent pas dans le DOM : il faut scroller puis poser le focus. [opinion d'implémentation]
- **Fait sourcé — USWDS** : un conteneur scrollable doit être focusable — « When you use the `.usa-table-container--scrollable` variant … you must add the `tabindex="0"` attribute to the scrollable element » (https://designsystem.digital.gov/components/table/) → notre div `scrollRef` devrait porter `tabindex="0"` pour que le scroll horizontal soit accessible au clavier.
- `aria-rowindex` (position réelle 1..675) et `aria-colcount`/`aria-rowcount` sur la grille (APG Data Grid Examples, https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/data-grids/).
- **Ne pas voler le focus pendant les mises à jour temps réel** : si le tri ou les données changent, conserver la ligne focalisée (par clé métier, `getRowKey`) ou retomber sur la première ligne — sans jamais `focus()` intempestif (WCAG 2.4.3 Focus Order, 3.2.1 On Focus — https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html). [opinion + références WCAG]

### 4.5 WCAG (exigences)

**Fait sourcé — WCAG 2.2** :
- **2.1.1 Keyboard** : toute fonctionnalité opérable au clavier, sans contrainte de timing (https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html).
- **2.1.2 No Keyboard Trap** : le focus ne doit jamais être piégé dans la table (https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html).
- **2.4.7 Focus Visible** : indicateur de focus visible en permanence (https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html).

### 4.6 Raccourcis métier

**Recommandation d'application** [opinion] : APG ne prescrit pas les raccourcis métier ; cohérence avec les conventions existantes :
- `↑`/`↓` : naviguer les lignes (avec `PageUp`/`PageDown` pour sauter des pages de lignes, `Home`/`End` début/fin — APG grid).
- `Entrée` : ouvrir/agir sur la ligne focalisée (APG/MDN activation).
- `Échap` : fermer le détail/annuler — convention globale, pas prescrite par APG.
- `/` : focus recherche/filtre (pattern documenté dans APG « type-ahead » et convention GitHub/Linear ; à documenter dans une aide clavier).
- **Documenter** les raccourcis (infobulle, aide clavier) et les garder cohérents entre les écrans (même `DataTable` partout). [opinion]

---

## 5. Densité, troncature, tooltips

### 5.1 Densité et hauteur de ligne

**Fait sourcé — Carbon (v10)** : 4 niveaux de densité — **Compact 24 px, Short 32 px, Default 48 px, Tall 64 px** ; « The column header row … should always match the row size of the table » ; « Tall row heights are only recommended if your data is expected to have **2 lines of content** in a single row » (https://v10.carbondesignsystem.com/components/data-table/style/).

**Fait sourcé — Material** : hauteur de ligne de données **48 dp**, padding minimum de **56 dp entre colonnes** (spec Data tables, https://m1.material.io/components/data-tables.html).

**Fait sourcé — analyse tables entreprise** (source secondaire) : densités usuelles **Condensed 40 px / Regular 48 px / Relaxed 56 px**, avec un **contrôle utilisateur de densité** dans la toolbar (https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables).

**Fait sourcé — WCAG 2.2 SC 2.5.8 (Target Size Minimum, AA)** : « The size of the target for pointer inputs is at least **24 by 24 CSS pixels**, except when: Spacing / Equivalent / Inline / User Agent Control / Essential » (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum). → la **cible de clic** (contrôles de ligne, checkbox) doit faire ≥ 24×24 px **ou** bénéficier de l'exception « spacing » (cercle de 24 px centré sur la cible qui n'intersecte pas les cibles voisines). Une ligne visuelle de 32 px peut donc être conforme si les contrôles sont espacés. (Le AA 2.5.8 est nouveau en 2.2.)

**Recommandation d'application** :
- **Hauteur de ligne ~32-40 px** (entre Short et Default Carbon) pour une table opérateur dense : 675 lignes, besoin de voir beaucoup de lignes à l'écran. Notre `estimateRowSize` est à 56 : si on passe la densité à ~36, le mettre à jour (sinon la barre de défilement saute — commentaire déjà présent dans le code).
- Cibles interactives (bouton ligne, actions) ≥ 24 px (WCAG 2.5.8) ; la hauteur visuelle de ligne peut rester fine. [fait sourcé WCAG + opinion]
- Header sticky à la **même hauteur** que les lignes (Carbon). [fait sourcé]
- **Densité réglable par l'utilisateur** (3 niveaux, persistée §2.4) : coût modéré, bénéfice réel pour le mode opérateur. [opinion, pattern pencilandpaper]

### 5.2 Troncature vs wrap

**Fait sourcé — GOV.UK** : « When comparing columns of numbers, **align the numbers to the right** in table cells » ; « If possible, you should aim to have **less data in your tables**. If you have a lot of data, try to organise it into multiple tables or multiple pages » (https://design-system.service.gov.uk/components/table/). → la densité passe aussi par la réduction du contenu, pas seulement par le CSS.

**Fait sourcé — USWDS** : « **Use a monospace font for numerical data** » (déjà notre pratique : `font-mono` sur Charge/Qté) ; « **Right-align numerical data**. Align numbers that represent a sum to the right » ; « Predictably format columns … normalize values so they can be easily compared » (https://designsystem.digital.gov/components/table/).

**Fait sourcé — Carbon (v10)** : la troncature est le pattern par défaut des cellules longues (https://v10.carbondesignsystem.com/components/data-table/style/).

**Fait sourcé — Ant Design** : `ellipsis: true` sur une colonne = troncature avec **tooltip au survol** (https://ant.design/components/table).

**Recommandation d'application** :
- **Tronquer à 1 ligne** (`truncate` + `max-w` par colonne) avec **tooltip** sur toutes les colonnes textuelles longues ; `whitespace-nowrap` pour les colonnes numériques. [opinion — aligné Carbon/Ant]
- Exceptions [opinion] : colonnes critiques (Commande · Client, Article · Désignation) où le wrap sur 2 lignes peut être acceptable si l'identité doit être lisible en entier ; sinon tronquer + tooltip.
- Alignement : **nombres à droite** (GOV.UK — déjà le cas : `tdClass: 'text-right'` sur Charge), textes à gauche, booléens/statuts centrés.
- Colonnes à largeur fixe (min/max) pour que la virtualisation et le sticky restent stables. [opinion]

### 5.3 Tooltips

**Fait sourcé — WCAG 2.2 SC 1.4.13 (Content on Hover or Focus, AA)** : tout contenu apparaissant au hover/focus doit être **Dismissible** (mécanisme sans bouger le pointeur/focus, ex. Échap), **Hoverable** (le pointeur peut aller dessus sans disparition), **Persistent** (reste visible tant que le déclencheur est survolé/focalisé ou jusqu'à fermeture) (https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).

**Fait sourcé — NNG** : les tooltips sont le bon véhicule pour le jargon métier en contexte (« Provide in-context definitions of jargon, either through a **tooltip** or a quick explanation in the table itself » — https://www.nngroup.com/articles/lawn-mower-pattern/).

**Recommandation d'application** : tooltips pour (a) le contenu tronqué, (b) les définitions de colonnes (verdict, gravité) ; ils doivent aussi apparaître **au focus clavier** (1.4.13) et être fermables à Échap. En temps réel, un tooltip ouvert ne doit pas être « rafraîchi » sous le curseur à chaque update. [opinion]

---

## 6. États

### 6.1 Chargement

**Fait sourcé — NNG (empty states)** : ne pas confondre chargement et vide — « Do not default to totally empty states. This approach creates confusion for users, who may be left wondering if the system is still loading information or if errors have occurred » (https://www.nngroup.com/articles/empty-state-interface-design/).

**Recommandation d'application** [opinion] :
- **Premier chargement** : skeleton de lignes (rangées fantômes) qui **maintient la hauteur** du conteneur (pas de layout shift — CLS, https://web.dev/articles/cls).
- **Refresh temps réel** : **ne pas re-skeletiser** à chaque poll — garder les données affichées et indiquer le refresh discrètement (indicateur « mise à jour », pas de flash). Le squelette n'est légitime qu'au premier chargement / changement de filtre majeur. [opinion]

### 6.2 Erreur

**Recommandation d'application** [opinion] :
- Erreur **totale** (premier chargement KO) : état d'erreur plein dans le conteneur (message + action « Réessayer »), à la place de la table.
- Erreur **partielle** (refresh KO alors que des données sont affichées) : **stale-while-error** — garder les données visibles, signaler l'échec (bannière ou indicateur), ne pas vider la table. Critique en temps réel : un refresh qui échoue ne doit pas faire « clignoter » 675 lignes.
- Erreur **par ligne/cellule** : badge/ligne en erreur cohérent avec le reste de l'app.

### 6.3 Vide

**Fait sourcé — NNG (Kate Kaplan)** : 3 usages des empty states — « **Communicate system status** », « Provide **learning cues** », « Provide **direct pathways** for key tasks » ; « Don't let empty-state design be an afterthought » (https://www.nngroup.com/articles/empty-state-interface-design/).

**Recommandation d'application** : l'état vide (filtres sans résultat) doit **distinguer** « aucun résultat pour ce filtre » (message + action réinitialiser les filtres) de « pas de données » (statut système) — la confusion chargement/vide/erreur est le piège NNG. Notre `emptyState` prop existe déjà : l'enrichir (message + action). [opinion]

### 6.4 Hover

**Fait sourcé — Material** : « Display a background in a table row if a user hovers over any part of that row » (spec Data tables, https://m1.material.io/components/data-tables.html).

**Fait sourcé — NNG** : le hover aide à garder sa place dans le scan (« hover-triggered highlighting of a record can all help » — https://www.nngroup.com/articles/data-tables/), mais les **actions seulement au hover sont un anti-pattern** : « Hidden under a hover gesture or a generic Actions menu, and thus **hard to discover** (and potentially with **low accessibility**) » (https://www.nngroup.com/articles/data-tables/).

**Recommandation d'application** :
- Hover de ligne **subtil** (fond `muted`, déjà en place) — en mode opérateur un hover trop fort « scintille » quand le curseur bouge (https://www.setproduct.com/blog/data-table-ui-design — source secondaire).
- **Jamais d'actions uniquement au hover** : toute action de ligne doit être accessible au clavier et visible au focus. [opinion, fondé NNG]
- Hover seulement sur les dispositifs à pointeur (`@media (hover: hover)`) pour éviter le « hover collant » au tactile. [opinion]

### 6.5 Sélection

**Fait sourcé — Material** : « When a row is selected, display a background color on the row » (spec Data tables, https://m1.material.io/components/data-tables.html) ; l'état selected peut se combiner avec hover/focus (https://m3.material.io/foundations/interaction/selection).

**Fait sourcé — NNG** : sélection multiple via **checkbox par ligne + barre d'actions** au-dessus/en-dessous de la table, avec « Select All » si l'action sur tout le jeu est fréquente ; le compteur de sélection doit être visible (https://www.nngroup.com/articles/data-tables/).

**Recommandation d'application** :
- Notre `selectedRowKey` (sélection simple) + surbrillance existante : la conserver pour la **ligne active** (détail, action), et la distinguer visuellement de la sélection multi (checkbox) si on l'ajoute. [opinion]
- Sélection multi (Shift+Clic / Shift+flèches, `Ctrl+A`) seulement si des actions par lot sont prévues (NNG). [opinion]
- **En virtualisation** : la surbrillance de sélection doit survivre au recyclage des lignes (elle est portée par la clé métier, pas par l'index — déjà le cas via `getRowKey`). [opinion]

---

## 7. Références générales

**Fait sourcé — NNG « Data Tables: Four Major User Tasks »** (https://www.nngroup.com/articles/data-tables/) — le texte de référence sur les tables web :
- 4 tâches à supporter : **trouver** les enregistrements répondant à des critères, **comparer** les données, **voir/modifier/ajouter** une ligne, **agir** sur des enregistrements.
- Première colonne = **identifiant lisible** par l'humain (pas un ID auto-généré).
- Ordre des colonnes par **importance**, colonnes liées **adjacentes**.
- Figer header + colonnes si la table dépasse l'écran ; **ombre subtile** pour la spatialisation ; bordures légères / zebra / hover pour garder sa place dans le scan.
- Masquer/réordonner facile, indicateurs clairs des colonnes masquées.
- Édition : panneau non-modal plutôt que modal pour les lignes profondes (les utilisateurs comparent avec les lignes voisines).

**Fait sourcé — GOV.UK Table** (https://design-system.service.gov.uk/components/table/) :
- « Use the table component to let users compare information in rows and columns » ; **ne jamais** utiliser une table pour la mise en page.
- Nombres **alignés à droite** ; `scope` sur les headers pour les AT ; classe `--small-text` pour les grandes tables ; **réduire la quantité de données** plutôt que densifier (à pondérer pour un outil d'ordonnancement où 675 lignes est le métier — [opinion]).

**Fait sourcé — USWDS Table** (https://designsystem.digital.gov/components/table/) : composant table du US Web Design System avec variantes scrollable / sticky-header / compact et guidance riche — tri par colonne activable (`data-sortable` + `aria-live` d'annonce), tri par défaut via `aria-sort` au chargement, `data-sort-value` pour valeurs brutes triables, « Minimize the number of columns. It's easier for users to read down a long list of rows than it is to read across a long list of columns », « Enable sort where useful » sur les longues tables, monospace + alignement à droite des nombres, conteneur scrollable focusable (`tabindex="0"`), « Don't use row sorting with merged cells » (colspan/rowspan).

---

## 8. Ce qu'on retient pour notre table

### 8.1 État actuel du composant (`inertia-react/components/ui/data-table.tsx`)

| Capacité | État | Écart vs recommandations |
|---|---|---|
| Tri contrôlé multi (`SortingState[]`) | ✅ | `toggleSorting` **remplace** le tableau → pas de multi-tri ; pas de rang affiché |
| Indicateur de tri | ✅ chevrons `ChevronsUpDown` (permanents) + `ArrowUp/Down` au tri | Chevron permanent sur 11 colonnes = bruit ; viser chevron **au survol** + persistant sur la triée (Material) |
| `aria-sort` | ✅ sur la colonne triée (asc/desc) | Pas de `other` pour gravité ; pas de `none` explicite sur les triables |
| Header clavier | ✅ `role=button` + tabIndex sur le `<th>` | Pattern APG : `<button>` dans le `<th>` |
| Header sticky | ✅ `sticky top-0 z-10` | OK |
| Colonnes sticky | ❌ | `border-collapse` en place → **bloquant CSS à lever** (§3.2) |
| Visibilité de colonnes | ❌ | À construire (menu toolbar + localStorage) |
| Persistance | ❌ (filtres en sessionStorage sur certains écrans) | À étendre (colonnes, tri, densité) |
| Clavier lignes (↑↓, Entrée, Échap) | ❌ | À construire (pattern APG grid, focus ligne) |
| Virtualisation | ✅ `@tanstack/react-virtual`, overscan 12, `estimateRowSize=56` | Ajuster la taille estimée si densité réduite ; `aria-rowindex` manquant |
| États (loading/error/empty) | ⚠️ `emptyState` existe ; loading/error hors composant | Squelette premier chargement + stale-while-error |
| Densité | ⚠️ `estimateRowSize=56`, pas de niveaux | 32-40 px visés ; contrôle densité optionnel |

### 8.2 Décisions recommandées (résumé)

1. **Tri** : tri métier par défaut (jours de retard) affiché comme tri actif (chevron + aria-sort) ; cycle asc → desc → off ; chevron au survol sur les triables, persistant + coloré sur la triée ; `aria-sort` `other` pour gravité ; Shift+clic multi-tri (infra prête) ; tri stable garanti par `Array.prototype.sort` (ES2019).
2. **Colonnes** : menu « Colonnes » dans la toolbar (checkboxes, ordre d'affichage, indicateurs de masquage) ; N° et Commande **non masquables** ; persistance localStorage versionnée (`scb.<écran>.columns.v1`) avec debounce ; réordonner par drag = plus tard, depuis le menu (pattern NNG accessible), pas sur les headers.
3. **Figées** : N° + Commande figées à gauche (2 max) ; **basculer `border-collapse` → `separate` + `border-spacing-0`** avec bordures unilatérales ; ombre verticale conditionnée à `scrollLeft > 0` ; z-index : header sticky > colonnes figées > cellules ; largeurs stables des colonnes figées.
4. **Clavier** : focus de ligne roving tabindex (un seul tabIndex=0) ; `↑↓` navigate, `PageUp/Down` pages, `Home/End` début/fin, `Entrée` action, `Échap` fermer, `/` recherche (documenté) ; `aria-rowindex` 1..675 + `aria-rowcount`/`aria-colcount` (virtualisation) ; focus préservé par clé métier pendant les refresh ; sélection seulement sur action (pas au focus).
5. **Densité/états** : ligne ~32-40 px (header à la même hauteur), cibles ≥ 24 px (WCAG 2.5.8) ; troncature 1 ligne + tooltip (1.4.13 compliant : dismissible/hoverable/persistent), nombres à droite ; squelette au premier chargement, stale-while-error au refresh, vide avec action (NNG), hover subtil, jamais d'action hover-only, sélection visible et portée par clé métier.

### 8.3 Pièges spécifiques temps réel + virtualisation

- **Pas de saut de focus** : quand le tri change sous l'utilisateur (refresh), la ligne focalisée doit rester la même *ligne métier* (clé `getRowKey`), pas le même index. [opinion]
- **Tri stable = pas de « danse » des lignes** : sur égalité de clé, l'ordre de départ (métier) est conservé — évite le scintillement des lignes à chaque poll. [fait sourcé MDN + opinion]
- **Sticky et largeurs** : toute variation de largeur d'une colonne figée entre renders décale le contenu scrollable (mesure `measureElement` + sticky) — figer les largeurs des colonnes figées. [opinion]
- **A11y de la virtualisation** : sans `aria-rowindex`, un lecteur d'écran voit « 20 lignes » au lieu de 675 — l'exemple 3 de l'APG data grid est notre modèle. [fait sourcé APG]

---

## 9. Checklist d'implémentation (par priorité)

### P0 — fondations (bloquant, à faire en premier)

- [ ] **CSS sticky** : remplacer `border-collapse` par `border-collapse: separate; border-spacing: 0` et reposer les bordures sur un seul côté par cellule (cf. SO 50361698, CSSWG #3136, Chrome TablesNG).
- [ ] **Colonnes figées** : `position: sticky; left` sur N° + Commande (th + td), z-index (header > figées > normales), fonds opaques.
- [ ] **Ombre de bord** : gradient vertical sur le bord droit de la zone figée, visible si `scrollLeft > 0`.
- [ ] **Tri par défaut explicite** : chevron + `aria-sort` visibles sur la colonne de tri métier (jours de retard / faisabilité) dès le premier rendu.
- [ ] **aria-sort complet** : `other` pour gravité ; icônes `aria-hidden` ; garder `aria-sort` sur le `<th>`.
- [ ] **Ajuster `estimateRowSize`** à la densité retenue (évite le saut de barre de défilement).

### P1 — confort opérateur (fortement recommandé)

- [ ] **Menu Colonnes dans la toolbar** : checkbox par colonne (N° + Commande non masquables), ordre = ordre d'affichage, indicateurs de masquage clairs (NNG).
- [ ] **Persistance localStorage** : `{ visibilité, tri, densité }` versionnés, debounce ~300-500 ms.
- [ ] **Navigation clavier lignes** : roving tabindex (↑↓/PageUp/PageDown/Home/End), Entrée = action, Échap = fermer, `/` = focus recherche — avec `scrollToIndex` avant focus.
- [ ] **A11y virtualisation** : `aria-rowindex` (1..675), `aria-rowcount`, `aria-colcount`, `aria-colindex` (APG data grid ex. 3).
- [ ] **Focus préservé en temps réel** : restauration par clé métier après tri/refresh ; jamais de `focus()` intempestif.
- [ ] **Chargement/erreur** : squelette au premier chargement (hauteur stable) ; stale-while-error aux refresh ; message + « Réessayer » sur erreur totale.
- [ ] **Chevron de tri au survol** sur les colonnes triables non triées (au lieu du chevron permanent) — via CSS `group-hover` ou état React.

### P2 — si budget

- [ ] **Multi-tri** : Shift+clic / Shift+Entrée ajoute une clé ; rang (1, 2…) affiché sur les colonnes secondaires ; tri stable vérifié (ES2019).
- [ ] **Contrôle de densité** (3 niveaux, persisté) + hauteur de header alignée (Carbon).
- [ ] **Réordonner depuis le menu Colonnes** (pattern NNG, accessible clavier) — pas le drag sur headers.
- [ ] **Tooltips enrichis** : définitions métier (verdict, gravité) au hover **et au focus** (1.4.13), fermables Échap.
- [ ] **Migration serveur des préférences** si besoin utilisateur ≠ poste (clé versionnée prête).
- [ ] **Sélection multiple** (Shift+flèches, Ctrl+A) + barre d'actions, seulement si des actions par lot existent.

---

### Sources principales

- W3C APG Grid Pattern : https://www.w3.org/WAI/ARIA/apg/patterns/grid/
- W3C APG Data Grid Examples : https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/data-grids/
- W3C APG Grid and Table Properties : https://www.w3.org/WAI/ARIA/apg/practices/grid-and-table-properties/
- W3C APG Sortable Table Example : https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/
- W3C APG Keyboard Interface (roving tabindex) : https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
- WAI-ARIA 1.2, aria-sort : https://www.w3.org/TR/wai-aria-1.2/#aria-sort
- WCAG 2.2 : https://www.w3.org/TR/WCAG22/ (2.1.1, 2.1.2, 2.4.7, 2.5.8, 1.4.13 — pages Understanding citées en ligne)
- MDN, grid role : https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/grid_role
- MDN, aria-sort : https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-sort
- MDN, Array.prototype.sort (stabilité ES2019) : https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
- Material Design, Data tables : https://m1.material.io/components/data-tables.html (spec M3/maintenue : https://m2.material.io/components/data-tables)
- Carbon (IBM) v10 Data table : https://v10.carbondesignsystem.com/components/data-table/style/
- Ant Design Table : https://ant.design/components/table
- TanStack Table : https://tanstack.com/table/latest/docs/framework/react/sorting (+ column-visibility, column-pinning)
- AG Grid : https://www.ag-grid.com/javascript-data-grid/multi-sort/ (+ column-pinning, show-hide-columns, column-menu, column-drag)
- Handsontable : https://handsontable.com/docs/javascript-data-grid/column-freezing/ (+ column-moving, api/options)
- NNG, Data Tables: Four Major User Tasks : https://www.nngroup.com/articles/data-tables/
- NNG, Empty States : https://www.nngroup.com/articles/empty-state-interface-design/
- NNG, Lawn Mower Pattern (tooltips/jargon) : https://www.nngroup.com/articles/lawn-mower-pattern/
- GOV.UK Table : https://design-system.service.gov.uk/components/table/
- USWDS Table : https://designsystem.digital.gov/components/table/
- Adrian Roselli, Sortable Table Columns : https://adrianroselli.com/2021/04/sortable-table-columns.html
- CSSWG #3136 (border-collapse vs sticky) : https://github.com/w3c/csswg-drafts/issues/3136
- Chrome TablesNG : https://developer.chrome.com/blog/tablesng
- Mozilla bug 1450584 / 1866715 : https://bugzilla.mozilla.org/show_bug.cgi?id=1450584
- Stack Overflow (fix border-collapse: separate) : https://stackoverflow.com/questions/50361698/border-style-do-not-work-with-sticky-position-element
