# Plan de migration — grammaire Airbnb → Cursor

_Compagnon d'exécution de [`DESIGN.md`](DESIGN.md). DESIGN.md dit **ce que valent** les tokens ;
ce fichier dit **quoi écrire, où, dans quel ordre**._

**Vitrine de contrôle : [`/design-system`](inertia-react/pages/design_system.tsx).**
Chaque lot se vérifie à l'œil sur cette page, section par section.

---

## 0. Règles absolues

Ces cinq règles ne se discutent pas. Les enfreindre casse le thème d'origine, qui est encore
celui de la production.

1. **On ne modifie JAMAIS les `cva()` des primitives.** Le retarget se fait exclusivement en CSS,
   sous le scope `.theme-cursor`, dans `inertia-react/styles/app.css`. Raison : les deux thèmes
   coexistent ; toucher une `cva()` change aussi le thème Airbnb, qui n'est pas le sujet.
   - Seule exception, couverte par le **lot 0** : ajouter un attribut `data-*` à un composant qui
     n'en a pas. C'est purement additif — aucun style ne change.
2. **Un lot = un commit.** Jamais deux lots dans le même commit. On doit pouvoir revenir en
   arrière sur un lot sans défaire les autres.
3. **Après chaque lot** : `npm run typecheck` **et** `npm run lint`, puis commit, push,
   `gh run watch`. Détail en §1.
4. **Aucun composant n'est réécrit, aucun fichier de `components/ui/` n'est supprimé.** Si un lot
   semble exiger de réécrire un composant, c'est que le lot est mal découpé — s'arrêter et le
   signaler plutôt que d'improviser.
5. **Le suivi se met à jour dans le même commit que le lot.** Voir §2. Un lot dont le tableau de
   suivi n'a pas bougé est un lot non terminé.

**Ce que ce plan ne couvre pas** : les couleurs de marque, déjà figées et documentées dans
DESIGN.md, et le mode sombre, qui n'existe pas dans ce projet.

---

## 1. Procédure invariable

À répéter à l'identique pour **chaque** lot, sans sauter d'étape.

```bash
# 1. Écrire le CSS du lot dans inertia-react/styles/app.css
#    (point d'insertion : voir §3)

# 2. Mettre à jour le suivi (voir §2)

# 3. Gate — les deux, systématiquement
npm run typecheck
npm run lint

# 4. Formater uniquement les fichiers touchés (jamais `npm run format`)
npx prettier --write inertia-react/styles/app.css inertia-react/components/design-system/patterns.tsx

# 5. Commit (message : voir le modèle à la fin de chaque lot)
git add -A
git commit -F - <<'EOF'
...
EOF

# 6. Push, puis surveiller la CI jusqu'à conclusion
git push
gh run watch
```

Si la CI est rouge : `gh run view <id> --log-failed`, corriger, repousser. **Ne pas enchaîner sur
le lot suivant tant que la CI n'est pas verte.**

---

## 2. Mettre à jour le suivi

Deux endroits, dans `inertia-react/components/design-system/patterns.tsx` :

1. La constante `MIGRATION` (vers la fin du fichier) — passer l'entrée du composant de
   `'airbnb'` à `'cursor'`, et remplacer sa colonne `reste` par `'—'` :

   ```ts
   // avant
   { nom: 'Badge', etat: 'airbnb', reste: 'tons sémantiques à retarger sur --success/--warn/--danger' },
   // après
   { nom: 'Badge', etat: 'cursor', reste: '—' },
   ```

   Si le lot ne fait qu'une partie du travail, mettre `'partiel'` et **décrire précisément ce qui
   reste** dans `reste`. Ne jamais écrire `'cursor'` par optimisme.

2. La prop `etat` de la `<Fiche>` correspondante — elle se trouve soit dans `patterns.tsx`, soit
   dans `inertia-react/components/design-system/primitives.tsx`. Chercher `nom="Badge"` et changer
   `etat="airbnb"` en `etat="cursor"`.

Les compteurs en haut de la section 23 se recalculent tout seuls à partir de `MIGRATION`.

---

## 3. Où écrire le CSS

Fichier : `inertia-react/styles/app.css`.

Le bloc `.theme-cursor` commence à la ligne du commentaire
`/* ════ Thème « Cursor » — produit light … */` et se termine juste avant le commentaire
`/* Distinction test/prod — fidèle à la palette Airbnb. */`.

**Tout nouveau CSS s'ajoute à la fin de ce bloc**, c'est-à-dire immédiatement après :

```css
.theme-cursor [data-sidebar='menu-button'] {
  border-radius: 6px;
}
```

