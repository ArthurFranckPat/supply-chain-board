# PRD — Issue #23 : couche d'impact sur `/programme` (OF en retard / mise à dispo pénalisée)

_Rédigé le 2026-07-09 — état du repo : branche `feat/inertia-solid`, HEAD `faacf15`._

## 1. Résumé

`/programme` (ex-`/vision`) montre déjà le **lien** OF ↔ commande (issue #21) mais pas sa
**conséquence** : rien ne signale qu'un OF finit après la date de besoin de sa commande, ni
qu'un drag (OF ou commande) vient de créer / résorber un retard. Cette feature ajoute une
**couche d'impact** : verdict par lien (à l'heure / limite / en retard), états visuels sur
liens + marqueurs + cartes, écart chiffré (« +N j »), et recalcul **live pendant le drag**,
avant toute persistance serveur.

On **signale**, on ne corrige pas : pas d'auto-replanification, pas de recalcul de
faisabilité composant (couvert ailleurs), pas de modification du moteur CBN/MRP.

## 2. État du repo (2026-07-09) — ce qui a changé depuis la rédaction de l'issue

L'issue référence `inertia/pages/scheduler/vision.tsx` ; la page a été **renommée et
restructurée** depuis :

| Issue #23 (rédaction)                | Repo actuel                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page `/vision`, fichier `vision.tsx` | Page **`/programme`**, `inertia/pages/scheduler/programme.tsx` (shell, ~550 l. après refacto SOLID #52)                                                                              |
| —                                    | 3 modes **client-side** : `combined` / `ordonnancement` / `planification` (toggle sans round-trip, URL via `replaceState`)                                                           |
| Overlay SVG des liens                | Extrait dans `inertia/components/vision/links-overlay.tsx` + géométrie pure `inertia/lib/vision/link-overlay.ts`                                                                     |
| Marqueurs commande                   | Extraits dans `inertia/components/vision/commande-marker.tsx`, posés via slot `cellExtra` de `<BoardGrid>`                                                                           |
| Drag OF (`store.moveCard`)           | En place — optimiste + rollback, PATCH `planning_board.update` (`workstation`, `dateDebut`)                                                                                          |
| Drag commande (`cmdMoved`)           | En place — optimiste, PATCH `order_planning.update` (`dateLivraison`), remesure overlay au drop                                                                                      |
| `loadOrderImpacts` avec overrides    | En place (presets nommés, transforms purs — commit `09b85a1`) ; `evaluateOrderImpacts` calcule déjà `joursRetard`, `statut`, `ofs[].dateFin` **avec overrides** (`effectiveDateFin`) |
| —                                    | Payload `/programme` en cache **global** SWR 2 min (`loadProgrammeData`, issue #33/#39)                                                                                              |

### Ce qui manque (les gaps que cette feature comble)

1. **`VisionLink` ne transporte aucune date** — seulement des index de colonnes
   (`ofCol`, `cmdCol`) + `suggere` (`app/controllers/scheduler_controller.ts:98`,
   `inertia/lib/vision/types.ts:53`). Le client ne peut calculer aucun écart.
2. **Aucun état d'alerte visuel** : liens tous couleur `--color-terra`, marqueurs
   commande neutres, cartes OF sans badge retard. Les liens sont même **masqués par
   défaut** (visibles au survol seulement, `links-overlay.tsx`) → un retard présent à
   l'ouverture est invisible, en contradiction directe avec le cas 1 de l'issue.
3. **Pas de recalcul live au drag** : `cmdMoved` déplace le marqueur, `moveCard`
   déplace la carte, mais rien ne réévalue l'écart pendant/après le geste.
4. **Le drag OF ne translate pas la date de fin** : `moveCard` n'envoie que
   `dateDebut` au PATCH, or le verdict d'impact serveur (`effectiveDateFin`,
   `app/domain/order-impacts.ts:110`) lit `override.dateFin`. Un OF déplacé garde donc
   son ancienne date de fin aux yeux du calcul d'impact → verdict serveur faux après
   drag. À corriger dans cette feature (voir §5.4).

