---
name: etat-commandes-export
description: >
  Produit l'état hebdomadaire des commandes clients EXPORT (pays client ≠ FR)
  dues la semaine précédente, avec verdict de ponctualité par ligne et raison
  documentée pour chaque retard. Sortie : un mail Outlook rédigé, présenté à
  validation, jamais envoyé sans accord explicite. À déclencher tous les lundis.
  Trigger : « état des commandes export », « reporting OTD export », « le point
  du lundi », /etat-export, ou toute demande d'état hebdomadaire de ponctualité
  client hors France.
---

# État hebdomadaire des commandes export

> **État** : extraction et verdict livrés et vérifiés sur données réelles
> (semaine 37/2026 : 89 lignes dues, 95,5 % de ponctualité, 4 retards).
> Causes, persistance et envoi restent à construire — voir la fin du fichier.

## Mission

Chaque lundi, répondre à une seule question pour les clients hors France :
**les lignes qui devaient partir la semaine dernière sont-elles parties à
l'heure, et sinon pourquoi ?**

Pas un tableau de bord. Un relevé daté, envoyé, archivé, dont chaque retard
porte une cause exploitable six mois plus tard.

## Périmètre — tranché, ne pas rediscuter

| Question | Réponse retenue |
|---|---|
| Quelles lignes ? | Celles **dues** en S-1, livrées ou non. Une ligne due et jamais partie est le pire des retards : elle reste dans l'état. |
| Semaine S-1 | Lundi → dimanche ISO précédant le jour d'exécution. |
| Export | `SORDER.BPCCRY_0 <> 'FR'` — **pays du client** donneur d'ordre, pas le lieu de livraison. À ne pas confondre avec le filtre `__export__` du dashboard OTD, qui écarte les clients dont le **nom** contient « aldes » : deux questions différentes, deux populations différentes. |
| Référence du retard | Date **acceptée** (`SHIDAT_0`) = l'engagement pris. |
| Date demandée | `X4HSHIDAT_0` affichée en second : quand elle est antérieure à l'acceptée, le retard est commercial, pas industriel. Ne jamais confondre les deux. |
| Grain | Commande × article × date d'engagement. Les lignes d'un même article à la même date sont sommées (comme le KPI du dashboard), mais **jamais** d'agrégat par commande : une commande partiellement à l'heure n'existe pas. |
| Tolérance | Celle du dashboard OTD : vendredi → +3 j, samedi → +2 j, sinon +1 j. Identique à la carte OTD pour que les deux chiffres ne divergent jamais. |

## Étape 1 — Extraire

```bash
node ace otd:hebdo            # semaine dernière, tableau lisible
node ace otd:hebdo --json     # sortie JSON, à consommer par ce skill
node ace otd:hebdo --recul=3  # rejouer S-3
```

**Attention** : sur ce worktree, `node ace` est cassé sous Node 26 (`Invalid
command exported from "cache_verify.js" — Invalid URL`, y compris sur `node ace
list`). Passif d'environnement, antérieur à cette commande. Tant qu'il n'est pas
réglé, exécuter la même chose hors ace :

```bash
dotenvx run -q -- node --import @poppinss/ts-exec bin/<script>.ts
```
en important `OtdRepository.getEtatExport(from, to)` après un boot Ignitor
(modèle : `bin/diag_proactive.ts`).

La commande s'appuie sur `app/repositories/otd_repository.ts`, **seule maison de
la définition de ponctualité**. Ne jamais écrire de SQL OTD dans ce skill : deux
requêtes = deux vérités, et le chiffre du lundi finira par contredire le
dashboard.

Champs X3 mobilisés (pour lecture, pas pour réécriture) :

- `SORDERQ` : `SOHNUM_0`, `SOPLIN_0`, `SOQSEQ_0`, `ITMREF_0`, `QTY_0`, `DLVQTY_0`,
  `SHIDAT_0` (acceptée), `X4HSHIDAT_0` (demandée)