et immédiatement avant le commentaire `/* Distinction test/prod`.

Ajouter chaque lot précédé d'un commentaire de section, sur le modèle de ceux déjà présents :

```css
/* ── Lot N — <nom du lot> ────────────────────────────────── */
```

### Pourquoi ça gagne sur les classes Tailwind

Un sélecteur comme `.theme-cursor [data-slot='button']` a une spécificité de `(0,2,0)` ; une
classe utilitaire Tailwind (`.h-12`) vaut `(0,1,0)`. Le scope l'emporte donc **sans `!important`**.
N'ajouter `!important` que si une règle refuse visiblement de s'appliquer, et alors seulement sur
la déclaration concernée — jamais sur tout un bloc.

---

## 4. Ordre des lots

Du moins risqué au plus risqué. **Ne pas réordonner** : les derniers lots déplacent la mise en
page, les premiers non.

| Lot | Sujet                                           | Décale la mise en page ? |
| --- | ----------------------------------------------- | ------------------------ |
| 0   | Crochets `data-*` manquants                     | non                      |
| 1   | Filets & séparateurs                            | non                      |
| 2   | Badge & Pill                                    | non                      |
| 3   | Tooltip                                         | non                      |
| 4   | Overlays — Dialog, AlertDialog, Sheet           | non                      |
| 5   | Menus — Select, Combobox                        | non                      |
| 6   | Switch                                          | non                      |
| 7   | États — Spinner, Skeleton, LoadingState, Bubble | non                      |
| 8   | Calendrier                                      | marginalement            |
| 9   | **Champs de saisie**                            | **oui — fortement**      |
| 10  | **Boutons**                                     | **oui — fortement**      |
| 11  | Toolbar & SearchBar                             | oui                      |

Les motifs applicatifs (`BoardCard`, `X3Link`) ne sont **pas** dans ce plan : la carte de board est
une refonte de composant, pas un retarget de thème. Elle fera l'objet d'un chantier séparé.

---

## Lot 0 — Crochets `data-*` manquants

**Objectif.** Deux composants ne peuvent pas être ciblés en CSS par taille ou par variante. On
ajoute les attributs manquants. Aucun style ne change, aucun rendu ne bouge.

**Fichier 1 — `inertia-react/components/ui/button.tsx`.**
Dans le corps de `function Button`, ajouter deux attributs sur `<ButtonPrimitive>` :

```tsx
<ButtonPrimitive
  data-slot="button"
  data-variant={variant}
  data-size={size}
  className={cn(buttonVariants({ variant, size, className }))}
  {...props}
/>
```

**Fichier 2 — `inertia-react/components/ui/pill.tsx`.**
Dans le corps de `function Pill`, sur le `<button>` :

```tsx
    <button
      type="button"
      data-slot="pill"
      data-variant={variant}
      data-size={size}
      className={classes}
      {...props}
    >
```

**Interdits.** Ne rien changer d'autre dans ces deux fichiers. Ne pas toucher aux `cva()`.

**Vérification.** Ouvrir `/design-system`, section 10 (Boutons) et 11 (Badges & pills) : le rendu
doit être **strictement identique** à avant. Dans l'inspecteur, un bouton doit porter
`data-slot="button" data-variant="default" data-size="default"`.

**Suivi.** Aucun changement d'état — ce lot ne migre rien.

**Commit.**

```
feat(design): crochets data-variant/data-size sur Button et Pill

Prérequis du retarget Cursor : le CSS ne pouvait cibler ni la taille ni la
variante de ces deux composants. Ajout purement additif — aucun style ne
change, les cva() ne sont pas touchées.

Constraint: les thèmes Airbnb et Cursor coexistent — aucune cva() ne bouge
Confidence: high
Scope-risk: narrow

Co-Authored-By: <modèle qui a fait le travail>
```

---

## Lot 1 — Filets & séparateurs

**Objectif.** Toutes les séparations passent sur l'échelle d'opacité de l'encre.

```css
/* ── Lot 1 — filets & séparateurs ─────────────────────────── */
.theme-cursor [data-slot='separator'] {
  background-color: color-mix(in oklab, #141414 8%, transparent); /* --border-tertiary */
}
.theme-cursor [data-slot='field-separator'],
.theme-cursor [data-slot='sidebar-separator'],
.theme-cursor [data-slot='select-separator'],
.theme-cursor [data-slot='combobox-separator'] {
  background-color: color-mix(in oklab, #141414 8%, transparent);
}
```

