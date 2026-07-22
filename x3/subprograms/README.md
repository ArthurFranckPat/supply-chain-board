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

## ZSOAPPRINT.src — imprimer les documents d'un OF (issue #85)

Enveloppe `IMPRIM0` (`From GIMP`) pour sortir **un état standard X3 sur un OF**,
en silencieux, vers une destination `GESADI`. L'application ne parle jamais à une
imprimante : elle passe un code destination, le serveur d'impression X3 fait le
reste. Aucun PDF n'est régénéré côté board.

### Signature

```
ZSOAPPRINT(WRPTCOD, WSTOFCY, WMFGNUM, WDEST, WRETCOD, WRETERMSG)
  WRPTCOD   IN   Char     Code état GESARP : BONTRV | BSM
  WSTOFCY   IN   Char     Site production
  WMFGNUM   IN   Char     No OF (borne début = fin)
  WDEST     IN   Char     Code destination APRINTER / GESADI
  WRETCOD   OUT  Integer  0 = imprimé · 1 = échec (défaut 1)
  WRETERMSG OUT  Char     Cause de l'échec
```

### Relevé X3 (lot 0, base CLTEST)

États réellement utilisés en production — `AREPORTM` :

| Code     | Document              | Tirages mémorisés |
| -------- | --------------------- | ----------------- |
| `BONTRV` | bon de travail        | 176 038           |
| `BSM`    | bon de sortie matière | 29 497            |
| `DOSFAB` | dossier de fabrication (standard) | 0     |

`DOSFAB` / `FICHSUI` / `XFICHFAB` existent mais ne sont pas utilisés : les
documents d'atelier chez Aldes sont **BONTRV + BSM**.

Paramètres (`AREPORTD`, identiques pour les deux) : `mfgfcydeb`, `mfgnumdeb`,
`pjtdeb`, `gammedeb`, `strdatdeb`, `codimp`, `usr`, `etat`, `numedt`,
`impselection`. Bornes passées par couple `…deb` / `…fin`.
`AREPORTM.CLEA1_0` contient un `MFGNUM` unique par ligne (`F123-16429`) : le
tirage pièce par pièce est déjà la pratique, pas seulement une plage.

Destinations : table **`APRINTER`** (et non `ADELIVER`, qui est la livraison de
patchs). 72 destinations déjà créées, dont par atelier/îlot : `ATELIER-MD`,
`IMP-ORDO`, `RESP-MAG`, `HUM-BDH`, `HUM-BAP`, `HUM-PP91`, `HUM-PP127`,
`IMP-EXPE`, `ML3710-*`. `PRT_0` = type (1 aperçu · 2 imprimante · 4 fichier),
`PRTSRV_0` = serveur d'impression. **`PDFFILE`** (type 4) sert de mode bac à
sable : chaîne complète validée sans consommer de papier.

### Publication GESAWE

Même procédure que `FIRMSUGG` (classic SOAP, type `GOSUB`, script et subprogram
`ZSOAPPRINT`, même pool que la lecture).

| Rang | Nom       | Dim | Type    | E/S |
| ---- | --------- | --- | ------- | --- |
| 1    | WRPTCOD   | 0   | CHAR    | 0   |
| 2    | WSTOFCY   | 0   | CHAR    | 0   |
| 3    | WMFGNUM   | 0   | CHAR    | 0   |
| 4    | WDEST     | 0   | CHAR    | 0   |
| 5    | WRETCOD   | 0   | INTEGER | 1   |
| 6    | WRETERMSG | 0   | CHAR    | 1   |

**Save → Valider** (WSDL), puis **redémarrer le pool**.

### Sonde de vie (PING)

`WRPTCOD="PING"` sort immédiatement avec `WRETCOD=0` / `WRETERMSG="pong"`, avant
tout `Local File`, tout `IMPRIM0`, tout `[S]stat1`. Les autres paramètres sont
ignorés. Sépare un problème de publication ou de chargement du pool (pas de pong)
d'un problème d'impression (pong OK, tirage KO), et sert de test de chaîne sans
consommer de papier.

### Piège de signature (coûté une soirée)

`Variable Integer WRETCOD` — **sans parenthèses**. Sur un `Integer`, `()` déclare
un tableau non dimensionné ; le wrapper de publication passe un scalaire (`typ
INT`, `dim 1`) et la liaison échoue **avant** le corps du sous-programme, donc
sans aucun message : `WW_OK=0`, `Result (0)`, `messages[0]`, `resultXml` nil.
Sur un `Char`, `()` est normal (longueur variable) — `FIRMSUGG` en est plein.
Référence de style : `ZSOAPSQL.src` (`Variable Integer W_COUNT`).

Diagnostic reproductible : ajouter `adxwss.trace.on=on&adxwss.trace.size=32768`
au `requestConfig` de l'enveloppe SOAP, puis lire `<traceRequest>` dans la
réponse. La trace donne le wrapper appelé, les arguments transmis et `Result(n)`.
Un échec *dans* le corps remonte, lui, un message dans `WW_MESS`.

### Points à valider au 1er test

- **`[S]stat1`** : variable de statut d'`IMPRIM0`. Si le compilateur la refuse
  sur cette version, remplacer par la variable de retour de la `GIMP` locale —
  mais **ne pas supprimer le contrôle** : sans lui, l'appel SOAP répond « OK »
  sur une impression qui n'a jamais eu lieu (invariant 1 de l'issue #85).
- `codimp=1` et `impselection=1` reprennent les valeurs par défaut d'`AREPORTD` ;
  à confirmer sur un tirage réel (sélection mémorisée vs bornes).
- `GUSER` en contexte web service : le paramètre `usr` de l'état doit être un
  utilisateur valide, sinon l'état peut sortir vide.
- 1er test vers **`PDFFILE`**, jamais directement vers une imprimante d'atelier.

### Test

Page `/writeback-test` (op `run`, publicName `ZSOAPPRINT`) sur un OF connu du
site, destination `PDFFILE`.
