# Vision — Scénarios & étude d'impact sur `/programme`

_Document de vision produit, issu de la session de modélisation du 2026-07-09.
Généralise l'issue #23 (couche d'impact) — cf. `docs/prd-23-impacts-programme.md`._

## 1. La question générale

> **« Si le plan change — subi (rupture composant) ou choisi (drag, nouvelle commande) —
> qui gagne, qui perd, sur quel axe (client, production, appro), et puis-je le voir
> AVANT de valider ? »**

L'issue #23 répond à un seul axe (aval / promesse client) pour une seule mutation
(un drag). La vision complète : un **moteur d'étude d'impact** — N mutations groupées
en scénarios, 3 axes de propagation, diff avant/après.

**Principe fondateur (tranché)** : la sortie est un **constat, pas une prescription**.
Le moteur liste les impacts ; l'humain décide. Pas de solver, pas d'optimiseur, pas de
« re-calage proposé ». Projection + diff, rien d'autre.

## 2. Cas d'usage fondateurs

### Cas 1 — Rupture d'un composant très utilisé

Sans lui, ligne à l'arrêt (~1 semaine). Réponse opérationnelle : réorganiser le carnet
pour tourner sur des produits qui **ne consomment pas** ce composant et garder de la
charge. Faisable aujourd'hui au drag & drop — mais les impacts de cette réorganisation
sont invisibles :

- **impact client** (promesses) — le plus simple, couvert par #23 ;
- **impact appro** — pour occuper la ligne on _avance_ des OF prévus plus tard ; leurs
  besoins composants avancent aussi, alors que les appros ont été passés ~1 mois avant
  sur l'ancien plan → perturbation du plan d'appro, potentielles ruptures induites.
  C'est l'impact non maîtrisé aujourd'hui, celui qu'on veut **mesurer**.

### Cas 2 — Équité entre clients (prévisions vs commandes tardives)

Client A joue le jeu : prévisions + commandes 2-3 mois à l'avance. Client B commande au
délai normal (21 j) avec une date de besoin plus proche. Le matching par date de besoin
fait que B **consomme les composants approvisionnés grâce aux prévisions de A** → A est
lésé pour avoir anticipé. Deux problèmes distincts :

