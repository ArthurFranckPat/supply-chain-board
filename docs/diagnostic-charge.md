# Diagnostic — calculs de la page `/charge` (netting & agrégation)

**Date** : 2026-09-10
**Périmètre** : projection de charge long terme `/charge`, vue Commande (segments `fi`/`si`) et vue OF.
**Moteur** : `app/domain/charge_explosion.ts` + `app/services/load_payload_loader.ts` (+ `charge_detail_loader.ts` pour le détail d'un bucket).
**Sémantique métier retenue** : les opérations d'une gamme sont séquentielles et ce qu'on évalue est le **temps machine** par poste, soit `Σ (qté / cadence)` sur chaque opération. Le netting s'applique donc **une fois à la quantité**, puis cette quantité nette alimente toutes les opérations (les pièces traversent les opérations en séquence).
**Hors périmètre** : référentiel de gammes et synchronisation statique (chantier distinct, non traité ici).

**Contrôle (10/09/2026)** : chaque point ci-dessous a été rejoué contre le code et contre la
réplique statique locale. Les preuves X3 de D2 et de l'annexe n'ont **pas** été rejouées — MCP
`supply-board` injoignable, et la réplique locale ne porte que le statique (articles, gammes,
nomenclatures, postes), pas ORDERS. À retenir aussi, même si c'est hors périmètre : `static_gammes`
est synchronisé au **19/07/2026** — tous les chiffres de `/charge` sortent de ce référentiel figé,
qui ne porte aujourd'hui qu'**une seule opération par article** (2907 articles, 2907 postes distincts).

---

## 1. Chaîne de calcul

`loadChargePayloadData` (`load_payload_loader.ts:467`) exécute, dans l'ordre :

| # | Étape | Code | Rôle |
|---|---|---|---|
| 1 | Horizon | `chargeHorizon` `:111` | N mois pleins (6) depuis le 1er du mois de `start`. |
| 2 | Lecture des entrées | `fetchChargeInputs` `:223` | OF sur `STRDAT ∈ horizon`, demandes sur `ENDDAT ∈ horizon`, BOM fabriqués, gammes, pointages MFGOPE. |
| 3 | Explosion | `explodeInputs` `:307` | `explodeCharge(orderLines, bomByParent, gammeMap)` : PF depth 0, composants fabriqués depth 1→4. |
| 4 | Stock | `computeChargeStock` `:332` | Stock strict + QC des articles touchés, snapshot « maintenant ». |
| 5 | Netting | `computeChargeNeeds` `:356` | `netCharge(raws, stock, encours)`. |
| 6 | Agrégation | `buildLines` `:566` (OF) / `:647` (Commande) | Buckets mensuels + hebdo, segments `f/p/s/fi/si`. |
| 7 | Capacité | `:523-545` | `capDay(w, d) × facteur calendrier` par jour, sommée par bucket. |

Le détail d'une barre (`charge_detail_loader.ts`) reprend les mêmes entrées, figées par version (`?v=`), et filtre sur (poste, bucket) au lieu de sommer : la table ne peut pas diverger de la barre par effet de cache.

### Flux d'une demande

```
ligne de demande (ORDERS WIPTYP=1, WIPSTA 1|3)
  quantité = RMNEXTQTY − ALLQTY              (reste à fabriquer, net du déjà-alloué)
  date     = ENDDAT
        │
        ├─ explosion BOM (composants FABRIQUE uniquement) ──► besoins BRUTS par article/poste
        │
        ├─ pool stock  = Σ strict (physique − alloué) + QC
        └─ pool encours = Σ (RMNEXTQTY − resteAProduire) sur les OF de l'horizon
                │
                └─ netCharge : par article, FIFO par date, stock sur le brut puis encours sur le net
                        └─ brut / net / reste  ──►  buckets f · fi · s · si
```

---

## 2. Le netting, en détail

`netCharge` (`charge_explosion.ts:419-460`) :

```ts
const byArticle = new Map<string, ChargeRaw[]>()          // regroupement par article
for (const arr of byArticle.values()) {
  arr.sort((a, b) => a.date.getTime() - b.date.getTime()) // FIFO par date uniquement
  let stockPool   = stockByArticle.get(arr[0].article) ?? 0
  let encoursPool = encoursByArticle.get(arr[0].article) ?? 0
  for (const r of arr) {
    const netQty = stockPool >= r.qty ? 0 : r.qty - stockPool
    stockPool = Math.max(0, stockPool - r.qty)             // stock consommé sur le BRUT
    const resteQty = encoursPool >= netQty ? 0 : netQty - encoursPool
    encoursPool = Math.max(0, encoursPool - netQty)        // encours consommé sur le NET
    out.push({ ...r, brutQty: r.qty, netQty, resteQty, encoursQty: netQty - resteQty })
  }
}
```

Les deux pools sont corrects dans leur principe :

- **stock strict** = `physique − allouePhys − alloueGlob` (`stock_repository.ts:77`), donc hors déjà-alloué, cohérent avec la quantité de demande `RMNEXTQTY − ALLQTY` : la part allouée est exclue des deux côtés, sans double peine.
- **en-cours** = `mo.quantity − resteAProduire(mo, avancement)` (`load_payload_loader.ts:386-396`), soit les pièces produites mais pas encore déclarées en stock. Le garde `EXTQTY === RMNEXTQTY` évite le double compte avec le stock.

Les défauts sont dans les **règles de consommation** et dans le **périmètre des pools**, pas dans leur définition.

---

## 3. Défauts constatés

### D1 — Le net du parent ne redescend jamais sur ses composants · **Haute** · visible aujourd'hui

L'explosion part de la quantité **brute** (`explodeInputs`, `load_payload_loader.ts:307-324`), puis chaque article est nette isolément. Le stock et l'en-cours d'un parent ne réduisent donc jamais le besoin de ses enfants.

- **En-cours du PF** : sur le cas que le code documente lui-même (`F326-02020`, 390 pièces sur 640 déjà produites, cf. `load_payload_loader.ts:365-380`), la ligne PF est bien ramenée à 250, mais les composants sont explosés sur **640**. Les composants des 390 pièces déjà faites sont comptés en trop — et l'en-cours du composant ne les rattrape pas, puisque ces pièces ont été consommées, pas stockées.
- **Stock libre du PF** : un stock PF non alloué réduit la ligne PF (`netCharge`) mais pas le besoin de ses composants.

**Effet** : surestimation de tout l'amont (segments `fi`/`si`), d'autant plus forte que le PF est partiellement couvert.

**Correction attendue** : netter le parent (stock + en-cours), puis exploser le reliquat — niveau par niveau.

---

### D2 — L'en-cours ignore les OF lancés avant le début de l'horizon · **Haute** · visible aujourd'hui

`mos` provient de `getOrdersForWindow(monthStart, horizonEnd)` (`load_payload_loader.ts:245`), qui filtre **`STRDAT >= monthStart`** (`of_repository.ts:206-225`). Tout OF démarré avant le 1er du mois est donc absent :

- du pool d'en-cours (`buildEncoursByArticle`) ;
- des pointages MFGOPE, puisque `startedOfs` est dérivé de `mos` (`load_payload_loader.ts:285-290`).

Cas relevés en production (STRDAT avant le 01/09/2026, reste ouvert, pièces pointées) :

| OF | Article | Pointé (MFGOPE) | Reste X3 | En-cours attendu | En-cours calculé |
|---|---|---|---|---|---|
| `F126-47696` | `MH4648` | 70 / 70 (op 5) | 70 | 70 | **0** |
| `F126-48005` | `FS4233` | 1200 (op 5) | 1198 | 1198 | **0** |
| `F125-41089` | `CE4091` | 4187 / 4200 | 13 | 13 | **0** |
| `F126-47695` | `MH0705` | 10 / 10 | 10 | 10 | **0** |
| `F126-45347` | `CE4091` | — | 1200 | (à évaluer) | **0** |

**Effet** : tout le backlog des mois précédents est invisible du cran « reste ». La charge demandée est surestimée d'autant.

**Correction attendue** : lire les OF en cours dont `STRDAT < monthStart` et `RMNEXTQTY > 0` (et leurs pointages) pour alimenter le pool d'en-cours — sans nécessairement les afficher dans la vue OF, qui est bornée à l'horizon.

Cette lecture existe déjà : `boardDataset.getOrdersForMatchingDelta` (`board_dataset.ts:238`) sort
exactement ce périmètre pour l'issue #99 — démarrés avant la fenêtre, encore ouverts, bornés aux
articles ayant de la demande dans la fenêtre (~14 lignes mesurées en PROD), cache dédié pour qu'ils
ne s'affichent nulle part. C'est un branchement, pas une requête neuve.

---

### D3 — Aucune priorité ferme > prévision à date égale · **Moyenne** · visible aujourd'hui

`netCharge` trie uniquement par date (`charge_explosion.ts:433`). À date égale, l'ordre est celui du tableau d'entrée, c'est-à-dire l'ordre SQL — et `getOrderLinesForLoad` n'a **pas d'`ORDER BY`** (`order_line_repository.ts:211-230`).

- Une prévision peut consommer le stock avant une commande ferme : le segment ferme (`f`/`fi`) est gonflé et la prévision (`s`/`si`) tombe à zéro.
- Le total net est invariant, mais la **répartition** — celle qu'on lit pour décider — ne l'est pas, et n'est pas stable d'une exécution à l'autre (cache, plan Oracle).

À comparer avec `explodeQuantity`, qui applique explicitement le ferme d'abord (`charge_explosion.ts:330-339`, « même priorité que `netMaterial` »). `netCharge` ne le fait pas.

**Correction attendue** : tri `(date, nature ferme avant prévision)`.

---

### D4 — Le pool est consommé par opération, pas par besoin · **Moyenne** · latent sur les données actuelles

`netCharge` décrémente `stockPool` à chaque `ChargeRaw`, et `explodeCharge` émet **un raw par opération de gamme** (`charge_explosion.ts:252-268`). Pour un article à plusieurs opérations sur des postes différents, le premier poste absorbe tout le stock et les suivants affichent un net plein.

Exemple : article à 2 postes, besoin 100, stock 40 → poste A net 60, poste B net **100** (attendu 60).

C'est un défaut du netting lui-même : le pool est par article, sa consommation doit l'être aussi (une fois par besoin, puis la même quantité nette appliquée à toutes les opérations). À traiter en même temps que D1, sinon la correction du netting par niveau réintroduit ce biais.

`explodeQuantity` ne l'a pas — un besoin par article, verrouillé par test
(`charge_explosion.test.ts:284`, « multi-poste : un seul besoin par article »). Seul le mode heures
consomme par opération.

**Pourquoi c'est latent, et jusqu'à quand** : `static_gammes` porte un `UNIQUE (article, workstation)`
et `syncGammes` (`static_sync_service.ts:167-184`) insère en brut après un `delete`. Deux opérations
du même article sur le **même** poste ne se replient donc pas silencieusement : elles font échouer la
synchronisation entière des gammes. D4 ne peut se réveiller que sur un article à ≥2 postes distincts
— il n'en existe aucun aujourd'hui (2907/2907 articles à un seul poste).

---

### D5 — Le pool en-cours est global par article, non peg · **Moyenne**

`buildEncoursByArticle` additionne les pièces en cours **par article**, sans lien avec la demande qu'elles servent. Un OF produit pour le stock — ou pour une autre commande — vient donc annuler un besoin client ferme. Sur un article partagé entre plusieurs commandes, le « reste » d'une ligne peut être mis à zéro par la production destinée à une autre.

**À trancher métier** : pegging de l'en-cours (par contremarque / matcher) ou acceptation explicite du pool global.

---

### D6 — Le snapshot stock est appliqué à 6 mois de demande · **Moyenne** · choix documenté

Le pool est celui d'aujourd'hui, consommé FIFO depuis la date la plus tôt. Toutes les premières échéances absorbent le stock, les buckets lointains ne sont plus nettés. Ce choix est documenté (`charge_explosion.ts:10-14`) mais n'est pas neutre pour une lecture en temps machine : il déplace de la charge du début vers la fin de l'horizon, et se combine mal avec D1/D2.

**Piste** : projeter le stock à la date du besoin (entrées/sorties) ou, a minima, borner l'usage du snapshot aux premiers buckets et l'afficher.

---

### D7 — Le stock QC est compté comme disponible · **Faible/Moyenne** · choix documenté

`computeChargeStock` additionne `strict` **et** `qc` (`load_payload_loader.ts:340`). Le stock sous contrôle qualité n'est pas libéré : le compter comme disponible est optimiste, et c'est précisément sur les composants (niveaux inférieurs) que le QC est le plus fréquent.

**Piste** : exposer les deux, ou n'utiliser le QC qu'en repli signalé.

---

### D8 — `EXTQTY = 0` : reste nul ET en-cours plein · **Haute** · conditionné aux données X3

`resteAProduire(q, 0, 0) = max(0, min(q, 0 − 0)) = 0`. Et `toNum` (`of_repository.ts:266`) rend
`Number.parseFloat(v ?? '0') || 0` — **jamais `null`**. La branche de repli `launched == null`
(« reste = quantité ») est donc morte sur ce chemin : un OF sans quantité lancée ne retombe pas sur
sa quantité, il tombe à zéro.

Deux effets, dans le même geste :

- **vue OF** : l'OF est facturé **0 h** et disparaît de la barre ;
- **vue commande** : `buildEncoursByArticle` (`load_payload_loader.ts:386-396`) ne filtre **aucun
  statut** — l'OF verse `quantity − 0 = quantity` **entière** dans le pool « pièces déjà produites,
  pas encore déclarées », qui efface de la demande réelle sur le cran `reste`.

Or `getOrdersForWindow` ramène les WIPSTA 1, 2 **et** 3. Tout OF planifié ou suggéré du pool dont
`EXTQTY_0` vaut 0 crédite donc un en-cours fictif à hauteur de sa quantité.

Le seul rempart est l'assertion de l'annexe (« aucun `EXTQTY = 0` avec `RMNEXTQTY > 0` »), qui n'est
couverte par **aucun test** : `of_avancement.test.ts:162` ne teste que `null`/`undefined`, jamais `0`.
Requête de contrôle à passer avant de conclure :

```sql
SELECT WIPSTA_0, COUNT(*) FROM ORDERS
WHERE WIPTYP_0 = 5 AND RMNEXTQTY_0 > 0 AND (EXTQTY_0 = 0 OR EXTQTY_0 IS NULL)
GROUP BY WIPSTA_0
```

Si les suggérés (WIPSTA=3) en sortent, D5 n'est plus « pool global non peg » mais « pool inventé ».

**Correction attendue** : borner le pool d'en-cours aux OF réellement démarrés (statut ferme +
`STRDAT` passé, le même critère que `startedOfs`), et couvrir `launched = 0` par un test.