**Vérification.** Section 12 (Champs), sous-partie « Separator » : les trois filets verticaux et
le filet horizontal doivent être nettement plus discrets qu'avant, sans disparaître.

**Suivi.** `Separator` → `'cursor'`, `reste: '—'`.

---

## Lot 2 — Badge & Pill

**Objectif.** Les tons sémantiques passent sur `--success` / `--warn` / `--danger`, en fond lavé
plutôt qu'en fond plein.

```css
/* ── Lot 2 — Badge & Pill ─────────────────────────────────── */
.theme-cursor [data-slot='badge'] {
  height: 20px;
  border-radius: 9999px;
  border-color: transparent;
  padding-inline: 8px;
  font-size: 11px;
  line-height: 14px;
  font-weight: 500;
  letter-spacing: 0.07px;
}
.theme-cursor [data-slot='badge'][data-variant='default'] {
  background-color: #141414;
  color: #fcfcfc;
}
.theme-cursor [data-slot='badge'][data-variant='secondary'] {
  background-color: color-mix(in oklab, #141414 8%, transparent);
  color: color-mix(in oklab, #141414 74%, transparent);
}
.theme-cursor [data-slot='badge'][data-variant='outline'] {
  background-color: transparent;
  color: #141414;
  box-shadow: 0 0 0 1px color-mix(in oklab, #141414 12%, transparent);
}
.theme-cursor [data-slot='badge'][data-variant='success'] {
  background-color: color-mix(in oklab, #007041 12%, transparent);
  color: #007041;
}
.theme-cursor [data-slot='badge'][data-variant='warning'] {
  background-color: color-mix(in oklab, #a46700 12%, transparent);
  color: #a46700;
}
.theme-cursor [data-slot='badge'][data-variant='destructive'] {
  background-color: color-mix(in oklab, #be1744 12%, transparent);
  color: #be1744;
}

/* La pill est un contrôle de filtre, pas une étiquette : rayon 6, pas plein rond. */
.theme-cursor [data-slot='pill'] {
  border-radius: 6px;
  border-color: transparent;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.08px;
  transition: background-color 100ms ease;
}
.theme-cursor [data-slot='pill'][data-size='sm'] {
  height: 20px;
  padding-inline: 8px;
}
.theme-cursor [data-slot='pill'][data-size='default'] {
  height: 24px;
  padding-inline: 10px;
}
.theme-cursor [data-slot='pill'][data-size='lg'] {
  height: 28px;
  padding-inline: 12px;
}
.theme-cursor [data-slot='pill'][data-variant='default'],
.theme-cursor [data-slot='pill'][data-variant='outline'] {
  background-color: #fcfcfc;
  color: #141414;
  box-shadow: 0 0 0 1px color-mix(in oklab, #141414 12%, transparent);
}
.theme-cursor [data-slot='pill'][data-variant='active'] {
  background-color: color-mix(in oklab, #141414 16%, transparent);
  color: #141414;
  box-shadow: none;
}
.theme-cursor [data-slot='pill'][data-variant='ghost'],
.theme-cursor [data-slot='pill'][data-variant='soft'] {
  background-color: transparent;
  color: color-mix(in oklab, #141414 74%, transparent);
  box-shadow: none;
}
.theme-cursor [data-slot='pill']:hover {
  background-color: color-mix(in oklab, #141414 8%, transparent);
}
```

**Interdits.** Ne pas changer la couleur du filet au survol — le survol ne joue que sur le fond
(règle de la section 08 de la vitrine).

**Vérification.** Section 11 : les badges sémantiques doivent être en fond lavé avec un texte
coloré lisible, plus en pastille pleine. Les pills passent en rectangles arrondis, hauteur ≤ 28 px.

**Suivi.** `Badge` → `'cursor'`, `Pill` → `'cursor'`.

---

## Lot 3 — Tooltip

```css
/* ── Lot 3 — Tooltip ──────────────────────────────────────── */
.theme-cursor [data-slot='tooltip-content'] {
  border-radius: 6px;
  padding: 3px 6px;
  font-size: 11px;
  line-height: 14px;
  letter-spacing: 0.07px;
  box-shadow: 0 8px 16px 0 rgba(20, 20, 20, 0.12); /* --cursor-box-shadow-popup */
}
```

**Vérification.** Section 15 (Overlays), sous-partie « Tooltip » : la bulle devient nettement plus
petite et plus dense. Le fond reste l'encre `#141414` (hérité de `bg-foreground`) — c'est voulu.

**Suivi.** `Tooltip` → `'cursor'`.

---

## Lot 4 — Overlays : Dialog, AlertDialog, Sheet

