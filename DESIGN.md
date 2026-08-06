---
name: Supply Chain Board
description: Pilotage de la chaîne d'approvisionnement — grammaire Airbnb, sobre et affirmée
colors:
  rausch: '#ff385c'
  rausch-active: '#e00b41'
  rausch-soft: 'rgba(255, 56, 92, 0.10)'
  ink: '#222222'
  body: '#3f3f3f'
  muted: '#6a6a6a'
  muted-soft: '#929292'
  canvas: '#ffffff'
  surface-soft: '#f7f7f7'
  surface-strong: '#f2f2f2'
  hairline: '#dddddd'
  hairline-soft: '#ebebeb'
  border-strong: '#c1c1c1'
  ferme: '#008049'
  planifie: '#00a699'
  suggere: '#fc642d'
  danger: '#c13515'
typography:
  display:
    fontFamily: "'Plus Jakarta Sans Variable', -apple-system, system-ui, 'Helvetica Neue', sans-serif"
    fontWeight: 800
    lineHeight: 1
  headline:
    fontFamily: "'Plus Jakarta Sans Variable', -apple-system, system-ui, 'Helvetica Neue', sans-serif"
    fontSize: 20px
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: "'Plus Jakarta Sans Variable', -apple-system, system-ui, 'Helvetica Neue', sans-serif"
    fontSize: 16px
    fontWeight: 700
  body:
    fontFamily: "'Plus Jakarta Sans Variable', -apple-system, system-ui, 'Helvetica Neue', sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "'Plus Jakarta Sans Variable', system-ui, sans-serif"
    fontSize: 10px
    fontWeight: 600
    letterSpacing: 0.08em
  data:
    fontFamily: "'Plus Jakarta Sans Variable', system-ui, sans-serif"
    fontSize: 12px
    fontFeature: "'tnum' 1"
rounded:
  btn: 8px
  card: 14px
  pill: 32px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: '{colors.rausch}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.btn}'
    height: 48px
    padding: '0 24px'
  button-primary-hover:
    backgroundColor: '{colors.rausch-active}'
  button-secondary:
    backgroundColor: '{colors.surface-soft}'
    textColor: '{colors.ink}'
    rounded: '{rounded.btn}'
    height: 40px
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.btn}'
    height: 36px
  input:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    rounded: '{rounded.btn}'
    height: 40px
  card:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
---

# Design System: Supply Chain Board

## Overview

**Creative North Star: "Le Signal Unique"**

Le Supply Chain Board est une régie d'ordonnancement : une surface blanche, calme, où un seul signal recharge en rouge. La grammaire Airbnb — canvas blanc pur, encre `#222222`, hairlines — fournit le silence ; Rausch `#ff385c` fournit l'intensité, et il est réservé aux actions et aux signaux. Tout le reste est discret par design : la donnée respire sur le blanc, les statuts métier gardent des teintes sémantiques stables, et l'élévation ne réagit qu'au geste.

C'est un outil d'atelier qui ne crie pas. La densité est assumée — échelles micro (8–13 px) pour les tableaux, chiffres en tabular-nums alignés au pixel — mais la respiration vient du blanc et des filets, pas des ombres ni des couleurs. Sobre et affirmé : chaque élément sait ce qu'il est, rien ne se pousse du coude.

Anti-références confirmées : pas de serif d'affichage (Fraunces neutralisé), pas de dark mode, pas de tiers d'ombres progressifs, pas de couleurs de statut détournées en accents décoratifs.

**Key Characteristics:**

- Un seul voltage de marque : Rausch `#ff385c`, réservé aux actions et aux signaux.
- Canvas blanc pur, encre `#222222` (jamais de noir pur), hairline `#dddddd`.
- Une seule ombre par contexte : `float` pour les popups, `overlay` pour les fenêtres.
- Données en Plus Jakarta Sans + tabular-nums partout où les chiffres comptent.
- Dense mais calme : tableaux micro-serif, respiration par le blanc.

## Colors

Palette froide et neutre, un seul accent chaud (Rausch), et un jeu de statuts métier qui ne varie jamais.

### Primary