### Dette annexe repérée (hors périmètre, à traiter à part)

- `start/routes.ts:92` : `/planification` redirige vers `/vision?mode=planification`,
  route qui n'existe plus → redirection morte (devrait pointer `/programme?mode=planification`).

## 3. Objectifs / non-buts

### Objectifs

- **G1** — À l'ouverture, tout lien OF→commande dont la date de fin OF dépasse la date de
  besoin est signalé sans interaction (lien visible + états d'alerte).
- **G2** — Pendant un drag d'OF, le verdict se met à jour en continu (la cible se colore,
  tooltip « dispo le X au lieu du Y »).
- **G3** — Le déplacement d'une date de commande met à jour l'état des OF rattachés.
- **G4** — L'écart est chiffré partout (« +N j ») et le verdict distingue 3 états :
  `ok` / `limite` / `retard`.
- **G5** — Le verdict initial (serveur) tient compte des overrides en cours
  (`OfOverride` date/poste, `OrderLineOverride` date livraison) — déjà garanti par
  `evaluateOrderImpacts`, il suffit de transporter son résultat.

### Non-buts

- Pas d'auto-replanification (arbitrage humain).
- Pas de faisabilité composant ici (badges faisabilité existants inchangés).
- Pas de modification du moteur CBN/MRP ni du matcher (`CommandeOFMatcher`).
- Pas de calcul en jours **ouvrés** en v1 : jours calendaires, cohérent avec
  `joursRetard` serveur (`Math.round(Δms / 86400000)`).

## 4. Spécification fonctionnelle

### 4.1 Verdict par lien

Pour chaque lien OF ↔ ligne de commande :

```
delta = dateFinOf − dateBesoinCommande   (jours calendaires)
```

| Verdict  | Condition                 | Rendu                                                                                         |
| -------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `retard` | `delta > 0`               | Lien rouge (`--color-error`) **visible d'emblée**, marqueur + carte en alerte, badge « +N j » |
| `limite` | `−margeJours ≤ delta ≤ 0` | Lien ambre, visible au survol, badge « J−N »                                                  |
| `ok`     | `delta < −margeJours`     | Comportement actuel (lien terra, masqué hors survol)                                          |

