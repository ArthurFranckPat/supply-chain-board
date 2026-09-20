# Capacité de production & atelier (page /charge)

Issues #35 (capacité) et #36 (atelier). Source X3 : `WORKSTATIO` × `TABWEEDIA`,
rapatriées via le **sync statique SQLite** (`StaticSyncService.syncWorkstations`,
table `static_workstations`), pas en SOAP live à chaque requête.

## Origine X3

`WORKSTATIO` — poste de charge (clé `WST_0` = `gamme.workstation`, ex. `PP_830`)

| champ                       | usage                                                                      |
| --------------------------- | -------------------------------------------------------------------------- |
| `WST_0`                     | code poste                                                                 |
| `WSTDES_0`                  | libellé                                                                    |
| `WSTTYP_0`                  | type (1 machine, 2 main d'œuvre, 3 sous-traitance) — **tous** synchronisés |
| `WSTNBR_0`                  | nombre d'exemplaires (shifts / ressources parallèles)                      |
| `EFF_0` / `USE_0` / `SHR_0` | efficience % / utilisation % / perte %                                     |
| `TWD_0`                     | → schéma horaire (`TABWEEDIA.TWD_0`)                                       |
| `STOLOC_0`                  | emplacement / **atelier** (#36)                                            |
| `WCR_0` / `WCRFCY_0`        | centre de charge / site                                                    |

`TABWEEDIA` — schéma horaire hebdo (clé `TWD_0`), `DAYCAP_0..6` = capacité (h) par
jour **Lun→Dim** (index 0 = Lundi). Dénormalisé sur la ligne poste au sync.

Lien : `WORKSTATIO.TWD_0 = TABWEEDIA.TWD_0` (LEFT JOIN — poste sans schéma → capacité nulle).

## Formule de capacité (`app/domain/capacity.ts`)

Capacité **nette** d'un jour (affichage par défaut) :

```
cap_jour = DAYCAP[jourSemaine] × WSTNBR × (EFF/100) × (USE/100) × (1 − SHR/100)
```

Capacité **théorique** (sans rendement) : `DAYCAP[jourSemaine] × WSTNBR`.
`capacityPeriod(poste, from, to)` = Σ `cap_jour` sur les jours de l'intervalle.

Les pourcentages valant 0 (non renseignés X3) retombent sur 100 % (neutres) plutôt
que d'annuler la capacité.

**Validation `PP_830`** (CFA, WSTNBR=2, EFF=90 %, USE=100 %, SHR=0) :
`7,5 × 2 × 0,90 = 13,5 h/j` → ~293 h/mois. Charge Sept ≈ 336 h ⇒ surcharge ~115 %.
Données live conformes (CFA = 7,5 h Lun-Ven, ~0 week-end).

## Affichage /charge

`LoadController` joint, par poste et par bucket (mensuel + hebdo), la capacité nette
à la charge (`LoadLine.capacity`). Front (`scheduler/load.tsx`) :

Les heures de charge affichées tiennent compte de l’efficience de la ligne : une
charge standard de `10 h` sur une ligne à `90 %` devient `10 / 0,90 = 11,11 h`.
Cette conversion est appliquée dans l’agrégat et dans le détail pour conserver la
même valeur des deux côtés. Les valeurs X3 nulles ou à zéro restent neutres.

- ligne de capacité (pointillés) sur le détail + mini-cartes ;
- totaux et lignes de capacité **rouges** quand charge > capacité ;
- badge **taux de saturation** (charge / capacité) sur le poste sélectionné.

## Semaines affichées (`app/domain/charge_window.ts`)

L'horizon part du 1er du mois courant, donc du **lundi qui le contient** : jusqu'à
quatre semaines déjà écoulées ouvraient le graphe. Vides, elles n'apportaient rien
et poussaient la charge réelle vers la droite ; dans le plan de schéma horaire,
elles consommaient en plus tout le préavis, qui proposait donc de changer
d'organisation dès lundi prochain.

`firstVisibleWeek(weekKeys, hasLoad, today)` coupe le **préfixe** de semaines
écoulées **et vides**, rien de plus :

- une semaine passée qui porte encore de la charge (OF en retard, besoin non
  soldé) **reste** — c'est du travail à faire, pas de l'histoire — et tout ce qui
  la suit reste avec elle ;
- la semaine courante n'est jamais coupée, même vide ;
- horizon entièrement révolu (l'utilisateur a visé un vieux mois) : rien n'est
  coupé, on lui montre ce qu'il a demandé plutôt qu'une page blanche.

Le recadrage s'applique **en fin de calcul**, dans `load_payload_loader`, sur les
trois jeux de lignes (`ofLines`, `cmdLines`, `cmdLinesWithoutDemandHorizon`) et sur
la capacité. ⚠️ La capacité est un objet **partagé** entre les jeux : la tronquer
ligne par ligne la tronquerait plusieurs fois — d'où la copie unique par objet
source. Les buckets **mensuels** ne sont pas touchés : un mois reste un mois.

## Atelier & classification montage / fabrication (#36)

`STOLOC_0` rattache chaque poste à un atelier ; exposé comme filtre transverse
(multi-sélection) sur /charge. Mapping libellés + catégorie : `app/domain/atelier.ts`.

⚠️ **Règle montage ↔ fabrication PROVISOIRE** : non dérivable des seules données X3,
à arbitrer avec le métier (quels `STOLOC` / `WCR` sont du montage — où s'attachent les
commandes clients — vs fabrication de sous-ensembles / AM). Tant que
`MONTAGE_LOCATIONS` n'est pas validé, tout poste hors liste est classé « fabrication ».
Le rattachement atelier (STOLOC), lui, est exact.

## Plan de schéma horaire (lot 1)

Objectif : dire, par **poste de charge** et par semaine, quel schéma horaire tenir —
pour que le responsable d'atelier puisse gérer ses effectifs. La décision est au
poste ; l'atelier n'est qu'un regroupement de lecture (cumul d'équipes-jour).

| fichier                                              | rôle                                                      |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `app/domain/shift_schedules.ts`                      | catalogue des schémas planifiables + lecture du schéma X3 |
| `app/domain/shift_plan.ts`                           | moteur (pur, sans I/O) : proposition lissée               |
| `app/services/shift_plan_builder.ts`                 | capacité par schéma candidat × semaine (calendrier)       |
| `inertia-react/components/load/shift-plan-strip.tsx` | frise, sous le graphe du poste                            |
| `commands/shift_plan_show.ts`                        | `node ace charge:plan --postes=…` pour le calage métier   |

### Catalogue

Un schéma planifiable porte un **vecteur Lun→Dim** d'équipes (aligné `DAYCAP_0..6`),
pas un scalaire : « trois jours de production » n'est pas un nombre d'équipes.
Cibles = `1x8-5j` et `2x8-5j` ; les semaines courtes (`1x8-2j`…`2x8-4j`) ne servent
que la sous-charge franche. `3x8` est volontairement absent (non autorisé).

⚠️ **`WSTNBR` ne se remultiplie pas sous un schéma planifié.** X3 exprime les
équipes soit par le schéma (`PP_153` en `2/8`), soit par les exemplaires (`PP_830`
en `CFA` avec `WSTNBR_0 = 2` — un 2×8 sur UNE ligne). Un schéma planifié substitue
le nombre d'équipes **total** : sans cette règle, poser `2x8-5j` sur `PP_830` donne
28 h/j au lieu de 14. C'est aussi pourquoi l'état initial de `PP_830` est `2x8-5j`.

Un paramétrage hors catalogue (semaine trouée, feu continu) rend le poste **non
planifiable** : il garde sa capacité `DAYCAP` telle quelle, et la frise le dit.

### Les deux règles du moteur

1. **Palier minimum 3 semaines** (choix métier), y compris le dernier palier de
   l'horizon — sinon le moteur tricherait en fin de fenêtre.
2. **Lissage en cumulé** : le critère n'est pas « capacité ≥ charge chaque
   semaine » mais « capacité cumulée ≥ charge cumulée sur le palier ». Un 2×8
   tenu trois semaines absorbe un pic de S3 en produisant dès S1.

La dette d'un palier sous-capacitaire est **facturée et affichée, jamais reportée**
sur le palier suivant : la charge d'entrée vient du jalonnement CBN / des dates
demandées, et le CBN du lendemain repoussera le reste de lui-même. Ce moteur ne
réécrit pas le MRP. Conséquence technique : le report entrant d'un palier valant
toujours zéro, son coût est local — la programmation dynamique sur les paliers est
donc **exacte**, pas heuristique.

**Préavis** : les `frozenWeeks` premières semaines (2 par défaut) portent
obligatoirement le schéma courant. On ne passe pas un atelier en 2×8 pour lundi
prochain ; si ce palier gelé ne tient pas la charge, il le signale au lieu de la masquer.

### Ce qui est planifié

Sur le **reste à produire**, pour les deux vues (OF et commande), sur **12 semaines**
— plus court que les 6 mois du graphe : au-delà d'un trimestre la charge est surtout
prévisionnelle, et proposer une organisation dessus serait de la fausse précision.

La fenêtre est celle du graphe, déjà recadrée par `firstVisibleWeek` (voir
ci-dessus) : le plan ne redécide pas de ses semaines, sinon il commenterait un
graphe décalé d'une case — ou amputerait la charge résiduelle que le graphe garde.

La frise suit la **vue** (deux lectures différentes de la demande) mais pas les crans
brut/net/reste ni heures/pièces, qui sont des réglages de lecture : une décision
d'organisation ne change pas parce qu'on regarde autrement le même graphe.

### Ce que l'écran affiche — une liste de décisions, pas un dessin

⚠️ La première version était une frise (paliers + taux de saturation semaine par
semaine). Elle a été **rejetée par le métier**, et pour une raison qui doit rester
écrite ici : le graphe juste au-dessus montre déjà la charge et la capacité. La
frise redisait donc en petit ce qui est lisible en grand, prenait la moitié du
panneau, et ne répondait pas à la seule question posée — _qu'est-ce que je change,
quand, et pourquoi ?_ Un **taux de saturation ne dit rien à quelqu'un qui staffe
des équipes** : il lui faut une date, un verbe et le nombre d'heures qui justifie
le geste.

Le bloc rend donc des phrases, une par décision :

> **Ne rien changer** jusqu'au 18/10 — 1×8 · 5 jours, 105 h à produire pour 105 h ouvertes.
> **Passer en 2×8 · 5 jours** le lundi 19/10, pendant 3 semaines (jusqu'au 08/11) · +1 équipe.
> 183 h à produire ; en restant en 1×8 vous n'en ouvrez que 105 h. Atelier S3P : 75 → 85 équipes-jour cette semaine-là.

Trois chiffres portent la phrase, et sont produits par le moteur (`loadHours`,
`capacityHours`, `keepHours`) : la charge du palier, la capacité du schéma proposé,
et **la capacité qu'on aurait en ne changeant rien**. Ce dernier est le seul qui
justifie une bascule ; il se calcule dans `planShifts`, là où la capacité de TOUS
les schémas candidats est encore disponible — pas dans le composant.

Le cumul d'équipes-jour de l'atelier n'apparaît qu'**au moment d'un changement**
(`75 → 85`) : c'est là qu'il sert, pour voir si la bascule d'un poste tombe en même
temps que celle de ses voisins.

**Directive** : si l'envie revient d'y remettre un dessin, c'est que le graphe
au-dessus manque de quelque chose — c'est lui qu'il faut corriger.

### Poids du moteur — à caler

`DEFAULT_SHIFT_PLAN_OPTIONS.weights` est un point de départ, pas une constante
physique. Les poids sont réglés pour que trois situations tombent juste (pic isolé
absorbé en avance, sous-charge légère qui garde ses cinq jours, sous-charge franche
qui ferme des jours). `tests/domain/shift_plan.test.ts` verrouille ce que chaque
réglage doit préserver ; `node ace charge:plan` sert à les revoir sur postes réels.

### Limites connues du lot 1

- **Lecture seule** : rien n'est persisté, et la capacité du graphe reste celle de
  X3. Validation, gel et boucle retour sur `capDay` = lot 2.
- **`SHIFT_HOURS = 7` en dur** : un 2×8 vaut ici 2 × 7 h. À confirmer avec l'atelier
  (recouvrement, pauses décalées) — la constante est isolée dans `capacity.ts`.
- **Aucune contrainte d'effectif** : rien n'empêche le moteur de proposer le 2×8 à
  tous les postes d'un atelier la même semaine. Le cumul d'équipes-jour affiché sous
  la frise rend l'absurdité visible, il ne l'interdit pas. Lot 3.
- **Avance non plafonnée par la matière** : produire en avance suppose les composants
  disponibles. Croisement avec `material_projection.ts` prévu au lot 3.