---

### D9 — La troncature depth-4 est silencieuse · **Moyenne** · visible aujourd'hui

`explodeCharge` (`charge_explosion.ts:246-271`) ne passe **aucun** hook `onDepthCut`, contrairement à
`explodeQuantity` qui tient un compteur `stats.truncated` + `cutParents`. Ce qui dépasse `maxDepth = 4`
disparaît sans compteur, sans marque à l'écran.

Chaînes fabriquées réelles atteignant le niveau 5 dans la réplique (8 occurrences) :

```
EHP1874GM / SE7043 / EH5853 / EH5852 / FS5938 / FS5840
EHP1875GM / SE7043 / EH5853 / EH5852 / FS5938 / FS5840
EHT087BA  / EHT097 / MH2365 / MH2918 / FE2363 / FS2292
EHT815EX  / EHT114 / MH2365 / MH2918 / FE2363 / FS2292
EHT816EX  / EHT114 / MH2365 / MH2918 / FE2363 / FS2292
EHT969AB  / EHT114 / MH2365 / MH2918 / FE2363 / FS2292
EHT969EX  / EHT114 / MH2365 / MH2918 / FE2363 / FS2292
EHT969GM  / EHT114 / MH2365 / MH2918 / FE2363 / FS2292
```

Le 5e niveau est coupé : `FS5840` (poste `PP_082`, cadence 667) et `FS2292` (poste `PP_099`,
cadence 725).