`margeJours` : constante front `2` en v1 (pas d'UI de réglage) — extraite dans
`lib/vision/impact.ts` pour être configurable plus tard.

- `dateBesoinCommande` = date d'expédition **effective** de la ligne (override
  `OrderLineOverride` inclus — c'est déjà la date que `loadOrderImpacts` émet).
- `dateFinOf` = date de fin **effective** de l'OF (`effectiveDateFin` : override sinon date flow).
- OF `suggere` (CBN non affermi) : verdict calculé pareil, rendu pointillé conservé.

### 4.2 États visuels

- **Lien** (`links-overlay.tsx`) : couleur par verdict ; les liens `retard` ont une
  opacité de base non nulle (~0.55) même sans survol, pleine au survol. Étiquette
  « +N j » posée au milieu du path (SVG `<text>` sur fond pastille).
- **Marqueur commande** (`commande-marker.tsx`) : bordure gauche + icône passent à
  la couleur du verdict le plus grave de ses liens ; badge « +N j » à côté de la date.
- **Carte OF** : badge coin (même emplacement que badge faisabilité, sans le remplacer)
  quand l'OF est en `retard` sur au moins un lien. Transporté par une map
  `ofId → verdict` passée à `<BoardGrid>` via prop optionnelle — `/ordonnancement`
  n'est pas affecté (prop absente).
- **Toolbar** (`programme-toolbar.tsx`) : compteur « N liens en retard » (mode combiné),
  cliquable → active la mise en évidence de tous les liens en retard.

### 4.3 Feedback pendant le drag

- **Drag OF** : à chaque cellule survolée (dragover), recalcul du delta avec
  `dateFinEstimée = dateFinOf + (colCible − colOrigine)` jours (translation : la durée
  de l'OF est préservée). La cellule/le lien previsualisent le verdict ; tooltip flottant
  « Dispo estimée le 12/08 au lieu du 05/08 (+7 j) ».
- **Drag commande** : identique, `dateBesoin` provisoire = date de la cellule survolée ;
  tous les liens de la ligne recalculent.
- **Après drop** (optimiste, avant retour PATCH) : les verdicts restent recalculés
  localement ; le rollback (échec PATCH) restaure les verdicts d'origine (dérivés,
  donc automatique).

### 4.4 Cas particuliers

- Lien sans `dateFinOf` ou sans `dateBesoin` (donnée absente) → verdict `null`, rendu actuel, pas de badge.
- Plusieurs OF sur une ligne de commande → le marqueur porte le verdict **le plus grave** ;
  chaque lien garde le sien.
- Un OF alloué à plusieurs lignes → la carte porte le verdict le plus grave de ses liens.
- Commande dont la date de besoin est déjà passée (`dejaEnRetard`) → `retard` même si
  l'OF finit « à temps » vs la date théorique (aligné sur le statut serveur).

## 5. Spécification technique

### 5.1 Serveur — enrichir le payload (aucun nouveau calcul)

`loadProgrammeData` (`app/controllers/scheduler_controller.ts:184`) a déjà tout sous la
main au moment où il construit `links` : `order.dateExpedition`, `order.joursRetard`,
`order.statut`, `of.dateFin` (effectif, overrides inclus). Étendre :

```ts
interface VisionLink {
  // … existant …
  /** Date de fin effective de l'OF (override incluse), ISO — null si inconnue. */
  ofDateFinIso: string | null
  /** Date de besoin effective de la ligne (= dateExpedition), ISO — null si inconnue. */
  cmdDateBesoinIso: string | null
}
```

Le **verdict et le delta ne sont PAS émis par le serveur** : ils se dérivent des deux
dates, et le client doit de toute façon les recalculer au drag. Une seule formule, un
seul endroit (`lib/vision/impact.ts`), zéro divergence serveur/client. Miroir dans
`inertia/lib/vision/types.ts`.

Le cache SWR du payload est inchangé (les dates étaient déjà dans `OrderImpactRow`).

### 5.2 Client — module pur `lib/vision/impact.ts`

```ts
export type ImpactVerdict = 'ok' | 'limite' | 'retard'
export const MARGE_JOURS = 2

export function linkDelta(ofFinIso: string | null, besoinIso: string | null): number | null
export function verdictOf(delta: number | null): ImpactVerdict | null
/** Verdicts par lien, dates surchargées par l'état de drag en cours. */
export function computeImpacts(
  links: VisionLink[],
  ofShift: Map<string, number>, // ofId → décalage jours (drag OF, optimiste)
  cmdBesoin: Map<string, string> // commandeId → date besoin provisoire (drag cmd)
): Map<linkKey, { delta: number; verdict: ImpactVerdict }>
```

Fonctions pures → testables unitaires sans DOM (`tests/unit/vision-impact.spec.ts`).

### 5.3 Branchements UI

- `programme.tsx` : `createMemo(() => computeImpacts(props.links, ofShift(), cmdBesoinOverride()))` ;
  `cmdMoved` fournit déjà `cmdBesoinOverride` (iso) ; ajouter le signal `ofShift`
  alimenté par le drag OF (voir 5.4).
- `PathSpec` (`lib/vision/link-overlay.ts`) : + `verdict`, `deltaJours`, point médian
  pour l'étiquette.
- `links-overlay.tsx`, `commande-marker.tsx`, `programme-toolbar.tsx` : rendu (cf. §4.2).
- `<BoardGrid>` : prop optionnelle `cardVerdict?: (ofId: string) => ImpactVerdict | null`.

### 5.4 Drag OF — translater la date de fin (fix du gap n°4)

`store.moveCard` envoie aujourd'hui `{ workstation, dateDebut }`. Ajouter au PATCH la
date de fin translatée : `dateFin = ofDateFinIso + (isoCible − isoOrigine)`. Le PATCH
`planning_board.update` accepte déjà `dateFin` (`planning_board_controller.ts:28`) —
aucun changement serveur. La date de fin d'origine est lue depuis le lien
(`ofDateFinIso`) ; OF sans lien → comportement actuel (pas de `dateFin`), rien ne change
pour `/ordonnancement` (le callsite board seul ne passe pas l'info).

> Décision : translation simple (durée préservée, jours calendaires). Le recalage fin
> (jours ouvrés, capacité poste) est un non-but v1.

### 5.5 Découpage en livraisons

1. **Serveur** — dates sur `VisionLink` + miroir types front. _(petit, sans risque)_
2. **Client statique** — `impact.ts` + états visuels initiaux (liens/marqueurs/cartes,
   badges, compteur toolbar) + tests unitaires. _(cœur de la valeur — G1, G4, G5)_
3. **Client live** — recalcul pendant drag OF + drag commande, tooltip, translation
   `dateFin` dans `moveCard`. _(G2, G3 + fix gap n°4)_

Chaque étape est shippable seule ; l'étape 2 délivre déjà le cas 1 de l'issue.

## 6. Critères d'acceptation

- [ ] À l'ouverture (mode combiné), tout OF finissant après la date de besoin de sa
      commande est signalé : lien rouge visible, badge « +N j », carte + marqueur en alerte.
- [ ] Le survol conserve le comportement actuel pour les liens `ok`.
- [ ] Pendant le drag d'un OF, le verdict prévisionnel s'affiche (couleur + tooltip
      « dispo le X au lieu du Y ») avant le drop.
- [ ] Le déplacement d'une date de commande met à jour immédiatement l'état d'alerte
      des OF/liens rattachés (optimiste, avant le PATCH).
- [ ] Un drag d'OF persiste une `dateFin` translatée → le verdict serveur (reload)
      concorde avec le verdict optimiste.
- [ ] Rollback d'un PATCH échoué → les verdicts reviennent à l'état d'origine.
- [ ] Les verdicts initiaux reflètent les overrides en cours (OF déplacé hier via
      l'app = signalé selon sa date overridée, pas la date X3 brute).
- [ ] `verdict = retard` ⟺ `delta > 0` ; `limite` ⟺ `−2 ≤ delta ≤ 0` (tests unitaires
      sur `impact.ts`).
- [ ] `/ordonnancement` (BoardGrid sans la prop) : zéro changement visuel.

## 7. Questions ouvertes

- **Étiquette sur le lien** : lisibilité à valider en réel (boards denses) — repli :
  badge uniquement sur marqueur + carte, pas sur le path.
- **Compteur toolbar** : « liens en retard » ou « commandes en retard » ? (une commande
  peut avoir 2 liens en retard). Proposition : commandes.
- **`margeJours`** : 2 j calendaires par défaut — à confirmer avec l'atelier.

## 8. Références

- Issue #23 (cette feature), #21 (liens OF ↔ commande), #15/#16 (chaîne rupture → impact), #52 (refacto SOLID des fichiers touchés).
- Code : `app/controllers/scheduler_controller.ts` (`loadProgrammeData`),
  `app/domain/order-impacts.ts` (`evaluateOrderImpacts`, `effectiveDateFin`),
  `app/services/order_impacts_loader.ts`, `inertia/pages/scheduler/programme.tsx`,
  `inertia/lib/vision/{types,link-overlay,cmd-cells}.ts`,
  `inertia/components/vision/{links-overlay,commande-marker,programme-toolbar}.tsx`,
  `inertia/lib/board/store.ts` (`moveCard`).
