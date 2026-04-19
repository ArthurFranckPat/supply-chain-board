---
name: charge-hebdo
description: |
  Analyse la charge de production par poste de travail sur un horizon S+1 à S+3, à partir des fichiers gammes.csv et of_entetes.csv. Calcule les heures chargées par poste et par semaine, compare avec les capacités théoriques 1×8 / 2×8 / 3×8, identifie les goulots et produit un tableau de synthèse prêt pour la réunion de charge du mardi. Déclencher ce skill dès que l'utilisateur mentionne : charge de production, analyse de charge, capacité atelier, poste de travail, goulot, 2×8, 3×8, réunion du mardi, planifier S+1, S+2, S+3, taux de charge, heures disponibles, organisation des ateliers, ou demande si la production est faisable sur une période donnée.
---

# Charge Hebdo

Analyse de la charge de production par poste sur S+1 à S+3 pour préparer la réunion de charge du mardi.

---

## 1. Données requises

| Fichier | Colonnes utilisées |
|---------|-------------------|
| `Gammes.csv` | ARTICLE, POSTE_CHARGE, LIBELLE_POSTE, CADENCE |
| `Ordres de fabrication.csv` | NUM_ORDRE, ARTICLE, STATUT_ORDRE, DATE_FIN, QTE_RESTANTE_LIVRAISON |

Demander à l'utilisateur le chemin vers le dossier `data/` si non précisé (exemple : `--data-dir data`).

**Horizon par défaut** : S+1 à S+3 à partir de la date du jour.
**Référence date** : aujourd'hui = 2026-03-24 (injecter via variable d'environnement ou paramètre si disponible).

---

## 2. Algorithme de calcul de charge

### Étape 1 — Filtrer les OF dans l'horizon

```
OF à inclure :
  - STATUT_NUM_OF = 1 (Affermi/WOP) → priorité haute
  - STATUT_NUM_OF = 3 (Suggéré/WOS) → priorité normale
  - DATE_FIN dans [début S+1, fin S+3]
  - QTE_RESTANTE > 0
```

### Étape 2 — Calculer les heures par OF et par poste

```
Pour chaque OF :
  article = of_entetes.ARTICLE
  qte = of_entetes.QTE_RESTANTE

  Pour chaque gamme de cet article (gammes où ARTICLE = article) :
    heures_of_poste = qte / CADENCE
    semaine = numéro ISO de DATE_FIN
    charge[POSTE_CHARGE][semaine] += heures_of_poste
```

Si un article n'a pas de gamme → noter "Gamme manquante" mais ne pas bloquer.

### Étape 3 — Calculer les capacités théoriques

```
Jours ouvrés par semaine = 5
Heures par shift = 8

Capacité 1×8  = 5 × 8  = 40 h/semaine
Capacité 2×8  = 5 × 16 = 80 h/semaine
Capacité 3×8  = 5 × 24 = 120 h/semaine
```

### Étape 4 — Calculer les taux de charge

```
Pour chaque poste × semaine :
  taux_1x8 = heures_chargées / 40 × 100
  taux_2x8 = heures_chargées / 80 × 100
  taux_3x8 = heures_chargées / 120 × 100
```

### Étape 5 — Identifier les goulots

Un poste est un **goulot** si `taux_2x8 > 100%` sur au moins une semaine.
Un poste est **en tension** si `80% < taux_2x8 ≤ 100%`.

---

## 3. Script d'analyse

Utiliser le script `scripts/analyse_charge.py` :

```bash
python3 .claude/skills/charge-hebdo/scripts/analyse_charge.py \
  --data-dir data \
  --date-ref 2026-03-24 \
  --horizon 3
```

Le script produit un JSON structuré avec : postes, semaines, heures chargées, taux de charge.

---

## 4. Structure du rapport à produire

### Bloc 1 — Résumé exécutif

```
Semaine analysée : S+1 (30/03–03/04/2026), S+2 (06/04–10/04), S+3 (13/04–17/04)
OF inclus : N (dont X affermis, Y suggérés)
Postes analysés : N postes
Goulots détectés : [liste des postes]
```

### Bloc 2 — Tableau de charge par poste × semaine

| Poste | Libellé | S+1 (h) | S+1 % 2×8 | S+2 (h) | S+2 % 2×8 | S+3 (h) | S+3 % 2×8 | Statut |
|-------|---------|---------|-----------|---------|-----------|---------|-----------|--------|
| PP_001 | Assemblage | 87h | 109% | 65h | 81% | 42h | 53% | 🔴 GOULOT |
| PP_002 | Soudure    | 55h | 69% | 48h | 60% | 38h | 48% | ✅ OK |

Codes couleur statut :
- 🔴 GOULOT : taux_2x8 > 100%
- 🟡 TENSION : 80% < taux_2x8 ≤ 100%
- ✅ OK : taux_2x8 ≤ 80%
- ⚪ VIDE : aucune charge (vérifier si OF en attente)

### Bloc 3 — Recommandation d'organisation

Sur la base du poste le plus chargé pour S+1 :

```
Taux max S+1 : XX% (poste PP_XXX)

→ Si taux_max ≤ 80%  : Organisation 1×8 suffisante
→ Si 80% < taux_max ≤ 100% : Passer en 2×8 recommandé
→ Si 100% < taux_max ≤ 130% : 2×8 obligatoire + priorisation OF
→ Si taux_max > 130% : 3×8 nécessaire sur [postes concernés]
```

### Bloc 4 — OF sans gamme

Lister les OF dont l'article n'a aucune gamme dans `gammes.csv` (charge non calculable, à traiter manuellement).

---

## 5. Présentation des résultats

Produire un **widget interactif** avec :
1. Cartes métriques : nb OF, nb postes, charge totale S+1 en heures
2. Tableau de charge (Bloc 2) avec code couleur
3. Graphique barres groupées : heures par poste pour S+1/S+2/S+3, avec ligne de capacité 2×8
4. Recommandation (Bloc 3) en encadré

---

## 6. Cas limites

| Situation | Comportement |
|-----------|-------------|
| Aucun OF dans l'horizon | Afficher "Aucun OF planifié sur S+1–S+3" |
| Article sans gamme | Noter dans Bloc 4, ne pas bloquer |
| CADENCE = 0 dans gammes | Ignorer cette ligne, avertir |
| DATE_FIN manquante | Exclure l'OF, noter dans les avertissements |
| Horizon personnalisé | Accepter `--horizon N` pour N semaines |