Les deux ont une gamme et une cadence renseignées : c'est de la charge réelle, perdue sans bruit.

**Correction attendue** : passer le hook `onDepthCut` en mode heures et remonter le compteur au
payload, comme le fait déjà le plan appro.

---

### D10 — Aucun offset de lead time · **Moyenne** · choix documenté, non listé

Tous les niveaux sont datés à l'**échéance du PF** (`walkExplosion` propage `date` sans décalage).
Un composant de niveau 3 nécessaire à un PF dû fin novembre charge donc son poste fin novembre, alors
qu'il doit être produit des semaines avant.

Choix annoncé en tête de `charge_explosion.ts:10-14`, mais absent de la synthèse — alors qu'en maille
hebdo il déplace plus de charge que D7, et qu'il se combine avec D6 (le stock est consommé FIFO sur
des dates qui sont déjà les mauvaises).

---

### D11 — L'offre planifiée n'est jamais déduite · **Moyenne** · choix implicite

Dans la vue commande, seul l'en-cours **physiquement produit** réduit le besoin. Un OF ferme qui
couvre exactement la demande mais n'a pas encore démarré ne retire rien : le besoin reste plein
jusqu'à ce que l'atelier pointe.

C'est défendable (la vue commande lit la demande, la vue OF lit l'offre) mais ce n'est écrit nulle
part, et ça se cumule avec D1 et D2 : le lecteur voit une charge qu'il croit nette d'un lancement
déjà décidé.