```css
/* ── Lot 4 — overlays ─────────────────────────────────────── */
.theme-cursor [data-slot='dialog-content'],
.theme-cursor [data-slot='alert-dialog-content'] {
  border-radius: 12px;
  padding: 16px;
  gap: 12px;
  background-color: #fcfcfc;
  box-shadow:
    0 0 0 1px color-mix(in oklab, #141414 8%, transparent),
    0 0 2px 0 #0000000f,
    0 6px 16px 0 #0000000f; /* --color-theme-shadow-dialog */
}
.theme-cursor [data-slot='dialog-overlay'],
.theme-cursor [data-slot='alert-dialog-overlay'],
.theme-cursor [data-slot='sheet-overlay'] {
  background-color: #0006; /* --bg-scrim */
}
.theme-cursor [data-slot='dialog-title'],
.theme-cursor [data-slot='alert-dialog-title'] {
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  letter-spacing: -0.15px;
  color: #141414;
}
.theme-cursor [data-slot='dialog-description'],
.theme-cursor [data-slot='alert-dialog-description'],
.theme-cursor [data-slot='sheet-description'] {
  font-size: 13px;
  line-height: 18px;
  letter-spacing: -0.08px;
  color: color-mix(in oklab, #141414 74%, transparent);
}
.theme-cursor [data-slot='dialog-footer'],
.theme-cursor [data-slot='alert-dialog-footer'] {
  background-color: transparent;
  border-top-color: color-mix(in oklab, #141414 4%, transparent);
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}
.theme-cursor [data-slot='sheet-content'] {
  background-color: #fcfcfc;
  border-color: color-mix(in oklab, #141414 8%, transparent);
  box-shadow: 0 8px 16px 0 rgba(20, 20, 20, 0.12);
}
.theme-cursor [data-slot='sheet-content'][data-side='right'],
.theme-cursor [data-slot='sheet-content'][data-side='left'] {
  border-radius: 0;
}
.theme-cursor [data-slot='sheet-content'][data-side='bottom'] {
  border-top-left-radius: 14px;
  border-top-right-radius: 14px;
}
.theme-cursor [data-slot='sheet-content'][data-side='top'] {
  border-bottom-left-radius: 14px;
  border-bottom-right-radius: 14px;
}
.theme-cursor [data-slot='sheet-title'] {
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  letter-spacing: -0.15px;
  color: #141414;
}
```

**Piège.** Le pied de dialog a un fond `bg-muted/50` et un rayon `14px` dans la grammaire
d'origine. Les deux règles ci-dessus le neutralisent — vérifier qu'il n'y a plus de bande grise
sous les boutons.

**Vérification.** Section 15 : ouvrir le Dialog, l'AlertDialog, puis les deux Sheets. Rayon 12 pour
les modales, coins hauts arrondis à 14 pour le panneau bas, panneaux latéraux à angles droits.

**Suivi.** `Dialog`, `AlertDialog`, `Sheet` → `'cursor'`.

---

## Lot 5 — Menus : Select & Combobox

```css
/* ── Lot 5 — menus ────────────────────────────────────────── */
.theme-cursor [data-slot='select-content'],
.theme-cursor [data-slot='combobox-content'] {
  border-radius: 8px;
  border-color: color-mix(in oklab, #141414 8%, transparent);
  background-color: #fcfcfc;
  padding: 4px;
  box-shadow: 0 8px 16px 0 rgba(20, 20, 20, 0.12);
}
.theme-cursor [data-slot='select-item'],
.theme-cursor [data-slot='combobox-item'] {
  min-height: 24px;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 13px;
  line-height: 18px;
  letter-spacing: -0.08px;
  color: color-mix(in oklab, #141414 74%, transparent);
}
.theme-cursor [data-slot='select-item'][data-highlighted],
.theme-cursor [data-slot='combobox-item'][data-highlighted] {
  background-color: color-mix(in oklab, #141414 8%, transparent);
  color: #141414;
}
.theme-cursor [data-slot='select-item'][data-selected],
.theme-cursor [data-slot='combobox-item'][data-selected] {
  background-color: color-mix(in oklab, #141414 16%, transparent);
  color: #141414;
}
.theme-cursor [data-slot='select-label'],
.theme-cursor [data-slot='combobox-label'] {
  padding: 4px 8px;
  font-size: 11px;
  line-height: 14px;
  font-weight: 500;
  letter-spacing: 0.07px;
  color: color-mix(in oklab, #141414 60%, transparent);
}
.theme-cursor [data-slot='select-trigger'] {
  border-radius: 6px;
  border-color: color-mix(in oklab, #141414 12%, transparent);
  background-color: #fcfcfc;
  font-size: 13px;
  letter-spacing: -0.08px;
}
```

