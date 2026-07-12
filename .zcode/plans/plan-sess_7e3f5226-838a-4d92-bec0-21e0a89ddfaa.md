# Programme v2 — Phases 1-2 : Santé du plan + Rail de triage

## Objectif

Transformer `/programme` d'un « tableau à scanner » en « cockpit de triage » : les problèmes viennent au planificateur, triés par gravité × proximité. Le board reste l'outil d'action.

## Phase 1 — Santé du plan + segment Liens

### 1a. Nouveaux memos de santé (programme.tsx)

Aujourd'hui seul `nbCmdRetard` existe (programme.tsx:349). On ajoute :

- `nbCmdLimite` — count de `verdictByCmd` filtré `=== 'limite'` (pattern identique à nbCmdRetard)
- `nbCmdSansLien` — commandes de `props.commandes` dont l'id n'est PAS clé dans `verdictByCmd()` OU dont le verdict est `null` (non évalué)
- `nbOfSansLien` — OF du board dont l'id n'est pas dans `linksByOf()` (client-dérivable, pas de backend)

Les ruptures restent **opt-in** (badge « — » tant que la faisabilité n'a pas tourné). On ne fake pas un compte qu'on n'a pas.

### 1b. Composant `<PlanHealth>` (nouveau, `components/vision/plan-health.tsx`)

4 badges toujours rendus (zéro CLS), alignés à droite du contexte-row :

- `✓ 0 retard` (vert, okz) / `3 retards` (rouge, crit, cliquable → filtre rail)
- `2 limites` (ambre, warn) / `✓ 0 limite` (vert)
- `Ruptures ?` (neutre, point d'entrée → lance faisabilité) OU `1 rupture` (rouge) si feasibility a tourné
- `4 sans lien` (neutre, mut) — l'inconnu devient info de premier ordre

Clic sur un badge = ouvre le rail filtré sur cette catégorie. `disabled` quand le compte est 0 (mais le badge reste visible).

### 1c. Segment « Liens : Aucun / Problèmes / Tous »

Remplace le toggle `highlightRetards: boolean` par `linkMode: Accessor<'none' | 'problems' | 'all'>`.

- **Aucun** → tous liens masqués (sauf survol)
- **Problèmes** (défaut) → retard 0.6 + limite 0.3, ok masqué
- **Tous** → retard 0.6 + limite 0.3 + ok 0.25

Migration : `highlightRetards` signal → `linkMode` signal (init `'problems'`). Le `LinksOverlay` prop change de `highlightRetards` à `linkMode`. La logique `baseOpacity` dans links-overlay.tsx est réécrite sur 3 états.

Le compteur retards actuel (programme-toolbar.tsx:182-209) est **remplacé** par le segment Liens + les badges santé (déplacés dans le contexte-row). La toolbar garde mode/fenêtre/actualiser/scénario.

### 1d. Layout : 2 rangées fixes

Le contexte-row devient une 2e rangée fixe (40px) sous la commande-row (toolbar). Structure :

```
[toolbar: mode | fenêtre | actualiser ... recherche | scénario]   ← 48px fixe
[contexte: filtres mode courant | segment Liens | <PlanHealth> | Rail T]  ← 40px fixe
[board ...]
```

## Phase 2 — Rail de triage « À traiter »

### 2a. Composant `<TriageRail>` (nouveau, `components/vision/triage-rail.tsx`)

Colonne `flex-none w-[300px]` à droite du board (layout `[board flex-1][rail flex-none]`).

**Structure :**

- **Header** : « À traiter » + count + tri (Gravité ▾) + bouton fermer (✕)
- **Onglets** : Retards N · Limites N · Ruptures N · Sans lien N (les memes counts que PlanHealth)
- **Liste** : items triés par gravité (retard > limite > sans-lien) × proximité (delta croissant)

**Item de triage** (par commande) :

```
● AR24518·L2                              +3 j
  VENTILAIR SAS · besoin mer. 8 juil. · OF00318 finit sam. 11
  [Voir sur le board] [Détail OF] [Simuler ▸]
```

- Dot coloré par verdict (rouge/ambre/gris)
- Identifiant mono + delta badge
- Ligne 2 : client + date besoin + ofId + date fin
- Actions : « Voir sur le board » (scroll + highlight lien), « Détail OF » (ouvre OfDetailSheet), « Simuler ▸ » (ouvre scénario avec OF pré-sélectionné, mode Combiné)

**Tri** : `severityRank` (retard=2, limite=1, sans-lien=0) puis `delta` (croissant — le plus proche du besoin d'abord).

**Données** : tout vient de `verdictByCmd()` + `props.commandes` + `props.links` — **pas de backend change**. Join commande → ofId via `props.links.filter(l => l.commandeId === cmd.id)`.

### 2b. Interaction rail ↔ board

- Sélection d'un item → `setActiveId(cmd.id)` (le lien s'allume sur le board, comme le hover) + scroll vers l'OF (`scrollIntoView` sur `[data-num-of="${ofId}"]`)
- Le rail est repliable (`T` raccourci clavier, bouton dans le contexte-row)
- État mémorisé : ouvert/fermé + onglet actif (`sessionStorage`)

### 2c. État réactif

Le rail se met à jour en temps réel pendant le drag (les verdicts sont des memos réactifs via `ofShift`/`cmdBesoinOverride`). Un OF déplacé qui résout un retard → l'item disparaît du rail instantanément. C'est le feedback visuel le plus fort du cockpit.

## Fichiers touchés

| Fichier                                   | Changement                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `programme.tsx`                           | Memos santé (nbCmdLimite, nbCmdSansLien), signal linkMode + railOpen, layout 2 rangées + colonne rail |
| `components/vision/plan-health.tsx`       | **Nouveau** — 4 badges santé                                                                          |
| `components/vision/triage-rail.tsx`       | **Nouveau** — rail de triage                                                                          |
| `components/vision/links-overlay.tsx`     | prop `highlightRetards` → `linkMode`, baseOpacity 3 états                                             |
| `components/vision/programme-toolbar.tsx` | Retrait compteur retards + highlight toggle (→ déplacé vers PlanHealth + segment Liens)               |

## Décisions de scope (reporté)

- **Carte OF v2** (4 canaux, delta dans le corps, 1 coin max) → phase 3
- **Marqueur drapeau** (forme ≠ carte) → phase 4
- **En-tête poste compact** (Détails repliable) → phase 5
- **Status bar** (cache, raccourcis) → phase 5
- **Sans-lien commandes côté backend** (backend filtre actuellement) → la phase 1 compte les sans-lien OF + les verdicts null ; un backend change pour les commandes sans-lien suivra si la valeur est là

## Vérifications

- `npm run typecheck` après chaque phase
- Test visuel : les 3 modes (OF / Combiné / Cmdes), le rail en Combiné, les badges santé
- Le rail ne s'affiche qu'en mode Combiné (les liens n'existent que là)
- `vision-impact.test.ts` doit rester vert (pas de changement au moteur)