**À trancher métier** en même temps que D5 — c'est la même question : que déduit-on du besoin, et
au nom de quel engagement.

---

### D12 — `ITMSTA_0 = 1` filtre la demande · **Moyenne** · visible aujourd'hui

`getOrderLinesForLoad` (`order_line_repository.ts:225`) pose `AND I.ITMSTA_0 = 1` dans le `WHERE`.
Une commande ferme portant un article non actif sort de la charge **sans trace** : pas d'erreur, pas
de compteur, une barre simplement plus basse.

Même forme que le défaut ITMSTA_0 corrigé côté ingestion (issue #105, 118 OF fermes perdus) : un
filtre de consommateur posé sur une source.

---

### D13 — L'explosion tourne deux fois par payload · **Faible** · perf

`explodeInputs` est appelé par `computeChargeStock` (`:333`) **puis** par `computeChargeNeeds`
(`:357`). Deux descentes BOM depth-4 sur toute la demande 6 mois par miss de cache — trois quand un
détail de bucket suit sans version figée. Le résultat de la première n'est jamais réutilisé.

**Correction attendue** : passer les raws déjà explosés à `computeChargeNeeds`, comme le stock figé
l'est déjà.

---

## 4. Autres calculs

### 4.1 Capacité — correcte, sauf les jours non ouvrés

- Mapping `DAYCAP_0..6` = Lundi→Dimanche cohérent avec `dayIndex = (getDay()+6)%7` (`capacity.ts:19`) et la synchronisation (`static_sync_service.ts:82-88`).
- Fériés et fermetures en ISO **local** (`isoDay`, `utils/dates.ts`), cohérent avec `calendar.factor` (`working_calendar.ts:44-56`). Le plus restrictif l'emporte.
- **Défaut** : la charge n'est pas décalée des jours non ouvrés. Un besoin daté un samedi, un dimanche ou un férié alimente un bucket dont la capacité exclut ce jour → saturation mécaniquement gonflée. Sur un outil de décision, ce n'est pas neutre pour les buckets hebdo.
- **Détail** : la sentinelle « fermé » de X3 vaut `0.01` h et le code ne l'écarte pas (`if (c <= 0) continue`, `load_payload_loader.ts:531`). Ce n'est pas « le samedi » : dans la réplique, `daycap_5 = 0.01` sur **tous** les postes, `daycap_6 = 0.0`, et `PP_001` porte `0.01` **le vendredi aussi**. Négligeable en volume, mais ce n'est pas zéro, et le test doit porter sur la sentinelle, pas sur le jour. (`PP_078` à 24 h/j samedi compris est un poste continu, pas une sentinelle.)

### 4.2 Arrondis — barre vs table

`round` arrondit chaque segment **par période** (`load_payload_loader.ts:153-159`) alors que le détail d'un bucket renvoie les heures non arrondies (`charge_detail_loader.ts`). La hauteur de barre et le total de la table peuvent donc différer d'une fraction d'heure. Le pinning par version a réglé la divergence de snapshot X3, pas celle-ci.

### 4.3 `resteAProduire` — formule correcte, garde-fou absent

`resteAProduire = min(RMNEXTQTY, EXTQTY − qtyRealisee)` (`of_avancement.ts:137-144`) : la formule est
juste, et la borne par `RMNEXTQTY` évite la double déduction quand X3 a déjà netté.

La vérification initiale portait sur la mauvaise branche. `launched == null` est **inatteignable**
depuis `of_repository` (`toNum` rend toujours un nombre) ; la branche qui compte est `launched = 0`,
qui rend 0 et non la quantité. Voir **D8** — c'est là que se joue le risque, et il n'est pas testé.

### 4.4 Buckets — corrects

Clés mensuelles `YYYY-M` et hebdo (lundi ISO) cohérentes avec la construction des buckets ; bornes de mois posées au 1er (pas de débordement `setMonth`) ; `addDays` en jours civils (pas `n × DAY_MS`), donc pas de dérive aux changements d'heure.

### 4.5 Vérifiés bénins — ne pas rouvrir

Deux filtres de l'explosion ont l'air de trous ; la donnée dit que non.

- **`hasChargeRoute` élague tout le sous-arbre d'un PF sans gamme** (`charge_explosion.ts:248`) :
  19 parents de nomenclature n'ont pas de gamme dans la réplique, **tous** en `ACHAT` / `AFANT` —
  aucun produit fini fabriqué. Aucune charge induite perdue aujourd'hui.
- **`collectBom` en mode heures ne garde que les liens `FABRIQUE`** (`charge_explosion.ts:393`) :
  **zéro** composant `ACHETE` possède des enfants `FABRIQUE`. Aucun sous-ensemble fabriqué n'est
  caché derrière un lien acheté ou un fantôme.

À recontrôler si le référentiel change de forme — ce sont des constats de données, pas des garanties
de code.

Enfin, un point d'agrégation qui aurait pu déraper et ne dérape pas : la première et la dernière
semaine de l'horizon sont tronquées **identiquement** côté charge et côté capacité (les deux bornées
à `[monthStart, horizonEnd]`, cf. `:526-535` et `:569`). Pas de biais de bord sur la saturation.

