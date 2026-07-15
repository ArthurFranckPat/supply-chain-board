# Sous-programmes L4G custom — déploiement X3

Artefacts 4GL (`.src`) à compiler/publier **côté X3** (pas exécutés par le board).
Versionnés ici pour traçabilité. Le board les appelle via SOAP `run` une fois publiés.

## FIRMSUGG.src — affermir une suggestion CBN en OF (issue #31)

Pilote le moteur de la fonction standard **FUNMAUTR** (« Lancement automatique »,
traitement **TRTAUTOF**) scopé sur une suggestion, en headless. Crée l'OF ferme
(explose nomenclature/gamme) ET consomme la suggestion CBNDET — pas de double appro.

### Signature

```
FIRMSUGG(WSTOFCY, WSUGNUM, WSTATUS, WMFGNUM, WRETCOD, WRETERMSG)
  WSTOFCY   IN   Char     Site production
  WSUGNUM   IN   Char     No suggestion (= WIPNUM CBNDET)
  WSTATUS   IN   Integer  Nouveau statut : 1 Planifié · 2 Ferme
  WMFGNUM   OUT  Char     No OF créé
  WRETCOD   OUT  Integer  0 = OK · 1 = erreur
  WRETERMSG OUT  Char     Message d'erreur
```

### Pré-requis X3

- Paramètre **MFGMTSNUM** (chapitre STO, groupe MIS) pointé sur une transaction de
  génération auto (**OF6**) — déjà en place.
- Droits du compte de service sur la création OF (MFGHEAD/MFGMAT/MFGOPE) + CBNDET.

### Publication GESAWE

`Administration > Web services > Sous-programmes` (classic SOAP) :

| Champ      | Valeur                         |
| ---------- | ------------------------------ |
| Code       | `FIRMSUGG`                     |
| Type       | `GOSUB`                        |
| Script     | `FIRMSUGG`                     |
| Subprogram | `FIRMSUGG`                     |
| Pool/User  | même pool que la lecture (#13) |

Grille paramètres — **rangs = ordre de la signature** :

| Rang | Nom       | Dim | Type    | E/S |
| ---- | --------- | --- | ------- | --- |
| 1    | WSTOFCY   | 0   | CHAR    | 0   |
| 2    | WSUGNUM   | 0   | CHAR    | 0   |
| 3    | WSTATUS   | 0   | INTEGER | 0   |
| 4    | WMFGNUM   | 0   | CHAR    | 1   |
| 5    | WRETCOD   | 0   | INTEGER | 1   |
| 6    | WRETERMSG | 0   | CHAR    | 1   |

**Save → Valider** (WSDL), puis **redémarrer le pool**.

### Points à valider au 1er test

- Hébergement des masques `[M:DIA]`/`[M:MFGK]` via `Gosub … From TRTAUTOF` (accès
  cross-script). Si X3 refuse → basculer sur un appel direct `MAJ_OF From MFGAUTLIB`
  en répliquant `$MAJREL`.
- Contexte global en WS (GUSER/GACTX) suffisant pour `$CONTEXTE`/`$OUVRE`.
- `[M:MFGK]MFGNUM` bien renseigné après `$TRT_OF`.

### Test

Page `/writeback-test` (op `run`, publicName `FIRMSUGG`) ou route board
`POST /api/v1/planning/suggestions/:sugNum/firm`.
