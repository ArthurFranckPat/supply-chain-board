# Revue architecturale — Module « Évolution des besoins » (#138, lot 1 bis)

**Objet examiné.** Le PRD `docs/prd-138-ecran-evolution-besoins.md` (proposition) et l'implémentation qui en découle : `app/domain/cbn_driver_diff.ts`, `app/domain/diff_frise.ts`, `app/domain/snapshot_perimetre.ts`, `app/services/demand_snapshot_service.ts`, `app/controllers/appro_controller.ts`, `inertia-react/pages/besoins-evolution.tsx`, et la branche `fix/referentiel-articles-statut` (statut article). Vérifié sur le code, la base locale (10 photos 30/07 → 08/08), les migrations et les tests (114 unitaires passent, typecheck et lint verts sur les fichiers du module).

---

## 1. Problème, utilisateur, résultat visé

**Problème.** Le lot 1 a livré le moteur de diff des besoins et son endpoint, mais aucune interface : le diff n'est visible qu'à travers `/approvisionnements`, filtré aux articles porteurs d'un message CBN. L'historique des besoins — la donnée la plus riche du module (9 photos contre 2 pour les messages) — est invisible.

**Utilisateur.** Approvisionneur (quotidien), responsable supply (hebdomadaire).

**Résultat visé.** « Qu'est-ce qui a changé dans mes besoins depuis la semaine dernière, dans quel sens, de combien ? » — sans le filtre « cet article porte un message ».

**Mesure de succès.** Écran de lecture qui rend un couple de photos comparables, trie par amplitude, borne le payload, et distingue explicitement « rien n'a bougé » de « la photo manque ».

**Périmètre et contraintes.** Aucun appel X3 (tout SQLite) ; pas de valorisation ; pas d'écriture ; pas de corrélation message ↔ driver (c'est `/explanations`).

**Tradeoff principal.** Le serveur borne (200/1000) pour tenir le payload (~6 500+ mouvements sur un écart de 7 jours) ; le client affine (filtres source/nature/recherche). Le tri par amplitude relative est le proxy assumé d'une valorisation inexistante.

Le PRD est clair sur tout ceci. **Ce qui n'est pas dit** : le PRD décrit un écran, le livré en est un autre (voir F1).

---

## 2. Un cas réel tracé de bout en bout

**Cas : l'approvisionneur ouvre la page un matin, couple 06/08 → 07/08.**