---

## 5. Synthèse

| Réf. | Défaut | Sévérité | Visible aujourd'hui |
|---|---|---|---|
| D8 | `EXTQTY = 0` → reste nul et en-cours fictif plein | Haute | à confirmer en X3 |
| D1 | Net du parent non propagé aux composants | Haute | oui |
| D2 | En-cours des OF lancés avant l'horizon ignoré | Haute | oui |
| D3 | Pas de priorité ferme > prévision à date égale (+ déterminisme) | Moyenne | oui |
| D4 | Pool consommé par opération au lieu de par besoin | Moyenne | latent |
| D5 | Pool en-cours global, non peg | Moyenne | oui |
| D6 | Snapshot stock appliqué à 6 mois | Moyenne (choix) | oui |
| D7 | Stock QC compté disponible | Faible/Moyenne (choix) | oui |
| D9 | Troncature depth-4 silencieuse (8 chaînes réelles) | Moyenne | oui |
| D10 | Aucun offset de lead time | Moyenne (choix) | oui |
| D11 | Offre planifiée jamais déduite du besoin commande | Moyenne (choix) | oui |
| D12 | `ITMSTA_0 = 1` filtre la demande sans trace | Moyenne | oui |
| D13 | Explosion BOM jouée deux fois par payload | Faible (perf) | oui |
| 4.1 | Charge non décalée des jours non ouvrés | Moyenne | oui |
| 4.2 | Arrondis barre ≠ table | Faible | oui |