- **mesurer** : rendre visible « B capte X composants qui couvraient A » (affichage du
  matching, faisable avec l'existant) ;
- **corriger** : règle d'allocation — voir §5 (paramétrique, non tranchée).

### Cas 3 — Commande virtuelle (what-if)

Créer dans l'app une commande client fictive (dates souhaitées du client) et voir les
impacts sur l'en-cours **avant** tout enregistrement. C'est le cas révélateur : il force
l'injection de demande, le re-matching complet et le diff.

### Cas 4 — Client qui demande d'avancer ses commandes

Fréquent. Se décrit intégralement comme une mutation « déplacer demand » → déjà couvert
par la primitive. (Test de validité du modèle : tout nouveau cas doit se décrire comme
une mutation existante, sinon le modèle est faux.)

### Cas 5 — Réunions charge-capacité

Construire **plusieurs scénarios** de charge-capa (réorganisations alternatives),
les enregistrer, les comparer en réunion, appliquer le retenu.

## 3. La primitive : la mutation de plan

Tout se ramène à un **delta sur les flows** (modèle `Flow` demand/supply existant) :

| Mutation         | Description                                                       | Cas  |
| ---------------- | ----------------------------------------------------------------- | ---- |
| `shift_of`       | supply PF décalée (date, poste)                                   | 1, 5 |
| `shift_demand`   | demand décalée (commande#ligne, date)                             | 4    |
| `inject_demand`  | demand injectée (commande virtuelle : article, qté, date, client) | 3    |
| `suspend_supply` | supply composant retirée/retardée (rupture simulée)               | 1    |

La couche d'overrides actuelle (`OfOverride`, `OrderLineOverride`) **est déjà** une
couche de mutation appliquée en direct. Le scénario = la même couche, scopée à un id,
non appliquée. Un seul mécanisme, deux modes.

## 4. Les 3 axes de propagation

1. **Aval / promesse client** — dates de mise à dispo vs besoins. Couvert par #23
   (verdict par lien, drag live).
2. **Amont / appro** — re-projection des besoins composants (BOM × dates OF mutées)
   vs couverture existante (stock + réceptions attendues). Trois verdicts par composant :
   - besoin avancé **sous le délai fournisseur** → rupture induite _inévitable_ ;
   - besoin avancé mais rattrapable → appro à re-caler ;
   - besoin repoussé → réception inutile à date, stock dormant.
3. **Latéral / allocation entre demandes** — re-matching : qui perd sa couverture au
   profit de qui.

État de l'existant : `evaluateOrderImpacts` reçoit déjà les supply flows
**stock + réceptions attendues + OF** et le moteur de faisabilité explose déjà la BOM.
Le diff « quelles couvertures cassent » = comparer deux runs du moteur existant.
**Donnée manquante identifiée : le délai fournisseur par composant** (pour distinguer
« rattrapable » d'« inévitable ») — seule donnée X3 à aller chercher.

## 5. Décisions actées / questions ouvertes

| Sujet              | Décision                                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sortie du moteur   | **Constat, pas prescription.** Liste d'impacts signée ; le plan d'action reste humain.                                                                                                                                                                                                                       |
| Règle d'allocation | **Paramétrique, non tranchée.** Personne ne sait aujourd'hui la bonne règle (récompenser l'anticipation ↔ ne pas encourager les commandes ultra-tôt, risque d'annulations). Le bac à sable sert justement à la trancher : scénario « et si on allouait par X ? » → diff sur carnet réel → décision chiffrée. |
| Scénarios          | **Persistés en base**, nommés, retrouvables. Partage : plus tard (l'enregistrement seul est déjà une grosse feature).                                                                                                                                                                                        |
| Ré-évaluation      | Un scénario stocke les **mutations, pas le résultat**. Rejoué sur données fraîches → diff différent. Assumé et affiché (« évalué le … sur données du … »).                                                                                                                                                   |

Ouvertes : forme du partage des scénarios ; UI de comparaison (side-by-side vs tableau
de métriques) ; valeur du délai fournisseur par défaut si absent de X3.

## 6. Mode scénario in situ sur `/programme`

Pas de page dédiée : un **toggle** sur `/programme`.

- **Mode direct** (actuel) : drag OF / drag commande → mutation optimiste locale + PATCH
  immédiat (`planning_board.update`, `order_planning.update`).
- **Mode scénario** : mêmes gestes, même UI — la mutation locale s'applique à l'écran
  mais le PATCH est remplacé par un **append à la liste de mutations** du scénario
  courant. Rien ne part vers X3/overrides.
- Bandeau : « Scénario ‹nom› — N mutations — Impacts — Enregistrer / Appliquer / Jeter ».
- La couche d'impact #23 fonctionne à l'identique dans les deux modes (elle lit les
  positions/dates courantes, peu importe leur régime de persistance).

**Charge-capa déjà à moitié câblé** : les histogrammes hebdo par poste
(`lineWeekLoads`, `inertia/lib/board/store.ts`) se recalculent depuis les **positions
courantes des cartes**, pas depuis le payload serveur → en mode scénario, la vue
charge/capacité réagit aux mutations sans travail supplémentaire. Reste à construire :
l'enregistrement, et la **comparaison entre scénarios** (charge/capa par poste-semaine,
nb commandes en retard, ruptures induites — par scénario).

### Modèle de données (cible)

```
Scenario
├─ id, nom, description, auteur, créé le, évalué le / données du
└─ mutations[] (ordonnées, JSON)
     shift_of | shift_demand | inject_demand | suspend_supply
```

## 7. Moteur de diff (le pivot)

```
Plan actuel ──┐
              ├─ evaluateOrderImpacts × 2 ──→ DIFF signé :
Plan muté   ──┘   • commandes on_time → retard (et l'inverse), Δ jours
                  • couvertures composants qui cassent / se libèrent
                  • demandes qui perdent leur allocation au profit d'une autre
                  • charge/capa par poste-semaine (Δ heures, Δ %)
```

Pur, sans I/O, testable unitaire. Sans lui, ni scénarios ni commande virtuelle n'ont
de sortie.

## 8. Découpage en étages

| #   | Étage                        | Issue | Contenu                                                                  | Dépend de |
| --- | ---------------------------- | ----- | ------------------------------------------------------------------------ | --------- |
| 1   | **Couche d'impact**          | #23   | Verdict par lien, états visuels, drag live (PRD dédié)                   | —         |
| 2   | **Moteur diff**              | #56   | évaluer(plan) vs évaluer(plan + mutations), sortie 3 axes                | —         |
| 3   | **Scénarios**                | #57   | Mode scénario in situ, persistance, CRUD, bandeau                        | 2         |
| 4   | **Commande virtuelle**       | #58   | Mutation `inject_demand`, étude d'impact avant enregistrement            | 2, 3      |
| 5   | **Axe appro**                | #59   | Délais fournisseur, verdicts induits (inévitable / re-calable / dormant) | 2         |
| 6   | **Allocation paramétrique**  | #60   | Stratégie pluggable dans `CommandeOFMatcher`, testée via scénarios       | 2, 3      |
| 7   | **Comparaison de scénarios** | #61   | Tableau comparatif multi-scénarios (réunion charge-capa)                 | 3         |

Ordre recommandé : 1 → 2 → 3 → 4 → 7 → 5 → 6.
(4 et 7 sont de la valeur visible rapide une fois 3 posé ; 5 dépend d'une donnée X3 ;
6 est une décision de politique autant que du code.)

## 9. Points d'ancrage code

- `app/domain/order-impacts.ts` — `evaluateOrderImpacts` : le moteur d'évaluation
  (matching + faisabilité + overrides), à exécuter en double pour le diff.
- `app/domain/of-conso.ts` — `CommandeOFMatcher` : point d'injection de la stratégie
  d'allocation (étage 6).
- `app/domain/planning_board.ts` — `OfOverride` : le pattern de mutation existant.
- `inertia/lib/board/store.ts` — `moveCard` (couture PATCH vs append scénario),
  `lineWeekLoads` (charge déjà réactive aux positions).
- `inertia/pages/scheduler/programme.tsx` — hôte du toggle mode scénario.
- Base locale (SQLite / `OverrideStore`) — persistance des scénarios.