1. `GET /besoins/evolution` → `appro_controller.evolution` → rend `besoins-evolution` (props vides, tout est client-side).
2. Le composant charge `GET /api/v1/appro/snapshots` → `listSnapshots()` lit `demand_snapshots` (groupé par date, avec `min(created_at)` comme heure réelle de capture) → les deux Select se remplissent, défaut = deux dernières photos.
3. `GET /api/v1/appro/drivers-frise?avant=2026-08-06&apres=2026-08-07&limit=1000&nature=...` → `friseDrivers` lit les dates distinctes de la plage, chaîne les diffs des paires consécutives via `diffDrivers` (cache `appro:drivers:06:07:v12`), mémoïse les lectures de journées (`MemoJourneesBorne`, capacité 8), agrège par article (`construireFrise`, budget 1000, compteurs exacts pré-filtres).
4. Dans le diff : périmètre comparé = intersection des sources (journal `demand_snapshot_sources` s'il existe, sinon garde-fou `SOURCES_ATTENDUES`) ; enrichissement désignation/famille/appro/fournisseur depuis `static_articles` (lecture non filtrée, pour écarter catégorie Z et statut 6) ; tri par amplitude relative.
5. L'écran affiche : bandeaux trous/périmètre/volumétrie si besoin, groupe d'articles, tableau Jour/Pièce/Source/Nature/Échéance/Avant→Après/Écart, clic → `stock-article-sheet`.
6. Cas 06 → 07 (0 mouvement réel) : `total === 0` → carte « Aucun mouvement au-delà des seuils » + rappel des seuils. Jamais un tableau vide muet.

Le chemin est cohérent, les états d'échec (moins de 2 photos, photo illisible, pas sans source commune, plage trop large, erreur réseau) sont tous explicites. La chaîne est dominée par des décisions de robustesse bien documentées (#145 périmètre, #149 journal, #143 frise).

---

## 3. Findings

### F1 — Important : le PRD ne décrit plus le module livré

**Localisation.** `docs/prd-138-ecran-evolution-besoins.md` § 3, 6, 9 vs commits `cd950f8` (backend + page), `9482e9c` (frise #143) et les refontes UI suivantes.

**Écart.** Le PRD spécifie un diff **deux photos quelconques** avec bandeau de tuiles par source ; le livré est une **frise chaînée jour à jour** (`/drivers-frise`, `diff_frise.ts`, agrégation par article datée du pas) avec un **Select** à la place des tuiles, et une **5ᵉ nature** (`renumerotation`) que le PRD ne connaît pas. Le PRD § 3 reportait explicitement le temporel au lot 2 (« Pas de graphe temporel multi-photos »). Les critères d'acceptation § 9 ne sont pas remappés (le « bandeau de synthèse » § 6 point 2 a disparu ; « < 2 s à froid » vaut pour un couple, pas pour une frise large).

**Impact.** Un nouveau venu relirait le PRD et construirait le mauvais écran ; la croissance de scope (nouvel endpoint, nouveau domaine, agrégation, refonte de la page) n'est tracée nulle part ; les critères 2 et 8 sont invérifiables tels qu'écrits.

**Preuve.** Commits ci-dessus ; la page n'appelle que `/drivers-frise` (ligne 601 de `besoins-evolution.tsx`), jamais `/drivers-diff`.

**Correction minimale.** Mettre à jour le PRD (ou une note ADR) : la décision frise, son motif (un besoin avancé puis reculé se lit « inchangé » entre deux bornes, et une ligne disparue se marie de force à une ligne sans rapport), et le remapping des critères 2/4/8.

---

### F2 — Important : le cache `forever` empoisonne `null` pour toujours

**Localisation.** `demand_snapshot_service.ts:571` (`diffDrivers`), `:890` (`explainMessages`), `cache_ns.ts` / bentocache `getOrSetForever`.

**Défaut.** La factory de `diffDrivers` retourne `null` quand une photo manque (`avantRows.length === 0`). Bentocache stocke `null` sans broncher (seul `undefined` lève `UndefinedValueError` — vérifié dans `node_modules/bentocache/build/index.js`). Une requête avec des dates inexistantes (`?avant=2026-01-01&apres=2026-01-02`) met en cache `null` **pour toujours** sous `appro:drivers:2026-01-01:2026-01-02:v12`. Si une photo de ces dates est ensuite écrite (backfill `snapshot:run --date`, opération supportée et testée), l'endpoint continuera de répondre « photo(s) illisible(s) » indéfiniment.

**Impact.** Échec silencieux et permanent, sans purge possible côté application (clé identique, TTL nul). Déclencheur étroit (dates fournies par l'utilisateur ou backfill), mais le mode de défaillance est exactement celui que le module cherche à éviter : « rien à afficher » et « la photo manque » confondus.

**Preuve.** `getOrSetForever` = `cloneWith({ ttl: null })` + `stack.set(result)` ; `isEntryValid` rend `true` pour toute entrée non-`undefined` ; test d'idempotence/backfill dans `demand_snapshot_service.test.ts`.

**Correction minimale.** `factory({ skip })` quand une photo est vide (bentocache ne stocke alors rien), ou valider l'existence des deux dates avant d'appeler le cache.

---

### F3 — Important : ré-écrire une date (re-run) rend les caches `forever` périmés

**Localisation.** `demand_snapshot_service.ts:951` (`write`, swap idempotent delete + re-insert par date) vs clés `appro:drivers:${avant}:${apres}:v12` / `appro:explications:...:v3`.

**Défaut.** Le contrat du cache pose « une photo est immuable une fois écrite » (PRD § 5.4, commentaires du code). Mais `write()` **remplace** une photo existante par design, et le scénario est documenté dans le code lui-même : run nocturne 04 h, puis `snapshot:run` manuel à 15 h pendant qu'X3 sature. Si un re-run réécrit une date avec un contenu différent (ou un journal `demand_snapshot_sources` différent), tous les diffs et explications cacheadés impliquant cette date restent **périmés pour toujours** — la clé ne porte que les deux dates, pas une empreinte du contenu.

**Impact.** Deux écrans peuvent servir deux vérités sur le même couple de photos — précisément le défaut que la doctrine « version obligatoire » du code dénonce dans `explainMessages` (lignes 883-889).

**Preuve.** `write()` delete + insert (lignes 1006-1017) ; test « idempotent : rejouer pour la même date REMPLACE » ; le provider (`needsSnapshot`) empêche le re-run du jour courant mais pas des dates passées.

**Correction minimale.** Clé augmentée d'une empreinte de la photo (ex. `max(created_at)` par date, ou version de contenu), ou invalidation du namespace `appro` à l'écriture, ou interdiction documentée du re-run d'une date passée.

---

### F4 — Important : le workstream « statut article » change la factory sans bumper la clé de cache

**Localisation.** Branche `fix/referentiel-articles-statut`, commit `f482355` : exclusion catégorie Z + statut 6 dans la factory de `diffDrivers` (lignes 689-705) ; clé toujours `v12` (ligne 571).

**Défaut.** L'exclusion est **dans la valeur cacheadée**. En PROD, les couples déjà cacheadés avant le fix continueront de servir les articles morts (`ET####`, ~106 lignes de frise) pour toujours, car la clé ne change pas. C'est le cas d'école de la doctrine que le code s'est donnée (« Version OBLIGATOIRE… deux écrans, deux vérités ») — et la discipline vient de faillir.

**Impact.** Le correctif ne prendra effet que sur les couples jamais cacheadés ; des articles morts resteront visibles indéfiniment après le merge.

**Preuve.** `git show f482355` : `WHERE ITMSTA_0 = 1` retiré du sync, exclusion ajoutée dans la factory ; `key: ...v12` inchangé dans le working tree et dans HEAD.

**Correction minimale.** Bumper `v12 → v13` (et `v3 → v4` pour les explications, qui dérivent du diff) **dans le même commit** que l'exclusion.

---

### F5 — Important (léger) : contrats de compteurs divergents entre les deux endpoints

**Localisation.** `appro_controller.ts:238-243` (`driversDiff` : `parSource`/`parNature` creux, clés présentes seulement) vs `:436-437` (`driversFrise` : `compteurVide(DRIVER_SOURCES)` / `compteurVide(DRIVER_DIFF_NATURES)`, toutes les clés à 0).

**Défaut.** Même sémantique (§ 6 : « une source à 0 reste affichée »), deux formes de réponse. C'est le précurseur exact du défaut #143-3 (clé absente lue `undefined` sous un type qui promet `number`). La page n'utilise que `drivers-frise`, donc pas de bug visible aujourd'hui — mais l'API publique `drivers-diff` est incohérente avec sa sœur.

**Correction minimale.** Utiliser `compteurVide` dans `driversDiff` aussi (import partagé depuis `diff_frise.ts`).

---

### F6 — Note : `drivers-diff` n'est plus consommé par l'UI

La page n'appelle que `/drivers-frise` ; `/drivers-diff` reste un endpoint public et le socle du service (`diffDrivers` partagé, cache commun). Ce n'est pas une faute — c'est le contrat § 5.3 du PRD, utile aux clients API — mais c'est une décision à prendre explicitement : endpoint public documenté, ou surface interne. Voir Q2.

### F7 — Note : la contrainte « aucun appel X3 » vaut pour l'écran, pas pour la fiche

L'écran principal ne lit que `/api/v1/appro/*` (SQLite). Mais le clic ouvre `stock-article-sheet.tsx`, qui appelle `/api/v1/dashboard/stock/article` → `loadStockArticleDetail`, lequel touche X3 (avec repli gracieux `x3Error`). Le critère 7 (« l'écran répond X3 éteint ») tient pour l'écran ; la fiche est un composant préexistant avec son propre fallback. À clarifier dans le PRD remappé (F1).

### F8 — Note perf : frise sur plage large, cache froid

`MAX_PAS_FRISE = 45`, `CAPACITE_MEMO_JOURNEES = 8`. Sur une plage large au premier chargement, le mémo ne dédoublonne que partiellement (~90 lectures de ~73 000 lignes ≈ 6,6 M lignes pour 45 pas). Borné, affiché avec état de chargement, calculé une seule fois (cache par paire) — acceptable, mais le critère « < 2 s à froid » du PRD doit être rescopé au couple, pas à la frise.

---

## 4. Questions ouvertes

**Q1 (Importante, recommandation).** Le bump `v12`/`v3` est une discipline manuelle, et F4 prouve qu'elle vient de faillir. Faut-il un garde-fou mécanique (test qui échoue si le domaine change sans bump, ou hachage du code dans la clé) ? Recommandation : au minimum documenter la convention dans `cache_ns.ts` (elle n'y est pas) et ajouter un test de bump à chaque évolution sémantique de `diffCbnDrivers`.

**Q2 (Importante, recommandation).** `drivers-diff` reste-t-il public ? Recommandation : oui, mais le dire — c'est le contrat § 5.3 et le socle de la frise ; le déclarer interne sans le supprimer serait le pire des deux mondes.

**Q3 (Mineure).** La frise répond à une question voisine de celle du PRD (« ce qui bouge nuit par nuit », pas « le solde depuis la semaine dernière »). Les deux sont valides ; le PRD remappé (F1) doit dire laquelle est servie.

---

## 5. Évaluation

Le socle est très solide : domaine pur et abondamment testé (114 tests unitaires verts sur les 4 fichiers du module, typecheck et lint verts), états d'échec explicites partout, bornage serveur, cache par paire, séparation réalité/propositions, exclusion des articles morts, contrat d'ordre du diff garanti par le domaine. Les décisions de robustesse (#145 périmètre, #149 journal, #143 frise, passe-0 jumeau exact) sont bien argumentées, documentées et vérifiées sur données réelles.

Les quatre findings importants sont des défauts de **contrat de cache** (F2, F3, F4) et de **documentation/scope** (F1, F5) — aucun ne remet en cause la conception du moteur ni la sécurité du module. Les corrections sont petites et localisées.

**Non vérifié ici** : rendu visuel (pas de Playwright — revue navigateur utilisateur requise, critères 4/5/6), timings réels navigateur (critère 8), données PROD (12 882 articles / 6 331 morts — assertion du commit de branche, non recoupée avec X3), chemin journal #149 (table vide en base de dev, exercé par les tests seulement).

---

## 6. Verdict

**Request changes.**

Pas de blocker. Quatre findings importants, tous corrigeables en quelques lignes :

1. **F4** — bumper `v12 → v13` / `v3 → v4` avec l'exclusion statut, **avant** merge de `fix/referentiel-articles-statut`.
2. **F2** — ne pas cacher `null` (`factory({ skip })` ou validation des dates avant cache).
3. **F3** — clé de cache empreinte de la photo, ou invalidation à l'écriture.
4. **F1** — remapper le PRD sur la frise ; **F5** — unifier les compteurs.

Q1 (garde-fou mécanique du bump) est la suite logique de F4 : la discipline a déjà failli une fois.