**Ordre de correction proposé** : D8 (une requête tranche, correction courte, effet le plus large)
→ D1 (structure du calcul) → D2 (périmètre du pool, branchement d'une lecture existante)
→ D3 + D4 (règles de consommation) → D9 + D12 (rendre visible ce qui disparaît) → 4.1 → D13 (perf)
→ D5/D6/D7/D10/D11 (à trancher métier, ensemble : c'est une seule question — que déduit-on du besoin
et à quelle date).

---

## Annexe — preuves X3 (extraits)

**En-cours invisibles (D2)** — OF `WIPTYP=5`, `RMNEXTQTY > 0`, `STRDAT < 01/09/2026`, pointages MFGOPE `CPLQTY > 0` :

```
F126-47696  MH4648  EXTQTY=70    RMNEXTQTY=70    op5 CPLQTY=70    STRDAT=06-JUL-26
F126-48005  FS4233  EXTQTY=1200  RMNEXTQTY=1198  op5 CPLQTY=1200  STRDAT=25-JUN-26
F125-41089  CE4091  EXTQTY=4200  RMNEXTQTY=13    op5 CPLQTY=4187  STRDAT=15-JUL-26
F126-47695  MH0705  EXTQTY=10    RMNEXTQTY=10    op5 CPLQTY=10    STRDAT=16-JUL-26
F126-45347  CE4091  EXTQTY=1200  RMNEXTQTY=1200  —                STRDAT=06-MAY-26
```

**Pas de cas `EXTQTY = 0` avec `RMNEXTQTY > 0`** (toutes catégories d'OF confondues) : `resteAProduire` ne dégénère pas.

⚠️ Ce relevé n'a **pas** été rejoué le 10/09/2026, et c'est le seul garde-fou de **D8** — la requête
de contrôle est donnée avec ce défaut. Idem pour le tableau des en-cours invisibles de D2 : les cinq
OF n'ont pas été revérifiés (MCP `supply-board` injoignable, réplique locale statique uniquement).

**Strict stock** (`stock_repository.ts:77`) :

```
strict = PHYSTO − PHYALL − GLOALL      // hors déjà-alloué
```

**Demande** (`order_line_repository.ts:218, 226`) :

```
RESTE_LIVRER = O.RMNEXTQTY_0 − O.ALLQTY_0     // même exclusion de la part allouée
```