- **Rausch** (`#ff385c`) : le seul accent de marque. CTA primaires, sélection, signaux d'attention. Voltage unique du système.
- **Rausch Active** (`#e00b41`) : hover/pression des CTA Rausch.
- **Rausch Soft** (`rgba(255, 56, 92, 0.10)`) : fonds de sélection, pastilles discrètes, badges signal.

### Neutral

- **Ink** (`#222222`) : texte principal et ring de focus — jamais de noir pur.
- **Body** (`#3f3f3f`) : texte courant secondaire.
- **Muted** (`#6a6a6a`) : texte tertiaire, métadonnées.
- **Muted Soft** (`#929292`) : texte discret (placeholders, timestamps).
- **Canvas** (`#ffffff`) : fond de page et des cartes.
- **Surface Soft** (`#f7f7f7`) : fonds de sections, boutons secondaires.
- **Surface Strong** (`#f2f2f2`) : fonds d'inputs, zones de contraste léger.
- **Hairline** (`#dddddd`) : bordures et filets structurants.
- **Hairline Soft** (`#ebebeb`) : filets de division doux.
- **Border Strong** (`#c1c1c1`) : bordures d'inputs.

### Statuts métier (sémantiques, non décoratifs)

- **Ferme** (`#008049`) : commande/OF ferme — vert sage.
- **Planifié** (`#00a699`) : statut planifié — teal Babu.
- **Suggéré** (`#fc642d`) : statut suggéré / alerte chaude — orange Arches.
- **Danger** (`#c13515`) : erreurs, ruptures, destinations sortant du papier.

### Named Rules

**La Règle du Voltage Unique.** Rausch est la seule couleur d'accent, et sa rareté est le point : sur un écran donné, il couvre une petite fraction de la surface. Les statuts (ferme/planifié/suggéré) ne sont pas des accents — ils codent du sens métier et gardent leurs teintes partout, test comme prod.

## Typography

**Display/Body Font:** Plus Jakarta Sans Variable (fallback Inter, système) — substitut open-source du tempérament Cereal d'Airbnb : géométrique, légèrement rond, forte personnalité.
**Data Font:** la même face en tabular-nums (`tnum`), pas une mono séparée.

**Character:** une seule voix sans serif, du héros au micro-label. Aucun serif d'affichage : Fraunces est neutralisé sous le runtime React. La donnée s'aligne par les chiffres tabulaires, pas par une police à chasse fixe.

### Hierarchy

- **Display** (800, 56 px, 1) : chiffres héros du dashboard (KPI), titres de page monumentaux.
- **Headline** (800, 20 px, 1.2) : titres de page.
- **Title** (700, 16 px) : titres de cartes et de sections.
- **Body** (400, 14 px, 1.43) : texte courant — la base du système.
- **Label** (600, 10 px, +8 % de tracking, uppercase) : badges, en-têtes de colonnes, verdicts.
- **Data** (400, 12 px, `tnum`) : numéros OF, dates, quantités — alignement tabulaire.

### Named Rules

**La Règle du Chiffre Tabulaire.** Toute donnée numérique — numéros OF, dates, quantités, charges — passe en tabular-nums, les colonnes s'alignent au pixel. Jamais de serif pour les chiffres d'affichage.

## Layout

Le board est une grille de plan : **une rangée par poste, semaines à l'horizontale** (B1 Quotidien) — le temps coule horizontalement, jamais verticalement, pour ne pas faire défiler les postes. Grille calendaire pondérée par la capacité (WORKSTATIO × TABWEEDIA), saturation en overlay.

Densité assumée : les tableaux vivent dans l'échelle micro (8–13 px), les marges de section dans le rythme 4/8/16/24/32. Conteneurs plein écran avec scroll vertical ; les breakpoints Tailwind standard servant de référence (sm 640 / md 768 / lg 1024 / xl 1280). L'impression A3 paysage est un artefact de la même grammaire (data-print-*, déclippage, fonds opt-in).

## Elevation & Depth

Système **plat par défaut** : la profondeur vient du contraste des surfaces (canvas → surface-soft → surface-strong) et des hairlines, pas des ombres. Les ombres ne répondent qu'à l'état : hover, ou apparition d'un overlay. Pas de dark mode — le système est light-only, et ses ombres sont calibrées sur le blanc.

### Shadow Vocabulary

