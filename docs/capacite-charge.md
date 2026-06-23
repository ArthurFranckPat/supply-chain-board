# Capacité de production & atelier (page /charge)

Issues #35 (capacité) et #36 (atelier). Source X3 : `WORKSTATIO` × `TABWEEDIA`,
rapatriées via le **sync statique SQLite** (`StaticSyncService.syncWorkstations`,
table `static_workstations`), pas en SOAP live à chaque requête.

## Origine X3

`WORKSTATIO` — poste de charge (clé `WST_0` = `gamme.workstation`, ex. `PP_830`)

| champ | usage |
|---|---|
| `WST_0` | code poste |
| `WSTDES_0` | libellé |
| `WSTTYP_0` | type (1 machine, 2 main d'œuvre, 3 sous-traitance) — **tous** synchronisés |
| `WSTNBR_0` | nombre d'exemplaires (shifts / ressources parallèles) |
| `EFF_0` / `USE_0` / `SHR_0` | efficience % / utilisation % / perte % |
| `TWD_0` | → schéma horaire (`TABWEEDIA.TWD_0`) |
| `STOLOC_0` | emplacement / **atelier** (#36) |
| `WCR_0` / `WCRFCY_0` | centre de charge / site |

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
- ligne de capacité (pointillés) sur le détail + mini-cartes ;
- totaux et lignes de capacité **rouges** quand charge > capacité ;
- badge **taux de saturation** (charge / capacité) sur le poste sélectionné.

## Atelier & classification montage / fabrication (#36)

`STOLOC_0` rattache chaque poste à un atelier ; exposé comme filtre transverse
(multi-sélection) sur /charge. Mapping libellés + catégorie : `app/domain/atelier.ts`.

⚠️ **Règle montage ↔ fabrication PROVISOIRE** : non dérivable des seules données X3,
à arbitrer avec le métier (quels `STOLOC` / `WCR` sont du montage — où s'attachent les
commandes clients — vs fabrication de sous-ensembles / AM). Tant que
`MONTAGE_LOCATIONS` n'est pas validé, tout poste hors liste est classé « fabrication ».
Le rattachement atelier (STOLOC), lui, est exact.
