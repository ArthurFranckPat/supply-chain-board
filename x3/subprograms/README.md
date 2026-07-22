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

Enveloppe **`ETAT` (script `AIMP3`)** pour sortir un état standard X3 sur un OF,
en silencieux, vers une destination `APRINTER` (**`GESAIM`**, et non `GESADI`).
L'application ne parle jamais à une imprimante : elle passe un code destination,
le serveur d'impression X3 fait le reste. Aucun PDF n'est régénéré côté board.

```l4g
Call ETAT(code_etat, destination, langue, trace, message, TBPAR, TBVAL) From AIMP3
```

`TBPAR` / `TBVAL` = deux tableaux parallèles (noms de paramètres, valeurs), les
noms étant les codes d'`AREPORTD`. 4ᵉ argument = trace (1 journalise, 0 non).

**`IMPRIM0 ... From GIMP` n'existe pas.** L'issue #85 l'annonçait, aucune source
ne la documente, et le coût de l'erreur est élevé : un `Call` vers un
sous-programme inexistant empêche le chargement du script entier, donc l'appel
SOAP échoue sans aucun message — y compris sur une sonde qui ne fait que deux
affectations. Même piège pour la chaîne `"NOM=VALEUR;NOM=VALEUR"`, qui n'est pas
le format attendu.

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

- **Destination fichier** : un état sort vers une destination de type fichier
  via une section `$FICHIER` dans son script, qui récupère le nom de fichier
  dans les paramètres. À vérifier sur `BONTRV` et `BSM` avant de conclure qu'un
  tir `PDFFILE` muet est un échec.
### Chaîne prouvée en CLTEST (22/07/2026)

| Appel | `WRETCOD` | Retour |
| --- | --- | --- |
| `BONTRV` · `F126-47558` · `PDFFILE` | 0 | `Impression de l'état BONTRV\Bons de travail\Imprimante PDFFILE` |
| `BSM` · `F126-47558` · `PDFFILE` | 0 | `Impression de l'état BSM\Bons de sortie matières\Imprimante PDFFILE` |
| `PING` | 0 | `pong` |
| OF inexistant | 1 | `OF F999-00000 introuvable (MFGHEAD).` |
| destination inexistante | 1 | `Destination DESTBIDON introuvable (GESAIM).` |
| état inexistant | 1 | `État ETATBIDON introuvable dans le dictionnaire (GESARP).` |

**Corroboré côté serveur d'édition** : une rafale de 6 `BONTRV` vers `PDFFILE` a
produit 6 tâches réelles, visibles dans la fonction **`PSIMP`** (Surveillance
impressions) — jobs 19 à 22 encore en pile, utilisateur `ABL`, état `BONTRV`,
application `CLTEST;srv-x3tst-01`, statut vert, exécution 1 à 4 s. `ETAT` soumet
donc de vraies tâches, et le `WRETCOD=0` n'est pas complaisant.

`PSIMP` montre l'état **instantané** du serveur (pile consommée en quelques
secondes), pas un historique : pour observer, tirer une rafale et rafraîchir.

Le 4ᵉ argument d'`ETAT` à 1 fait remonter un **message X3 nommant l'état et la
destination**, exposé côté app comme `printMessage`. C'est le signal positif qui
manquait : un `WRETCOD=0` sans ce message ne distingue pas un tir réel d'un appel
sans effet. Il reste faible — il atteste que X3 a soumis l'édition, pas que le
document est sorti de l'imprimante.

- **Statut d'impression : contrôle partiel.** `[S]stat1` a été
  retiré du code (API inexistante) — identifiant non vérifié sur cette version, et un identifiant
  inconnu rend le script entier non chargeable, ce qui donne un échec muet même
  sur la sonde PING. En l'état, `WRETCOD=0` veut dire « `IMPRIM0` a rendu la
  main », pas « le document est sorti » : **l'invariant 1 de l'issue #85 n'est
  pas tenu**. Identifier la variable de statut de la `GIMP` locale et rétablir
  le contrôle **avant** de router quoi que ce soit vers une imprimante d'atelier.
- `codimp=1` et `impselection=1` reprennent les valeurs par défaut d'`AREPORTD` ;
  à confirmer sur un tirage réel (sélection mémorisée vs bornes).
- `GUSER` en contexte web service : le paramètre `usr` de l'état doit être un
  utilisateur valide, sinon l'état peut sortir vide.
- 1er test vers **`PDFFILE`**, jamais directement vers une imprimante d'atelier.

### Test

Page `/writeback-test` (op `run`, publicName `ZSOAPPRINT`) sur un OF connu du
site, destination `PDFFILE`.