- **Float** (`0 6px 20px rgb(0 0 0 / 0.16)`) : menus, popups, popovers — le « hover float » des cartes et contrôles dépliés.
- **Overlay** (`0 18px 50px rgb(0 0 0 / 0.24)`) : sheets, dialogs — la seule élévation hors page.

### Named Rules

**La Règle du Tier Unique.** Deux ombres, pas plus : un float pour les popups, un overlay pour les fenêtres. Ne pas créer de troisième niveau d'ombre globale.

## Shapes

Forme douce et contrôlée : **8 px** pour les boutons et inputs, **14 px** pour les cartes et dialogs, **32 px** pour les pills, **9999 px** pour le plein. Les rayons dérivés (sm/md/lg/xl/2xl/3xl/4xl) sont calculés depuis le token `--radius: 0.875rem` (14 px). Les filets (hairline 1 px) structurent ; les bordures lourdes sont exclues. Le ring de focus est l'**encre 2 px**, jamais le brand.

## Components

### Buttons

- **Shape :** 8 px de rayon.
- **Primary :** fond Rausch, texte blanc, hauteur 48 px, padding 0 24 px. Hover : Rausch Active. Focus : ring encre 2 px.
- **Secondary :** fond Surface Soft, texte Ink, hauteur 40 px.
- **Ghost :** transparent, texte Ink, hauteur 36 px.

### Chips / Badges

- **Style :** mono 10 px uppercase, pastille de couleur (point), pas de boîte boxy. Verdicts en petites capitales + point.
- **Statuts :** point Ferme / Planifié / Suggéré — les teintes métier ne varient jamais.

### Cards / Containers

- **Corner Style :** 14 px.
- **Background :** canvas blanc.
- **Border :** hairline 1 px.
- **Shadow Strategy :** plate au repos, float au hover (référence Elevation).
- **Internal Padding :** 16–24 px.

### Inputs / Fields

- **Style :** fond blanc, bordure Border Strong, rayon 8 px, hauteur 40 px.
- **Focus :** ring encre 2 px (pas brand).
- **Error :** couleur Danger pour les messages, bordure danger.

### Navigation (Masthead)

- **Style :** barre blanche, hairline basse 1 px, wordmark 19 px/800. Liens encre, état actif net (fond Surface Soft ou encre pleine), identité de l'environnement test via `data-env` (déclinaison violette, jamais confondue avec la prod).

### Carte OF (composant signature)

- La carte du board : fond blanc, hairline, numéro OF en mono/tnum, statut par point coloré + texte, quantités tabulaires. Pas de bord gauche coloré — le statut vit dans la pastille, pas dans une barre.

### Feuille appro (composant signature)

- La feuille de préparation fournisseur (`/approvisionnements`) : document blanc posé sur champ surface-soft, hairline, coin 14 px, plat au repos. En-tête : nom fournisseur (Title), code + compteurs en métadonnées, bloc « Première échéance » (Label + donnée tnum), chip d'urgence. Sections « À commander » / « À replanifier » en petites capitales + compteur de lignes. Chaque ligne : verdict en pastille + petites capitales, preuve sourcée tronquée, micro-décisions Vu / Ignorer / À passer en encre pleine — Rausch reste hors de la maille ligne. Pied « Décisions x/y enregistrées ». Un dossier entièrement décidé quitte la pile et descend dans l'index repliable « Dossiers traités » : la file se vide à vue.

## Do's and Don'ts

### Do:

- **Do** réserver Rausch aux actions et signaux — ≤ 10 % de la surface d'un écran.
- **Do** passer les chiffres en tabular-nums (OF, dates, quantités, charges).
- **Do** une seule ombre par contexte : float (popups) ou overlay (fenêtres).
- **Do** les rayons de l'échelle : 8 boutons / 14 cartes / 32 pills / 9999 plein.
- **Do** laisser le blanc structurer : les hairlines suffisent, pas de bordures lourdes.

### Don't:

- **Don't** de serif d'affichage — Fraunces est neutralisé sous le runtime React.
- **Don't** de dark mode — le système est light-only.
- **Don't** de troisième niveau d'ombre globale.
- **Don't** de couleurs de statut (ferme/planifié/suggéré) détournées en accents décoratifs.
- **Don't** de noir pur — l'encre est `#222222`.