- `SORDER` : `BPCORD_0` (code client donneur d'ordre — **`BPCNUM_0` n'existe
  pas** sur SORDER, la requête échoue en « resultXml is nil »), `BPCNAM_0`,
  `BPCCRY_0`, `ORDDAT_0`
- `SDELIVERY` / `SDELIVERYD` : `SHIDAT_0` = date d'expédition **réelle**
- `ITMMASTER` : `ITMSTA_0 = 1`, `ITMDES1_0`

Deux pièges vérifiés sur le terrain :

- **Toujours borner sur `Q.SHIDAT_0`.** Une requête non bornée (même un simple
  `COUNT(*)` sur SORDERQ) expire côté ZSOAPSQL et remonte « resultXml is nil ».
  L'erreur ne dit pas qu'elle est un timeout — ne pas la lire comme une faute de
  syntaxe.
- **Dates sentinelles.** `X4HSHIDAT_0` vaut parfois 31/12/1999 sur les vieilles
  commandes. Sans garde-fou, toute ligne sentinelle passe pour « délai
  négocié ». `dateExploitable()` borne à [2000, 2100]. Sur la semaine 37/2026,
  les 89 lignes étaient renseignées — le champ est fiable, pas vide.

Si l'extraction échoue ou revient vide : **le dire**. Ne jamais compléter de
mémoire, ne jamais réutiliser l'état de la semaine précédente comme substitut.

## Étape 2 — Verdict par ligne

Trois états, et trois seulement :

- **Ponctuel** — expédiée dans la tolérance de la date acceptée.
- **En retard, livrée** — partie, mais après. Retenir le nombre de jours et la
  date réelle.