## Lot 2 — routage et journal côté board

Le subprogram ne décide de rien : il reçoit un code destination. Le choix de la
destination et le verrou d'idempotence vivent côté application (issue #85, lot 2).

- `print_destinations` — une règle par **atelier (STOLOC) × document**, plus une
  règle par défaut (`stoloc = ''`). Le drapeau `sandbox` n'est pas déclaratif :
  il est recopié depuis `APRINTER.PRT_0` (seul le type 2 met du papier dans un
  bac), donc l'écran ne peut pas mentir sur l'effet physique d'une règle.
- `print_jobs` — journal de chaque tentative, y compris les échecs. Le rang
  `attempt` est unique par `(of_num, doc_type)` : deux appels concurrents ne
  peuvent pas produire deux tirages « initiaux ». Une réimpression est explicite
  (`force`), jamais un écrasement.
- `app/services/print_service.ts` — résolution + verrou + appel + journal.
  Aucune relance automatique : un échec reste un échec journalisé.
- Écran : `/configuration/impressions`. CLI : `node ace print:of --of=… --site=…
  [--doc=BSM] [--force] [--dry]` (aucun flag de destination — router est le rôle
  de la table, pas de la ligne de commande).

Chaîne éprouvée le 22/07/2026 en CLTEST via la CLI : `BONTRV` et `BSM` sur
`F126-47558` vers `PDFFILE` → `submitted` + message X3 ; 2ᵉ appel sans `--force`
→ refusé par le verrou, aucune ligne créée ; `--force` → tirage 2 ; OF inconnu →
ligne `failed` portant « OF F126-00000 introuvable (MFGHEAD) ».

## Le second verdict : l'API REST du serveur d'édition

La dette du lot 1 (« X3 a accepté » ≠ « le document est sorti ») est levée pour
l'essentiel — non pas côté X3, qui ne dit rien, mais côté **serveur d'édition**,
qui expose une API REST depuis sa version 2.29, sur le port Syracuse :

```
GET http://<syracuse>:8124/print/<serveur>:1890/$jobs      → tâches
GET http://<syracuse>:8124/print/<serveur>:1890/$printers  → files déclarées
```

Une tâche porte : `rank` (le numéro affiché par `PSIMP`), `status` (`OK` /
`Erreur`), `phase`, `report` (`BONTRV.rpt`), `destination`, `user`, `processId`,
durées, et le dossier applicatif.

**Preuve de la panne partielle, obtenue sans papier (CLTEST, 22/07/2026).**
`ZETI1` pointe une file « Xerox » absente des 52 imprimantes déclarées au serveur
d'édition de test. Tirage de `BONTRV` dessus :

| Source | Verdict |
|---|---|
| `ZSOAPPRINT` | `WRETCOD = 0` — « tout va bien » |
| Serveur d'édition, tâche 29 | `status = Erreur` |

C'est exactement l'état dangereux décrit par l'issue, désormais **détecté** :
`app/x3/print_server_client.ts` relève les tâches avant le tirage, suit la nôtre
par exclusion, et journalise `server_verdict` (`ok` / `error` / `unknown`) à côté
du verdict X3.

Trois limites, à ne pas oublier :

- `ok` signifie « remis à la file d'impression ». Un bac vide ou un bourrage ne
  remonte nulle part — aucun signal logiciel ne prouve qu'une feuille est sortie.
- Sans rétention côté console (réglage **« Time before deleting print job
  status »**, 0 par défaut, disponible depuis la console 2.58.0.9 / 2023R2), la
  tâche disparaît en quelques secondes : le succès est alors *déduit* de sa
  disparition (`verdict_inferred`), pas lu sur un statut terminal. Activer la
  rétention rend `node ace print:reconcile` utile et supprime la course.
- Le rapprochement par exclusion reste ambigu si deux tirages du même état
  partent en même temps. Il deviendra exact avec `ETATJOB`, qui rend le numéro
  de tâche (`NOJOB`) — voir ci-dessous.

### Piste suivante : `ETATJOB`

`ASUBPROG` déclare **deux** points d'entrée dans `AIMP3` : `ETAT` (7 paramètres,
celui qu'on utilise) et **`ETATJOB`** (11 paramètres, « Impression état avec
groupage »). Les 4 paramètres supplémentaires : `DIFF` (différé), `IMPDAT`,
`IMPTIM`, et **`NOJOB` — le seul paramètre passé par adresse (`ADRVAL=1`), donc
en sortie : le numéro de tâche**. Y passer supprime le rapprochement heuristique
et ouvre l'impression différée (utile en affermissement de masse).