**Attention.** Les noms d'attributs d'état de Base UI (`data-highlighted`, `data-selected`) doivent
être vérifiés dans l'inspecteur sur un menu ouvert. S'ils diffèrent, corriger le sélecteur —
**ne pas** contourner en modifiant `select.tsx`.

**Vérification.** Section 12 : ouvrir les deux Select et le Combobox. Items denses (24 px), survol
en wash 8 %, sélection en wash 16 %.

**Suivi.** `Select` → `'cursor'`, `Combobox` → `'cursor'`.

---

## Lot 6 — Switch

```css
/* ── Lot 6 — Switch ───────────────────────────────────────── */
.theme-cursor [data-slot='switch'] {
  height: 16px;
  width: 28px;
  border-width: 0;
  background-color: color-mix(in oklab, #141414 20%, transparent);
}
.theme-cursor [data-slot='switch'][data-state='checked'] {
  background-color: #141414;
}
.theme-cursor [data-slot='switch-thumb'] {
  height: 12px;
  width: 12px;
  margin-inline: 2px;
  background-color: #fcfcfc;
  box-shadow: 0 1px 2px 0 #0000001a;
}
.theme-cursor [data-slot='switch'][data-state='checked'] [data-slot='switch-thumb'] {
  transform: translateX(12px);
}
```

**Piège.** La grammaire d'origine utilise `border-2 border-transparent` pour ménager la course du
curseur. En passant `border-width: 0`, il faut compenser par le `margin-inline: 2px` du curseur —
c'est fait ci-dessus. Vérifier que le curseur ne dépasse pas du rail dans les deux états.

**Vérification.** Section 12, sous-partie « Switch » : trois interrupteurs, dont un désactivé. Le
curseur doit rester à 2 px des bords aux deux extrémités.

**Suivi.** `Switch` → `'cursor'`.

---

## Lot 7 — États : Spinner, Skeleton, LoadingState, Bubble

```css
/* ── Lot 7 — états & conversation ─────────────────────────── */
/* Le brand orange n'a pas à signaler une attente : elle est neutre. */
.theme-cursor [data-slot='spinner'] {
  color: color-mix(in oklab, #141414 60%, transparent);
}
.theme-cursor [data-slot='skeleton'],
.theme-cursor [data-slot='skeleton-card'] {
  background-color: color-mix(in oklab, #141414 6%, transparent);
  border-radius: 6px;
  animation-duration: 2s;
}
.theme-cursor [data-slot='loading-state'] {
  color: color-mix(in oklab, #141414 74%, transparent);
}
.theme-cursor [data-slot='bubble'] {
  border-radius: 12px;
  font-size: 13px;
  line-height: 18px;
  letter-spacing: -0.08px;
}
```

**Attention.** `Spinner` accepte une prop `variant="brand"` qui pose une couleur en classe
utilitaire. La règle ci-dessus la neutralise sous `.theme-cursor` ; si ce n'est pas le cas dans le
rendu, ajouter `!important` **sur la seule déclaration `color`**.

**Vérification.** Section 17 : les spinners doivent être gris neutre, plus orange. Section 18 : les
bulles passent en rayon 12.

**Suivi.** `Spinner`, `Skeleton`, `LoadingState`, `Bubble` → `'cursor'`.

---

## Lot 8 — Calendrier

```css
/* ── Lot 8 — Calendrier ───────────────────────────────────── */
.theme-cursor [data-slot='calendar'] {
  font-size: 12px;
  line-height: 16px;
}
.theme-cursor [data-slot='calendar'] button {
  border-radius: 6px;
}
.theme-cursor [data-slot='calendar'] table th {
  padding: 4px 0;
  font-size: 11px;
  line-height: 14px;
  font-weight: 400;
  color: color-mix(in oklab, #141414 60%, transparent);
}
.theme-cursor [data-slot='calendar'] table td {
  padding: 0;
}
```

**Piège.** Le skin de table du thème Cursor (`.theme-cursor table th/td`, déjà en place) s'applique
aussi au calendrier, qui est un `<table>`. Les règles ci-dessus doivent donc **venir après** dans
le fichier pour gagner — c'est le cas si on respecte le point d'insertion du §3.

**Vérification.** Section 13 : la grille du calendrier doit se resserrer sans que les jours se
chevauchent. Les dates restent en jj/mm/aaaa sous le calendrier.

**Suivi.** `Calendar` → `'cursor'`.

---

