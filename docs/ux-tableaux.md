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

**Fait sourcé — convention directionnelle** : Material montre une flèche **haut = ascendant** — « sorting by the schedule column in ascending order is indicated with an upward arrow » (https://github.com/flutter/flutter/issues/62745 ; https://github.com/angular/components/issues/8336) ; Flutter fait l'inverse (bas = ascendant) — la confusion est documentée (https://stackoverflow.com/questions/51293492/confusion-over-datatables-sort-direction-arrows). La direction n'est pas normalisée : **l'exigence est la cohérence** (même convention partout dans l'app) et la présence d'un indicateur d'état clair. Article de référence sur l'ambiguïté triangle vs flèche : « Sorting Arrow Confusion in Data Tables » (https://hackernoon.com/sorting-arrow-confusion-in-data-tables-5a3117698fdf).

**Fait sourcé — Carbon/IBM** : icône **flèche** dans le header, trois états (non trié / `sorted-up` / `sorted-down`) ; l'icône n'apparaît que sur la colonne triée (**persistante**) et **au survol/focus** sur les autres colonnes triables ; espacement documenté : icône à 8 px du texte (`$spacing-03`), padding header 16 px (https://carbondesignsystem.com/components/data-table/usage/ ; https://carbondesignsystem.com/components/data-table/style/ ; https://carbondesignsystem.com/components/data-table/accessibility/).

**Fait sourcé — Ant Design** : icône composée de **deux chevrons superposés** (CaretUp/CaretDown) à droite du libellé ; l'état actif colore le chevron de la direction courante en couleur primaire, l'autre reste atténué ; la colonne triée reçoit la classe `-column-sort` (fond d'en-tête teinté) ; cycle par défaut **ascend → descend → null** (configurable via `sortDirections`) ; tooltip `showSorterTooltip` annonçant la direction suivante au survol (https://ant.design/components/table).

**Recommandation d'application** :
- Colonne triée : chevron ▲/▼ **persistant** (état actif, couleur primaire, gras sur le libellé).
- Colonne triable non triée : chevron ▲/▼ **au survol** (état neutre/fantôme), pas permanent — évite le bruit visuel sur 10-11 colonnes.
- Clic sur colonne déjà triée : cycle asc → desc → off (pattern Material, repris par notre `toggleSorting` actuel). [opinion] Garder le cycle 3 états (pas 2) : il permet de revenir au tri métier par défaut — cohérent avec notre `sequenceur.tsx` qui retombe sur le tri métier quand `sorting` est vide.

### 1.2 aria-sort (état restitué aux technologies d'assistance)

**Fait sourcé — WAI-ARIA 1.2** (https://www.w3.org/TR/wai-aria-1.2/#aria-sort) : `aria-sort` s'applique sur le `columnheader` (ou `rowheader`) de la colonne triée. Valeurs : `ascending`, `descending`, `other` (tri par un algorithme autre qu'ascendant/descendant — **exactement notre cas du tri par gravité**), `none` (défaut).

**Fait sourcé — APG Grid and Table Properties** (https://www.w3.org/WAI/ARIA/apg/practices/grid-and-table-properties/) :
- « The `aria-sort` attribute should only be added to a **single** table or grid header at a time. » → un seul header avec `ascending`/`descending` à la fois.
- « It is important to note that **ARIA does not provide a way to indicate levels of sort** for data sets that have multiple sort keys. Thus, there is **limited value** to applying `aria-sort` with a value other than `none` to more than one column. » → en tri multi-colonnes, seule la colonne primaire porte `ascending`/`descending` ; les secondaires restent à `none` (l'ordre de tri secondaire doit être visible visuellement, ex. numéro de rang — [opinion]).
- APG grid : « If the grid provides sort functions, `aria-sort` is set to an appropriate value on the header cell element for the sorted column or row » (https://www.w3.org/WAI/ARIA/apg/patterns/grid/).
- MDN : « It doesn't have any impact on the actual sort order » — pure déclaration pour les AT (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-sort).
- **Justification WCAG** : l'état de tri devient restituable programmatiquement (**4.1.2 Name, Role, Value**) et la relation colonne ↔ ordre est exposée (**1.3.1 Info and Relationships**) (https://www.w3.org/TR/WCAG21/#name-role-value ; https://www.w3.org/TR/WCAG21/#info-and-relationships).

**Fait sourcé — APG Sortable Table Example** (https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/) :
- `aria-sort` **sur le `<th>`**, pas sur le bouton enfant.
- Le libellé des colonnes triables est enveloppé dans un **`<button>`** (activation clavier Entrée/Espace gratuite).
- L'icône de tri est dans un `<span aria-hidden="true">` pour ne pas polluer le nom accessible du bouton.

**Fait sourcé — Adrian Roselli** (https://adrianroselli.com/2021/04/sortable-table-columns.html) : la flèche visuelle ne suffit pas aux lecteurs d'écran ; `aria-sort` porte l'état. Les SVG de tri doivent être `aria-hidden`. (Il note aussi qu'`aria-sort` sur la seule colonne triée ne signale pas aux lecteurs d'écran que *les autres* colonnes sont triables — c'est le `<button>` qui le fait.)

**Fait sourcé — Accessible Data Interfaces** (https://www.accessible-data-interfaces.com/accessible-data-tables-grid-systems/sortable-filterable-data-grids/aria-sort-attributes-for-accessible-column-filtering/) : préférer `aria-sort="none"` **explicite** sur les colonnes triables non triées plutôt que l'attribut absent (signale la triabilité aux AT) ; l'`aria-sort` ne doit pas être utilisé pour signaler un filtre ; synchroniser la mise à jour d'`aria-sort` avec l'ordre réel du DOM (un update synchrone avant le réordonnancement des lignes fait annoncer un état faux).

**Fait sourcé — USWDS** : « Add an `aria-live` region to the page when enabling row sorting » — l'annonce du changement de tri aux lecteurs d'écran passe par une `aria-live` (polite) dédiée (https://designsystem.digital.gov/components/table/).

**Recommandation d'application** :
- `aria-sort` sur le `<th>` de la colonne triée : `ascending`/`descending` ; `other` pour le tri par gravité ; `none` (ou absent) sur les autres colonnes triables.
- Notre `DataTable` actuel met `role="button"` + `tabIndex` sur le `<th>` — fonctionnel, mais le pattern APG de référence est **un `<button>` dans le `<th>`** (sémantique plus propre, gestion du focus native). [opinion] Migrer vers le button-dans-th lors de la prochaine passe accessibilité. Ant rend le header focusable et pose `aria-description="sortable"` ; Carbon : headers triables atteignables par Tab, triables par Espace/Entrée (https://carbondesignsystem.com/components/data-table/accessibility/).
- Icônes de tri avec `aria-hidden="true"` (le libellé de colonne + aria-sort suffisent).
- **Couleur ≠ seul signal** : WCAG 1.4.1 Use of Color impose un autre indice (forme de l'icône + `aria-sort`) ; le chevron actif doit respecter le contraste (1.4.3, 4.5:1) (https://www.w3.org/TR/WCAG21/#use-of-color ; https://www.w3.org/TR/WCAG21/#contrast-minimum). [opinion] : faire commencer le nom accessible du bouton par le libellé de colonne suivi de « tri croissant/décroissant » (texte sr-only), comme le pattern APG avec glyphes `aria-hidden`.

### 1.3 Tri multi-colonnes

**Fait sourcé — APG** (voir 1.2) : l'ARIA ne peut exprimer qu'une colonne triée ; le multi-tri est donc une fonctionnalité visuelle + état interne.

**Fait sourcé — AG Grid** : tri multi-colonnes activable, ajout d'une colonne par modificateur **⇧ Shift+clic** par défaut (remplaçable par Ctrl/Cmd via `multiSortKey='ctrl'`, supprimable `suppressMultiSort`, ou forcé sans modifieur `alwaysMultiSort`) ; en multi-sort, le header affiche le **rang numérique (1, 2, 3…)** à côté de l'icône (https://www.ag-grid.com/javascript-data-grid/row-sorting/).

**Fait sourcé — TanStack Table** : l'état `sorting` est un **tableau `{ id, desc }` dont l'ordre = priorité** ; déclencheur par défaut Shift (`isMultiSortEvent`), limite `maxMultiSortColCount` ; `column.getSortIndex()` est prévu pour afficher « a badge or indicator of the column's sort order in a multi-sort scenario » (https://tanstack.com/table/latest/docs/framework/react/guide/sorting).

**Fait sourcé — Ant Design** : `sorter: { multiple: number }` définit la priorité relative des colonnes triées ensemble (https://ant.design/components/table).

**Fait sourcé — MDN** : `Array.prototype.sort` est **stable** depuis ES2019 — « Since version 10 (or ECMAScript 2019), the specification dictates that `Array.prototype.sort` is stable » (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort ; spec : https://tc39.es/ecma262/2019/ ; V8 : https://v8.dev/features/stable-sort).

**Fait sourcé — TanStack garantit un tri stable** : sa fonction de tri se termine par `return rowA.index - rowB.index` (l'index d'origine comme dernier arbitre — « This will also perform a stable sorting using the row index if needed ») ; justification temps réel : « Every time you resort this dataset, all of the Bob's would be randomly placed » sans stabilité (https://github.com/TanStack/table/issues/1310).

**Recommandation d'application** :
- Notre `SortingState[]` supporte déjà structurellement le multi-tri, mais `toggleSorting` **remplace** le tableau : ajouter le modificateur (Shift+clic / Shift+Entrée) pour *ajouter* une clé, et afficher le rang de tri (1, 2…) sur les colonnes secondaires. [opinion] Utile pour une table de 675 lignes (tri « poste » puis « jours de retard ») — coût faible puisque l'infrastructure est déjà là.
- **Tri stable** : sur égalité de clé, l'ordre initial est conservé — critique en temps réel (pas de « saut » de lignes à chaque refresh quand le tri ne change pas). Le tri par défaut (jours de retard) doit servir de clé *de départ* sur laquelle les tris utilisateur restent stables. [opinion]

### 1.4 Tri par défaut et tri personnalisé

**Fait sourcé — Material** : « sort the **most important data by default** » (spec Data tables, https://m1.material.io/components/data-tables.html).

**Fait sourcé — NNG** : « The default order of the columns should reflect the importance of the data to the user » (https://www.nngroup.com/articles/data-tables/) — le même principe s'applique à l'ordre de tri par défaut.

**Fait sourcé — Ant** : `defaultSortOrder: 'ascend' | 'descend'` par colonne = colonne triée dès le premier rendu (https://ant.design/components/table). **AG Grid** : sort initial via `initialSort` dans le colDef + cycle `sortingOrder` (défaut asc → desc → none) (https://www.ag-grid.com/javascript-data-grid/row-sorting/).

**Recommandation d'application** :
- **Tri par défaut = tri métier** : chez nous, `sequenceur.tsx` applique déjà « faisabilité → poste → urgence → livraison » quand `sorting` est vide ; l'écran suivi trie par jours de retard. Garder ce comportement (le tri utilisateur *remplace* le défaut, ne s'y empile pas), et l'afficher comme tri actif dans le header (chevron + `aria-sort`) — sinon l'utilisateur ne sait pas que la table est triée. [opinion, fondé sur Material « display a sorted state »]
- **Fait sourcé — USWDS** : « Set a default sort column and direction. To sort a table's rows by a specific sortable column on load, add the attribute `aria-sort` equal to a sort direction … to that column header » (https://designsystem.digital.gov/components/table/) → le tri par défaut se pose **via `aria-sort` dès le chargement**, pas seulement visuellement.
- **Fait sourcé — Handsontable** : `columnSorting.initialConfig` permet de trier une colonne dès l'initialisation ; `sortEmptyCells: false` (défaut) **place les cellules vides en fin de liste** (https://handsontable.com/docs/javascript-data-grid/api/options/) — validation lib pour notre règle « null/undefined en fin ».
- **Fait sourcé — TanStack** : `sortingFn: (rowA, rowB, columnId) => number` — la fonction **ne gère pas la direction** (desc/asc appliquée par le row model, « only need to provide a consistent comparison ») ; built-ins `alphanumeric`/`text`/`datetime`/`basic` (https://tanstack.com/table/latest/docs/framework/react/guide/sorting).
- **Piège null/undefined (sourcé MDN)** : `undefined` est placé en fin **sans appeler `compareFn`**, mais `null` est converti en la chaîne « null » (donc trié au **milieu**) → comparateur custom obligatoire pour regrouper les vides en fin (`if (a == null) return 1; if (b == null) return -1;`) ; TanStack expose `sortUndefined` (défaut = undefined en fin) (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort ; https://tanstack.com/table/latest/docs/framework/react/guide/sorting).
- **Tri personnalisé (gravité, jours de retard)** : fonctions de comparaison dédiées (comme `feasRank()` dans `sequenceur.tsx`) ; `aria-sort="other"` quand l'algorithme n'est ni asc ni desc pur. **Piège** : comparer des nombres en tant que chaînes (« 80 » avant « 9 » — le tri par défaut convertit tout en chaînes UTF-16) — toujours `a - b` (ou `Number()` explicite) pour les colonnes numériques. « Gravité » : ordre sémantique via une map (`{ critique: 0, majeur: 1, mineur: 2 }`), jamais de comparaison alphabétique des libellés. [opinion]
- **Fait sourcé — USWDS** : pour les cellules formatées (pourcentages, dates, jours…), fournir une valeur brute triable (`data-sort-value`) — exactement notre cas « jours de retard » affiché en « j+3 » (https://designsystem.digital.gov/components/table/).

---

## 2. Colonnes

### 2.1 Afficher / masquer

**Fait sourcé — NNG** : « Hiding and reordering columns must be **easy to accomplish** (low interaction cost and **accessible for those that don't use drag and drop** interactions). These features should be **discoverable** and **clear visual state indicators** should signal to users that some columns are hidden » (https://www.nngroup.com/articles/data-tables/).

**Fait sourcé — TanStack Table** : visibilité = état `columnVisibility` (map `columnId → boolean`) ; API : `column.getIsVisible()`, `column.getCanHide()`, `column.toggleVisibility()`, `column.getToggleVisibilityHandler()` (raccourci checkbox) ; non-masquable : `enableHiding: false` → `getCanHide()` renvoie `false` et désactive le toggle (https://tanstack.com/table/v8/docs/guide/column-visibility).

**Fait sourcé — AG Grid** : `gridApi.setColumnsVisible(keys[], visible)` — la Column API est **dépréciée depuis v31**, tout passe par la Grid API (https://www.ag-grid.com/javascript-data-grid/grid-api/). Colonne non masquable : `lockVisible: true` (« blocks all UI functions that change a column's visibility », l'API continue de fonctionner) + `suppressColumnsToolPanel` pour la retirer du panneau (https://www.ag-grid.com/javascript-data-grid/column-properties/).

**Fait sourcé — MUI X** : `columnVisibilityModel` contrôlé + `onColumnVisibilityModelChange` ; `hideable: false` dans `GridColDef` bloque le toggle ; `slotProps.columnsManagement.getTogglableColumns` permet d'exclure des colonnes du panneau (ex. `id`) (https://mui.com/x/react-data-grid/column-visibility/).

⚠️ **Caveat sourcé — AG Grid** : « select/unselect all » du tool panel peut **masquer les colonnes `lockVisible`** (régression AG-3702, non close) (https://github.com/ag-grid/ag-grid/issues/3463) → si on propose un « tout afficher/masquer », le retester après upgrade.

**Recommandation d'application** :
- Colonnes **non masquables** : la colonne N° (index) et la colonne d'identité (Commande) — même si elles sont figées, les rendre non masquables évite un état « identité perdue ». [opinion, patterns AG Grid `lockVisible` / TanStack `enableHiding`]
- Indicateur d'état : le menu doit montrer clairement les colonnes masquées (checkbox décochée) — exigence NNG.
- **En temps réel** : masquer une colonne ne doit pas casser les mises à jour (les données arrivent toujours, seul le rendu change) ; avec la virtualisation, la largeur recalculée des lignes visibles doit être prise en compte. [opinion]

### 2.2 Menu de colonnes

**Fait sourcé — AG Grid** : le column menu est lancé **depuis le header** ; alternative : le **Columns Tool Panel** (panneau latéral) avec « Select/Unselect All », recherche, groupes — l'ordre du panneau reste synchronisé avec l'ordre affiché (https://www.ag-grid.com/javascript-data-grid/column-menu/ ; https://www.ag-grid.com/javascript-data-grid/tool-panel-columns/).

**Fait sourcé — MUI X** : panneau ouvert depuis un bouton de la toolbar, footer **Show/Hide All + Reset**, recherche, `toggleAllMode: 'filteredOnly'` (https://mui.com/x/react-data-grid/column-visibility/).

**Fait sourcé — TanStack** : **pas de menu natif** — pattern documenté : liste de `<label><input type=checkbox checked={column.getIsVisible()} disabled={!column.getCanHide()} onChange={column.getToggleVisibilityHandler()} />` ; le dropdown est à construire (https://tanstack.com/table/v8/docs/guide/column-visibility).

**Recommandation d'application** :
- Menu « Colonnes » dans la **toolbar** (icône + libellé, pas seulement une icône — [opinion] pour la découvrabilité), dropdown listant les colonnes avec checkboxes, triées dans l'ordre d'affichage actuel.
- 10-11 colonnes = pas besoin de groupes ; une simple liste suffit ; footer éventuel « tout afficher » (sans masquer les colonnes verrouillées — caveat AG-3702 ci-dessus). [opinion]
- **Accessibilité du menu** : pour une liste de toggles à effet immédiat, le W3C préfère le **Menu Button** (`aria-haspopup`, flèches ↑/↓, Home/End, Échap ferme et rend le focus au bouton — https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions/) ; mais Roselli déconseille `role="menu"` pour du **toggle d'état** et recommande plutôt un **disclosure avec checkboxes natives** (état annoncé par défaut, pas de focus trap maison ; DataTables documente le piège du tab qui sort du menu) — https://adrianroselli.com/2023/05/be-careful-using-menu.html ; https://datatables.net/forums/discussion/70659/column-visibility-menu-tabbing-outside. [opinion] : disclosure + checkboxes natives, fermeture à Échap.

### 2.3 Réordonner (drag & drop)

**Fait sourcé — AG Grid** : drag & drop de colonnes par le header, avec `suppressDragLeaveHidesColumns` (bloquer le « drag hors grille = masque »), `suppressMovable`, `lockPosition: 'left'|'right'` pour verrouiller une position (https://www.ag-grid.com/javascript-data-grid/column-moving/).

**Fait sourcé — Handsontable** : `manualColumnMove: true` ajoute une poignée au-dessus du header ; hooks `beforeColumnMove`/`afterColumnMove` (https://handsontable.com/docs/javascript-data-grid/column-moving/).

**Fait sourcé — TanStack** : pas de drag natif — l'état `columnOrder` existe (`table.setColumnOrder`) mais l'UI drag&drop est à construire (https://tanstack.com/table/latest/docs/framework/react/column-pinning).

**Fait sourcé — WCAG 2.1 G219** : toute fonctionnalité par glisser doit avoir une **alternative mono-pointeur** sans drag (https://www.w3.org/WAI/WCAG21/Techniques/general/G219).

**Recommandation d'application** : [opinion] **Non prioritaire** pour notre cas : 10-11 colonnes fixes d'un outil métier, mode opérateur — le drag est un accélérateur que peu d'utilisateurs découvrent (NNG) et il complexifie la virtualisation (largeurs + sticky). Si fait plus tard : le faire depuis le **menu colonnes** (pattern NNG, accessible au clavier), avec une alternative mono-pointeur (ex. « monter/descendre » dans le menu — G219) et éventuellement Ctrl+←/→ au clavier (pattern DevExtreme — https://js.devexpress.com/React/Documentation/Guide/UI_Components/DataGrid/Accessibility/) ; noter que **MUI X n'a aucun reorder clavier** (issue ouverte — https://github.com/mui/mui-x/issues/13021).

### 2.4 Persistance des préférences

**Fait sourcé — NNG** : les préférences de colonnes (visibilité/ordre) sont des choix utilisateur que l'outil doit mémoriser pour ne pas les faire refaire (« low interaction cost » inclut la mémorisation — https://www.nngroup.com/articles/data-tables/ ; cf. aussi le pattern « user controls » de densité recommandé par les analyses de tables entreprise, https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables).

**Recommandation d'application** [opinion] (patterns de persistance vérifiés chez les libs, pas de source primaire prescrivant le mécanisme exact) :
- **localStorage par défaut** : visibilité, ordre, largeurs, pinning, tri actif, densité — clef versionnée (suffixe `-v1`, bumper le suffixe quand le schéma de colonnes change — pattern Handsontable https://handsontable.com/docs/javascript-data-grid/recipes/performance/persist-column-layout/ ; OpenObserve préfixe par table + suffixe de version + try/catch au load — https://github.com/openobserve/openobserve/blob/b9e79ed4/web/src/lib/core/Table/composables/useTableColumnPersistence.ts).
- **Quand sauvegarder** : debounce ~250 ms (CoreUI : 250 ms), à la fermeture du menu, en fin de drag — le pattern « un seul état sauvé » (tri, filtres, ordre, tailles, visibilité, pinning) est le plus robuste (CoreUI `stateKey` — https://coreui.io/data-grid/react/docs/features/state/). **Valider au load** (try/catch + fallback aux défauts).
- **localStorage vs serveur** : le localStorage est suffisant **si chaque poste est dédié à un utilisateur** ; sur poste partagé, les préférences fuient d'un utilisateur à l'autre — préfixer la clé par `userId_` ou passer au serveur (https://github.com/softwarity/store). Décision produit : poste ≠ utilisateur ? [opinion]

### 2.5 Colonnes toujours visibles (identité)

**Fait sourcé — NNG** : « The (default) **first column should be a human-readable record identifier** instead of a “mystery meat” automatically generated ID » (https://www.nngroup.com/articles/data-tables/). → notre colonne **Commande · Client** est l'identité ; le N° de ligne est un repère de position, pas une identité.

**Recommandation d'application** : colonnes d'identité = **figées** (cf. §3) plutôt que « forcées visibles » : rendre une colonne non-masquable garantit sa présence mais **pas sa visibilité** en scroll horizontal — le **pin** la garde affichée en permanence. Combinaison recommandée (sourcée TanStack/AG Grid) : **pin gauche + non-masquable** — TanStack `columnPinning.left` + `enableHiding: false` (https://tanstack.com/table/latest/docs/framework/react/column-pinning) ; AG Grid `pinned: 'left'` + `lockVisible: true` (et `lockPinned: true` pour empêcher l'utilisateur de dépinner, https://www.ag-grid.com/javascript-data-grid/column-pinning/). ⚠️ Vérifier la largeur de la zone pinnée (AG Grid la plafonne à `grid − 50px` avec auto-unpin si trop large — d'autant plus critique sur écran d'opérateur). [opinion + faits sourcés]

---

## 3. Colonnes figées (sticky / frozen)

### 3.1 Patterns de référence

**Fait sourcé — NNG** : « Freeze header rows and **header columns** (if the table is larger than the screen) » (https://www.nngroup.com/articles/data-tables/).

**Fait sourcé — AG Grid** : `pinned: 'left'|'right'` sur la définition de colonne ; le grid réordonne automatiquement (figées-gauche d'abord, figées-droite en dernier) ; pin par drag possible, verrouillable avec `lockPinned`. **Limitation documentée** : « When resizing pinned columns, the size of the pinned sections (left and right) will be limited to the size of the `grid - 50px`. This will prevent the centre viewport of the grid from becoming inaccessible » — si les colonnes figées sont trop larges, le grid les **dé-fige automatiquement** (`processUnpinnedColumns` pour personnaliser) (https://www.ag-grid.com/javascript-data-grid/column-pinning/).

**Fait sourcé — Handsontable** : `fixedColumnsStart` = nombre de colonnes figées au bord gauche (défaut `0`) ; `manualColumnFreeze: true` laisse l'utilisateur geler/dégeler via le menu contextuel — piège documenté : « when you unfreeze a frozen column, it doesn't go back to the original position » (https://handsontable.com/docs/javascript-data-grid/column-freezing/).

**Fait sourcé — TanStack Table** : `columnPinning` (left/right) ; implémentation sticky dans la même table : offsets via `column.getStart('left')` / `column.getAfter('right')` (« sum of all previous visible leaf column sizes »), `position: sticky; left: ${…}px`, `zIndex: isPinned ? 1 : 0` — l'exemple officiel **exige `border-collapse: separate`** dans sa feuille de style (https://tanstack.com/table/latest/docs/framework/react/guide/column-pinning ; exemple sticky : https://tanstack.com/table/latest/docs/framework/react/examples/column-pinning-sticky).

**Fait sourcé — guide de design (source secondaire)** : « Limit left-pinned width to 200-300 px (identity columns), right-pinned to 100-150 px (action buttons), unpin responsively if pinned columns exceed ~60 % of grid width » (https://sujeet.pro/articles/design-data-grid).

### 3.2 Le piège `border-collapse: collapse` — CRITIQUE pour nous

**Fait sourcé — CSSWG** : « Collapsed table borders **don't follow sticky rows/cells** when they stick » ; « in the collapsed-borders model, the borders “**belong to” the table**, not the cells or rows » (https://github.com/w3c/csswg-drafts/issues/3136).

**Fait sourcé — Chrome for Developers (TablesNG)** : avertissement explicite — « If you're using `position: sticky` on a table, **make sure it doesn't have borders**. Border painting is currently an open cross-browser compatibility issue, as borders belong to the table, not the header row itself » (https://developer.chrome.com/blog/tablesng).

**Fait sourcé — Mozilla** : avec `border-collapse: collapse`, les bordures des cellules sticky « restent attachées à la table » et les fonds des cellules positionnées les recouvrent (bug 1450584 : « Border of sticky or relative positioned table elements remains attached to main table when border-collapse:collapse is set » — https://bugzilla.mozilla.org/show_bug.cgi?id=1450584 ; bug 1866715 : bordures ignorées sur th sticky — https://bugzilla.mozilla.org/show_bug.cgi?id=1866715).

**Fait sourcé — Stack Overflow (solution pratique)** : passer à `border-collapse: separate` + `border-spacing: 0`, et appliquer les bordures **sur un seul côté** de chaque cellule (ex. `border-bottom` + `border-right` sur td, `border-left` sur la première colonne) pour retrouver l'aspect « collapse » (https://stackoverflow.com/questions/50361698/border-style-do-not-work-with-sticky-position-element).

**Fait sourcé — CSS-Tricks** : « There are various browser issues with sticky `th` with borders, especially with `border-collapse: collapse`. The best workaround… use `border-collapse: separate` with `border-spacing: 0` then set the borders on just two sides (e.g. top/left) of each `th` and `td` » (https://css-tricks.com/position-sticky-and-table-headers/).

**Fait sourcé — mécanisme (MDN)** : `position: sticky` = « offset relative to its *nearest scrolling ancestor* » et « always creates a new stacking context » (https://developer.mozilla.org/en-US/docs/Web/CSS/position) → la cellule sticky se peint **au-dessus** des bordures restées « en place » : bordures invisibles, doublées ou mangées par le background. Avec `separate` + `border-spacing: 0`, chaque cellule possède ses bordures → elles suivent le déplacement sticky.

**Application à notre code** : notre `DataTable` utilise `border-collapse` (classe `border-collapse` tailwind) — **à remplacer par `border-collapse: separate` + `border-spacing-0`** dès qu'on ajoute une colonne sticky, sinon les bordures de la colonne figée « fuiraient » derrière le scroll. [fait sourcé + constat code]

### 3.3 Ombre / diviseur sur le bord de la colonne figée

**Fait sourcé — NNG** : « The **subtle use of a drop shadow** suggests that the frozen first column and header row are floating “above” the rest of the table's data, **assisting with spatial orientation** » (https://www.nngroup.com/articles/data-tables/).

**Fait sourcé — TanStack (exemple sticky officiel)** : `boxShadow: '-4px 0 4px -4px gray inset'` sur la **dernière colonne figée à gauche** (détectée via `column.getIsLastColumn('left')` / `getIsFirstColumn('right')`) (https://tanstack.com/table/latest/docs/framework/react/examples/column-pinning-sticky).

**Fait sourcé — scroll shadows** : Dave Rupert et Ben Frain pilotent l'ombre par `animation-timeline: scroll(nearest inline)` — l'ombre n'apparaît que lorsqu'il y a du contenu débordant (https://daverupert.com/2023/08/animation-timeline-scroll-shadows/ ; https://benfrain.com/scroll-indicators-on-tables-with-background-colours-with-animation-timeline/).

**Recommandation d'application** :
- Ombre verticale légère (gradient noir ~20-30 % d'alpha sur 8-16 px) sur le **bord droit de la zone figée**, affichée **seulement quand `scrollLeft > 0`** (le contenu défile réellement dessous). [opinion]
- En React, le plus fiable reste un état `scrollLeft` mis à jour dans `onScroll` du conteneur (le support d'`animation-timeline` est encore partiel) ; `pointer-events: none` sur l'ombre. [opinion]
- Les cellules sticky doivent avoir un **fond opaque** (bg-card) et un **z-index supérieur** aux cellules normales (et inférieur au header sticky). [opinion, mécanique CSS]

### 3.4 Combien de colonnes figer

**Fait sourcé — AG Grid** : la doc recommande de figer **peu** de colonnes (chaque colonne figée réduit la surface scrollable — https://www.ag-grid.com/javascript-data-grid/column-pinning/ ; la limitation à 1-2 est le pattern des libs, cf. Handsontable `fixedColumnsStart` par défaut à 1).

**Recommandation d'application** : [opinion] **2 colonnes max** : N° + Commande (identité). Au-delà, la zone scrollable devient trop étroite pour 9-10 colonnes restantes. Ne jamais figer de colonne à droite (les actions en fin de ligne restent accessibles au scroll). Bornes documentées : zone pinnée gauche 200-300 px (sujeet.pro, https://sujeet.pro/articles/design-data-grid) et plafond AG Grid `grid − 50px` avec auto-unpin (https://www.ag-grid.com/javascript-data-grid/column-pinning/) — à ~150-180 px pour N° + Commande, on reste largement sous la barre.

### 3.5 Interaction avec la virtualisation

**Fait sourcé — Chrome** : `position: sticky` fonctionne sur `<th>` et `<td>` (lignes et colonnes) depuis TablesNG (https://developer.chrome.com/blog/tablesng) — c'est le mécanisme compatible avec une table virtualisée **pourvu que** :
- le scroll soit sur le **conteneur unique** : sticky se cale sur le « nearest ancestor that has a scrolling mechanism » (MDN, https://developer.mozilla.org/en-US/docs/Web/CSS/position) → `overflow-x: auto` sur le wrapper, jamais sur la table (`scrollRef` — déjà le cas chez nous) ;
- **une seule table sticky plutôt que des panes séparés** : à 675 lignes en rangées recyclées, les cellules figées sont rendues avec chaque rangée → pas de synchro multi-panes (https://sujeet.pro/articles/design-data-grid ; l'approche multi-panes synchro est l'alternative lourde : https://gearheart.io/blog/smooth-react-virtual-scroll-with-fixed-rows-columns/) ;
- l'ordre de **z-index soit explicite** : sticky crée un stacking context (MDN) — cellules figées `z-index: 1` (TanStack), **header sticky `z-index: 2`**, cellule d'angle (header × colonne figée) cumulant `top: 0` + `left: 0` et le z-index le plus élevé ; [opinion mécanique]
- **au moins une propriété `inset` non-`auto`** (`top` pour le header, `left` pour les colonnes) sinon sticky « will behave as relative » (MDN — https://developer.mozilla.org/en-US/docs/Web/CSS/position ; CSS-Tricks — https://css-tricks.com/position-sticky-and-table-headers/) ;
- la largeur des colonnes figées reste **stable** entre les renders (sinon les offsets sticky des lignes recyclées se décalent). [opinion — coût réel de la virtualisation]

---

## 4. Clavier

### 4.1 Pattern APG « grid » (roving tabindex)

**Fait sourcé — APG Grid Pattern** (https://www.w3.org/WAI/ARIA/apg/patterns/grid/) :
- **Roving tabindex** : un seul élément focusable dans la grille (`tabindex="0"`), les autres en `tabindex="-1"` ; les flèches déplacent le focus, Tab en sort.
- **Touches (data grid)** : `→`/`←` (cellule), `↓`/`↑` (ligne), `PageDown`/`PageUp` (défilement d'un nombre de lignes déterminé par l'auteur, « typically scrolling so the bottom row in the currently visible set of rows becomes one of the first visible rows »), `Home`/`End` (début/fin de ligne), `Ctrl+Home`/`Ctrl+End` (début/fin de grille). Au bord de la grille, « focus does not move ».
- **Sélection (APG grid)** : `Ctrl+Space` = colonne, `Shift+Space` = ligne (raccourci pour cocher la checkbox de ligne), `Ctrl+A` = tout, `Shift+flèches` = étendre la sélection.
- **Pas de typeahead prescrit** : dans le pattern grid, les touches alphanumériques ne servent qu'à l'**édition de cellule** (« Alphanumeric keys: If the cell contains editable content, places focus in an input field ») — un raccourci `/` pour la recherche est donc une **décision d'application**, pas un pattern APG. [opinion]
- Distinction **data grid vs layout grid** : dans une data grid, les touches **ne wrappent pas** (pas de retour ligne→ligne par `→` en fin de ligne).
- **APG — Managing Focus (roving tabindex)** (https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) : « One benefit of using roving `tabindex` rather than `aria-activedescendant` to manage focus is that the **user agent will scroll the newly focused element into view** » — essentiel avec la virtualisation.

**Fait sourcé — APG Data Grid Examples** (https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/data-grids/) : pour une grille dont **toutes les lignes ne sont pas dans l'arbre d'accessibilité** (virtualisation), poser `aria-rowindex` (1-based) sur les `<tr>` et `aria-colindex` sur les `<th>`/`<td>` — les lecteurs d'écran restituent la position réelle dans l'ensemble des 675 lignes. L'exemple 3 démontre aussi le masquage de colonnes avec `aria-colindex` (les numéros de colonnes masquées sont sautés).

**Fait sourcé — MDN (rôle grid)** (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/grid_role) : activation des éléments interactifs avec **Entrée / Espace** ; sélection : `Shift+Espace` = sélectionne la ligne (ou coche la checkbox de ligne), `Ctrl+Espace` = sélectionne la colonne, `Ctrl+A` = tout, `Shift+flèches` = étend la sélection.

### 4.2 Focus vs sélection

**Fait sourcé — APG (Developing a Keyboard Interface)** : « **Focus and selection are quite different.** From the keyboard user's perspective, focus is a pointer, like a mouse pointer; it tracks the path of navigation. There is only one point of focus at any time and all operations take place at the point of focus. On the other hand, selection is an operation… However, if the widget supports multiple selection, then more than one item can be in a selected state, **and keys for moving focus do not perform selection** » (https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/). La section « Deciding When to Make Selection Automatically Follow Focus » déconseille la sélection-suiveuse de focus dans certains cas ; APG exige que la sélection soit **visuellement distincte** du focus. Une ligne sélectionnée porte `aria-selected="true"` (APG grid — https://www.w3.org/WAI/ARIA/apg/patterns/grid/).

**Recommandation d'application** [opinion, fondée sur la citation ci-dessus] : **le focus suit le clavier, la sélection suit l'action** — `↑`/`↓` déplacent un **focus de ligne** (surbrillance de focus légère), la sélection effective (ouverture du détail, action) ne se déclenche qu'à **Entrée / Espace / clic**. C'est le comportement recommandé dès qu'on touche à la multi-sélection, et il évite les effets de bord en temps réel (sélection involontaire en parcourant, re-rendus).

### 4.3 Navigation par lignes vs par cellules

**Fait sourcé — APG** : le pattern grid est défini en navigation **par cellules** ; rien n'interdit le focus ligne (un seul `gridcell` focusable par ligne = le focus « ligne »).

**Recommandation d'application** [opinion] : pour 675 lignes × 11 colonnes, **navigation par lignes** (focus sur la ligne entière, `tabIndex=0` sur le `<tr>` ou sur une cellule « hôte ») : moins de frappes, lecture de ligne complète, compatible avec le mode opérateur (scan vertical). Le scroll horizontal pour atteindre les colonnes lointaines reste souris/trackpad.

### 4.4 Clavier + virtualisation (temps réel)

**Fait sourcé — APG** : le roving tabindex fait scroller l'élément focalisé dans la vue par l'agent utilisateur (https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) — avec `@tanstack/react-virtual`, cela doit être complété par `scrollToIndex(index)` **avant/au moment du focus**, car les lignes hors viewport n'existent pas dans le DOM : il faut scroller puis poser le focus. [opinion d'implémentation]
- **Fait sourcé — APG prévient le piège du DOM partiel** : « If navigation functions can dynamically add more rows or columns to the DOM, key events that move focus to the beginning or end of the grid, such as Control + End, may move focus to the last row in the DOM rather than the last available row in the back-end data » (https://www.w3.org/WAI/ARIA/apg/patterns/grid/) — exactement notre cas : 675 lignes métier, ~20 dans le DOM.
- **Fait sourcé — USWDS** : un conteneur scrollable doit être focusable — « When you use the `.usa-table-container--scrollable` variant … you must add the `tabindex="0"` attribute to the scrollable element » (https://designsystem.digital.gov/components/table/) → notre div `scrollRef` devrait porter `tabindex="0"` pour que le scroll horizontal soit accessible au clavier.
- `aria-rowindex` (position réelle 1..675) et `aria-colcount`/`aria-rowcount` sur la grille (APG Data Grid Examples, https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/data-grids/).
- **Ne pas voler le focus pendant les mises à jour temps réel** : préserver la **clé métier** de la ligne focalisée et y revenir si elle est toujours présente. Argument WCAG : déplacer le focus à l'insu de l'utilisateur = changement de contexte non sollicité (**3.2.1 On Focus**), et retirer le focus au moment où il arrive est l'échec **F55** (« using script to remove focus when focus is received ») (https://www.w3.org/WAI/WCAG22/Techniques/failures/F55). [opinion + références]

### 4.5 WCAG (exigences)

**Fait sourcé — WCAG** (citations exactes) :
- **2.1.1 Keyboard (A)** : « All functionality of the content is operable through a keyboard interface without requiring specific timings for individual keystrokes » (https://www.w3.org/TR/WCAG21/) — toute action souris de la table (tri, menu colonnes, ouvrir, sélection) doit avoir un équivalent clavier.
- **2.1.2 No Keyboard Trap (A)** : « If keyboard focus can be moved to a component of the page using a keyboard interface, then focus can be moved away from that component using only a keyboard interface » ; note : « pressing the Esc key is a commonly used “standard exit method” » (https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html) — `Échap` doit donc toujours sortir de tout mode interne (édition, menu, recherche).
- **2.4.7 Focus Visible (AA)** : « Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible » ; l'indicateur ne doit pas être limité dans le temps (https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) — visible sur la ligne focusée **pendant le scroll** ; jamais `outline: none` sans remplacement (échec F78).
- **2.4.3 Focus Order (A)** : le roving tabindex maintient la grille à **un seul** tab stop et l'ordre de focus suit l'ordre visuel (https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/).

### 4.6 Raccourcis métier

**Recommandation d'application** [opinion] : APG ne prescrit pas les raccourcis métier ; cohérence avec les conventions existantes :
- `↑`/`↓` : naviguer les lignes (avec `PageUp`/`PageDown` pour sauter des pages de lignes, `Home`/`End` début/fin — APG grid) ; `←`/`→` réservés à la navigation de cellules seulement si on bascule en mode cellules, sinon laissés au scroll horizontal natif.
- `Entrée` : ouvrir/agir sur la ligne focalisée — cohérent avec la convention ARIA : « To activate the interactive component, they will use the return and space keys » (MDN, https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/grid_role).
- `Échap` : fermer le détail/annuler/sortir de tout mode — « standard exit method » (WCAG 2.1.2, https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html).
- `Shift+Espace` : sélectionner/déselectionner la ligne sous le focus (raccourci APG de sélection de ligne, https://www.w3.org/WAI/ARIA/apg/patterns/grid/).
- `/` : focus recherche/filtre — [opinion] décision d'application (pas de typeahead prescrit par APG grid) ; convention courante (GitHub/Linear) à documenter.
- **Documenter** les raccourcis (aide clavier accessible, ex. `?`) et les garder cohérents entre les écrans (même `DataTable` partout) — d'autant que 2.1.2 exige d'informer l'utilisateur dès qu'une méthode de sortie n'est pas standard. [opinion]

---

## 5. Densité, troncature, tooltips

### 5.1 Densité et hauteur de ligne

**Fait sourcé — Material 3 (fondations densité)** : échelle de densité `default` / `comfortable` / `compact` sur un pas **−1/−2/−3 de 4 px** sans toucher à l'espacement horizontal ; la densité compacte est recommandée pour les « data-rich applications » (tables, longs formulaires), avec une règle d'équilibre : plus c'est dense, plus les marges doivent être larges (https://m3.material.io/foundations/layout/grids-spacing/density). Spec data table Material : **48 px défaut / 40 px dense** (confirmé par MUI issue #16601 — https://github.com/mui/material-ui/issues/16601).

**Fait sourcé — Carbon (v11)** : la densité n'est plus un prop mais **cinq tailles de rangée** — xs **24 px**, sm **32 px**, md **40 px**, lg **48 px**, xl **64 px** (xl réservé au contenu sur 2 lignes) ; « The column header row … should always match the row size of the table » (https://carbondesignsystem.com/components/data-table/style/).

**Fait sourcé — Ant Design** : trois tailles `large | middle | small` — « There are two compacted table sizes: `medium` and `small`. The `small` size is used in Modals only » : le compact écran plein est `middle`. Tokens `cellPaddingBlock` 16/12/8, `cellPaddingInline` 16/8/8 → hauteurs ≈ **54 / 46 / 38 px** [calcul] (https://ant.design/components/table/).

**Fait sourcé — analyse tables entreprise** (source secondaire) : densités usuelles **Condensed 40 px / Regular 48 px / Relaxed 56 px**, avec un **contrôle utilisateur de densité** dans la toolbar (https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables).

**Fait sourcé — hauteurs par tâche** (source secondaire) : **32-36 px** pour les tâches comparaison/audit (scan massif), **44-56 px** pour inspection/décision (lecture ligne à ligne) ; piège : « 38 pixel rows, tolerable for both modes but optimized for neither » (https://137foundry.com/articles/how-to-design-data-tables-that-stay-readable-as-data-scales).

**Fait sourcé — WCAG 2.2 SC 2.5.8 (Target Size Minimum, AA)** : « The size of the target for pointer inputs is at least **24 by 24 CSS pixels**, except when: Spacing / Equivalent / Inline / User Agent Control / Essential » (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum). → la **cible de clic** (contrôles de ligne, checkbox) doit faire ≥ 24×24 px **ou** bénéficier de l'exception « spacing ». **Point clé : la cible de clic ≠ la hauteur visuelle de la ligne** — une ligne fine peut rester conforme si la zone cliquable est étendue par padding (ex. `padding: 4px` transforme un 16×16 en 24×24 — https://www.smashingmagazine.com/2024/07/getting-bottom-minimum-wcag-conformant-interactive-element-size/). (2.5.8 est nouveau en 2.2.)

**Fait sourcé — Apple HIG à nuancer** : 44×44 pt est le défaut **iOS/iPadOS** ; pour **macOS** le HIG donne 28×28 pt par défaut, min 20×20 pt (https://developer.apple.com/design/human-interface-guidelines/accessibility) → pour notre opérateur souris/clavier desktop, appliquer le plancher WCAG AA 24 px aux contrôles, pas 44 pt. [opinion]

**Recommandation d'application** :
- **Hauteur de ligne ~36 px** pour une table opérateur dense : 675 lignes virtualisées → seule la fenêtre visible compte (~700 px de zone table : 40 px ≈ 17 lignes, 36 px ≈ 19, 32 px ≈ 22 [calcul]). Notre `estimateRowSize` est à 56 : si on passe la densité à ~36, le mettre à jour (sinon la barre de défilement saute — commentaire déjà présent dans le code).
- Cibles interactives (bouton ligne, actions) ≥ 24 px (WCAG 2.5.8) ; la hauteur visuelle de ligne peut rester fine (padding étendu si besoin). [fait sourcé WCAG + opinion]
- Header sticky à la **même hauteur** que les lignes (Carbon). [fait sourcé]
- **Densité réglable par l'utilisateur** (3 niveaux, persistée §2.4) : coût modéré, bénéfice réel pour le mode opérateur. [opinion, pattern pencilandpaper]

### 5.2 Troncature vs wrap

**Fait sourcé — GOV.UK** : « When comparing columns of numbers, **align the numbers to the right** in table cells » ; « If possible, you should aim to have **less data in your tables**. If you have a lot of data, try to organise it into multiple tables or multiple pages » (https://design-system.service.gov.uk/components/table/). → la densité passe aussi par la réduction du contenu, pas seulement par le CSS.

**Fait sourcé — USWDS** : « **Use a monospace font for numerical data** » (déjà notre pratique : `font-mono` sur Charge/Qté) ; « **Right-align numerical data**. Align numbers that represent a sum to the right » ; « Predictably format columns … normalize values so they can be easily compared » (https://designsystem.digital.gov/components/table/).

**Fait sourcé — Carbon (v10)** : la troncature est le pattern par défaut des cellules longues ; l'usage **déconseille de forcer la troncature** de toutes les cellules — prévoir une recherche si la table tronque, et **middle truncation** quand l'info distinctive est en fin de chaîne (https://github.com/carbon-design-system/carbon/issues/7958 ; https://carbondesignsystem.com/components/data-table/usage/).

**Fait sourcé — Material** : « Text that is longer than the column width is truncated with an ellipsis. On hover, a tooltip shows the full name » (https://m2.material.io/components/data-tables).

**Fait sourcé — Ant Design** : `ellipsis: true` sur une colonne = troncature avec **tooltip au survol** (https://ant.design/components/table).

**Fait sourcé — PatternFly** : tooltip systématique sur texte tronqué, **≥ 4 caractères visibles**, jamais de troncature des en-têtes (https://www.patternfly.org/components/truncate/design-guidelines).

**Fait sourcé — Primer (GitHub)** : mise en garde forte — « The most accessible static element is one that is **not truncated** » ; un tooltip au hover n'est pas accessible clavier/lecteur d'écran (https://www.primer.style/accessibility/patterns/truncation/).

**Recommandation d'application** :
- **Tronquer à 1 ligne** (`truncate` + `max-w` par colonne) avec **tooltip** sur les colonnes textuelles longues ; `whitespace-nowrap` pour les colonnes numériques. [opinion — pattern dominant des design systems, cf. Carbon/Ant/Material]
- Exceptions [opinion] : colonnes critiques (Commande · Client, Article · Désignation) où le wrap sur 2 lignes peut être acceptable si l'identité doit être lisible en entier — mais le wrap introduit des hauteurs variables qui cassent la densité et le scroll : alternative propre = hauteur fixe tronquée + **vue détail** pour le texte complet (https://137foundry.com/articles/how-to-design-data-tables-that-stay-readable-as-data-scales).
- Alignement : **nombres à droite** (GOV.UK — déjà le cas : `tdClass: 'text-right'` sur Charge), textes à gauche, booléens/statuts centrés.
- Colonnes à largeur fixe (min/max) pour que la virtualisation et le sticky restent stables. [opinion]

### 5.3 Tooltips

**Fait sourcé — WCAG 2.2 SC 1.4.13 (Content on Hover or Focus, AA)** : tout contenu apparaissant au hover/focus doit être **Dismissible** (mécanisme sans bouger le pointeur/focus, ex. Échap), **Hoverable** (le pointeur peut aller dessus sans disparition), **Persistent** (reste visible tant que le déclencheur est survolé/focalisé ou jusqu'à fermeture) (https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).

**Fait sourcé — NNG** : les tooltips sont le bon véhicule pour le jargon métier en contexte (« Provide in-context definitions of jargon, either through a **tooltip** or a quick explanation in the table itself » — https://www.nngroup.com/articles/lawn-mower-pattern/).

**Recommandation d'application** : tooltips pour (a) le contenu tronqué, (b) les définitions de colonnes (verdict, gravité) ; ils doivent aussi apparaître **au focus clavier** (1.4.13 renvoie à 2.1.1 Keyboard : tout contenu déclenché au hover doit l'être au focus — https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) et être fermables à Échap. Garder ≥ 4 caractères lisibles sans tooltip (PatternFly) et ne pas se reposer sur le tooltip pour du contenu statique critique (Primer). En temps réel, un tooltip ouvert ne doit pas être « rafraîchi » sous le curseur à chaque update. [opinion]

---

## 6. États

### 6.1 Chargement

**Fait sourcé — NNG (empty states)** : ne pas confondre chargement et vide — « Do not default to totally empty states. This approach creates confusion for users, who may be left wondering if the system is still loading information or if errors have occurred » (https://www.nngroup.com/articles/empty-state-interface-design/).

**Recommandation d'application** [opinion] :
- **Premier chargement** : skeleton de lignes (rangées fantômes) qui **maintient la hauteur** du conteneur (pas de layout shift — CLS, https://web.dev/articles/cls). Sourcé : NNG « Skeleton Screens 101 » — skeleton adapté aux chargements **pleine page < 10 s**, frame-only déconseillé, progress bar au-delà de 10 s (https://www.nngroup.com/articles/skeleton-screens/) ; PatternFly fournit une `SkeletonTable` (5 lignes par défaut — https://www.patternfly.org/component-groups/status-and-state-indicators/skeleton-table/) ; Semrush : « Show the skeleton for the **first three-five rows**, not the entire table » (https://developer.semrush.com/intergalactic/v15-99-0/table-group/table-states/table-states) ; Carbon : `DataTableSkeleton` aligné sur la densité de la table.
- **Overlay vs inline (AG Grid)** : overlay pleine grille pour le chargement initial, renderers de cellule ligne par ligne pour le chargement incrémental au scroll (https://www.ag-grid.com/react-data-grid/overlays-provided/). MRT distingue `isLoading` (overlay + squelettes), `showProgressBars` (rafraîchissement), `showLoadingOverlay` (https://www.material-react-table.com/docs/guides/async-loading).
- **Refresh temps réel** : **ne pas re-skeletiser** à chaque poll — garder les données affichées et indiquer le refresh discrètement (barre de progression fine en tête, pattern `isRefetching`). Le squelette n'est légitime qu'au premier chargement / changement de filtre majeur. [opinion]

### 6.2 Erreur

**Recommandation d'application** [opinion] :
- Erreur **totale** (premier chargement KO) : état d'erreur plein dans le conteneur (message + action « Réessayer »), à la place de la table — pattern sourcé : bannière d'erreur + bouton refetch (Material React Table — https://www.material-react-table.com/docs/guides/async-loading) ; l'overlay d'erreur **garde la hauteur** de la zone table (pas de collapse).
- Erreur **partielle** (refresh KO alors que des données sont affichées) : **stale-while-error** — garder les données visibles, signaler l'échec (bannière « Données non actualisées — Réessayer »), ne pas vider la table (vider contredit la règle NNG de communiquer l'état système). Critique en temps réel : un refresh qui échoue ne doit pas faire « clignoter » 675 lignes.
- Erreur **par ligne/cellule** : badge/ligne en erreur (fond/icône), refresh unitaire ou par lot plutôt que tout recharger. [opinion]

### 6.3 Vide

**Fait sourcé — NNG (Kate Kaplan)** : 3 usages des empty states — « **Communicate system status** », « Provide **learning cues** », « Provide **direct pathways** for key tasks » ; « Don't let empty-state design be an afterthought » (https://www.nngroup.com/articles/empty-state-interface-design/).

**Recommandation d'application** : l'état vide doit **distinguer deux cas** (sourcé AG Grid : overlays séparés « no rows » vs « no matching rows » — https://www.ag-grid.com/react-data-grid/overlays-provided/) : « aucun résultat pour ce filtre » (message + action réinitialiser les filtres, compteur 0/675) vs « pas de données » (statut système). [opinion] : conserver le **header sticky** (distinguer « aucun résultat » d'une table cassée) et la **hauteur du conteneur** (pas de collapse → pas de CLS). Notre `emptyState` prop existe déjà : l'enrichir (message + action).

### 6.4 Hover

**Fait sourcé — Material** : « Display a background in a table row if a user hovers over any part of that row » (spec Data tables, https://m1.material.io/components/data-tables.html).

**Fait sourcé — NNG** : le hover aide à garder sa place dans le scan (« hover-triggered highlighting of a record can all help » — https://www.nngroup.com/articles/data-tables/), mais les **actions seulement au hover sont un anti-pattern** : « Hidden under a hover gesture or a generic Actions menu, and thus **hard to discover** (and potentially with **low accessibility**) » (https://www.nngroup.com/articles/data-tables/).

**Fait sourcé — Carbon** : tokens dédiés — rangée hover `$layer-hover` (texte `$text-primary`), sélectionné `$layer-selected`, sélectionné+hover `$layer-selected-hover` distincts (https://github.com/carbon-design-system/carbon-website/blob/master/src/pages/components/data-table/style.mdx).

**Recommandation d'application** :
- Hover de ligne **subtil** (changement de layer/fond, pas de déplacement de contenu — `hover:bg-muted/50` déjà en place) ; en mode opérateur un hover trop fort « scintille » quand le curseur bouge (https://www.setproduct.com/blog/data-table-ui-design — source secondaire).
- **Jamais d'actions uniquement au hover** pour les actions fréquentes : toute action de ligne doit être accessible au clavier et visible au focus. [opinion, fondé NNG]
- Hover seulement sur les dispositifs à pointeur (`@media (hover: hover) and (pointer: fine)`) pour éviter le « hover collant » au tactile. [opinion]

### 6.5 Sélection

**Fait sourcé — Material** : « When a row is selected, display a background color on the row » (spec Data tables, https://m1.material.io/components/data-tables.html) ; l'état selected peut se combiner avec hover/focus (https://m3.material.io/foundations/interaction/selection).

**Fait sourcé — NNG** : sélection multiple via **checkbox par ligne + barre d'actions** au-dessus/en-dessous de la table, avec « Select All » si l'action sur tout le jeu est fréquente ; le compteur de sélection doit être visible (https://www.nngroup.com/articles/data-tables/).

**Fait sourcé — MUI X (modificateurs de sélection)** : clic = sélection de la ligne ; **Ctrl/Cmd = multi-sélection indépendante, Shift = plage** ; `checkboxSelection` pour la colonne de cases ; `disableRowSelectionOnClick` quand des cellules sont interactives (https://mui.com/x/react-data-grid/row-selection/). Piège documenté : le Shift+clic est ancré sur la **dernière case cochée/décochée**, ce qui surprend après un « Select All » du header (https://github.com/mui/mui-x/issues/16366).

**Recommandation d'application** :
- Notre `selectedRowKey` (sélection simple) + surbrillance existante : la conserver pour la **ligne active** (détail, action), et la distinguer visuellement de la sélection multi (checkbox) si on l'ajoute. [opinion]
- Sélection multi (Ctrl/Cmd + clic, Shift + clic plage, `Ctrl+A`) seulement si des actions par lot sont prévues (NNG). [opinion]
- **En virtualisation** : la sélection est un **état métier (ids de lignes), pas du DOM** — elle doit survivre au scroll et au recyclage des rangées (portée par la clé métier, pas l'index — déjà le cas via `getRowKey`) ; contraste sélectionné ≠ hover ; trancher « sélection visible seulement » vs « tout sélectionner » avec les utilisateurs (prop MUI `checkboxSelectionVisibleOnly`). [opinion]

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
- Nombres **alignés à droite** ; `scope` sur les headers pour les AT ; **caption obligatoire** (comme un heading) ; pour beaucoup de données : réduire/split, sinon classe `--small-text` avec l'avertissement que la petite police ne convient qu'aux tables très denses — « a smaller amount of data is easier to read if the text is larger ».
- **Réduire la quantité de données** plutôt que densifier (à pondérer pour un outil d'ordonnancement où 675 lignes est le métier — [opinion]).

**Fait sourcé — USWDS Table** (https://designsystem.digital.gov/components/table/) : **pas de tri intégré** ; variantes bordered/striped/borderless, **`usa-table--compact`** pour les tables denses, **scrollable table** : « A scrollable table is ideal for dense data » (`usa-table-container--scrollable` + `tabindex="0"` pour l'accès clavier), **stacked** (empilée avec `data-label` sur chaque cellule) pour mobile ; captions et `scope` sur les en-têtes ; « Minimize the number of columns. It's easier for users to read down a long list of rows than it is to read across a long list of columns ».

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
| Densité | ⚠️ `estimateRowSize=56`, pas de niveaux | ~36 px visés (≈19 lignes visibles) ; contrôle densité optionnel |

### 8.2 Décisions recommandées (résumé)

1. **Tri** : tri métier par défaut (jours de retard) affiché comme tri actif (chevron + aria-sort) ; cycle asc → desc → off ; chevron au survol sur les triables, persistant + coloré sur la triée ; `aria-sort` `other` pour gravité ; Shift+clic multi-tri (infra prête) ; tri stable garanti par `Array.prototype.sort` (ES2019).
2. **Colonnes** : menu « Colonnes » dans la toolbar (checkboxes, ordre d'affichage, indicateurs de masquage) ; N° et Commande **non masquables** ; persistance localStorage versionnée (`scb.<écran>.columns.v1`) avec debounce ; réordonner par drag = plus tard, depuis le menu (pattern NNG accessible), pas sur les headers.
3. **Figées** : N° + Commande figées à gauche (2 max) ; **basculer `border-collapse` → `separate` + `border-spacing-0`** avec bordures unilatérales ; ombre verticale conditionnée à `scrollLeft > 0` ; z-index : header sticky > colonnes figées > cellules ; largeurs stables des colonnes figées.
4. **Clavier** : focus de ligne roving tabindex (un seul tabIndex=0) ; `↑↓` navigate, `PageUp/Down` pages, `Home/End` début/fin, `Entrée` action, `Échap` fermer, `/` recherche (documenté) ; `aria-rowindex` 1..675 + `aria-rowcount`/`aria-colcount` (virtualisation) ; focus préservé par clé métier pendant les refresh ; sélection seulement sur action (pas au focus).
5. **Densité/états** : ligne ~36 px (header à la même hauteur), cibles ≥ 24 px (WCAG 2.5.8 — la cible de clic ≠ la hauteur visuelle) ; troncature 1 ligne + tooltip (1.4.13 compliant : dismissible/hoverable/persistent, ≥ 4 caractères visibles), nombres à droite ; squelette 3-5 lignes au premier chargement, stale-while-error au refresh, vide avec action (NNG) et distinction no-rows / no-matching-rows (AG Grid), hover subtil, jamais d'action hover-only, sélection portée par clé métier (état métier, pas DOM).

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
- [ ] **Persistance localStorage** : `{ visibilité, tri, densité }` versionnés, debounce ~250 ms (CoreUI).
- [ ] **Navigation clavier lignes** : roving tabindex (↑↓/PageUp/PageDown/Home/End), Entrée = action, Échap = fermer, `/` = focus recherche — avec `scrollToIndex` avant focus.
- [ ] **A11y virtualisation** : `aria-rowindex` (1..675), `aria-rowcount`, `aria-colcount`, `aria-colindex` (APG data grid ex. 3).
- [ ] **Focus préservé en temps réel** : restauration par clé métier après tri/refresh ; jamais de `focus()` intempestif.
- [ ] **Chargement/erreur** : squelette 3-5 lignes au premier chargement (hauteur stable, pattern PatternFly/Semrush) ; stale-while-error aux refresh ; message + « Réessayer » sur erreur totale.
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
- Carbon (IBM) Data table : https://carbondesignsystem.com/components/data-table/style/ (densités v11 ; v10 archivée : https://v10.carbondesignsystem.com/components/data-table/style/)
- Ant Design Table : https://ant.design/components/table
- TanStack Table : https://tanstack.com/table/latest/docs/framework/react/sorting (+ column-visibility, column-pinning)
- AG Grid : https://www.ag-grid.com/javascript-data-grid/row-sorting/ (+ column-pinning, show-hide-columns, column-menu, column-moving)
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

---

## 10. Hiérarchie visuelle, icônes, alignement (le rendu, pas la mécanique)

> Chapitre ajouté a posteriori — le brief initial de recherche couvrait la
> mécanique de table (tri, colonnes, figées, clavier), pas la matière visuelle.
> C'est un défaut de cadrage : la direction visuelle venait des mockups, ce
> chapitre la documente et la durcit. Sources : NNG (visual hierarchy),
> Material Design 3 (iconography, data tables), Carbon (data table).

### 10.1 Hiérarchie visuelle

- **3 niveaux de lecture posés par V3** (NNG : « une hiérarchie est ce qui fait
  que l'œil lit dans le bon ordre ») :
  1. **Le signal** — verdict (icône + couleur + semibold) + retard relatif en
     rouge. C'est ce qu'on scanne en premier.
  2. **L'identité** — codes mono gras (commande, article). C'est ce qu'on
     rattache à une ligne connue.
  3. **Le contexte** — muted (client, désignation, libellés, couverture).
- **Emphase par poids/couleur, jamais par taille** (Material) : la seule
  dérogation est la Qté en 13 px gras — justifiée (quantité = donnée lue).
- **Le header ne se détache pas par le poids** (12 px/500, même graisse que le
  contenu) : c'est le filet 4 % + l'ombre du sticky thead qui font la
  séparation. Acceptable, à surveiller sur des tables sans thead sticky.

### 10.2 Icônes

- Règle Material : **une famille, un trait, une grille optique**. Vérifié :
  lucide, trait 1.75 partout, grille 14 px verdict / 11 px causes / 9 px X3.
- **Corrigé (alignement maquette↔code)** : les icônes de cause passaient en
  10 px dans les blocs indentés (descente BOM) — la maquette V3 spécifie
  **11 px pour toute la famille des causes**. Unifié à 11 px.
- Espacement icône-texte : gap ≈ 43 % de la taille de l'icône (6 px/14 px,
  7 px/16 px ≈) — constante optique tenue.
- Double codage forme + couleur (verdict) : requis (daltoniens), pas une
  redondance à supprimer.

### 10.3 Alignement

- **Nombres à droite, tabulaire partout** (Qté, Charge, quantités de rupture,
  heures) ✓ — règle NNG/Carbon.
- **Expé reste à gauche** : choix assumé — la colonne porte date + libellé
  relatif (2 lignes), l'alignement droite rendrait le libellé irrégulier.
- **Quantité de rupture en `ml-auto`** : cale au bord droit d'une cellule
  large (300 px) → un trou visuel entre la désignation et le chiffre sur les
  lignes courtes. À rejuger sur données réelles (option : coller la quantité
  à la désignation, ou rail droit réservé).
- **Baselines** : `vertical-align: top` partout ; les cellules 2 lignes
  alignent leur ligne 1 avec les cellules 1 ligne ✓. La colonne rupture
  commence parfois par une cause (pas de ligne art) — ligne 1 légèrement
  décalée, acceptable.
- Padding horizontal uniforme 12 px (px-3) ✓ ; colonne d'index 38 px avec
  barre de sévérité 3 px — offset optique de la barre vs texte à vérifier.