- **En retard, ouverte** — jamais partie. Jours de retard **courants** (comptés
  jusqu'à aujourd'hui, pas jusqu'à dimanche), reliquat en quantité.

Signaler à part, sans les compter comme retard industriel, les lignes dont la
date demandée était antérieure à l'acceptée : le délai a été négocié, pas subi.

Ce bloc n'est pas cosmétique. Semaine 37/2026 : 7 lignes à délai négocié, **toutes
ponctuelles** au sens de l'engagement — dont une attendue le 22/07 et expédiée le
11/09. Un état qui ne regarderait que la date acceptée afficherait 95,5 % et
tairait sept semaines d'attente client.

## Étape 3 — Causer chaque retard

Trois couches, dans cet ordre. Ne jamais sauter directement à la question.

### 3a. Reconstituée (automatique)

Le moteur de rupture regarde le **présent** : une ligne livrée en retard la
semaine dernière n'a plus de manque aujourd'hui, il ne dira rien. C'est un
post-mortem, pas un diagnostic. Chercher donc les traces qui survivent :

| Indice | Cause proposée |
|---|---|
| Fin réelle de l'OF postérieure à la date besoin | `PRODUCTION` |
| Réception fournisseur du composant en retard (lookback 90 j, cf. issue #43) | `APPRO` |
| `X4HSHIDAT_0` < `SHIDAT_0` | `DELAI_COMMERCIAL` |
| Création `SORDER` trop proche de la date demandée | `COMMANDE_TARDIVE` |
| `DLVQTY_0` > 0 mais < `QTY_0` | `RELIQUAT` (cause seconde : chercher pourquoi) |

Une cause reconstituée est une **proposition**, présentée comme telle. L'humain
confirme ou corrige.

### 3b. Mémorisée

Si la même ligne — ou le même article chez le même client — a déjà reçu une
cause les semaines précédentes, la reproposer avec sa date d'origine.

### 3c. Saisie

Ne poser la question **que sur les lignes restées inexpliquées**, une par une,
courtes. C'est là toute la valeur du skill : au bout de quelques semaines il ne
reste presque rien à saisir.

### Catégories fermées

`PRODUCTION` · `APPRO` · `CAPACITE` · `QUALITE_CQ` · `TRANSPORT` ·
`COMMANDE_TARDIVE` · `DELAI_COMMERCIAL` · `CLIENT` · `AUTRE`

Catégorie obligatoire, commentaire libre facultatif. Du texte libre seul ne se
compte pas : dans six mois, personne ne saura dire si l'export souffre de
l'appro ou du transport.

Persistance : table locale `export_delay_reasons` (clé `SOHNUM_0` + `SOPLIN_0` +
`SOQSEQ_0`, + semaine ISO, catégorie, commentaire, auteur, horodatage), sur le
modèle de `order_line_overrides`. Jamais un fichier posé à côté.

## Étape 4 — Rédiger

**Objet** : `État commandes export — semaine {ISO} ({jj/mm/aaaa} au {jj/mm/aaaa})`

**Corps** (HTML, dates en jj/mm/aaaa, jamais d'ISO à l'écran) :

1. Une phrase de synthèse : nombre de lignes dues, nombre en retard, taux de
   ponctualité, et la comparaison avec la semaine précédente.
2. Tableau des **seules lignes en retard** : client · pays · commande · article ·
   date acceptée · date demandée · date réelle · jours de retard · qté due /
   livrée · cause · commentaire.
3. Bloc « retards toujours ouverts » hérités des semaines antérieures, s'il y en
   a — ils ne disparaissent pas du radar parce que la semaine a changé.
4. Rien d'autre. Pas de commentaire d'ambiance, pas de projection.

Si aucune ligne n'est en retard : le dire en une phrase, envoyer quand même.
L'état du lundi est un rituel ; son absence se lit comme un oubli.

## Étape 5 — Envoyer

Canal : mail Outlook via le MCP `office365` (Graph).

**Règle absolue** : afficher le brouillon complet — destinataires, objet, corps —
et attendre un accord explicite. Un mail part sous le nom de l'utilisateur, vers
des interlocuteurs qui en tireront des conclusions. Aucun envoi automatique,
jamais, même quand la semaine est calme et le rapport identique au précédent.

Après envoi : archiver la semaine (chiffres + causes) pour la comparaison du
lundi suivant.

## Règles non négociables

1. Tout chiffre vient de l'extraction. Aucun nombre de mémoire, aucune estimation.
2. Jamais de SQL OTD dans ce skill — `otd_repository` fait foi.
3. Jamais de somme par commande ni par client sur la ponctualité.
4. Dates affichées en jj/mm/aaaa.
5. Une ligne sans cause sort **quand même** dans le mail, marquée
   « cause non documentée ». On ne masque pas ce qu'on n'a pas su expliquer.
6. Lecture seule côté X3. Ce skill n'écrit rien dans l'ERP.

## État du chantier

Livré et vérifié sur données réelles :

- [x] `otd_repository` : `buildExportSql` + `getEtatExport()` + `resolveSemainePrecedente()`
- [x] tolérance de ponctualité extraite en `toleranceSql()`, désormais partagée
      avec le KPI du dashboard — une seule définition, comme promis
- [x] `commands/otd_hebdo.ts` (écrite, typée, lintée ; exécution bloquée par le
      kernel ace du worktree, pas par la commande)
- [x] garde-fou dates sentinelles

Reste à construire :

- [ ] migration `export_delay_reasons` + son store
- [ ] reconstitution automatique des causes (étape 3a) — le plus gros morceau
- [ ] rendu HTML du mail
- [ ] MCP `office365` à déclarer dans le `.mcp.json` du dépôt
- [ ] destinataires du mail — **non renseignés à ce jour**

Angles morts assumés, à trancher sur données :

- lignes soldées ou annulées (`SORDERQ.SOQSTA_0`) non filtrées, comme le KPI du
  dashboard : écarter une ligne soldée effacerait des retards réels
- `node ace` cassé sous Node 26 sur ce worktree (passif)