## Lot 9 — Champs de saisie ⚠ décale la mise en page

**Avertissement.** Ce lot fait passer les champs de **56 px à 28 px**. Toutes les pages qui
contiennent un formulaire ou une barre de filtres vont changer d'aspect. C'est attendu. Prévoir
une relecture visuelle des pages `/approvisionnements`, `/receptions`, `/expeditions` et
`/conditionnements` après ce lot.

```css
/* ── Lot 9 — champs de saisie ─────────────────────────────── */
.theme-cursor [data-slot='input'],
.theme-cursor [data-slot='sidebar-input'] {
  height: 28px;
  border-radius: 6px;
  border-width: 1px;
  border-color: color-mix(in oklab, #141414 12%, transparent);
  background-color: #fcfcfc;
  padding: 0 8px;
  font-size: 13px;
  line-height: 18px;
  letter-spacing: -0.08px;
  transition: border-color 100ms ease;
}
.theme-cursor [data-slot='textarea'] {
  min-height: 64px;
  border-radius: 6px;
  border-color: color-mix(in oklab, #141414 12%, transparent);
  background-color: #fcfcfc;
  padding: 6px 8px;
  font-size: 13px;
  line-height: 18px;
  letter-spacing: -0.08px;
}
.theme-cursor [data-slot='input']:hover,
.theme-cursor [data-slot='textarea']:hover {
  border-color: color-mix(in oklab, #141414 20%, transparent);
}
.theme-cursor [data-slot='input']:focus-visible,
.theme-cursor [data-slot='textarea']:focus-visible {
  border-width: 1px;
  border-color: #2778c1;
  box-shadow: 0 0 0 3px color-mix(in oklab, #2778c1 15%, transparent); /* --border-focus */
}
.theme-cursor [data-slot='input'][aria-invalid='true'],
.theme-cursor [data-slot='textarea'][aria-invalid='true'] {
  border-width: 1px;
  border-color: #be1744;
  box-shadow: 0 0 0 3px color-mix(in oklab, #be1744 20%, transparent);
}
.theme-cursor [data-slot='label'],
.theme-cursor [data-slot='field-label'],
.theme-cursor [data-slot='text-field-label'] {
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: #141414;
}
.theme-cursor [data-slot='field-description'] {
  font-size: 12px;
  line-height: 16px;
  color: color-mix(in oklab, #141414 60%, transparent);
}
.theme-cursor [data-slot='field-error'] {
  font-size: 12px;
  line-height: 16px;
  color: #be1744;
}
.theme-cursor [data-slot='field-legend'] {
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  letter-spacing: -0.08px;
  color: #141414;
}
.theme-cursor [data-slot='input-group'] {
  border-radius: 6px;
  border-color: color-mix(in oklab, #141414 12%, transparent);
  background-color: #fcfcfc;
}
.theme-cursor [data-slot='input-group'] [data-slot='input'] {
  height: 26px;
  border: 0;
  box-shadow: none;
  background-color: transparent;
}
```

**Piège 1.** `Input` porte `focus-visible:border-2` dans sa grammaire d'origine : la bordure passe
à 2 px au focus, ce qui décale le contenu d'un pixel. Le `border-width: 1px` sur la règle de focus
ci-dessus l'annule — ne pas l'oublier.

**Piège 2.** `TextField` compose `Input` : il hérite automatiquement. Ne pas écrire de règle
séparée pour lui.

**Vérification.** Section 12 dans son entier. Puis ouvrir une vraie page de formulaire et vérifier
qu'aucun champ ne déborde de son conteneur.

**Suivi.** `Input`, `Textarea`, `TextField`, `Field`, `InputGroup` → `'cursor'`.

---

## Lot 10 — Boutons ⚠ décale la mise en page

**Avertissement.** Le bouton par défaut passe de **48 px à 28 px**. C'est le changement le plus
visible de toute la migration : il touche chaque page de l'application. Ne l'entreprendre que
lorsque les lots 0 à 9 sont verts.

