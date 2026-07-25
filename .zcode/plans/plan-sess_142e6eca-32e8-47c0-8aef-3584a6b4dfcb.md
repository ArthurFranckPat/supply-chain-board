## Migration Carbon complète de /suivi

### Constat de l'exploration

Le socle est meilleur que prévu : `DataTable` rend déjà via `FlatTable` Carbon, le `Sidebar` du détail est déjà Carbon, le `Masthead` est déjà Carbon. Mais la toolbar (tracking.tsx), les vues tableau (reactive/proactive_view), les colonnes (colonnes avec badges custom), et le contenu du drawer détail (558 lignes de div-soup) sont encore 100% Tailwind. Pire : 4 composants Carbon (`Search`, `ButtonToggleGroup`, `Button`, `DateRange`) sont **importés mais jamais utilisés** dans tracking.tsx — preuve que la migration a été commencée puis abandonnée.

### Décisions structurantes

1. **Refactor d'abord** : extraire `SuiviTableView` commun de `reactive_view` + `proactive_view` (95% dupliqués) AVANT de migrer — sinon on migre deux fois la même chose.
2. **Helper de tone** : créer `toneToCarbonPill()` qui mappe `BADGE_TONE` / `VERDICT_TONE` / `OF_STATUT` → `Pill` Carbon. Le pattern `as any` pour passer des className est établi (data-table.tsx, masthead.tsx) — on le réutilise.
3. **3 sections restent bespoke** (domaine pur, pas d'équivalent Carbon) : le stepper du cycle commande, la jauge de quantité multi-segments, la cascade BOM avec timeline de livraison. Elles sont migrées en intégrant `Typography`/`Number`/`Pill` pour les éléments périphériques mais gardent leur structure de visualisation.

### Phase 1 — Toolbar de tracking.tsx (impact visuel max, swaps triviaux)

Remplacer les composants importés-inutilisés par leur vrai usage Carbon :

| Élément | Lignes actuelles | Cible Carbon | Gain |
|---|---|---|---|
| Recherche masthead | 277-289 (12 l. de div+input) | `<Search value={query} onChange=…>` | -10 lignes |
| Toggle Réactif/Proactif | 296-319 (24 l. de div+button) | `<ButtonToggleGroup>` + 2× `<ButtonToggle>` | -18 lignes |
| Bouton Actualiser | 419-435 (16 l. de button custom) | `<Button iconType="refresh" isLoading={activeLoading}>` | -10 lignes |
| Date range popover | 437-470 (34 l. de popover+Calendar custom) | `<DateRange>` Carbon (adapt `applyRange`) | -25 lignes |
| Compteur filtré/total | 398-402 | `<Number>` pour les chiffres tabulaires | polish |

### Phase 2 — Vues tableau (erreur/loading/empty → Carbon)

**D'abord** : extraire `SuiviTableView` commun de `reactive_view` + `proactive_view` (un seul composant paramétré par `mode`, `columns`, `rows`, `emptyState`). Puis migrer :

| Élément | Cible Carbon |
|---|---|
| Bandeau erreur X3 | `<Message variant="error" title="Erreur chargement suivi :">` |
| Overlay de chargement | `<Loader size="large">Calcul en cours…</Loader>` (garder le wrapper absolute) |
| Erreur de calcul | `<Message variant="error">` |
| Empty state | `<Message>` + `<Button buttonType="tertiary" iconType="filter_alt_off">Réinitialiser</Button>` |

### Phase 3 — Badges → Pill partout (helper + batch)

Créer `inertia-react/lib/suivi/pill_tones.ts` qui mappe chaque tone vers une config `Pill` Carbon :

```
BADGE_TONE.exp   → Pill fill green   "À expédier"
BADGE_TONE.alc   → Pill fill amber   "À allouer"
BADGE_TONE.ret   → Pill fill red     "Retard"
VERDICT_TONE.*   → Pill (5 variantes)
OF_STATUT.1/2/3  → Pill (WOF/WOP/WOS)
Type MTS/MTO/NOR → Pill brand
```

Batch-convert dans : `reactive_columns.tsx`, `proactive_columns.tsx` (status/verdict/couverture badges), `suivi_detail_sheet.tsx` (livraison, OF statut, manquants, type).

### Phase 4 — Contenu du drawer détail (SuiviDetailSheet)

Section par section :

| Section | Lignes | Action |
|---|---|---|
| Stepper cycle commande | 96-160 | **Bespoke** (pas de Stepper Carbon) — intégrer `Typography` pour labels |
| Header carte commande | 162-209 | `Typography` (labels/values) + `Pill` pour le chip Type |
| Alerte recommandation | 211-233 | `<Message variant={info\|warning\|error}>` — swap quasi 1:1 |
| Cartes Expé & Délais | 235-261 | `Typography` + `Pill` pour le badge statut/verdict |
| Jauge quantité | 263-311 | **Bespoke** (barre multi-segments) — `Number` pour les chiffres, `Typography` pour labels |
| Cascade BOM goulots | 313-429 | **Bespoke** (visualisation récursive domaine) — `Pill`/`Badge` pour "−N manquants", `Typography` pour codes |
| Cartes OF | 431-511 | `Pill` pour statut OF + "En cours" + manquants ; `Typography`/`Number` pour les valeurs |
| Emplacements stock | 513-549 | `Typography` + `Number` pour qtés |

Mécanique : tous les `<h3>`/`<h4>` → `Heading`, les `<p>`/`<span>` de corps → `Typography`, les grands chiffres mono → `Number`.

### Ce qui reste bespoke (honnêtement, pas d'équivalent Carbon)

- **Stepper 5 étapes** (cycle commande) : encode une machine à états supply-chain (CQ violet, en-zone ambre…). Carbon n'a pas de Stepper en v161.
- **Jauge quantité multi-segments** : barre empilée 3 segments (strict/CQ/reliquat). Carbon `ProgressBar` est single-value.
- **Cascade BOM + timeline livraison** : visualisation récursive domaine (parent → composants → réceptions → descente nomenclature).
- **Compteurs sur chips toolbar** (sub-badge "12/45") : `Pill` n'a pas de count trailing.
- **`ping` animé** ("débuté") : pas d'équivalent Carbon.

Ces sections restent en structure Tailwind mais leurs éléments périphériques (textes, badges, chiffres) passent en Carbon.

### Fichiers touchés

| Fichier | Action |
|---|---|
| `inertia-react/pages/scheduler/tracking.tsx` | Toolbar → Carbon (Phase 1) |
| `inertia-react/components/tracking/reactive_view.tsx` | Fusion dans `SuiviTableView` (Phase 2) |
| `inertia-react/components/tracking/proactive_view.tsx` | Fusion dans `SuiviTableView` (Phase 2) |
| `inertia-react/components/tracking/suivi_table_view.tsx` | **Création** (composant commun extrait) |
| `inertia-react/components/tracking/suivi_detail_sheet.tsx` | Badges→Pill, alertes→Message, textes→Typography (Phases 3+4) |
| `inertia-react/lib/suivi/reactive_columns.tsx` | Badges → Pill (Phase 3) |
| `inertia-react/lib/suivi/proactive_columns.tsx` | Badges → Pill (Phase 3) |
| `inertia-react/lib/suivi/pill_tones.ts` | **Création** (helper tone→Pill) |

### Critère de sortie

- `npm run typecheck` vert.
- Validation visuelle navigateur sur `/suivi` : toolbar Carbon (Search, ButtonToggleGroup, Button, DateRange), bandeaux d'erreur/loading en Message/Loader Carbon, badges en Pill Carbon dans les tables et le drawer, alertes recommandation en Message Carbon.
- Les 3 visualisations domaine (stepper, jauge, cascade BOM) restent structurellement identiques mais leurs éléments périphériques sont Carbon.

### Séquence d'exécution

Je propose d'exécuter dans l'ordre Phase 1 → 2 → 3 → 4, en committant/validant visuellement entre chaque phase plutôt que tout d'un coup. Ainsi si quelque chose casse visuellement on le rattrape tôt. Dis-moi si tu préfères tout d'un bloc.