```css
/* ── Lot 10 — boutons ─────────────────────────────────────── */
.theme-cursor [data-slot='button'] {
  border-radius: 6px;
  border-color: transparent;
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  letter-spacing: -0.08px;
  gap: 6px;
  transition:
    background-color 100ms ease,
    color 100ms ease;
}
/* Cursor ne fait pas rebondir ses boutons. */
.theme-cursor [data-slot='button']:active {
  transform: none;
  scale: 1;
}

/* Hauteurs — cible produit : xs 20 · sm 24 · default 28 · lg 32 */
.theme-cursor [data-slot='button'][data-size='xs'] {
  height: 20px;
  padding-inline: 8px;
}
.theme-cursor [data-slot='button'][data-size='sm'] {
  height: 24px;
  padding-inline: 10px;
}
.theme-cursor [data-slot='button'][data-size='default'] {
  height: 28px;
  padding-inline: 12px;
}
.theme-cursor [data-slot='button'][data-size='lg'] {
  height: 32px;
  padding-inline: 14px;
}
.theme-cursor [data-slot='button'][data-size='icon-xs'] {
  height: 20px;
  width: 20px;
  padding: 0;
}
.theme-cursor [data-slot='button'][data-size='icon-sm'] {
  height: 24px;
  width: 24px;
  padding: 0;
}
.theme-cursor [data-slot='button'][data-size='icon'] {
  height: 28px;
  width: 28px;
  padding: 0;
}
.theme-cursor [data-slot='button'][data-size='icon-lg'] {
  height: 32px;
  width: 32px;
  padding: 0;
}
.theme-cursor [data-slot='button'] svg:not([class*='size-']) {
  height: 14px;
  width: 14px;
}

/* Variantes */
.theme-cursor [data-slot='button'][data-variant='default'] {
  background-color: #141414; /* --cursor-button-background */
  color: #fcfcfc; /* --cursor-button-foreground */
}
.theme-cursor [data-slot='button'][data-variant='default']:hover {
  background-color: color-mix(in oklab, #f8f8f8 10%, #141414);
}
.theme-cursor [data-slot='button'][data-variant='secondary'] {
  background-color: color-mix(in oklab, #141414 8%, transparent);
  color: #141414;
}
.theme-cursor [data-slot='button'][data-variant='secondary']:hover {
  background-color: color-mix(in oklab, #141414 12%, transparent);
}
.theme-cursor [data-slot='button'][data-variant='outline'] {
  background-color: #fcfcfc;
  color: #141414;
  box-shadow: 0 0 0 1px color-mix(in oklab, #141414 12%, transparent);
}
.theme-cursor [data-slot='button'][data-variant='outline']:hover {
  background-color: color-mix(in oklab, #141414 6%, transparent);
}
.theme-cursor [data-slot='button'][data-variant='ghost'] {
  background-color: transparent;
  color: color-mix(in oklab, #141414 74%, transparent);
}
.theme-cursor [data-slot='button'][data-variant='ghost']:hover {
  background-color: color-mix(in oklab, #141414 8%, transparent);
  color: #141414;
}
.theme-cursor [data-slot='button'][data-variant='link'] {
  color: #2778c1;
  padding-inline: 0;
  height: auto;
}
```

**Départ documenté par rapport à l'extrait produit.** DESIGN.md §8 donne
`--cursor-button-secondary-hover-background` à `mix 6 %`, soit **plus clair** que l'état de repos
(`8 %`). Sur un chrome clair, un survol qui éclaircit se lit comme un état désactivé. On prend donc
`12 %`. C'est le seul écart assumé de tout ce plan — ne pas le « corriger » vers 6 % sans en
discuter.

**Piège.** `variant="destructive"` est délibérément absent des règles ci-dessus : son traitement
lavé (fond rouge 10 %, texte rouge) est déjà conforme à la grammaire Cursor. Ne pas le remplir en
rouge plein.

**Vérification.** Section 10 dans son entier, puis le tableau « Écart de densité » — une fois le lot
passé, **mettre ce tableau à jour** dans `primitives.tsx` (constante `BUTTON_SIZES`) : la colonne
« Actuel » doit devenir égale à la colonne « Cible », et l'écart tomber à 0. Puis parcourir
`/`, `/programme` et `/charge` pour repérer les barres d'outils qui auraient besoin d'un
réalignement.

**Suivi.** `Button` → `'cursor'`.

---

## Lot 11 — Toolbar & SearchBar

**Objectif.** Ces deux composants sont les plus marqués par la grammaire d'origine : rayon plein,
64 px de haut, ombre au repos. Le lot les ramène à la densité produit.

```css
/* ── Lot 11 — barres d'outils & recherche ─────────────────── */
.theme-cursor [data-slot='toolbar-segmented'] {
  border-radius: 6px;
  border-color: color-mix(in oklab, #141414 12%, transparent);
  background-color: #fcfcfc;
  padding: 2px;
}
.theme-cursor [data-slot='toolbar-segment'] {
  height: 22px;
  border-radius: 4px;
  padding-inline: 10px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: -0.08px;
}
.theme-cursor [data-slot='toolbar-segment'][data-active='true'] {
  background-color: color-mix(in oklab, #141414 16%, transparent);
  color: #141414;
}
.theme-cursor [data-slot='toolbar-search'] {
  height: 28px;
  border-radius: 6px;
  border-color: color-mix(in oklab, #141414 12%, transparent);
  background-color: #fcfcfc;
}
.theme-cursor [data-slot='toolbar-search'] input {
  font-size: 13px;
  font-weight: 400;
  letter-spacing: -0.08px;
}
.theme-cursor [data-slot='search-bar'] {
  height: 36px;
  border-radius: 6px;
  border-color: color-mix(in oklab, #141414 12%, transparent);
  background-color: #fcfcfc;
  padding-left: 12px;
  padding-right: 4px;
  box-shadow: none; /* pas d'ombre au repos */
}
.theme-cursor [data-slot='search-bar'] label > span:first-child {
  font-size: 11px;
  font-weight: 500;
  color: color-mix(in oklab, #141414 60%, transparent);
}
```

**Attention.** `ToolbarSegment` n'expose peut-être pas `data-active`. Vérifier dans
`inertia-react/components/ui/toolbar.tsx` : si l'attribut n'existe pas, l'ajouter comme au **lot 0**
(`data-active={active ? 'true' : undefined}`), dans un commit séparé étiqueté « crochet ».

**Vérification.** Section 16 (Navigation), sous-partie « Toolbar », et section 12, sous-partie
« SearchBar ». La barre de recherche segmentée doit tenir sur 36 px et ne plus porter d'ombre.

**Suivi.** `Toolbar` → `'cursor'`, `SearchBar` → `'cursor'`.

---

## 5. Fin de migration

La migration est terminée quand, sur `/design-system` section 23, les compteurs affichent
**28 / 28 en « Cursor »** et que la colonne « Ce qui reste » ne contient plus que des `—`.

Trois choses restent alors hors de ce plan, et doivent faire l'objet de chantiers distincts :

1. **`BoardCard`** — refonte de composant, pas retarget de thème. La bande « Listing » et le liseré
   de 3 px sont des choix de composition à rejouer, pas des valeurs à remplacer.
2. **`X3Link`** — le survol passe de `brand` à `accent` : une ligne, mais qui touche la sémantique
   du lien. À traiter avec la question « le brand a-t-il encore un rôle d'interaction ? ».
3. **Nettoyage** — une fois les 28 composants passés, les tokens Airbnb résiduels de `app.css`
   (`--color-rausch*`, `--color-babu`, `--color-arches`, `--color-hof`, `--color-foggy`) peuvent
   être retirés du bloc `.theme-cursor`, où ils ne servent plus que de repli. **Pas avant** : ils
   sont encore lus par des composants non migrés.

---

## 6. Aide-mémoire des valeurs

Extrait de DESIGN.md, pour éviter d'y retourner à chaque lot.

| Rôle                                                  | Valeur                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Surface sidebar / chrome / élevée                     | `#f3f3f3` / `#f8f8f8` / `#fcfcfc`                                        |
| Encre primaire / secondaire / tertiaire / quaternaire | `#141414` / mix 74 % / mix 60 % / mix 36 %                               |
| Filet quaternary / tertiary / secondary / primary     | mix 4 % / 8 % / 12 % / 20 %                                              |
| Wash survol / actif                                   | mix 8 % / mix 16 %                                                       |
| Accent, focus                                         | `#2778c1` — halo de focus mix 15 %                                       |
| Succès / alerte / danger                              | `#007041` / `#a46700` / `#be1744`                                        |
| Marque (rare)                                         | `#f54e00`                                                                |
| Rayon contrôle / surface / menu                       | 6 px / 12 px / 8 px                                                      |
| Hauteurs xs / sm / base / lg                          | 20 / 24 / 28 / 32 px                                                     |
| Texte de base                                         | 13 px / 18 px / −0,08 px                                                 |
| Petit texte                                           | 12 px / 16 px / 0 px                                                     |
| Micro-texte                                           | 11 px / 14 px / +0,07 px                                                 |
| Graisses                                              | 418 (normal) · 500 (emphase)                                             |
| Durées                                                | 50 / 100 / 150 / 200 / 300 ms                                            |
| Ombre popup                                           | `0 8px 16px 0 rgba(20, 20, 20, 0.12)`                                    |
| Ombre dialog                                          | `0 0 0 1px mix(#141414 8%), 0 0 2px 0 #0000000f, 0 6px 16px 0 #0000000f` |

Toute valeur absente de ce tableau se cherche dans [`DESIGN.md`](DESIGN.md) — **jamais**
inventée.
